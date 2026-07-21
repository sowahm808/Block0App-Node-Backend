import { z } from 'zod';

const defaultCorsAllowedOrigins = ['http://localhost:3000', 'https://adultmua.netlify.app'];

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  PORT: z.coerce.number().int().positive().default(8080),

  // Firebase Admin credentials
  FIREBASE_PROJECT_ID: z.string().min(1).default('local-development-project'),
  FIREBASE_CLIENT_EMAIL: z
    .string()
    .email()
    .default('firebase-admin@local-development-project.iam.gserviceaccount.com'),
  FIREBASE_PRIVATE_KEY: z
    .string()
    .min(1)
    .default('-----BEGIN PRIVATE KEY-----\nlocal-development-key\n-----END PRIVATE KEY-----'),

  // Optional Firebase client REST API key
  FIREBASE_WEB_API_KEY: z.string().min(1).optional(),

  FIREBASE_USERS_COLLECTION: z.string().min(1).default('users'),

  FIREBASE_REFRESH_SESSIONS_COLLECTION: z.string().min(1).default('refreshSessions'),

  FIREBASE_ACTION_CODE_URL: z.string().url().default('https://adultmua.netlify.app/auth/action'),

  // Match the variable already configured in Render.
  CORS_ORIGINS: z.string().optional(),

  // Backward-compatible alias used by older deployments/tests.
  CORS_ALLOWED_ORIGINS: z.string().optional(),

  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(60),

  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(14),

  LOG_LEVEL: z.string().default('info'),

  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),

  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),

  ACCESS_TOKEN_SECRET: z.string().min(32).default('local-development-access-token-secret-32'),
});

export type Env = z.infer<typeof schema> & {
  corsOrigins: string[];
};

export function loadEnv(input: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.parse(input);

  const corsOrigins = Array.from(
    new Set(
      [defaultCorsAllowedOrigins.join(','), parsed.CORS_ALLOWED_ORIGINS, parsed.CORS_ORIGINS]
        .filter(Boolean)
        .join(',')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  );

  return {
    ...parsed,
    corsOrigins,
  };
}

export const env = loadEnv();
