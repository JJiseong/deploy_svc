import "server-only";
import { createHash } from "node:crypto";
import { Prisma, type BuildPack, type DeploymentStatus } from "@prisma/client";
import { prisma } from "../db";
import { getEnv } from "../env";
import { writeAuditEvent } from "../audit";
import { requireUser, type AuthorizedUser } from "../auth/authorization";
import { deploymentInputSchema, isAllowedRepositoryOwner, type DeploymentInput } from "../validation/portal";
import { CoolifyClient, CoolifyError, mapCoolifyStatus, safeHttpsUrl, type CoolifyApplication, type CoolifyDeployment } from "../coolify/client";
import { encryptSecret, generateBasicPassword, decryptSecret } from "../security/crypto";
import { consumePersistedRateLimit } from "../security/rate-limit";

const ACTIVE = new Set<DeploymentStatus>(["REQUESTED", "PROVISIONING", "QUEUED", "IN_PROGRESS"]);

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; fieldErrors?: Record<string, string[]> } };

export function portalTag(userId: string, idempotencyKey: string): string {
  return `deploy-portal-${createHash("sha256").update(`${userId}:${idempotencyKey}`).digest("hex").slice(0, 20)}`;
}

function publicFailure(error: unknown): string {
  if (error instanceof Error && error.message.startsWith("Coolify")) return error.message;
  return "Deployment could not be completed. Try again or contact an administrator.";
}

