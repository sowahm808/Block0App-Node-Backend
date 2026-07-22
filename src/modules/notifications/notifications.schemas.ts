import { z } from 'zod';

export const examReminderSchema = z
  .object({
    enabled: z.boolean().default(true),
    examDate: z.string().min(1).optional(),
    examName: z.string().trim().min(1).max(160).optional(),
    reminderTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm in 24-hour format')
      .optional(),
    timezone: z.string().trim().min(1).max(80).optional(),
    reminderDaysBefore: z.array(z.number().int().min(0).max(365)).max(30).optional(),
    channels: z.array(z.enum(['email', 'push', 'sms', 'in_app'])).max(4).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .passthrough();

export type ExamReminderInput = z.infer<typeof examReminderSchema>;
