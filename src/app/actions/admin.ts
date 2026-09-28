"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../../lib/auth/current-user";
import { createMember, resetMemberPassword, setMemberStatus, updateMemberRole } from "../../lib/auth/members";
import { migrateDeploymentsToPublic } from "../../lib/deployments/public-migration";

export async function addMember(input: unknown) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: { code: "UNAUTHENTICATED", message: "계속하려면 로그인하세요." } };
  try {
    const result = await createMember(user.id, input);
    revalidatePath("/admin/users");
    return { ok: true as const, data: result };
  } catch (error) {
    return { ok: false as const, error: { code: "ADMIN_MUTATION_FAILED", message: error instanceof Error && error.message.includes("Unique") ? "이 이메일 계정은 이미 등록되어 있습니다." : "계정 권한을 업데이트할 수 없습니다." } };
  }
}
export async function changeMemberRole(memberId: string, role: unknown) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: { code: "UNAUTHENTICATED", message: "계속하려면 로그인하세요." } };
  try {
    const grant = await updateMemberRole(user.id, memberId, role);
    revalidatePath("/admin/users");
    return { ok: true as const, data: grant };
  } catch {
    return { ok: false as const, error: { code: "ADMIN_MUTATION_FAILED", message: "역할을 변경할 수 없습니다." } };
  }
}

export async function changeMemberStatus(memberId: string, status: "ACTIVE" | "INACTIVE") {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: { code: "UNAUTHENTICATED", message: "계속하려면 로그인하세요." } };
  try {
    const grant = await setMemberStatus(user.id, memberId, status);
    revalidatePath("/admin/users");
    return { ok: true as const, data: grant };
  } catch (error) {
    return { ok: false as const, error: { code: "ADMIN_MUTATION_FAILED", message: error instanceof Error && error.message === "LAST_ADMIN" ? "활성 관리자가 한 명 이상 필요합니다." : "사용자 상태를 변경할 수 없습니다." } };
  }
}
export async function issueTemporaryPassword(memberId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: { code: "UNAUTHENTICATED", message: "계속하려면 로그인하세요." } };
  try { const result = await resetMemberPassword(user.id, memberId); return { ok: true as const, data: result }; }
  catch { return { ok: false as const, error: { code: "ADMIN_MUTATION_FAILED", message: "임시 비밀번호를 발급할 수 없습니다." } }; }
}
export async function makeExistingAppsPublic() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return { ok: false as const, error: { code: "FORBIDDEN", message: "관리자만 실행할 수 있습니다." } };
  const results = await migrateDeploymentsToPublic(user.id);
  revalidatePath("/dashboard");
  return { ok: true as const, data: results };
}
