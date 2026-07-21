import crypto from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { env } from './config/env.js';
import { initializeFirebase } from './config/firebase.js';
import { loggerOptions } from './modules/common/logger.js';
import { errorHandler } from './modules/common/problem-details.js';
import { registerSecurity } from './modules/common/security-headers.js';
import { registerRateLimit } from './modules/common/rate-limit.js';
import { UsersRepository } from './modules/users/users.repository.js';
import { AuthRepository } from './modules/auth/auth.repository.js';
import { AuthService } from './modules/auth/auth.service.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { ReadinessService } from './modules/readiness/readiness.service.js';
import { readinessRoutes } from './modules/readiness/readiness.routes.js';
import { LearningRepository } from './modules/learning/learning.repository.js';
import { learningRoutes } from './modules/learning/learning.routes.js';

export async function buildApp(overrides?: any) {
  const app = Fastify({
    logger: loggerOptions,
    genReqId: (req) => String(req.headers['x-correlation-id'] ?? crypto.randomUUID()),
  });
  app.setErrorHandler(errorHandler);
  await registerSecurity(app);
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin)),
  });
  await registerRateLimit(app);
  await app.register(swagger, {
    openapi: {
      info: { title: 'MindUnlocking API', version: 'v1' },
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });
  let firebaseApp = overrides?.firebase;
  const getFirebase = () => {
    firebaseApp ??= initializeFirebase();
    return firebaseApp;
  };
  const sessions =
    overrides?.sessions ??
    new AuthRepository(getFirebase().db, env.FIREBASE_REFRESH_SESSIONS_COLLECTION);
  const users =
    overrides?.users ??
    (overrides?.authService
      ? undefined
      : new UsersRepository(getFirebase().db, env.FIREBASE_USERS_COLLECTION));
  const authService =
    overrides?.authService ?? new AuthService(getFirebase().auth, users!, sessions, env);
  const readiness = overrides?.readiness ?? new ReadinessService(getFirebase().db);
  const learning =
    overrides?.learning ??
    (overrides
      ? {
          seedAll: async () => ({ seeded: {} }),
          listChallenges: async () =>
            (await import('./modules/learning/learning.seed.js')).sampleChallenges,
          getChallenge: async (slugOrId: string) =>
            (await import('./modules/learning/learning.seed.js')).sampleChallenges.find(
              (challenge) => challenge.id === slugOrId || challenge.slug === slugOrId,
            ) ?? null,
          getChallengeDays: async (challengeId: string) =>
            (await import('./modules/learning/learning.seed.js')).sampleChallengeDays.filter(
              (day) => day.challengeId === challengeId,
            ),
          listResources: async () =>
            (await import('./modules/learning/learning.seed.js')).sampleResources,
          listTeams: async () => (await import('./modules/learning/learning.seed.js')).sampleTeams,
          listLearningPacks: async () =>
            (await import('./modules/learning/learning.seed.js')).sampleLearningPacks,
          getDashboard: async () =>
            (await import('./modules/learning/learning.seed.js')).sampleDashboard,
          getReadiness: async () =>
            (await import('./modules/learning/learning.seed.js')).sampleReadiness,
          listReadinessPrompts: async () =>
            (await import('./modules/learning/learning.seed.js')).sampleReadinessPrompts,
          resumeCapsuleAttempt: async (capsuleAttemptId: string) => {
            const seed = await import('./modules/learning/learning.seed.js');
            const attempt = seed.sampleCapsuleAttempts.find((item) => item.id === capsuleAttemptId);
            const capsule = seed.sampleCapsules.find((item) => item.id === attempt?.capsuleId);
            const questionAttempt = seed.sampleQuestionAttempts.find(
              (item) => item.id === attempt?.currentQuestionAttemptId,
            );
            const question = seed.sampleQuestions.find(
              (item) => item.id === questionAttempt?.questionId,
            );
            return attempt && capsule && questionAttempt && question
              ? {
                  capsuleAttemptId,
                  capsule: { id: capsule.id, title: capsule.title, summary: capsule.summary },
                  progress: { completedQuestions: attempt.completedQuestions, totalQuestions: 1 },
                  questionAttemptId: questionAttempt.id,
                  markedForReview: questionAttempt.markedForReview,
                  question,
                }
              : null;
          },
          submitQuestionAttempt: async (
            capsuleAttemptId: string,
            questionAttemptId: string,
            body: any,
          ) => {
            const seed = await import('./modules/learning/learning.seed.js');
            const questionAttempt = seed.sampleQuestionAttempts.find(
              (item) => item.id === questionAttemptId && item.capsuleAttemptId === capsuleAttemptId,
            );
            const explanation = seed.sampleQuestionExplanations.find(
              (item) => item.questionId === questionAttempt?.questionId,
            );
            return explanation
              ? {
                  questionAttemptId,
                  capsuleAttemptId,
                  choiceId: body.choiceId,
                  correct: explanation.correctChoiceId === body.choiceId,
                  correctChoiceId: explanation.correctChoiceId,
                  correctRationale: explanation.correctRationale,
                  incorrectRationales: explanation.incorrectRationales,
                  reference: explanation.reference,
                  memory: explanation.memory,
                }
              : null;
          },
          importLearningPack: async (payload: any, importedBy: string) => {
            const { validateLearningPackImport, importFailedSummary } =
              await import('./modules/learning/content-import.js');
            const errors = validateLearningPackImport(payload);
            return errors.length
              ? importFailedSummary(payload, importedBy, errors)
              : {
                  created: 4,
                  updated: 0,
                  skipped: 0,
                  failed: 0,
                  errors: [],
                  contentIds: [payload.learningPack.externalId],
                  audit: {
                    importedBy,
                    importedAtUtc: new Date().toISOString(),
                    sourceFileName: payload.sourceFileName ?? null,
                  },
                };
          },
        }
      : new LearningRepository(getFirebase().db));
  if (overrides?.seedLearning !== false && typeof learning.seedAll === 'function') {
    await learning.seedAll();
  }
  const meta = {
    name: 'MindUnlocking API',
    version: 'v1',
    status: 'available',
    links: {
      health: '/health/live',
      readiness: '/health/ready',
      auth: '/api/v1/auth',
      challenges: '/api/v1/challenges',
      teams: '/api/v1/teams',
      learningPacks: '/api/v1/learning-packs',
      dashboard: '/api/v1/dashboard',
    },
  };
  app.get('/api/v1', async () => meta);
  app.get('/api', async () => meta);
  app.get('/health/live', async () => ({ status: 'live' }));
  app.get('/health/ready', async () => readiness.ready());
  await app.register(
    async (v1) => {
      await v1.register(authRoutes, { prefix: '/auth', authService, sessions } as any);
      await v1.register(readinessRoutes, { prefix: '/readiness', readiness, authService } as any);
      await v1.register(learningRoutes, { learning, authService } as any);
    },
    { prefix: '/api/v1' },
  );
  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth', authService, sessions } as any);
      await api.register(readinessRoutes, { prefix: '/readiness', readiness, authService } as any);
      await api.register(learningRoutes, { learning, authService } as any);
    },
    { prefix: '/api' },
  );
  return app;
}
