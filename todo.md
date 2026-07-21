# Functionality TODO / Audit

Last audited: 2026-07-21

## Status

All currently documented backend functionality is implemented and covered by automated checks. No incomplete documented route or service behavior was found during this audit.

## Completed functionality checklist

- [x] API metadata is available at `GET /api/v1` and compatibility alias `GET /api`.
- [x] Health probes are available at `GET /health/live` and `GET /health/ready`.
- [x] OpenAPI documentation is mounted at `GET /docs`.
- [x] Authentication endpoints are implemented:
  - [x] `POST /api/v1/auth/register`
  - [x] `POST /api/v1/auth/verify-email`
  - [x] `POST /api/v1/auth/login`
  - [x] `POST /api/v1/auth/refresh`
  - [x] `POST /api/v1/auth/forgot-password`
  - [x] `POST /api/v1/auth/reset-password`
  - [x] `GET /api/v1/auth/me`
  - [x] `POST /api/v1/auth/logout`
  - [x] `POST /api/v1/auth/revoke`
- [x] Learning endpoints are implemented and backed by seeded fallback content:
  - [x] `GET /api/v1/challenges`
  - [x] `GET /api/v1/challenges/{slugOrId}`
  - [x] `GET /api/v1/challenges/{slugOrId}/days`
  - [x] `GET /api/v1/resources`
  - [x] `GET /api/v1/teams`
  - [x] `GET /api/v1/learning-packs`
  - [x] `GET /api/v1/dashboard`
  - [x] `GET /api/v1/readiness`
  - [x] `GET /api/v1/readiness/prompts`
- [x] Authenticated readiness endpoint `GET /api/v1/readiness/current` requires `scholar:access`.
- [x] Compatibility aliases under `/api` are registered for auth, readiness, and learning routes.
- [x] RFC 7807-style Problem Details responses are implemented for validation, application, rate-limit, and unexpected errors.
- [x] CORS includes local development and the production Netlify frontend origin by default.
- [x] Secure headers and rate limiting are registered globally, with tighter auth endpoint limits.
- [x] Refresh sessions are hashed, rotated on use, revoked on logout/revoke, and reuse detection revokes active sessions.
- [x] Firebase user registration rolls back Authentication users if profile setup fails.
- [x] Firestore user mapping supplies safe defaults for MFA-related fields.
- [x] Outbox worker foundation exists for future asynchronous processing expansion.

## Verification commands

- [x] `npm test`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `npm run lint`
