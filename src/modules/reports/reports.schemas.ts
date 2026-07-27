import { z } from 'zod';
import { UnprocessableEntityError } from '../common/errors.js';

export const reportCategories = [
  'scholars',
  'cohorts',
  'challenges',
  'learning-packs',
  'questions',
] as const;
export type ReportCategory = (typeof reportCategories)[number];

const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const DOCUMENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const commonSorts = ['updatedAtUtc:desc', 'updatedAtUtc:asc'] as const;
export const reportSorts: Record<ReportCategory, readonly string[]> = {
  scholars: [...commonSorts, 'displayName:asc', 'completionRate:desc'],
  cohorts: [...commonSorts, 'label:asc', 'completionRate:desc'],
  challenges: [...commonSorts, 'label:asc', 'completionRate:desc'],
  'learning-packs': [...commonSorts, 'title:asc', 'completionRate:desc'],
  questions: [...commonSorts, 'attemptCount:desc', 'accuracy:asc'],
};

export type ReportQuery = {
  startAtUtc?: string;
  endAtUtc?: string;
  challengeId?: string;
  cohortId?: string;
  status?: string;
  scholarSearch?: string;
  pageSize: number;
  cursor?: string;
  sort: string;
};

const scalarQuerySchema = z
  .object({
    startAtUtc: z.string().optional(),
    endAtUtc: z.string().optional(),
    challengeId: z.string().optional(),
    cohortId: z.string().optional(),
    status: z.string().trim().min(1).max(64).optional(),
    scholarSearch: z.string().trim().min(1).max(100).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).max(2048).optional(),
    sort: z.string().optional(),
  })
  .strict();

export function parseReportQuery(raw: unknown, category: ReportCategory): ReportQuery {
  const parsed = scalarQuerySchema.safeParse(raw);
  if (!parsed.success) {
    throw new UnprocessableEntityError(
      `Invalid report filters: ${parsed.error.issues.map((issue) => issue.path.join('.') || issue.message).join(', ')}`,
    );
  }
  const value = parsed.data;
  for (const field of ['startAtUtc', 'endAtUtc'] as const) {
    const candidate = value[field];
    if (candidate && (!UTC_INSTANT.test(candidate) || Number.isNaN(Date.parse(candidate)))) {
      throw new UnprocessableEntityError(`${field} must be a strict ISO-8601 UTC instant`);
    }
  }
  if (value.endAtUtc && !value.startAtUtc) {
    throw new UnprocessableEntityError('startAtUtc is required when endAtUtc is supplied');
  }
  if (value.startAtUtc && value.endAtUtc) {
    const start = Date.parse(value.startAtUtc);
    const end = Date.parse(value.endAtUtc);
    if (start > end) throw new UnprocessableEntityError('startAtUtc must not be after endAtUtc');
    if (end - start > 366 * 86_400_000) {
      throw new UnprocessableEntityError('Report date range must not exceed 366 days');
    }
  }
  for (const field of ['challengeId', 'cohortId'] as const) {
    if (value[field] && !DOCUMENT_ID.test(value[field]!)) {
      throw new UnprocessableEntityError(`${field} is not a valid document ID`);
    }
  }
  const sort = value.sort ?? 'updatedAtUtc:desc';
  if (!reportSorts[category].includes(sort)) {
    throw new UnprocessableEntityError(`Unsupported sort for ${category}`);
  }
  return { ...value, sort };
}

export type ReportListResponse<T = Record<string, unknown>> = {
  items: T[];
  total: number;
  nextCursor: string | null;
  updatedAtUtc: string;
};
