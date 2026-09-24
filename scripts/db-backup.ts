#!/usr/bin/env bun
/**
 * db-backup.ts — Create an encrypted, consistent SQLite backup.
 * @version 1.1.0
 *
 * Usage: BACKUP_ENCRYPTION_KEY=<64 hex chars> bun scripts/db-backup.ts --output /secure/portal.db.enc
 */
import { mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes, createCipheriv } from "node:crypto";
import { PrismaClient } from "@prisma/client";

function option(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function databasePath(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value?.startsWith("file:")) throw new Error("DATABASE_URL must be a file: SQLite URL");
  const path = value.slice(5).split("?")[0];
  return isAbsolute(path) ? path : resolve(path);
}

function backupKey(): Buffer {
  const value = process.env.BACKUP_ENCRYPTION_KEY?.trim() ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(value)) throw new Error("BACKUP_ENCRYPTION_KEY must be 32-byte hex");
  return Buffer.from(value, "hex");
}

const output = resolve(option("--output"));
const source = databasePath();
if (!existsSync(source)) throw new Error(`SQLite database does not exist: ${source}`);
const prisma = new PrismaClient();
const snapshotDirectory = mkdtempSync(join(tmpdir(), "deploy-svc-backup-"));
const snapshot = join(snapshotDirectory, "portal.db");
try {
  await prisma.$queryRawUnsafe("PRAGMA wal_checkpoint(FULL)");
  // VACUUM INTO creates a consistent SQLite snapshot, including any pages
  // that were flushed from WAL, without encrypting a live mutable database
  // file in place.
  const escapedSnapshot = snapshot.replaceAll("'", "''");
  const vacuumStatement = ["VACUUM INTO '", escapedSnapshot, "'"].join("");
  await prisma.$executeRawUnsafe(vacuumStatement);
  const plaintext = readFileSync(snapshot);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", backupKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope = JSON.stringify({ version: 1, algorithm: "aes-256-gcm", createdAt: new Date().toISOString(), iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") });
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, envelope, { mode: 0o600 });
  chmodSync(output, 0o600);
  console.log(`Encrypted SQLite backup written to ${output}`);
} finally {
  await prisma.$disconnect();
  rmSync(snapshotDirectory, { recursive: true, force: true });
}
