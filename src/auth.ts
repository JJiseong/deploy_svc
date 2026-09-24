import "server-only";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { createPrismaAdapter } from "./lib/auth/adapter";
import { bindGithubUser, isGithubLoginAllowed } from "./lib/auth/access";
import { prisma } from "./lib/db";
import { getEnv } from "./lib/env";
import { writeAuditEvent } from "./lib/audit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: createPrismaAdapter(),
  // Read provider credentials from process.env here so `next build` does not
  // require production secrets in the Docker builder. Request-time callbacks
  // still call getEnv(), which validates the complete runtime configuration.
  providers: [GitHub({ clientId: process.env.AUTH_GITHUB_ID ?? "", clientSecret: process.env.AUTH_GITHUB_SECRET ?? "" })],
  trustHost: process.env.AUTH_TRUST_HOST?.trim().toLowerCase() !== "false",
  session: { strategy: "database", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login" },
  cookies: {
    sessionToken: {
      name: "portal.session-token",
      options: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" },
    },
  },
  callbacks: {
    async signIn({ user, profile }) {
      const env = getEnv();
      const login = typeof profile?.login === "string" ? profile.login : "";
      const existing = user.id ? await prisma.user.findUnique({ where: { id: user.id }, select: { githubId: true } }) : null;
      if (existing?.githubId && profile?.id && existing.githubId !== String(profile.id)) {
        await writeAuditEvent({ actorId: user.id, action: "AUTH_SIGN_IN", outcome: "DENIED", metadata: { reason: "github_identity_mismatch" } });
        return false;
      }
      if (!login || !(await isGithubLoginAllowed(login, env.BOOTSTRAP_GITHUB_LOGIN))) {
        await writeAuditEvent({ action: "AUTH_SIGN_IN", outcome: "DENIED", metadata: { githubLogin: login || "unknown" } });
        return false;
      }
      if (user.id && profile?.id) {
        await bindGithubUser(
          user.id,
          {
            id: profile.id as string | number,
            login,
            name: typeof profile.name === "string" ? profile.name : null,
            email: typeof profile.email === "string" ? profile.email : null,
            avatar_url: typeof profile.avatar_url === "string" ? profile.avatar_url : null,
          },
          env.BOOTSTRAP_GITHUB_LOGIN,
        );
      }
      return true;
    },
    async session({ session, user }) {
      const databaseUser = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, role: true, status: true } });
      session.user.id = databaseUser?.id ?? user.id;
      session.user.role = databaseUser?.role ?? "USER";
      session.user.status = databaseUser?.status ?? "INACTIVE";
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      await writeAuditEvent({ actorId: user.id, action: "AUTH_SIGN_IN", outcome: "SUCCESS" });
    },
    async signOut(message) {
      const actorId = "session" in message ? message.session?.userId : undefined;
      await writeAuditEvent({ actorId, action: "AUTH_SIGN_OUT", outcome: "SUCCESS" });
    },
  },
});
