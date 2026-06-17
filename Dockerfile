# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY --link package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  corepack pnpm install --frozen-lockfile

FROM base AS builder
ARG NEXT_PUBLIC_TASK_POLLING_MS=15000
ENV NEXT_PUBLIC_TASK_POLLING_MS=$NEXT_PUBLIC_TASK_POLLING_MS
COPY --link --from=deps /app/node_modules ./node_modules
COPY --link package.json pnpm-lock.yaml next.config.ts postcss.config.mjs tsconfig.json ./
COPY --link public ./public
COPY --link src ./src
RUN --mount=type=cache,id=next-cache,target=/app/.next/cache \
  corepack pnpm run build:docker

FROM node:22-alpine AS runner
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --link --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
