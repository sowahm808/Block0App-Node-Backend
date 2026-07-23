import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import type { AppUser } from './users.types.js';
import { isAppRole, resolvePermissions } from '../common/roles-permissions.js';

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
  async list(): Promise<AppUser[]> {
    const snapshot = await this.col().get();
    return snapshot.docs.map((doc) => this.map(doc.data()));
  }
  async upsert(
    user: Omit<AppUser, 'createdUtc' | 'updatedUtc'> &
      Partial<Pick<AppUser, 'createdUtc' | 'updatedUtc'>>,
  ): Promise<AppUser> {
    const now = new Date();
    const existing = await this.get(user.uid);
    const roles = user.roles?.filter(isAppRole) ?? existing?.roles ?? ['Scholar'];
    const explicitPermissions = user.permissions ?? existing?.permissions ?? [];
    const entity: AppUser = {
      ...user,
      emailNormalized: user.emailNormalized ?? user.email?.toLowerCase() ?? null,
      authProvider: user.authProvider ?? existing?.authProvider ?? 'firebase',
      status: user.status ?? existing?.status ?? 'Active',
      roles,
      permissions: resolvePermissions(roles, explicitPermissions),
      cohortIds: user.cohortIds ?? existing?.cohortIds ?? [],
      activeCohortId: user.activeCohortId ?? existing?.activeCohortId ?? null,
      createdUtc: user.createdUtc ?? existing?.createdUtc ?? now,
      updatedUtc: now,
      lastLoginAt: user.lastLoginAt ?? now,
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
      status: data.status ?? 'Active',
      roles: Array.isArray(data.roles) ? data.roles.filter(isAppRole) : ['Scholar'],
      permissions: resolvePermissions(
        Array.isArray(data.roles) ? data.roles.filter(isAppRole) : ['Scholar'],
        data.permissions ?? [],
      ),
      cohortIds: data.cohortIds ?? [],
      activeCohortId: data.activeCohortId ?? null,
      photoUrl: data.photoUrl ?? null,
      authProvider: data.authProvider ?? 'firebase',
      emailNormalized: data.emailNormalized ?? data.email?.toLowerCase() ?? null,
      lastLoginAt: data.lastLoginAt ? toDate(data.lastLoginAt) : undefined,
      createdUtc: toDate(data.createdUtc),
      updatedUtc: toDate(data.updatedUtc),
    };
  }
}
