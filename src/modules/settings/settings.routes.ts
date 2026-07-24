import type { FastifyInstance } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { authenticate } from '../common/auth-middleware.js';
import { ForbiddenError, NotFoundError } from '../common/errors.js';
import type { AuthService } from '../auth/auth.service.js';
import type { SettingsService } from './settings.service.js';
import { accountSupportRequestSchema, settingsUpdateSchema } from './settings.schemas.js';

type SettingsRoutesOptions = { authService?: AuthService; settings: SettingsService };

export async function settingsRoutes(app: FastifyInstance, opts: SettingsRoutesOptions) {
  if (!opts.authService) throw new ForbiddenError('Authentication is not configured');
  const auth = authenticate(opts.authService);

  app.get('/', { preHandler: auth }, async (request) =>
    opts.settings.getSettings(request.user!.uid),
  );

  app.put(
    '/',
    { preHandler: auth, schema: { body: zodToJsonSchema(settingsUpdateSchema) } },
    async (request) =>
      opts.settings.updateSettings(request.user!.uid, settingsUpdateSchema.parse(request.body)),
  );

  app.get('/data-use-summary', { preHandler: auth }, async () => opts.settings.getDataUseSummary());

  app.post('/data-export-requests', { preHandler: auth }, async () => {
    throw new NotFoundError('Data export requests are not currently supported.');
  });

  app.post(
    '/account-support-requests',
    { preHandler: auth, schema: { body: zodToJsonSchema(accountSupportRequestSchema) } },
    async (request, reply) => {
      const result = await opts.settings.createAccountSupportRequest(
        request.user!.uid,
        accountSupportRequestSchema.parse(request.body),
      );
      return reply.status(201).send(result);
    },
  );
}
