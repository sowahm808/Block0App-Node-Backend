import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuthService } from '../auth/auth.service.js';
import { authenticate } from '../common/auth-middleware.js';
import { requirePermission } from '../common/authorization.js';
import { parseAuditQuery, validateEventId, type AuditQuery } from './audit.schemas.js';
import type { AuditAppendInput } from './audit.service.js';

export interface AuditDataSource {
  list(
    query: AuditQuery,
  ): Promise<{ items: Record<string, unknown>[]; nextCursor?: string | null }>;
  detail(id: string): Promise<unknown>;
  append(input: AuditAppendInput): Promise<unknown>;
}

const csvCell = (value: unknown) => {
  let text = value == null ? '' : String(value);
  if (/^[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};
const columns: [string, string][] = [
  ['Timestamp', 'createdAtUtc'],
  ['Actor', 'actorDisplayName'],
  ['Actor email', 'actorEmail'],
  ['Action', 'action'],
  ['Category', 'category'],
  ['Entity type', 'entityType'],
  ['Entity title', 'entityTitle'],
  ['Entity ID', 'entityId'],
  ['Outcome', 'outcome'],
  ['Summary', 'notes'],
  ['Source', 'source'],
  ['Trace ID', 'traceId'],
];

export async function auditRoutes(
  app: FastifyInstance,
  opts: { audit: AuditDataSource; authService: AuthService },
) {
  const authorize = (permission: string) => async (request: FastifyRequest) => {
    await authenticate(opts.authService)(request);
    await requirePermission(permission)(request);
  };
  app.get(
    '/admin/audit/export',
    { preHandler: authorize('audit.export') },
    async (request, reply) => {
      const original = parseAuditQuery(request.query);
      const rows: Record<string, unknown>[] = [];
      let cursor: string | undefined;
      do {
        const page = await opts.audit.list({ ...original, limit: 100, cursor });
        rows.push(...page.items);
        cursor = page.nextCursor ?? undefined;
        if (rows.length >= 10_000) break;
      } while (cursor);
      const principal = request.user!;
      await opts.audit.append({
        action: 'audit.export',
        category: 'audit',
        outcome: 'success',
        severity: 'high',
        actor: {
          id: principal.uid,
          email: principal.email,
          roles: principal.roles ?? (principal.role ? [principal.role] : []),
        },
        source: 'admin-api',
        requestId: request.id,
        traceId: request.id,
        correlationId: request.id,
        metadata: { filters: { ...original, cursor: undefined }, exportedCount: rows.length },
      });
      const csv = [
        columns.map(([heading]) => csvCell(heading)).join(','),
        ...rows
          .slice(0, 10_000)
          .map((row) => columns.map(([, field]) => csvCell(row[field])).join(',')),
      ].join('\r\n');
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', 'attachment; filename="audit-log.csv"')
        .send(`\uFEFF${csv}\r\n`);
    },
  );
  app.get('/admin/audit', { preHandler: authorize('audit.read') }, (request) =>
    opts.audit.list(parseAuditQuery(request.query)),
  );
  app.get<{ Params: { eventId: string } }>(
    '/admin/audit/:eventId',
    { preHandler: authorize('audit.read') },
    (request) => opts.audit.detail(validateEventId(request.params.eventId)),
  );
}
