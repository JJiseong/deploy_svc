import "server-only";
import { prisma } from "../db";
import { requireAdminById } from "./authorization";
import { accessGrantInputSchema, normalizeGithubLogin, roleSchema } from "../validation/portal";
import { writeAuditEvent } from "../audit";
import { consumePersistedRateLimit } from "../security/rate-limit";

async function checkAdminMutationLimit(actorId: string): Promise<void> {
  const result = await consumePersistedRateLimit(prisma, { subject: actorId, action: "admin:mutation", limit: 30, windowMs: 60_000 });
  if (!result.allowed) throw new Error("RATE_LIMITED");
}

export async function createAccessGrant(actorId: string, input: unknown) {
  await requireAdminById(actorId);
  await checkAdminMutationLimit(actorId);
  const data = accessGrantInputSchema.parse(input);
  const grant = await prisma.accessGrant.create({ data: { githubLogin: data.githubLogin, role: data.role, createdById: actorId } });
  await writeAuditEvent({ actorId, action: "ACCESS_GRANT_CREATE", outcome: "SUCCESS", targetType: "AccessGrant", targetId: grant.id, metadata: { githubLogin: grant.githubLogin, role: grant.role } });
  return grant;
}

export async function updateAccessGrantRole(actorId: string, grantId: string, role: unknown) {
  await requireAdminById(actorId);
  await checkAdminMutationLimit(actorId);
  const nextRole = roleSchema.parse(role);
  const grant = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.accessGrant.update({ where: { id: grantId }, data: { role: nextRole }, include: { user: true } });
    if (updated.userId) await transaction.user.update({ where: { id: updated.userId }, data: { role: nextRole } });
    return updated;
  });
  await writeAuditEvent({ actorId, action: "ACCESS_GRANT_ROLE", outcome: "SUCCESS", targetType: "AccessGrant", targetId: grant.id, metadata: { role: nextRole } });
  return grant;
}

export async function setAccessGrantStatus(actorId: string, grantId: string, status: "ACTIVE" | "INACTIVE") {
  await requireAdminById(actorId);
  await checkAdminMutationLimit(actorId);
  const result = await prisma.$transaction(async (transaction) => {
    const grant = await transaction.accessGrant.findUnique({ where: { id: grantId }, include: { user: true } });
    if (!grant) throw new Error("ACCESS_GRANT_NOT_FOUND");
    if (status === "INACTIVE" && grant.role === "ADMIN") {
      const activeAdminCount = await transaction.user.count({ where: { role: "ADMIN", status: "ACTIVE", id: { not: grant.userId ?? "" } } });
      const activeGrantCount = await transaction.accessGrant.count({ where: { role: "ADMIN", status: "ACTIVE", id: { not: grant.id } } });
      if (activeAdminCount === 0 && activeGrantCount === 0) throw new Error("LAST_ADMIN");
    }
    const updated = await transaction.accessGrant.update({ where: { id: grantId }, data: { status }, include: { user: true } });
    if (grant.userId) {
      await transaction.user.update({ where: { id: grant.userId }, data: { status } });
      if (status === "INACTIVE") await transaction.session.deleteMany({ where: { userId: grant.userId } });
    }
    return updated;
  });
  await writeAuditEvent({ actorId, action: status === "ACTIVE" ? "ACCESS_GRANT_ACTIVATE" : "ACCESS_GRANT_DEACTIVATE", outcome: "SUCCESS", targetType: "AccessGrant", targetId: result.id, metadata: { status } });
  return result;
}

export function normalizeGrantLogin(login: string): string {
  return normalizeGithubLogin(login);
}
