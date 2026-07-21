import { z } from 'zod';

const defaultCorsAllowedOrigins = [
  'http://localhost:4200',
  'https://adultmua.netlify.app',
];

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(8080),

  // Firebase Admin credentials
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().email(),
  FIREBASE_PRIVATE_KEY: z.string().min(1),

  // Optional Firebase client REST API key
  FIREBASE_WEB_API_KEY: z.string().min(1).optional(),

  FIREBASE_USERS_COLLECTION: z
    .string()
    .min(1)
    .default('users'),

  FIREBASE_REFRESH_SESSIONS_COLLECTION: z
    .string()
    .min(1)
    .default('refreshSessions'),

  FIREBASE_ACTION_CODE_URL: z
    .string()
    .url()
    .default('https://adultmua.netlify.app/auth/action'),

  // Match the variable already configured in Render.
  CORS_ORIGINS: z
    .string()
    .default(defaultCorsAllowedOrigins.join(',')),

  ACCESS_TOKEN_TTL_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .default(60),

  REFRESH_TOKEN_TTL_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .default(14),

  LOG_LEVEL: z.string().default('info'),

  RATE_LIMIT_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(120),

  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(10),

  ACCESS_TOKEN_SECRET: z
    .string()
    .min(32),
});

export type Env = z.infer<typeof schema> & {
  corsOrigins: string[];
};

export function loadEnv(
  input: NodeJS.ProcessEnv = process.env,
): Env {
  const parsed = schema.parse(input);

  const corsOrigins = Array.from(
    new Set(
      parsed.CORS_ORIGINS
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