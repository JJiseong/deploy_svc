import "server-only";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { prisma } from "../db";
import { encryptSecret } from "../security/crypto";

function encryptProviderAccessToken(token: string): string {
  const encrypted = encryptSecret(token);
  return ["enc", `v${encrypted.keyVersion}`, encrypted.ciphertext, encrypted.iv, encrypted.authTag].join(":");
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
