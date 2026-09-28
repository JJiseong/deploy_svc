import { describe, expect, test } from "bun:test";
import {
  accessGrantInputSchema,
  normalizeGithubLogin,
  deploymentInputSchema,
} from "../../src/lib/validation/portal";

describe("portal validation", () => {
  test("normalizes GitHub logins and rejects unsafe values", () => {
    expect(normalizeGithubLogin("  JJiseong ")).toBe("jjiseong");
    expect(() => normalizeGithubLogin("not a login")).toThrow();
  });

  test("accepts an allowed deployment input", () => {
    const result = deploymentInputSchema.parse({
      repository: "JJiseong/example",
      branch: "main",
      idempotencyKey: "request-1234567890",
    });

    expect(result.repository).toBe("JJiseong/example");
  });

  test("rejects arbitrary fields and unsafe repository owners", () => {
    expect(() =>
      deploymentInputSchema.parse({
        repository: "evil/example",
        branch: "main",
        idempotencyKey: "request-1234567890",
        dockerRunOptions: "--privileged",
      }),
    ).toThrow();
  });

  test("validates administrator grant input", () => {
    expect(accessGrantInputSchema.parse({ githubLogin: "octocat", role: "USER" })).toEqual({
      githubLogin: "octocat",
      role: "USER",
    });
  });
});
