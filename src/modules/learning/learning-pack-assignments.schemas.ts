import { z } from 'zod';

const optionalUtcDateTime = z.string().datetime({ offset: true }).optional();
const strictOptionalUtcDateTime = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/,
    'Must be an ISO-8601 UTC timestamp.',
  )
  .datetime({ offset: true })
  .optional();
const uniqueIds = (maximum: number, label: string) =>
  z
    .array(z.string().trim().min(1).max(200))
    .min(1)
    .max(maximum)
    .refine((ids) => new Set(ids).size === ids.length, `${label} must be unique.`);

/** Request used by the admin user-management bulk assignment screen. */
export const bulkLearningPackAssignmentSchema = z
  .object({
    scholarIds: uniqueIds(100, 'Scholar IDs'),
    learningPackIds: uniqueIds(25, 'Learning pack IDs'),
    availableFromUtc: strictOptionalUtcDateTime,
    dueAtUtc: strictOptionalUtcDateTime,
    notes: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.scholarIds.length * value.learningPackIds.length > 2500) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At most 2,500 assignments may be requested.',
      });
    }
    if (
      value.availableFromUtc &&
      value.dueAtUtc &&
      Date.parse(value.dueAtUtc) <= Date.parse(value.availableFromUtc)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueAtUtc'],
        message: 'Due date must be after the available-from date.',
      });
    }
  });

export type BulkLearningPackAssignmentRequest = z.infer<typeof bulkLearningPackAssignmentSchema>;
export interface BulkLearningPackAssignmentResult {
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  failures: Array<{ scholarId: string; learningPackId: string; message: string }>;
}

export const learningPackAssignmentSchema = z
  .object({
    learningPackId: z.string().trim().min(1).max(200).optional(),
    scholarIds: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
    cohortId: z.string().trim().min(1).max(200).optional(),
    teamId: z.string().trim().min(1).max(200).optional(),
    startAtUtc: optionalUtcDateTime,
    dueAtUtc: optionalUtcDateTime,
    notes: z.string().trim().max(2000).optional(),
    idempotencyKey: z.string().trim().min(8).max(200).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.scholarIds).size !== value.scholarIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scholarIds'],
        message: 'Scholar IDs must be unique.',
      });
    }
    if (
      value.startAtUtc &&
      value.dueAtUtc &&
      new Date(value.dueAtUtc).getTime() < new Date(value.startAtUtc).getTime()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueAtUtc'],
        message: 'Due date must be on or after the start date.',
      });
    }
  });

export type LearningPackAssignmentRequest = z.infer<typeof learningPackAssignmentSchema>;

export interface LearningPackAssignmentResult {
  learningPackId: string;
  requested: number;
  created: number;
  skipped: number;
  failed: number;
  assignments: Array<{
    id: string;
    scholarId: string;
    status: string;
    createdAt?: string;
  }>;
  errors?: Array<{ scholarId: string; message: string }>;
}
