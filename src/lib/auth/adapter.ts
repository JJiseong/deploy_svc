import "server-only";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { prisma } from "../db";

export function createPrismaAdapter(): Adapter {
  const adapter = PrismaAdapter(prisma);
  const originalLinkAccount = adapter.linkAccount;
  return {
    ...adapter,
    async linkAccount(account) {
      if (!originalLinkAccount) return;
      await originalLinkAccount({
        ...account,
        access_token: undefined,
        refresh_token: undefined,
        id_token: undefined,
      });
    },
  };
}
