import { z } from 'zod';

const challengeId = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const nullableDate = z.string().datetime({ offset: true }).nullable();

export const challengeParamsSchema = z.object({ id: challengeId }).strict();

export const challengeListQuerySchema = z
  .object({
    query: z.string().trim().max(100).optional(),
    status: z.enum(['draft', 'scheduled', 'active', 'completed', 'archived']).optional(),
    sort: z.enum(['updated-desc', 'start-asc', 'title-asc']).default('updated-desc'),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().max(2048).optional(),
  })
  .strict();

const editableFields = {
  title: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .transform((value) => value.toLowerCase()),
  description: z.string().trim().max(5000).optional(),
  audience: z.string().trim().max(500).optional(),
  startsAtUtc: nullableDate.optional(),
  endsAtUtc: nullableDate.optional(),
  durationDays: z.number().int().min(1).max(366).nullable().optional(),
};

export const createChallengeSchema = z.object(editableFields).strict();
export const updateChallengeSchema = z
  .object({
    ...Object.fromEntries(
      Object.entries(editableFields).map(([name, schema]) => [name, schema.optional()]),
    ),
    version: z.number().int().positive(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'version'), {
    message: 'At least one editable field is required.',
  });
