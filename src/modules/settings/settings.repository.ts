import crypto from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type { AccountSupportRequestInput, SettingsInput } from './settings.schemas.js';

export type SettingsRecord = SettingsInput & {
  userId: string;
  createdAtUtc: string;
  updatedAtUtc: string;
};
export type AccountSupportRequestRecord = AccountSupportRequestInput & {
  id: string;
  userId: string;
  status: 'Open';
  createdAt: string;
};

export class SettingsRepository {
  constructor(
    private db: Firestore,
    private settingsCollectionName = 'scholarSettings',
    private supportCollectionName = 'accountSupportRequests',
  ) {}

  async getSettings(userId: string): Promise<Partial<SettingsRecord> | null> {
    const doc = await this.db.collection(this.settingsCollectionName).doc(userId).get();
    return doc.exists ? (doc.data() as Partial<SettingsRecord>) : null;
  }

  async saveSettings(userId: string, settings: SettingsInput): Promise<SettingsRecord> {
    const now = new Date().toISOString();
    const ref = this.db.collection(this.settingsCollectionName).doc(userId);
    const existing = await ref.get();
    const record = {
      ...settings,
      userId,
      createdAtUtc: existing.exists ? existing.data()?.createdAtUtc : now,
      updatedAtUtc: now,
    };
    await ref.set(record, { merge: true });
    return record;
  }

  async createAccountSupportRequest(
    userId: string,
    input: AccountSupportRequestInput,
  ): Promise<AccountSupportRequestRecord> {
    const createdAt = new Date().toISOString();
    const id = `asr_${crypto.randomUUID()}`;
    const record = { id, userId, ...input, status: 'Open' as const, createdAt };
    await this.db.collection(this.supportCollectionName).doc(id).set(record);
    return record;
  }
}
