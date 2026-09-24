import "server-only";

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

export type RateLimitOptions = {
  subject: string;
  action: string;
  limit: number;
  windowMs: number;
  now?: number;
};

export type RateLimitStore = { buckets: Map<string, { count: number; windowStart: number }> };

export async function consumeRateLimit(store: RateLimitStore, options: RateLimitOptions): Promise<RateLimitResult> {
  const now = options.now ?? Date.now();
  const windowStart = Math.floor(now / options.windowMs) * options.windowMs;
  const key = `${options.subject}:${options.action}:${windowStart}`;
  const current = store.buckets.get(key) ?? { count: 0, windowStart };
  current.count += 1;
  store.buckets.set(key, current);
  const allowed = current.count <= options.limit;
  const remaining = Math.max(0, options.limit - current.count);
  const retryAfterSeconds = allowed ? 0 : Math.max(1, Math.ceil((windowStart + options.windowMs - now) / 1_000));
  return { allowed, remaining, retryAfterSeconds };
}

export async function consumePersistedRateLimit(
  client: {
    rateLimitBucket: {
      findUnique(args: unknown): Promise<{ count: number; windowStart: Date } | null>;
      upsert(args: unknown): Promise<unknown>;
    };
  },
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const now = options.now ?? Date.now();
  const windowStart = Math.floor(now / options.windowMs) * options.windowMs;
  const windowDate = new Date(windowStart);
  const key = { subject_action_windowStart: { subject: options.subject, action: options.action, windowStart: windowDate } };
  const existing = await client.rateLimitBucket.findUnique({ where: key });
  const count = (existing?.count ?? 0) + 1;
  await client.rateLimitBucket.upsert({
    where: key,
    create: { subject: options.subject, action: options.action, windowStart: windowDate, count, expiresAt: new Date(windowStart + options.windowMs) },
    update: { count, expiresAt: new Date(windowStart + options.windowMs) },
  });
  return {
    allowed: count <= options.limit,
    remaining: Math.max(0, options.limit - count),
    retryAfterSeconds: count <= options.limit ? 0 : Math.max(1, Math.ceil((windowStart + options.windowMs - now) / 1_000)),
  };
}
