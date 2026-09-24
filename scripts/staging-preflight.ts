#!/usr/bin/env bun
/**
 * staging-preflight.ts — Validate staging secrets, callback URL, SQLite readiness, and Coolify read access.
 * @version 1.0.0
 *
 * Usage: bun run staging:preflight
 * Local-only validation without contacting Coolify: bun run staging:preflight -- --skip-coolify
 */
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const skipCoolify = process.argv.includes("--skip-coolify");
const required = [
  "AUTH_SECRET",
  "AUTH_GITHUB_ID",
  "AUTH_GITHUB_SECRET",
  "BOOTSTRAP_GITHUB_LOGIN",
  "DATABASE_URL",
  "APP_ENCRYPTION_KEY",
  "ALLOWED_GITHUB_OWNERS",
  "COOLIFY_BASE_URL",
  "COOLIFY_READ_API_TOKEN",
  "COOLIFY_WRITE_API_TOKEN",
  "COOLIFY_DEPLOY_API_TOKEN",
  "COOLIFY_PROJECT_UUID",
  "COOLIFY_SERVER_UUID",
  "COOLIFY_GITHUB_APP_UUID",
];

function value(name: string): string {
  const result = process.env[name]?.trim();
  if (!result) throw new Error(`${name} is missing`);
  return result;
}

function checkDatabase(): Promise<void> {
  const databaseUrl = value("DATABASE_URL");
  if (!databaseUrl.startsWith("file:")) throw new Error("DATABASE_URL must be a file: SQLite URL");
  const rawPath = databaseUrl.slice(5).split("?")[0];
  const databasePath = isAbsolute(rawPath) ? rawPath : resolve(rawPath);
  if (!existsSync(databasePath)) throw new Error(`SQLite database does not exist: ${databasePath}`);
  const prisma = new PrismaClient();
  return (async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      const pending = await prisma.$queryRaw<Array<{ migration_name: string }>>`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL`;
      if (pending.length > 0) throw new Error("DATABASE_MIGRATIONS_INCOMPLETE");
    } finally {
      await prisma.$disconnect();
    }
  })();
}

async function checkCoolify(baseUrl: URL): Promise<void> {
  const sentinel = "deploy-portal-preflight-sentinel";
  const response = await fetch(`${baseUrl.toString().replace(/\/$/, "")}/api/v1/applications?tag=${encodeURIComponent(sentinel)}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${value("COOLIFY_READ_API_TOKEN")}` },
    redirect: "manual",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Coolify read API returned HTTP ${response.status}`);
}

try {
  for (const name of required) value(name);
  if (value("AUTH_SECRET").length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
  if (!/^[0-9a-fA-F]{64}$/.test(value("APP_ENCRYPTION_KEY"))) throw new Error("APP_ENCRYPTION_KEY must be 32-byte hex");

  const authUrlValue = value("AUTH_URL");
  const authUrl = new URL(authUrlValue);
  if (authUrl.protocol !== "https:" || authUrl.username || authUrl.password || authUrl.search || authUrl.hash) throw new Error("AUTH_URL must be a clean HTTPS URL");
  if (process.env.AUTH_TRUST_HOST?.trim().toLowerCase() !== "true") throw new Error("AUTH_TRUST_HOST must be true in staging");
  const githubLoginPattern = /^[a-z\d](?:[a-z\d-]{0,37})$/i;
  if (!githubLoginPattern.test(value("BOOTSTRAP_GITHUB_LOGIN"))) throw new Error("BOOTSTRAP_GITHUB_LOGIN is not a valid GitHub login");
  const owners = value("ALLOWED_GITHUB_OWNERS").split(",").map((owner) => owner.trim()).filter(Boolean);
  if (owners.length === 0 || owners.some((owner) => !githubLoginPattern.test(owner))) throw new Error("ALLOWED_GITHUB_OWNERS contains an invalid GitHub owner");

  const coolifyUrl = new URL(value("COOLIFY_BASE_URL"));
  if (coolifyUrl.protocol !== "https:" || coolifyUrl.username || coolifyUrl.password || coolifyUrl.search || coolifyUrl.hash) throw new Error("COOLIFY_BASE_URL must be a clean HTTPS URL");

  await checkDatabase();
  console.log("[preflight] environment and SQLite readiness passed");
  console.log(`[preflight] GitHub callback: ${new URL("/api/auth/callback/github", authUrl).toString()}`);
  if (skipCoolify) {
    console.log("[preflight] Coolify read check skipped by explicit --skip-coolify");
  } else {
    await checkCoolify(coolifyUrl);
    console.log("[preflight] Coolify read API authentication and connectivity passed");
  }
} catch (error) {
  console.error(`[preflight] failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
}
