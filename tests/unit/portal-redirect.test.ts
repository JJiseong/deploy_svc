import { describe, expect, test } from "bun:test";
import { portalRedirectUrl } from "../../src/lib/auth/portal-redirect";

describe("portal OAuth redirects", () => {
  test("uses the public configured origin when the request came through an internal proxy", () => {
    expect(portalRedirectUrl("/dashboard?github=connected", "https://0.0.0.0:3000/api/github/connect/callback", "https://portal.example.com").toString()).toBe("https://portal.example.com/dashboard?github=connected");
  });

  test("falls back to the request origin when no public origin is configured", () => {
    expect(portalRedirectUrl("/dashboard", "https://portal.example.com/api/github/connect/callback").toString()).toBe("https://portal.example.com/dashboard");
  });
});
