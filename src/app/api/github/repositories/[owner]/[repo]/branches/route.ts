import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getGithubAccessToken } from "@/lib/github/account";
import { GitHubRepositoriesError, listGitHubBranches } from "@/lib/github/repositories";
import { getEnv } from "@/lib/env";
import { isAllowedRepositoryOwner } from "@/lib/validation/portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ owner: string; repo: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (user.mustChangePassword) return NextResponse.json({ error: "PASSWORD_CHANGE_REQUIRED", message: "먼저 새 비밀번호를 설정하세요." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  const { owner, repo } = await context.params;
  if (!owner || !repo || repo.includes("/") || !isAllowedRepositoryOwner(`${owner}/${repo}`, getEnv().ALLOWED_GITHUB_OWNERS)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const token = await getGithubAccessToken(user.id);
  if (!token) return NextResponse.json({ error: "GITHUB_REAUTH_REQUIRED", message: "저장소를 보려면 GitHub 연결이 필요합니다." }, { status: 409, headers: { "Cache-Control": "no-store" } });
  try {
    const branches = await listGitHubBranches(token, owner, repo);
    return NextResponse.json({ branches }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof GitHubRepositoriesError ? error.status : 502;
    const code = status === 401 ? "GITHUB_REAUTH_REQUIRED" : status === 403 ? "GITHUB_RATE_LIMITED" : "GITHUB_UNAVAILABLE";
    const message = code === "GITHUB_REAUTH_REQUIRED" ? "GitHub 연결이 만료되었습니다. 대시보드에서 다시 연결하세요." : code === "GITHUB_RATE_LIMITED" ? "GitHub 요청 한도에 도달했습니다. 잠시 후 다시 시도하세요." : "브랜치 목록을 불러오지 못했습니다. 잠시 후 다시 시도하세요.";
    return NextResponse.json({ error: code, message }, { status: code === "GITHUB_REAUTH_REQUIRED" ? 401 : code === "GITHUB_RATE_LIMITED" ? 429 : 502, headers: { "Cache-Control": "no-store", ...(code === "GITHUB_RATE_LIMITED" ? { "Retry-After": "60" } : {}) } });
  }
}
