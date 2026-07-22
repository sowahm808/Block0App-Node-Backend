import { SignJWT, jwtVerify } from 'jose';
import type { Auth } from 'firebase-admin/auth';
import { ConflictError, ForbiddenError, UnauthorizedError } from '../common/errors.js';
import { UsersRepository } from '../users/users.repository.js';
import { AuthRepository } from './auth.repository.js';
import type { Env } from '../../config/env.js';
import { isAppRole, resolvePermissions } from '../common/roles-permissions.js';
import type { AuthenticatedUser } from '../users/users.types.js';

const normalize = (email: string) => email.trim().toLowerCase();
export class AuthService {
  private key: Uint8Array;
  constructor(
    private auth: Auth,
    private users: UsersRepository,
    private sessions: AuthRepository,
    private env: Env,
  ) {
    this.key = new TextEncoder().encode(env.ACCESS_TOKEN_SECRET);
  }
  private claims(perms: string[], emailVerified: boolean) {
    return { permissions: perms, permission: perms, email_verified: emailVerified };
  }
  private sanitize(user: any): AuthenticatedUser {
    const roles = user.roles?.filter(isAppRole) ?? ['Scholar'];
    return {
      uid: user.uid,
      email: user.email || undefined,
      emailVerified: Boolean(user.emailVerified),
      displayName: user.displayName || undefined,
      roles,
      permissions: resolvePermissions(roles, user.permissions ?? []),
      cohortIds: user.cohortIds ?? [],
      activeCohortId: user.activeCohortId ?? undefined,
    };
  }
  async signAccessToken(uid: string, email: string | undefined, permissions: string[]) {
    const expires = new Date(Date.now() + this.env.ACCESS_TOKEN_TTL_MINUTES * 60000);
    const token = await new SignJWT({ permissions, permission: permissions, email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(uid)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expires.getTime() / 1000))
      .sign(this.key);
    return { token, expires };
  }
  private async verifyBackendAccessToken(token: string): Promise<AuthenticatedUser> {
    const { payload } = await jwtVerify(token, this.key);
    if (!payload.sub) throw new UnauthorizedError();
    const existing = await this.users.get(payload.sub);
    if (existing) return this.sanitize(existing);
    return {
      uid: payload.sub,
      email: payload.email as string | undefined,
      emailVerified: Boolean(payload.email_verified ?? true),
      roles: ['Scholar'],
      permissions: (payload.permission as string[]) ?? (payload.permissions as string[]) ?? [],
      cohortIds: [],
    };
  }
  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    try {
      return await this.verifyBackendAccessToken(token);
    } catch {
      // Firebase ID tokens are also accepted for clients that call protected routes
      // before exchanging their Firebase credential through /auth/login.
    }
    try {
      const decoded = await this.auth.verifyIdToken(token, true);
      const existing = await this.users.get(decoded.uid);
      if (
        existing?.status === 'Disabled' ||
        existing?.status === 'Suspended' ||
        existing?.status === 'Deleted'
      ) {
        throw new ForbiddenError('The authenticated account is not active.');
      }
      const synced = await this.users.upsert({
        uid: decoded.uid,
        email: normalize(decoded.email ?? existing?.email ?? ''),
        emailNormalized: decoded.email
          ? normalize(decoded.email)
          : (existing?.emailNormalized ?? null),
        displayName: (decoded.name as string) ?? existing?.displayName ?? '',
        photoUrl: (decoded.picture as string) ?? existing?.photoUrl ?? null,
        authProvider: decoded.firebase?.sign_in_provider ?? existing?.authProvider ?? 'firebase',
        emailVerified: Boolean(decoded.email_verified),
        status: existing?.status ?? 'Active',
        roles: existing?.roles ?? ['Scholar'],
        permissions: existing?.permissions ?? [],
        cohortIds: existing?.cohortIds ?? [],
        activeCohortId: existing?.activeCohortId ?? null,
        mfaEnabled: existing?.mfaEnabled ?? false,
        administrativeMfaRequired: existing?.administrativeMfaRequired ?? false,
        lastLoginAt: new Date(),
      });
      return this.sanitize(synced);
    } catch (error) {
      if (error instanceof ForbiddenError) throw error;
      throw new UnauthorizedError('Invalid access token.');
    }
  }
  async register(input: { email: string; password: string; displayName: string }) {
    const email = normalize(input.email);
    let uid = '';
    try {
      const created = await this.auth.createUser({
        email,
        password: input.password,
        displayName: input.displayName,
        emailVerified: false,
      });
      uid = created.uid;
      const permissions = ['scholar:access'];
      await this.users.upsert({
        uid,
        email,
        displayName: input.displayName,
        emailVerified: false,
        mfaEnabled: false,
        administrativeMfaRequired: false,
        permissions,
      });
      await this.auth.setCustomUserClaims(uid, this.claims(permissions, false));
      const emailVerificationLink = await this.safeGenerateEmailVerificationLink(email);
      return { userId: uid, email, emailVerificationLink };
    } catch (e: any) {
      if (uid) await this.auth.deleteUser(uid).catch(() => undefined);
      if (e?.code === 'auth/email-already-exists')
        throw new ConflictError('Email is already registered.');
      throw e;
    }
  }
  private async safeGenerateEmailVerificationLink(email: string) {
    try {
      return await this.auth.generateEmailVerificationLink(email, {
        url: this.env.FIREBASE_ACTION_CODE_URL,
      });
    } catch (e: any) {
      if (
        e?.code === 'auth/invalid-continue-uri' ||
        e?.code === 'auth/unauthorized-continue-uri' ||
        e?.code === 'auth/invalid-dynamic-link-domain'
      ) {
        return null;
      }
      throw e;
    }
  }
  async verifyEmail(email: string, token: string) {
    const decoded = await this.auth.verifyIdToken(token, true).catch(() => {
      throw new UnauthorizedError('Invalid email verification token.');
    });
    if (normalize(decoded.email ?? '') !== normalize(email))
      throw new UnauthorizedError('Token email does not match submitted email.');
    const user = await this.auth.getUser(decoded.uid);
    if (!user.emailVerified && !decoded.email_verified)
      throw new UnauthorizedError('Email is not verified by Firebase.');
    await this.users.setEmailVerified(decoded.uid, true);
    await this.auth.setCustomUserClaims(
      decoded.uid,
      this.claims((decoded.permission as string[]) ?? ['scholar:access'], true),
    );
  }
  async login(input: { email: string; firebaseIdToken: string }) {
    const decoded = await this.auth.verifyIdToken(input.firebaseIdToken, true).catch(() => {
      throw new UnauthorizedError('Invalid Firebase ID token.');
    });
    if (normalize(decoded.email ?? '') !== normalize(input.email))
      throw new UnauthorizedError('Token email does not match submitted email.');
    if (!decoded.email_verified) throw new UnauthorizedError('Email verification is required.');
    const permissions = (decoded.permission as string[]) ??
      (decoded.permissions as string[]) ?? ['scholar:access'];
    await this.users.upsert({
      uid: decoded.uid,
      email: normalize(decoded.email!),
      displayName: (decoded.name as string) ?? '',
      emailVerified: true,
      mfaEnabled: false,
      administrativeMfaRequired: false,
      permissions,
    });
    const access = await this.signAccessToken(decoded.uid, decoded.email, permissions);
    const refresh = await this.sessions.create(decoded.uid, this.env.REFRESH_TOKEN_TTL_DAYS);
    return {
      accessToken: access.token,
      expiresUtc: access.expires.toISOString(),
      refreshToken: refresh.token,
      refreshExpiresUtc: refresh.session.expiresUtc.toISOString(),
      tokenType: 'Bearer',
    };
  }
  async refresh(refreshToken: string) {
    const rotated = await this.sessions.rotate(refreshToken, this.env.REFRESH_TOKEN_TTL_DAYS);
    if (rotated.status === 'reuse' && rotated.session)
      await this.sessions.revokeActiveForUser(rotated.session.userId, 'refresh_reuse_detected');
    if (rotated.status !== 'rotated')
      throw new UnauthorizedError('Invalid, expired, or revoked refresh token.');
    const user = await this.users.get(rotated.session.userId);
    if (!user) throw new UnauthorizedError();
    const access = await this.signAccessToken(user.uid, user.email, user.permissions);
    return {
      accessToken: access.token,
      expiresUtc: access.expires.toISOString(),
      refreshToken: rotated.token,
      refreshExpiresUtc: rotated.session.expiresUtc.toISOString(),
      tokenType: 'Bearer',
    };
  }
  async forgotPassword(email: string) {
    const resetLink = await this.auth.generatePasswordResetLink(normalize(email), {
      url: this.env.FIREBASE_ACTION_CODE_URL,
    });
    return this.env.NODE_ENV === 'production' ? {} : { resetLink };
  }
}
