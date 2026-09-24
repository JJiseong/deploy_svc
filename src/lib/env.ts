import "server-only";
import { z } from "zod";

const requiredString = z.string().trim().min(1);
const booleanEnv = z.preprocess((value) => typeof value === "string" ? value.trim().toLowerCase() === "true" : value, z.boolean());

const rawEnvSchema = z.object({
  AUTH_SECRET: requiredString.min(32),
  AUTH_GITHUB_ID: requiredString,
  AUTH_GITHUB_SECRET: requiredString,
  AUTH_URL: z.string().url().optional(),
  AUTH_TRUST_HOST: booleanEnv.default(true),
  BOOTSTRAP_GITHUB_LOGIN: requiredString,
  DATABASE_URL: requiredString.regex(/^file:/, "DATABASE_URL must be a file: SQLite URL"),
  APP_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, "APP_ENCRYPTION_KEY must be 32-byte hex"),
  ALLOWED_GITHUB_OWNERS: requiredString,
  COOLIFY_BASE_URL: z.string().url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  }, "COOLIFY_BASE_URL must be HTTPS without embedded credentials, query, or fragment"),
  COOLIFY_READ_API_TOKEN: requiredString,
  COOLIFY_WRITE_API_TOKEN: requiredString,
  COOLIFY_DEPLOY_API_TOKEN: requiredString,
  COOLIFY_PROJECT_UUID: requiredString,
  COOLIFY_SERVER_UUID: requiredString,
  COOLIFY_GITHUB_APP_UUID: requiredString,
  COOLIFY_ENVIRONMENT_NAME: requiredString.default("production"),
});

export type PortalEnv = Omit<z.infer<typeof rawEnvSchema>, "ALLOWED_GITHUB_OWNERS"> & {
  ALLOWED_GITHUB_OWNERS: string[];
};

export function parseEnv(input: Record<string, unknown>): PortalEnv {
  const parsed = rawEnvSchema.parse(input);
  const owners = parsed.ALLOWED_GITHUB_OWNERS.split(",").map((owner) => owner.trim().toLowerCase()).filter(Boolean);
  if (owners.length === 0) throw new Error("ALLOWED_GITHUB_OWNERS must include one owner");
  return { ...parsed, ALLOWED_GITHUB_OWNERS: owners };
}

let cachedEnv: PortalEnv | undefined;

export function getEnv(): PortalEnv {
  cachedEnv ??= parseEnv(process.env);
  return cachedEnv;
}

export function resetEnvForTests(): void {
  cachedEnv = undefined;
}
