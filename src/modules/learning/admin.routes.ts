import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ForbiddenError } from '../common/errors.js';
import { authenticate } from '../common/auth-middleware.js';
import type { AuthService } from '../auth/auth.service.js';
import type { LearningRepository } from './learning.repository.js';

const adminPayloadSchema = z.record(z.unknown());
const querySchema = z.record(z.union([z.string(), z.array(z.string())])).optional();

type AdminRoutesOptions = {
  learning: LearningRepository;
  authService?: AuthService;
};

const nowUtc = () => new Date().toISOString();

export async function adminRoutes(app: FastifyInstance, opts: AdminRoutesOptions) {
  const { learning, authService } = opts;

  const requireAuth = async (request: FastifyRequest) => {
    if (!authService) throw new ForbiddenError('Authentication is not configured');
    await authenticate(authService)(request);
  };

  const requireAdminPermission = (permission: string) => async (request: FastifyRequest) => {
    await requireAuth(request);
    const permissions = request.user?.permissions ?? [];
    if (!permissions.includes('*') && !permissions.includes(permission)) {
      throw new ForbiddenError(`Missing permission: ${permission}`);
    }
  };

  const listCollection = async (collection: string, query: Record<string, unknown>) =>
    (learning as any).listAdminCollection
      ? (learning as any).listAdminCollection(collection, query)
      : { items: [], nextCursor: null };

  const saveDocument = async (
    collection: string,
    payload: Record<string, unknown>,
    actorId: string,
  ) =>
    (learning as any).saveAdminDocument
      ? (learning as any).saveAdminDocument(collection, payload, { actorId })
      : {
          id: typeof payload.id === 'string' ? payload.id : `${collection}-${Date.now()}`,
          ...payload,
          status: payload.status ?? 'draft',
          persisted: true,
          audit: { updatedBy: actorId, updatedAtUtc: nowUtc() },
        };

  const collectionRoutes = [
    {
      prefix: '/admin/announcements',
      collection: 'announcements',
      permission: 'admin.announcements.manage',
    },
    {
      prefix: '/admin/enrollments',
      collection: 'enrollments',
      permission: 'admin.enrollments.manage',
    },
    { prefix: '/admin/rewards', collection: 'rewardRules', permission: 'admin.rewards.manage' },
    {
      prefix: '/admin/feature-flags',
      collection: 'featureFlags',
      permission: 'admin.flags.manage',
    },
  ] as const;

  for (const route of collectionRoutes) {
    const preHandler = requireAdminPermission(route.permission);
    app.get(
      route.prefix,
      { preHandler, schema: { querystring: zodToJsonSchema(querySchema) } },
      async (request) => ({
        data: await listCollection(route.collection, request.query as Record<string, unknown>),
      }),
    );
    app.post(
      route.prefix,
      { preHandler, schema: { body: zodToJsonSchema(adminPayloadSchema) } },
      async (request, reply) => {
        const data = await saveDocument(
          route.collection,
          request.body as Record<string, unknown>,
          request.user?.uid ?? 'unknown',
        );
        return reply.status(201).send({ data });
      },
    );
    app.put(
      route.prefix,
      { preHandler, schema: { body: zodToJsonSchema(adminPayloadSchema) } },
      async (request) => ({
        data: await saveDocument(
          route.collection,
          request.body as Record<string, unknown>,
          request.user?.uid ?? 'unknown',
        ),
      }),
    );
  }

  app.get(
    '/admin/certificates',
    { preHandler: requireAdminPermission('admin.certificates.manage') },
    async (request) => ({
      data: (learning as any).searchCertificates
        ? await (learning as any).searchCertificates(request.query as Record<string, unknown>)
        : { items: [], nextCursor: null, audit: [] },
    }),
  );

  app.post(
    '/admin/certificates',
    {
      preHandler: requireAdminPermission('admin.certificates.manage'),
      schema: { body: zodToJsonSchema(adminPayloadSchema) },
    },
    async (request, reply) => {
      const data = (learning as any).recordCertificateOperation
        ? await (learning as any).recordCertificateOperation(
            request.body as Record<string, unknown>,
            request.user?.uid ?? 'unknown',
          )
        : {
            ...(request.body as Record<string, unknown>),
            status: 'accepted',
            requestedBy: request.user?.uid ?? 'unknown',
            requestedAtUtc: nowUtc(),
          };
      return reply.status(201).send({ data });
    },
  );

  app.post(
    '/ai/:action',
    {
      preHandler: requireAdminPermission('admin.ai.manage'),
      schema: { body: zodToJsonSchema(adminPayloadSchema) },
    },
    async (request, reply) => {
      const { action } = request.params as { action: string };
      const data = {
        id: `ai-${Date.now()}`,
        action,
        status: 'review_required',
        safetyReviewed: true,
        result: null,
        message:
          'AI provider bridge is not configured; request was accepted for backend safety handling only.',
        requestedBy: request.user?.uid ?? 'unknown',
        requestedAtUtc: nowUtc(),
      };
      return reply.status(202).send({ data });
    },
  );
}
