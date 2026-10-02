import "server-only";
import { z } from "zod";
import { getEnv, type PortalEnv } from "../env";

const responseSchema = z.object({}).passthrough();
const deploymentIdentifierSchema = z.union([z.string(), z.number().finite()]).transform(String);
const deploymentResponseSchema = responseSchema.extend({
  uuid: z.string().optional(),
  id: deploymentIdentifierSchema.optional(),
  status: z.string().optional(),
  deployment_uuid: z.string().optional(),
  deployment_url: z.string().optional(),
  fqdn: z.string().optional(),
});
const deployResponseSchema = z.object({
  deployments: z.array(deploymentResponseSchema).optional(),
}).passthrough();
const applicationResponseSchema = responseSchema.extend({ uuid: z.string().optional(), name: z.string().optional(), fqdn: z.string().optional() });

export type CoolifyDeployment = z.infer<typeof deploymentResponseSchema>;
export type CoolifyApplication = z.infer<typeof applicationResponseSchema>;

export function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Normalize a URL returned by Coolify for a public application.
 *
 * Coolify can report generated sslip.io domains with an `http` scheme even
 * when force-HTTPS is enabled. The portal only publishes HTTPS links, so we
 * upgrade that upstream scheme after applying the same credential checks as
 * the strict HTTPS boundary above.
 */
export function safePublicHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.protocol = "https:";
    return url.toString();
  } catch {
    return null;
  }
}

export type CreateApplicationInput = {
  name: string;
  repository: string;
  branch: string;
  port: number;
  buildPack: "nixpacks" | "dockerfile" | "static";
  tag: string;
  /** Deprecated input retained only for source compatibility; never sent. */
  basicUsername?: string;
  basicPassword?: string;
};

type ResourceLimits = {
  cpus: string;
  memory: string;
};

/**
 * Static sites only need a web server to serve already-built files. Keep their
 * Coolify container deliberately small while retaining a larger isolated
 * profile for applications that execute user-provided server code.
 */
export function resourceLimitsForBuildPack(buildPack: CreateApplicationInput["buildPack"]): ResourceLimits {
  if (buildPack === "static") return { cpus: "0.1", memory: "128m" };
  return { cpus: "0.5", memory: "512m" };
}

export class CoolifyError extends Error {
  constructor(readonly status: number, message = "Coolify request failed", readonly retryAfterSeconds?: number) {
    super(message);
    this.name = "CoolifyError";
  }
}

function safeMessage(status: number): string {
  if (status === 401) return "Coolify authentication failed";
  if (status === 403) return "Coolify permission denied";
  if (status === 404) return "Coolify resource not found";
  if (status === 409) return "Coolify resource conflict";
  if (status === 429) return "Coolify rate limit reached";
  return status >= 500 ? "Coolify is temporarily unavailable" : "Coolify request failed";
}

export class CoolifyClient {
  private readonly baseUrl: string;
  constructor(private readonly env: PortalEnv = getEnv(), private readonly fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = fetch) {
    const url = new URL(env.COOLIFY_BASE_URL);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("COOLIFY_BASE_URL must be a clean HTTPS URL");
    this.baseUrl = `${url.toString().replace(/\/$/, "")}/api/v1`;
  }

