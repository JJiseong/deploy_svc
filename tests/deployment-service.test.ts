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
const { CoolifyClient, CoolifyError } = await import("../src/lib/coolify/client");
const { getEnv } = await import("../src/lib/env");
const { persistProviderAccessToken } = await import("../src/lib/auth/adapter");

class FakeCoolify {
  createCalls = 0;
  deployCalls = 0;
  events: string[] = [];
  async createApplication(input: { name: string }): Promise<{ uuid: string; name: string; fqdn?: string }> { this.createCalls += 1; return { uuid: "app-1", name: input.name, fqdn: "https://demo.example.test" }; }
  async makeApplicationPublic(applicationUuid: string, domains: string | null) { this.events.push(`public:${applicationUuid}:${domains}`); return { uuid: applicationUuid, fqdn: domains ?? undefined }; }
  async startDeployment(applicationUuid?: string) { this.events.push(`deploy:${applicationUuid ?? ""}`); this.deployCalls += 1; return { deployment_uuid: "deployment-1", status: "queued" }; }
  async getDeployment() { return { deployment_uuid: "deployment-1", status: "finished", deployment_url: "https://demo.example.test" }; }
  async listApplicationDeployments() { return []; }
  async findApplicationsByTag() { return []; }
}

class UnsafeUrlCoolify extends FakeCoolify {
  async createApplication(input: { name: string }) { this.createCalls += 1; return { uuid: "app-unsafe-url", name: input.name, fqdn: "javascript:alert(1)" }; }
}

class DelayedDomainCoolify extends FakeCoolify {
  async createApplication(input: { name: string }) { this.createCalls += 1; return { uuid: "app-delayed-domain", name: input.name }; }
  async getApplication() { this.events.push("read:app-delayed-domain"); return { uuid: "app-delayed-domain", fqdn: "http://delayed.example.test" }; }
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
  test("blocks deployment until the portal account connects GitHub", async () => {
    const user = await prisma.user.create({ data: { githubId: "github-1", githubLogin: "jjiseong", role: "ADMIN", status: "ACTIVE" } });
    const fake = new FakeCoolify();
    const input = { repository: "JJiseong/demo", branch: "main", idempotencyKey: "integration-idempotency-1" };
    const actor = { id: user.id, githubLogin: user.githubLogin, role: user.role, status: user.status };
    const first = await createDeployment(actor, input, fake as unknown as Parameters<typeof createDeployment>[2]);
    expect(first).toEqual({ ok: false, error: { code: "GITHUB_NOT_CONNECTED", message: "배포하려면 먼저 GitHub를 연결하세요." } });
    expect(fake.createCalls).toBe(0);
  });

