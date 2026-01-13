# docker-status - Production Dockerfile
# Multi-stage build for optimized image size
# Node.js + Vite + tRPC application with Docker socket access

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml* package-lock.json* ./
COPY patches/ ./patches/

# Install dependencies
RUN if [ -f pnpm-lock.yaml ]; then \
      pnpm install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then \
      npm ci; \
    else \
      npm install; \
    fi

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN pnpm run build || npm run build

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app

# Set environment
ENV NODE_ENV=production
ENV PORT=3001

# Install pnpm and docker CLI for container management
RUN corepack enable && corepack prepare pnpm@latest --activate && \
    apk add --no-cache docker-cli curl

# Create non-root user with docker group access
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 dockerstatus && \
    addgroup dockerstatus docker 2>/dev/null || true

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/drizzle ./drizzle

# Set ownership
RUN chown -R dockerstatus:nodejs /app

USER dockerstatus

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

# Expose port
EXPOSE 3001

# Note: When running this container, mount Docker socket:
# docker run -v /var/run/docker.sock:/var/run/docker.sock docker-status

# Run application
CMD ["node", "dist/index.js"]
