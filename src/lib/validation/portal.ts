import { z } from "zod";

const githubLoginPattern = /^[a-z\d](?:[a-z\d-]{0,37})$/i;
const branchPattern = /^[A-Za-z0-9._/-]+$/;
const applicationNamePattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeGithubLogin(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!githubLoginPattern.test(normalized)) {
    throw new Error("Invalid GitHub login");
  }
  return normalized;
}

export const roleSchema = z.enum(["ADMIN", "USER"]);
export const accessGrantStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);

export const accessGrantInputSchema = z
  .object({
    githubLogin: z.string().trim().transform(normalizeGithubLogin),
    role: roleSchema.default("USER"),
  })
  .strict();

export const deploymentInputSchema = z
  .object({
    repository: z
      .string()
      .trim()
      .regex(/^[^/\s]+\/[^/\s]+$/, "Repository must use owner/name format")
      .refine((value) => githubLoginPattern.test(value.split("/")[0]), "Invalid repository owner")
      .refine((value) => value.split("/")[1].length <= 100, "Repository name is too long"),
    branch: z.string().trim().min(1).max(255).regex(branchPattern, "Invalid branch"),
    applicationName: z.string().trim().min(1).max(63).regex(applicationNamePattern, "Invalid application name"),
    port: z.coerce.number().int().min(1).max(65535),
    buildPack: z.enum(["AUTO", "NIXPACKS", "DOCKERFILE"]),
    idempotencyKey: z.string().trim().min(12).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  })
  .strict();

export type DeploymentInput = z.infer<typeof deploymentInputSchema>;
export type AccessGrantInput = z.infer<typeof accessGrantInputSchema>;

export function repositoryOwner(repository: string): string {
  return repository.split("/", 1)[0].toLowerCase();
}

export function isAllowedRepositoryOwner(repository: string, allowedOwners: readonly string[]): boolean {
  const owner = repositoryOwner(repository);
  return allowedOwners.some((allowed) => allowed.toLowerCase() === owner);
}
