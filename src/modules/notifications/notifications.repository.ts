import type { Firestore } from 'firebase-admin/firestore';
import type { ExamReminderInput } from './notifications.schemas.js';

export class NotificationsRepository {
  constructor(
    private db: Firestore,
    private collectionName = 'userExamReminders',
  ) {}

  async saveExamReminder(userId: string, input: ExamReminderInput) {
    const now = new Date().toISOString();
    const ref = this.db.collection(this.collectionName).doc(userId);
    const existing = await ref.get();
    const reminder = {
      ...(existing.exists ? existing.data() : {}),
      ...input,
      userId,
      updatedAtUtc: now,
      createdAtUtc: existing.exists ? existing.data()?.createdAtUtc : now,
    };
    await ref.set(reminder, { merge: true });
    return reminder;
  }

  async getExamReminder(userId: string) {
    const document = await this.db.collection(this.collectionName).doc(userId).get();
    return document.exists ? document.data() : null;
  }
}
