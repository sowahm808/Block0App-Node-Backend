import { z } from 'zod';

export const SYSTEM_SETTINGS_SCHEMA_VERSION = 1;

const email = z.string().trim().email().max(254);
const optionalEmail = z.union([email, z.literal('')]);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const timezone = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Invalid IANA time zone');
const locale = z.string().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/);
const optionalTimestamp = z.union([z.string().datetime({ offset: true }), z.null()]);

export const editableSettingsSchema = z
  .object({
    general: z
      .object({
        applicationName: z.string().trim().min(1).max(100),
        supportEmail: email,
        defaultLocale: locale,
        defaultTimezone: timezone,
        dateFormat: z.string().trim().min(1).max(30),
      })
      .strict(),
    academy: z
      .object({
        academyName: z.string().trim().min(1).max(120),
        contactEmail: optionalEmail,
        academicYearStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        defaultChallengeDurationDays: z.number().int().min(1).max(365),
      })
      .strict(),
    challenges: z
      .object({
        defaultDurationDays: z.number().int().min(1).max(365),
        allowLateCompletion: z.boolean(),
        requireDailyCheckIn: z.boolean(),
        maxActiveChallenges: z.number().int().min(1).max(100),
      })
      .strict(),
    learningPacks: z
      .object({
        requireReviewBeforePublish: z.boolean(),
        allowSelfEnrollment: z.boolean(),
        defaultEstimatedMinutes: z.number().int().min(1).max(1440),
      })
      .strict(),
    enrollment: z
      .object({
        registrationEnabled: z.boolean(),
        requireEmailVerification: z.boolean(),
        invitationExpiryDays: z.number().int().min(1).max(365),
        maximumActiveEnrollments: z.number().int().min(1).max(1000),
      })
      .strict(),
    notifications: z
      .object({
        emailEnabled: z.boolean(),
        smsEnabled: z.boolean(),
        pushEnabled: z.boolean(),
        fromName: z.string().trim().min(1).max(100),
        replyToEmail: optionalEmail,
        digestTime: time,
      })
      .strict(),
    security: z
      .object({
        sessionTimeoutMinutes: z.number().int().min(5).max(1440),
        passwordResetTimeoutMinutes: z.number().int().min(5).max(1440),
        maximumLoginAttempts: z.number().int().min(1).max(20),
        auditRetentionDays: z.number().int().min(30).max(3650),
        requireMfaForAdministrators: z.boolean(),
      })
      .strict(),
    imports: z
      .object({
        maximumUploadSizeMb: z.number().int().min(1).max(500),
        extractionTimeoutSeconds: z.number().int().min(10).max(900),
        allowedParserExtensions: z
          .array(z.enum(['csv', 'json', 'pdf', 'docx', 'txt', 'xlsx']))
          .min(1)
          .max(6),
      })
      .strict(),
    reports: z
      .object({
        maximumExportRows: z.number().int().min(1).max(1_000_000),
        includePersonallyIdentifiableInformation: z.boolean(),
        scheduledReportsEnabled: z.boolean(),
      })
      .strict(),
    integrations: z.object({}).strict(),
    maintenance: z
      .object({
        enabled: z.boolean(),
        readOnly: z.boolean(),
        banner: z.string().max(500),
        reason: z.string().max(500),
        startsAtUtc: optionalTimestamp,
        endsAtUtc: optionalTimestamp,
      })
      .strict(),
  })
  .strict()
  .superRefine((settings, ctx) => {
    if (
      (settings.maintenance.enabled || settings.maintenance.readOnly) &&
      (!settings.maintenance.banner.trim() || !settings.maintenance.reason.trim())
    ) {
      for (const field of ['banner', 'reason'])
        if (!settings.maintenance[field as 'banner' | 'reason'].trim())
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['maintenance', field],
            message: `${field} is required when maintenance or read-only mode is enabled`,
          });
    }
    const { startsAtUtc, endsAtUtc } = settings.maintenance;
    if (startsAtUtc && endsAtUtc && Date.parse(endsAtUtc) <= Date.parse(startsAtUtc))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maintenance', 'endsAtUtc'],
        message: 'End must be after start',
      });
  });

export type EditableSystemSettings = z.infer<typeof editableSettingsSchema>;
export const updateSettingsSchema = z
  .object({ version: z.number().int().nonnegative(), settings: editableSettingsSchema })
  .strict();
export const validateSettingsSchema = z.object({ settings: editableSettingsSchema }).strict();
export const resetSettingsSchema = z
  .object({
    category: z.enum([
      'general',
      'academy',
      'challenges',
      'learningPacks',
      'enrollment',
      'notifications',
      'security',
      'imports',
      'reports',
      'maintenance',
    ]),
    version: z.number().int().nonnegative(),
  })
  .strict();
export const historyQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().max(500).optional(),
  })
  .strict();

export const defaultSystemSettings: EditableSystemSettings = {
  general: {
    applicationName: 'MindUnlocking',
    supportEmail: 'support@mindunlocking.com',
    defaultLocale: 'en-US',
    defaultTimezone: 'UTC',
    dateFormat: 'yyyy-MM-dd',
  },
  academy: {
    academyName: 'MindUnlocking Academy',
    contactEmail: '',
    academicYearStart: '2026-01-01',
    defaultChallengeDurationDays: 30,
  },
  challenges: {
    defaultDurationDays: 30,
    allowLateCompletion: false,
    requireDailyCheckIn: true,
    maxActiveChallenges: 10,
  },
  learningPacks: {
    requireReviewBeforePublish: true,
    allowSelfEnrollment: false,
    defaultEstimatedMinutes: 30,
  },
  enrollment: {
    registrationEnabled: true,
    requireEmailVerification: true,
    invitationExpiryDays: 7,
    maximumActiveEnrollments: 100,
  },
  notifications: {
    emailEnabled: true,
    smsEnabled: false,
    pushEnabled: false,
    fromName: 'MindUnlocking',
    replyToEmail: '',
    digestTime: '09:00',
  },
  security: {
    sessionTimeoutMinutes: 60,
    passwordResetTimeoutMinutes: 60,
    maximumLoginAttempts: 5,
    auditRetentionDays: 365,
    requireMfaForAdministrators: false,
  },
  imports: {
    maximumUploadSizeMb: 100,
    extractionTimeoutSeconds: 300,
    allowedParserExtensions: ['csv', 'json', 'pdf', 'docx', 'txt', 'xlsx'],
  },
  reports: {
    maximumExportRows: 100000,
    includePersonallyIdentifiableInformation: false,
    scheduledReportsEnabled: false,
  },
  integrations: {},
  maintenance: {
    enabled: false,
    readOnly: false,
    banner: '',
    reason: '',
    startsAtUtc: null,
    endsAtUtc: null,
  },
};
