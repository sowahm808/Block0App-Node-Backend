import type { Firestore, Query } from 'firebase-admin/firestore';
import crypto from 'node:crypto';
import { NotFoundError, UnprocessableEntityError } from '../common/errors.js';
import type { AuditQuery } from './audit.schemas.js';
import {
  sanitizeAuditDocument,
  sanitizeAuditMetadata,
  sanitizeAuditValue,
} from './audit.sanitizer.js';

export interface AuditAppendInput {
  action: string;
  category: string;
  actor: { id: string; displayName?: string; email?: string; roles?: string[] };
  entity?: { type: string; id: string; title?: string };
  outcome: string;
  severity?: string;
  notes?: string;
  changedFields?: string[];
  before?: unknown;
  after?: unknown;
  requestId?: string;
  traceId?: string;
  correlationId?: string;
  source?: string;
  metadata?: unknown;
}

const fieldNames: Record<string, string> = { actor: 'actorDisplayName' };
const normalize = (value: string) => value.trim().toLocaleLowerCase('en-US');
const buildSearchTerms = (values: unknown[]) =>
  Array.from(
    new Set(
      values.filter(Boolean).flatMap((value) => {
        const normalized = normalize(String(value)).slice(0, 120);
        return [
          normalized,
          ...normalized.split(/\s+/),
          ...Array.from({ length: Math.min(normalized.length, 40) }, (_, index) =>
            normalized.slice(0, index + 1),
          ),
        ];
      }),
    ),
  ).slice(0, 200);

export class AuditService {
  constructor(
    private readonly db: Firestore,
    private readonly cursorSecret: string,
    private readonly collection = 'auditLogs',
  ) {}

  async append(input: AuditAppendInput) {
    const ref = this.db.collection(this.collection).doc();
    const createdAtUtc = new Date().toISOString();
    const document = sanitizeAuditValue({
      eventId: ref.id,
      action: input.action,
      category: input.category,
      outcome: input.outcome,
      severity: input.severity ?? 'info',
      source: input.source ?? 'server',
      createdAtUtc,
      actorId: input.actor.id,
      actorDisplayName: input.actor.displayName ?? '',
      actorEmail: input.actor.email ?? '',
      actorRoleSnapshot: input.actor.roles ?? [],
      entityType: input.entity?.type,
      entityId: input.entity?.id,
      entityTitle: input.entity?.title,
      notes: input.notes,
      changedFields: input.changedFields ?? [],
      before: input.before,
      after: input.after,
      requestId: input.requestId,
      traceId: input.traceId,
      correlationId: input.correlationId,
      metadata: sanitizeAuditMetadata(input.metadata),
      searchTerms: buildSearchTerms([
        input.actor.displayName,
        input.actor.email,
        input.entity?.id,
        input.entity?.title,
        input.notes,
        ref.id,
        input.traceId,
        input.correlationId,
      ]),
      actorSearchTerms: buildSearchTerms([
        input.actor.id,
        input.actor.displayName,
        input.actor.email,
      ]),
    }) as Record<string, unknown>;
    await ref.create(document);
    return sanitizeAuditDocument(ref.id, document);
  }

  private sign(payload: object) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.cursorSecret)
      .update(body)
      .digest('base64url');
    return `${body}.${signature}`;
  }
  private decode(cursor: string, query: AuditQuery): unknown[] {
    const [body, signature, extra] = cursor.split('.');
    const expected = body
      ? crypto.createHmac('sha256', this.cursorSecret).update(body).digest('base64url')
      : '';
    if (
      !body ||
      !signature ||
      extra ||
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      throw new UnprocessableEntityError('Malformed audit cursor.');
    try {
      const value = JSON.parse(Buffer.from(body, 'base64url').toString()) as {
        fingerprint: string;
        values: unknown[];
      };
      if (
        value.fingerprint !== this.fingerprint(query) ||
        !Array.isArray(value.values) ||
        value.values.length !== 2
      )
        throw new Error();
      return value.values;
    } catch {
      throw new UnprocessableEntityError('Audit cursor does not match the requested filters.');
    }
  }
  private fingerprint(query: AuditQuery) {
    const { cursor, limit, ...filters } = query;
    void cursor;
    void limit;
    return crypto.createHash('sha256').update(JSON.stringify(filters)).digest('base64url');
  }

  async list(filters: AuditQuery) {
    const [requestedField, direction] = filters.sort.split(':') as [string, 'asc' | 'desc'];
    const sortField = fieldNames[requestedField] ?? requestedField;
    let query: Query = this.db.collection(this.collection);
    if (filters.start) query = query.where('createdAtUtc', '>=', filters.start);
    if (filters.end) query = query.where('createdAtUtc', '<=', filters.end);
    const equality: Record<string, string | undefined> = {
      action: filters.action,
      entityType: filters.entityType,
      entityId: filters.entity,
      category: filters.category,
      outcome: filters.outcome,
      source: filters.source,
      severity: filters.severity,
    };
    for (const [field, value] of Object.entries(equality))
      if (value) query = query.where(field, '==', value);
    if (filters.actor)
      query = query.where('actorSearchTerms', 'array-contains', normalize(filters.actor));
    if (filters.search)
      query = query.where('searchTerms', 'array-contains', normalize(filters.search));
    query = query.orderBy(sortField, direction).orderBy('__name__', direction).limit(filters.limit);
    if (filters.cursor) query = query.startAfter(...this.decode(filters.cursor, filters));
    const snapshot = await query.get();
    const items = snapshot.docs.map((doc) => sanitizeAuditDocument(doc.id, doc.data()));
    const last = snapshot.docs.at(-1);
    return {
      items,
      nextCursor:
        snapshot.size === filters.limit && last
          ? this.sign({
              fingerprint: this.fingerprint(filters),
              values: [last.get(sortField), last.id],
            })
          : null,
    };
  }

  async detail(id: string) {
    const doc = await this.db.collection(this.collection).doc(id).get();
    if (!doc.exists) throw new NotFoundError('Audit event not found.');
    return sanitizeAuditDocument(doc.id, doc.data()!);
  }
}
