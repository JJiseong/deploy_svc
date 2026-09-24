FROM oven/bun:1.3.11 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS builder
WORKDIR /app
COPY . .
RUN bun run build

FROM oven/bun:1.3.11 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN addgroup --system --gid 1001 portal && adduser --system --uid 1001 --ingroup portal portal
RUN mkdir -p /data && chown portal:portal /data
COPY --from=builder --chown=portal:portal /app/.next/standalone ./
COPY --from=builder --chown=portal:portal /app/.next/static ./.next/static
COPY --from=builder --chown=portal:portal /app/public ./public
COPY --from=builder --chown=portal:portal /app/prisma ./prisma
COPY --from=deps --chown=portal:portal /app/node_modules ./node_modules
COPY --from=builder --chown=portal:portal /app/package.json ./package.json
COPY --from=builder --chown=portal:portal /app/scripts ./scripts
VOLUME ["/data"]
USER portal
EXPOSE 3000
CMD ["sh", "-c", "bun scripts/db-migrate.ts && node server.js"]
