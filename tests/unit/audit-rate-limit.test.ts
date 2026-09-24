import { describe, expect, test } from "bun:test";
import { redactAuditMetadata } from "../../src/lib/audit";
import { consumeRateLimit, type RateLimitStore } from "../../src/lib/security/rate-limit";

describe("audit metadata", () => {
  test("removes secrets and caps metadata", () => {
    const result = redactAuditMetadata({
      repository: "owner/repo",
      password: "secret",
      access_token: "token",
      nested: { ok: true },
    });

    expect(result).toEqual({ repository: "owner/repo", nested: { ok: true } });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("token");
  });
});

describe("rate limiting", () => {
  test("allows requests until the fixed window limit is reached", async () => {
    const store: RateLimitStore = {
      buckets: new Map(),
    };

    expect(await consumeRateLimit(store, { subject: "ip:1", action: "auth", limit: 2, windowMs: 60_000, now: 1_000 })).toEqual({
      allowed: true,
      remaining: 1,
      retryAfterSeconds: 0,
    });
    expect(await consumeRateLimit(store, { subject: "ip:1", action: "auth", limit: 2, windowMs: 60_000, now: 2_000 })).toEqual({
      allowed: true,
      remaining: 0,
      retryAfterSeconds: 0,
    });
    expect(await consumeRateLimit(store, { subject: "ip:1", action: "auth", limit: 2, windowMs: 60_000, now: 3_000 })).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 57,
    });
  });
});
