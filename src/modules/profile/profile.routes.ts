import type { FastifyInstance, FastifyRequest } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { authenticate } from '../common/auth-middleware.js';
import { ValidationAppError } from '../common/errors.js';
import type { AuthService } from '../auth/auth.service.js';
import type { ProfileService } from './profile.service.js';
import { profileUpdateSchema } from './profile.schemas.js';

type ProfileRoutesOptions = { authService: AuthService; profile: ProfileService };

function parseMultipartImage(request: FastifyRequest) {
  const contentType = request.headers['content-type'] ?? '';
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
  if (!boundary || !Buffer.isBuffer(request.body)) {
    throw new ValidationAppError({ image: ['A multipart/form-data image field is required.'] });
  }
  const marker = `--${boundary}`;
  for (const part of (request.body as Buffer).toString('binary').split(marker)) {
    if (!part.includes('name="image"')) continue;
    const separator = part.indexOf('\r\n\r\n');
    if (separator === -1) break;
    const rawHeaders = part.slice(0, separator);
    const content = part
      .slice(separator + 4)
      .replace(/\r\n--$/, '')
      .replace(/\r\n$/, '');
    const mimeType = /Content-Type:\s*([^\r\n]+)/i.exec(rawHeaders)?.[1]?.trim() ?? '';
    const filename = /filename="([^"]*)"/i.exec(rawHeaders)?.[1];
    return { buffer: Buffer.from(content, 'binary'), mimeType, filename };
  }
  throw new ValidationAppError({ image: ['A multipart/form-data image field is required.'] });
}

export async function profileRoutes(app: FastifyInstance, opts: ProfileRoutesOptions) {
  const auth = authenticate(opts.authService);
  app.addContentTypeParser('multipart/form-data', { parseAs: 'buffer' }, (_request, body, done) =>
    done(null, body),
  );
  app.get('/', { preHandler: auth }, async (request) =>
    (opts.profile.getProfile as any)(request.user!.uid, request.user),
  );
  app.put(
    '/',
    { preHandler: auth, schema: { body: zodToJsonSchema(profileUpdateSchema) } },
    async (request) =>
      opts.profile.updateProfile(request.user!.uid, profileUpdateSchema.parse(request.body)),
  );
  app.post('/image', { preHandler: auth }, async (request) =>
    opts.profile.updateImage(request.user!.uid, parseMultipartImage(request)),
  );
}
