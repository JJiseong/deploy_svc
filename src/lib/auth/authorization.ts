import "server-only";
import { prisma } from "../db";

export type AuthorizedUser = {
  id: string;
  email?: string | null;
  githubLogin?: string | null;
  role: "ADMIN" | "USER";
  status: "ACTIVE" | "INACTIVE";
  mustChangePassword?: boolean;
};

export class AuthorizationError extends Error {
  readonly code: "UNAUTHENTICATED" | "FORBIDDEN";

  constructor(code: "UNAUTHENTICATED" | "FORBIDDEN", message = code === "UNAUTHENTICATED" ? "Authentication required" : "Access denied") {
    super(message);
    this.name = "AuthorizationError";
    this.code = code;
  }
}

export function requireUser(user: AuthorizedUser | null | undefined): AuthorizedUser {
  if (!user) throw new AuthorizationError("UNAUTHENTICATED");
  if (user.status !== "ACTIVE") throw new AuthorizationError("FORBIDDEN");
  return user;
}

export function requireAdmin(user: AuthorizedUser | null | undefined): AuthorizedUser {
  const activeUser = requireUser(user);
  if (activeUser.role !== "ADMIN") throw new AuthorizationError("FORBIDDEN");
  return activeUser;
}

export function canViewDeployment(user: Pick<AuthorizedUser, "id" | "role">, deployment: { ownerId: string }): boolean {
  return user.role === "ADMIN" || user.id === deployment.ownerId;
}

export async function loadAuthorizedUser(userId: string, client = prisma): Promise<AuthorizedUser> {
  const user = await client.user.findUnique({ select: { id: true, email: true, githubLogin: true, role: true, status: true, mustChangePassword: true }, where: { id: userId } });
  return requireUser(user as AuthorizedUser | null);
}

export async function requireAdminById(userId: string, client = prisma): Promise<AuthorizedUser> {
  return requireAdmin(await loadAuthorizedUser(userId, client));
}

export async function requireDeploymentOwnerOrAdmin(user: AuthorizedUser, ownerId: string): Promise<AuthorizedUser> {
  const activeUser = requireUser(user);
  if (!canViewDeployment(activeUser, { ownerId })) throw new AuthorizationError("FORBIDDEN");
  return activeUser;
}
