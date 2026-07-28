import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../common/auth-middleware.js';
import { requirePermission } from '../common/authorization.js';
import type { AuthService } from '../auth/auth.service.js';
import type { UsersRepository } from '../users/users.repository.js';
import {
  audioCompleteSchema,
  audioSchema,
  contentSchema,
  generateSchema,
} from './whispers.schemas.js';
import type { WhispersService } from './whispers.service.js';

const idParams = z.object({ id: z.string().uuid() });
const tokenParams = z.object({ token: z.string().min(32).max(100) });
export async function whisperRoutes(
  app: FastifyInstance,
  opts: { whispers: WhispersService; authService: AuthService; users?: UsersRepository },
) {
  const auth = authenticate(opts.authService);
  const create = [auth, requirePermission('whispers.create')];
  const read = [auth, requirePermission('whispers.read_own')];
  app.post('/whispers/generate', { preHandler: create }, async (req, reply) => {
    const input = generateSchema.parse(req.body);
    const internal =
      input.recipientType === 'internal'
        ? await opts.users?.get(input.recipientMuaUserId!)
        : undefined;
    return reply.status(201).send(await opts.whispers.generate(req.user!.uid, input, internal));
  });
  app.get('/whispers', { preHandler: read }, (req) => opts.whispers.list(req.user!.uid));
  app.get('/whispers/:id', { preHandler: read }, (req) =>
    opts.whispers.get(req.user!.uid, idParams.parse(req.params).id),
  );
  app.patch('/whispers/:id/content', { preHandler: create }, (req) =>
    opts.whispers.content(
      req.user!.uid,
      idParams.parse(req.params).id,
      contentSchema.parse(req.body),
    ),
  );
  app.post('/whispers/:id/regenerate', { preHandler: create }, (req) =>
    opts.whispers.regenerate(req.user!.uid, idParams.parse(req.params).id),
  );
  app.post('/whispers/:id/confirm', { preHandler: create }, (req) =>
    opts.whispers.confirm(req.user!.uid, idParams.parse(req.params).id),
  );
  app.post('/whispers/:id/audio-upload-url', { preHandler: create }, (req) =>
    opts.whispers.audioUpload(
      req.user!.uid,
      idParams.parse(req.params).id,
      audioSchema.parse(req.body),
    ),
  );
  app.post('/whispers/:id/audio-upload-complete', { preHandler: create }, (req) =>
    opts.whispers.audioComplete(
      req.user!.uid,
      idParams.parse(req.params).id,
      audioCompleteSchema.parse(req.body),
    ),
  );
  app.post('/whispers/:id/send-consent', { preHandler: create }, (req) =>
    opts.whispers.send(req.user!.uid, idParams.parse(req.params).id),
  );
}
export async function publicWhisperRoutes(
  app: FastifyInstance,
  opts: { whispers: WhispersService },
) {
  const publicRoute = { config: { logLevel: 'silent' as const } };
  app.addHook('onSend', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer');
  });
  app.get('/whispers/unwrap/:token', publicRoute, (req) =>
    opts.whispers.unwrap(tokenParams.parse(req.params).token),
  );
  app.post('/whispers/unwrap/:token/accept', publicRoute, (req) =>
    opts.whispers.unwrap(tokenParams.parse(req.params).token, 'accept'),
  );
  app.post('/whispers/unwrap/:token/listened', publicRoute, (req) =>
    opts.whispers.unwrap(tokenParams.parse(req.params).token, 'listened'),
  );
}
