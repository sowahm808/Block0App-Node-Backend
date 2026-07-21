export interface OutboxMessage {
  type: string;
  payload: unknown;
  createdUtc: Date;
  processedUtc: Date | null;
  attempts: number;
  lastError: string | null;
}
export class OutboxWorker {
  async runOnce() {
    return { processed: 0 };
  }
}
