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

export type CheckInInput = z.infer<typeof checkInSchema>;
