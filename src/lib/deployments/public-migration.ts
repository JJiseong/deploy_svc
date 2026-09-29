import "server-only";
import { prisma } from "../db";
import { CoolifyClient, safeHttpsUrl, safePublicHttpsUrl } from "../coolify/client";
import { writeAuditEvent } from "../audit";

/** Idempotently removes Coolify Basic Auth and retains only a public HTTPS URL. */
export async function migrateDeploymentsToPublic(actorId: string, client = new CoolifyClient()) {
  const deployments = await prisma.deployment.findMany({ where: { coolifyApplicationId: { not: null } } });
  const results: Array<{ id: string; ok: boolean }> = [];
  for (const deployment of deployments) {
    try {
      const application = await client.getApplication(deployment.coolifyApplicationId!);
      const domain = safePublicHttpsUrl(application.fqdn) ?? safeHttpsUrl(deployment.url);
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
