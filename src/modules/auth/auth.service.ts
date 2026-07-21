import { SignJWT, jwtVerify } from 'jose';
import type { Auth } from 'firebase-admin/auth';
import { ConflictError, UnauthorizedError } from '../common/errors.js';
import { UsersRepository } from '../users/users.repository.js';
import { AuthRepository } from './auth.repository.js';
import type { Env } from '../../config/env.js';

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
    return {
      permissions: perms,
      permission: perms,
      role: perms.includes('admin:access') ? 'admin' : 'scholar',
      email_verified: emailVerified,
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
  async verifyAccessToken(token: string) {
    const { payload } = await jwtVerify(token, this.key);
    return {
      uid: payload.sub!,
      email: payload.email as string | undefined,
      permissions: (payload.permission as string[]) ?? (payload.permissions as string[]) ?? [],
    };
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
