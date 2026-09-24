---
id: 2026-09-24-coolify-portal-mvp-design
title: Coolify Portal MVP Design
status: implemented
owner: architect
date: 2026-09-24
decision_record: docs/decisions/DEC-20260924-01.md
adr: docs/adr/0001-coolify-portal-mvp-architecture.md
---

# Coolify Portal MVP Design

## Implementation Plan

### Summary

Build a private, single-tenant deployment portal as a Next.js App Router monolith. Auth.js handles GitHub OAuth and database sessions. Prisma stores portal data in persistent SQLite. A server-only adapter performs a narrow set of Coolify operations.

The portal accepts only pre-authorized GitHub logins. Administrators manage access grants. Users deploy repositories owned by configured GitHub owners and view their own deployments. Coolify remains the deployment engine and GitHub webhook receiver.

This implementation changes more than three files. Treat Phase 4 as high-risk and require explicit design approval before code-writer dispatch.

### Scope

Included:

- GitHub OAuth sign-in through Auth.js.
- Bootstrap administrator creation from `BOOTSTRAP_GITHUB_LOGIN`.
- Active and inactive access grants with `ADMIN` and `USER` roles.
- Private GitHub repository deployments through the configured Coolify GitHub App.
- Deployment status polling, generated URLs, and failure summaries.
- Push-triggered redeployments managed by Coolify.
- Per-deployment HTTP Basic Authentication.
- Persistent SQLite storage and audit logs.

Excluded:

- GitLab, email invitations, multiple tenants, and fine-grained permissions.
- Preview deployments, live logs, custom domains, and environment-variable management.
- Arbitrary Docker options, Compose input, privileged containers, and user-provided secrets.
- Application deletion, rollback, cancellation, or server management.

### Assumptions and resolved ambiguities

1. Use Bun for dependency management and test commands. Run the Next.js standalone server on Node.js in the production image.
2. Use Next.js App Router and Node runtime for Auth.js, Prisma, crypto, and Coolify calls.
3. Use database sessions. Recheck the database role and status for each privileged operation.
4. Model administrator-added users as `AccessGrant` records. Create or link the Auth.js `User` on first successful sign-in.
5. Treat `BOOTSTRAP_GITHUB_LOGIN` as an implicit active administrator grant. Persist it during the first successful login.
6. Map form value `AUTO` to Coolify `nixpacks`. Keep `NIXPACKS` and `DOCKERFILE` as explicit choices.
7. Use Coolify environment name `production` by default. Allow `COOLIFY_ENVIRONMENT_NAME` to override it.
8. Create an application first. Start its first deployment with a separate deployment request to capture the deployment UUID.
9. Generate HTTP Basic Authentication credentials on the server. Encrypt the password before database storage.
10. Use separate Coolify tokens for read, write, and deploy permissions when the installed Coolify version supports them.
11. Keep one portal replica while SQLite is in use. Do not enable horizontal scaling.

### Architecture and boundaries

```text
Browser
  -> Next.js pages and server actions
     -> Auth.js GitHub OAuth
     -> authorization service
     -> Prisma -> /data/portal.db
     -> Coolify client -> self-hosted Coolify /api/v1
                           -> GitHub App -> repository and push webhooks
                           -> Docker runtime -> deployed application
```

| Boundary | Responsibility | Prohibited behavior |
|---|---|---|
| Browser | Render forms, poll portal status, show URLs | Receive Coolify tokens or call Coolify directly |
| Auth layer | Authenticate GitHub identity and create database sessions | Grant access from email alone |
| Authorization layer | Enforce role, active status, and deployment ownership | Trust client-supplied roles or owners |
| Deployment service | Validate input and coordinate the deployment lifecycle | Accept raw Coolify payloads or Docker options |
| Coolify client | Send typed requests with timeouts and redacted errors | Expose bearer tokens or sensitive responses |
| Prisma repository | Persist identity, deployment, audit, and rate-limit state | Store plaintext application passwords |
| Coolify | Create applications, deploy, receive GitHub webhooks, route traffic | Manage portal users or portal authorization |

### Files to change

