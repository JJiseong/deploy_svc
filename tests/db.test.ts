import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const databasePath = `/tmp/deploy-svc-integration-${process.pid}.db`;
process.env.DATABASE_URL = `file:${databasePath}`;
process.env.AUTH_SECRET = "a".repeat(32);
process.env.AUTH_GITHUB_ID = "test-client";
process.env.AUTH_GITHUB_SECRET = "test-secret";
process.env.BOOTSTRAP_GITHUB_LOGIN = "JJiseong";
process.env.APP_ENCRYPTION_KEY = "b".repeat(64);
process.env.ALLOWED_GITHUB_OWNERS = "JJiseong";
process.env.COOLIFY_BASE_URL = "https://coolify.example.test";
process.env.COOLIFY_READ_API_TOKEN = "read-token";
process.env.COOLIFY_WRITE_API_TOKEN = "write-token";
process.env.COOLIFY_DEPLOY_API_TOKEN = "deploy-token";
process.env.COOLIFY_PROJECT_UUID = "project";
process.env.COOLIFY_SERVER_UUID = "server";
process.env.COOLIFY_GITHUB_APP_UUID = "github-app";

const { prisma, checkDatabaseReady } = await import("../src/lib/db");
const { bindGithubUser, isGithubLoginAllowed } = await import("../src/lib/auth/access");
const { createAccessGrant, updateAccessGrantRole, setAccessGrantStatus } = await import("../src/lib/auth/grants");
const { createPrismaAdapter, persistProviderAccessToken } = await import("../src/lib/auth/adapter");
const { clearGithubConnection, getGithubAccessToken } = await import("../src/lib/github/account");
const { createMember, resetMemberPassword } = await import("../src/lib/auth/members");

beforeAll(() => {
  const result = spawnSync("./node_modules/.bin/prisma", ["migrate", "deploy", "--schema", "prisma/schema.prisma"], { env: { ...process.env, RUST_LOG: "info" }, stdio: "ignore" });
  if (result.status !== 0) throw new Error("Integration migration failed");
});

