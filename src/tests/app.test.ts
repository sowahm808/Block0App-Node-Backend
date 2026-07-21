import { describe, it, expect, beforeEach } from 'vitest';
import { buildApp } from '../app.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { AuthRepository } from '../modules/auth/auth.repository.js';
import { UsersRepository } from '../modules/users/users.repository.js';
import { loadEnv } from '../config/env.js';

class MemUsers {
  data = new Map<string, any>();
  fail = false;
  async get(uid: string) {
    return this.data.get(uid) ?? null;
  }
  async upsert(u: any) {
    if (this.fail) throw new Error('firestore failed');
    const old = this.data.get(u.uid);
    const e = { ...u, createdUtc: old?.createdUtc ?? new Date(), updatedUtc: new Date() };
    this.data.set(u.uid, e);
    return e;
  }
  async setEmailVerified(uid: string, v: boolean) {
    this.data.set(uid, { ...this.data.get(uid), emailVerified: v });
  }
}
class MemSessions {
  data = new Map<string, any>();
  seq = 0;
  newToken() {
    return `token-${++this.seq}-${'x'.repeat(40)}`;
  }
  async create(userId: string, days: number) {
    const token = this.newToken();
    const session = {
      sessionId: `s${this.seq}`,
      userId,
      tokenHash: token,
      createdUtc: new Date(),
      expiresUtc: new Date(Date.now() + days * 864e5),
      revokedUtc: null,
      revocationReason: null,
      rotatedToSessionId: null,
    };
    this.data.set(token, session);
    return { session, token };
  }
  async rotate(token: string, days: number) {
    const old = this.data.get(token);
    if (!old) return { status: 'invalid' };
    if (old.revokedUtc) return { status: 'reuse', session: old };
    old.revokedUtc = new Date();
    old.revocationReason = 'rotated';
    const n = await this.create(old.userId, days);
    old.rotatedToSessionId = n.session.sessionId;
    return { status: 'rotated', session: n.session, token: n.token };
  }
  async revokeActiveForUser(uid: string, reason: string) {
    let c = 0;
    for (const s of this.data.values())
      if (s.userId === uid && !s.revokedUtc) {
        s.revokedUtc = new Date();
        s.revocationReason = reason;
        c++;
      }
    return c;
  }
  async revokeToken(token: string, reason: string) {
    const s = this.data.get(token);
    if (!s) return false;
    s.revokedUtc = new Date();
    s.revocationReason = reason;
    return true;
  }
}
function firebase() {
  const users = new Map<string, any>();
  return {
    createUser: async (u: any) => {
      if (u.email === 'dupe@example.com') {
        const e: any = new Error('dupe');
        e.code = 'auth/email-already-exists';
        throw e;
      }
      const uid = `uid-${u.email}`;
      users.set(uid, { uid, ...u });
      return { uid };
    },
    deleteUser: async (uid: string) => users.delete(uid),
    setCustomUserClaims: async () => {},
    generateEmailVerificationLink: async (e: string) => `https://verify/${e}`,
    generatePasswordResetLink: async (e: string) => `https://reset/${e}`,
    verifyIdToken: async (t: string) => {
      if (t === 'bad') throw new Error('bad');
      return JSON.parse(Buffer.from(t, 'base64url').toString());
    },
    getUser: async (uid: string) => users.get(uid) ?? { uid, emailVerified: true },
  };
}
const env = loadEnv({
  NODE_ENV: 'test',
  ACCESS_TOKEN_SECRET: 'test-secret-test-secret-test-secret-32',
  FIREBASE_ACTION_CODE_URL: 'http://localhost/action',
} as any);
const token = (p: any) => Buffer.from(JSON.stringify(p)).toString('base64url');

