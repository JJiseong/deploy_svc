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
