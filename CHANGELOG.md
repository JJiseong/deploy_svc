# Changelog

## Unreleased

- Accept Coolify deployment responses with numeric IDs and wrapped application deployment lists.
- Keep generated Coolify basic-auth passwords within the upstream database column limit after Coolify encrypts them.
- Fall back to application deployment history when Coolify cannot resolve a deployment by UUID.
- Recover an application's generated HTTPS domain when Coolify omits it from the initial create or deployment response.

All notable changes to this project will be documented in this file.

## [Unreleased] 2026-09-01

- **[2026-09-27]**: fix: encrypt GitHub access tokens at rest so repository discovery can use the approved OAuth grant.
- **[2026-09-27]**: fix: refresh encrypted GitHub tokens on every approved sign-in.
- **[2026-09-27]**: fix: install CA certificates in the production image so Coolify HTTPS API calls work from the portal container.
- **[2026-09-27]**: feat: discover allowed GitHub repositories and branches after OAuth login, auto-fill deployment defaults, and retain manual entry only as a fallback.
- **[2026-09-26]**: feat: localize the portal interface to Korean and add an in-app usage guide with deployment, credential, and administrator instructions.
- **[2026-09-26]**: fix: bind first-login GitHub users after Auth.js adapter persistence and add an OAuth access regression test.
- **[2026-09-24]**: feat: add the Next.js portal, Prisma SQLite schema, GitHub OAuth access control, Coolify deployment orchestration, admin screens, audit logging, encrypted credentials, and production container.
- **[2026-09-24]**: security: patch Next.js/Auth.js/Prisma dependency vulnerabilities and add a clean Bun audit gate.
- **[2026-09-24]**: hardening: add server-only boundaries, immutable GitHub identity binding, idempotency race recovery, accessible mobile navigation, focus-safe error recovery, and resilient deployment polling.
- **[2026-09-24]**: test: add a registered axe-core WCAG 2.1 AA audit command for running portal routes.
- **[2026-09-24]**: test: cover deployment orchestration persistence, encrypted credentials, Coolify start mapping, idempotency, and ownership isolation with a fake Coolify contract.
- **[2026-09-24]**: ops: add encrypted SQLite backup and temporary restore-readiness verification commands plus the staging smoke runbook.
- **[2026-09-24]**: ci: add synthetic application validation for typecheck, tests, standalone build, migration, health/readiness, and public login accessibility; document the gate in the staging runbook.
- **[2026-09-24]**: ops: ensure the non-root container user can write the persistent `/data` SQLite volume.
- **[2026-09-24]**: test: add the loopback-only `route-smoke.ts` harness for synthetic-session HTTP checks and wire it into CI.
- **[2026-09-24]**: fix: reject Coolify deployment responses that do not contain a deployment identifier instead of persisting a false queued state.
- **[2026-09-24]**: ops: add a minimal `.dockerignore` and a CI container-image smoke job that verifies non-root SQLite volume startup.
- **[2026-09-24]**: test: cover admin grant creation, role propagation, session revocation, last-admin protection, and audit events in SQLite integration tests.
- **[2026-09-24]**: test: verify the Auth.js Prisma adapter strips GitHub provider tokens and supports session lifecycle operations.
- **[2026-09-24]**: test: extend route smoke coverage to reject expired database sessions.
- **[2026-09-24]**: hardening: fail fast when `DATABASE_URL` is not SQLite or `COOLIFY_BASE_URL` is not HTTPS.
- **[2026-09-24]**: test: cover bootstrap-login allowance and active/inactive access-grant decisions in SQLite integration tests.
- **[2026-09-24]**: ops: make encrypted SQLite backups snapshot-consistent with `VACUUM INTO`, source-path validation, and temporary snapshot cleanup; verify restore readiness locally.
- **[2026-09-24]**: test: extend axe auditing to short-lived authenticated sessions, scan every portal route locally, and enforce the 24px minimum brand-link target size.
- **[2026-09-24]**: security: restrict authenticated axe cookies to the configured same-origin route set.
- **[2026-09-24]**: test: extend route smoke ownership coverage to reject cross-owner deployment status refreshes as well as detail access.
- **[2026-09-24]**: ci: reuse synthetic route-smoke sessions to run authenticated axe checks for dashboard, admin, audit-log, and deployment-detail routes.
- **[2026-09-24]**: security: prevent an already-bound GitHub login grant from being reassigned to a different user account.
- **[2026-09-24]**: security: accept only clean HTTPS Coolify/application URLs and reject upstream links that could become unsafe browser targets.
- **[2026-09-24]**: integration: align the Coolify application payload with the current API contract by explicitly forcing HTTPS domains.
- **[2026-09-24]**: test: add an end-to-end service contract test covering Coolify HTTP paths, scoped bearer-token selection, payload invariants, and persisted deployment identifiers.
- **[2026-09-24]**: ops: add a read-only staging preflight for secret completeness, HTTPS callback configuration, SQLite readiness, and Coolify read-token connectivity.
- **[2026-09-24]**: security: disable HTTP redirects on Coolify and staging preflight requests so bearer tokens cannot follow an untrusted origin.
- **[2026-09-24]**: ci: run the staging preflight in synthetic mode after migration so secret shape, HTTPS callback, and SQLite readiness stay continuously verified.
- **[2026-09-24]**: ops: make staging preflight validate GitHub bootstrap login and owner allowlist syntax before OAuth smoke testing.
- **[2026-09-24]**: test: assert credential-reveal audit events and verify revealed passwords never enter audit metadata.
- **[2026-09-24]**: hardening: record one sanitized deployment-failure audit event when a newer push or polled deployment transitions to failed.
- **[2026-09-24]**: ci: add a production browser-bundle gate that rejects Coolify token names and bearer-header material outside the server-only graph.
- **[2026-09-24]**: a11y: make the admin add-user form expose a focusable error summary, inline field error, and preserved input semantics.
- **[2026-09-24]**: a11y: give deployment error summaries an explicit accessible heading for screen-reader announcement.

- **[2026-09-22]**: docs: add a portable Coolify portal project handoff and session baseline (#1)
- **[2026-09-22]**: docs: design-foundation.md §2b — design process pipeline (principles→tokens→style guide→icons→components→patterns→screens) and design-phase gate; style-neutral (ADR-0066)
- **[2026-09-22]**: docs/_templates: design-review-checklist-template.md added
- **[2026-09-22]**: skills: k-dart 2.0.0 → 2.1.0 — corp_code fallback chain with company.json cross-validation, financial account normalization + summation integrity checks, CFS→BFS fallback, disclosure search presets, shareholder signal, source-document text extraction, shared fetch gate (concurrency/backoff/daily budget)

## [Unreleased]

### Added
- **[2026-09-22]**: `k-kosis` skill (Korean Statistical Information Service / KOSIS OpenAPI) — promoted from `co-pitch/skills/k-kosis`, registered in `skills/SKILLS.md` (scope: common, l2_propagate).

### Changed
### Fixed
- **[2026-09-22]**: `agents/pm.md` — removed the 5-line `lifecycle:` frontmatter block (L0-only field, forbidden in L1 by `audit.ts`'s L1 pm.md check). Pre-existing defect left on main since #605; surfaced as a blocking FAIL during the co-hr promotion gate and cleared under that PR (single-root-PR pattern per #605 precedent). Restores ADR-0033 extends-pattern conformance; no other content touched.
### Removed
