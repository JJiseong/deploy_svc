"use server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/current-user";
import { passwordChangeInputSchema } from "../../lib/validation/portal";
import { verifyPassword, hashPassword } from "../../lib/auth/passwords";
import { prisma } from "../../lib/db";
import { changeOwnPassword } from "../../lib/auth/members";

export async function changePassword(input: unknown) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, message: "로그인이 필요합니다." };
  const data = passwordChangeInputSchema.safeParse(input);
  if (!data.success) return { ok: false as const, message: data.error.issues[0]?.message ?? "입력을 확인하세요." };
  const stored = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(data.data.currentPassword, stored?.passwordHash))) return { ok: false as const, message: "현재 비밀번호를 확인하세요." };
  await changeOwnPassword(user.id, await hashPassword(data.data.newPassword));
  return { ok: true as const };
}

export async function requirePasswordChange() { const user = await getCurrentUser(); if (!user) redirect("/login"); return user.mustChangePassword; }
