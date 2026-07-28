import { AppError } from '../common/errors.js';
import type { GenerateInput, WhisperContent } from './whispers.schemas.js';

export type DeliveryChannel = 'email' | 'sms' | 'in_app';
export type UpstreamDelivery = { channel: DeliveryChannel; accepted: boolean; messageId?: string };

export class WhisperWrapClient {
  private baseUrl: string;
  constructor(
    baseUrl: string,
    private apiKey: string | undefined,
    private timeoutMs: number,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }
  private async request(path: string, body: unknown, idempotencyKey?: string) {
    if (!this.apiKey)
      throw new AppError(
        503,
        'Whisper delivery unavailable',
        'WhisperWrap is not configured.',
        'WHISPER_UPSTREAM_UNAVAILABLE',
      );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok)
        throw new AppError(
          response.status === 429 ? 429 : 502,
          'Whisper provider error',
          'The delivery provider could not process the request.',
          'WHISPER_UPSTREAM_REJECTED',
        );
      return (await response.json()) as any;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if ((error as Error).name === 'AbortError')
        throw new AppError(
          504,
          'Whisper provider timeout',
          'The delivery provider timed out.',
          'WHISPER_UPSTREAM_TIMEOUT',
        );
      throw new AppError(
        503,
        'Whisper provider unavailable',
        'The delivery provider is unavailable.',
        'WHISPER_UPSTREAM_UNAVAILABLE',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  async generate(input: GenerateInput): Promise<{ id?: string; content: WhisperContent }> {
    return this.request('/whispers/generate', input);
  }
  async sendConsent(input: {
    idempotencyKey: string;
    recipient: { name: string; email?: string; phone?: string };
    consentUrl: string;
  }): Promise<{ id: string; deliveries: UpstreamDelivery[] }> {
    return this.request('/whispers', input, input.idempotencyKey);
  }
}
