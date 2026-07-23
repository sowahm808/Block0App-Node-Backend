# Mind Unlocking Academy — WhisperWrap Block Zero Backend

Production-oriented Node.js/TypeScript rebuild of the Block Zero backend foundation for a 21-day medical exam preparation challenge.

## Stack

- Node.js 22 LTS, TypeScript, Fastify
- Firebase Admin SDK with Firebase Authentication
- Cloud Firestore repositories for users, refresh sessions, learning sample data, and outbox-ready storage
- Zod validation, Pino logs, Problem Details errors, rate limiting, secure headers, OpenAPI docs
- Vitest tests and a production Dockerfile

## Development

```bash
npm install
cp .env.example .env
npm run dev
```

## CI checks

```bash
npm run format
npm run lint
npm run typecheck
npm test
npm run build
```

## Authentication flow

Clients sign in with the Firebase Client SDK, then submit the Firebase ID token to `POST /api/v1/auth/login`. The backend verifies that token with Firebase Admin, requires verified email, syncs the Firestore user profile, and issues a backend JWT plus a secure opaque refresh token. After a learner verifies email in Firebase, clients can force-refresh the Firebase ID token and call `POST /api/v1/auth/firebase/resync` to synchronize local `emailVerified` state and receive the same backend token DTO. Refresh tokens are stored only as SHA-256 hashes in `/refreshSessions` and rotate on every use. Reuse of a revoked refresh token revokes active sessions for that user.

## Migration notes from .NET 8

This implementation preserves the .NET foundation concepts: modular API/Application/Infrastructure boundaries are represented as Fastify routes, framework-independent services, and Firestore repositories; ProblemDetails-style responses and health endpoints are retained; Firebase-backed users, permission authorization, rate limiting, secure headers, OpenAPI documentation, and an outbox-worker foundation are included. Future learning-domain modules should follow the same `modules/<domain>` route/service/repository split.

The application seeds the learning collections (`challenges`, `challengeDays`, `resources`, `teams`, `learningPacks`, `dashboard`, `readiness`, and `readinessPrompts`) on startup so the frontend can call `/api/v1/challenges` immediately after deployment. Authenticated learners can save daily wellness/study check-ins with `POST /api/v1/check-ins`.

See [API.md](./API.md) for route contracts.
