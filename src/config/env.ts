import { z } from 'zod';

const defaultCorsAllowedOrigins = ['http://localhost:3000', 'https://adultmua.netlify.app'];

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  FIREBASE_PROJECT_ID: z.string().min(1).default('demo-mindunlocking'),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  FIREBASE_USERS_COLLECTION: z.string().min(1).default('users'),
  FIREBASE_REFRESH_SESSIONS_COLLECTION: z.string().min(1).default('refreshSessions'),
  FIREBASE_ACTION_CODE_URL: z.string().url().default('http://localhost:3000/auth/action'),
  CORS_ALLOWED_ORIGINS: z.string().default(defaultCorsAllowedOrigins.join(',')),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(14),
  LOG_LEVEL: z.string().default('info'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
  ACCESS_TOKEN_SECRET: z.string().min(32).default('development-only-secret-change-me-32-bytes'),
});

export type Env = z.infer<typeof schema> & { corsOrigins: string[] };

export function loadEnv(input = process.env): Env {
  const parsed = schema.parse(input);
  return {
    ...parsed,
    corsOrigins: Array.from(
      new Set([
        ...defaultCorsAllowedOrigins,
        ...parsed.CORS_ALLOWED_ORIGINS.split(',').map((x) => x.trim()),
      ]),
    ).filter(Boolean),
  };
}

export const env = loadEnv();
