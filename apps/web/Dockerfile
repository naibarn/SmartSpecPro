# SmartSpec Web - Production Dockerfile (Monorepo)
# Build context must be the repository root (.)
# Multi-stage build for optimized image size

# Stage 1: Dependencies
FROM node:20.20.0-alpine AS deps
WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json* ./

# Copy package.json for workspace packages
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/skills/package.json ./packages/skills/
COPY apps/web/package.json ./apps/web/

# Install dependencies
RUN npm ci || npm install

# Stage 2: Builder
FROM node:20.20.0-alpine AS builder
WORKDIR /app

# Copy deps
COPY --from=deps /app/node_modules ./node_modules

# Copy source
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/
COPY package.json turbo.json tsconfig.base.json ./

# Build
RUN cd apps/web && npm run build

# Stage 3: Development
FROM node:20.20.0-alpine AS development
WORKDIR /app

ENV NODE_ENV=development
ENV PORT=3000

COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/skills/package.json ./packages/skills/
COPY apps/web/package.json ./apps/web/

RUN npm install

COPY packages/ ./packages/
COPY apps/web/ ./apps/web/
COPY tsconfig.base.json turbo.json ./

EXPOSE 3000
WORKDIR /app/apps/web
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# Stage 4: Production
FROM node:20.20.0-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 smartspec

# Copy built app + runtime source. The production server is server/_core/index.ts;
# dist/ only contains the Vite client bundle.
COPY --from=builder /app/apps/web/dist ./dist
COPY --from=builder /app/apps/web/package.json ./package.json
COPY --from=builder /app/apps/web/server ./server
COPY --from=builder /app/apps/web/shared ./shared
COPY --from=builder /app/apps/web/skills ./skills
COPY --from=builder /app/apps/web/drizzle ./drizzle
COPY --from=builder /app/apps/web/vite.config.ts ./vite.config.ts
COPY --from=builder /app/apps/web/tsconfig.json ./tsconfig.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages

RUN chown -R smartspec:nodejs /app

USER smartspec

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

EXPOSE 3000
CMD ["npm", "run", "start"]
