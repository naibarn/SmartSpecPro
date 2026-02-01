# SmartSpec Sandbox - Base Image
# Ubuntu 22.04 with essential development tools
#
# This is the foundation image for all SmartSpec sandbox environments.
# Includes common utilities, build tools, and runtime dependencies.

FROM ubuntu:22.04

LABEL maintainer="SmartSpec Team"
LABEL description="SmartSpec Sandbox Base Image"
LABEL version="1.0"

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# Set locale
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# Create sandbox user
ARG SANDBOX_USER=sandbox
ARG SANDBOX_UID=1000
ARG SANDBOX_GID=1000

RUN groupadd -g ${SANDBOX_GID} ${SANDBOX_USER} && \
    useradd -m -u ${SANDBOX_UID} -g ${SANDBOX_GID} -s /bin/bash ${SANDBOX_USER} && \
    echo "${SANDBOX_USER} ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Install essential packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Basic utilities
    ca-certificates \
    curl \
    wget \
    gnupg \
    lsb-release \
    software-properties-common \
    # Build tools
    build-essential \
    gcc \
    g++ \
    make \
    cmake \
    pkg-config \
    # Version control
    git \
    git-lfs \
    # Text editors
    vim \
    nano \
    # Network tools
    net-tools \
    iputils-ping \
    dnsutils \
    openssh-client \
    # Archive tools
    zip \
    unzip \
    tar \
    gzip \
    bzip2 \
    xz-utils \
    # Process management
    htop \
    procps \
    psmisc \
    # File utilities
    tree \
    jq \
    less \
    # Development libraries
    libssl-dev \
    libffi-dev \
    zlib1g-dev \
    libbz2-dev \
    libreadline-dev \
    libsqlite3-dev \
    libncurses5-dev \
    libncursesw5-dev \
    # Locales
    locales \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Generate locale
RUN locale-gen en_US.UTF-8

# Install Docker CLI (for Docker-in-Docker scenarios)
RUN curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null && \
    apt-get update && \
    apt-get install -y docker-ce-cli && \
    rm -rf /var/lib/apt/lists/*

# Create workspace directory
RUN mkdir -p /workspace && chown ${SANDBOX_USER}:${SANDBOX_USER} /workspace

# Set working directory
WORKDIR /workspace

# Switch to sandbox user
USER ${SANDBOX_USER}

# Configure git
RUN git config --global init.defaultBranch main && \
    git config --global core.editor vim

# Add local bin to PATH
ENV PATH="/home/${SANDBOX_USER}/.local/bin:${PATH}"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD echo "healthy" || exit 1

# Default command - keep container running
CMD ["tail", "-f", "/dev/null"]