describe('MindUnlocking API', () => {
  let users: MemUsers, sessions: MemSessions, svc: AuthService;
  beforeEach(() => {
    users = new MemUsers();
    sessions = new MemSessions();
    svc = new AuthService(firebase() as any, users as any, sessions as any, env);
  });

  it('always allows the production Netlify frontend origin', () => {
    const defaultEnv = loadEnv({
      NODE_ENV: 'production',
      ACCESS_TOKEN_SECRET: 'test-secret-test-secret-test-secret-32',
      CORS_ALLOWED_ORIGINS: 'https://custom.example.com',
    } as any);

    expect(defaultEnv.corsOrigins).toEqual([
      'http://localhost:3000',
      'https://adultmua.netlify.app',
      'https://custom.example.com',
    ]);
  });
  it('validates register body and returns Problem Details', async () => {
    const app = await buildApp({
      authService: svc,
      sessions,
      readiness: {
        ready: async () => ({ status: 'ready' }),
        current: (u: string) => ({ userId: u }),
      },
    });
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'bad' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ title: 'Validation Failed', status: 400 });
  });
  it('handles duplicate email', async () => {
    await expect(
      svc.register({ email: 'dupe@example.com', password: 'password123', displayName: 'Dupe' }),
    ).rejects.toThrow('registered');
  });

  it('does not fail registration when Firebase action links are misconfigured', async () => {
    const auth = firebase() as any;
    auth.generateEmailVerificationLink = async () => {
      const e: any = new Error('continue URL is not authorized');
      e.code = 'auth/unauthorized-continue-uri';
      throw e;
    };
    const service = new AuthService(auth, users as any, sessions as any, env);

    await expect(
      service.register({
        email: 'action-link@example.com',
        password: 'password123',
        displayName: 'Action Link',
      }),
    ).resolves.toMatchObject({
      email: 'action-link@example.com',
      emailVerificationLink: null,
    });
    expect(await users.get('uid-action-link@example.com')).toMatchObject({
      email: 'action-link@example.com',
    });
  });

  it('rolls back Firebase user when profile setup fails', async () => {
    users.fail = true;
    await expect(
      svc.register({ email: 'a@example.com', password: 'password123', displayName: 'A' }),
    ).rejects.toThrow('firestore');
  });
  it('rejects invalid Firebase ID token', async () => {
    await expect(svc.login({ email: 'a@example.com', firebaseIdToken: 'bad' })).rejects.toThrow(
      'Invalid Firebase',
    );
  });
  it('requires verified email', async () => {
    await expect(
      svc.login({
        email: 'a@example.com',
        firebaseIdToken: token({ uid: 'u', email: 'a@example.com', email_verified: false }),
      }),
    ).rejects.toThrow('Email verification');
  });
  it('syncs user during login', async () => {
    await svc.login({
      email: 'a@example.com',
      firebaseIdToken: token({
        uid: 'u',
        email: 'a@example.com',
        email_verified: true,
        permission: ['scholar:access'],
      }),
    });
    expect(await users.get('u')).toMatchObject({ email: 'a@example.com' });
  });
  it('rotates refresh tokens and detects reuse', async () => {
    await users.upsert({
      uid: 'u',
      email: 'a@example.com',
      displayName: 'A',
      emailVerified: true,
      mfaEnabled: false,
      administrativeMfaRequired: false,
      permissions: ['scholar:access'],
    });
    const s = await sessions.create('u', 14);
    const r = await svc.refresh(s.token);
    expect(r.refreshToken).not.toBe(s.token);
    await expect(svc.refresh(s.token)).rejects.toThrow('Invalid');
  });
  it('logout revokes active sessions', async () => {
    await sessions.create('u', 14);
    expect(await sessions.revokeActiveForUser('u', 'logout')).toBe(1);
  });
  it('/auth/me requires authentication', async () => {
    const app = await buildApp({
      authService: svc,
      sessions,
      readiness: {
        ready: async () => ({ status: 'ready' }),
        current: (u: string) => ({ userId: u }),
      },
    });
    const r = await app.inject('/api/v1/auth/me');
    expect(r.statusCode).toBe(401);
  });
  it('/readiness/current requires scholar access', async () => {
    const app = await buildApp({
      authService: svc,
      sessions,
      readiness: {
        ready: async () => ({ status: 'ready' }),
        current: (u: string) => ({ userId: u }),
      },
    });
    const access = await svc.signAccessToken('u', 'a@example.com', []);
    const r = await app.inject({
      url: '/api/v1/readiness/current',
      headers: { authorization: `Bearer ${access.token}` },
    });
    expect(r.statusCode).toBe(403);
  });
  it('maps Firestore user documents', () => {
    const repo = Object.create(UsersRepository.prototype) as UsersRepository;
    const d = repo.map({
      uid: 'u',
      email: 'e',
      displayName: 'n',
      emailVerified: true,
      permissions: ['scholar:access'],
      createdUtc: new Date(),
      updatedUtc: new Date(),
    });
    expect(d.mfaEnabled).toBe(false);
  });
  it('adds security headers', async () => {
    const app = await buildApp({
      authService: svc,
      sessions,
      readiness: {
        ready: async () => ({ status: 'ready' }),
        current: (u: string) => ({ userId: u }),
      },
    });
    const r = await app.inject('/health/live');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBe('DENY');
  });
  it('rate limits auth endpoints', async () => {
    const app = await buildApp({
      authService: svc,
      sessions,
      readiness: {
        ready: async () => ({ status: 'ready' }),
        current: (u: string) => ({ userId: u }),
      },
    });
    let last: any;
    for (let i = 0; i < 12; i++)
      last = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'a@example.com', firebaseIdToken: 'bad' },
      });
    expect(last.statusCode).toBe(429);
  });
});
