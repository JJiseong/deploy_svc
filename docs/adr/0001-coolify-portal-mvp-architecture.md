# ADR-0001: Coolify Portal MVP Architecture

> **Superseded security boundary (2026-10-01):** This ADR records the original
> GitHub-login/Basic-Auth prototype. The production portal now authenticates
> with administrator-issued email/password accounts; GitHub OAuth is only a
> post-login repository connection, and applications are public HTTPS with
> `noindex`. Legacy Basic Auth data is removed by the idempotent migration.

**Status:** Accepted
**Date:** 2026-09-24
**Decision owners:** Project owner and PM
**Design:** `docs/designs/2026-09-24-coolify-portal-mvp-design.md`

## Context

The project needs a private internal portal over an existing self-hosted Coolify instance. Users must authenticate with GitHub, pass an allowlist check, deploy approved repositories, and view deployment results. Administrators must manage access and inspect audit events.

The prototype runs on personal AWS infrastructure with limited CPU, memory, and disk. Coolify already handles private repositories, GitHub webhooks, deployment continuity, and generated URLs.

The architecture must protect three trust boundaries:

- The browser must never receive Coolify credentials.
- A portal user must access only authorized operations and records.
- User input must not become arbitrary Coolify or Docker configuration.

The design introduces a database schema and authentication boundary. An ADR is therefore mandatory.

## Decision

Use a Next.js App Router monolith with TypeScript. Use Auth.js for GitHub OAuth and database sessions. Use Prisma with persistent SQLite for the prototype. Run one portal replica.

Add an `AccessGrant` entity for administrator-managed GitHub logins. Bind a grant to an Auth.js `User` after the first successful login. Treat `BOOTSTRAP_GITHUB_LOGIN` as an implicit active administrator grant. Recheck role and active status in every privileged server operation.

Keep all Coolify calls behind a server-only client. Allow only these operations:

- Create a private GitHub App application.
- Start a deployment by application UUID.
- Read deployment state.
- List application deployments for push reconciliation.
- List portal-tagged applications after an ambiguous create timeout.

Set deployment safety fields on the server. Apply `0.5` CPU, `512m` memory, automatic deployments, generated domains, and HTTP Basic Authentication. Do not accept domains, secrets, Compose content, or Docker runtime options from users.

Use separate Coolify tokens for `read`, `write`, and `deploy` permissions. Do not grant `root` or `read:sensitive`. Keep tokens in Coolify-managed application secrets.

Generate Basic Authentication passwords with a cryptographic random generator. Encrypt passwords with AES-256-GCM and a versioned application key. Audit every reveal without recording the credential.

Use server actions for authenticated mutations. Use one route handler for authorized deployment polling. Enforce persistent rate limits for authentication, deployment creation, administration, and Coolify polling.

Use a saga-style deployment workflow. Persist the request before calling Coolify. Assign an idempotency key and deterministic Coolify tag. Reconcile ambiguous writes before retrying.

Store SQLite at `/data/portal.db`. Enable WAL, foreign keys, and a busy timeout. Back up SQLite outside EC2 with encryption and test restoration before launch.

### Alternatives rejected

| Alternative | Reason |
|---|---|
| Browser-to-Coolify API | Exposes a privileged control-plane boundary. |
| Separate frontend and API services | Adds deployment and operational cost without MVP benefit. |
| JWT sessions | Makes immediate deactivation and session revocation harder. |
| PostgreSQL | Exceeds the prototype's current operational needs. |
| One root Coolify token | Violates least privilege. |
| User-provided Coolify payloads | Permits unsafe configuration and weakens validation. |

## Consequences

Positive consequences:

- One service contains UI, authorization, persistence, and orchestration.
- Database sessions support immediate access revocation.
- Coolify retains responsibility for Git operations and deployments.
- The browser receives only portal projections and sanitized failures.
- The API surface cannot express privileged Docker behavior.

Negative consequences:

- SQLite limits the portal to one active replica.
- The portal depends on version-specific Coolify API contracts.
- Scoped tokens and encrypted credentials add rotation procedures.
- Application creation can require reconciliation after network timeouts.
- Administrators must maintain external backups and restore evidence.

Follow-up requirements:

- Verify all selected fields against installed Coolify `4.3.23`.
- Treat the owner's instruction to proceed from the plan as design approval for this implementation.
- Complete a UI and accessibility specification before component work.
- Require Security Monitor review before the authentication and infrastructure PR.
- Migrate to PostgreSQL before horizontal scaling or sustained concurrent writes.

### Accessibility impact

The portal targets WCAG 2.1 AA. Implementation must support keyboard operation, visible focus, semantic status announcements, non-color status cues, reduced motion, and accessible error recovery. Automated axe-core checks and manual screen-reader review are release gates.

## Platform Impact

| Platform | Impact | Files Affected |
|---|---|---|
| Claude Code | None. This decision changes project application architecture only. | N/A |
| Antigravity (`GEMINI.md`) | None. The decision is platform-neutral and needs no Gemini instruction change. | N/A |
| `templates/common` | None. This project-specific architecture must not propagate to templates. | N/A |

## References

- `memory/archive/2026-09-22-coolify-portal-prototype-handoff.md`
- `docs/designs/2026-09-24-coolify-portal-mvp-design.md`
- [Coolify API overview](https://coolify.io/docs/api/overview)
- [Coolify API permissions](https://coolify.io/docs/api/permissions)
- [Coolify private GitHub App application endpoint](https://coolify.io/docs/api/endpoints/applications/create-private-github-app-application)
