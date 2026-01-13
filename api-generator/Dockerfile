# api-generator - Production Dockerfile
# Multi-stage build for SmartSpec API Generator

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --only=production

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and install all dependencies (including dev)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app

# Set environment
ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 apigen

# Copy built application and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/templates ./templates
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Create output directory
RUN mkdir -p /app/output && chown -R apigen:nodejs /app

USER apigen

# Default command - can be overridden for CLI usage
CMD ["node", "dist/index.js"]
