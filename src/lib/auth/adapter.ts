import "server-only";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { encryptSecret } from "../security/crypto";

export function encryptProviderAccessToken(token: string): string {
  const encrypted = encryptSecret(token);
  return ["enc", `v${encrypted.keyVersion}`, encrypted.ciphertext, encrypted.iv, encrypted.authTag].join(":");
}

export async function persistProviderAccessToken(userId: string, provider: string, accessToken: string | undefined, client: Pick<Prisma.TransactionClient, "account"> = prisma): Promise<void> {
  if (!accessToken?.trim()) return;
  const encrypted = encryptProviderAccessToken(accessToken);
  const existing = await client.account.findFirst({ where: { userId, provider }, select: { id: true } });
  if (existing) { await client.account.update({ where: { id: existing.id }, data: { access_token: encrypted } }); return; }
  await client.account.create({ data: { userId, type: "oauth", provider, providerAccountId: userId, access_token: encrypted } });
}

export function createPrismaAdapter(): Adapter {
  const adapter = PrismaAdapter(prisma);
  const originalLinkAccount = adapter.linkAccount;
  return {
    ...adapter,
    async linkAccount(account) {
      if (!originalLinkAccount) return;
      await originalLinkAccount({
        ...account,
        // The GitHub token is needed for repository discovery, but must never
        // be persisted in plaintext. Pack the authenticated ciphertext into
        // the adapter's existing access_token column so no schema migration
        // is required for existing installations.
        access_token: account.access_token ? encryptProviderAccessToken(account.access_token) : undefined,
        refresh_token: undefined,
        id_token: undefined,
      });
    },
  };
}
