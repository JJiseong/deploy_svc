import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { getGithubAccessToken } from "../../../../lib/github/account";
import { GitHubRepositoriesError, listGitHubRepositories } from "../../../../lib/github/repositories";
import { getEnv } from "../../../../lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const token = await getGithubAccessToken(user.id);
  if (!token) return NextResponse.json({ error: "GITHUB_REAUTH_REQUIRED", message: "GitHub 권한을 다시 승인하려면 로그아웃 후 다시 로그인하세요." }, { status: 409, headers: { "Cache-Control": "no-store" } });
  try {
    const repositories = await listGitHubRepositories(token, getEnv().ALLOWED_GITHUB_OWNERS);
    return NextResponse.json({ repositories }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof GitHubRepositoriesError ? error.status : 502;
    const code = status === 401 ? "GITHUB_REAUTH_REQUIRED" : status === 403 ? "GITHUB_RATE_LIMITED" : "GITHUB_UNAVAILABLE";
    const message = code === "GITHUB_REAUTH_REQUIRED" ? "GitHub 권한이 만료되었습니다. 로그아웃 후 다시 로그인하세요." : code === "GITHUB_RATE_LIMITED" ? "GitHub 요청 한도에 도달했습니다. 잠시 후 다시 시도하세요." : "GitHub 저장소를 불러오지 못했습니다. 잠시 후 다시 시도하세요.";
    return NextResponse.json({ error: code, message }, { status: code === "GITHUB_REAUTH_REQUIRED" ? 401 : code === "GITHUB_RATE_LIMITED" ? 429 : 502, headers: { "Cache-Control": "no-store", ...(code === "GITHUB_RATE_LIMITED" ? { "Retry-After": "60" } : {}) } });
  }
}
