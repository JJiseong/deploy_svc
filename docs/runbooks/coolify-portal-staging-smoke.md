---
title: Coolify Portal staging smoke runbook
status: ready-for-secrets
date: 2026-09-24
---

# Coolify Portal staging smoke runbook

This runbook is for an operator with access to the GitHub OAuth application, the
Coolify instance, and the deployment platform secret store. Never paste secret
values into source control, chat, tickets, or shell history.

## 1. Configure the secret store

Create these runtime secrets from `.env.sample`:

| Secret | Purpose |
|---|---|
| `AUTH_SECRET` | Auth.js session encryption; at least 32 characters |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth application |
| `APP_ENCRYPTION_KEY` | 32-byte hex key for Basic Authentication passwords |
| `COOLIFY_READ_API_TOKEN` | Read deployment status and reconcile applications |
| `COOLIFY_WRITE_API_TOKEN` | Create applications |
| `COOLIFY_DEPLOY_API_TOKEN` | Start deployments |

Set the non-secret identifiers and policy values as deployment configuration:

```text
AUTH_URL=https://<portal-host>
AUTH_TRUST_HOST=true
BOOTSTRAP_GITHUB_LOGIN=JJiseong
DATABASE_URL=file:/data/portal.db
ALLOWED_GITHUB_OWNERS=JJiseong
COOLIFY_BASE_URL=https://<coolify-host>
COOLIFY_PROJECT_UUID=<project-uuid>
COOLIFY_SERVER_UUID=<server-uuid>
COOLIFY_GITHUB_APP_UUID=<github-app-uuid>
COOLIFY_ENVIRONMENT_NAME=production
```

Configure the GitHub OAuth callback as:

```text
https://<portal-host>/api/auth/callback/github
```

Attach a persistent `/data` volume and run one portal replica. The container
entrypoint runs `scripts/db-migrate.ts` before `server.js`.

## 2. Pre-staging CI gate

Before supplying real credentials, require the `Application Validation` job in
`.github/workflows/ci.yml` to pass. It installs from the lockfile, runs
typecheck, unit and integration tests, builds the standalone image payload,
applies the SQLite migration, checks both health endpoints, runs the local
synthetic-session route smoke test, and audits the public login and access
denied routes plus authenticated dashboard, administration, audit-log, and
deployment-detail routes with axe-core. The separate `Documentation Audit` and `Secret
Scan` and `Container Image Smoke` jobs must also pass; the latter verifies the
non-root image can migrate SQLite on a persistent Docker volume.

## 3. Health and authentication checks

Before browser smoke testing, run the read-only preflight from the staging
secret-store environment:

```bash
bun run staging:preflight
```

It validates required secret names, clean HTTPS `AUTH_URL`/`COOLIFY_BASE_URL`,
the GitHub callback URL, SQLite migration readiness, and Coolify read-token
connectivity. It never prints token values and does not create or deploy a
resource.

The CI application gate also scans `.next/static` after the production build
for Coolify token names and bearer-header material. This proves the compiled
browser bundle does not contain the server-only credentials; a browser network
inspection is still required during staging smoke testing.

1. Confirm `GET /api/health/live` returns `{"status":"ok"}`.
2. Confirm `GET /api/health/ready` returns `{"status":"ready","database":"ok"}`.
3. Sign in as `JJiseong`; confirm the first successful sign-in creates an active
   administrator grant.
4. Sign out, then attempt an identity without an active grant. Confirm that no
   portal session is issued and the response is neutral.
5. Deactivate a linked user from `/admin/users`; confirm existing sessions stop
   working, then reactivate the user.

## 4. Deployment checks

Use a private repository owned by an entry in `ALLOWED_GITHUB_OWNERS`.

1. Submit a deployment with `Auto`, then record the portal deployment ID.
2. In Coolify, confirm the created application has 0.5 CPU, 512 MB memory,
   HTTP Basic Authentication, generated HTTPS domain, and automatic deploys.
3. Confirm the portal reaches `Healthy` and shows the generated URL.
4. Reveal credentials once, verify the URL is protected, copy the password,
   then hide the disclosure. Confirm the password is absent from audit metadata.
5. Push a successful commit. Confirm Coolify deploys the same application and
   the portal retains the same URL.
6. Push a deliberately failing commit. Confirm the portal shows a sanitized
   failure and keeps the previous healthy URL.
7. Reopen the portal after a container restart. Confirm users, audit logs, and
   deployment history remain available.

## 5. Security and accessibility gates

Run the following from a controlled staging host:

```bash
bun audit
A11Y_BASE_URL=https://<portal-host> bun run test:a11y
```

Run a browser-level axe/Playwright pass for authenticated routes and manually
review keyboard navigation, dialog focus trapping, status announcements,
screen-reader headings, and 320 CSS pixel / 200% zoom behavior. Run gitleaks
against the exact image source tree before release.

The registered axe script can scan protected routes with a short-lived session
cookie supplied only through the process environment:

```bash
A11Y_BASE_URL=https://portal-staging.example.com \
A11Y_COOKIE='portal.session-token=<short-lived-token>' \
bun run test:a11y \
  https://portal-staging.example.com/dashboard \
  https://portal-staging.example.com/admin/users \
  https://portal-staging.example.com/admin/audit-logs \
  https://portal-staging.example.com/deployments/<deployment-id>
```

Do not place the cookie in source control, shell history, CI logs, or a runbook
artifact; revoke or expire the session after the scan.

## 6. Backup and rollback evidence

Before production traffic:

1. Create an encrypted backup of `/data/portal.db` using a separate backup
   encryption key: `bun run db:backup --output /secure/portal.db.enc`.
2. Verify the backup by restoring it to an isolated temporary path:
   `bun run db:restore-check --input /secure/portal.db.enc`.
3. Upload the encrypted file to the private S3 bucket through the infrastructure
   backup job; keep the backup key outside application environment variables.
4. Record the backup timestamp, restore timestamp, operator, and result in the
   deployment change record.
5. To roll back, route traffic to the previous portal image. Do not delete
   Coolify-created applications during a portal rollback.

## Failure handling

- A failed Coolify create may be reconciled by the deterministic portal tag;
  do not manually create a second application before checking Coolify.
- A `429` response must retain its `Retry-After` value and must not be retried
  aggressively.
- A missing or incomplete migration is a readiness failure, not a reason to
  serve the portal with a new empty database.
- Revoke and rotate a token immediately if it appears in logs or browser
  network data.
