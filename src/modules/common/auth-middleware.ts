import type { FastifyRequest } from 'fastify';
import { UnauthorizedError } from './errors.js';
import type { AuthService } from '../auth/auth.service.js';
export const authenticate = (authService: AuthService) => async (req: FastifyRequest) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) throw new UnauthorizedError();
  req.user = await authService.verifyAccessToken(h.slice(7)).catch(() => {
    throw new UnauthorizedError();
  });
};
