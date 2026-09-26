#!/usr/bin/env bun
/**
 * route-smoke.ts — Authenticated HTTP route smoke test for the local portal.
 * @version 1.3.0
 *
 * This test creates short-lived synthetic database sessions, exercises the
 * server-rendered route boundary, and removes every fixture in a finally
 * block. It refuses non-loopback URLs and requires an explicit opt-in so it
 * cannot mutate a staging or production database by accident.
 */
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const baseUrl = process.env.ROUTE_SMOKE_BASE_URL?.trim() ?? "http://127.0.0.1:3000";
const allowMutation = process.env.ROUTE_SMOKE_ALLOW_MUTATION === "true";
const parsedBaseUrl = new URL(baseUrl);

if (!allowMutation) throw new Error("ROUTE_SMOKE_ALLOW_MUTATION=true is required");
if (!['127.0.0.1', 'localhost', '::1'].includes(parsedBaseUrl.hostname)) {
  throw new Error("route-smoke only permits loopback ROUTE_SMOKE_BASE_URL values");
}

const suffix = `${process.pid}-${Date.now()}`;
const adminId = `route-smoke-admin-${suffix}`;
const memberId = `route-smoke-member-${suffix}`;
const adminToken = `route-smoke-admin-token-${suffix}`;
const memberToken = `route-smoke-member-token-${suffix}`;
const expiredToken = `route-smoke-expired-token-${suffix}`;
const ownedDeploymentId = `route-smoke-owned-${suffix}`;
const otherDeploymentId = `route-smoke-other-${suffix}`;
const prisma = new PrismaClient();

function url(path: string): string {
  return new URL(path, parsedBaseUrl).toString();
}

async function request(path: string, sessionToken?: string): Promise<{ response: Response; body: string }> {
  const response = await fetch(url(path), {
    redirect: "manual",
    headers: sessionToken ? { Cookie: `portal.session-token=${sessionToken}` } : undefined,
  });
  return { response, body: await response.text() };
}

function expectBody(label: string, body: string, pattern: string): void {
  if (!body.includes(pattern)) throw new Error(`${label} did not contain expected marker: ${pattern}`);
}

function runAuthenticatedAccessibilityAudit(): void {
  if (process.env.ROUTE_SMOKE_RUN_A11Y !== "true") return;
  const routes = ["/dashboard", "/admin/users", "/admin/audit-logs", `/deployments/${ownedDeploymentId}`].map((path) => url(path));
  const result = spawnSync("node", ["--experimental-strip-types", "scripts/accessibility-audit.ts", ...routes], {
    env: { ...process.env, A11Y_BASE_URL: parsedBaseUrl.origin, A11Y_COOKIE: `portal.session-token=${adminToken}` },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`authenticated accessibility audit exited with status ${result.status ?? "unknown"}`);
}

try {
  const admin = await prisma.user.create({
    data: { id: adminId, githubId: `route-github-admin-${suffix}`, githubLogin: `route-admin-${suffix}`, role: "ADMIN", status: "ACTIVE" },
  });
  const member = await prisma.user.create({
    data: { id: memberId, githubId: `route-github-member-${suffix}`, githubLogin: `route-member-${suffix}`, role: "USER", status: "ACTIVE" },
  });
  await prisma.accessGrant.createMany({
    data: [
      { githubLogin: admin.githubLogin!, role: "ADMIN", status: "ACTIVE", userId: admin.id },
      { githubLogin: member.githubLogin!, role: "USER", status: "ACTIVE", userId: member.id },
    ],
  });
  await prisma.session.createMany({
    data: [
      { sessionToken: adminToken, userId: admin.id, expires: new Date(Date.now() + 60 * 60_000) },
      { sessionToken: memberToken, userId: member.id, expires: new Date(Date.now() + 60 * 60_000) },
      { sessionToken: expiredToken, userId: member.id, expires: new Date(Date.now() - 60_000) },
    ],
  });
  await prisma.deployment.createMany({
    data: [
      {
        id: ownedDeploymentId,
        userId: member.id,
        repository: "jjiseong/route-smoke-owned",
        branch: "main",
        requestedName: "route-smoke-owned",
        port: 3000,
        buildPack: "AUTO",
        idempotencyKey: `route-smoke-owned-key-${suffix}`,
        status: "HEALTHY",
        url: "https://route-smoke-owned.example.test",
      },
      {
        id: otherDeploymentId,
        userId: admin.id,
        repository: "jjiseong/route-smoke-other",
        branch: "main",
        requestedName: "route-smoke-other",
        port: 3000,
        buildPack: "AUTO",
        idempotencyKey: `route-smoke-other-key-${suffix}`,
        status: "FAILED",
        failureSummary: "safe failure",
      },
    ],
  });

  const health = await request("/api/health/live");
  if (!health.response.ok) throw new Error(`health endpoint returned HTTP ${health.response.status}`);
  expectBody("health endpoint", health.body, '"status":"ok"');

  const unauthenticated = await request("/dashboard");
  expectBody("unauthenticated dashboard", unauthenticated.body, "/login");

  const expired = await request("/dashboard", expiredToken);
  expectBody("expired-session dashboard", expired.body, "/login");

  const adminUsers = await request("/admin/users", adminToken);
  if (!adminUsers.response.ok) throw new Error(`admin users route returned HTTP ${adminUsers.response.status}`);
  expectBody("admin users route", adminUsers.body, "사용자 관리");

  const memberAdmin = await request("/admin/users", memberToken);
  expectBody("member admin route", memberAdmin.body, "접근이 거부되었습니다");

  const owned = await request(`/deployments/${ownedDeploymentId}`, memberToken);
  expectBody("owned deployment route", owned.body, "route-smoke-owned");

  const other = await request(`/deployments/${otherDeploymentId}`, memberToken);
  expectBody("other-owner deployment route", other.body, "배포를 찾을 수 없습니다");

  const status = await request(`/api/deployments/${ownedDeploymentId}/status`, memberToken);
  if (!status.response.ok) throw new Error(`deployment status route returned HTTP ${status.response.status}`);
  expectBody("deployment status route", status.body, '"status":"HEALTHY"');
  expectBody("deployment status route", status.body, "route-smoke-owned.example.test");

  const otherStatus = await request(`/api/deployments/${otherDeploymentId}/status`, memberToken);
  if (otherStatus.response.status !== 404) throw new Error(`other-owner status route returned HTTP ${otherStatus.response.status}`);
  expectBody("other-owner status route", otherStatus.body, '"error":"NOT_FOUND"');

  runAuthenticatedAccessibilityAudit();

  console.log("Route smoke passed: auth redirect, admin boundary, ownership isolation, deployment detail, and status API.");
} finally {
  await prisma.session.deleteMany({ where: { sessionToken: { in: [adminToken, memberToken, expiredToken] } } });
  await prisma.deployment.deleteMany({ where: { id: { in: [ownedDeploymentId, otherDeploymentId] } } });
  await prisma.accessGrant.deleteMany({ where: { userId: { in: [adminId, memberId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, memberId] } } });
  await prisma.$disconnect();
}
