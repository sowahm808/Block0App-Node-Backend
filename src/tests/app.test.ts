import { describe, it, expect, beforeEach } from 'vitest';
import { buildApp } from '../app.js';
import { AuthService } from '../modules/auth/auth.service.js';
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
const prodEnv = loadEnv({
  NODE_ENV: 'production',
  ACCESS_TOKEN_SECRET: 'test-secret-test-secret-test-secret-32',
  FIREBASE_PROJECT_ID: 'prod-project',
  FIREBASE_CLIENT_EMAIL: 'firebase-admin@prod-project.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----',
  FIREBASE_STORAGE_BUCKET: 'prod-project.appspot.com',
  CORS_ALLOWED_ORIGINS: 'https://custom.example.com',
} as any);

describe('MindUnlocking API', () => {
  let users: MemUsers, sessions: MemSessions, svc: AuthService;
  beforeEach(() => {
    users = new MemUsers();
    sessions = new MemSessions();
    svc = new AuthService(firebase() as any, users as any, sessions as any, env);
  });

  it('requires Firebase Admin credentials in production', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        ACCESS_TOKEN_SECRET: 'test-secret-test-secret-test-secret-32',
        CORS_ALLOWED_ORIGINS: 'https://custom.example.com',
      } as any),
    ).toThrow('FIREBASE_PROJECT_ID is required in production');
  });

  it('parses strict production CORS origins when required secrets are present', () => {
    const defaultEnv = loadEnv({
      NODE_ENV: 'production',
      ACCESS_TOKEN_SECRET: 'test-secret-test-secret-test-secret-32',
      FIREBASE_PROJECT_ID: 'prod-project',
      FIREBASE_CLIENT_EMAIL: 'firebase-admin@prod-project.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----',
      FIREBASE_STORAGE_BUCKET: 'prod-project.appspot.com',
      CORS_ALLOWED_ORIGINS: 'https://custom.example.com',
    } as any);

    expect(defaultEnv.corsOrigins).toEqual(['http://localhost:4200', 'https://custom.example.com']);
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

  it('serves seeded frontend learning endpoints', async () => {
    const app = await buildApp({
      authService: svc,
      sessions,
      readiness: {
        ready: async () => ({ status: 'ready' }),
        current: (u: string) => ({ userId: u }),
      },
    });

    const challenges = await app.inject('/api/v1/challenges');
    expect(challenges.statusCode).toBe(200);
    expect(challenges.json().data[0]).toMatchObject({
      slug: 'block-zero-21-day-medical-exam-prep',
      durationDays: 21,
      status: 'published',
    });

    const scenarios = await app.inject('/api/v1/scenarios');
    expect(scenarios.statusCode).toBe(200);
    expect(scenarios.json().data).toEqual(challenges.json().data);

    for (const path of ['/teams', '/learning-packs', '/dashboard', '/readiness']) {
      const response = await app.inject(`/api/v1${path}`);
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toBeTruthy();
    }

    const legacyLearningPacks = await app.inject('/learning-packs');
    expect(legacyLearningPacks.statusCode).toBe(200);
    expect(legacyLearningPacks.json().data).toEqual(
      (await app.inject('/api/v1/learning-packs')).json().data,
    );
  });

  it('keeps W1 resume payloads separate from W2/W3 submit feedback', async () => {
    const app = await buildApp({
      authService: svc,
      sessions,
      readiness: {
        ready: async () => ({ status: 'ready' }),
        current: (u: string) => ({ userId: u }),
      },
    });

    const resume = await app.inject(
      '/api/v1/capsule-attempts/attempt-day-01-capsule-01-seed-scholar/resume',
    );
    expect(resume.statusCode).toBe(200);
    expect(resume.json().data.question).toMatchObject({
      id: 'bp-day-01-q001',
      stem: expect.any(String),
      choices: expect.any(Array),
    });
    expect(JSON.stringify(resume.json().data.question)).not.toContain('correctChoiceId');
    expect(JSON.stringify(resume.json().data.question)).not.toContain('correctRationale');
    expect(JSON.stringify(resume.json().data.question)).not.toContain('incorrectRationales');

    const submit = await app.inject({
      method: 'POST',
      url: '/api/v1/capsule-attempts/attempt-day-01-capsule-01-seed-scholar/question-attempts/question-attempt-day-01-q001-seed-scholar/submit',
      payload: { choiceId: 'A', elapsedMs: 1200 },
    });
    expect(submit.statusCode).toBe(200);
    expect(submit.json().data).toMatchObject({
      correct: true,
      correctChoiceId: 'A',
      correctRationale: expect.any(String),
      incorrectRationales: expect.any(Object),
      reference: expect.any(String),
      memory: expect.any(Object),
    });
  });

  it('requires admin or content-review access for learning-pack imports and audits results', async () => {
    const app = await buildApp({
      authService: svc,
      sessions,
      readiness: {
        ready: async () => ({ status: 'ready' }),
        current: (u: string) => ({ userId: u }),
      },
    });
    const payload = {
      sourceFileName: 'day-02.json',
      learningPack: { externalId: 'bp-day-02', title: 'Day 2', status: 'draft' },
      capsules: [
        {
          externalId: 'bp-day-02-c1',
          title: 'Capsule',
          sequence: 1,
          questions: [
            {
              externalId: 'bp-day-02-q1',
              sequence: 1,
              stem: 'Stem?',
              choices: [
                { id: 'A', label: 'A', text: 'A' },
                { id: 'B', label: 'B', text: 'B' },
              ],
              explanation: {
                correctChoiceId: 'A',
                correctRationale: 'Because A.',
                incorrectRationales: { B: 'Not B.' },
              },
            },
          ],
        },
      ],
    };
    const scholarToken = await svc.signAccessToken('scholar', 's@example.com', ['scholar:access']);
    const forbidden = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/content/import-learning-pack',
      headers: { authorization: `Bearer ${scholarToken.token}` },
      payload,
    });
    expect(forbidden.statusCode).toBe(403);

    const adminToken = await svc.signAccessToken('admin-user', 'a@example.com', ['admin:content']);
    const imported = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/content/import-learning-pack',
      headers: { authorization: `Bearer ${adminToken.token}` },
      payload,
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json().data).toMatchObject({
      failed: 0,
      audit: { importedBy: 'admin-user', sourceFileName: 'day-02.json' },
    });
  });

  it('saves exam reminders for the authenticated user in the backend database', async () => {
    const app = await buildApp({
      authService: svc,
      sessions,
      readiness: {
        ready: async () => ({ status: 'ready' }),
        current: (u: string) => ({ userId: u }),
      },
    });
    const access = await svc.signAccessToken('u-reminder', 'reminder@example.com', [
      'scholar:access',
    ]);

    const saved = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/exam-reminders/me',
      headers: { authorization: `Bearer ${access.token}` },
      payload: {
        enabled: true,
        examName: 'USMLE Step 1',
        examDate: '2026-09-01',
        reminderTime: '08:30',
        timezone: 'America/New_York',
        reminderDaysBefore: [30, 7, 1],
        channels: ['email', 'push'],
      },
    });
    expect(saved.statusCode).toBe(201);
    expect(saved.json().data).toMatchObject({
      userId: 'u-reminder',
      examName: 'USMLE Step 1',
      reminderTime: '08:30',
    });

    const loaded = await app.inject({
      url: '/api/v1/notifications/exam-reminders/me',
      headers: { authorization: `Bearer ${access.token}` },
    });
    expect(loaded.statusCode).toBe(200);
    expect(loaded.json().data).toMatchObject({
      userId: 'u-reminder',
      examDate: '2026-09-01',
      reminderDaysBefore: [30, 7, 1],
    });
  });

  it('returns the authenticated user notification settings from the collection endpoint', async () => {
    const app = await buildApp({
      authService: svc,
      sessions,
      readiness: {
        ready: async () => ({ status: 'ready' }),
        current: (u: string) => ({ userId: u }),
      },
    });
    const access = await svc.signAccessToken('u-notifications', 'notifications@example.com', [
      'scholar:access',
    ]);

    await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/exam-reminders/me',
      headers: { authorization: `Bearer ${access.token}` },
      payload: {
        enabled: true,
        examName: 'NCLEX',
        reminderTime: '07:15',
      },
    });

    const loaded = await app.inject({
      url: '/api/v1/notifications',
      headers: { authorization: `Bearer ${access.token}` },
    });

    expect(loaded.statusCode).toBe(200);
    expect(loaded.json().data.examReminder).toMatchObject({
      userId: 'u-notifications',
      examName: 'NCLEX',
      reminderTime: '07:15',
    });
  });

  it('normalizes common exam reminder channel aliases from clients', async () => {
    const app = await buildApp({
      authService: svc,
      sessions,
      readiness: {
        ready: async () => ({ status: 'ready' }),
        current: (u: string) => ({ userId: u }),
      },
    });
    const access = await svc.signAccessToken('u-reminder-alias', 'reminder-alias@example.com', [
      'scholar:access',
    ]);

    const saved = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/exam-reminders/me',
      headers: { authorization: `Bearer ${access.token}` },
      payload: {
        examName: 'USMLE Step 2',
        channels: ['app', 'in-app', 'EMAIL', 'text'],
      },
    });

    expect(saved.statusCode).toBe(201);
    expect(saved.json().data.channels).toEqual(['in_app', 'in_app', 'email', 'sms']);
  });

  it('/auth/me accepts backend-issued access tokens in production', async () => {
    const prodSvc = new AuthService(firebase() as any, users as any, sessions as any, prodEnv);
    const app = await buildApp({
      authService: prodSvc,
      sessions,
      readiness: {
        ready: async () => ({ status: 'ready' }),
        current: (u: string) => ({ userId: u }),
      },
    });
    const access = await prodSvc.signAccessToken('u-prod', 'prod@example.com', ['scholar:access']);

    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${access.token}` },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      uid: 'u-prod',
      email: 'prod@example.com',
      permissions: ['scholar:access'],
    });
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

  it('accepts common browser token transport variants on authenticated routes', async () => {
    const app = await buildApp({
      authService: svc,
      sessions,
      readiness: {
        ready: async () => ({ status: 'ready' }),
        current: (u: string) => ({ userId: u }),
      },
    });
    const access = await svc.signAccessToken('u-token-variants', 'variants@example.com', [
      'scholar:access',
    ]);

    const authMeWithLowercaseBearer = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `bearer ${access.token}` },
    });
    const readinessWithAccessHeader = await app.inject({
      method: 'GET',
      url: '/api/v1/readiness/current',
      headers: { 'x-access-token': access.token },
    });
    const notificationWithCookie = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/exam-reminders/me',
      headers: { cookie: `accessToken=${encodeURIComponent(access.token)}` },
    });

    expect(authMeWithLowercaseBearer.statusCode).toBe(200);
    expect(authMeWithLowercaseBearer.json()).toMatchObject({ uid: 'u-token-variants' });
    expect(readinessWithAccessHeader.statusCode).toBe(200);
    expect(notificationWithCookie.statusCode).toBe(200);
  });

  it('saves authenticated check-ins at the canonical v1 route', async () => {
    const app = await buildApp({
      authService: svc,
      sessions,
      readiness: {
        ready: async () => ({ status: 'ready' }),
        current: (u: string) => ({ userId: u }),
      },
    });
    const access = await svc.signAccessToken('u-check-in', 'checkin@example.com', [
      'scholar:access',
    ]);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/check-ins',
      headers: { authorization: `Bearer ${access.token}` },
      payload: { dayNumber: 1, energy: 4, confidence: 3, notes: 'Ready to study' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({
      id: 'check-in-test',
      userId: 'u-check-in',
      dayNumber: 1,
      energy: 4,
      confidence: 3,
      notes: 'Ready to study',
    });
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