  private async request<T>(path: string, init: RequestInit = {}, token: string, schema: z.ZodType<T>, retryRead = false): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      let response: Response | undefined;
      for (let attempt = 0; attempt <= (retryRead ? 1 : 0); attempt += 1) {
        try {
          response = await this.fetchImpl(`${this.baseUrl}${path}`, {
            ...init,
            headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers },
            redirect: "manual",
            signal: controller.signal,
          });
        } catch (error) {
          if (attempt === 0 && retryRead) continue;
          throw new CoolifyError(503, error instanceof Error ? "Coolify network error" : "Coolify request failed");
        }
        if (response.ok) break;
        if (retryRead && attempt === 0 && response.status >= 500) continue;
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        throw new CoolifyError(response.status, safeMessage(response.status), retryAfter > 0 ? retryAfter : undefined);
      }
      if (!response?.ok) throw new CoolifyError(503);
      const body: unknown = await response.json();
      return schema.parse(body);
    } finally {
      clearTimeout(timer);
    }
  }

  async createApplication(input: CreateApplicationInput): Promise<CoolifyApplication> {
    const limits = resourceLimitsForBuildPack(input.buildPack);
    const body = {
      project_uuid: this.env.COOLIFY_PROJECT_UUID,
      server_uuid: this.env.COOLIFY_SERVER_UUID,
      environment_name: this.env.COOLIFY_ENVIRONMENT_NAME,
      github_app_uuid: this.env.COOLIFY_GITHUB_APP_UUID,
      git_repository: `https://github.com/${input.repository}`,
      git_branch: input.branch,
      build_pack: input.buildPack,
      ports_exposes: String(input.port),
      name: input.name,
      limits_cpus: limits.cpus,
      limits_memory: limits.memory,
      is_auto_deploy_enabled: true,
      is_preview_deployments_enabled: false,
      is_force_https_enabled: true,
      is_http_basic_auth_enabled: false,
      // Coolify expects an array here. The generated domain is not known
      // until the application is created, so the deployment flow reconciles
      // the final fqdn immediately afterward.
      noindex_domains: [],
      autogenerate_domain: true,
      tags: [input.tag],
      instant_deploy: false,
    };
    return this.request("/applications/private-github-app", { method: "POST", body: JSON.stringify(body) }, this.env.COOLIFY_WRITE_API_TOKEN, applicationResponseSchema);
  }

  async startDeployment(applicationUuid: string): Promise<CoolifyDeployment> {
    const response = await this.request(`/deploy?uuid=${encodeURIComponent(applicationUuid)}&force=false`, { method: "POST" }, this.env.COOLIFY_DEPLOY_API_TOKEN, deployResponseSchema);
    const deployment = response.deployments?.[0];
    if (deployment && (deployment.deployment_uuid || deployment.uuid || deployment.id)) return deployment;
    const direct = deploymentResponseSchema.safeParse(response);
    if (direct.success && (direct.data.deployment_uuid || direct.data.uuid || direct.data.id)) return direct.data;
    throw new CoolifyError(502, "Coolify deployment response was invalid");
  }

  async getApplication(applicationUuid: string): Promise<CoolifyApplication> {
    return this.request(`/applications/${encodeURIComponent(applicationUuid)}`, {}, this.env.COOLIFY_READ_API_TOKEN, applicationResponseSchema, true);
  }

  async getDeployment(deploymentUuid: string): Promise<CoolifyDeployment> {
    return this.request(`/deployments/${encodeURIComponent(deploymentUuid)}`, {}, this.env.COOLIFY_READ_API_TOKEN, deploymentResponseSchema, true);
  }

  async listApplicationDeployments(applicationUuid: string): Promise<CoolifyDeployment[]> {
    const deployments = z.array(deploymentResponseSchema);
    const schema = z.union([
      deployments,
      z.object({ deployments }).passthrough().transform((value) => value.deployments),
    ]);
    return this.request(`/deployments/applications/${encodeURIComponent(applicationUuid)}`, {}, this.env.COOLIFY_READ_API_TOKEN, schema, true);
  }

  async findApplicationsByTag(tag: string): Promise<CoolifyApplication[]> {
    const schema = z.array(applicationResponseSchema);
    return this.request(`/applications?tag=${encodeURIComponent(tag)}`, {}, this.env.COOLIFY_READ_API_TOKEN, schema, true);
  }

  async makeApplicationPublic(applicationUuid: string, domains: string | null): Promise<CoolifyApplication> {
    const body = {
      is_http_basic_auth_enabled: false,
      is_force_https_enabled: true,
      noindex_domains: domains ? [domains] : [],
      ...(domains ? { domains } : {}),
    };
    return this.request(`/applications/${encodeURIComponent(applicationUuid)}`, { method: "PATCH", body: JSON.stringify(body) }, this.env.COOLIFY_WRITE_API_TOKEN, applicationResponseSchema);
  }
}

export function mapCoolifyStatus(value: string | undefined): "REQUESTED" | "PROVISIONING" | "QUEUED" | "IN_PROGRESS" | "HEALTHY" | "FAILED" | "CANCELLED" | "UNKNOWN" {
  const normalized = (value ?? "").toLowerCase();
  if (["queued", "pending", "new"].includes(normalized)) return "QUEUED";
  if (["in_progress", "in-progress", "building", "running", "deploying"].includes(normalized)) return "IN_PROGRESS";
  if (["finished", "success", "successful", "healthy", "completed"].includes(normalized)) return "HEALTHY";
  if (["failed", "error", "errored"].includes(normalized)) return "FAILED";
  if (["cancelled", "canceled", "canceling"].includes(normalized)) return "CANCELLED";
  if (["provisioning", "created"].includes(normalized)) return "PROVISIONING";
  return "UNKNOWN";
}
