import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const databasePath = `/tmp/deploy-svc-public-migration-${process.pid}.db`;
process.env.AUTH_SECRET = "a".repeat(32);
process.env.DATABASE_URL = `file:${databasePath}`;
process.env.APP_ENCRYPTION_KEY = "b".repeat(64);
process.env.COOLIFY_BASE_URL = "https://coolify.example.test";
process.env.COOLIFY_READ_API_TOKEN = "read-token";
process.env.COOLIFY_WRITE_API_TOKEN = "write-token";
process.env.COOLIFY_DEPLOY_API_TOKEN = "deploy-token";
process.env.COOLIFY_PROJECT_UUID = "project";
process.env.COOLIFY_SERVER_UUID = "server";
process.env.COOLIFY_GITHUB_APP_UUID = "github-app";
process.env.COOLIFY_ENVIRONMENT_NAME = "production";

const { prisma } = await import("../src/lib/db");
const { migrateDeploymentsToPublic } = await import("../src/lib/deployments/public-migration");

class FakeCoolify {
  async getApplication() { return { uuid: "app", fqdn: "https://app.example.test" }; }
  async makeApplicationPublic(_uuid: string, domains: string | null) { return { uuid: "app", fqdn: domains ?? undefined }; }
}

class MissingDomainCoolify {
  async getApplication() { return { uuid: "app", fqdn: undefined }; }
  async makeApplicationPublic() { throw new Error("should not configure an app without a domain"); }
}

beforeAll(() => {
  const result = spawnSync("./node_modules/.bin/prisma", ["migrate", "deploy", "--schema", "prisma/schema.prisma"], { env: { ...process.env, RUST_LOG: "info" }, stdio: "inherit" });
  if (result.status !== 0) throw new Error("Integration migration failed");
});

afterAll(async () => {
  await prisma.$disconnect();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${databasePath}${suffix}`, { force: true });
});

describe("public deployment migration", () => {
  test("clears legacy credentials for abandoned records without a Coolify app", async () => {
    const actor = await prisma.user.create({ data: { email: "migration-admin@example.test", passwordHash: "hash", mustChangePassword: false, role: "ADMIN", status: "ACTIVE" } });
    const deployment = await prisma.deployment.create({ data: { userId: actor.id, repository: "jjiseong/abandoned", branch: "main", requestedName: "abandoned", port: 3000, buildPack: "AUTO", basicUsername: "portal-user", basicPasswordCiphertext: "cipher", basicPasswordIv: "iv", basicPasswordTag: "tag", encryptionKeyVersion: 1, idempotencyKey: "migration-orphan-1" } });

    const result = await migrateDeploymentsToPublic(actor.id, new FakeCoolify() as never);
    expect(result.find((item) => item.id === deployment.id)).toEqual({ id: deployment.id, ok: true });
    expect(await prisma.deployment.findUniqueOrThrow({ where: { id: deployment.id }, select: { basicUsername: true, basicPasswordCiphertext: true, basicPasswordIv: true, basicPasswordTag: true, encryptionKeyVersion: true } })).toEqual({ basicUsername: null, basicPasswordCiphertext: null, basicPasswordIv: null, basicPasswordTag: null, encryptionKeyVersion: null });
  });

  test("reports an app without a public domain as a failed conversion", async () => {
    const actor = await prisma.user.create({ data: { email: "migration-admin-2@example.test", passwordHash: "hash", mustChangePassword: false, role: "ADMIN", status: "ACTIVE" } });
    const deployment = await prisma.deployment.create({ data: { userId: actor.id, repository: "jjiseong/missing-domain", branch: "main", requestedName: "missing-domain", port: 3000, buildPack: "AUTO", coolifyApplicationId: "app", idempotencyKey: "migration-missing-domain-1" } });

    const result = await migrateDeploymentsToPublic(actor.id, new MissingDomainCoolify() as never);
    expect(result.find((item) => item.id === deployment.id)).toEqual({ id: deployment.id, ok: false });
  });
});
