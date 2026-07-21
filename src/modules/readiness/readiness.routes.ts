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
    async (req) => deps.readiness.current(req.user!.uid),
  );
}
