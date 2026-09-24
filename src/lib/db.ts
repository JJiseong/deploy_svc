import "server-only";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

let sqliteConfigured = false;

export async function configureSqlite(): Promise<void> {
  if (sqliteConfigured) return;
  await prisma.$queryRawUnsafe("PRAGMA foreign_keys = ON");
  await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL");
  await prisma.$queryRawUnsafe("PRAGMA busy_timeout = 5000");
  sqliteConfigured = true;
}

export async function checkDatabaseReady(): Promise<void> {
  await configureSqlite();
  await prisma.$queryRaw`SELECT 1`;
  const pending = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>("SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL");
  if (pending.length > 0) throw new Error("DATABASE_MIGRATIONS_INCOMPLETE");
}
