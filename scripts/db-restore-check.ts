#!/usr/bin/env bun
/**
 * db-restore-check.ts — Decrypt a SQLite backup into a temporary DB and verify readiness.
 * @version 1.0.0
 *
 * Usage: BACKUP_ENCRYPTION_KEY=<64 hex chars> bun scripts/db-restore-check.ts --input /secure/portal.db.enc
 */
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDecipheriv } from "node:crypto";
import { PrismaClient } from "@prisma/client";

function option(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function backupKey(): Buffer {
  const value = process.env.BACKUP_ENCRYPTION_KEY?.trim() ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(value)) throw new Error("BACKUP_ENCRYPTION_KEY must be 32-byte hex");
  return Buffer.from(value, "hex");
}

const input = option("--input");
const envelope = JSON.parse(readFileSync(input, "utf8")) as { version: number; algorithm: string; iv: string; authTag: string; ciphertext: string };
if (envelope.version !== 1 || envelope.algorithm !== "aes-256-gcm") throw new Error("Unsupported backup envelope");
const decipher = createDecipheriv("aes-256-gcm", backupKey(), Buffer.from(envelope.iv, "base64"));
decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]);
const directory = mkdtempSync(join(tmpdir(), "deploy-svc-restore-"));
const restored = join(directory, "portal.db");
try {
  writeFileSync(restored, plaintext, { mode: 0o600 });
  chmodSync(restored, 0o600);
  process.env.DATABASE_URL = `file:${restored}`;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRawUnsafe("PRAGMA foreign_keys = ON");
    await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL");
    await prisma.$queryRawUnsafe("PRAGMA busy_timeout = 5000");
    await prisma.$queryRaw`SELECT 1`;
    const pending = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>("SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL");
    if (pending.length > 0) throw new Error("DATABASE_MIGRATIONS_INCOMPLETE");
  } finally {
    await prisma.$disconnect();
  }
  console.log("Encrypted backup restored and database readiness verified");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
