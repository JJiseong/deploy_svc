import "server-only";

import { isAllowedRepositoryOwner } from "../validation/portal";

const GITHUB_API = "https://api.github.com";
const MAX_REPOSITORY_PAGES = 5;

export type GitHubRepositoryOption = {
  id: string;
  name: string;
  fullName: string;
  ownerLogin: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  htmlUrl: string;
};

export type GitHubBranchOption = {
  name: string;
  sha: string;
  protected: boolean;
};
export type RepositoryAnalysis = { buildPack: "AUTO" | "NIXPACKS" | "DOCKERFILE" | "STATIC"; port: number; explanation: string; startCommand?: string };

type GitHubRepositoryResponse = {
  id?: number | string;
  name?: string;
  full_name?: string;
  private?: boolean;
  archived?: boolean;
  disabled?: boolean;
  default_branch?: string;
  description?: string | null;
  html_url?: string;
  owner?: { login?: string };
};

type GitHubBranchResponse = {
  name?: string;
  protected?: boolean;
  commit?: { sha?: string };
};

type GitHubContentEntry = {
  name?: string;
  path?: string;
  type?: string;
  encoding?: string;
  content?: string;
};

export class GitHubRepositoriesError extends Error {
  readonly status: number;

  constructor(status: number, message = "GitHub repository lookup failed") {
    super(message);
    this.name = "GitHubRepositoriesError";
    this.status = status;
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

async function githubRequest<T>(path: string, accessToken: string, fetcher: FetchLike): Promise<{ body: T; response: Response }> {
  const response = await fetcher(`${GITHUB_API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "deploy-svc-portal",
    },
  });
  if (!response.ok) throw new GitHubRepositoriesError(response.status);
  return { body: await response.json() as T, response };
}

async function readGitHubFile(path: string, accessToken: string, fetcher: FetchLike): Promise<string | null> {
  try {
    const { body } = await githubRequest<GitHubContentEntry>(path, accessToken, fetcher);
    if (body.type !== "file" || body.encoding !== "base64" || !body.content) return null;
    return Buffer.from(body.content.replace(/\s/g, ""), "base64").toString("utf8");
  } catch (error) {
    // Optional repository files may not exist. Authentication and rate-limit errors
    // must still propagate so the caller can prompt for GitHub reconnection.
    if (error instanceof GitHubRepositoriesError && error.status === 404) return null;
    // File inspection is an enhancement over the root listing. If an older
    // GitHub-compatible proxy does not expose the Contents file response, keep
    // the safe default detector instead of blocking an otherwise valid deploy.
    if (!(error instanceof GitHubRepositoriesError)) return null;
    throw error;
  }
}

function contentPath(owner: string, repository: string, filePath: string, ref: string) {
  const encodedPath = filePath.split("/").map((part) => encodeURIComponent(part)).join("/");
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
}

function parsePort(value: string | undefined): number | null {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

function detectPort(source: string): number | null {
  const patterns = [
    /\bEXPOSE\s+(\d{1,5})\b/i,
    /process\.env\.PORT\s*\)?\s*(?:\|\||\?\?)\s*(\d{1,5})/i,
    /(?:PORT|port)\s*[:=]\s*(\d{1,5})\b/,
    /\.(?:listen|listenAsync)\s*\(\s*(\d{1,5})\b/i,
    /(?:--port|-p)\s*[= ]\s*(\d{1,5})\b/i,
  ];
  for (const pattern of patterns) {
    const port = parsePort(pattern.exec(source)?.[1]);
    if (port) return port;
  }
  return null;
}

function scriptFileCandidates(packageJson: { main?: unknown; scripts?: { start?: unknown } }): string[] {
  const candidates: string[] = [];
  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    const match = value.match(/(?:^|\s)([A-Za-z0-9_./-]+\.(?:[cm]?js|tsx?|jsx?))(?:\s|$)/);
    if (match?.[1] && !candidates.includes(match[1])) candidates.push(match[1]);
  };
  add(packageJson.main);
  add(packageJson.scripts?.start);
  for (const fallback of ["server.js", "server.ts", "app.js", "app.ts", "index.js", "index.ts", "main.js", "main.ts"]) {
    if (!candidates.includes(fallback)) candidates.push(fallback);
  }
  return candidates;
}

export async function listGitHubRepositories(accessToken: string, allowedOwners: readonly string[], fetcher: FetchLike = (input, init) => fetch(input, init)): Promise<GitHubRepositoryOption[]> {
  if (!accessToken.trim()) throw new GitHubRepositoriesError(401, "GitHub access token is missing");
  const repositories: GitHubRepositoryOption[] = [];
  for (let page = 1; page <= MAX_REPOSITORY_PAGES; page += 1) {
    const { body, response } = await githubRequest<GitHubRepositoryResponse[]>(`/user/repos?per_page=100&page=${page}&affiliation=owner%2Ccollaborator%2Corganization_member&sort=updated`, accessToken, fetcher);
    for (const repository of body) {
      const ownerLogin = repository.owner?.login;
      const fullName = repository.full_name;
      const name = repository.name;
      const defaultBranch = repository.default_branch;
      const htmlUrl = repository.html_url;
      if (!ownerLogin || !fullName || !name || !defaultBranch || !htmlUrl || repository.id === undefined) continue;
      if (repository.archived || repository.disabled || !isAllowedRepositoryOwner(fullName, allowedOwners)) continue;
      repositories.push({
        id: String(repository.id),
        name,
        fullName,
        ownerLogin,
        private: repository.private === true,
        defaultBranch,
        description: repository.description ?? null,
        htmlUrl,
      });
    }
    if (!response.headers.get("link")?.includes('rel="next"')) break;
  }
  return repositories;
}

export async function listGitHubBranches(accessToken: string, owner: string, repository: string, fetcher: FetchLike = (input, init) => fetch(input, init)): Promise<GitHubBranchOption[]> {
  if (!accessToken.trim()) throw new GitHubRepositoriesError(401, "GitHub access token is missing");
  const encodedOwner = encodeURIComponent(owner);
  const encodedRepository = encodeURIComponent(repository);
  const { body } = await githubRequest<GitHubBranchResponse[]>(`/repos/${encodedOwner}/${encodedRepository}/branches?per_page=100`, accessToken, fetcher);
  return body.reduce<GitHubBranchOption[]>((branches, branch) => {
    const sha = branch.commit?.sha;
    if (branch.name && sha) branches.push({ name: branch.name, sha, protected: branch.protected === true });
    return branches;
  }, []);
}

export async function analyzeGitHubRepository(accessToken: string, owner: string, repository: string, ref: string, fetcher: FetchLike = (input, init) => fetch(input, init)): Promise<RepositoryAnalysis> {
  const { body } = await githubRequest<GitHubContentEntry[]>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents?ref=${encodeURIComponent(ref)}`, accessToken, fetcher);
  const files = body.filter((item) => item.type === "file" && item.name);
  const byName = new Map(files.map((item) => [item.name!.toLowerCase(), item.name!]));

  const dockerfile = byName.get("dockerfile");
  if (dockerfile) {
    const source = await readGitHubFile(contentPath(owner, repository, dockerfile, ref), accessToken, fetcher);
    const port = detectPort(source ?? "") ?? 3000;
    return { buildPack: "DOCKERFILE", port, explanation: `Dockerfile을 찾아 프로젝트가 정한 방식으로 배포합니다.${source && port !== 3000 ? ` 컨테이너 포트 ${port}를 자동으로 감지했습니다.` : " 기본 웹 포트 3000을 사용합니다."}` };
  }

  const packageFile = byName.get("package.json");
  if (packageFile) {
    let packageJson: { main?: unknown; scripts?: { start?: unknown } } = {};
    const packageSource = await readGitHubFile(contentPath(owner, repository, packageFile, ref), accessToken, fetcher);
    if (packageSource) {
      try { packageJson = JSON.parse(packageSource) as typeof packageJson; } catch { /* use safe defaults */ }
    }
    const declaredStartCommand = typeof packageJson.scripts?.start === "string" ? packageJson.scripts.start.trim() : "";
    const startCommand = declaredStartCommand;
    let port = detectPort(startCommand);
    let detectedFrom: string | null = port ? "실행 명령" : null;
    let inferredStartCommand = declaredStartCommand || null;
    if (!port) {
      for (const candidate of scriptFileCandidates(packageJson)) {
        const actualName = byName.get(candidate.toLowerCase());
        if (!actualName) continue;
        const source = await readGitHubFile(contentPath(owner, repository, actualName, ref), accessToken, fetcher);
        port = detectPort(source ?? "");
        if (port) { detectedFrom = actualName; break; }
      }
    }
    if (!inferredStartCommand) {
      for (const candidate of scriptFileCandidates(packageJson)) {
        const actualName = byName.get(candidate.toLowerCase());
        if (!actualName || !/\.(?:c?m?js)$/i.test(actualName)) continue;
        inferredStartCommand = `node ${actualName}`;
        break;
      }
    }
    port ??= 3000;
    return { buildPack: "NIXPACKS", port, ...(inferredStartCommand ? { startCommand: inferredStartCommand } : {}), explanation: `Node 웹앱으로 인식해 필요한 실행 환경을 자동으로 준비합니다.${detectedFrom ? ` ${detectedFrom}에서 포트 ${port}를 감지했습니다.` : " 기본 웹 포트 3000을 사용합니다."}` };
  }
  if (byName.has("index.html")) return { buildPack: "STATIC", port: 80, explanation: "정적 HTML 사이트로 인식해 공개 웹사이트로 배포합니다." };
  return { buildPack: "AUTO", port: 3000, explanation: "일반 웹앱으로 인식했습니다. 배포가 실패하면 저장소에 Dockerfile 또는 실행 안내를 추가해 주세요." };
}
