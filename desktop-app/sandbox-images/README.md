# SmartSpec Sandbox Images

Docker images สำหรับ SmartSpec Desktop App ใช้เป็น sandbox environment สำหรับทดสอบระบบ

## Overview

```
sandbox-images/
├── base/           # Base image with essential tools
│   └── Dockerfile
├── nodejs/         # Node.js development environment
│   └── Dockerfile
├── python/         # Python development environment
│   └── Dockerfile
├── golang/         # Go development environment
│   └── Dockerfile
├── rust/           # Rust development environment
│   └── Dockerfile
├── fullstack/      # Complete fullstack environment
│   └── Dockerfile
├── workspace/      # Shared workspace directory
├── docker-compose.yml
├── build.sh
└── README.md
```

## Images

| Image | Size (approx.) | Description |
|-------|----------------|-------------|
| `smartspec/sandbox-base` | ~500MB | Ubuntu 22.04 + essential tools |
| `smartspec/sandbox-nodejs` | ~800MB | Node.js 20 + npm/pnpm/yarn |
| `smartspec/sandbox-python` | ~1.2GB | Python 3.11 + pip/poetry |
| `smartspec/sandbox-golang` | ~1GB | Go 1.21 + tools + linters |
| `smartspec/sandbox-rust` | ~2GB | Rust stable + cargo tools |
| `smartspec/sandbox-fullstack` | ~3GB | Node.js + Python + Go + Rust |

## Quick Start

### Build Images

```bash
# Build all images
./build.sh

# Build specific image
./build.sh nodejs
./build.sh python
./build.sh golang
./build.sh rust
./build.sh fullstack
```

### Using Docker Compose

```bash
# Build all images
docker-compose build

# Run Node.js sandbox
docker-compose run --rm nodejs bash

# Run Python sandbox
docker-compose run --rm python bash

# Run Go sandbox
docker-compose run --rm golang bash

# Run Rust sandbox
docker-compose run --rm rust bash

# Run Fullstack sandbox
docker-compose run --rm fullstack bash

# Run with databases
docker-compose --profile databases up -d
docker-compose run --rm fullstack bash
```

### Using Docker Directly

```bash
# Run Node.js sandbox
docker run -it --rm \
  -v $(pwd)/workspace:/workspace \
  -p 3000:3000 \
  smartspec/sandbox-nodejs bash

# Run Python sandbox
docker run -it --rm \
  -v $(pwd)/workspace:/workspace \
  -p 8000:8000 \
  smartspec/sandbox-python bash

# Run Go sandbox
docker run -it --rm \
  -v $(pwd)/workspace:/workspace \
  -p 8080:8080 \
  smartspec/sandbox-golang bash

# Run Rust sandbox
docker run -it --rm \
  -v $(pwd)/workspace:/workspace \
  -p 8080:8080 \
  smartspec/sandbox-rust bash

# Run Fullstack sandbox with Docker-in-Docker
docker run -it --rm \
  -v $(pwd)/workspace:/workspace \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -p 3000:3000 -p 8000:8000 \
  smartspec/sandbox-fullstack bash
```

## Image Details

### Base Image (`smartspec/sandbox-base`)

Foundation image with:
- Ubuntu 22.04 LTS
- Build tools (gcc, g++, make, cmake)
- Git, curl, wget
- Text editors (vim, nano)
- Network tools
- Docker CLI
- Non-root user `sandbox` with sudo

### Node.js Image (`smartspec/sandbox-nodejs`)

Includes everything from base plus:
- Node.js 20 LTS
- npm, pnpm, yarn
- Global packages: typescript, ts-node, tsx, nodemon, pm2, vite, esbuild
- Bun runtime

### Python Image (`smartspec/sandbox-python`)

Includes everything from base plus:
- Python 3.11
- pip, uv (fast installer), poetry, pipenv
- Pre-installed packages:
  - Web: FastAPI, Flask, Django
  - HTTP: requests, httpx, aiohttp
  - Data: pandas, numpy, polars
  - Database: SQLAlchemy, alembic
  - AI: openai, anthropic, langchain

### Go Image (`smartspec/sandbox-golang`)

Includes everything from base plus:
- Go 1.21
- gopls, golangci-lint, staticcheck, delve
- goimports, gotests, impl
- air (hot reload), swag (Swagger)
- protoc-gen-go, protoc-gen-go-grpc
- migrate, sqlc
- cobra-cli

### Rust Image (`smartspec/sandbox-rust`)

Includes everything from base plus:
- Rust stable, nightly, beta toolchains
- WASM targets (wasm32-unknown-unknown, wasm32-wasi)
- rustfmt, clippy, rust-analyzer
- cargo-watch, cargo-edit, cargo-expand
- cargo-nextest, cargo-tarpaulin
- wasm-pack, trunk
- diesel_cli, sqlx-cli
- sccache (build cache)
- ripgrep, fd-find, bat, exa

### Fullstack Image (`smartspec/sandbox-fullstack`)

