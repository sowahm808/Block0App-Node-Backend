# Admin learning-pack assignment UI guide

## Repository audit

This repository is the Node.js/Firebase API only. It contains no Angular workspace (`angular.json`),
standalone components, route configuration, `EndpointApi`, `api.types.ts`, `AuthStore`, or
`permissionGuard`. Consequently, the admin catalog UI cannot be safely changed here without
inventing a duplicate frontend structure. Apply the UI steps below in the existing Angular
repository.

The final catalog endpoint is `GET /api/v1/admin/learning-packs`. It reads `learningPacks`, not
`learningPackImports` or `contentReviews`. Scholar-facing `GET /api/v1/learning-packs` remains a
separate route. Assignments are stored in the existing `assignments` collection.

Backend files relevant to the integration are:

| Concern                                  | Existing file                                 |
| ---------------------------------------- | --------------------------------------------- |
| Final catalog and assignment HTTP routes | `src/modules/learning/learning.routes.ts`     |
| Import-only routes                       | `src/modules/learning/import.routes.ts`       |
| Firestore catalog/assignment repository  | `src/modules/learning/learning.repository.ts` |
| Roles and permissions                    | `src/modules/common/roles-permissions.ts`     |
| User repository and scholar roles        | `src/modules/users/users.repository.ts`       |
| API prefix                               | `src/app.ts` and `src/config/env.ts`          |
| Firestore access rules                   | `firestore.rules`                             |

## API contract

### Search scholars

`GET /api/v1/admin/scholars?search=<name-or-email>` requires `users.read` and returns:

```ts
export interface ScholarSummary {
  id: string;
  displayName: string;
  email: string;
  status?: string;
  cohortId?: string;
  cohortName?: string;
  teamId?: string;
  teamName?: string;
}

export interface ScholarListResponse {
  items?: ScholarSummary[];
  data?: ScholarSummary[];
  nextCursor?: string;
  total?: number;
}
```

Debounce search input, cancel stale calls with `switchMap`, and do not load or filter the entire
user directory in the browser.

### Assign

`POST /api/v1/admin/learning-packs/:learningPackId/assignments` requires
`learning_packs.assign`. Add these interfaces to the frontend's **existing** `api.types.ts`:

```ts
export interface LearningPackAssignmentRequest {
  learningPackId: string;
  scholarIds: string[];
  cohortId?: string;
  teamId?: string;
  startAtUtc?: string;
  dueAtUtc?: string;
  notes?: string;
  idempotencyKey: string;
}

export interface LearningPackAssignmentResult {
  learningPackId: string;
  requested: number;
  created: number;
  skipped: number;
  failed: number;
  assignments: Array<{ id: string; scholarId: string; status: string; createdAt?: string }>;
  errors?: Array<{ scholarId: string; message: string }>;
}
```

The body `learningPackId` must equal the route value. Send ISO-8601 UTC strings for dates. The due
date cannot precede the start date, scholar IDs must be unique, and one request supports at most
100 scholars. Generate one UUID when the user starts confirming and reuse it for retries; generate
a new key only after the form changes or the request completes.

The backend deterministically keys an assignment by learning pack and scholar. A repeated pair is
reported as `skipped`, while replaying the exact idempotency key returns the original result. Reusing
that key with a different body returns `409`.

## Angular implementation checklist

1. Find the route whose resolver/service calls `/admin/learning-packs`; that is the actual admin
   catalog. Do not edit “My Learning Packs”. Confirm its route uses the existing role and permission
   guard for `Administrator`/`SuperAdministrator` and `learning_packs.assign`.
2. Extend the existing `AdminLearningPackApiService` rooted at `/admin/learning-packs` with
   `assign(packId, request)`. Do not add another service or hard-code `/api/v1`; `ApiService` and
   `environment.apiBaseUrl` already own the prefix.
3. Use the existing admin user/scholar service for `/admin/scholars`. Use existing cohort,
   enrollment, and team APIs where present. A cohort or team selection is metadata; explicitly
   resolve its scholars and send `scholarIds` rather than assuming the backend expands membership.
4. Add a Material “Assign” button to each final-pack card. Open one standalone dialog component,
   passing the pack ID/title through `MAT_DIALOG_DATA`. Keep it compatible with `OnPush` by exposing
   view state as signals or `async`-consumed observables.
5. Build a typed reactive form for optional cohort, team, start date, due date, and notes. Maintain
   selected scholar IDs independently (for example, a `signal<Set<string>>`). Disable confirm when
   empty, invalid, or submitting. Announce validation and server failures accessibly; retain failed
   selections so administrators can retry.
6. On success, close with the result, show a snack-bar summary (`created`, `skipped`, `failed`), and
   update/refetch only catalog data. `GET /admin/learning-packs` exposes `assignmentCount`, so the
   card count refresh does not require a page navigation or reload.
7. Cover: debounced search, selection retention across searches, date ordering, double-submit
   prevention, exact idempotent retry, partial failures, cancel, keyboard focus restoration,
   permission-hidden controls, API success, `400`, `403`, `404`, `409`, and offline errors.

Do not display an unconditional success message when `failed > 0`. A response can create valid
assignments and report invalid/inactive scholars in `errors`; render the per-scholar failures and
allow a new request for only those scholars after correction.
