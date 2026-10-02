import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "../db";
import { writeAuditEvent } from "../audit";
import { requireAdminById } from "./authorization";
import { hashPassword } from "./passwords";
import { memberInputSchema, roleSchema } from "../validation/portal";

function temporaryPassword(): string {
  return `${randomBytes(12).toString("base64url")}!A1`;
}

export async function createMember(actorId: string, input: unknown) {
  await requireAdminById(actorId);
  const data = memberInputSchema.parse(input);
  const password = temporaryPassword();
  const member = await prisma.user.create({ data: { email: data.email, role: data.role, status: "ACTIVE", passwordHash: await hashPassword(password), mustChangePassword: true }, select: { id: true, email: true, role: true, status: true, createdAt: true } });
  await writeAuditEvent({ actorId, action: "MEMBER_CREATE", outcome: "SUCCESS", targetType: "User", targetId: member.id, metadata: { email: member.email, role: member.role } });
  return { member, temporaryPassword: password };
}

export async function resetMemberPassword(actorId: string, memberId: string) {
  await requireAdminById(actorId);
  const password = temporaryPassword();
  const member = await prisma.user.update({ where: { id: memberId }, data: { passwordHash: await hashPassword(password), mustChangePassword: true }, select: { id: true, email: true, role: true, status: true, createdAt: true } });
  await writeAuditEvent({ actorId, action: "MEMBER_PASSWORD_RESET", outcome: "SUCCESS", targetType: "User", targetId: member.id, metadata: { email: member.email } });
  return { member, temporaryPassword: password };
}

export async function updateMemberRole(actorId: string, memberId: string, role: unknown) {
  await requireAdminById(actorId);
  const nextRole = roleSchema.parse(role);
  const member = await prisma.user.update({ where: { id: memberId }, data: { role: nextRole } });
  await writeAuditEvent({ actorId, action: "MEMBER_ROLE", outcome: "SUCCESS", targetType: "User", targetId: member.id, metadata: { role: member.role } });
  return member;
}

export async function setMemberStatus(actorId: string, memberId: string, status: "ACTIVE" | "INACTIVE") {
  await requireAdminById(actorId);
  const member = await prisma.$transaction(async (tx) => {
    const current = await tx.user.findUnique({ where: { id: memberId } });
    if (!current) throw new Error("MEMBER_NOT_FOUND");
    if (status === "INACTIVE" && current.role === "ADMIN") {
      const count = await tx.user.count({ where: { role: "ADMIN", status: "ACTIVE", id: { not: memberId } } });
      if (count === 0) throw new Error("LAST_ADMIN");
    }
    const updated = await tx.user.update({ where: { id: memberId }, data: { status } });
    if (status === "INACTIVE") await tx.session.deleteMany({ where: { userId: memberId } });
    return updated;
  });
  await writeAuditEvent({ actorId, action: status === "ACTIVE" ? "MEMBER_ACTIVATE" : "MEMBER_DEACTIVATE", outcome: "SUCCESS", targetType: "User", targetId: member.id, metadata: { email: member.email } });
  return member;
}

export async function changeOwnPassword(userId: string, passwordHash: string) {
  return prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() } });
}
