import "server-only";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "./lib/db";
import { writeAuditEvent } from "./lib/audit";
import { verifyPassword } from "./lib/auth/passwords";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Credentials({
    name: "포털 계정",
    credentials: { email: { label: "이메일", type: "email" }, password: { label: "비밀번호", type: "password" } },
    async authorize(credentials) {
      const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
      const password = typeof credentials?.password === "string" ? credentials.password : "";
      const user = email ? await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true, passwordHash: true, role: true, status: true } }) : null;
      if (!user || user.status !== "ACTIVE" || !(await verifyPassword(password, user.passwordHash))) {
        await writeAuditEvent({ action: "AUTH_SIGN_IN", outcome: "DENIED", metadata: { email: email || "unknown" } });
        return null;
      }
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await writeAuditEvent({ actorId: user.id, action: "AUTH_SIGN_IN", outcome: "SUCCESS" });
      return { id: user.id, email: user.email, name: user.name };
    },
  })],
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
    async session({ session, user }) {
      const databaseUser = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, role: true, status: true, mustChangePassword: true } });
      session.user.id = databaseUser?.id ?? user.id;
      session.user.role = databaseUser?.role ?? "USER";
      session.user.status = databaseUser?.status ?? "INACTIVE";
      session.user.mustChangePassword = databaseUser?.mustChangePassword ?? true;
      return session;
    },
  },
  events: {
    async signOut(message) {
      const actorId = "session" in message ? message.session?.userId : undefined;
      await writeAuditEvent({ actorId, action: "AUTH_SIGN_OUT", outcome: "SUCCESS" });
    },
  },
});
