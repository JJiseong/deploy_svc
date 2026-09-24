"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../../lib/auth/current-user";
import { createDeployment as createDeploymentService, revealBasicAuth as revealBasicAuthService } from "../../lib/deployments/service";

export async function createDeployment(input: unknown) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } };
  const result = await createDeploymentService(user, input);
  if (result.ok) revalidatePath("/dashboard");
  return result;
}
export async function revealBasicAuth(deploymentId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } };
  return revealBasicAuthService(user, deploymentId);
}
