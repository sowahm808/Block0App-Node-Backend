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
- `GET /api/v1/rewards` returns seeded active rewards for frontend reward dashboards. Legacy alias: `GET /rewards`.
- `GET /api/v1/certificates` returns seeded learner certificates for frontend credential screens. Legacy alias: `GET /certificates`.
- `GET /api/v1/raffle-entries` returns seeded raffle entries for frontend rewards screens. Legacy alias: `GET /raffle-entries`.
- `GET /api/v1/challenges/current/program` requires authenticated `scholar:access` and returns the active scholar's cohort-timezone-adjusted 21-day program structure with phase totals, day statuses, locks, daily targets, completion, knowledge-pack/question counts, scenario volumes, rehearsal focus, and rest-day guidance.
- `GET /api/v1/dashboard` requires authenticated `scholar:access` and returns the current scholar challenge dashboard with `enrollmentState` values for `active`, `not_enrolled`, `not_started`, and `completed`. Compatibility aliases `/api/v1/mentor/dashboard`, `/api/v1/review/dashboard`, and `/api/v1/admin/dashboard` continue to return the seeded dashboard summary for legacy screens.
- `GET /api/v1/admin/system-settings` returns frontend-safe system settings and feature flags for admin screens.
- `GET /api/v1/review/content` returns content-review queue items enriched with their associated content metadata.
- `GET /api/v1/review/questions` returns reviewable questions enriched with review status and explanation metadata. Compatibility aliases include `/api/review/questions` and `/review/questions`.
- `GET /api/v1/readiness` returns a seeded readiness summary.
- `GET /api/v1/readiness/prompts` returns seeded daily readiness prompts.
- `POST /api/v1/check-ins` saves an authenticated learner check-in with optional day, mood, energy, confidence, stress, notes, and challenge metadata.
- `POST /api/v1/check-ins/morning` requires authenticated `scholar:access` and creates or idempotently updates the scholar's completed morning check-in for the active challenge day. The request accepts `kind: "morning"`, confidence `1-10`, a capsule `goal` within the active day's allowed range, `needSupport`, optional obstacle/support description text up to 500 characters, and support categories of `Academic`, `Technical`, `Time management`, `Motivation`, `Personal`, or `Other`. Validation failures use the shared problem-details envelope with field-level errors, including allowed `goalMin` and `goalMax` when the goal is rejected. When support is needed, the backend creates or links a `morning_check_in` support request and returns the successful check-in payload with `studyPlanReady: true`.
- `GET /api/v1/check-ins/evening/summary` requires authenticated `scholar:access` and returns backend-calculated read-only progress counts for the active scholar on the cohort-local date: completed capsules, answered questions, recorded study minutes, and questions marked for review.
- `POST /api/v1/check-ins/evening` requires authenticated `scholar:access` and creates or idempotently updates the scholar's completed evening check-in for the active challenge day. The request accepts writable reflection fields only: `kind: "evening"`, confidence `1-10`, `goalMet` (`Yes`, `Partially`, or `No`), optional non-negative support counts, tomorrow's `goal` within the active day's allowed range, and optional reflection text up to 500 characters. Manually supplied progress counts such as completed capsules or completed questions are rejected instead of persisted.
- `POST /api/v1/auth/register` creates a Firebase Authentication user, a Firestore `/users/{uid}` profile, default `scholar:access` permission claims, and an email verification link. Registration accepts the full onboarding payload: `displayName`, `email`, `password`, `country`, `timeZone`, optional `primaryStudyDevice`, `acceptedTerms`, and `acceptedPrivacyPolicy`. Emails are normalized to lowercase; `displayName` is trimmed to 2-100 characters; `country` must be a supported ISO 3166-1 alpha-2 code; `timeZone` must be a valid IANA identifier; `primaryStudyDevice` must be `phone`, `tablet`, `laptop`, `desktop`, or `null`; both acceptance booleans must be `true` and are persisted with timestamps and policy versions.
- `POST /api/v1/auth/verify-email` verifies a Firebase ID token and synchronizes `emailVerified`.
- `POST /api/v1/auth/firebase/resync` accepts a freshly refreshed Firebase ID token after client-side email verification, requires `email_verified`, synchronizes the local user, and returns the same backend token DTO as login/refresh.
- `POST /api/v1/auth/login` accepts a Firebase Client SDK ID token; raw password verification is intentionally not performed by the backend.
- `POST /api/v1/auth/refresh` rotates backend-owned refresh sessions.
- `POST /api/v1/auth/forgot-password` normalizes the email, requests a Firebase reset link when possible, and always returns `204 No Content` to avoid account enumeration.
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
