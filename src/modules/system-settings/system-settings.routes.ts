import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuthService } from '../auth/auth.service.js';
import { authenticate } from '../common/auth-middleware.js';
import { ForbiddenError, UnprocessableEntityError } from '../common/errors.js';
import {
  historyQuerySchema,
  resetSettingsSchema,
  updateSettingsSchema,
  validateSettingsSchema,
} from './system-settings.schemas.js';
import type { SystemSettingsService } from './system-settings.service.js';

type Options = { authService?: AuthService; systemSettings: SystemSettingsService };
export async function systemSettingsRoutes(
  app: FastifyInstance,
  { authService, systemSettings }: Options,
) {
  const permission =
    (required: string, audit = false) =>
    async (request: FastifyRequest) => {
      if (!authService) throw new ForbiddenError('Authentication is not configured');
      await authenticate(authService)(request);
      const permissions = request.user?.permissions ?? [];
      if (
        !permissions.includes('*') &&
        (!permissions.includes(required) ||
          (audit &&
            !permissions.some((p: string) => ['audit.read', 'admin.audit.read'].includes(p))))
      )
        throw new ForbiddenError(`Missing permission: ${required}`);
    };
  const actor = (request: FastifyRequest) => ({
    uid: request.user!.uid,
    email: request.user?.email,
  });
  const parse = <T>(schema: { safeParse(value: unknown): any }, value: unknown): T => {
    const result = schema.safeParse(value);
    if (!result.success)
      throw new UnprocessableEntityError(
        'System settings validation failed.',
        Object.fromEntries(
          result.error.issues.map((issue: any) => [
            `settings.${issue.path.join('.')}`,
            [issue.message],
          ]),
        ),
      );
    return result.data;
  };
  app.get(
    '/admin/system-settings',
    { preHandler: permission('system-settings.read') },
    async () => ({ data: await systemSettings.read() }),
  );
  app.post(
    '/admin/system-settings/validate',
    { preHandler: permission('system-settings.validate') },
    async (request) => {
      const body = parse<any>(validateSettingsSchema, request.body);
      return systemSettings.validate(body.settings);
    },
  );
  app.put(
    '/admin/system-settings',
    { preHandler: permission('system-settings.update') },
    async (request) => {
      const body = parse<any>(updateSettingsSchema, request.body);
      if (
        JSON.stringify(body.settings.security) &&
        !(request.user?.permissions ?? []).some(
          (p: string) => p === '*' || p === 'system-settings.security.update',
        )
      ) {
        const current = await systemSettings.read();
        if (JSON.stringify(current.security) !== JSON.stringify(body.settings.security))
          throw new ForbiddenError('Missing permission: system-settings.security.update');
      }
      return systemSettings.update(body.version, body.settings, actor(request), request.id);
    },
  );
  app.post(
    '/admin/system-settings/reset',
    { preHandler: permission('system-settings.reset') },
    async (request) => {
      const body = parse<any>(resetSettingsSchema, request.body);
      if (
        body.category === 'security' &&
        !(request.user?.permissions ?? []).some(
          (p: string) => p === '*' || p === 'system-settings.security.update',
        )
      )
        throw new ForbiddenError('Missing permission: system-settings.security.update');
      return systemSettings.reset(body.category, body.version, actor(request), request.id);
    },
  );
  app.get(
    '/admin/system-settings/history',
    { preHandler: permission('system-settings.read', true) },
    async (request) => {
      const query = parse<any>(historyQuerySchema, request.query);
      return systemSettings.history(query.limit, query.cursor);
    },
  );
}
