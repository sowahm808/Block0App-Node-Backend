import type { FastifyInstance, FastifyRequest } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { AuthService } from '../auth/auth.service.js';
import { authenticate } from '../common/auth-middleware.js';
import { requirePermission } from '../common/authorization.js';
import { UnprocessableEntityError } from '../common/errors.js';
import type { CohortsRepository } from './cohorts.repository.js';
import {
  createCohortSchema,
  duplicateSchema,
  listCohortsSchema,
  statusSchema,
  updateCohortSchema,
} from './cohorts.schemas.js';

type Options = { cohorts: CohortsRepository; authService: AuthService };
const secured = (auth: AuthService, permission: string) => [
  authenticate(auth),
  requirePermission(permission),
];
const versionFrom = (request: FastifyRequest, bodyVersion?: number) => {
  const raw = request.headers['if-match'];
  if (bodyVersion !== undefined) return bodyVersion;
  if (typeof raw === 'string') {
    const value = Number(raw.replace(/^W\//, '').replaceAll('"', ''));
    if (Number.isInteger(value) && value > 0) return value;
  }
  throw new UnprocessableEntityError('A positive version or If-Match header is required');
};

export async function cohortRoutes(app: FastifyInstance, { cohorts, authService }: Options) {
  app.get(
    '/admin/cohorts',
    {
      preHandler: secured(authService, 'cohorts.read'),
      schema: { querystring: zodToJsonSchema(listCohortsSchema) },
    },
    async (request) => cohorts.list(listCohortsSchema.parse(request.query)),
  );
  app.post(
    '/admin/cohorts',
    {
      preHandler: secured(authService, 'cohorts.create'),
      schema: { body: zodToJsonSchema(createCohortSchema) },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(await cohorts.create(createCohortSchema.parse(request.body), request.user!.uid)),
  );
  app.put(
    '/admin/cohorts/:id',
    {
      preHandler: secured(authService, 'cohorts.update'),
      schema: { body: zodToJsonSchema(updateCohortSchema) },
    },
    async (request) => {
      const body = updateCohortSchema.parse(request.body);
      const { version: supplied, ...patch } = body;
      return cohorts.update(
        (request.params as any).id,
        patch,
        versionFrom(request, supplied),
        request.user!.uid,
      );
    },
  );
  app.post(
    '/admin/cohorts/:id/status',
    {
      preHandler: async (request) => {
        await authenticate(authService)(request);
        const body = statusSchema.parse(request.body);
        const permission =
          body.status === 'archived'
            ? 'cohorts.archive'
            : body.status === 'enrollment_open' || body.status === 'closed'
              ? 'cohorts.enrollment.manage'
              : 'cohorts.update';
        await requirePermission(permission)(request);
      },
      schema: { body: zodToJsonSchema(statusSchema) },
    },
    async (request) => {
      const body = statusSchema.parse(request.body);
      return cohorts.setStatus(
        (request.params as any).id,
        body.status,
        body.version,
        request.user!.uid,
      );
    },
  );
  app.post(
    '/admin/cohorts/:id/duplicate',
    {
      preHandler: secured(authService, 'cohorts.create'),
      schema: { body: zodToJsonSchema(duplicateSchema) },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await cohorts.duplicate(
            (request.params as any).id,
            duplicateSchema.parse(request.body),
            request.user!.uid,
          ),
        ),
  );
}
