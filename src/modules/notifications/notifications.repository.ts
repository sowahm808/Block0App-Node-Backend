import type { Firestore } from 'firebase-admin/firestore';
import type { ExamReminderInput, NotificationPreferencesInput } from './notifications.schemas.js';
import { defaultNotificationPreferences } from './notifications.schemas.js';

type NotificationRecord = {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
  action?: { label: string; route: string } | null;
};

export class NotificationsRepository {
  constructor(
    private db: Firestore,
    private examReminderCollectionName = 'userExamReminders',
    private notificationsCollectionName = 'notifications',
    private preferencesCollectionName = 'notificationPreferences',
  ) {}

  async saveExamReminder(userId: string, input: ExamReminderInput) {
    const now = new Date().toISOString();
    const ref = this.db.collection(this.examReminderCollectionName).doc(userId);
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
    const document = await this.db.collection(this.examReminderCollectionName).doc(userId).get();
    return document.exists ? document.data() : null;
  }

  async listNotifications(userId: string): Promise<NotificationRecord[]> {
    const snapshot = await this.db
      .collection(this.notificationsCollectionName)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    return snapshot.docs.map((doc) => this.toNotification(doc.id, doc.data()));
  }

  async markAllRead(userId: string) {
    const snapshot = await this.db
      .collection(this.notificationsCollectionName)
      .where('userId', '==', userId)
      .where('readAt', '==', null)
      .get();
    const readAt = new Date().toISOString();
    const batch = this.db.batch();
    snapshot.docs.forEach((doc) => batch.update(doc.ref, { readAt, updatedAt: readAt }));
    if (!snapshot.empty) await batch.commit();
    return snapshot.size;
  }

  async getPreferences(userId: string): Promise<NotificationPreferencesInput> {
    const document = await this.db.collection(this.preferencesCollectionName).doc(userId).get();
    return {
      ...defaultNotificationPreferences,
      ...(document.exists ? document.data() : {}),
    } as NotificationPreferencesInput;
  }

  async savePreferences(userId: string, preferences: NotificationPreferencesInput) {
    const now = new Date().toISOString();
    const ref = this.db.collection(this.preferencesCollectionName).doc(userId);
    const existing = await ref.get();
    const record = {
      ...preferences,
      userId,
      createdAtUtc: existing.exists ? existing.data()?.createdAtUtc : now,
      updatedAtUtc: now,
    };
    await ref.set(record, { merge: true });
    return preferences;
  }

  private toNotification(id: string, data: FirebaseFirestore.DocumentData): NotificationRecord {
    return {
      id: data.id ?? id,
      userId: data.userId,
      type: data.type,
      title: data.title,
      message: data.message,
      createdAt: data.createdAt,
      readAt: data.readAt ?? null,
      action: data.action ?? null,
    };
  }
}
