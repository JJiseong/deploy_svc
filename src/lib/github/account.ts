import "server-only";
import { prisma } from "../db";

export async function getGithubAccessToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "github" },
    select: { access_token: true },
  });
  return account?.access_token?.trim() || null;
}
