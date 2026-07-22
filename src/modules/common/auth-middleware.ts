import type { FastifyRequest } from 'fastify';
import { UnauthorizedError } from './errors.js';
import type { AuthService } from '../auth/auth.service.js';

const bearerPrefix = /^Bearer\s+/i;
const tokenCookieNames = ['accessToken', 'access_token', 'idToken', 'id_token'];

const parseCookieHeader = (cookieHeader: string | undefined): Record<string, string> => {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf('=');
        if (separatorIndex === -1) return [part, ''];
        const key = part.slice(0, separatorIndex).trim();
        const value = part.slice(separatorIndex + 1).trim();
        return [key, decodeURIComponent(value)];
      }),
  );
};

export const getAccessToken = (req: FastifyRequest): string | null => {
  const authorization = req.headers.authorization;
  if (authorization && bearerPrefix.test(authorization)) {
    const token = authorization.replace(bearerPrefix, '').trim();
    if (token) return token;
  }

  const headerToken = req.headers['x-access-token'] ?? req.headers['x-firebase-token'];
  const token = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  if (token?.trim()) return token.trim();

  const cookies = parseCookieHeader(req.headers.cookie);
  for (const cookieName of tokenCookieNames) {
    if (cookies[cookieName]) return cookies[cookieName];
  }

  return null;
};

export const authenticate = (authService: AuthService) => async (req: FastifyRequest) => {
  const token = getAccessToken(req);
  if (!token) throw new UnauthorizedError();
  req.user = await authService.verifyAccessToken(token).catch(() => {
    throw new UnauthorizedError();
  });
};
