import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const databasePath = `/tmp/deploy-svc-deployment-${process.pid}.db`;
process.env.AUTH_SECRET = "a".repeat(32);
process.env.AUTH_GITHUB_ID = "test-client";
process.env.AUTH_GITHUB_SECRET = "test-secret";
process.env.AUTH_TRUST_HOST = "true";
process.env.BOOTSTRAP_GITHUB_LOGIN = "JJiseong";
process.env.DATABASE_URL = `file:${databasePath}`;
process.env.APP_ENCRYPTION_KEY = "b".repeat(64);
process.env.ALLOWED_GITHUB_OWNERS = "JJiseong";
process.env.COOLIFY_BASE_URL = "https://coolify.example.test";
process.env.COOLIFY_READ_API_TOKEN = "read-token";
process.env.COOLIFY_WRITE_API_TOKEN = "write-token";
process.env.COOLIFY_DEPLOY_API_TOKEN = "deploy-token";
process.env.COOLIFY_PROJECT_UUID = "project";
process.env.COOLIFY_SERVER_UUID = "server";
process.env.COOLIFY_GITHUB_APP_UUID = "github-app";
process.env.COOLIFY_ENVIRONMENT_NAME = "production";

const { prisma } = await import("../src/lib/db");
const { createDeployment, revealBasicAuth, refreshDeploymentStatus } = await import("../src/lib/deployments/service");
const { CoolifyClient } = await import("../src/lib/coolify/client");
const { getEnv } = await import("../src/lib/env");

class FakeCoolify {
  createCalls = 0;
  deployCalls = 0;
  async createApplication(input: { name: string }) { this.createCalls += 1; return { uuid: "app-1", name: input.name, fqdn: "https://demo.example.test" }; }
  async startDeployment() { this.deployCalls += 1; return { deployment_uuid: "deployment-1", status: "queued" }; }
  async getDeployment() { return { deployment_uuid: "deployment-1", status: "finished", deployment_url: "https://demo.example.test" }; }
  async listApplicationDeployments() { return []; }
  async findApplicationsByTag() { return []; }
}

class UnsafeUrlCoolify extends FakeCoolify {
  async createApplication(input: { name: string }) { this.createCalls += 1; return { uuid: "app-unsafe-url", name: input.name, fqdn: "javascript:alert(1)" }; }
}

beforeAll(() => {
  const result = spawnSync("./node_modules/.bin/prisma", ["migrate", "deploy", "--schema", "prisma/schema.prisma"], { env: { ...process.env, RUST_LOG: "info" }, stdio: "ignore" });
  if (result.status !== 0) throw new Error("Integration migration failed");
});

