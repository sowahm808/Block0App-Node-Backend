import { z } from 'zod';
import { UnprocessableEntityError } from '../common/errors.js';

export const auditSortFields = [
  'createdAtUtc',
  'actor',
  'action',
  'category',
  'outcome',
  'severity',
] as const;
const bounded = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[\w .:@/-]+$/u);
const querySchema = z
  .object({
    start: z.string().datetime({ offset: true }).optional(),
    end: z.string().datetime({ offset: true }).optional(),
    search: z.string().trim().min(1).max(120).optional(),
    actor: bounded.optional(),
    action: bounded.optional(),
    entityType: bounded.optional(),
    entity: bounded.optional(),
    category: bounded.optional(),
    outcome: bounded.optional(),
    source: bounded.optional(),
    severity: bounded.optional(),
    sort: z
      .string()
      .regex(/^(createdAtUtc|actor|action|category|outcome|severity):(asc|desc)$/)
      .default('createdAtUtc:desc'),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().max(4096).optional(),
  })
  .strict();

export type AuditQuery = z.infer<typeof querySchema>;
export function parseAuditQuery(value: unknown): AuditQuery {
  const parsed = querySchema.safeParse(value);
  if (!parsed.success) throw new UnprocessableEntityError('Invalid audit query parameters.');
  if (parsed.data.start && parsed.data.end && parsed.data.start > parsed.data.end)
    throw new UnprocessableEntityError('start must not be after end.');
  return parsed.data;
}

export function validateEventId(value: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value))
    throw new UnprocessableEntityError('Invalid audit event ID.');
  return value;
}
