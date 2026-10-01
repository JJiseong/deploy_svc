import { describe, expect, test } from "bun:test";
import { analyzeGitHubRepository, listGitHubBranches, listGitHubRepositories } from "../../src/lib/github/repositories";

function response(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function encoded(content: string) {
  return Buffer.from(content, "utf8").toString("base64");
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

  test("detects the actual Node server port from repository files", async () => {
    const result = await analyzeGitHubRepository("oauth-token", "JJiseong", "typing-practice", "main", async (input) => {
      const url = String(input);
      if (url.includes("/contents?ref=main")) return response([{ name: "package.json", type: "file" }, { name: "server.js", type: "file" }]);
      if (url.includes("/contents/package.json?ref=main")) return response({ type: "file", encoding: "base64", content: encoded(JSON.stringify({ scripts: { start: "node server.js" } })) });
      if (url.includes("/contents/server.js?ref=main")) return response({ type: "file", encoding: "base64", content: encoded("const PORT = Number(process.env.PORT) || 3001; app.listen(PORT);") });
      throw new Error(`unexpected GitHub path: ${url}`);
    });

    expect(result).toMatchObject({ buildPack: "NIXPACKS", port: 3001 });
    expect(result.explanation).toContain("3001");
  });

  test("uses Dockerfile EXPOSE as the container port", async () => {
    const result = await analyzeGitHubRepository("oauth-token", "JJiseong", "docker-app", "main", async (input) => {
      const url = String(input);
      if (url.includes("/contents?ref=main")) return response([{ name: "Dockerfile", type: "file" }]);
      if (url.includes("/contents/Dockerfile?ref=main")) return response({ type: "file", encoding: "base64", content: encoded("FROM node:22\nEXPOSE 8080\nCMD [\"node\", \"server.js\"]") });
      throw new Error(`unexpected GitHub path: ${url}`);
    });

    expect(result).toMatchObject({ buildPack: "DOCKERFILE", port: 8080 });
  });
});
