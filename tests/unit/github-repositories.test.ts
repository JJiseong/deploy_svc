import { describe, expect, test } from "bun:test";
import { listGitHubBranches, listGitHubRepositories } from "../../src/lib/github/repositories";

function response(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("GitHub repository discovery", () => {
  test("filters repositories to allowed owners and returns safe selection metadata", async () => {
    const result = await listGitHubRepositories("oauth-token", ["jjiseong"], async () => response([
      {
        id: 1,
        name: "portal",
        full_name: "JJiseong/portal",
        private: true,
        archived: false,
        disabled: false,
        default_branch: "main",
        description: "A portal",
        html_url: "https://github.com/JJiseong/portal",
        owner: { login: "JJiseong" },
      },
      {
        id: 2,
        name: "other",
        full_name: "other-user/other",
        private: false,
        archived: false,
        disabled: false,
        default_branch: "main",
        description: null,
        html_url: "https://github.com/other-user/other",
        owner: { login: "other-user" },
      },
      {
        id: 3,
        name: "archived",
        full_name: "JJiseong/archived",
        private: false,
        archived: true,
        disabled: false,
        default_branch: "main",
        description: null,
        html_url: "https://github.com/JJiseong/archived",
        owner: { login: "JJiseong" },
      },
    ]));

    expect(result).toEqual([{ id: "1", name: "portal", fullName: "JJiseong/portal", ownerLogin: "JJiseong", private: true, defaultBranch: "main", description: "A portal", htmlUrl: "https://github.com/JJiseong/portal" }]);
  });

  test("maps branch names and commit identifiers", async () => {
    const result = await listGitHubBranches("oauth-token", "JJiseong", "portal", async () => response([
      { name: "main", commit: { sha: "abc123" }, protected: true },
      { name: "feature/login", commit: { sha: "def456" }, protected: false },
    ]));

    expect(result).toEqual([
      { name: "main", sha: "abc123", protected: true },
      { name: "feature/login", sha: "def456", protected: false },
    ]);
  });
});
