import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth/current-user";
import { refreshDeploymentStatus } from "../../../../../lib/deployments/service";
import { CoolifyError } from "../../../../../lib/coolify/client";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (user.mustChangePassword) return NextResponse.json({ error: "PASSWORD_CHANGE_REQUIRED", message: "먼저 새 비밀번호를 설정하세요." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  const { id } = await context.params;
  let deployment;
  try {
    deployment = await refreshDeploymentStatus(user, id);
  } catch (error) {
    const retryAfter = error instanceof CoolifyError && error.retryAfterSeconds ? String(error.retryAfterSeconds) : "3";
    return NextResponse.json({ error: "UPSTREAM_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": retryAfter } });
  }
  if (!deployment) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({
    id: deployment.id,
    status: deployment.status,
    url: deployment.url,
    failureSummary: deployment.failureSummary,
    lastUpdatedAt: deployment.updatedAt,
    active: ["REQUESTED", "PROVISIONING", "QUEUED", "IN_PROGRESS"].includes(deployment.status),
  }, { headers: { "Cache-Control": "no-store" } });
}
