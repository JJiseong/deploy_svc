import { describe, expect, test } from "bun:test";
import { buildGithubAuthorizationUrl } from "../../src/lib/github/oauth";

describe("GitHub OAuth authorization URL", () => {
  test("forces GitHub's account picker for reconnect and account switching", () => {
    const url = new URL(buildGithubAuthorizationUrl({ clientId: "client-id", redirectUri: "https://portal.example.com/api/github/connect/callback", scope: "read:user user:email repo", state: "state" }));

    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://portal.example.com/api/github/connect/callback");
  });
});
