# MindUnlocking API

Canonical routes are under `/api/v1`; compatibility aliases are under `/api`.

## Public

- `GET /api/v1` returns API metadata and links.
- `POST /api/v1/auth/register` creates a Firebase Authentication user, a Firestore `/users/{uid}` profile, default `scholar:access` permission claims, and an email verification link.
- `POST /api/v1/auth/verify-email` verifies a Firebase ID token and synchronizes `emailVerified`.
- `POST /api/v1/auth/login` accepts a Firebase Client SDK ID token; raw password verification is intentionally not performed by the backend.
- `POST /api/v1/auth/refresh` rotates backend-owned refresh sessions.
- `POST /api/v1/auth/forgot-password` generates a Firebase reset link; production responses do not expose it.
- `POST /api/v1/auth/reset-password` documents Firebase action-link completion.

## Authenticated

- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/revoke`
- `GET /api/v1/readiness/current` requires `scholar:access`.

## Health and docs

- `GET /health/live`
- `GET /health/ready`
- `GET /docs`

Errors use RFC 7807-style `application/problem+json` with `type`, `title`, `status`, `detail`, `traceId`, and optional validation `errors`.
