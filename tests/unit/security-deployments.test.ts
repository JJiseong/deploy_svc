import { describe, expect, test } from "bun:test";
import { encryptSecret, decryptSecret, generateBasicPassword } from "../../src/lib/security/crypto";
import { mapCoolifyStatus, CoolifyClient, safeHttpsUrl } from "../../src/lib/coolify/client";
import { parseEnv } from "../../src/lib/env";
import { portalTag } from "../../src/lib/deployments/service";

const env = parseEnv({
  AUTH_SECRET: "a".repeat(32), AUTH_GITHUB_ID: "id", AUTH_GITHUB_SECRET: "secret", BOOTSTRAP_GITHUB_LOGIN: "JJiseong",
  DATABASE_URL: "file:test.db", APP_ENCRYPTION_KEY: "b".repeat(64), ALLOWED_GITHUB_OWNERS: "JJiseong",
  COOLIFY_BASE_URL: "https://coolify.example.com", COOLIFY_READ_API_TOKEN: "read", COOLIFY_WRITE_API_TOKEN: "write", COOLIFY_DEPLOY_API_TOKEN: "deploy",
  COOLIFY_PROJECT_UUID: "project", COOLIFY_SERVER_UUID: "server", COOLIFY_GITHUB_APP_UUID: "github", COOLIFY_ENVIRONMENT_NAME: "production",
});

describe("security primitives", () => {
  test("encrypts and decrypts a generated password", () => {
    const password = generateBasicPassword();
    expect(password.length).toBeLessThanOrEqual(31);
    const encrypted = encryptSecret(password, Buffer.from(env.APP_ENCRYPTION_KEY, "hex"));
    expect(decryptSecret(encrypted, Buffer.from(env.APP_ENCRYPTION_KEY, "hex"))).toBe(password);
    expect(encrypted.ciphertext).not.toBe(password);
  });

  test("creates a deterministic, non-secret reconciliation tag", () => {
    expect(portalTag("user-1", "request-123456")).toBe(portalTag("user-1", "request-123456"));
    expect(portalTag("user-1", "request-123456")).not.toContain("request-123456");
  });

  test("accepts only HTTPS application URLs from upstream responses", () => {
    expect(safeHttpsUrl("https://app.example.com/path")).toBe("https://app.example.com/path");
    expect(safeHttpsUrl("http://app.example.com")).toBeNull();
    expect(safeHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpsUrl("https://user:password@app.example.com")).toBeNull();
    expect(safeHttpsUrl("not-a-url")).toBeNull();
  });
});

describe("Coolify contracts", () => {
  test("rejects a non-HTTPS Coolify endpoint", () => {
    expect(() => new CoolifyClient({ ...env, COOLIFY_BASE_URL: "http://coolify.example.com" })).toThrow("HTTPS");
  });

  test("does not follow redirects that could forward a bearer token", async () => {
    let calls = 0;
    const client = new CoolifyClient(env, async (_input, init) => {
      calls += 1;
      expect(init?.redirect).toBe("manual");
      return new Response(null, { status: 302, headers: { location: "https://untrusted.example.test" } });
    });
    await expect(client.getDeployment("deployment-redirect")).rejects.toMatchObject({ status: 302 });
    expect(calls).toBe(1);
  });

  test("maps documented status variants to portal states", () => {
    expect(mapCoolifyStatus("finished")).toBe("HEALTHY");
    expect(mapCoolifyStatus("building")).toBe("IN_PROGRESS");
    expect(mapCoolifyStatus("failed")).toBe("FAILED");
    expect(mapCoolifyStatus("unexpected")).toBe("UNKNOWN");
  });

  test("sends fixed safe application settings and validates response", async () => {
    let request: Request | undefined;
    const client = new CoolifyClient(env, async (input, init) => { request = new Request(input, init); return new Response(JSON.stringify({ uuid: "app-1", fqdn: "https://app.example.com" }), { status: 201, headers: { "content-type": "application/json" } }); });
    const result = await client.createApplication({ name: "demo", repository: "JJiseong/demo", branch: "main", port: 3000, buildPack: "nixpacks", tag: "tag-1", basicUsername: "portal-user", basicPassword: "password" });
    expect(result.uuid).toBe("app-1");
    const body = JSON.parse(await request!.text()) as Record<string, unknown>;
    expect(body.limits_cpus).toBe("0.5");
    expect(body.limits_memory).toBe("512m");
    expect(body.is_preview_deployments_enabled).toBe(false);
    expect(body.is_force_https_enabled).toBe(true);
    expect(body.tags).toEqual(["tag-1"]);
    expect(body.git_repository).toBe("https://github.com/JJiseong/demo");
  });

  test("normalizes the deploy response wrapper", async () => {
    const client = new CoolifyClient(env, async () => new Response(JSON.stringify({ deployments: [{ deployment_uuid: "dep-1", status: "queued" }] }), { status: 200, headers: { "content-type": "application/json" } }));
    const result = await client.startDeployment("app-1");
    expect(result.deployment_uuid).toBe("dep-1");
    expect(result.status).toBe("queued");
  });

  test("accepts the documented deploy response without a status", async () => {
    const client = new CoolifyClient(env, async () => new Response(JSON.stringify({ deployments: [{ deployment_uuid: "dep-2" }] }), { status: 200, headers: { "content-type": "application/json" } }));
    const result = await client.startDeployment("app-1");
    expect(result.deployment_uuid).toBe("dep-2");
    expect(mapCoolifyStatus(result.status)).toBe("UNKNOWN");
  });

  test("rejects a deploy response without a deployment identifier", async () => {
    const client = new CoolifyClient(env, async () => new Response(JSON.stringify({ deployments: [{}] }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(client.startDeployment("app-1")).rejects.toThrow("invalid");
  });
});
