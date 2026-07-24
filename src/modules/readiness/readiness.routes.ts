import type { FastifyInstance } from 'fastify';
import { authenticate } from '../common/auth-middleware.js';
import { requirePermission } from '../common/authorization.js';
import type { AuthService } from '../auth/auth.service.js';
import type { ReadinessService } from './readiness.service.js';
export async function readinessRoutes(
  app: FastifyInstance,
  deps: { readiness: ReadinessService; authService: AuthService },
) {
  app.get(
    '/current',
    { preHandler: [authenticate(deps.authService), requirePermission('scholar:access')] },
    async (req, reply) => {
      const readiness = await deps.readiness.current(req.user!.uid);
      if (!readiness) return reply.status(204).send();
      return readiness;
    },
  );
}
