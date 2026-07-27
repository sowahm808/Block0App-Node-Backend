import { z } from 'zod';

export const cohortStatuses = [
  'draft',
  'upcoming',
  'enrollment_open',
  'active',
  'paused',
  'completed',
  'closed',
  'archived',
] as const;

const isoDate = z.string().datetime({ offset: true });

export const listCohortsSchema = z.object({
  search: z.string().trim().max(100).optional(),
  challengeId: z.string().trim().optional(),
  status: z.enum(cohortStatuses).optional(),
  mentorId: z.string().trim().optional(),
  archived: z.enum(['true', 'false']).default('false'),
  startsAfter: isoDate.optional(),
  startsBefore: isoDate.optional(),
  capacityAvailable: z.enum(['true', 'false']).optional(),
  sort: z.enum(['updatedAtUtc', 'startsAtUtc', 'name']).default('updatedAtUtc'),
  order: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(2048).optional(),
});

export const createCohortSchema = z.object({
  name: z.string().trim().min(1).max(120),
  challengeId: z.string().trim().min(1),
  challengeName: z.string().trim().min(1).max(160).optional(),
  timeZone: z.string().trim().min(1),
  startsAtUtc: isoDate,
  endsAtUtc: isoDate,
  enrollmentOpensAtUtc: isoDate.optional(),
  enrollmentClosesAtUtc: isoDate.optional(),
  capacity: z.number().int().positive(),
});

export const updateCohortSchema = createCohortSchema.partial().extend({
  version: z.number().int().positive().optional(),
});

export const statusSchema = z.object({
  status: z.enum(cohortStatuses),
  version: z.number().int().positive(),
});

export const duplicateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  startsAtUtc: isoDate,
  endsAtUtc: isoDate,
  timeZone: z.string().trim().min(1).optional(),
});

export type CohortStatus = (typeof cohortStatuses)[number];
export type CreateCohort = z.infer<typeof createCohortSchema>;
export type ListCohorts = z.infer<typeof listCohortsSchema>;