afterAll(async () => {
  await prisma.$disconnect();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${databasePath}${suffix}`, { force: true });
});

describe("SQLite integration", () => {
  test("readiness requires a migrated database", async () => {
    await checkDatabaseReady();
    const tables = await prisma.$queryRaw<Array<{ name: string }>>`SELECT name FROM sqlite_master WHERE type = 'table'`;
    expect(tables.some((table) => table.name === "User")).toBe(true);
    expect(tables.some((table) => table.name === "_prisma_migrations")).toBe(true);
  });

  test("access grants persist normalized identity", async () => {
    const grant = await prisma.accessGrant.create({ data: { githubLogin: "integration-user", role: "USER", status: "ACTIVE" } });
    expect(grant.githubLogin).toBe("integration-user");
    await prisma.accessGrant.delete({ where: { id: grant.id } });
  });

  test("does not rebind a user to a different GitHub identity", async () => {
    const user = await prisma.user.create({ data: { githubId: "github-original", githubLogin: "original", role: "USER", status: "ACTIVE" } });
    await expect(bindGithubUser(user.id, { id: "github-other", login: "original" }, "bootstrap")).rejects.toThrow("GITHUB_ID_MISMATCH");
    await prisma.user.delete({ where: { id: user.id } });
  });

  test("does not rebind an approved GitHub login to a different user account", async () => {
    const boundUser = await prisma.user.create({ data: { githubId: "github-bound", githubLogin: "bound-user", role: "USER", status: "ACTIVE" } });
    const newUser = await prisma.user.create({ data: { role: "USER", status: "ACTIVE" } });
    const grant = await prisma.accessGrant.create({ data: { githubLogin: "bound-user", role: "USER", status: "ACTIVE", userId: boundUser.id } });

    await expect(bindGithubUser(newUser.id, { id: "github-new", login: "bound-user" }, "bootstrap")).rejects.toThrow("GITHUB_LOGIN_ALREADY_BOUND");
    expect((await prisma.accessGrant.findUniqueOrThrow({ where: { id: grant.id } })).userId).toBe(boundUser.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: newUser.id } })).githubId).toBeNull();

    await prisma.accessGrant.delete({ where: { id: grant.id } });
    await prisma.user.deleteMany({ where: { id: { in: [boundUser.id, newUser.id] } } });
  });

  test("allows the bootstrap login and only active grants", async () => {
    expect(await isGithubLoginAllowed("Bootstrap-User", "bootstrap-user")).toBe(true);
    const grant = await prisma.accessGrant.create({ data: { githubLogin: "granted-user", role: "USER", status: "ACTIVE" } });
    expect(await isGithubLoginAllowed("Granted-User", "bootstrap-user")).toBe(true);
    await prisma.accessGrant.update({ where: { id: grant.id }, data: { status: "INACTIVE" } });
    expect(await isGithubLoginAllowed("granted-user", "bootstrap-user")).toBe(false);
    await prisma.accessGrant.delete({ where: { id: grant.id } });
  });

  test("admin grant mutations update linked users, revoke sessions, and write audit events", async () => {
    const actor = await prisma.user.create({ data: { githubId: "github-grant-actor", githubLogin: "grant-actor", mustChangePassword: false, role: "ADMIN", status: "ACTIVE" } });
    const member = await prisma.user.create({ data: { githubId: "github-grant-member", githubLogin: "grant-member", role: "USER", status: "ACTIVE" } });
    const linkedGrant = await prisma.accessGrant.create({ data: { githubLogin: "grant-member", role: "USER", status: "ACTIVE", userId: member.id, createdById: actor.id } });
    const session = await prisma.session.create({ data: { sessionToken: "grant-member-session", userId: member.id, expires: new Date(Date.now() + 60_000) } });

    const created = await createAccessGrant(actor.id, { githubLogin: "  New-Allowed-User ", role: "USER" });
    expect(created.githubLogin).toBe("new-allowed-user");

    await updateAccessGrantRole(actor.id, linkedGrant.id, "ADMIN");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).role).toBe("ADMIN");

    await setAccessGrantStatus(actor.id, linkedGrant.id, "INACTIVE");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).status).toBe("INACTIVE");
    expect(await prisma.session.findUnique({ where: { id: session.id } })).toBeNull();

    const actions = await prisma.auditLog.findMany({ where: { actorId: actor.id }, select: { action: true, outcome: true } });
    expect(actions.map((entry) => entry.action)).toEqual(expect.arrayContaining(["ACCESS_GRANT_CREATE", "ACCESS_GRANT_ROLE", "ACCESS_GRANT_DEACTIVATE"]));

    const soleAdminGrant = await prisma.accessGrant.create({ data: { githubLogin: "sole-admin", role: "ADMIN", status: "ACTIVE", userId: actor.id } });
    await expect(setAccessGrantStatus(actor.id, soleAdminGrant.id, "INACTIVE")).rejects.toThrow("LAST_ADMIN");

    await prisma.accessGrant.deleteMany({ where: { id: { in: [created.id, linkedGrant.id, soleAdminGrant.id] } } });
    await prisma.auditLog.deleteMany({ where: { actorId: actor.id } });
    await prisma.user.deleteMany({ where: { id: { in: [actor.id, member.id] } } });
  });

  test("Auth adapter encrypts provider bearer tokens and handles sessions", async () => {
    const user = await prisma.user.create({ data: { githubId: "github-adapter", githubLogin: "adapter-user", role: "USER", status: "ACTIVE" } });
    const adapter = createPrismaAdapter();
    await adapter.linkAccount?.({
      userId: user.id,
      type: "oauth",
      provider: "github",
      providerAccountId: "github-account-adapter",
      access_token: "provider-access-token",
      refresh_token: "provider-refresh-token",
      id_token: "provider-id-token",
      token_type: "bearer",
      scope: "read:user",
    });
    const account = await prisma.account.findUniqueOrThrow({ where: { provider_providerAccountId: { provider: "github", providerAccountId: "github-account-adapter" } } });
    expect(account.access_token).toMatch(/^enc:v1:/);
    expect(account.access_token).not.toContain("provider-access-token");
    expect(account.refresh_token).toBeNull();
    expect(account.id_token).toBeNull();
    expect(await getGithubAccessToken(user.id)).toBe("provider-access-token");
    await prisma.account.updateMany({ where: { userId: user.id }, data: { access_token: null } });
    await persistProviderAccessToken(user.id, "github", "provider-access-token-refreshed");
    expect(await getGithubAccessToken(user.id)).toBe("provider-access-token-refreshed");

    const session = await adapter.createSession!({ sessionToken: "adapter-session", userId: user.id, expires: new Date(Date.now() + 60_000) });
    const loaded = await adapter.getSessionAndUser!(session.sessionToken);
    expect(loaded?.user.id).toBe(user.id);
    await adapter.deleteSession!(session.sessionToken);
    expect(await prisma.session.findUnique({ where: { sessionToken: session.sessionToken } })).toBeNull();
    await prisma.user.delete({ where: { id: user.id } });
  });

  test("disconnects GitHub identity and removes the stored provider token", async () => {
    const user = await prisma.user.create({ data: { email: "disconnect@example.test", githubId: "github-disconnect", githubLogin: "disconnect-user", role: "USER", status: "ACTIVE" } });
    await persistProviderAccessToken(user.id, "github", "provider-token-to-remove");

    await clearGithubConnection(user.id);

    const disconnected = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { githubId: true, githubLogin: true, image: true } });
    expect(disconnected).toEqual({ githubId: null, githubLogin: null, image: null });
    expect(await prisma.account.findFirst({ where: { userId: user.id, provider: "github" } })).toBeNull();
    await prisma.user.delete({ where: { id: user.id } });
  });

  test("returns temporary passwords without exposing password hashes", async () => {
    const actor = await prisma.user.create({ data: { email: "member-admin@example.test", passwordHash: "admin-hash", mustChangePassword: false, role: "ADMIN", status: "ACTIVE" } });
    const created = await createMember(actor.id, { email: "new-member@example.test", role: "USER" });
    expect(created.temporaryPassword).toBeString();
    expect(created.member).not.toHaveProperty("passwordHash");
    expect(created.member.email).toBe("new-member@example.test");
    const reset = await resetMemberPassword(actor.id, created.member.id);
    expect(reset.temporaryPassword).toBeString();
    expect(reset.member).not.toHaveProperty("passwordHash");
    await prisma.user.deleteMany({ where: { id: { in: [actor.id, created.member.id] } } });
  });
});
