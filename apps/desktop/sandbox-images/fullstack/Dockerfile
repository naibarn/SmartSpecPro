# SmartSpec Sandbox - Fullstack Image
# Complete development environment for full-stack applications
#
# Includes: Node.js, Python, Go, Rust, Docker CLI, databases clients

FROM smartspec/sandbox-base:latest

LABEL maintainer="SmartSpec Team"
LABEL description="SmartSpec Sandbox Fullstack Image"
LABEL version="1.0"

USER root

# ============================================
# Node.js 20 LTS
# ============================================
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g pnpm yarn typescript ts-node tsx nodemon pm2 vite

# ============================================
# Python 3.11
# ============================================
RUN add-apt-repository ppa:deadsnakes/ppa -y && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-venv \
    python3.11-dev \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1 && \
    update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1 && \
    python -m pip install --upgrade pip setuptools wheel uv

# Install essential Python packages
RUN pip install \
    fastapi uvicorn[standard] flask \
    requests httpx aiohttp \
    pandas numpy \
    sqlalchemy alembic \
    pytest black ruff \
    python-dotenv pydantic

# ============================================
# Go 1.21
# ============================================
ENV GO_VERSION=1.21.6
RUN wget -q https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz && \
    tar -C /usr/local -xzf go${GO_VERSION}.linux-amd64.tar.gz && \
    rm go${GO_VERSION}.linux-amd64.tar.gz

ENV PATH="/usr/local/go/bin:${PATH}"
ENV GOPATH="/home/sandbox/go"
ENV PATH="${GOPATH}/bin:${PATH}"

# ============================================
# Rust (latest stable)
# ============================================
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && \
    mv /root/.rustup /opt/rustup && \
    mv /root/.cargo /opt/cargo

ENV RUSTUP_HOME=/opt/rustup
ENV CARGO_HOME=/opt/cargo
ENV PATH="${CARGO_HOME}/bin:${PATH}"

# Install common Rust tools
RUN cargo install cargo-watch cargo-edit

# ============================================
# Database Clients
# ============================================

# PostgreSQL client
RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

# MySQL client
RUN apt-get update && apt-get install -y mysql-client && rm -rf /var/lib/apt/lists/*

# Redis CLI
RUN apt-get update && apt-get install -y redis-tools && rm -rf /var/lib/apt/lists/*

# MongoDB Shell
RUN wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | apt-key add - && \
    echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list && \
    apt-get update && apt-get install -y mongodb-mongosh && rm -rf /var/lib/apt/lists/*

# ============================================
# Additional Tools
# ============================================

# AWS CLI
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && \
    unzip -q awscliv2.zip && \
    ./aws/install && \
    rm -rf aws awscliv2.zip

# GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
    apt-get update && apt-get install -y gh && rm -rf /var/lib/apt/lists/*

# Terraform
RUN wget -O- https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/hashicorp.list && \
    apt-get update && apt-get install -y terraform && rm -rf /var/lib/apt/lists/*

# kubectl
RUN curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && \
    install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl && \
    rm kubectl

# ============================================
# Setup for sandbox user
# ============================================
USER sandbox

# Create Go workspace
RUN mkdir -p /home/sandbox/go/{bin,src,pkg}

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV NPM_CONFIG_CACHE=/home/sandbox/.npm
ENV PNPM_HOME=/home/sandbox/.local/share/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

# Create cache directories
RUN mkdir -p /home/sandbox/.npm /home/sandbox/.local/share/pnpm

# Verify installations
RUN echo "=== Versions ===" && \
    node --version && \
    python --version && \
    go version && \
    rustc --version && \
    echo "================"

# Default ports
EXPOSE 3000 5000 5173 8000 8080

# Working directory
WORKDIR /workspace

# Default command
CMD ["tail", "-f", "/dev/null"]
