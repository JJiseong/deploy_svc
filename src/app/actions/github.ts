"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../../lib/auth/current-user";
import { clearGithubConnection } from "../../lib/github/account";
import { writeAuditEvent } from "../../lib/audit";

export async function disconnectGithub() {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: { code: "UNAUTHENTICATED", message: "계속하려면 로그인하세요." } };
  if (user.mustChangePassword) return { ok: false as const, error: { code: "PASSWORD_CHANGE_REQUIRED", message: "먼저 새 비밀번호를 설정하세요." } };
  try {
    await clearGithubConnection(user.id);
    await writeAuditEvent({ actorId: user.id, action: "GITHUB_DISCONNECT", outcome: "SUCCESS", metadata: { reason: "user_requested" } });
    revalidatePath("/dashboard");
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: { code: "GITHUB_DISCONNECT_FAILED", message: "GitHub 연결을 해제하지 못했습니다. 잠시 후 다시 시도하세요." } };
  }
}
