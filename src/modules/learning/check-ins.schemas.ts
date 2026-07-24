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

export type CheckInInput = z.infer<typeof checkInSchema>;
export type MorningCheckInInput = z.infer<typeof morningCheckInSchema>;
