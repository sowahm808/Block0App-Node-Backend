import { z } from 'zod';

export const settingsSchema = z.object({
  appearance: z
    .object({
      theme: z.enum(['Light', 'Dark', 'System']).default('System'),
      reducedMotion: z.boolean().default(false),
      textSize: z.enum(['Standard', 'Large', 'ExtraLarge']).default('Standard'),
    })
    .default({}),
  accessibility: z
    .object({
      highContrast: z.boolean().default(false),
      largerText: z.boolean().default(false),
      reduceAnimation: z.boolean().default(false),
      screenReaderOptimization: z.boolean().default(false),
      keyboardNavigationHelp: z.boolean().default(true),
    })
    .default({}),
  studyPreferences: z
    .object({
      preferredStudyTime: z
        .enum(['EarlyMorning', 'Morning', 'Afternoon', 'Evening', 'LateNight'])
        .default('Evening'),
      defaultDailyGoal: z.number().int().min(1).max(200).default(25),
      reminderTiming: z
        .enum([
          'None',
          'FifteenMinutesBefore',
          'ThirtyMinutesBefore',
          'OneHourBefore',
          'EveningBefore',
        ])
        .default('ThirtyMinutesBefore'),
      showTimer: z.boolean().default(true),
      confirmBeforeAnswerSubmission: z.boolean().default(true),
    })
    .default({}),
});

export const settingsUpdateSchema = settingsSchema;

export const accountSupportRequestSchema = z.object({
  topic: z.enum(['AccountAccess', 'CohortOrProgress', 'PrivacyOrData', 'TechnicalIssue']),
  message: z.string().trim().min(1).max(2000),
});

export type SettingsInput = z.infer<typeof settingsSchema>;
export type AccountSupportRequestInput = z.infer<typeof accountSupportRequestSchema>;