afterAll(async () => {
  await prisma.$disconnect();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${databasePath}${suffix}`, { force: true });
});

describe("deployment orchestration", () => {
  test("persists an encrypted request, starts Coolify, and honors idempotency", async () => {
    const user = await prisma.user.create({ data: { githubId: "github-1", githubLogin: "jjiseong", role: "ADMIN", status: "ACTIVE" } });
    const fake = new FakeCoolify();
    const input = { repository: "JJiseong/demo", branch: "main", applicationName: "demo", port: 3000, buildPack: "AUTO", idempotencyKey: "integration-idempotency-1" };
    const actor = { id: user.id, githubLogin: user.githubLogin, role: user.role, status: user.status };
    const first = await createDeployment(actor, input, fake as unknown as Parameters<typeof createDeployment>[2]);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.status).toBe("QUEUED");
    expect(fake.createCalls).toBe(1);
    expect(fake.deployCalls).toBe(1);

    const stored = await prisma.deployment.findUniqueOrThrow({ where: { id: first.data.id } });
    expect(stored.basicPasswordCiphertext).not.toBe("portal-user");
    expect(stored.coolifyApplicationId).toBe("app-1");
    const second = await createDeployment(actor, input, fake as unknown as Parameters<typeof createDeployment>[2]);
    expect(second).toEqual(first);
    expect(fake.createCalls).toBe(1);
    const credentials = await revealBasicAuth(actor, first.data.id);
    expect(credentials.ok).toBe(true);
    if (credentials.ok) {
      expect(credentials.data.username).toBe("portal-user");
      const revealEvents = await prisma.auditLog.findMany({
        where: { actorId: user.id, action: "CREDENTIAL_REVEAL", targetId: first.data.id },
        orderBy: { createdAt: "desc" },
      });
      expect(revealEvents).toHaveLength(1);
      expect(JSON.stringify(revealEvents[0]?.metadata ?? {})).not.toContain(credentials.data.password);
    }
  });

  test("runs the deployment service through the typed Coolify HTTP contract", async () => {
    const user = await prisma.user.create({ data: { githubId: "github-http-contract", githubLogin: "http-contract-owner", role: "ADMIN", status: "ACTIVE" } });
    const calls: Array<{ method: string; path: string; body: Record<string, unknown> | null; authorization: string | null }> = [];
    const client = new CoolifyClient(getEnv(), async (input, init) => {
      const request = new Request(input, init);
      const bodyText = await request.text();
      calls.push({ method: request.method, path: new URL(request.url).pathname + new URL(request.url).search, body: bodyText ? JSON.parse(bodyText) as Record<string, unknown> : null, authorization: request.headers.get("authorization") });
      if (request.url.includes("/applications/private-github-app")) return new Response(JSON.stringify({ uuid: "app-http-contract", name: "http-contract", fqdn: "https://http-contract.example.test" }), { status: 201, headers: { "content-type": "application/json" } });
      if (request.url.includes("/deploy?uuid=app-http-contract")) return new Response(JSON.stringify({ deployments: [{ deployment_uuid: "deployment-http-contract" }] }), { status: 200, headers: { "content-type": "application/json" } });
      throw new Error(`unexpected Coolify path: ${request.url}`);
    });
    const result = await createDeployment({ id: user.id, githubLogin: user.githubLogin, role: "ADMIN", status: "ACTIVE" }, {
      repository: "JJiseong/http-contract",
      branch: "main",
      applicationName: "http-contract",
      port: 3000,
      buildPack: "AUTO",
      idempotencyKey: "http-contract-check-1",
    }, client as unknown as Parameters<typeof createDeployment>[2]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("QUEUED");
    expect(calls.map((call) => call.path)).toEqual([
      "/api/v1/applications/private-github-app",
      "/api/v1/deploy?uuid=app-http-contract&force=false",
    ]);
    expect(calls[0]?.authorization).toBe("Bearer write-token");
    expect(calls[1]?.authorization).toBe("Bearer deploy-token");
    expect(calls[0]?.body).toMatchObject({
      project_uuid: "project",
      server_uuid: "server",
      environment_name: "production",
      github_app_uuid: "github-app",
      git_repository: "https://github.com/JJiseong/http-contract",
      is_auto_deploy_enabled: true,
      is_force_https_enabled: true,
      is_http_basic_auth_enabled: true,
      limits_cpus: "0.5",
      limits_memory: "512m",
    });
    const stored = await prisma.deployment.findUniqueOrThrow({ where: { id: result.data.id } });
    expect(stored.coolifyApplicationId).toBe("app-http-contract");
    expect(stored.latestDeploymentId).toBe("deployment-http-contract");
    expect(stored.url).toBe("https://http-contract.example.test/");
  });

  test("returns a neutral result for a different owner", async () => {
    const owner = await prisma.user.create({ data: { githubId: "github-owner", githubLogin: "owner", role: "USER", status: "ACTIVE" } });
    const other = await prisma.user.create({ data: { githubId: "github-other", githubLogin: "other", role: "USER", status: "ACTIVE" } });
    const deployment = await prisma.deployment.create({ data: { userId: owner.id, repository: "jjiseong/demo", branch: "main", requestedName: "demo", port: 3000, buildPack: "AUTO", idempotencyKey: "ownership-check-1", status: "HEALTHY" } });
    const result = await revealBasicAuth({ id: other.id, githubLogin: other.githubLogin, role: "USER", status: "ACTIVE" }, deployment.id);
    expect(result).toEqual({ ok: false, error: { code: "NOT_FOUND", message: "Deployment not found." } });
  });

  test("does not persist an unsafe Coolify application URL", async () => {
    const user = await prisma.user.create({ data: { githubId: "github-unsafe-url", githubLogin: "unsafe-url-owner", role: "USER", status: "ACTIVE" } });
    const fake = new UnsafeUrlCoolify();
    const result = await createDeployment({ id: user.id, githubLogin: user.githubLogin, role: "USER", status: "ACTIVE" }, {
      repository: "JJiseong/unsafe-url",
      branch: "main",
      applicationName: "unsafe-url",
      port: 3000,
      buildPack: "AUTO",
      idempotencyKey: "unsafe-url-check-1",
    }, fake as unknown as Parameters<typeof createDeployment>[2]);
    expect(result.ok).toBe(true);
    if (result.ok) expect((await prisma.deployment.findUniqueOrThrow({ where: { id: result.data.id } })).url).toBeNull();
  });

  test("keeps the previous healthy URL when a newer push deployment fails", async () => {
    const owner = await prisma.user.create({ data: { githubId: "github-healthy", githubLogin: "healthy-owner", role: "USER", status: "ACTIVE" } });
    const deployment = await prisma.deployment.create({ data: { userId: owner.id, repository: "jjiseong/demo", branch: "main", requestedName: "demo", port: 3000, buildPack: "AUTO", idempotencyKey: "failed-push-1", status: "HEALTHY", url: "https://healthy.example.test", coolifyApplicationId: "app-healthy", latestDeploymentId: "deployment-old" } });
    const newerFailed = { uuid: "deployment-new", status: "failed", created_at: new Date(Date.now() + 1_000).toISOString() };
    const client = { listApplicationDeployments: async () => [newerFailed] } as unknown as Parameters<typeof refreshDeploymentStatus>[2];
    const result = await refreshDeploymentStatus({ id: owner.id, githubLogin: owner.githubLogin, role: "USER", status: "ACTIVE" }, deployment.id, client);
    expect(result?.status).toBe("FAILED");
    expect(result?.url).toBe("https://healthy.example.test");
    expect(result?.latestDeploymentId).toBe("deployment-new");
    const failureEvents = await prisma.auditLog.findMany({ where: { actorId: owner.id, action: "DEPLOYMENT_FAILURE", targetId: deployment.id } });
    expect(failureEvents).toHaveLength(1);
  });
});
