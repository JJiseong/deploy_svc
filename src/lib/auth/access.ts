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

/**
 * Check the GitHub identity during Auth.js' signIn callback.
 *
 * Auth.js invokes signIn before it creates a new adapter user. The first OAuth
 * callback therefore cannot bind or update a database user yet; that work is
 * intentionally performed from the signIn event after persistence completes.
 */
export async function authorizeGithubSignIn(
  user: { id?: string | null },
  profile: { id?: string | number | null; login?: string | null },
  bootstrapLogin: string,
  client: AccessClient = prisma,
): Promise<boolean> {
  const login = typeof profile.login === "string" ? profile.login : "";
  if (!profile.id || !login || !(await isGithubLoginAllowed(login, bootstrapLogin, client))) return false;

  if (user.id) {
    const existing = await client.user.findUnique({ where: { id: user.id }, select: { githubId: true } });
    if (existing?.githubId && existing.githubId !== String(profile.id)) return false;
  }

  return true;
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
