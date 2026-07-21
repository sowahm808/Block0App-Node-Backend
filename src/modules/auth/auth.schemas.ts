import { z } from 'zod';
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(100),
});
export const verifyEmailSchema = z.object({ email: z.string().email(), token: z.string().min(10) });
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().optional(),
  mfaCode: z.string().optional(),
  firebaseIdToken: z.string().min(10),
});
export const refreshSchema = z.object({ refreshToken: z.string().min(32) });
export const forgotPasswordSchema = z.object({ email: z.string().email() });
export const resetPasswordSchema = z.object({ email: z.string().email().optional() }).passthrough();
export const revokeSchema = z.object({
  refreshToken: z.string().min(32),
  reason: z.string().max(200).default('user_revoke'),
});
