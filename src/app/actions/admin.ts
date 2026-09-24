"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../../lib/auth/current-user";
import { createAccessGrant, setAccessGrantStatus, updateAccessGrantRole } from "../../lib/auth/grants";

export async function addAccessGrant(input: unknown) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } };
  try {
    const grant = await createAccessGrant(user.id, input);
    revalidatePath("/admin/users");
    return { ok: true as const, data: grant };
  } catch (error) {
    return { ok: false as const, error: { code: "ADMIN_MUTATION_FAILED", message: error instanceof Error && error.message.includes("Unique") ? "This GitHub login is already allowed." : "Could not update access grants." } };
  }
}
export async function changeAccessGrantRole(grantId: string, role: unknown) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } };
  try {
    const grant = await updateAccessGrantRole(user.id, grantId, role);
    revalidatePath("/admin/users");
    return { ok: true as const, data: grant };
  } catch {
    return { ok: false as const, error: { code: "ADMIN_MUTATION_FAILED", message: "Could not change the role." } };
  }
}

export async function changeAccessGrantStatus(grantId: string, status: "ACTIVE" | "INACTIVE") {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } };
  try {
    const grant = await setAccessGrantStatus(user.id, grantId, status);
    revalidatePath("/admin/users");
    return { ok: true as const, data: grant };
  } catch (error) {
    return { ok: false as const, error: { code: "ADMIN_MUTATION_FAILED", message: error instanceof Error && error.message === "LAST_ADMIN" ? "At least one active administrator is required." : "Could not change the user status." } };
  }
}
