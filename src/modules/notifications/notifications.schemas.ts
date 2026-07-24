import { z } from 'zod';

const channelAliases = {
  email: 'email',
  push: 'push',
  sms: 'sms',
  text: 'sms',
  in_app: 'in_app',
  inapp: 'in_app',
  'in-app': 'in_app',
  app: 'in_app',
  notification: 'in_app',
  notifications: 'in_app',
} as const;

const notificationChannelSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((channel, ctx) => {
    const normalized = channelAliases[channel as keyof typeof channelAliases];

    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Expected one of: email, push, sms, in_app',
      });
      return z.NEVER;
    }

    return normalized;
  });

const hhmmSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm in 24-hour format');

const ianaTimeZoneSchema = z
  .string()
  .trim()
  .refine(
    (timeZone) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Expected a valid IANA time zone' },
  );

export const notificationTypeSchema = z.enum([
  'study',
  'team',
  'support',
  'rewards',
  'certificates',
  'system',
]);

export const notificationActionSchema = z.object({
  label: z.enum([
    'Continue Study',
    'View Team',
    'View Reward',
    'View Certificate',
    'Open Support Request',
  ]),
  route: z.string().trim().min(1).max(240),
});

export const notificationPreferencesSchema = z.object({
  inApp: z.boolean().default(true),
  email: z.boolean().default(true),
  push: z.boolean().default(false),
  studyReminders: z.boolean().default(true),
  teamActivity: z.boolean().default(true),
  supportUpdates: z.boolean().default(true),
  rewardUpdates: z.boolean().default(true),
  certificateUpdates: z.boolean().default(true),
  quietHours: z.object({
    enabled: z.boolean().default(false),
    startTime: hhmmSchema.default('21:00'),
    endTime: hhmmSchema.default('07:00'),
    timeZone: ianaTimeZoneSchema.default('America/New_York'),
  }),
});

export const defaultNotificationPreferences: NotificationPreferencesInput = {
  inApp: true,
  email: true,
  push: false,
  studyReminders: true,
  teamActivity: true,
  supportUpdates: true,
  rewardUpdates: true,
  certificateUpdates: true,
  quietHours: {
    enabled: false,
    startTime: '21:00',
    endTime: '07:00',
    timeZone: 'America/New_York',
  },
};

export const examReminderSchema = z
  .object({
    enabled: z.boolean().default(true),
    examDate: z.string().min(1).optional(),
    examName: z.string().trim().min(1).max(160).optional(),
    reminderTime: hhmmSchema.optional(),
    timezone: ianaTimeZoneSchema.optional(),
    reminderDaysBefore: z.array(z.number().int().min(0).max(365)).max(30).optional(),
    channels: z.array(notificationChannelSchema).max(4).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .passthrough();

export type ExamReminderInput = z.infer<typeof examReminderSchema>;
export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;
