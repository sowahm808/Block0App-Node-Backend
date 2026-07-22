export interface RefreshSession {
  sessionId: string;
  userId: string;
  tokenHash: string;
  createdUtc: Date;
  expiresUtc: Date;
  revokedUtc: Date | null;
  revocationReason: string | null;
  rotatedToSessionId: string | null;
}
export interface AuthenticatedPrincipal {
  uid: string;
  email?: string;
  permissions: string[];
  role?: string;
  roles?: string[];
  emailVerified?: boolean;
}
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedPrincipal;
  }
}
