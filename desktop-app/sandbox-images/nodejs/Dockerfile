# SmartSpec Sandbox - Node.js Image
# Full-featured Node.js development environment
#
# Includes: Node.js 20 LTS, npm, pnpm, yarn, common global packages

FROM smartspec/sandbox-base:latest

LABEL maintainer="SmartSpec Team"
LABEL description="SmartSpec Sandbox Node.js Image"
LABEL version="1.0"

USER root

# Install Node.js 20 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install pnpm and yarn globally
RUN npm install -g pnpm yarn

# Install common global packages
RUN npm install -g \
    typescript \
    ts-node \
    tsx \
    nodemon \
    pm2 \
    eslint \
    prettier \
    @types/node \
    vite \
    esbuild \
    turbo \
    nx

# Install Bun (alternative runtime)
RUN curl -fsSL https://bun.sh/install | bash && \
    mv /root/.bun /opt/bun && \
    ln -s /opt/bun/bin/bun /usr/local/bin/bun && \
    ln -s /opt/bun/bin/bunx /usr/local/bin/bunx

# Switch back to sandbox user
USER sandbox

# Set npm/pnpm cache directories
ENV NPM_CONFIG_CACHE=/home/sandbox/.npm
ENV PNPM_HOME=/home/sandbox/.local/share/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

# Create cache directories
RUN mkdir -p /home/sandbox/.npm /home/sandbox/.local/share/pnpm

# Verify installations
RUN node --version && npm --version && pnpm --version && yarn --version

# Default port for Node.js apps
EXPOSE 3000 5173 8080

# Working directory
WORKDIR /workspace

# Default command
CMD ["tail", "-f", "/dev/null"]
