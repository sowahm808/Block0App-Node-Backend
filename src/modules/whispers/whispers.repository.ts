import type { Firestore } from 'firebase-admin/firestore';

export type DeliveryResult = {
  channel: 'email' | 'sms' | 'in_app';
  status: 'pending' | 'succeeded' | 'failed';
  message: string;
  retrySupported?: boolean;
  providerMessageId?: string;
};
export type WhisperRecord = Record<string, any> & {
  id: string;
  senderId: string;
  deliveryResults: DeliveryResult[];
};

export class WhispersRepository {
  constructor(
    private db: Firestore,
    private collection = 'whispers',
  ) {}
  async create(record: WhisperRecord) {
    await this.db.collection(this.collection).doc(record.id).create(record);
    return record;
  }
  async list(senderId: string) {
    const snapshot = await this.db
      .collection(this.collection)
      .where('senderId', '==', senderId)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();
    return snapshot.docs.map((doc) => doc.data() as WhisperRecord);
  }
  async owned(id: string, senderId: string) {
    const doc = await this.db.collection(this.collection).doc(id).get();
    const value = doc.exists ? (doc.data() as WhisperRecord) : null;
    return value?.senderId === senderId ? value : null;
  }
  async updateOwned(
    id: string,
    senderId: string,
    update: Record<string, unknown>,
    guard?: (record: WhisperRecord) => void,
  ) {
    const ref = this.db.collection(this.collection).doc(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const record = snap.exists ? (snap.data() as WhisperRecord) : null;
      if (!record || record.senderId !== senderId) return null;
      guard?.(record);
      const next = { ...record, ...update, updatedAt: new Date().toISOString() };
      tx.set(ref, next);
      return next;
    });
  }
  async prepareSend(
    id: string,
    senderId: string,
    create: (record: WhisperRecord) => Record<string, unknown>,
  ) {
    const ref = this.db.collection(this.collection).doc(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const record = snap.exists ? (snap.data() as WhisperRecord) : null;
      if (!record || record.senderId !== senderId) return null;
      if (record.tokenHash) return record;
      const next = {
        ...record,
        ...create(record),
        updatedAt: new Date().toISOString(),
      } as WhisperRecord;
      tx.set(ref, next);
      for (const delivery of next.deliveryResults)
        tx.create(this.db.collection('whisperDeliveryAttempts').doc(`${id}_${delivery.channel}`), {
          whisperId: id,
          idempotencyKey: `${id}:consent:${delivery.channel}`,
          ...delivery,
          attemptCount: 0,
          createdAt: next.updatedAt,
          updatedAt: next.updatedAt,
        });
      return next;
    });
  }
  async setDeliveries(id: string, results: DeliveryResult[], upstreamWhisperId?: string) {
    const ref = this.db.collection(this.collection).doc(id);
    const now = new Date().toISOString();
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const status = results.some((x) => x.status === 'succeeded')
        ? 'consent_sent'
        : results.every((x) => x.status === 'failed')
          ? 'failed'
          : 'confirmed';
      tx.update(ref, {
        deliveryResults: results,
        upstreamWhisperId: upstreamWhisperId ?? null,
        status,
        updatedAt: now,
      });
      results.forEach((result) =>
        tx.set(
          this.db.collection('whisperDeliveryAttempts').doc(`${id}_${result.channel}`),
          {
            ...result,
            providerMessageId: result.providerMessageId ?? null,
            updatedAt: now,
            attemptCount: 1,
          },
          { merge: true },
        ),
      );
    });
  }
  async byTokenHash(tokenHash: string) {
    const snap = await this.db
      .collection(this.collection)
      .where('tokenHash', '==', tokenHash)
      .limit(1)
      .get();
    return snap.empty ? null : (snap.docs[0]!.data() as WhisperRecord);
  }
  async accept(tokenHash: string) {
    return this.publicTransition(tokenHash, 'acceptedAt', 'accepted');
  }
  async listened(tokenHash: string) {
    return this.publicTransition(tokenHash, 'listenedAt', 'listened');
  }
  private async publicTransition(tokenHash: string, field: string, status: string) {
    const query = this.db.collection(this.collection).where('tokenHash', '==', tokenHash).limit(1);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(query);
      if (snap.empty) return null;
      const doc = snap.docs[0]!;
      const record = doc.data() as WhisperRecord;
      if (!record[field])
        tx.update(doc.ref, {
          [field]: new Date().toISOString(),
          status,
          updatedAt: new Date().toISOString(),
        });
      return { ...record, [field]: record[field] ?? new Date().toISOString(), status };
    });
  }
}
