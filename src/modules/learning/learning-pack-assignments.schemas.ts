import { z } from 'zod';

const optionalUtcDateTime = z.string().datetime({ offset: true }).optional();

export const learningPackAssignmentSchema = z
  .object({
    learningPackId: z.string().trim().min(1).max(200),
    scholarIds: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
    cohortId: z.string().trim().min(1).max(200).optional(),
    teamId: z.string().trim().min(1).max(200).optional(),
    startAtUtc: optionalUtcDateTime,
    dueAtUtc: optionalUtcDateTime,
    notes: z.string().trim().max(2000).optional(),
    idempotencyKey: z.string().trim().min(8).max(200),
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
