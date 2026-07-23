import type { FastifyInstance } from 'fastify';
import { NotFoundError, ForbiddenError } from '../common/errors.js';
import { authenticate } from '../common/auth-middleware.js';
import type { AuthService } from '../auth/auth.service.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { LearningRepository } from './learning.repository.js';
import { checkInSchema } from './check-ins.schemas.js';

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

  const listPublishedChallenges = async () => ({ data: await learning.listChallenges() });

  app.get('/challenges', listPublishedChallenges);

  app.get('/scenarios', listPublishedChallenges);

  app.get('/scenarios/available', listPublishedChallenges);

  app.get('/challenges/current/today', async () => {
    const current = await learning.getCurrentChallengeToday();
    if (!current) throw new NotFoundError('Current challenge day not found');
    return { data: current };
  });

  app.post(
    '/check-ins',
    { preHandler: requireAuth, schema: { body: zodToJsonSchema(checkInSchema) } },
    async (request, reply) => {
      const data = await learning.saveCheckIn(request.user!.uid, checkInSchema.parse(request.body));
      return reply.status(201).send({ data });
    },
  );

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

  app.get('/learning-packs', async () => ({ data: await learning.listLearningPacks() }));

  app.get('/rewards', async () => ({ data: await learning.listRewards() }));

  app.get('/certificates', async () => ({ data: await learning.listCertificates() }));

  app.get('/raffle-entries', async () => ({ data: await learning.listRaffleEntries() }));

  const getDashboard = async () => ({ data: await learning.getDashboard() });

  app.get('/dashboard', getDashboard);

  app.get('/mentor/dashboard', getDashboard);

  app.get('/review/dashboard', getDashboard);

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

  app.get('/admin/dashboard', getDashboard);

  app.get('/admin/challenges', async () => ({ data: await learning.listChallenges() }));

  app.get('/admin/cohorts', async () => ({ data: await learning.listTeams() }));

  app.get('/admin/learning-packs', async () => ({ data: await learning.listLearningPacks() }));

  app.get('/admin/content-review', async () => ({ data: await learning.listReviewContent() }));

  app.get('/admin/reports', async () => ({ data: await learning.getDashboard() }));

  app.get('/admin/audit', async () => ({
    data: 'listReviewHistory' in learning ? await (learning as any).listReviewHistory() : [],
  }));

  app.get('/admin/users', async () => ({ data: users?.list ? await users.list() : [] }));

  app.get('/admin/system-settings', async () => ({ data: await learning.getSystemSettings() }));

  app.get('/readiness', async () => ({ data: await learning.getReadiness() }));

  app.get('/readiness/prompts', async () => ({ data: await learning.listReadinessPrompts() }));

  app.get('/capsule-attempts/:capsuleAttemptId/resume', async (request) => {
    const { capsuleAttemptId } = request.params as { capsuleAttemptId: string };
    const resume = await learning.resumeCapsuleAttempt(capsuleAttemptId);
    if (!resume) throw new NotFoundError('Capsule attempt not found');
    return { data: resume };
  });

  app.post(
    '/capsule-attempts/:capsuleAttemptId/question-attempts/:questionAttemptId/submit',
    async (request) => {
      const { capsuleAttemptId, questionAttemptId } = request.params as {
        capsuleAttemptId: string;
        questionAttemptId: string;
      };
      const result = await learning.submitQuestionAttempt(
        capsuleAttemptId,
        questionAttemptId,
        request.body as any,
      );
      if (!result) throw new NotFoundError('Question attempt not found');
      return { data: result };
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
