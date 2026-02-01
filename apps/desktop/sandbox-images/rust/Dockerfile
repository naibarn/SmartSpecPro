# SmartSpec Sandbox - Rust Image
# Full-featured Rust development environment
#
# Includes: Rust stable, cargo tools, common crates, and development utilities

FROM smartspec/sandbox-base:latest

LABEL maintainer="SmartSpec Team"
LABEL description="SmartSpec Sandbox Rust Image"
LABEL version="1.0"

USER root

# ============================================
# System Dependencies for Rust
# ============================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Required for some crates
    libssl-dev \
    pkg-config \
    # For GUI applications (optional)
    libgtk-3-dev \
    # For database crates
    libpq-dev \
    libmysqlclient-dev \
    libsqlite3-dev \
    # For async runtime
    libc6-dev \
    && rm -rf /var/lib/apt/lists/*

# ============================================
# Rust Installation
# ============================================
ENV RUSTUP_HOME=/opt/rustup
ENV CARGO_HOME=/opt/cargo
ENV PATH="${CARGO_HOME}/bin:${PATH}"

# Install Rust as root, then make accessible to all users
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
    sh -s -- -y --default-toolchain stable --profile default && \
    chmod -R a+rx /opt/rustup /opt/cargo

# Add additional toolchains
RUN rustup toolchain install nightly && \
    rustup toolchain install beta

# Add common targets
RUN rustup target add \
    wasm32-unknown-unknown \
    wasm32-wasi \
    x86_64-unknown-linux-musl

# Add components
RUN rustup component add \
    rustfmt \
    clippy \
    rust-src \
    rust-analyzer \
    llvm-tools-preview

# ============================================
# Cargo Tools
# ============================================

# Development tools
RUN cargo install cargo-watch && \
    cargo install cargo-edit && \
    cargo install cargo-expand && \
    cargo install cargo-outdated && \
    cargo install cargo-audit && \
    cargo install cargo-deny && \
    cargo install cargo-tree

# Testing & benchmarking
RUN cargo install cargo-nextest && \
    cargo install cargo-tarpaulin && \
    cargo install cargo-criterion && \
    cargo install cargo-fuzz

# Build tools
RUN cargo install cargo-make && \
    cargo install cargo-release && \
    cargo install cargo-workspaces && \
    cargo install cross

# WASM tools
RUN cargo install wasm-pack && \
    cargo install trunk && \
    cargo install wasm-bindgen-cli

# Utilities
RUN cargo install tokei && \
    cargo install ripgrep && \
    cargo install fd-find && \
    cargo install bat && \
    cargo install exa && \
    cargo install hyperfine && \
    cargo install just

# Database tools
RUN cargo install diesel_cli --no-default-features --features "postgres mysql sqlite" && \
    cargo install sqlx-cli --no-default-features --features "postgres mysql sqlite rustls"

# API & Web tools
RUN cargo install cargo-generate

# ============================================
# Sccache (Build Cache)
# ============================================
RUN cargo install sccache

ENV RUSTC_WRAPPER=sccache
ENV SCCACHE_DIR=/home/sandbox/.cache/sccache

# ============================================
# Setup for sandbox user
# ============================================

# Create directories for sandbox user
RUN mkdir -p /home/sandbox/.cargo && \
    mkdir -p /home/sandbox/.cache/sccache && \
    chown -R sandbox:sandbox /home/sandbox/.cargo /home/sandbox/.cache

# Copy cargo config
RUN echo '[build]\n\
rustc-wrapper = "sccache"\n\
\n\
[target.x86_64-unknown-linux-gnu]\n\
linker = "clang"\n\
rustflags = ["-C", "link-arg=-fuse-ld=lld"]\n\
\n\
[net]\n\
git-fetch-with-cli = true\n\
\n\
[registries.crates-io]\n\
protocol = "sparse"' > /home/sandbox/.cargo/config.toml && \
    chown sandbox:sandbox /home/sandbox/.cargo/config.toml

# Install lld linker for faster linking
RUN apt-get update && \
    apt-get install -y lld clang && \
    rm -rf /var/lib/apt/lists/*

USER sandbox

# ============================================
# Environment Variables
# ============================================
ENV RUST_BACKTRACE=1
ENV CARGO_INCREMENTAL=1
ENV CARGO_NET_GIT_FETCH_WITH_CLI=true

# Verify installation
RUN rustc --version && \
    cargo --version && \
    rustup show && \
    echo "=== Installed cargo tools ===" && \
    ls -la ${CARGO_HOME}/bin/

# Default ports for Rust apps
EXPOSE 8080 3000 9000

# Working directory
WORKDIR /workspace

# Default command
CMD ["tail", "-f", "/dev/null"]
