import type { FastifyInstance } from 'fastify';
import { NotFoundError, ForbiddenError } from '../common/errors.js';
import { authenticate } from '../common/auth-middleware.js';
import type { AuthService } from '../auth/auth.service.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { LearningRepository } from './learning.repository.js';
import { checkInSchema } from './check-ins.schemas.js';

type LearningRoutesOptions = { learning: LearningRepository; authService?: AuthService };

export async function learningRoutes(app: FastifyInstance, opts: LearningRoutesOptions) {
  const { learning, authService } = opts;
  const requireAuth = async (request: any) => {
    if (!authService) throw new ForbiddenError('Authentication is not configured');
    await authenticate(authService)(request);
  };

  const requireAdminOrReviewer = async (request: any) => {
    await requireAuth(request);
    const permissions = request.user?.permissions ?? [];
    const role = request.user?.role;
    if (
      ![role, ...permissions].some((value) =>
        ['admin', 'content-review', 'admin:content', 'content:review'].includes(value),
      )
    ) {
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

  app.get('/learning-packs', async () => ({ data: await learning.listLearningPacks() }));

  const getDashboard = async () => ({ data: await learning.getDashboard() });

  app.get('/dashboard', getDashboard);

  app.get('/mentor/dashboard', getDashboard);

  app.get('/review/dashboard', getDashboard);

  app.get('/admin/dashboard', getDashboard);

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
