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
export type RepositoryAnalysis = { buildPack: "AUTO" | "NIXPACKS" | "DOCKERFILE" | "STATIC"; port: number; explanation: string };

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
  const { body } = await githubRequest<Array<{ name?: string; type?: string }>>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents?ref=${encodeURIComponent(ref)}`, accessToken, fetcher);
  const names = new Set(body.filter((item) => item.type === "file" && item.name).map((item) => item.name!.toLowerCase()));
  if (names.has("dockerfile")) return { buildPack: "DOCKERFILE", port: 3000, explanation: "Dockerfile을 찾아 프로젝트가 정한 방식으로 배포합니다." };
  if (names.has("package.json")) return { buildPack: "NIXPACKS", port: 3000, explanation: "Node 웹앱으로 인식해 필요한 실행 환경을 자동으로 준비합니다." };
  if (names.has("index.html")) return { buildPack: "STATIC", port: 80, explanation: "정적 HTML 사이트로 인식해 공개 웹사이트로 배포합니다." };
  return { buildPack: "AUTO", port: 3000, explanation: "일반 웹앱으로 인식했습니다. 배포가 실패하면 저장소에 Dockerfile 또는 실행 안내를 추가해 주세요." };
}
