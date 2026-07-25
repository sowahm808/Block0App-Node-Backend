import path from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuthService } from '../auth/auth.service.js';
import { authenticate } from '../common/auth-middleware.js';
import { AppError, ForbiddenError, ValidationAppError } from '../common/errors.js';
import type { LearningPackImportPayload } from './content-import.js';
import type { LearningPackImportService } from './import-workflow.js';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const types: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const safeName = (name: string) =>
  path
    .basename(name)
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 180);
function multipartFile(body: Buffer, contentType: string) {
  const boundary = contentType
    .match(/boundary=(?:"([^"]+)"|([^;]+))/i)
    ?.slice(1)
    .find(Boolean);
  if (!boundary) throw new ValidationAppError(['Multipart boundary is missing']);
  const parts = body
    .toString('latin1')
    .split(`--${boundary}`)
    .filter((part) => /Content-Disposition:/i.test(part));
  const files = parts.filter((part) => /name="file"/i.test(part) && /filename="/i.test(part));
  if (
    files.length !== 1 ||
    parts.some((part) => /filename="/i.test(part) && !/name="file"/i.test(part))
  )
    throw new ValidationAppError(['Exactly one file field named "file" is required']);
  const part = files[0],
    split = part.indexOf('\r\n\r\n');
  if (split < 0) throw new ValidationAppError(['Malformed multipart upload']);
  const headers = part.slice(0, split),
    filename = headers.match(/filename="([^"]*)"/i)?.[1] ?? '',
    mimeType = headers.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.trim() ?? '';
  let data = Buffer.from(part.slice(split + 4), 'latin1');
  if (data.subarray(-2).toString() === '\r\n') data = data.subarray(0, -2);
  return { filename: safeName(filename), mimeType, buffer: data };
}
function validateFile(file: { filename: string; mimeType: string; buffer: Buffer }) {
  if (!file.filename || file.buffer.length === 0)
    throw new ValidationAppError(['Uploaded file must be non-empty']);
  if (file.buffer.length > MAX_FILE_SIZE)
    throw new AppError(413, 'Payload Too Large', 'File exceeds the 20 MB limit', 'file_too_large');
  const expected = types[path.extname(file.filename).toLowerCase()];
  if (!expected || expected !== file.mimeType)
    throw new AppError(
      415,
      'Unsupported Media Type',
      'Only PDF and DOCX files are supported and extension must match MIME type',
      'unsupported_media_type',
    );
  if (
    file.mimeType === 'application/pdf' &&
    !file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))
  )
    throw new AppError(
      415,
      'Unsupported Media Type',
      'Invalid PDF signature',
      'unsupported_media_type',
    );
  if (
    file.mimeType.includes('wordprocessingml') &&
    !file.buffer.subarray(0, 2).equals(Buffer.from('PK'))
  )
    throw new AppError(
      415,
      'Unsupported Media Type',
      'Invalid DOCX signature',
      'unsupported_media_type',
    );
}
export async function learningPackImportRoutes(
  app: FastifyInstance,
  opts: { imports: LearningPackImportService; authService: AuthService },
) {
  app.addContentTypeParser(
    /^multipart\/form-data/i,
    { parseAs: 'buffer', bodyLimit: MAX_FILE_SIZE + 1024 * 1024 },
    (_request, body, done) => done(null, body),
  );
  const permission = (required: string) => async (request: FastifyRequest) => {
    await authenticate(opts.authService)(request);
    const permissions = request.user?.permissions ?? [];
    if (!permissions.includes('*') && !permissions.includes(required))
      throw new ForbiddenError(`Missing permission: ${required}`);
  };
  const importAuth = permission('learning_packs.import'),
    commitAuth = async (request: FastifyRequest) => {
      await importAuth(request);
      const permissions = request.user?.permissions ?? [];
      if (
        !permissions.includes('*') &&
        !permissions.includes('learning_packs.create') &&
        !permissions.includes('admin:content')
      )
        throw new ForbiddenError('Missing permission: learning_packs.create');
    };
  const tenant = (request: FastifyRequest) =>
    request.user?.tenantId ?? request.user?.organizationId;
  const importId = (request: FastifyRequest) => {
    let value: string;
    try {
      value = decodeURIComponent((request.params as { importId: string }).importId);
    } catch {
      throw new AppError(404, 'Not Found', 'Learning-pack import not found', 'not_found');
    }
    if (!/^imp_[a-zA-Z0-9]{16,80}$/.test(value))
      throw new AppError(404, 'Not Found', 'Learning-pack import not found', 'not_found');
    return value;
  };
  app.post(
    '/admin/learning-packs/imports',
    {
      preHandler: importAuth,
      schema: {
        description: 'Upload one PDF or DOCX learning pack (maximum 20 MB).',
        consumes: ['multipart/form-data'],
        security: [{ bearerAuth: [] }],
        response: {
          201: {
            type: 'object',
            properties: {
              importId: { type: 'string' },
              status: { type: 'string' },
              draft: { type: 'object', additionalProperties: true },
              extractionWarnings: { type: 'array', items: { type: 'string' } },
              validationErrors: { type: 'array', items: { type: 'string' } },
              metadata: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const file = multipartFile(request.body as Buffer, String(request.headers['content-type']));
      validateFile(file);
      const result = await opts.imports.upload(
        file,
        request.user!.uid,
        request.id,
        tenant(request),
      );
      request.log.info(
        {
          importId: result.importId,
          userId: request.user!.uid,
          filename: file.filename,
          mimeType: file.mimeType,
          fileSize: file.buffer.length,
          validationErrorCount: result.validationErrors.length,
          traceId: request.id,
        },
        'learning pack document imported',
      );
      return reply.code(201).send(result);
    },
  );
  app.get('/admin/learning-packs/imports', { preHandler: importAuth }, (request) =>
    opts.imports.list(request.query as any, tenant(request)),
  );
  app.get('/admin/learning-packs/imports/:importId', { preHandler: importAuth }, (request) =>
    opts.imports.get(importId(request), tenant(request)),
  );
  app.put(
    '/admin/learning-packs/imports/:importId/draft',
    { preHandler: importAuth, bodyLimit: 2 * 1024 * 1024 },
    (request) =>
      opts.imports.saveDraft(
        importId(request),
        request.body as LearningPackImportPayload | { draft: LearningPackImportPayload },
        request.user!.uid,
        tenant(request),
      ),
  );
  app.post(
    '/admin/learning-packs/imports/:importId/validate',
    { preHandler: importAuth },
    (request) => opts.imports.validate(importId(request), request.user!.uid, tenant(request)),
  );
  app.post(
    '/admin/learning-packs/imports/:importId/commit',
    { preHandler: commitAuth },
    (request) => opts.imports.commit(importId(request), request.user!.uid, tenant(request)),
  );
}
