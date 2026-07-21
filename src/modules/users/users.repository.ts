import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import type { AppUser } from './users.types.js';

export class UsersRepository {
  constructor(
    private db: Firestore,
    private collectionName: string,
  ) {}
  private col() {
    return this.db.collection(this.collectionName);
  }
  async get(uid: string): Promise<AppUser | null> {
    const doc = await this.col().doc(uid).get();
    return doc.exists ? this.map(doc.data()!) : null;
  }
  async upsert(
    user: Omit<AppUser, 'createdUtc' | 'updatedUtc'> &
      Partial<Pick<AppUser, 'createdUtc' | 'updatedUtc'>>,
  ): Promise<AppUser> {
    const now = new Date();
    const existing = await this.get(user.uid);
    const entity: AppUser = {
      ...user,
      createdUtc: user.createdUtc ?? existing?.createdUtc ?? now,
      updatedUtc: now,
    };
    await this.col().doc(user.uid).set(entity, { merge: true });
    return entity;
  }
  async setEmailVerified(uid: string, verified: boolean) {
    await this.col()
      .doc(uid)
      .set({ emailVerified: verified, updatedUtc: new Date() }, { merge: true });
  }
  map(data: FirebaseFirestore.DocumentData): AppUser {
    const toDate = (v: Date | Timestamp | string) =>
      v instanceof Date ? v : typeof v === 'string' ? new Date(v) : v.toDate();
    return {
      uid: data.uid,
      email: data.email,
      displayName: data.displayName ?? '',
      emailVerified: Boolean(data.emailVerified),
      mfaEnabled: Boolean(data.mfaEnabled),
      administrativeMfaRequired: Boolean(data.administrativeMfaRequired),
      permissions: data.permissions ?? [],
      createdUtc: toDate(data.createdUtc),
      updatedUtc: toDate(data.updatedUtc),
    };
  }
}