  test("re-applies public HTTPS settings after starting a deployment", async () => {
    const owner = await prisma.user.create({ data: { githubId: "github-public-settings", githubLogin: "public-settings", role: "ADMIN", status: "ACTIVE" } });
    await persistProviderAccessToken(owner.id, "github", "github-token-public-settings");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input) => {
      if (String(input).includes("/repos/JJiseong/demo/contents?ref=main")) return new Response(JSON.stringify([{ name: "package.json", type: "file" }]), { status: 200 });
      throw new Error(`unexpected GitHub path: ${String(input)}`);
    }) as typeof fetch;
    try {
      const fake = new FakeCoolify();
      const result = await createDeployment({ id: owner.id, githubLogin: owner.githubLogin, role: "ADMIN", status: "ACTIVE" }, {
        repository: "JJiseong/demo",
        branch: "main",
        idempotencyKey: "public-settings-after-start-1",
      }, fake as unknown as Parameters<typeof createDeployment>[2]);
      expect(result.ok).toBe(true);
      expect(fake.events.at(-1)).toBe("public:app-1:https://demo.example.test/");
      expect(fake.events.findIndex((event) => event.startsWith("deploy:"))).toBeLessThan(fake.events.length - 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("returns a reconnect action when GitHub rejects an expired token during analysis", async () => {
    const owner = await prisma.user.create({ data: { githubId: "github-expired-analysis", githubLogin: "expired-analysis", role: "ADMIN", status: "ACTIVE" } });
    await persistProviderAccessToken(owner.id, "github", "expired-token");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 })) as unknown as typeof fetch;
    try {
      const result = await createDeployment({ id: owner.id, githubLogin: owner.githubLogin, role: "ADMIN", status: "ACTIVE" }, {
        repository: "JJiseong/demo",
        branch: "main",
        idempotencyKey: "expired-analysis-1",
      });
      expect(result).toEqual({ ok: false, error: { code: "GITHUB_REAUTH_REQUIRED", message: "GitHub 연결이 만료되었습니다. 대시보드에서 다시 연결한 뒤 배포하세요." } });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("explains the required repository change when automatic detection is inconclusive", async () => {
    const owner = await prisma.user.create({ data: { githubId: "github-unknown-analysis", githubLogin: "unknown-analysis", role: "USER", status: "ACTIVE" } });
    await persistProviderAccessToken(owner.id, "github", "github-token-unknown-analysis");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify([]), { status: 200 })) as unknown as typeof fetch;
    try {
      const fake = new FakeCoolify();
      const result = await createDeployment({ id: owner.id, githubLogin: owner.githubLogin, role: "USER", status: "ACTIVE" }, {
        repository: "JJiseong/unknown",
        branch: "main",
        idempotencyKey: "unknown-analysis-1",
      }, fake as unknown as Parameters<typeof createDeployment>[2]);
      expect(result).toEqual({ ok: false, error: { code: "REPOSITORY_NEEDS_SETUP", message: "일반 웹앱으로 인식했습니다. 배포가 실패하면 저장소에 Dockerfile 또는 실행 안내를 추가해 주세요. Dockerfile, package.json 또는 index.html을 저장소에 추가한 뒤 다시 시도하세요." } });
      expect(fake.createCalls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("recovers and applies a generated domain when Coolify omits it during creation", async () => {
    const owner = await prisma.user.create({ data: { githubId: "github-delayed-domain", githubLogin: "delayed-domain", role: "ADMIN", status: "ACTIVE" } });
    await persistProviderAccessToken(owner.id, "github", "github-token-delayed-domain");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input) => {
      if (String(input).includes("/repos/JJiseong/delayed/contents?ref=main")) return new Response(JSON.stringify([{ name: "package.json", type: "file" }]), { status: 200 });
      throw new Error(`unexpected GitHub path: ${String(input)}`);
    }) as typeof fetch;
    try {
      const fake = new DelayedDomainCoolify();
      const result = await createDeployment({ id: owner.id, githubLogin: owner.githubLogin, role: "ADMIN", status: "ACTIVE" }, {
        repository: "JJiseong/delayed",
        branch: "main",
        idempotencyKey: "delayed-domain-public-settings-1",
      }, fake as unknown as Parameters<typeof createDeployment>[2]);
      expect(result.ok).toBe(true);
      expect(fake.events).toEqual([
        "read:app-delayed-domain",
        "public:app-delayed-domain:https://delayed.example.test/",
        "deploy:app-delayed-domain",
        "public:app-delayed-domain:https://delayed.example.test/",
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("does not create a Coolify application without a GitHub connection", async () => {
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
      idempotencyKey: "http-contract-check-1",
    }, client as unknown as Parameters<typeof createDeployment>[2]);

    expect(result).toEqual({ ok: false, error: { code: "GITHUB_NOT_CONNECTED", message: "배포하려면 먼저 GitHub를 연결하세요." } });
    expect(calls).toHaveLength(0);
  });

  test("returns a neutral result for a different owner", async () => {
    const owner = await prisma.user.create({ data: { githubId: "github-owner", githubLogin: "owner", role: "USER", status: "ACTIVE" } });
    const other = await prisma.user.create({ data: { githubId: "github-other", githubLogin: "other", role: "USER", status: "ACTIVE" } });
    const deployment = await prisma.deployment.create({ data: { userId: owner.id, repository: "jjiseong/demo", branch: "main", requestedName: "demo", port: 3000, buildPack: "AUTO", idempotencyKey: "ownership-check-1", status: "HEALTHY" } });
    const result = await revealBasicAuth({ id: other.id, githubLogin: other.githubLogin, role: "USER", status: "ACTIVE" }, deployment.id);
    expect(result).toEqual({ ok: false, error: { code: "CREDENTIALS_REMOVED", message: "This public service does not use portal credentials." } });
  });

  test("does not persist an unsafe Coolify application URL", async () => {
    const user = await prisma.user.create({ data: { githubId: "github-unsafe-url", githubLogin: "unsafe-url-owner", role: "USER", status: "ACTIVE" } });
    const fake = new UnsafeUrlCoolify();
    const result = await createDeployment({ id: user.id, githubLogin: user.githubLogin, role: "USER", status: "ACTIVE" }, {
      repository: "JJiseong/unsafe-url",
      branch: "main",
      idempotencyKey: "unsafe-url-check-1",
    }, fake as unknown as Parameters<typeof createDeployment>[2]);
    expect(result).toEqual({ ok: false, error: { code: "GITHUB_NOT_CONNECTED", message: "배포하려면 먼저 GitHub를 연결하세요." } });
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

  test("recovers a generated domain omitted from the create response", async () => {
    const owner = await prisma.user.create({ data: { githubId: "github-domain-recovery", githubLogin: "domain-recovery", role: "USER", status: "ACTIVE" } });
    const deployment = await prisma.deployment.create({ data: { userId: owner.id, repository: "jjiseong/tetris", branch: "main", requestedName: "tetris", port: 3000, buildPack: "AUTO", idempotencyKey: "domain-recovery-1", status: "HEALTHY", coolifyApplicationId: "app-tetris", latestDeploymentId: "deployment-tetris" } });
    const client = {
      listApplicationDeployments: async () => [],
      getApplication: async () => ({ uuid: "app-tetris", fqdn: "http://tetris.example.test" }),
    } as unknown as Parameters<typeof refreshDeploymentStatus>[2];
    const result = await refreshDeploymentStatus({ id: owner.id, githubLogin: owner.githubLogin, role: "USER", status: "ACTIVE" }, deployment.id, client);
    expect(result?.status).toBe("HEALTHY");
    expect(result?.url).toBe("https://tetris.example.test/");
  });

  test("falls back to application deployment list when single deployment lookup is unavailable", async () => {
    const owner = await prisma.user.create({ data: { githubId: "github-list-fallback", githubLogin: "list-fallback-owner", role: "USER", status: "ACTIVE" } });
    const deployment = await prisma.deployment.create({ data: { userId: owner.id, repository: "jjiseong/demo", branch: "main", requestedName: "demo", port: 3000, buildPack: "AUTO", idempotencyKey: "list-fallback-1", status: "IN_PROGRESS", coolifyApplicationId: "app-list-fallback", latestDeploymentId: "deployment-list-fallback" } });
    let listCalls = 0;
    const client = {
      getDeployment: async () => { throw new CoolifyError(404); },
      listApplicationDeployments: async () => {
        listCalls += 1;
        return [{ uuid: "deployment-list-fallback", status: "finished", created_at: new Date().toISOString(), deployment_url: "https://fallback.example.test" }];
      },
    } as unknown as Parameters<typeof refreshDeploymentStatus>[2];
    const result = await refreshDeploymentStatus({ id: owner.id, githubLogin: owner.githubLogin, role: "USER", status: "ACTIVE" }, deployment.id, client);
    expect(result?.status).toBe("HEALTHY");
    expect(result?.url).toBe("https://fallback.example.test/");
    expect(listCalls).toBe(1);
  });
});
