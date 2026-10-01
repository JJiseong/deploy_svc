import "server-only";
import { prisma } from "../db";
import { CoolifyClient, safeHttpsUrl, safePublicHttpsUrl } from "../coolify/client";
import { writeAuditEvent } from "../audit";

/** Idempotently removes Coolify Basic Auth and retains only a public HTTPS URL. */
export async function migrateDeploymentsToPublic(actorId: string, client = new CoolifyClient()) {
  const deployments = await prisma.deployment.findMany();
  const results: Array<{ id: string; ok: boolean }> = [];
  for (const deployment of deployments) {
    try {
      // Failed/abandoned records may have no Coolify application. They cannot
      // be opened publicly, but their legacy encrypted credentials are still
      // sensitive and must be removed during the same idempotent migration.
      if (!deployment.coolifyApplicationId) {
        await prisma.deployment.update({ where: { id: deployment.id }, data: { basicUsername: null, basicPasswordCiphertext: null, basicPasswordIv: null, basicPasswordTag: null, encryptionKeyVersion: null } });
        await writeAuditEvent({ actorId, action: "DEPLOYMENT_PUBLIC_MIGRATION", outcome: "SUCCESS", targetType: "Deployment", targetId: deployment.id, metadata: { reason: "no_coolify_application" } });
        results.push({ id: deployment.id, ok: true });
        continue;
      }
      const application = await client.getApplication(deployment.coolifyApplicationId!);
      const domain = safePublicHttpsUrl(application.fqdn) ?? safeHttpsUrl(deployment.url);
      if (!domain) throw new Error("PUBLIC_DOMAIN_MISSING");
      const configured = await client.makeApplicationPublic(deployment.coolifyApplicationId!, domain);
      await prisma.deployment.update({ where: { id: deployment.id }, data: { url: safePublicHttpsUrl(configured.fqdn) ?? domain, basicUsername: null, basicPasswordCiphertext: null, basicPasswordIv: null, basicPasswordTag: null, encryptionKeyVersion: null } });
      await writeAuditEvent({ actorId, action: "DEPLOYMENT_PUBLIC_MIGRATION", outcome: "SUCCESS", targetType: "Deployment", targetId: deployment.id, metadata: { applicationId: deployment.coolifyApplicationId } });
      results.push({ id: deployment.id, ok: true });
    } catch {
      await writeAuditEvent({ actorId, action: "DEPLOYMENT_PUBLIC_MIGRATION", outcome: "FAILURE", targetType: "Deployment", targetId: deployment.id, metadata: { applicationId: deployment.coolifyApplicationId } });
      results.push({ id: deployment.id, ok: false });
    }
  }
  return results;
}