export async function createDeployment(user: AuthorizedUser, input: unknown, client = new CoolifyClient()): Promise<ActionResult<{ id: string; status: DeploymentStatus }>> {
  const activeUser = requireUser(user);
  const env = getEnv();
  const parsed = deploymentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION_ERROR", message: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors } };
  const data = parsed.data;
  if (!isAllowedRepositoryOwner(data.repository, env.ALLOWED_GITHUB_OWNERS)) return { ok: false, error: { code: "REPOSITORY_NOT_ALLOWED", message: "This repository owner is not enabled for deployments." } };
  const existing = await prisma.deployment.findUnique({ where: { idempotencyKey: data.idempotencyKey }, select: { id: true, userId: true, status: true } });
  if (existing) {
    if (existing.userId !== activeUser.id && activeUser.role !== "ADMIN") return { ok: false, error: { code: "FORBIDDEN", message: "Access denied." } };
    return { ok: true, data: { id: existing.id, status: existing.status } };
  }
  const burst = await consumePersistedRateLimit(prisma, { subject: activeUser.id, action: "deployment:create", limit: 3, windowMs: 10 * 60_000 });
  const daily = await consumePersistedRateLimit(prisma, { subject: activeUser.id, action: "deployment:create:daily", limit: 20, windowMs: 24 * 60 * 60_000 });
  if (!burst.allowed || !daily.allowed) return { ok: false, error: { code: "RATE_LIMITED", message: "Deployment limit reached. Try again later." } };
  const encrypted = encryptSecret(generateBasicPassword());
  const basicPassword = decryptSecret(encrypted);
  let deployment: Awaited<ReturnType<typeof prisma.deployment.create>>;
  try {
    deployment = await prisma.$transaction(async (transaction) => {
      const created = await transaction.deployment.create({
        data: {
          userId: activeUser.id,
          repository: data.repository.toLowerCase(),
          branch: data.branch,
          requestedName: data.applicationName,
          port: data.port,
          buildPack: data.buildPack as BuildPack,
          status: "REQUESTED",
          idempotencyKey: data.idempotencyKey,
          basicUsername: "portal-user",
          basicPasswordCiphertext: encrypted.ciphertext,
          basicPasswordIv: encrypted.iv,
          basicPasswordTag: encrypted.authTag,
          encryptionKeyVersion: encrypted.keyVersion,
        },
      });
      await writeAuditEvent({ actorId: activeUser.id, action: "DEPLOYMENT_REQUESTED", outcome: "SUCCESS", targetType: "Deployment", targetId: created.id, metadata: { repository: created.repository, buildPack: created.buildPack } }, transaction);
      return created;
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const raced = await prisma.deployment.findUnique({ where: { idempotencyKey: data.idempotencyKey }, select: { id: true, userId: true, status: true } });
    if (!raced || (raced.userId !== activeUser.id && activeUser.role !== "ADMIN")) return { ok: false, error: { code: "FORBIDDEN", message: "Access denied." } };
    return { ok: true, data: { id: raced.id, status: raced.status } };
  }
  const tag = portalTag(activeUser.id, data.idempotencyKey);
  try {
    let application: CoolifyApplication;
    try {
      application = await client.createApplication({
        name: `${data.applicationName}-${deployment.id.slice(-6)}`,
        repository: data.repository,
        branch: data.branch,
        port: data.port,
        buildPack: data.buildPack === "DOCKERFILE" ? "dockerfile" : "nixpacks",
        tag,
        basicUsername: "portal-user",
        basicPassword,
      });
    } catch (createError) {
      const matches = await client.findApplicationsByTag(tag).catch(() => [] as CoolifyApplication[]);
      if (matches.length !== 1) throw createError;
      application = matches[0];
      await writeAuditEvent({ actorId: activeUser.id, action: "DEPLOYMENT_RECONCILED", outcome: "SUCCESS", targetType: "Deployment", targetId: deployment.id, metadata: { reason: "ambiguous_create", tag } });
    }
    const applicationUuid = application.uuid;
    if (!applicationUuid) throw new Error("Coolify response missing application UUID");
    await prisma.deployment.update({ where: { id: deployment.id }, data: { coolifyApplicationId: applicationUuid, actualName: application.name ?? data.applicationName, url: safeHttpsUrl(application.fqdn), status: "PROVISIONING" } });
    const started = await client.startDeployment(applicationUuid);
    const startedStatus = started.status ? mapCoolifyStatus(started.status) : "QUEUED";
    await prisma.deployment.update({ where: { id: deployment.id }, data: { latestDeploymentId: started.deployment_uuid ?? started.uuid ?? started.id ?? null, status: startedStatus } });
  } catch (error) {
    await prisma.deployment.update({ where: { id: deployment.id }, data: { status: "FAILED", failureSummary: publicFailure(error) } });
    await writeAuditEvent({ actorId: activeUser.id, action: "DEPLOYMENT_FAILURE", outcome: "FAILURE", targetType: "Deployment", targetId: deployment.id, metadata: { reason: publicFailure(error) } });
  }
  const result = await prisma.deployment.findUniqueOrThrow({ where: { id: deployment.id }, select: { id: true, status: true } });
  return { ok: true, data: result };
}

export async function revealBasicAuth(user: AuthorizedUser, deploymentId: string): Promise<ActionResult<{ username: string; password: string }>> {
  const activeUser = requireUser(user);
  const deployment = await prisma.deployment.findUnique({ where: { id: deploymentId } });
  if (!deployment || (activeUser.role !== "ADMIN" && deployment.userId !== activeUser.id)) return { ok: false, error: { code: "NOT_FOUND", message: "Deployment not found." } };
  if (!deployment.basicUsername || !deployment.basicPasswordCiphertext || !deployment.basicPasswordIv || !deployment.basicPasswordTag) return { ok: false, error: { code: "CREDENTIALS_UNAVAILABLE", message: "Credentials are not available." } };
  await writeAuditEvent({ actorId: activeUser.id, action: "CREDENTIAL_REVEAL", outcome: "SUCCESS", targetType: "Deployment", targetId: deployment.id });
  return { ok: true, data: { username: deployment.basicUsername, password: decryptSecret({ ciphertext: deployment.basicPasswordCiphertext, iv: deployment.basicPasswordIv, authTag: deployment.basicPasswordTag }) } };
}

export async function refreshDeploymentStatus(user: AuthorizedUser, deploymentId: string, client = new CoolifyClient()) {
  const activeUser = requireUser(user);
  const deployment = await prisma.deployment.findUnique({ where: { id: deploymentId } });
  if (!deployment || (activeUser.role !== "ADMIN" && deployment.userId !== activeUser.id)) return null;
  if (!deployment.coolifyApplicationId || !deployment.latestDeploymentId) return deployment;
  const latestDeploymentId = deployment.latestDeploymentId;
  if (!ACTIVE.has(deployment.status)) {
    const deployments = await client.listApplicationDeployments(deployment.coolifyApplicationId);
    const newest = deployments
      .filter((item) => typeof item.uuid === "string" || typeof item.id === "string")
      .sort((left, right) => String(right.created_at ?? right.createdAt ?? "").localeCompare(String(left.created_at ?? left.createdAt ?? "")))[0];
    const newestId = newest?.uuid ?? newest?.id;
    if (!newestId || newestId === deployment.latestDeploymentId) return deployment;
    const status = mapCoolifyStatus(newest.status);
    const updated = await prisma.deployment.update({ where: { id: deployment.id }, data: { latestDeploymentId: newestId, status, lastPolledAt: new Date(), failureSummary: status === "FAILED" ? "The latest deployment failed. Review the repository build and try again." : null } });
    if (status === "FAILED" && deployment.status !== "FAILED") {
      await writeAuditEvent({ actorId: activeUser.id, action: "DEPLOYMENT_FAILURE", outcome: "FAILURE", targetType: "Deployment", targetId: deployment.id, metadata: { reason: "latest_deployment_failed" } });
    }
    return updated;
  }
  if (deployment.lastPolledAt && Date.now() - deployment.lastPolledAt.getTime() < 3_000) return deployment;
  let current: CoolifyDeployment;
  try {
    current = await client.getDeployment(latestDeploymentId);
  } catch (error) {
    // Some Coolify versions do not expose the single-deployment endpoint (or
    // return 404 for a deployment UUID that is still being indexed). The
    // application-scoped list endpoint is the compatible fallback and also
    // lets us recover if Coolify assigned a replacement deployment UUID.
    if (!(error instanceof CoolifyError) || ![404, 405].includes(error.status)) throw error;
    const deployments = await client.listApplicationDeployments(deployment.coolifyApplicationId);
    const matching = deployments.find((item) => [item.uuid, item.id, item.deployment_uuid].includes(latestDeploymentId));
    current = matching ?? deployments
      .filter((item) => typeof item.uuid === "string" || typeof item.id === "string" || typeof item.deployment_uuid === "string")
      .sort((left, right) => String(right.created_at ?? right.createdAt ?? "").localeCompare(String(left.created_at ?? left.createdAt ?? "")))[0] ?? (() => { throw error; })();
  }
  const status = mapCoolifyStatus(current.status);
  const updated = await prisma.deployment.update({ where: { id: deployment.id }, data: { status, lastPolledAt: new Date(), failureSummary: status === "FAILED" ? "The latest deployment failed. Review the repository build and try again." : null, url: safeHttpsUrl(deployment.url) ?? safeHttpsUrl(current.deployment_url) ?? safeHttpsUrl(current.fqdn) } });
  if (status === "FAILED" && deployment.status !== "FAILED") {
    await writeAuditEvent({ actorId: activeUser.id, action: "DEPLOYMENT_FAILURE", outcome: "FAILURE", targetType: "Deployment", targetId: deployment.id, metadata: { reason: "deployment_status_failed" } });
  }
  return updated;
}

export function isActiveDeployment(status: DeploymentStatus): boolean {
  return ACTIVE.has(status);
}
