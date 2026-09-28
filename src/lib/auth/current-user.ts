import "server-only";
import { cookies } from "next/headers";
import { auth } from "../../auth";
import { prisma } from "../db";
import { loadAuthorizedUser, type AuthorizedUser } from "./authorization";

export async function getCurrentUser(): Promise<AuthorizedUser | null> {
  const session = await auth();
  const userId = session?.user?.id ?? await (async () => {
    const token = (await cookies()).get("portal.session-token")?.value;
    if (!token) return null;
    const stored = await prisma.session.findUnique({ where: { sessionToken: token }, select: { userId: true, expires: true } });
    return stored && stored.expires > new Date() ? stored.userId : null;
  })();
  if (!userId) return null;
  try {
    return await loadAuthorizedUser(userId);
  } catch {
    return null;
  }
}
