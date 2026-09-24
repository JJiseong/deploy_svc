import "server-only";
import { prisma } from "../db";
import { normalizeGithubLogin } from "../validation/portal";

type AccessClient = Pick<typeof prisma, "accessGrant" | "user">;

export async function ensureBootstrapGrant(login: string, client: AccessClient = prisma) {
  const normalized = normalizeGithubLogin(login);
  return client.accessGrant.upsert({
    where: { githubLogin: normalized },
    create: { githubLogin: normalized, role: "ADMIN", status: "ACTIVE" },
    update: { role: "ADMIN", status: "ACTIVE" },
  });
}

export async function isGithubLoginAllowed(
  login: string,
  bootstrapLogin: string,
  client: AccessClient = prisma,
): Promise<boolean> {
  const normalized = normalizeGithubLogin(login);
  if (normalized === normalizeGithubLogin(bootstrapLogin)) return true;
  const grant = await client.accessGrant.findUnique({ where: { githubLogin: normalized }, select: { status: true } });
  return grant?.status === "ACTIVE";
}

export async function bindGithubUser(
  userId: string,
  profile: { id: string | number; login: string; name?: string | null; email?: string | null; avatar_url?: string | null },
  bootstrapLogin: string,
  client: AccessClient = prisma,
): Promise<void> {
  const githubLogin = normalizeGithubLogin(profile.login);
  const existingUser = await client.user.findUnique({ where: { id: userId }, select: { githubId: true } });
  if (existingUser?.githubId && existingUser.githubId !== String(profile.id)) throw new Error("GITHUB_ID_MISMATCH");
  const isBootstrap = githubLogin === normalizeGithubLogin(bootstrapLogin);
  const grant = isBootstrap
    ? await ensureBootstrapGrant(githubLogin, client)
    : await client.accessGrant.findUnique({ where: { githubLogin } });
  if (!grant || grant.status !== "ACTIVE") throw new Error("ACCESS_DENIED");
  if (grant.userId && grant.userId !== userId) throw new Error("GITHUB_LOGIN_ALREADY_BOUND");

  await client.user.update({
    where: { id: userId },
    data: {
      githubId: String(profile.id),
      githubLogin,
      name: profile.name ?? undefined,
      email: profile.email ?? undefined,
      image: profile.avatar_url ?? undefined,
      role: grant.role,
      status: "ACTIVE",
      lastLoginAt: new Date(),
    },
  });
  await client.accessGrant.update({ where: { id: grant.id }, data: { userId } });
}
