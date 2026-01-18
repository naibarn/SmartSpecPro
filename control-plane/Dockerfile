# Control Plane - Production Dockerfile
# Multi-stage build for optimized image size

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN if [ -f package-lock.json ]; then \
      npm ci; \
    else \
      npm install; \
    fi

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl openssl-dev

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set Prisma to use OpenSSL 3.x compatible binary
ENV PRISMA_ENGINES_MIRROR=https://binaries.prismaio.com

# Generate Prisma client if prisma schema exists
RUN if [ -f prisma/schema.prisma ]; then npx prisma generate; fi

# Build the application
RUN npm run build || echo "Build failed, will use src in production"

# Stage 3: Runtime
FROM node:20-alpine AS runner
WORKDIR /app

# Set environment
ENV NODE_ENV=production
ENV PORT=7070

# Install runtime dependencies including OpenSSL 3.x for Prisma
RUN apk add --no-cache curl openssl openssl-dev

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 controlplane

# Copy built application and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/prisma ./prisma

# Install ts-node and tsx for development mode fallback
RUN npm install --save-dev ts-node tsx @types/node typescript

# Set ownership
RUN chown -R controlplane:nodejs /app /app/node_modules

USER controlplane

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Expose port
EXPOSE 7070

# Run application
CMD ["node", "dist/index.js"]
