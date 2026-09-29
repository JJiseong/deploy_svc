import "server-only";
import { prisma } from "../db";
import { decryptSecret } from "../security/crypto";

function decryptProviderAccessToken(value: string): string | null {
  const [prefix, version, ciphertext, iv, authTag] = value.split(":");
  if (prefix !== "enc" || version !== "v1" || !ciphertext || !iv || !authTag) return null;
  try {
    return decryptSecret({ ciphertext, iv, authTag });
  } catch {
    return null;
  }
}

export async function getGithubAccessToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "github" },
    select: { access_token: true },
  });
  const encrypted = account?.access_token?.trim();
  return encrypted ? decryptProviderAccessToken(encrypted) : null;
}

export async function clearGithubConnection(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.account.deleteMany({ where: { userId, provider: "github" } }),
    prisma.user.update({ where: { id: userId }, data: { githubId: null, githubLogin: null, image: null } }),
  ]);
}
