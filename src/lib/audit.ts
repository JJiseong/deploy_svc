import "server-only";
import { prisma } from "./db";
import type { Prisma } from "@prisma/client";

const sensitiveKeyPattern = /(token|secret|password|cookie|authorization|credential|key|body)/i;
const allowedKeyPattern = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const MAX_METADATA_BYTES = 2_048;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[truncated]";
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, depth + 1));
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (!allowedKeyPattern.test(key) || sensitiveKeyPattern.test(key)) continue;
      result[key] = sanitize(item, depth + 1);
    }
    return result;
  }
  return undefined;
}

export function redactAuditMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!metadata) return {};
  const sanitized = sanitize(metadata);
  const object = (sanitized && typeof sanitized === "object" && !Array.isArray(sanitized) ? sanitized : {}) as Record<string, unknown>;
  let json = JSON.stringify(object);
  if (new TextEncoder().encode(json).byteLength > MAX_METADATA_BYTES) {
    json = JSON.stringify({ truncated: true });
  }
  return JSON.parse(json) as Record<string, unknown>;
}

export type AuditEvent = {
  actorId?: string | null;
  action: string;
  outcome: "SUCCESS" | "DENIED" | "FAILURE";
  targetType?: string | null;
  targetId?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeAuditEvent(event: AuditEvent, client: Pick<Prisma.TransactionClient, "auditLog"> = prisma): Promise<void> {
  await client.auditLog.create({
    data: {
      actorId: event.actorId ?? null,
      action: event.action,
      outcome: event.outcome,
      targetType: event.targetType ?? null,
      targetId: event.targetId ?? null,
      requestId: event.requestId ?? null,
      ipAddress: event.ipAddress ?? null,
      metadata: redactAuditMetadata(event.metadata) as Prisma.InputJsonValue,
    },
  });
}
