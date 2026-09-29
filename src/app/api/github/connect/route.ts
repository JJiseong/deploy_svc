import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { buildGithubAuthorizationUrl } from "@/lib/github/oauth";

const cookieName = "portal.github-connect";
function signature(value: string) { return createHmac("sha256", process.env.AUTH_SECRET ?? "").update(value).digest("base64url"); }

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", process.env.AUTH_URL));
  const state = randomBytes(24).toString("base64url");
  const payload = `${user.id}.${state}`;
  const response = NextResponse.redirect(buildGithubAuthorizationUrl({ clientId: process.env.AUTH_GITHUB_ID ?? "", redirectUri: new URL("/api/github/connect/callback", process.env.AUTH_URL).toString(), scope: "read:user user:email repo", state }));
  response.cookies.set(cookieName, `${payload}.${signature(payload)}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
  return response;
}
