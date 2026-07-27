import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { AuthService } from '../auth/auth.service.js';
import { authenticate } from '../common/auth-middleware.js';
import { requirePermission } from '../common/authorization.js';
import { AppError } from '../common/errors.js';
import type { MentorTeamsRepository } from './mentor-teams.repository.js';
import { listMentorTeamsSchema, mentorTeamParamsSchema } from './mentor-teams.schemas.js';

type Options = { mentorTeams: MentorTeamsRepository; authService: AuthService };

const errorCode = (error: Error) => {
  if (error instanceof ZodError)
    return ['VALIDATION_ERROR', 400, 'Check the request parameters and try again.'] as const;
  if (error instanceof AppError && error.status === 401)
    return ['UNAUTHENTICATED', 401, 'Sign in to view mentor teams.'] as const;
  if (error instanceof AppError && error.status === 403)
    return ['FORBIDDEN', 403, 'You do not have permission to view mentor teams.'] as const;
  if (error instanceof AppError && error.status === 404)
    return ['TEAM_NOT_FOUND', 404, 'The requested team was not found.'] as const;
  return ['MENTOR_TEAMS_UNAVAILABLE', 503, 'Mentor teams could not be loaded.'] as const;
};

export async function mentorTeamRoutes(app: FastifyInstance, options: Options) {
  app.setErrorHandler(async (error: FastifyError, request, reply) => {
    const [code, status, message] = errorCode(error);
    request.log[status >= 500 ? 'error' : 'warn']({ err: error, requestId: request.id }, message);
    await reply
      .header('cache-control', 'no-store')
      .status(status)
      .send({ error: { code, message, requestId: request.id } });
  });

  const secured = [authenticate(options.authService), requirePermission('mentor.teams.read')];
  app.get('/mentor/teams', { preHandler: secured }, async (request, reply) => {
    const input = listMentorTeamsSchema.parse(request.query);
    return reply
      .header('cache-control', 'no-store')
      .send(await options.mentorTeams.list(request.user!, input));
  });
  app.get('/mentor/teams/:teamId', { preHandler: secured }, async (request, reply) => {
    const { teamId } = mentorTeamParamsSchema.parse(request.params);
    const team = await options.mentorTeams.detail(request.user!, teamId);
    if (!team) {
      const error = new AppError(404, 'Team not found', 'The requested team was not found.');
      throw error;
    }
    return reply.header('cache-control', 'no-store').send(team);
  });
}
