# MIND UNLOCKING ACADEMY Backend TODO

## Current architecture summary

- Existing API is a Fastify + TypeScript service with Firebase Admin, Firestore repositories, Pino logging, Swagger, CORS, rate limiting, auth, learning, readiness, notifications, and worker entry points.
- The current code is not yet NestJS; preserve working Fastify code while migrating toward the required NestJS modular monolith.
- Existing tests cover auth flows, seeded learning endpoints, W1/W2 payload separation, content import authorization, notifications, and check-ins.

## Security and production gaps

- [x] Add complete environment contract and production fail-fast validation.
- [x] Normalize Firebase Admin private keys and initialize a single Admin app.
- [x] Verify Firebase ID tokens in request auth path and synchronize users from trusted backend data.
- [x] Add trusted role/permission defaults and ignore frontend-supplied roles.
- [ ] Complete NestJS migration with Fastify adapter, guards, decorators, modules, and DI.
- [ ] Replace legacy local JWT compatibility after Angular has fully moved to Firebase ID tokens.
- [ ] Add App Check enforcement where practical.
- [ ] Complete typed repository coverage for all Firestore collections.
- [ ] Add idempotent Firestore transaction workflows for question submission, check-ins, rewards, raffles, certificates, and notifications.
- [ ] Add emulator-backed integration and security-rule tests for every sensitive workflow.
- [ ] Complete Render background worker/cron split with Firestore job leases.
- [ ] Complete AI provider abstraction with approval/audit workflow.

## Incremental phases

### Phase 1 — Platform foundation

- [x] Inspect repository and preserve existing working API.
- [x] Create TODO.md with architecture summary and gaps.
- [x] Expand environment validation with Zod and `.env.example`.
- [x] Harden Firebase Admin initialization for production credentials and Cloud Storage config.
- [ ] Establish NestJS `src/main.ts` and `src/app.module.ts` around existing behavior.
- [ ] Add global exception filter, validation pipe parity, Swagger generation, and health checks in NestJS.

### Phase 2 — Auth, users, authorization

- [x] Update request authentication to verify Firebase ID tokens and sync user profiles.
- [x] Add trusted roles and default permissions.
- [x] Reject disabled/suspended/deleted app users.
- [x] Add `/api/v1/auth/sync`.
- [ ] Add NestJS `FirebaseAuthGuard`, `RolesGuard`, `PermissionsGuard`, decorators, and admin user-management endpoints.

### Phase 3+ — Product domains

- [ ] Implement full challenge/cohort/enrollment/team/learning-pack/capsule/question/attempt repositories.
- [ ] Implement W1/W2/W3 DTOs and transaction-protected answer submission at canonical routes.
- [ ] Implement check-ins, progress projections, readiness, scenarios, rehearsals, rewards, raffles, certificates, notifications, content review, reports, file management, audit, and AI modules.

## Missing requirement documentation

- Missing: full production NestJS backend and all business modules.
- Why: this change set performs the required first actions incrementally without deleting existing working code.
- Production risk: existing API remains partially functional but is not complete for the full 21-day challenge acceptance criteria.
- Next step: introduce NestJS with Fastify adapter and port existing route behavior behind Nest modules before expanding domain workflows.
