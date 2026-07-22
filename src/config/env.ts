import { z } from 'zod';

const defaultCorsAllowedOrigins = ['http://localhost:4200'];

const booleanFromEnv = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
    return undefined;
  });

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5001),
    API_PREFIX: z.string().min(1).default('api/v1'),
    APP_NAME: z.string().min(1).default('Mind Unlocking Academy API'),
    APP_VERSION: z.string().min(1).default('1.0.0'),
    FRONTEND_URL: z.string().url().default('http://localhost:4200'),
    CORS_ORIGINS: z.string().optional(),
    CORS_ALLOWED_ORIGINS: z.string().optional(),
    FIREBASE_PROJECT_ID: z.string().min(1).optional(),
    FIREBASE_CLIENT_EMAIL: z.string().email().optional(),
    FIREBASE_PRIVATE_KEY: z.string().min(1).optional(),
    FIREBASE_STORAGE_BUCKET: z.string().min(1).optional(),
    FIREBASE_WEB_API_KEY: z.string().min(1).optional(),
    FIREBASE_AUTH_DOMAIN: z.string().min(1).optional(),
    FIREBASE_USERS_COLLECTION: z.string().min(1).default('users'),
    FIREBASE_REFRESH_SESSIONS_COLLECTION: z.string().min(1).default('refreshSessions'),
    FIREBASE_ACTION_CODE_URL: z.string().url().default('http://localhost:4200/auth/action'),
    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_MODEL: z.string().min(1).default('gpt-4o-mini'),
    GEMINI_API_KEY: z.string().min(1).optional(),
    GEMINI_MODEL: z.string().min(1).default('gemini-1.5-flash'),
    AI_PROVIDER: z.enum(['openai', 'gemini']).default('openai'),
    EMAIL_PROVIDER: z.enum(['resend', 'sendgrid', 'firebase']).default('resend'),
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(1).optional(),
    CERTIFICATE_PUBLIC_BASE_URL: z.string().url().optional(),
    PUBLIC_API_BASE_URL: z.string().url().default('http://localhost:5001'),
    LOG_LEVEL: z.string().default('info'),
    RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(60000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().optional(),
    AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(60),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(14),
    ACCESS_TOKEN_SECRET: z.string().min(32).optional(),
    ENABLE_SWAGGER: booleanFromEnv.default(true),
    ENABLE_AI_FEATURES: booleanFromEnv.default(true),
    ENABLE_SCHEDULED_JOBS: booleanFromEnv.default(true),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production') {
      for (const key of [
        'FIREBASE_PROJECT_ID',
        'FIREBASE_CLIENT_EMAIL',
        'FIREBASE_PRIVATE_KEY',
        'FIREBASE_STORAGE_BUCKET',
        'ACCESS_TOKEN_SECRET',
      ] as const) {
        if (!value[key])
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required in production`,
          });
      }
      if (!value.CORS_ORIGINS && !value.CORS_ALLOWED_ORIGINS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGINS'],
          message: 'CORS_ORIGINS is required in production',
        });
      }
    }
  });

export type Env = z.infer<typeof schema> & {
  corsOrigins: string[];
  RATE_LIMIT_PER_MINUTE: number;
  ACCESS_TOKEN_SECRET: string;
  firebaseConfigured: boolean;
};

export function loadEnv(input: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.parse(input);
  const corsOrigins = Array.from(
    new Set(
      [
        defaultCorsAllowedOrigins.join(','),
        parsed.FRONTEND_URL,
        parsed.CORS_ALLOWED_ORIGINS,
        parsed.CORS_ORIGINS,
      ]
        .filter(Boolean)
        .join(',')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  );
  const firebaseConfigured = Boolean(
    parsed.FIREBASE_PROJECT_ID && parsed.FIREBASE_CLIENT_EMAIL && parsed.FIREBASE_PRIVATE_KEY,
  );
  return {
    ...parsed,
    FIREBASE_PROJECT_ID: parsed.FIREBASE_PROJECT_ID ?? 'local-development-project',
    FIREBASE_CLIENT_EMAIL:
      parsed.FIREBASE_CLIENT_EMAIL ??
      'firebase-admin@local-development-project.iam.gserviceaccount.com',
    FIREBASE_PRIVATE_KEY:
      parsed.FIREBASE_PRIVATE_KEY ??
      '-----BEGIN PRIVATE KEY-----\nlocal-development-key\n-----END PRIVATE KEY-----',
    RATE_LIMIT_PER_MINUTE: parsed.RATE_LIMIT_PER_MINUTE ?? parsed.RATE_LIMIT_MAX,
    ACCESS_TOKEN_SECRET: parsed.ACCESS_TOKEN_SECRET ?? 'local-development-access-token-secret-32',
    corsOrigins,
    firebaseConfigured,
  };
}

export const env = loadEnv();
