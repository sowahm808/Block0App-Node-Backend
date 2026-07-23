import { describe, it, expect, beforeEach } from 'vitest';
import { buildApp } from '../app.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { UsersRepository } from '../modules/users/users.repository.js';
import { LearningRepository } from '../modules/learning/learning.repository.js';
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
const registration = (overrides: Record<string, unknown> = {}) => ({
  email: 'learner@example.com',
  password: 'password123',
  displayName: 'Learner Example',
  country: 'US',
  timeZone: 'America/New_York',
  primaryStudyDevice: 'laptop',
  acceptedTerms: true,
  acceptedPrivacyPolicy: true,
  ...overrides,
});
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
  it('accepts the complete registration onboarding payload', async () => {
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
      payload: registration({
        email: '  MixedCase@example.COM ',
        displayName: '  Dr Example  ',
        country: 'us',
      }),
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ email: 'mixedcase@example.com' });
    expect(await users.get('uid-mixedcase@example.com')).toMatchObject({
      displayName: 'Dr Example',
      email: 'mixedcase@example.com',
      country: 'US',
      timeZone: 'America/New_York',
      primaryStudyDevice: 'laptop',
      acceptedTerms: true,
      acceptedPrivacyPolicy: true,
    });
  });
  it('rejects invalid onboarding registration fields', async () => {
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
      payload: registration({
        displayName: 'A',
        country: 'ZZ',
        timeZone: 'Not/AZone',
        primaryStudyDevice: 'watch',
        acceptedTerms: false,
        acceptedPrivacyPolicy: false,
      }),
    });
    expect(r.statusCode).toBe(400);
    expect(JSON.stringify(r.json().errors)).toContain('displayName');
    expect(JSON.stringify(r.json().errors)).toContain('country');
    expect(JSON.stringify(r.json().errors)).toContain('timeZone');
    expect(JSON.stringify(r.json().errors)).toContain('primaryStudyDevice');
    expect(JSON.stringify(r.json().errors)).toContain('acceptedTerms');
    expect(JSON.stringify(r.json().errors)).toContain('acceptedPrivacyPolicy');
  });
  it('handles duplicate email', async () => {
    await expect(
      svc.register(registration({ email: 'dupe@example.com', displayName: 'Dupe' }) as any),
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
      service.register(
        registration({ email: 'action-link@example.com', displayName: 'Action Link' }) as any,
      ),
    ).resolves.toMatchObject({
      email: 'action-link@example.com',
      emailVerificationLink: null,
    });
    expect(await users.get('uid-action-link@example.com')).toMatchObject({
      email: 'action-link@example.com',
      country: 'US',
      timeZone: 'America/New_York',
      primaryStudyDevice: 'laptop',
      acceptedTerms: true,
      acceptedPrivacyPolicy: true,
    });
  });

  it('rolls back Firebase user when profile setup fails', async () => {
    users.fail = true;
    await expect(
      svc.register(registration({ email: 'a@example.com', displayName: 'Able Learner' }) as any),
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

    const availableScenarios = await app.inject('/api/v1/scenarios/available');
    expect(availableScenarios.statusCode).toBe(200);
    expect(availableScenarios.json().data).toEqual(challenges.json().data);

    const rehearsals = await app.inject('/api/v1/rehearsals');
    expect(rehearsals.statusCode).toBe(200);
    expect(rehearsals.json().data).toEqual(challenges.json().data);

    const availableRehearsals = await app.inject('/api/v1/rehearsals/available');
    expect(availableRehearsals.statusCode).toBe(200);
    expect(availableRehearsals.json().data).toEqual(challenges.json().data);

    const legacyAvailableRehearsals = await app.inject('/rehearsals/available');
    expect(legacyAvailableRehearsals.statusCode).toBe(200);
    expect(legacyAvailableRehearsals.json().data).toEqual(challenges.json().data);

    const currentToday = await app.inject('/api/v1/challenges/current/today');
    expect(currentToday.statusCode).toBe(200);
    expect(currentToday.json().data).toMatchObject({
      currentDay: 1,
      totalDays: 21,
      challenge: { slug: 'block-zero-21-day-medical-exam-prep' },
      day: { challengeId: 'block-zero-21-day-medical-exam-prep', day: 1 },
    });

    for (const path of [
      '/teams',
      '/mentor/teams',
      '/mentor/support-requests',
      '/learning-packs',
      '/admin/challenges',
      '/admin/cohorts',
      '/admin/learning-packs',
      '/admin/content-review',
      '/admin/reports',
      '/admin/audit',
      '/rewards',
      '/certificates',
      '/raffle-entries',
      '/dashboard',
      '/mentor/dashboard',
      '/review/dashboard',
      '/review/scenarios',
      '/review/ai-drafts',
      '/review/history',
      '/admin/dashboard',
      '/admin/users',
      '/admin/system-settings',
      '/readiness',
    ]) {
      const response = await app.inject(`/api/v1${path}`);
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toBeTruthy();
    }

    const systemSettings = await app.inject('/api/v1/admin/system-settings');
    expect(systemSettings.statusCode).toBe(200);
    expect(systemSettings.json().data).toMatchObject({
      id: 'default',
      maintenanceMode: false,
      featureFlags: { rewards: true },
    });

    const rewards = await app.inject('/api/v1/rewards');
    expect(rewards.statusCode).toBe(200);
    expect(rewards.json().data[0]).toMatchObject({
      id: 'daily-check-in-starter',
      type: 'badge',
      status: 'active',
    });

    const legacyRewards = await app.inject('/rewards');
    expect(legacyRewards.statusCode).toBe(200);
    expect(legacyRewards.json().data).toEqual(rewards.json().data);

    const certificates = await app.inject('/api/v1/certificates');
    expect(certificates.statusCode).toBe(200);
    expect(certificates.json().data[0]).toMatchObject({
      id: 'certificate-block-zero-foundations-seed-scholar',
      status: 'issued',
    });
    const legacyCertificates = await app.inject('/certificates');
    expect(legacyCertificates.statusCode).toBe(200);
    expect(legacyCertificates.json().data).toEqual(certificates.json().data);

    const raffleEntries = await app.inject('/api/v1/raffle-entries');
    expect(raffleEntries.statusCode).toBe(200);
    expect(raffleEntries.json().data[0]).toMatchObject({
      id: 'raffle-entry-daily-check-in-seed-scholar',
      status: 'active',
    });
    const legacyRaffleEntries = await app.inject('/raffle-entries');
    expect(legacyRaffleEntries.statusCode).toBe(200);
    expect(legacyRaffleEntries.json().data).toEqual(raffleEntries.json().data);

    const legacyLearningPacks = await app.inject('/learning-packs');
    expect(legacyLearningPacks.statusCode).toBe(200);
    expect(legacyLearningPacks.json().data).toEqual(
      (await app.inject('/api/v1/learning-packs')).json().data,
    );

    const reviewContent = await app.inject('/api/v1/review/content');
    expect(reviewContent.statusCode).toBe(200);
    expect(reviewContent.json().data[0]).toMatchObject({
      id: 'review-medical-exam-foundations',
      entityType: 'learningPack',
      entityId: 'medical-exam-foundations',
      title: 'Medical Exam Foundations',
      content: { id: 'medical-exam-foundations' },
    });

    for (const path of ['/api/v1/review/questions', '/api/review/questions', '/review/questions']) {
      const reviewQuestions = await app.inject(path);
      expect(reviewQuestions.statusCode).toBe(200);
      expect(reviewQuestions.json().data[0]).toMatchObject({
        id: 'bp-day-01-q001',
        stem: expect.any(String),
        choices: expect.any(Array),
        explanation: { questionId: 'bp-day-01-q001', correctChoiceId: 'A' },
      });
    }
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

    const reviewerToken = await svc.signAccessToken('reviewer-user', 'r@example.com', [
      'content.review',
    ]);
    const reviewerImported = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/content/import-learning-pack',
      headers: { authorization: `Bearer ${reviewerToken.token}` },
      payload: {
        ...payload,
        sourceFileName: 'day-03.json',
        learningPack: { externalId: 'bp-day-03', title: 'Day 3', status: 'draft' },
      },
    });
    expect(reviewerImported.statusCode).toBe(200);
    expect(reviewerImported.json().data).toMatchObject({
      failed: 0,
      audit: { importedBy: 'reviewer-user', sourceFileName: 'day-03.json' },
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

  it('returns notification preferences from the legacy preferences endpoint', async () => {
    const app = await buildApp({
      authService: svc,
      sessions,
      readiness: {
        ready: async () => ({ status: 'ready' }),
        current: (u: string) => ({ userId: u }),
      },
    });
    const access = await svc.signAccessToken('u-notification-preferences', 'prefs@example.com', [
      'scholar:access',
    ]);

    await app.inject({
      method: 'POST',
      url: '/api/v1/notification-preferences/exam-reminders/me',
      headers: { authorization: `Bearer ${access.token}` },
      payload: {
        enabled: true,
        examName: 'NCLEX',
        reminderTime: '07:15',
      },
    });

    const loaded = await app.inject({
      url: '/api/v1/notification-preferences',
      headers: { authorization: `Bearer ${access.token}` },
    });
    const loadedWithTrailingSlash = await app.inject({
      url: '/api/v1/notification-preferences/',
      headers: { authorization: `Bearer ${access.token}` },
    });
    const loadedWithDuplicateSlash = await app.inject({
      url: '/api/v1//notification-preferences',
      headers: { authorization: `Bearer ${access.token}` },
    });

    expect(loaded.statusCode).toBe(200);
    expect(loadedWithTrailingSlash.statusCode).toBe(200);
    expect(loadedWithDuplicateSlash.statusCode).toBe(200);
    expect(loaded.json().data.examReminder).toMatchObject({
      userId: 'u-notification-preferences',
      examName: 'NCLEX',
      reminderTime: '07:15',
    });
    expect(loadedWithTrailingSlash.json()).toEqual(loaded.json());
    expect(loadedWithDuplicateSlash.json()).toEqual(loaded.json());
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

  it('/profile returns the authenticated learner profile', async () => {
    const app = await buildApp({
      authService: svc,
      sessions,
      readiness: {
        ready: async () => ({ status: 'ready' }),
        current: (u: string) => ({ userId: u }),
      },
    });
    const access = await svc.signAccessToken('u-profile', 'profile@example.com', [
      'scholar:access',
    ]);

    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/profile',
      headers: { authorization: `Bearer ${access.token}` },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      uid: 'u-profile',
      email: 'profile@example.com',
      permissions: ['scholar:access'],
    });
  });

  it('/profile is available at the compatibility /api prefix', async () => {
    const app = await buildApp({
      authService: svc,
      sessions,
      readiness: {
        ready: async () => ({ status: 'ready' }),
        current: (u: string) => ({ userId: u }),
      },
    });
    const access = await svc.signAccessToken('u-profile-alias', 'profile-alias@example.com', [
      'scholar:access',
    ]);

    const r = await app.inject({
      method: 'GET',
      url: '/api/profile',
      headers: { authorization: `Bearer ${access.token}` },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ uid: 'u-profile-alias' });
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

  it('/readiness/current allows wildcard permissions for super administrators', async () => {
    const app = await buildApp({
      authService: svc,
      sessions,
      readiness: {
        ready: async () => ({ status: 'ready' }),
        current: (u: string) => ({ userId: u }),
      },
    });
    const access = await svc.signAccessToken('super-admin', 'admin@example.com', ['*']);
    const r = await app.inject({
      url: '/api/v1/readiness/current',
      headers: { authorization: `Bearer ${access.token}` },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ userId: 'super-admin' });
  });

  it('loads challenge days without requiring a Firestore composite index', async () => {
    let orderByCalled = false;
    const docs = [
      { data: () => ({ id: 'day-03', challengeId: 'challenge-a', day: 3 }) },
      { data: () => ({ id: 'day-01', challengeId: 'challenge-a', day: 1 }) },
      { data: () => ({ id: 'day-02', challengeId: 'challenge-a', day: 2 }) },
    ];
    const query = {
      where(field: string, operator: string, value: string) {
        expect([field, operator, value]).toEqual(['challengeId', '==', 'challenge-a']);
        return query;
      },
      orderBy() {
        orderByCalled = true;
        return query;
      },
      async get() {
        return { docs };
      },
    };
    const db = {
      collection(name: string) {
        expect(name).toBe('challengeDays');
        return query;
      },
    };
    const repo = new LearningRepository(db as any);

    const days = await repo.getChallengeDays('challenge-a');

    expect(orderByCalled).toBe(false);
    expect(days.map((day: any) => day.day)).toEqual([1, 2, 3]);
  });

  it('removes undefined fields before writing imported learning content to Firestore', async () => {
    const writes = new Map<string, any>();
    const db = {
      collection(collectionName: string) {
        return {
          doc(id: string) {
            return {
              async get() {
                return { exists: writes.has(`${collectionName}/${id}`) };
              },
              async set(data: any) {
                expect(JSON.stringify(data)).not.toContain('undefined');
                writes.set(`${collectionName}/${id}`, data);
              },
            };
          },
        };
      },
    };
    const repo = new LearningRepository(db as any);

    await repo.importLearningPack(
      {
        sourceFileName: undefined,
        learningPack: { externalId: 'pack-with-optional-fields', title: 'Pack', status: 'draft' },
        capsules: [
          {
            externalId: 'capsule-with-questions-array',
            title: 'Capsule',
            sequence: 1,
            optionalMetadata: undefined,
            questions: [
              {
                externalId: 'question-with-optional-fields',
                sequence: 1,
                stem: 'Stem?',
                choices: [
                  { id: 'A', label: 'A', text: 'A', optional: undefined },
                  { id: 'B', label: 'B', text: 'B' },
                ],
                explanation: {
                  correctChoiceId: 'A',
                  correctRationale: 'Because A.',
                  incorrectRationales: { B: 'Not B.' },
                  reference: undefined,
                },
              },
            ],
          },
        ],
      } as any,
      'admin-user',
    );

    expect(writes.get('capsules/capsule-with-questions-array')).not.toHaveProperty('questions');
    expect(writes.get('capsules/capsule-with-questions-array')).not.toHaveProperty(
      'optionalMetadata',
    );
    expect(writes.get('questions/question-with-optional-fields').choices[0]).not.toHaveProperty(
      'optional',
    );
    expect(
      writes.get('questionExplanations/question-with-optional-fields-explanation'),
    ).not.toHaveProperty('reference');
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
  it('serves versioned frontend health endpoint', async () => {
    const app = await buildApp({
      authService: svc,
      sessions,
      readiness: {
        ready: async () => ({ status: 'ready' }),
        current: (u: string) => ({ userId: u }),
      },
    });
    const r = await app.inject('/api/v1/health');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: 'live' });
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
