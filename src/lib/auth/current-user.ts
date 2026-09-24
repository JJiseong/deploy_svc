import "server-only";
import { auth } from "../../auth";
import { loadAuthorizedUser, type AuthorizedUser } from "./authorization";

export async function getCurrentUser(): Promise<AuthorizedUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  try {
    return await loadAuthorizedUser(session.user.id);
  } catch {
    return null;
  }
}
