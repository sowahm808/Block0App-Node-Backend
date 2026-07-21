import { env } from '../../config/env.js';
export const loggerOptions = {
  level: env.LOG_LEVEL,
  redact: [
    'req.headers.authorization',
    'body.password',
    'body.refreshToken',
    'body.firebaseIdToken',
    'body.token',
    'resetLink',
    'emailVerificationLink',
  ],
};
