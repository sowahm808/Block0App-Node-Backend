import type { FastifyInstance } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { authenticate } from '../common/auth-middleware.js';
import { ForbiddenError } from '../common/errors.js';
import type { AuthService } from '../auth/auth.service.js';
import { examReminderSchema } from './notifications.schemas.js';
import type { NotificationsRepository } from './notifications.repository.js';

type NotificationsRoutesOptions = {
  notifications: NotificationsRepository;
  authService?: AuthService;
};

export async function notificationsRoutes(app: FastifyInstance, opts: NotificationsRoutesOptions) {
  if (!opts.authService) throw new ForbiddenError('Authentication is not configured');
  const auth = authenticate(opts.authService);

  app.get('/', { preHandler: auth }, async (request) => ({
    data: {
      examReminder: await opts.notifications.getExamReminder(request.user!.uid),
    },
  }));

  app.post(
    '/exam-reminders/me',
    { preHandler: auth, schema: { body: zodToJsonSchema(examReminderSchema) } },
    async (request, reply) => {
      const data = await opts.notifications.saveExamReminder(
        request.user!.uid,
        examReminderSchema.parse(request.body),
      );
      return reply.status(201).send({ data });
    },
  );

  app.get('/exam-reminders/me', { preHandler: auth }, async (request) => ({
    data: await opts.notifications.getExamReminder(request.user!.uid),
  }));
}
