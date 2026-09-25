import { describe, expect, test } from "bun:test";
import { authorizeGithubSignIn } from "../../src/lib/auth/access";

describe("GitHub sign-in access checks", () => {
  test("allows the bootstrap OAuth callback before the adapter creates the database user", async () => {
    const result = await authorizeGithubSignIn(
      { id: "github-provider-account-id" },
      { id: 12345, login: "JJiseong" },
      "JJiseong",
      {
        user: { findUnique: async () => null },
        accessGrant: { findUnique: async () => null },
      } as never,
    );

    expect(result).toBe(true);
  });
});
