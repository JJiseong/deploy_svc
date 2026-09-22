# Coolify Portal Prototype Handoff

**Date:** September 22, 2026  
**Project:** `deploy_svc`  
**Repository owner:** `JJiseong`  
**Repository:** `https://github.com/JJiseong/deploy_svc`  
**Project type:** co-develop project  
**Status:** Planning complete; design and implementation have not started

## Objective

Build a minimal internal deployment portal on top of the existing AWS-hosted Coolify instance.

The target user journey is:

```text
Sign in with GitHub
→ Verify the user is allowed
→ Enter a repository
→ Deploy through Coolify
→ Display deployment status and URL
→ Automatically redeploy after a Git push
```

Coolify remains the deployment engine. The portal provides authentication, user management, authorization, and a simplified deployment experience.

## Confirmed Ownership Boundary

- Use the personal GitHub account `JJiseong`.
- Host the portal on the owner's personal AWS EC2 infrastructure.
- Treat the prototype as a single-tenant internal service.
- Keep every repository created for the portal private unless the owner explicitly changes that decision.

## Existing Infrastructure

### AWS EC2

- Public IP: `18.140.117.69`
- Region: `ap-southeast-1`
- Operating system: Ubuntu 26.04 LTS
- Capacity: 2 vCPU, 2 GB RAM, 28 GB disk
- Intended use: prototype only

The current capacity is close to the minimum required for Coolify. Do not treat this server as production-ready.

### Coolify

- Version: `4.3.23`
- Administration URL: `https://coolify.18.140.117.69.sslip.io`
- HTTP and HTTPS proxy: operational
- GitHub App: connected

### Network Rules

- Port 22 is restricted to the administrator's IP address.
- Ports 80 and 443 are publicly accessible.
- Port 8000 is blocked from public access.

## Completed Infrastructure Validation

- Coolify installation on AWS EC2
- HTTPS and proxy routing
- Docker image deployment
- Public GitHub repository deployment
- Private GitHub repository deployment
- GitHub App integration
- Push-triggered automatic deployment
- Existing service continuity after a failed deployment
- Automatic recovery after a corrected commit

## GitHub Test Resources

- GitHub account: `JJiseong`
- Test repository: `JJiseong/coolify-auto-deploy-test`
- Current application response version: `v2`
- Test application URL: `http://o4bltr7hfwqzwzs1zg9bar68.18.140.117.69.sslip.io`

Temporary Coolify API tokens were removed from local storage. Verify token revocation in the Coolify administration interface.

## Prototype Scope

### Included

- GitHub OAuth authentication
- Access for registered users only
- `Admin` and `User` roles
- User registration
- User activation and deactivation
- GitHub repository deployment
- Coolify deployment status polling
- Automatic deployment URL display
- Push-triggered automatic deployment
- Basic audit logging
- HTTP Basic Authentication for deployed applications
- Persistent SQLite storage

### Excluded

- GitLab integration
- Email invitations
- Position or rank management
- Multiple companies
- Fine-grained permissions
- Preview deployments
- Real-time deployment logs
- Environment variable management UI
- MariaDB migration
- Custom application domains

## Recommended Technology

| Area | Selection |
|---|---|
| Language | TypeScript |
| Web application | Next.js monolith |
| Authentication | Auth.js with GitHub OAuth |
| ORM | Prisma |
| Initial database | SQLite |
| Validation | Zod |
| Packaging | Dockerfile |
| Deployment | Existing Coolify instance |

## Roles

| Role | Permissions |
|---|---|
| `Admin` | Manage users and all deployments |
| `User` | Create deployments and view owned deployments |

Configure the initial administrator through an environment variable:

```env
BOOTSTRAP_GITHUB_LOGIN=JJiseong
```

## Minimum Data Model

### User

```text
id
githubId
githubLogin
role
status
lastLoginAt
createdAt
updatedAt
```

### Deployment

```text
id
userId
repository
branch
applicationName
coolifyApplicationUuid
status
url
createdAt
updatedAt
```

### AuditLog

```text
id
userId
action
targetType
targetId
ipAddress
metadata
createdAt
```