| File or module | Action | Description |
|---|---|---|
| `package.json`, `bun.lock` | modify | Add application, authentication, validation, ORM, and test dependencies. Preserve governance scripts. |
| `.env.sample` | modify | Document placeholders only. Add no real values. |
| `next.config.ts`, `tsconfig.json`, `eslint.config.mjs` | create | Configure the Next.js application and strict TypeScript. |
| `Dockerfile` | create | Build with Bun and run the standalone server as a non-root Node user. |
| `prisma/schema.prisma` | create | Define Auth.js, access, deployment, audit, and rate-limit tables. |
| `prisma/migrations/*` | create | Add the reviewed SQLite migration. |
| `src/auth.ts` | create | Configure GitHub OAuth, database sessions, callbacks, and events. |
| `src/lib/auth/adapter.ts` | create | Wrap the Prisma adapter and omit unused OAuth bearer tokens from persistence. |
| `src/lib/auth/authorization.ts` | create | Provide `requireUser`, `requireAdmin`, and ownership checks. |
| `src/lib/db.ts` | create | Create the singleton Prisma client and SQLite settings. |
| `src/lib/env.ts` | create | Validate server environment variables at startup. |
| `src/lib/validation/*` | create | Define Zod schemas for every external input. |
| `src/lib/coolify/client.ts` | create | Implement the allowlisted Coolify operations and response schemas. |
| `src/lib/deployments/service.ts` | create | Implement provisioning, reconciliation, polling, and status mapping. |
| `src/lib/security/crypto.ts` | create | Encrypt and decrypt Basic Authentication passwords with AES-256-GCM. |
| `src/lib/security/rate-limit.ts` | create | Enforce persisted fixed-window limits with SQLite transactions. |
| `src/lib/audit.ts` | create | Write structured, redacted audit events. |
| `src/app/api/auth/[...nextauth]/route.ts` | create | Expose Auth.js handlers with rate-limit guards. |
| `src/app/api/deployments/[id]/status/route.ts` | create | Return an authorized, cached status projection for polling. |
| `src/app/api/health/live/route.ts` | create | Return process liveness without secret values. |
| `src/app/api/health/ready/route.ts` | create | Check database readiness without depending on Coolify availability. |
| `src/app/(auth)/login/*` | create | Render sign-in and access-denied states. |
| `src/app/(portal)/dashboard/*` | create | Render the deployment form and recent deployments. |
| `src/app/(portal)/deployments/[id]/*` | create | Render deployment state, URL, errors, and credential reveal control. |
| `src/app/(portal)/admin/users/*` | create | Manage access grants, roles, and activation. |
| `src/app/(portal)/admin/audit-logs/*` | create | Render paginated audit events. |
| `src/app/actions/*.ts` | create | Implement validated server actions for deployments and administration. |
| `src/components/*`, `src/app/globals.css` | create | Implement the approved UI specification and design tokens. |
| `tests/unit/*`, `tests/integration/*`, `tests/e2e/*` | create | Cover contracts, authorization, persistence, and critical journeys. |

The designer must produce the UI specification before component implementation begins.

## Data model

### Enumerations

```text
Role = ADMIN | USER
UserStatus = ACTIVE | INACTIVE
BuildPack = AUTO | NIXPACKS | DOCKERFILE
DeploymentStatus = REQUESTED | PROVISIONING | QUEUED | IN_PROGRESS | HEALTHY | FAILED | CANCELLED | UNKNOWN
```

### Prisma entities

| Entity | Required fields and constraints |
|---|---|
| `User` | Auth.js fields; `githubId String? @unique`; `githubLogin String? @unique`; `role`; `status`; `lastLoginAt`; timestamps |
| `Account` | Standard Auth.js composite identity; unique provider and provider account ID; omit unused provider bearer tokens before persistence |
| `Session` | Standard Auth.js session token; unique token; indexed user and expiry |
| `VerificationToken` | Standard Auth.js compatibility model; unused by the GitHub-only MVP |
| `AccessGrant` | `id`; normalized `githubLogin @unique`; `role`; `status`; optional linked `userId @unique`; creator; timestamps |
| `Deployment` | owner; normalized repository; branch; requested and actual names; port; build pack; Coolify application UUID; latest deployment UUID; status; URL; sanitized failure; encrypted Basic password fields; idempotency key; poll time; timestamps |
| `AuditLog` | nullable actor; action; outcome; target type and ID; request ID; IP address; redacted JSON metadata; timestamp |
| `RateLimitBucket` | unique subject, action, and window start; count; expiry |

Indexes:

- Index `Deployment(userId, createdAt)` for owned history.
- Index `Deployment(status, lastPolledAt)` for refresh work.
- Index `AuditLog(createdAt)` and `AuditLog(action, createdAt)` for administration.
- Index `RateLimitBucket(expiresAt)` for cleanup.

SQLite settings:

- Mount `/data` as a persistent Coolify volume.
- Use `DATABASE_URL=file:/data/portal.db`.
- Enable WAL mode, foreign keys, and a bounded busy timeout at startup.
- Run one application replica.
- Run migrations before accepting traffic.

## Authentication and authorization

### Sign-in flow

1. Rate-limit the sign-in initiation by hashed client IP.
2. Authenticate with GitHub through Auth.js.
3. Normalize `profile.login` to lowercase.
4. Accept the configured bootstrap login as `ADMIN`.
5. Otherwise require an active matching `AccessGrant`.
6. Bind the Auth.js user to the grant after successful authentication.
7. Copy the grant role and status to `User`.
8. Create a database session with Secure, HttpOnly, and SameSite=Lax cookies.
9. Record success or denial without OAuth tokens.

Unknown identities receive an access-denied response. A denied adapter-created user remains inactive and has no session. A maintenance task may remove unlinked inactive identities after retention review.

### Enforcement matrix

| Operation | `USER` | `ADMIN` |
|---|---:|---:|
| View dashboard | Yes | Yes |
| Create deployment | Yes | Yes |
| View or refresh owned deployment | Yes | Yes |
| View or refresh another user's deployment | No | Yes |
| Reveal owned Basic Authentication password | Yes | Yes |
| Manage access grants | No | Yes |
| View audit logs | No | Yes |

Every server action and route handler calls an authorization helper. Middleware or `proxy.ts` provides only coarse navigation protection. Deactivation deletes the user's sessions in the same database transaction.

## Portal contracts

All failures use a stable public error code. Logs retain a request ID and sanitized diagnostic text.

