import type { FastifyInstance } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { authenticate } from '../common/auth-middleware.js';
import { authRateLimit } from '../common/rate-limit.js';
import {
  registerSchema,
  verifyEmailSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  revokeSchema,
} from './auth.schemas.js';
import type { AuthService } from './auth.service.js';
import type { AuthRepository } from './auth.repository.js';

export async function authRoutes(
  app: FastifyInstance,
  deps: { authService: AuthService; sessions: AuthRepository },
) {
  const auth = authenticate(deps.authService);
  app.post(
    '/register',
    { ...authRateLimit, schema: { body: zodToJsonSchema(registerSchema) } },
    async (req, reply) =>
      reply.status(201).send(await deps.authService.register(registerSchema.parse(req.body))),
  );
  app.post(
    '/verify-email',
    { schema: { body: zodToJsonSchema(verifyEmailSchema) } },
    async (req, reply) => {
      const b = verifyEmailSchema.parse(req.body);
      await deps.authService.verifyEmail(b.email, b.token);
      return reply.status(204).send();
    },
  );
  app.post(
    '/login',
    { ...authRateLimit, schema: { body: zodToJsonSchema(loginSchema) } },
    async (req) => deps.authService.login(loginSchema.parse(req.body)),
  );
  app.post('/refresh', { schema: { body: zodToJsonSchema(refreshSchema) } }, async (req) =>
    deps.authService.refresh(refreshSchema.parse(req.body).refreshToken),
  );
  app.post(
    '/forgot-password',
    { ...authRateLimit, schema: { body: zodToJsonSchema(forgotPasswordSchema) } },
    async (req) => deps.authService.forgotPassword(forgotPasswordSchema.parse(req.body).email),
  );
  app.post(
    '/reset-password',
    { schema: { body: zodToJsonSchema(resetPasswordSchema) } },
    async () => ({
      message:
        'Firebase password reset links complete the reset flow through Firebase Authentication action handlers.',
    }),
  );
  app.post('/sync', { preHandler: auth }, async (req) => req.user);
  app.post('/logout', { preHandler: auth }, async (req) => ({
    revoked: await deps.sessions.revokeActiveForUser(req.user!.uid, 'logout'),
  }));
  app.post(
    '/revoke',
    { preHandler: auth, schema: { body: zodToJsonSchema(revokeSchema) } },
    async (req, reply) => {
      const b = revokeSchema.parse(req.body);
      await deps.sessions.revokeToken(b.refreshToken, b.reason);
      return reply.status(204).send();
    },
  );
  app.get('/me', { preHandler: auth }, async (req) => req.user);
}