Auth.js also requires account and session records.

## Required Screens

### `/login`

- GitHub sign-in
- Access-denied state

### `/dashboard`

- Repository deployment form
- Recent deployments
- Deployment status and URL

### `/deployments/[id]`

- Repository and branch
- Deployment status
- Deployment URL
- Failure information
- Refresh action

### `/admin/users`

- Add an allowed GitHub user
- Change a role
- Activate or deactivate a user

### `/admin/audit-logs`

- Authentication events
- User management events
- Deployment events

## Deployment Input

The minimum deployment form contains:

```text
Repository: JJiseong/sample-agent
Branch: main
Application name: sample-agent
Port: 3000
Build pack: Auto | Nixpacks | Dockerfile
```

The portal performs these actions:

1. Validate the request.
2. Verify the repository owner against the allowlist.
3. Create a Coolify application.
4. Apply a CPU limit of `0.5`.
5. Apply a memory limit of `512 MB`.
6. Enable HTTP Basic Authentication.
7. Enable automatic GitHub deployments.
8. Poll deployment status every three seconds.
9. Display the generated URL after the deployment is healthy.

## Required Environment Variables

```env
AUTH_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
BOOTSTRAP_GITHUB_LOGIN=JJiseong

COOLIFY_BASE_URL=
COOLIFY_API_TOKEN=
COOLIFY_PROJECT_UUID=
COOLIFY_SERVER_UUID=
COOLIFY_GITHUB_APP_UUID=

DATABASE_URL=file:/data/portal.db
APP_ENCRYPTION_KEY=
ALLOWED_GITHUB_OWNERS=JJiseong
```

Do not store real values in the repository, memory files, or conversation logs.

## Minimum Security Requirements

- Block public registration.
- Use Secure and HttpOnly session cookies.
- Enforce authorization in every server API.
- Keep the Coolify API token on the server.
- Validate all input with Zod.
- Rate-limit authentication and deployment requests.
- Restrict repository owners through an allowlist.
- Disable privileged containers.
- Prohibit arbitrary Docker runtime options.
- Apply CPU and memory limits.
- Enable HTTP Basic Authentication for deployed applications.
- Store SQLite in a persistent volume.
- Back up SQLite outside the EC2 instance.
- Record authentication, user management, and deployment events.

## Completion Criteria

- `JJiseong` can sign in as the initial administrator.
- Unregistered GitHub users cannot access the portal.
- An administrator can add, deactivate, and reactivate users.
- A user can deploy an allowed GitHub repository.
- The portal displays deployment status and the generated URL.
- A Git push updates the same URL automatically.
- A failed deployment does not replace the previous healthy version.
- Deployed applications use HTTP Basic Authentication.
- The browser never receives the Coolify API token.
- Authentication and deployment actions appear in the audit log.
- SQLite data survives a container restart.

## Current Repository State

- The project was scaffolded at `C:\Harness\Projects\deploy_svc`.
- The original handoff named `coolify_poc`; `deploy_svc` is now authoritative.
- No application implementation exists.
- No design document or project ADR exists.
- No real environment values are stored in the repository.
- The user approved the architecture phase.

## Next Session

1. Clone the private repository.
2. Run `bun install`.
3. Run `bun scripts/audit.ts`.
4. Read `CODEX.md`.
5. Read `docs/context.md`.
6. Read `docs/co-develop.context.md`.
7. Read this handoff file.
8. Apply the co-develop PM Gateway.
9. Create the design-gate decision record.
10. Create and register the prototype design document.
11. Create the architecture ADR.
12. Create the UI and accessibility specification.
13. Obtain explicit design approval before implementation.
14. Create a new Coolify API token with minimum permissions.
15. Confirm the Coolify project, server, and GitHub App UUIDs.

Do not begin implementation before the design gate is complete.

## New Computer Bootstrap

```powershell
git clone https://github.com/JJiseong/deploy_svc.git
Set-Location deploy_svc
bun install
bun scripts/audit.ts
```

Authenticate GitHub separately on each computer. Create a separate SSH key for each computer when SSH access is required.
