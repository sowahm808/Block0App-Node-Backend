import crypto from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type { RefreshSession } from './auth.types.js';
export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
export class AuthRepository {
  constructor(
    private db: Firestore,
    private collectionName: string,
  ) {}
  private col() {
    return this.db.collection(this.collectionName);
  }
  newToken() {
    return crypto.randomBytes(48).toString('base64url');
  }
  async create(userId: string, ttlDays: number) {
    const ref = this.col().doc();
    const token = this.newToken();
    const now = new Date();
    const session: RefreshSession = {
      sessionId: ref.id,
      userId,
      tokenHash: hashToken(token),
      createdUtc: now,
      expiresUtc: new Date(now.getTime() + ttlDays * 864e5),
      revokedUtc: null,
      revocationReason: null,
      rotatedToSessionId: null,
    };
    await ref.set(session);
    return { session, token };
  }
  async findByToken(token: string) {
    const snap = await this.col().where('tokenHash', '==', hashToken(token)).limit(1).get();
    if (snap.empty) return null;
    return snap.docs[0].data() as RefreshSession;
  }
  async rotate(token: string, ttlDays: number) {
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(this.col().where('tokenHash', '==', hashToken(token)).limit(1));
      if (snap.empty) return { status: 'invalid' as const };
      const doc = snap.docs[0];
      const old = doc.data() as RefreshSession;
      const now = new Date();
      if (old.revokedUtc) return { status: 'reuse' as const, session: old };
      if (old.expiresUtc < now) return { status: 'expired' as const };
      const ref = this.col().doc();
      const newToken = this.newToken();
      const next: RefreshSession = {
        sessionId: ref.id,
        userId: old.userId,
        tokenHash: hashToken(newToken),
        createdUtc: now,
        expiresUtc: new Date(now.getTime() + ttlDays * 864e5),
        revokedUtc: null,
        revocationReason: null,
        rotatedToSessionId: null,
      };
      tx.set(ref, next);
      tx.update(doc.ref, {
        revokedUtc: now,
        revocationReason: 'rotated',
        rotatedToSessionId: ref.id,
      });
      return { status: 'rotated' as const, session: next, token: newToken };
    });
  }
  async revokeToken(token: string, reason: string) {
    const s = await this.findByToken(token);
    if (!s) return false;
    await this.col()
      .doc(s.sessionId)
      .set({ revokedUtc: new Date(), revocationReason: reason }, { merge: true });
    return true;
  }
  async revokeActiveForUser(userId: string, reason: string) {
    const snap = await this.col()
      .where('userId', '==', userId)
      .where('revokedUtc', '==', null)
      .get();
    const batch = this.db.batch();
    snap.docs.forEach((d) =>
      batch.update(d.ref, { revokedUtc: new Date(), revocationReason: reason }),
    );
    await batch.commit();
    return snap.size;
  }
}
