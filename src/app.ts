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
import { authenticate } from './modules/common/auth-middleware.js';
import { UsersRepository } from './modules/users/users.repository.js';
import { AuthRepository } from './modules/auth/auth.repository.js';
import { AuthService } from './modules/auth/auth.service.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { ReadinessService } from './modules/readiness/readiness.service.js';
import { readinessRoutes } from './modules/readiness/readiness.routes.js';
import { LearningRepository } from './modules/learning/learning.repository.js';
import { learningRoutes } from './modules/learning/learning.routes.js';
import { NotificationsRepository } from './modules/notifications/notifications.repository.js';
import { notificationsRoutes } from './modules/notifications/notifications.routes.js';
import { adminRoutes } from './modules/learning/admin.routes.js';

export async function buildApp(overrides?: any) {
  const app = Fastify({
    routerOptions: {
      ignoreTrailingSlash: true,
      ignoreDuplicateSlashes: true,
    },
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
  const notifications =
    overrides?.notifications ??
    (overrides
      ? {
          data: new Map<string, any>(),
          async saveExamReminder(userId: string, input: any) {
            const now = new Date().toISOString();
            const existing = this.data.get(userId) ?? {};
            const reminder = {
              ...existing,
              ...input,
              userId,
              createdAtUtc: existing.createdAtUtc ?? now,
              updatedAtUtc: now,
            };
            this.data.set(userId, reminder);
            return reminder;
          },
          async getExamReminder(userId: string) {
            return this.data.get(userId) ?? null;
          },
        }
      : new NotificationsRepository(getFirebase().db));
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
          getCurrentChallengeToday: async () => {
            const seed = await import('./modules/learning/learning.seed.js');
            const dashboard = seed.sampleDashboard;
            const dayNumber = Number(dashboard.currentDay) || 1;
            const day = seed.sampleChallengeDays.find(
              (item) => item.challengeId === dashboard.activeChallengeId && item.day === dayNumber,
            );
            return {
              studyDay: dayNumber,
              phaseTitle:
                dayNumber <= 7 ? 'Foundation' : dayNumber <= 14 ? 'Systems Review' : 'Integration',
              dailyTitle: day?.title ?? `Day ${dayNumber} Challenge`,
              encouragementMessage: dashboard.latestEncouragement,
              administrativeAnnouncement: '',
              teamProgressMessage: `${dashboard.teamName} is ${dashboard.teamDailyCompletion}% complete for today.`,
              targetCapsules: dashboard.dailyTarget,
              targetQuestions: dashboard.dailyQuestionTarget,
              targetStudyMinutes: day?.estimatedMinutes ?? 0,
              completionPercentage: dashboard.overallCompletion,
              currentStreak: dashboard.currentStreak,
              morningCheckInDone: dashboard.morningCheckInDone,
              eveningCheckInDone: dashboard.eveningCheckInDone,
              continueUrl: dashboard.continueUrl,
              currentCapsuleUrl: dashboard.continueUrl,
              locked: false,
              assignedLearningPacks: seed.sampleLearningPacks.slice(0, 1).map((pack, index) => ({
                id: pack.id,
                packNumber: index + 1,
                title: pack.title,
                topic: pack.description,
                capsuleCount: seed.sampleCapsules.filter(
                  (capsule) => capsule.learningPackId === pack.id,
                ).length,
                completedCapsules: 0,
                status: 'Not started',
                continueUrl: `/learning-packs/${pack.id}`,
              })),
            };
          },
          listResources: async () =>
            (await import('./modules/learning/learning.seed.js')).sampleResources,
          listTeams: async () => (await import('./modules/learning/learning.seed.js')).sampleTeams,
          listLearningPacks: async () =>
            (await import('./modules/learning/learning.seed.js')).sampleLearningPacks,
          listRewards: async () =>
            (await import('./modules/learning/learning.seed.js')).sampleRewards,
          listCertificates: async () =>
            (await import('./modules/learning/learning.seed.js')).sampleCertificates,
          listRaffleEntries: async () =>
            (await import('./modules/learning/learning.seed.js')).sampleRaffleEntries,
          getSystemSettings: async () =>
            (await import('./modules/learning/learning.seed.js')).sampleSystemSettings,
          listReviewContent: async () => {
            const seed = await import('./modules/learning/learning.seed.js');
            return seed.sampleContentReviews.map((review) => {
              const sources = [
                ...seed.sampleLearningPacks,
                ...seed.sampleCapsules,
                ...seed.sampleQuestions,
              ];
              const content = sources.find((item) => item.id === review.entityId) ?? null;
              return {
                ...review,
                content,
                title:
                  content && 'title' in content
                    ? content.title
                    : (content?.stem ?? review.entityId),
              };
            });
          },
          listReviewQuestions: async () => {
            const seed = await import('./modules/learning/learning.seed.js');
            return seed.sampleQuestions.map((question) => ({
              ...question,
              review:
                seed.sampleContentReviews.find(
                  (review) => review.entityType === 'question' && review.entityId === question.id,
                ) ?? null,
              explanation:
                seed.sampleQuestionExplanations.find(
                  (explanation) => explanation.questionId === question.id,
                ) ?? null,
            }));
          },
          listReviewScenarios: async () =>
            (await import('./modules/learning/learning.seed.js')).sampleReviewScenarios,
          listAiDrafts: async () =>
            (await import('./modules/learning/learning.seed.js')).sampleAiDrafts,
          listReviewHistory: async () =>
            (await import('./modules/learning/learning.seed.js')).sampleReviewHistory,
          listSupportRequests: async () =>
            (await import('./modules/learning/learning.seed.js')).sampleSupportRequests,
          getDashboard: async () =>
            (await import('./modules/learning/learning.seed.js')).sampleDashboard,
          getScholarDashboard: async () =>
            (await import('./modules/learning/learning.seed.js')).sampleDashboard,
          getReadiness: async () =>
            (await import('./modules/learning/learning.seed.js')).sampleReadiness,
          listReadinessPrompts: async () =>
            (await import('./modules/learning/learning.seed.js')).sampleReadinessPrompts,
          saveCheckIn: async (userId: string, input: any) => ({
            id: 'check-in-test',
            ...input,
            userId,
            createdAtUtc: new Date().toISOString(),
            updatedAtUtc: new Date().toISOString(),
          }),
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
  const profile = { preHandler: authenticate(authService) };
  const meta = {
    name: 'MindUnlocking API',
    version: 'v1',
    status: 'available',
    links: {
      health: '/api/v1/health',
      liveHealth: '/health/live',
      readiness: '/health/ready',
      auth: '/api/v1/auth',
      challenges: '/api/v1/challenges',
      scenarios: '/api/v1/scenarios',
      rehearsals: '/api/v1/rehearsals',
      availableRehearsals: '/api/v1/rehearsals/available',
      teams: '/api/v1/teams',
      learningPacks: '/api/v1/learning-packs',
      rewards: '/api/v1/rewards',
      certificates: '/api/v1/certificates',
      raffleEntries: '/api/v1/raffle-entries',
      systemSettings: '/api/v1/admin/system-settings',
      dashboard: '/api/v1/dashboard',
      profile: '/api/v1/profile',
      notifications: '/api/v1/notifications',
      notificationPreferences: '/api/v1/notification-preferences',
    },
  };
  app.get('/api/v1', async () => meta);
  app.get('/api', async () => meta);
  app.get('/health/live', async () => ({ status: 'live' }));
  app.get('/api/v1/health', async () => ({ status: 'live' }));
  app.get('/api/health', async () => ({ status: 'live' }));
  app.get('/health/ready', async () => readiness.ready());
  await app.register(
    async (v1) => {
      v1.get('/profile', profile, async (req) => req.user);
      await v1.register(authRoutes, { prefix: '/auth', authService, sessions } as any);
      await v1.register(readinessRoutes, { prefix: '/readiness', readiness, authService } as any);
      await v1.register(learningRoutes, { learning, authService, users } as any);
      await v1.register(adminRoutes, { learning, authService } as any);
      await v1.register(notificationsRoutes, {
        prefix: '/notifications',
        notifications,
        authService,
      } as any);
      await v1.register(notificationsRoutes, {
        prefix: '/notification-preferences',
        notifications,
        authService,
      } as any);
    },
    { prefix: '/api/v1' },
  );
  await app.register(
    async (api) => {
      api.get('/profile', profile, async (req) => req.user);
      await api.register(authRoutes, { prefix: '/auth', authService, sessions } as any);
      await api.register(readinessRoutes, { prefix: '/readiness', readiness, authService } as any);
      await api.register(learningRoutes, { learning, authService, users } as any);
      await api.register(adminRoutes, { learning, authService } as any);
      await api.register(notificationsRoutes, {
        prefix: '/notifications',
        notifications,
        authService,
      } as any);
      await api.register(notificationsRoutes, {
        prefix: '/notification-preferences',
        notifications,
        authService,
      } as any);
    },
    { prefix: '/api' },
  );
  await app.register(learningRoutes, { learning, authService, users } as any);
  return app;
}
