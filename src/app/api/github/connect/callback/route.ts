import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { persistProviderAccessToken } from "@/lib/auth/adapter";
import { writeAuditEvent } from "@/lib/audit";

const cookieName = "portal.github-connect";
function signature(value: string) { return createHmac("sha256", process.env.AUTH_SECRET ?? "").update(value).digest("base64url"); }
function same(a: string, b: string) { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }

export async function GET(request: Request) {
  const user = await getCurrentUser(); const url = new URL(request.url); const code = url.searchParams.get("code"); const state = url.searchParams.get("state");
  const saved = (await cookies()).get(cookieName)?.value ?? ""; const [userId, savedState, savedSignature] = saved.split(".");
  const finish = (path: string) => { const response = NextResponse.redirect(new URL(path, request.url)); response.cookies.delete(cookieName); return response; };
  if (!user || !code || !state || user.id !== userId || state !== savedState || !savedSignature || !same(signature(`${userId}.${savedState}`), savedSignature)) return finish("/dashboard?github=failed");
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ client_id: process.env.AUTH_GITHUB_ID, client_secret: process.env.AUTH_GITHUB_SECRET, code }) });
  const token = (await tokenResponse.json() as { access_token?: string }).access_token;
  if (!token) return finish("/dashboard?github=failed");
  const profileResponse = await fetch("https://api.github.com/user", { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "User-Agent": "deploy-svc-portal" } });
  const profile = await profileResponse.json() as { id?: number; login?: string; name?: string; avatar_url?: string };
  if (!profileResponse.ok || !profile.id || !profile.login) return finish("/dashboard?github=failed");
  try {
    await prisma.user.update({ where: { id: user.id }, data: { githubId: String(profile.id), githubLogin: profile.login.toLowerCase(), name: profile.name ?? undefined, image: profile.avatar_url ?? undefined } });
    await persistProviderAccessToken(user.id, "github", token);
    await writeAuditEvent({ actorId: user.id, action: "GITHUB_CONNECT", outcome: "SUCCESS", metadata: { githubLogin: profile.login.toLowerCase() } });
    return finish("/dashboard?github=connected");
  } catch { return finish("/dashboard?github=failed"); }
}
