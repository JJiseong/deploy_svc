-- Portal credentials are intentionally nullable during migration: existing
-- GitHub users keep their deployment ownership until an administrator issues
-- their first temporary password.
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" DATETIME;
