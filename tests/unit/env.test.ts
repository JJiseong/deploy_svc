import { describe, expect, test } from "bun:test";
import { parseEnv } from "../../src/lib/env";

const validEnv = {
  AUTH_SECRET: "a-secret-that-is-long-enough-for-tests",
  AUTH_GITHUB_ID: "client-id",
  AUTH_GITHUB_SECRET: "client-secret",
  BOOTSTRAP_GITHUB_LOGIN: "JJiseong",
  DATABASE_URL: "file:./portal.db",
  APP_ENCRYPTION_KEY: "a".repeat(64),
  ALLOWED_GITHUB_OWNERS: "JJiseong,another-owner",
  COOLIFY_BASE_URL: "https://coolify.example.test",
  COOLIFY_READ_API_TOKEN: "read-token",
  COOLIFY_WRITE_API_TOKEN: "write-token",
  COOLIFY_DEPLOY_API_TOKEN: "deploy-token",
  COOLIFY_PROJECT_UUID: "project",
  COOLIFY_SERVER_UUID: "server",
  COOLIFY_GITHUB_APP_UUID: "github-app",
  COOLIFY_ENVIRONMENT_NAME: "production",
};

describe("environment validation", () => {
  test("parses required settings and normalizes owner allowlist", () => {
    const env = parseEnv(validEnv);
    expect(env.ALLOWED_GITHUB_OWNERS).toEqual(["jjiseong", "another-owner"]);
  });

  test("rejects missing authentication secrets", () => {
    const { AUTH_SECRET: _removed, ...missing } = validEnv;
    expect(() => parseEnv(missing)).toThrow();
  });

  test("parses boolean host trust values without treating false as true", () => {
    expect(parseEnv({ ...validEnv, AUTH_TRUST_HOST: "false" }).AUTH_TRUST_HOST).toBe(false);
    expect(parseEnv({ ...validEnv, AUTH_TRUST_HOST: "true" }).AUTH_TRUST_HOST).toBe(true);
  });

  test("rejects non-SQLite database URLs and non-HTTPS Coolify endpoints", () => {
    expect(() => parseEnv({ ...validEnv, DATABASE_URL: "postgresql://localhost/portal" })).toThrow("SQLite URL");
    expect(() => parseEnv({ ...validEnv, COOLIFY_BASE_URL: "http://coolify.example.test" })).toThrow("HTTPS");
  });

  test("rejects embedded Coolify URL credentials and query strings", () => {
    expect(() => parseEnv({ ...validEnv, COOLIFY_BASE_URL: "https://user:password@coolify.example.test" })).toThrow("HTTPS without");
    expect(() => parseEnv({ ...validEnv, COOLIFY_BASE_URL: "https://coolify.example.test/?token=leak" })).toThrow("HTTPS without");
  });
});
