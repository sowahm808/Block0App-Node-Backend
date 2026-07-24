import { z } from 'zod';

export const checkInSchema = z
  .object({
    challengeId: z.string().min(1).optional(),
    dayNumber: z.number().int().min(1).max(365).optional(),
    mood: z.string().min(1).max(80).optional(),
    energy: z.number().int().min(1).max(5).optional(),
    confidence: z.number().int().min(1).max(5).optional(),
    stress: z.number().int().min(1).max(5).optional(),
    notes: z.string().max(2000).optional(),
  })
  .passthrough();

export const morningSupportCategories = [
  'Academic',
  'Technical',
  'Time management',
  'Motivation',
  'Personal',
  'Other',
] as const;

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export const morningCheckInSchema = z.object({
  kind: z.literal('morning').optional().default('morning'),
  confidence: z.number().int().min(1).max(10),
  goal: z.number().int(),
  needSupport: z.boolean(),
  obstacle: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
  supportCategory: z.preprocess(
    emptyToUndefined,
    z.enum(morningSupportCategories).optional().nullable(),
  ),
  supportDescription: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
});

export const eveningGoalMetValues = ['Yes', 'Partially', 'No'] as const;

export const eveningCheckInSchema = z
  .object({
    kind: z.literal('evening').optional().default('evening'),
    confidence: z.number().int().min(1).max(10),
    goal: z.number().int(),
    goalMet: z.enum(eveningGoalMetValues),
    supportGivenToday: z.number().int().min(0).optional().default(0),
    supportReceivedToday: z.number().int().min(0).optional().default(0),
    reflection: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
  })
  .strict();

export type CheckInInput = z.infer<typeof checkInSchema>;
export type MorningCheckInInput = z.infer<typeof morningCheckInSchema>;
export type EveningCheckInInput = z.infer<typeof eveningCheckInSchema>;

const isValidDateOnly = (value: string) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected ISO date in YYYY-MM-DD format')
  .refine(isValidDateOnly, 'Expected a valid ISO date');
const booleanQuerySchema = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  return value;
}, z.boolean());

export const checkInHistoryGoalResults = ['completed', 'partial', 'missed'] as const;

export const checkInHistoryQuerySchema = z
  .object({
    startDate: dateOnlySchema.optional(),
    endDate: dateOnlySchema.optional(),
    minConfidence: z.coerce.number().int().min(1).max(10).optional(),
    maxConfidence: z.coerce.number().int().min(1).max(10).optional(),
    goalCompletion: z.enum(checkInHistoryGoalResults).optional(),
    supportRequested: booleanQuerySchema.optional(),
  })
  .strict()
  .superRefine((query, ctx) => {
    if (query.startDate && query.endDate && query.startDate > query.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'endDate must be on or after startDate',
      });
    }
    if (query.minConfidence && query.maxConfidence && query.minConfidence > query.maxConfidence) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxConfidence'],
        message: 'maxConfidence must be greater than or equal to minConfidence',
      });
    }
  });

export type CheckInHistoryQuery = z.infer<typeof checkInHistoryQuerySchema>;
