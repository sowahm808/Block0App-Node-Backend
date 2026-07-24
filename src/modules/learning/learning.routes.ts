import type { FastifyInstance } from 'fastify';
import {
  NotFoundError,
  ForbiddenError,
  ValidationAppError,
  ConflictError,
} from '../common/errors.js';
import { authenticate } from '../common/auth-middleware.js';
import type { AuthService } from '../auth/auth.service.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { LearningRepository } from './learning.repository.js';
import {
  checkInHistoryQuerySchema,
  checkInSchema,
  eveningCheckInSchema,
  morningCheckInSchema,
} from './check-ins.schemas.js';

type LearningRoutesOptions = {
  learning: LearningRepository;
  authService?: AuthService;
  users?: { list?: () => Promise<unknown[]> };
};

export async function learningRoutes(app: FastifyInstance, opts: LearningRoutesOptions) {
  const { learning, authService, users } = opts;
  const requireAuth = async (request: any) => {
    if (!authService) throw new ForbiddenError('Authentication is not configured');
    await authenticate(authService)(request);
  };

  const requireAdminPermission = (permission: string) => async (request: any) => {
    await requireAuth(request);
    const permissions = request.user?.permissions ?? [];
    if (!permissions.includes('*') && !permissions.includes(permission)) {
      throw new ForbiddenError(`Missing permission: ${permission}`);
    }
  };

  const requireAdminOrReviewer = async (request: any) => {
    await requireAuth(request);
    const permissions = request.user?.permissions ?? [];
    const roles = request.user?.roles ?? [];
    const role = request.user?.role;
    const accessClaims = [role, ...roles, ...permissions].filter(Boolean);
    const allowedClaims = new Set([
      '*',
      'admin',
      'Administrator',
      'SuperAdministrator',
      'ContentReviewer',
      'content-review',
      'admin:content',
      'content:review',
      'content.manage',
      'content.review',
    ]);
    if (!accessClaims.some((value) => allowedClaims.has(value))) {
      throw new ForbiddenError('Administrator or content-review access is required');
    }
  };

  const requireScholarAccess = async (request: any) => {
    await requireAuth(request);
    const permissions = request.user?.permissions ?? [];
    if (!permissions.includes('*') && !permissions.includes('scholar:access')) {
      throw new ForbiddenError('Scholar access is required');
    }
  };

  const listPublishedChallenges = async () => ({ data: await learning.listChallenges() });

  app.get('/challenges', listPublishedChallenges);

  app.get(
    '/scenarios',
    { preHandler: authService ? requireScholarAccess : undefined },
    async (request) =>
      (learning as any).listClinicalScenarios(request.user?.uid ?? 'anonymous-scholar'),
  );

  app.get(
    '/scenarios/:scenarioId',
    { preHandler: authService ? requireScholarAccess : undefined },
    async (request) => {
      const { scenarioId } = request.params as { scenarioId: string };
      const scenario = await (learning as any).getClinicalScenario(scenarioId);
      if (!scenario) throw new NotFoundError('Clinical scenario not found');
      return scenario;
    },
  );

  app.post(
    '/scenarios/:scenarioId/attempts',
    { preHandler: authService ? requireScholarAccess : undefined },
    async (request, reply) => {
      const { scenarioId } = request.params as { scenarioId: string };
      const attempt = await (learning as any).createOrResumeScenarioAttempt(
        request.user?.uid ?? 'anonymous-scholar',
        scenarioId,
      );
      if (!attempt) throw new NotFoundError('Clinical scenario not found');
      return reply.status(201).send(attempt);
    },
  );

  app.get(
    '/scenario-attempts/:attemptId',
    { preHandler: authService ? requireScholarAccess : undefined },
    async (request) => {
      const { attemptId } = request.params as { attemptId: string };
      const attempt = await (learning as any).getScenarioAttempt(
        request.user?.uid ?? 'anonymous-scholar',
        attemptId,
      );
      if (attempt === 'forbidden')
        throw new ForbiddenError('Scenario attempt belongs to another scholar');
      if (!attempt) throw new NotFoundError('Scenario attempt not found');
      return attempt;
    },
  );

  app.post(
    '/scenario-attempts/:attemptId/answers',
    { preHandler: authService ? requireScholarAccess : undefined },
    async (request) => {
      const { attemptId } = request.params as { attemptId: string };
      const attempt = await (learning as any).answerScenarioAttempt(
        request.user?.uid ?? 'anonymous-scholar',
        attemptId,
        request.body ?? {},
      );
      if (attempt === 'forbidden')
        throw new ForbiddenError('Scenario attempt belongs to another scholar');
      if (!attempt) throw new NotFoundError('Scenario attempt not found');
      return attempt;
    },
  );

  app.post(
    '/scenario-attempts/:attemptId/submit',
    { preHandler: authService ? requireScholarAccess : undefined },
    async (request) => {
      const { attemptId } = request.params as { attemptId: string };
      const result = await (learning as any).submitScenarioAttempt(
        request.user?.uid ?? 'anonymous-scholar',
        attemptId,
      );
      if (result === 'forbidden')
        throw new ForbiddenError('Scenario attempt belongs to another scholar');
      if (!result) throw new NotFoundError('Scenario attempt not found');
      return result;
    },
  );

  app.get(
    '/scenario-attempts/:attemptId/review',
    { preHandler: authService ? requireScholarAccess : undefined },
    async (request) => {
      const { attemptId } = request.params as { attemptId: string };
      const review = await (learning as any).getScenarioAttemptReview(
        request.user?.uid ?? 'anonymous-scholar',
        attemptId,
      );
      if (review === 'forbidden')
        throw new ForbiddenError('Scenario attempt belongs to another scholar');
      if (!review) throw new NotFoundError('Scenario attempt review not found');
      return review;
    },
  );

  app.get(
    '/scenarios/available',
    { preHandler: authService ? requireScholarAccess : undefined },
    async (request) =>
      (learning as any).listClinicalScenarios(request.user?.uid ?? 'anonymous-scholar'),
  );

  app.get('/rehearsals', listPublishedChallenges);

  app.get(
    '/rehearsals/available',
    { preHandler: authService ? requireScholarAccess : undefined },
    async (request) =>
      (learning as any).listAvailableRehearsals(request.user?.uid ?? 'anonymous-scholar'),
  );

  app.post(
    '/rehearsals/:sessionId/start',
    { preHandler: authService ? requireScholarAccess : undefined },
    async (request) => {
      const { sessionId } = request.params as { sessionId: string };
      const result = await (learning as any).startRehearsalSession(
        request.user?.uid ?? 'anonymous-scholar',
        sessionId,
      );
      if (!result) throw new NotFoundError('Rehearsal session not found');
      return result;
    },
  );

  app.get(
    '/rehearsal-attempts/:attemptId',
    { preHandler: authService ? requireScholarAccess : undefined },
    async (request) => {
      const { attemptId } = request.params as { attemptId: string };
      const attempt = await (learning as any).getRehearsalAttempt(
        request.user?.uid ?? 'anonymous-scholar',
        attemptId,
      );
      if (attempt === 'forbidden')
        throw new ForbiddenError('Rehearsal attempt belongs to another scholar');
      if (!attempt) throw new NotFoundError('Rehearsal attempt not found');
      return attempt;
    },
  );

  app.post(
    '/rehearsal-attempts/:attemptId/questions/:questionAttemptId/submit',
    { preHandler: authService ? requireScholarAccess : undefined },
    async (request) => {
      const { attemptId, questionAttemptId } = request.params as {
        attemptId: string;
        questionAttemptId: string;
      };
      const result = await (learning as any).submitRehearsalQuestionAttempt(
        request.user?.uid ?? 'anonymous-scholar',
        attemptId,
        questionAttemptId,
        request.body ?? {},
      );
      if (!result) throw new NotFoundError('Question attempt not found');
      if (result === 'conflict' || result === 'duplicate')
        throw new ConflictError('Question attempt cannot be submitted');
      if (result === 'invalid_choice')
        throw new ValidationAppError({
          choiceId: ['Choice does not belong to this question attempt'],
        });
      if (result === 'missing_answer')
        throw new ValidationAppError({ answer: ['At least one answer is required'] });
      return result;
    },
  );

  app.post(
    '/rehearsal-attempts/:attemptId/questions/:questionAttemptId/memory-pearl/acknowledge',
    { preHandler: authService ? requireScholarAccess : undefined },
    async (request, reply) => {
      const { attemptId, questionAttemptId } = request.params as {
        attemptId: string;
        questionAttemptId: string;
      };
      const result = await (learning as any).acknowledgeRehearsalMemory(
        request.user?.uid ?? 'anonymous-scholar',
        attemptId,
        questionAttemptId,
      );
      if (!result) throw new NotFoundError('Question attempt not found');
      if (result === 'conflict')
        throw new ConflictError('Memory cannot be acknowledged before submission');
      return reply.status(204).send();
    },
  );

  app.post(
    '/rehearsal-attempts/:attemptId/next',
    { preHandler: authService ? requireScholarAccess : undefined },
    async (request, reply) => {
      const { attemptId } = request.params as { attemptId: string };
      const result = await (learning as any).advanceRehearsalAttempt(
        request.user?.uid ?? 'anonymous-scholar',
        attemptId,
      );
      if (!result) throw new NotFoundError('Rehearsal attempt not found');
      if (result === 'conflict') throw new ConflictError('Rehearsal attempt cannot advance');
      if (result === 'complete') throw new ConflictError('No rehearsal questions remain');
      return reply.status(204).send();
    },
  );

  app.get(
    '/rehearsal-attempts/:attemptId/summary',
    { preHandler: authService ? requireScholarAccess : undefined },
    async (request) => {
      const { attemptId } = request.params as { attemptId: string };
      const summary = await (learning as any).getRehearsalSummary(
        request.user?.uid ?? 'anonymous-scholar',
        attemptId,
      );
      if (summary === 'forbidden')
        throw new ForbiddenError('Rehearsal attempt belongs to another scholar');
      if (!summary) throw new NotFoundError('Rehearsal summary not found');
      return summary;
    },
  );

  app.get(
    '/challenges/current/program',
    { preHandler: authService ? requireScholarAccess : undefined },
    async (request) => {
      const program = await learning.getCurrentChallengeProgram(request.user?.uid);
      if (!program) throw new NotFoundError('Current challenge program not found');
      return { data: program };
    },
  );

  app.get(
    '/challenges/current/today',
    { preHandler: authService ? requireScholarAccess : undefined },
    async (request) => {
      const current = await learning.getCurrentChallengeToday(request.user?.uid);
      if (!current) throw new NotFoundError('Current challenge day not found');
      return { data: current };
    },
  );

  app.post(
    '/check-ins',
    { preHandler: requireAuth, schema: { body: zodToJsonSchema(checkInSchema) } },
    async (request, reply) => {
      const data = await learning.saveCheckIn(request.user!.uid, checkInSchema.parse(request.body));
      return reply.status(201).send({ data });
    },
  );

  app.post(
    '/check-ins/morning',
    {
      preHandler: requireScholarAccess,
      schema: { body: zodToJsonSchema(morningCheckInSchema) },
    },
    async (request, reply) => {
      const input = morningCheckInSchema.parse(request.body);
      const result = await (learning as any).saveMorningCheckIn(request.user!.uid, input);
      if (result?.status === 'not_found')
        throw new NotFoundError('Current challenge day not found');
      if (result?.status === 'validation_error') throw new ValidationAppError(result.errors);
      if (result?.supportRequestId) {
        request.log.info(
          { supportRequestId: result.supportRequestId, scholarId: request.user!.uid },
          'Created or linked morning check-in support request',
        );
      }
      return reply.status(result.created ? 201 : 200).send(result.data);
    },
  );

  app.get('/check-ins/history', { preHandler: requireScholarAccess }, async (request) => {
    const query = checkInHistoryQuerySchema.parse(request.query);
    return (learning as any).getCheckInHistory(request.user!.uid, query);
  });

  app.get('/check-ins/evening/summary', { preHandler: requireScholarAccess }, async (request) => ({
    data: await (learning as any).getEveningCheckInSummary(request.user!.uid),
  }));

  app.post('/check-ins/evening', { preHandler: requireScholarAccess }, async (request, reply) => {
    const input = eveningCheckInSchema.parse(request.body);
    const result = await (learning as any).saveEveningCheckIn(request.user!.uid, input);
    if (result?.status === 'not_found') throw new NotFoundError('Current challenge day not found');
    if (result?.status === 'validation_error') throw new ValidationAppError(result.errors);
    if (result?.status === 'conflict')
      throw new ConflictError('Evening check-in already completed');
    return reply.status(result.created ? 201 : 200).send(result.data);
  });

  app.get('/challenges/:slugOrId', async (request) => {
    const { slugOrId } = request.params as { slugOrId: string };
    const challenge = await learning.getChallenge(slugOrId);
    if (!challenge) throw new NotFoundError('Challenge not found');
    return { data: challenge };
  });

  app.get('/challenges/:slugOrId/days', async (request) => {
    const { slugOrId } = request.params as { slugOrId: string };
    const challenge = await learning.getChallenge(slugOrId);
    if (!challenge) throw new NotFoundError('Challenge not found');
    return { data: await learning.getChallengeDays(challenge.id) };
  });

  app.get('/resources', async () => ({ data: await learning.listResources() }));

  app.get('/teams', async () => ({ data: await learning.listTeams() }));

  app.get('/mentor/teams', async () => ({ data: await learning.listTeams() }));

  app.get('/mentor/support-requests', async () => ({
    data: 'listSupportRequests' in learning ? await (learning as any).listSupportRequests() : [],
  }));

  app.get(
    '/learning-packs',
    { preHandler: authService ? requireScholarAccess : undefined },
    async (request) => learning.listLearningPacks(request.user?.uid, request.query as any),
  );

  app.get(
    '/learning-packs/:packId',
    { preHandler: authService ? requireScholarAccess : undefined },
    async (request) => {
      const { packId } = request.params as { packId: string };
      const detail = await learning.getLearningPackDetail(request.user?.uid, packId);
      if (detail === 'forbidden') throw new ForbiddenError('Learning pack is not visible');
      if (!detail) throw new NotFoundError('Learning pack not found');
      return detail;
    },
  );

  app.get('/rewards', async () => ({ data: await learning.listRewards() }));

  app.get('/certificates', async () => ({ data: await learning.listCertificates() }));

  app.get('/raffle-entries', async () => ({ data: await learning.listRaffleEntries() }));

  const getScholarDashboard = async (request: any) => ({
    data: await (learning as any).getScholarDashboard(request.user.uid),
  });
  const getLegacyDashboard = async () => ({ data: await learning.getDashboard() });

  app.get('/dashboard', { preHandler: requireScholarAccess }, getScholarDashboard);

  app.get('/mentor/dashboard', getLegacyDashboard);

  app.get('/review/dashboard', getLegacyDashboard);

  app.get('/review/scenarios', async () => ({
    data: await learning.listReviewScenarios(),
  }));

  app.get('/review/ai-drafts', async () => ({
    data: 'listAiDrafts' in learning ? await (learning as any).listAiDrafts() : [],
  }));

  app.get('/review/history', async () => ({
    data: 'listReviewHistory' in learning ? await (learning as any).listReviewHistory() : [],
  }));

  app.get('/review/content', async () => ({ data: await learning.listReviewContent() }));

  app.get('/review/questions', async () => ({ data: await learning.listReviewQuestions() }));

  app.get('/admin/dashboard', getLegacyDashboard);

  app.get('/admin/challenges', async () => ({ data: await learning.listChallenges() }));

  app.get('/admin/cohorts', async () => ({ data: await learning.listTeams() }));

  app.get('/admin/learning-packs', async () => ({ data: await learning.listLearningPacks() }));

  app.get('/admin/content-review', async () => ({ data: await learning.listReviewContent() }));

  app.get('/admin/reports', async () => ({ data: await learning.getDashboard() }));

  app.get('/admin/audit', async () => ({
    data: 'listReviewHistory' in learning ? await (learning as any).listReviewHistory() : [],
  }));

  app.get('/admin/users', async () => ({ data: users?.list ? await users.list() : [] }));

  app.get(
    '/admin/system-settings',
    { preHandler: requireAdminPermission('admin.system.read') },
    async () => ({
      data: (learning as any).getSanitizedSystemSettings
        ? await (learning as any).getSanitizedSystemSettings()
        : await (learning as any).getSystemSettings(),
    }),
  );

  app.get('/readiness', async () => ({ data: await learning.getReadiness() }));

  app.get('/readiness/prompts', async () => ({ data: await learning.listReadinessPrompts() }));

  app.post(
    '/capsules/:capsuleId/start',
    { preHandler: authService ? requireScholarAccess : undefined },
    async (request, reply) => {
      const { capsuleId } = request.params as { capsuleId: string };
      const idempotencyKey = request.headers['idempotency-key'];
      const normalizedKey = Array.isArray(idempotencyKey) ? idempotencyKey[0] : idempotencyKey;
      if (!normalizedKey || !String(normalizedKey).trim()) {
        throw new ValidationAppError({ idempotencyKey: ['Idempotency-Key header is required'] });
      }
      const result = await learning.startCapsuleAttempt(
        request.user?.uid,
        capsuleId,
        String(normalizedKey),
      );
      if (result === 'forbidden') throw new ForbiddenError('Capsule is not visible');
      if (!result) throw new NotFoundError('Capsule not found');
      if ('activeAttemptId' in result) {
        return reply.status(409).send({
          message: 'You already have an active attempt.',
          capsuleAttemptId: result.activeAttemptId,
          activeAttemptId: result.activeAttemptId,
        });
      }
      return reply.status(result.created ? 201 : 200).send({ data: result.response });
    },
  );

  app.get(
    '/capsule-attempts/:capsuleAttemptId/resume',
    { preHandler: authService ? requireScholarAccess : undefined },
    async (request) => {
      const { capsuleAttemptId } = request.params as { capsuleAttemptId: string };
      const resume = await learning.resumeCapsuleAttempt(capsuleAttemptId, request.user?.uid);
      if (!resume) throw new NotFoundError('Capsule attempt not found');
      if (resume === 'closed') throw new ConflictError('Capsule attempt is closed');
      return resume;
    },
  );

  app.post(
    '/capsule-attempts/:capsuleAttemptId/question-attempts/:questionAttemptId/submit',
    { preHandler: authService ? requireScholarAccess : undefined },
    async (request) => {
      const { capsuleAttemptId, questionAttemptId } = request.params as {
        capsuleAttemptId: string;
        questionAttemptId: string;
      };
      const result = await learning.submitQuestionAttempt(
        capsuleAttemptId,
        questionAttemptId,
        request.body as any,
        request.user?.uid,
      );
      if (!result) throw new NotFoundError('Question attempt not found');
      if (result === 'closed' || result === 'conflict' || result === 'duplicate')
        throw new ConflictError('Question attempt cannot be submitted');
      if (result === 'invalid_choice') {
        throw new ValidationAppError({
          choiceId: ['Choice does not belong to this question attempt'],
          choiceIds: ['One or more choices do not belong to this question attempt'],
        });
      }
      if (result === 'missing_answer') {
        throw new ValidationAppError({ answer: ['At least one answer is required'] });
      }
      if (result === 'invalid_selection_count') {
        throw new ValidationAppError({
          choiceIds: ['Selection count is outside the allowed range'],
        });
      }
      if (result === 'invalid_numeric') {
        throw new ValidationAppError({ numericAnswer: ['Numeric answer must be a finite number'] });
      }
      return result;
    },
  );

  app.post(
    '/question-attempts/:attemptId/acknowledge-memory',
    { preHandler: authService ? requireScholarAccess : undefined },
    async (request) => {
      const { attemptId } = request.params as { attemptId: string };
      const result = await learning.acknowledgeMemory(attemptId, request.user?.uid);
      if (!result) throw new NotFoundError('Question attempt not found');
      if (result === 'conflict') {
        throw new ConflictError('Memory cannot be acknowledged before submission');
      }
      return result;
    },
  );

  app.post(
    '/capsule-attempts/:capsuleAttemptId/next',
    { preHandler: authService ? requireScholarAccess : undefined },
    async (request) => {
      const { capsuleAttemptId } = request.params as { capsuleAttemptId: string };
      const result = await (learning as any).advanceCapsuleAttempt(
        capsuleAttemptId,
        request.user?.uid,
      );
      if (!result) throw new NotFoundError('Capsule attempt not found');
      if (result === 'closed' || result === 'conflict')
        throw new ConflictError('Capsule attempt cannot advance');
      return result;
    },
  );

  app.post(
    '/admin/content/import-learning-pack',
    { preHandler: requireAdminOrReviewer },
    async (request) => ({
      data: await learning.importLearningPack(request.body as any, request.user?.uid ?? 'unknown'),
    }),
  );
}
