"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../../lib/auth/current-user";
import { createAccessGrant, setAccessGrantStatus, updateAccessGrantRole } from "../../lib/auth/grants";

export async function addAccessGrant(input: unknown) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: { code: "UNAUTHENTICATED", message: "계속하려면 로그인하세요." } };
  try {
    const grant = await createAccessGrant(user.id, input);
    revalidatePath("/admin/users");
    return { ok: true as const, data: grant };
  } catch (error) {
    return { ok: false as const, error: { code: "ADMIN_MUTATION_FAILED", message: error instanceof Error && error.message.includes("Unique") ? "이 GitHub 로그인은 이미 허용되어 있습니다." : "접근 권한을 업데이트할 수 없습니다." } };
  }
}
export async function changeAccessGrantRole(grantId: string, role: unknown) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: { code: "UNAUTHENTICATED", message: "계속하려면 로그인하세요." } };
  try {
    const grant = await updateAccessGrantRole(user.id, grantId, role);
    revalidatePath("/admin/users");
    return { ok: true as const, data: grant };
  } catch {
    return { ok: false as const, error: { code: "ADMIN_MUTATION_FAILED", message: "역할을 변경할 수 없습니다." } };
  }
}

export async function changeAccessGrantStatus(grantId: string, status: "ACTIVE" | "INACTIVE") {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: { code: "UNAUTHENTICATED", message: "계속하려면 로그인하세요." } };
  try {
    const grant = await setAccessGrantStatus(user.id, grantId, status);
    revalidatePath("/admin/users");
    return { ok: true as const, data: grant };
  } catch (error) {
    return { ok: false as const, error: { code: "ADMIN_MUTATION_FAILED", message: error instanceof Error && error.message === "LAST_ADMIN" ? "활성 관리자가 한 명 이상 필요합니다." : "사용자 상태를 변경할 수 없습니다." } };
  }
}
