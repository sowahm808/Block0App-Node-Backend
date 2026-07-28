import crypto from 'node:crypto';
import { AppError, ConflictError, NotFoundError } from '../common/errors.js';
import type { GenerateInput, WhisperContent } from './whispers.schemas.js';
import type { DeliveryChannel, WhisperWrapClient } from './whisperwrap.client.js';
import type { DeliveryResult, WhisperRecord, WhispersRepository } from './whispers.repository.js';
import type { Storage } from 'firebase-admin/storage';

const editable = (record: WhisperRecord) => {
  if (record.confirmedAt || record.tokenHash)
    throw new ConflictError('Confirmed or delivered content cannot be changed.');
};
export class WhispersService {
  constructor(
    private repository: WhispersRepository,
    private client: WhisperWrapClient,
    private pepper: string,
    private publicAppUrl: string,
    private storage?: Storage,
    private bucketName?: string,
  ) {}
  private hash(token: string) {
    return crypto.createHmac('sha256', this.pepper).update(token).digest('hex');
  }
  private seal(token: string) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      crypto.createHash('sha256').update(this.pepper).digest(),
      iv,
    );
    const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
  }
  private unseal(value: string) {
    const packed = Buffer.from(value, 'base64url');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      crypto.createHash('sha256').update(this.pepper).digest(),
      packed.subarray(0, 12),
    );
    decipher.setAuthTag(packed.subarray(12, 28));
    return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString('utf8');
  }
  async generate(senderId: string, input: GenerateInput, internalRecipient?: any) {
    const recipient =
      input.recipientType === 'internal' ? internalRecipient : input.externalRecipient;
    if (!recipient)
      throw new AppError(
        422,
        'Invalid recipient',
        'The recipient could not be resolved.',
        'WHISPER_RECIPIENT_INVALID',
      );
    const generated = await this.client.generate(input);
    const now = new Date().toISOString();
    return this.repository.create({
      id: crypto.randomUUID(),
      senderId,
      upstreamWhisperId: generated.id ?? null,
      recipientType: input.recipientType,
      recipientUserId: input.recipientType === 'internal' ? input.recipientMuaUserId : null,
      recipientDisplayName:
        recipient.preferredAddressName || recipient.displayName || recipient.name,
      recipientEmail: recipient.email ?? null,
      recipientPhone: recipient.phone ?? null,
      whisperType: input.whisperType,
      wrapStyle: input.wrapStyle,
      deliveryFormat: input.deliveryFormat,
      senderIntent: input.senderIntent,
      content: generated.content,
      status: 'generated',
      confirmedAt: null,
      audioReady: false,
      tokenHash: null,
      tokenExpiresAt: null,
      acceptedAt: null,
      listenedAt: null,
      deliveryResults: [],
      createdAt: now,
      updatedAt: now,
    });
  }
  list(senderId: string) {
    return this.repository.list(senderId);
  }
  async get(senderId: string, id: string) {
    const value = await this.repository.owned(id, senderId);
    if (!value) throw new NotFoundError('Whisper not found.');
    return value;
  }
  async content(senderId: string, id: string, content: WhisperContent) {
    const value = await this.repository.updateOwned(id, senderId, { content }, editable);
    if (!value) throw new NotFoundError('Whisper not found.');
    return value;
  }
  async regenerate(senderId: string, id: string) {
    const old = await this.get(senderId, id);
    editable(old);
    const generated = await this.client.generate(old as unknown as GenerateInput);
    return this.content(senderId, id, generated.content);
  }
  async confirm(senderId: string, id: string) {
    const value = await this.repository.updateOwned(
      id,
      senderId,
      { confirmedAt: new Date().toISOString(), status: 'confirmed' },
      (r) => {
        if (r.tokenHash) throw new ConflictError('Delivery has already begun.');
      },
    );
    if (!value) throw new NotFoundError('Whisper not found.');
    return value;
  }
  async send(senderId: string, id: string) {
    let rawToken: string | undefined;
    const prepared = await this.repository.prepareSend(id, senderId, (record) => {
      if (!record.confirmedAt)
        throw new AppError(
          409,
          'Whisper is not ready',
          'Confirm the content before requesting delivery.',
          'WHISPER_NOT_CONFIRMED',
        );
      if (record.deliveryFormat !== 'text' && !record.audioReady)
        throw new AppError(
          409,
          'Whisper audio is not ready',
          'Complete the audio upload before requesting delivery.',
          'WHISPER_AUDIO_NOT_READY',
        );
      rawToken = crypto.randomBytes(32).toString('base64url');
      const channels: DeliveryChannel[] = [
        record.recipientEmail ? 'email' : null,
        record.recipientPhone ? 'sms' : null,
        record.recipientType === 'internal' ? 'in_app' : null,
      ].filter(Boolean) as DeliveryChannel[];
      return {
        tokenHash: this.hash(rawToken),
        tokenCiphertext: this.seal(rawToken),
        tokenExpiresAt: new Date(Date.now() + 7 * 864e5).toISOString(),
        deliveryResults: channels.map((channel) => ({
          channel,
          status: 'pending',
          message: 'Delivery is pending.',
        })),
      };
    });
    if (!prepared) throw new NotFoundError('Whisper not found.');
    rawToken ??= this.unseal(prepared.tokenCiphertext);
    const upstream = await this.client.sendConsent({
      idempotencyKey: `${id}:consent`,
      recipient: {
        name: prepared.recipientDisplayName,
        ...(prepared.recipientEmail ? { email: prepared.recipientEmail } : {}),
        ...(prepared.recipientPhone ? { phone: prepared.recipientPhone } : {}),
      },
      consentUrl: `${this.publicAppUrl.replace(/\/$/, '')}/unwrap/${rawToken}`,
    });
    const results: DeliveryResult[] = prepared.deliveryResults.map((pending) => {
      const result = upstream.deliveries.find((x) => x.channel === pending.channel);
      return result?.accepted
        ? {
            channel: pending.channel,
            status: 'succeeded',
            message: 'Consent request sent.',
            providerMessageId: result.messageId,
          }
        : {
            channel: pending.channel,
            status: 'failed',
            message: `${pending.channel.toUpperCase()} delivery was unavailable.`,
            retrySupported: true,
          };
    });
    await this.repository.setDeliveries(id, results, upstream.id);
    return {
      whisperId: id,
      status: results.some((x) => x.status === 'succeeded') ? 'consent_sent' : 'failed',
      results,
    };
  }
  async audioUpload(
    senderId: string,
    id: string,
    input: { fileName: string; mimeType: string; sizeBytes: number },
  ) {
    const record = await this.get(senderId, id);
    editable(record);
    if (record.deliveryFormat === 'text')
      throw new ConflictError('Text-only whispers do not accept audio.');
    if (!this.storage || !this.bucketName)
      throw new AppError(
        503,
        'Audio storage unavailable',
        'Audio storage is not configured.',
        'WHISPER_AUDIO_STORAGE_UNAVAILABLE',
      );
    const uploadId = crypto.randomBytes(24).toString('base64url');
    const expires = Date.now() + 10 * 60_000;
    const objectKey = `whispers/${senderId}/${id}/${uploadId}`;
    const [uploadUrl] = await this.storage
      .bucket(this.bucketName)
      .file(objectKey)
      .getSignedUrl({ action: 'write', expires, contentType: input.mimeType });
    await this.repository.updateOwned(
      id,
      senderId,
      {
        pendingUpload: {
          uploadIdHash: this.hash(uploadId),
          objectKey,
          sizeBytes: input.sizeBytes,
          mimeType: input.mimeType,
          expiresAt: new Date(expires).toISOString(),
          used: false,
        },
      },
      editable,
    );
    return {
      uploadUrl,
      uploadId,
      expiresAt: new Date(expires).toISOString(),
      requiredHeaders: { 'Content-Type': input.mimeType },
    };
  }
  async audioComplete(
    senderId: string,
    id: string,
    input: { uploadId: string; mimeType: string; sizeBytes: number },
  ) {
    const record = await this.get(senderId, id);
    editable(record);
    const upload = record.pendingUpload;
    if (
      !upload ||
      upload.used ||
      upload.uploadIdHash !== this.hash(input.uploadId) ||
      Date.parse(upload.expiresAt) <= Date.now()
    )
      throw new ConflictError('The audio upload is invalid or expired.');
    if (upload.mimeType !== input.mimeType || upload.sizeBytes !== input.sizeBytes)
      throw new ConflictError('The uploaded audio metadata does not match.');
    if (!this.storage || !this.bucketName)
      throw new AppError(
        503,
        'Audio storage unavailable',
        'Audio storage is not configured.',
        'WHISPER_AUDIO_STORAGE_UNAVAILABLE',
      );
    const [metadata] = await this.storage
      .bucket(this.bucketName)
      .file(upload.objectKey)
      .getMetadata();
    if (Number(metadata.size) !== input.sizeBytes || metadata.contentType !== input.mimeType)
      throw new ConflictError('The uploaded object could not be verified.');
    const value = await this.repository.updateOwned(
      id,
      senderId,
      {
        audioObjectKey: upload.objectKey,
        audioReady: true,
        pendingUpload: { ...upload, used: true },
      },
      editable,
    );
    return { whisperId: id, audioReady: Boolean((value as WhisperRecord | null)?.audioReady) };
  }
  async unwrap(token: string, transition?: 'accept' | 'listened') {
    const hash = this.hash(token);
    const record =
      transition === 'accept'
        ? await this.repository.accept(hash)
        : transition === 'listened'
          ? await this.repository.listened(hash)
          : await this.repository.byTokenHash(hash);
    if (!record || record.revokedAt || Date.parse(record.tokenExpiresAt) <= Date.now())
      throw new NotFoundError('Whisper not found.');
    if (!record.acceptedAt && transition !== 'accept')
      return { state: 'consent_required', recipientDisplayName: record.recipientDisplayName };
    return {
      state: 'accepted',
      recipientDisplayName: record.recipientDisplayName,
      content: record.content,
      ...(record.audioPlaybackUrl ? { audioPlaybackUrl: record.audioPlaybackUrl } : {}),
    };
  }
}
