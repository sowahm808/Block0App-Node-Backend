# MindUnlocking API

Canonical routes are under `/api/v1`; compatibility aliases are under `/api`. Public learning routes are also available without a prefix for legacy frontend builds that request paths such as `/learning-packs` from the configured API origin.

## Public

- `GET /api/v1` returns API metadata and links.
- `GET /api/v1/challenges` returns seeded published challenges.
- `GET /api/v1/challenges/{slugOrId}` returns one seeded challenge.
- `GET /api/v1/challenges/{slugOrId}/days` returns the 21 seeded daily challenge plans.
- `GET /api/v1/resources` returns seeded learning resources.
- `GET /api/v1/teams` returns seeded study teams.
- `GET /api/v1/learning-packs` returns seeded learning packs. Legacy alias: `GET /learning-packs`.
- `GET /api/v1/dashboard` returns a seeded dashboard summary. Compatibility aliases include `/api/v1/mentor/dashboard`, `/api/v1/review/dashboard`, and `/api/v1/admin/dashboard`.
- `GET /api/v1/review/content` returns content-review queue items enriched with their associated content metadata.
- `GET /api/v1/readiness` returns a seeded readiness summary.
- `GET /api/v1/readiness/prompts` returns seeded daily readiness prompts.
- `POST /api/v1/check-ins` saves an authenticated learner check-in with optional day, mood, energy, confidence, stress, notes, and challenge metadata.
- `POST /api/v1/auth/register` creates a Firebase Authentication user, a Firestore `/users/{uid}` profile, default `scholar:access` permission claims, and an email verification link.
- `POST /api/v1/auth/verify-email` verifies a Firebase ID token and synchronizes `emailVerified`.
- `POST /api/v1/auth/login` accepts a Firebase Client SDK ID token; raw password verification is intentionally not performed by the backend.
- `POST /api/v1/auth/refresh` rotates backend-owned refresh sessions.
- `POST /api/v1/auth/forgot-password` generates a Firebase reset link; production responses do not expose it.
- `POST /api/v1/auth/reset-password` documents Firebase action-link completion.

## Authenticated

- `GET /api/v1/auth/me`
- `GET /api/v1/profile` returns the authenticated learner profile. Compatibility alias: `GET /api/profile`.
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/revoke`
- `GET /api/v1/readiness/current` requires `scholar:access`.

## Health and docs

- `GET /api/v1/health` returns a lightweight liveness response for frontend deployments. Compatibility alias: `GET /api/health`.
- `GET /health/live`
- `GET /health/ready`
- `GET /docs`

Authenticated endpoints accept backend access tokens or Firebase ID tokens in the standard `Authorization: Bearer <token>` header. For browser clients and compatibility routes, the same shared authentication middleware also accepts lowercase bearer schemes, `x-access-token`, `x-firebase-token`, or token cookies named `accessToken`, `access_token`, `idToken`, or `id_token`.

Errors use RFC 7807-style `application/problem+json` with `type`, `title`, `status`, `detail`, `traceId`, and optional validation `errors`.
