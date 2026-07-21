import type { FastifyInstance } from 'fastify';
import { NotFoundError } from '../common/errors.js';
import type { LearningRepository } from './learning.repository.js';

type LearningRoutesOptions = { learning: LearningRepository };

export async function learningRoutes(app: FastifyInstance, opts: LearningRoutesOptions) {
  const { learning } = opts;

  app.get('/challenges', async () => ({ data: await learning.listChallenges() }));

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

  app.get('/dashboard', async () => ({ data: await learning.getDashboard() }));

  app.get('/readiness', async () => ({ data: await learning.getReadiness() }));

  app.get('/readiness/prompts', async () => ({ data: await learning.listReadinessPrompts() }));
}