### Server actions

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; fieldErrors?: Record<string, string[]> } }
```

| Action | Input | Authorization | Success data |
|---|---|---|---|
| `createDeployment` | repository, branch, applicationName, port, buildPack, idempotencyKey | active user | deployment ID and status |
| `revealBasicAuth` | deployment ID | owner or admin | username and password; never cache |
| `createAccessGrant` | GitHub login, role | admin | grant summary |
| `updateAccessGrantRole` | grant ID, role | admin | grant summary |
| `setAccessGrantStatus` | grant ID, status | admin | grant summary |

### Route handlers

| Method and path | Contract |
|---|---|
| `GET /api/deployments/:id/status` | Return owned or admin-visible status. Poll Coolify only when the three-second lease expired. Set `Cache-Control: no-store`. |
| `GET|POST /api/auth/*` | Delegate to Auth.js. Apply authentication rate limits and safe redirects. |
| `GET /api/health/live` | Return process state only. |
| `GET /api/health/ready` | Return failure when SQLite is unavailable or migrations are incomplete. |

### Deployment input validation

- Accept repository as `owner/name` only.
- Match the normalized owner against `ALLOWED_GITHUB_OWNERS`.
- Restrict branch input to a safe Git-ref subset and 255 characters.
- Restrict application names to lowercase letters, numbers, and hyphens.
- Accept ports from 1 through 65535.
- Accept only `AUTO`, `NIXPACKS`, or `DOCKERFILE`.
- Reject unknown fields.
- Ignore all client-provided resource limits, domains, credentials, and Docker options.

## Coolify API contract

The client appends `/api/v1` to the trusted `COOLIFY_BASE_URL`. It sends bearer tokens only from the server. It validates every response with Zod.

| Purpose | Coolify operation | Required portal behavior |
|---|---|---|
| Create application | `POST /applications/private-github-app` | Supply fixed project, server, environment, GitHub App, limits, auto-deploy, and Basic Authentication fields. |
| Start deployment | `POST /deploy` with application UUID | Save the returned deployment UUID. Use `force=false`. |
| Get one deployment | `GET /deployments/{uuid}` | Map Coolify states to portal states. Do not return logs to users. |
| Reconcile push deploys | `GET /deployments/applications/{applicationUuid}` | Select the newest deployment and update the local projection. |
| Reconcile ambiguous create | `GET /applications?tag={portalTag}` | Match the deterministic portal tag before retrying creation. |

Fixed application creation values:

```text
project_uuid = COOLIFY_PROJECT_UUID
server_uuid = COOLIFY_SERVER_UUID
environment_name = COOLIFY_ENVIRONMENT_NAME (default: production)
github_app_uuid = COOLIFY_GITHUB_APP_UUID
limits_cpus = "0.5"
limits_memory = "512m"
is_auto_deploy_enabled = true
is_preview_deployments_enabled = false
is_http_basic_auth_enabled = true
autogenerate_domain = true
custom_docker_run_options = omitted
instant_deploy = false
```

`AUTO` maps to `nixpacks`. `DOCKERFILE` maps to `dockerfile`. The request includes a deterministic portal tag and application name suffix.

### Timeouts and retries

- Use a short connection timeout and a bounded total timeout.
- Retry idempotent reads for network failures and selected 5xx responses.
- Honor `Retry-After` on 429 responses.
- Do not blindly retry application creation or deployment start.
- Reconcile an ambiguous create through the deterministic tag.
- Require manual recovery when reconciliation finds multiple resources.

The current Coolify API documents application creation fields, deployment operations, rate-limit headers, and permission scopes. Verify these contracts against installed version `4.3.23` before implementation.

## Deployment lifecycle

```text
REQUESTED
  -> PROVISIONING
  -> QUEUED
  -> IN_PROGRESS
  -> HEALTHY
  -> FAILED | CANCELLED | UNKNOWN
```

1. Validate input and authorization.
2. Consume the deployment rate-limit bucket.
3. Insert `Deployment` with a unique idempotency key.
4. Write `DEPLOYMENT_REQUESTED` in the same transaction.
5. Generate Basic Authentication credentials.
6. Encrypt the password with AES-256-GCM and a unique nonce.
7. Create the Coolify application with fixed safety controls.
8. Persist the Coolify application UUID.
9. Start the first deployment and persist its UUID.
10. Poll through the portal status endpoint every three seconds while active.
11. Stop automatic polling at a terminal state.
12. Refresh on page focus or explicit user action after a terminal state.

Coolify receives GitHub push webhooks and deploys the same application. The portal reconciles the newest application deployment and retains the same application URL. A failed build must not be reported as healthy. Coolify health-check configuration remains responsible for preserving a healthy replacement path.

## Rate limiting

Persist fixed-window counters in SQLite so restarts do not reset protection.

| Operation | Limit | Subject |
|---|---:|---|
| Sign-in initiation | 5 per 15 minutes | HMAC of client IP |
| OAuth callback | 20 per 15 minutes | HMAC of client IP |
| Deployment creation | 3 per 10 minutes | User ID |
| Deployment creation | 20 per day | User ID |
| Admin mutations | 30 per minute | Admin user ID |
| Coolify status fetch | 1 per 3 seconds | Deployment ID |

Return 429 with `Retry-After`. Do not reveal whether a GitHub login exists.

## Audit logging

Record these actions with `SUCCESS`, `DENIED`, or `FAILURE` outcomes:

- Authentication success, denial, and sign-out.
- Access grant creation, role change, activation, and deactivation.
- Deployment request, application creation, deployment start, terminal status, and reconciliation failure.
- Basic Authentication credential reveal.
- Rate-limit denial and authorization denial.

Never record OAuth tokens, Coolify tokens, Basic Authentication passwords, cookies, encryption keys, raw request bodies, or full Coolify error bodies. Metadata uses an allowlist and size limit.

## Secrets and environment

Required application variables:

```env
AUTH_SECRET=
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
BOOTSTRAP_GITHUB_LOGIN=JJiseong
DATABASE_URL=file:/data/portal.db
APP_ENCRYPTION_KEY=
ALLOWED_GITHUB_OWNERS=JJiseong
COOLIFY_BASE_URL=
COOLIFY_READ_API_TOKEN=
COOLIFY_WRITE_API_TOKEN=
COOLIFY_DEPLOY_API_TOKEN=
COOLIFY_PROJECT_UUID=
COOLIFY_SERVER_UUID=
COOLIFY_GITHUB_APP_UUID=
COOLIFY_ENVIRONMENT_NAME=production
```

Use the legacy `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `COOLIFY_API_TOKEN` names only during a documented migration. Do not support both configurations silently.

Operational controls:

- Store production values in Coolify secrets.
- Use separate Coolify tokens with `read`, `write`, and `deploy` permissions.
- Do not grant `read:sensitive` or `root`.
- Restrict self-hosted API access to the portal's observed source address.
- Rotate tokens and the OAuth client secret on a documented schedule.
- Version encrypted password records to support encryption-key rotation.
- Re-encrypt all password records before removing an old key.

## Backup and recovery

- Store the database on `/data` through a persistent volume.
- Create a consistent SQLite backup at least daily.
- Upload encrypted backups to a private S3 bucket through an EC2 instance role.
- Keep backup credentials outside application environment variables.
- Define retention before launch.
- Restore a backup into a separate path before the production cutover.
- Record the restore test date and result.

## Accessibility

Target WCAG 2.1 Level AA and review the seven Universal Design principles.

- Support all actions by keyboard with visible focus.
- Use native landmarks, headings, labels, tables, and buttons.
- Give icon-only controls accessible names.
- Announce deployment status changes through a polite live region.
- Pair every status color with text and an icon.
- Meet 4.5:1 text contrast and 3:1 component contrast.
- Respect `prefers-reduced-motion` for status transitions.
- Preserve focus after form errors and credential reveal actions.
- Use confirmation for deactivation and explain recovery.
- Keep touch targets at least 44 by 44 CSS pixels where practical.

Verification uses automated axe-core checks, Playwright keyboard paths, and a manual screen-reader review.

## Test plan

| Level | Coverage |
|---|---|
| Unit | Zod schemas, owner allowlist, status mapping, authorization, crypto round trips, audit redaction, rate limits |
| Integration | Prisma migrations, grant binding, session revocation, ownership checks, idempotency, polling lease, audit transactions |
| Coolify contract | Mock documented success and failure responses; validate Zod parsing and redaction |
| End-to-end | Access denial, admin grant management, user deployment, owned visibility, admin visibility, credential reveal, keyboard paths |
| Staging smoke | Real GitHub OAuth, private test repository, initial deployment, push redeploy, failed build, same URL, persistent restart |
| Security | Secret scan, dependency audit, authorization matrix, CSRF behavior, cookie attributes, response-header review |

Do not call the live Coolify instance from unit or integration tests. Run the staging smoke suite only with explicit credentials and approval.

## Rollout

1. Confirm Coolify `4.3.23` supports every selected endpoint and field.
2. Create scoped Coolify API tokens and test revocation.
3. Confirm project, server, environment, and GitHub App identifiers.
4. Complete the UI specification and accessibility review.
5. Implement migrations, services, UI, and tests in the approved order.
6. Deploy the portal with one replica and `/data` persistence.
7. Sign in as `JJiseong` and verify bootstrap administration.
8. Deploy the private test repository.
9. Push a successful change and confirm the same URL updates.
10. Push a failing change and confirm the healthy version remains available.
11. Restart the portal container and verify SQLite persistence.
12. Complete and record an external backup restore test.

Rollback removes portal traffic without deleting Coolify-created applications. Restore the previous portal image and compatible database backup. Database migrations must include a tested backward plan before production use.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| EC2 capacity is near minimum | Builds or portal may become unavailable | Enforce limits, serialize creation bursts, monitor disk and memory, keep prototype classification |
| SQLite write contention | Requests may fail under concurrency | One replica, WAL, short transactions, busy timeout, bounded retries |
| Coolify API drift | Provisioning may fail or misconfigure apps | Pin tested Coolify version, validate responses, run contract smoke before rollout |
| Ambiguous write timeout | Duplicate applications may appear | Use idempotency keys, deterministic tags, and reconciliation before retry |
| Compromised portal | Coolify control plane may be affected | Scoped tokens, IP allowlist, server-only client, no root permission |
| OAuth identity mismatch | Unauthorized access | Authorize immutable GitHub ID after first binding; use login only for the pending grant |
| Key loss | Stored Basic Authentication passwords become unreadable | Back up keys separately and test key rotation |
| Backup failure | Portal identity and audit data may be lost | External encrypted backup, alerts, and restore drills |

## Trade-offs considered

| Option | Benefit | Cost | Decision |
|---|---|---|---|
| Next.js monolith | Small deployment surface and shared types | Tighter coupling | Choose for MVP |
| Separate API service | Strong service boundary | More deployment and operational overhead | Defer |
| SQLite | Minimal operations and persistent local storage | Single-replica constraint | Choose for prototype |
| PostgreSQL | Better concurrency and scaling | More resources and administration | Defer until scale requires it |
| Database sessions | Immediate revocation and server-side state | Database lookup per request | Choose for deactivation safety |
| JWT sessions | Lower database traffic | Harder immediate revocation | Reject |
| Direct browser-to-Coolify | Less portal code | Exposes privileged boundary | Reject |
| One root Coolify token | Simple configuration | Excess privilege | Reject |
| Scoped Coolify tokens | Least privilege | More secret rotation work | Choose |

## Cross-platform considerations

- Windows development uses PowerShell commands and forward-compatible Prisma paths.
- Unix development uses the same Bun scripts without shell-specific wrappers.
- Production uses a Linux container and a POSIX volume path.
- Normalize repository paths and never depend on host path separators.

## Platform Impact

| Platform | Impact | Files Affected |
|---|---|---|
| Claude Code | None. The design changes application artifacts, not Claude instructions. | N/A |
| Antigravity (`GEMINI.md`) | None. The same repository design is platform-neutral and needs no Gemini instruction change. | N/A |
| `templates/common` | None. This is project-specific application design and must not propagate to templates. | N/A |

## Acceptance criteria

- [ ] `JJiseong` signs in as the bootstrap administrator. (Requires real GitHub OAuth credentials.)
- [x] A GitHub identity without an active grant receives no portal session in the Auth.js callback path.
- [x] An administrator can create, deactivate, reactivate, and change access grants through validated server actions.
- [x] Deactivation revokes existing sessions in the same transaction.
- [ ] A user deploys an allowed private GitHub repository. (Requires a configured Coolify instance and scoped tokens.)
- [x] The Coolify create payload fixes CPU at 0.5 and memory at 512 MB.
- [x] The Coolify create payload enables HTTP Basic Authentication and automatic deployments.
- [x] The portal persists deployment status, sanitized failures, and generated URLs.
- [ ] A Git push updates the same application URL.
- [ ] A failed deployment does not replace the previous healthy application.
- [x] Users cannot view or refresh deployments owned by other users. (Loopback route smoke covers both deployment detail and status API ownership boundaries.)
- [ ] The browser never receives a Coolify bearer token. (Production browser bundles are scanned in CI; live browser network inspection remains a staging task.)
- [x] Audit logs contain authentication, user management, deployment (including push-failure transitions), and credential reveal events; integration tests also verify revealed passwords are excluded from audit metadata.
- [x] SQLite data survives a process restart when `/data` is mounted; migration/readiness checks are covered by integration tests.
- [ ] An encrypted external backup completes a documented restore test.
- [ ] Automated and manual accessibility checks meet WCAG 2.1 AA targets. (Authenticated/public axe scans pass with zero violations; Playwright keyboard/viewport and manual screen-reader review remain.)
- [ ] Unit, integration, end-to-end, audit, dependency, and secret checks pass. (Unit/integration/audit/dependency checks pass; external e2e and gitleaks remain.)

## Open questions

No question blocks design completion.

Before implementation rollout, the owner must provide or confirm:

- The exact Coolify project, server, environment, and GitHub App identifiers.
- The observed source address for the Coolify API allowlist.
- The private S3 backup bucket and retention policy.
- The Basic Authentication username convention.

## References

- [Coolify portal prototype handoff](../../memory/2026-09-22-coolify-portal-prototype-handoff.md)
- [Coolify API overview](https://coolify.io/docs/api/overview)
- [Create private GitHub App application](https://coolify.io/docs/api/endpoints/applications/create-private-github-app-application)
- [Deploy by application UUID](https://coolify.io/docs/api/endpoints/deployments/deploy-by-tag-or-uuid)
- [Get deployment by UUID](https://coolify.io/docs/api/endpoints/deployments/get-deployment-by-uuid)
- [Coolify API permissions](https://coolify.io/docs/api/permissions)
- [Coolify API rate limits](https://coolify.io/docs/api/rate-limits)
- [Coolify API IP allowlist](https://coolify.io/docs/api/ip-allowlist)
- [Auth.js adapter reference](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/adapters.ts)
- [Staging smoke runbook](../runbooks/coolify-portal-staging-smoke.md)