Complete development environment:
- Node.js 20 + npm/pnpm/yarn
- Python 3.11 + pip/uv
- Go 1.21
- Rust (latest stable)
- Database clients: PostgreSQL, MySQL, Redis, MongoDB
- Cloud tools: AWS CLI, GitHub CLI, Terraform, kubectl

## Environment Variables

### Node.js
```bash
NODE_ENV=development
NPM_CONFIG_CACHE=/home/sandbox/.npm
PNPM_HOME=/home/sandbox/.local/share/pnpm
```

### Python
```bash
PYTHONUNBUFFERED=1
PYTHONDONTWRITEBYTECODE=1
PIP_NO_CACHE_DIR=1
```

### Go
```bash
GOPATH=/home/sandbox/go
GO111MODULE=on
GOPROXY=https://proxy.golang.org,direct
```

### Rust
```bash
RUSTUP_HOME=/opt/rustup
CARGO_HOME=/opt/cargo
RUST_BACKTRACE=1
```

## Ports

| Port | Service |
|------|---------|
| 3000 | Node.js / React |
| 5000 | Flask |
| 5173 | Vite dev server |
| 8000 | FastAPI / Django |
| 8080 | General HTTP / Go |
| 9000 | gRPC |

## Database Services (Optional)

Start databases with `--profile databases`:

```bash
docker-compose --profile databases up -d
```

| Service | Port | Credentials |
|---------|------|-------------|
| PostgreSQL | 5432 | sandbox/sandbox |
| MySQL | 3306 | sandbox/sandbox |
| Redis | 6379 | - |
| MongoDB | 27017 | sandbox/sandbox |

## Workspace

The `workspace/` directory is mounted to `/workspace` in containers. Use this for:
- Project files
- Shared data between containers
- Persistent storage

## Integration with Desktop App

These images are designed to work with SmartSpec Desktop App's Docker Sandbox feature:

1. Build images locally using `./build.sh`
2. Open Desktop App → Docker Sandbox
3. Create new sandbox using `smartspec/sandbox-*` images
4. Manage containers through the UI

## Customization

### Add Custom Packages

Create a new Dockerfile extending any base:

```dockerfile
FROM smartspec/sandbox-nodejs:latest

USER root
RUN npm install -g your-package
USER sandbox
```

### Change Default User

Build with custom UID/GID:

```bash
docker build \
  --build-arg SANDBOX_UID=$(id -u) \
  --build-arg SANDBOX_GID=$(id -g) \
  -t smartspec/sandbox-base:custom \
  ./base
```

## Troubleshooting

### Permission Issues

If you encounter permission issues with mounted volumes:

```bash
# Fix ownership
sudo chown -R $(id -u):$(id -g) workspace/

# Or run with matching UID
docker run -it --rm \
  --user $(id -u):$(id -g) \
  -v $(pwd)/workspace:/workspace \
  smartspec/sandbox-nodejs bash
```

### Docker-in-Docker

For Docker-in-Docker functionality, mount the Docker socket:

```bash
docker run -it --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  smartspec/sandbox-fullstack bash
```

### Out of Disk Space

Clean up unused images and containers:

```bash
docker system prune -a
```

## Workspace Management

SmartSpec Sandbox รองรับการจัดการ workspace สำหรับ parallel development:

### Initial Setup

```bash
# Run once to setup environment
./setup-workspace.sh
```

This creates:
- `~/SmartSpec/workspaces/` - Project workspaces
- `~/SmartSpec/cache/` - Shared package caches
- `~/SmartSpec/config/` - Configuration files
- Docker volumes for persistent caches

### Create Workspace

```bash
# Create empty workspace
./create-workspace.sh my-project

# Clone from repository
./create-workspace.sh my-project https://github.com/user/repo

# Specify image type
./create-workspace.sh my-project https://github.com/user/repo python
```

### Create Branch with Container

```bash
# Create feature branch from main
./create-branch.sh my-project feature/auth

# Create from specific branch
./create-branch.sh my-project feature/api develop

# Use different image
./create-branch.sh my-project feature/ml develop python
```

### Parallel Development Workflow

```
                    main
                      │
                      ▼
                   develop
                      │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
    feature/A    feature/B    bugfix/C
         │           │           │
    Container A  Container B  Container C
    (Port 3000)  (Port 3001)  (Port 3002)
```

Each branch has its own container with isolated ports, but shares:
- Project files (via volume mount)
- Package caches (npm, pip, etc.)

### Data Persistence

| Data Type | Storage | Persistence |
|-----------|---------|-------------|
| Project files | `~/SmartSpec/workspaces/` | ✅ Permanent |
| Package caches | Docker volumes | ✅ Shared |
| node_modules | Inside container | ❌ Ephemeral |
| Build artifacts | Inside container | ❌ Ephemeral |

**Key benefit**: You can delete, recreate, or update containers without losing project files.

## License

MIT License - SmartSpec Team
