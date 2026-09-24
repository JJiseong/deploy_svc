import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { handlers } from "../../../../auth";
import { getEnv } from "../../../../lib/env";
import { prisma } from "../../../../lib/db";
import { consumePersistedRateLimit } from "../../../../lib/security/rate-limit";

export const runtime = "nodejs";

async function guarded(request: NextRequest, handler: (request: NextRequest) => Response | Promise<Response>) {
  const env = getEnv();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const subject = createHmac("sha256", env.AUTH_SECRET).update(ip).digest("hex");
  const action = new URL(request.url).pathname.endsWith("/signin") ? "auth:signin" : "auth:callback";
  const limit = action === "auth:signin" ? 5 : 20;
  const result = await consumePersistedRateLimit(prisma, { subject, action, limit, windowMs: 15 * 60_000 });
  if (!result.allowed) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds), "Cache-Control": "no-store" } });
  return handler(request);
}

export async function GET(request: NextRequest) { return guarded(request, handlers.GET); }
export async function POST(request: NextRequest) { return guarded(request, handlers.POST); }
