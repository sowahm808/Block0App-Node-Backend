import { z } from 'zod';

export const contentSchema = z.object({
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(5000),
  scriptureReference: z.string().trim().max(120).default(''),
  scriptureText: z.string().trim().max(1000).default(''),
  shortPrayer: z.string().trim().max(1000).default(''),
});

const externalRecipient = z
  .object({
    name: z.string().trim().min(1).max(120),
    preferredAddressName: z.string().trim().min(1).max(80).optional(),
    gender: z.enum(['female', 'male', 'non_binary', 'unspecified']).optional(),
    email: z.string().email().max(254).optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[1-9]\d{7,14}$/)
      .optional(),
  })
  .refine((value) => value.email || value.phone, { message: 'An email or phone is required.' });

export const generateSchema = z
  .object({
    recipientType: z.enum(['internal', 'external']),
    externalRecipient: externalRecipient.optional(),
    recipientMuaUserId: z.string().trim().min(1).max(128).optional(),
    recipientName: z.string().trim().min(1).max(120).optional(),
    preferredAddressName: z.string().trim().min(1).max(80).optional(),
    recipientGender: z.string().trim().max(30).optional(),
    whisperType: z.enum(['encouragement', 'celebration', 'support', 'prayer']),
    wrapStyle: z.enum(['warm', 'gentle', 'joyful', 'direct', 'reflective']),
    deliveryFormat: z.enum(['text', 'audio', 'text_audio']),
    senderIntent: z.string().trim().min(3).max(1000),
  })
  .superRefine((value, ctx) => {
    if (value.recipientType === 'external' && !value.externalRecipient)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['externalRecipient'],
        message: 'Required for an external recipient.',
      });
    if (value.recipientType === 'internal' && !value.recipientMuaUserId)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipientMuaUserId'],
        message: 'Required for an internal recipient.',
      });
  });

export const audioSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(['audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/wav']),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(15 * 1024 * 1024),
});
export const audioCompleteSchema = audioSchema
  .omit({ fileName: true })
  .extend({ uploadId: z.string().min(20).max(200) });
export type GenerateInput = z.infer<typeof generateSchema>;
export type WhisperContent = z.infer<typeof contentSchema>;
