# SmartSpec Pro - Docker Development Environment

This directory contains Docker configuration for running SmartSpec Pro in a containerized development environment that mirrors production.

## Overview

The Docker setup provides:
- **Consistent Environment**: Ubuntu 22.04 base matching production
- **Pre-installed Tools**: Node.js, Python, Git, and development utilities
- **Kilo Code CLI Integration**: Full support for AI-assisted coding
- **Database Services**: PostgreSQL, Redis, ChromaDB
- **Hot Reload**: Code changes reflect immediately

## Quick Start

### First Time Setup

```bash
# Run the setup script
./docker/scripts/docker-dev.sh setup
```

This will:
1. Build the development Docker image
2. Create necessary configuration files
3. Start all services (PostgreSQL, Redis, ChromaDB, etc.)
4. Display connection information

### Daily Usage

```bash
# Start the environment
./docker/scripts/docker-dev.sh up

# Enter the development container
./docker/scripts/docker-dev.sh shell

# Stop the environment
./docker/scripts/docker-dev.sh down
```

## Architecture

### Approach A: Kilo on Host, Commands in Docker (Recommended)

```
┌─────────────────────────────────────────────────────────────┐
│ Host Machine                                                 │
│  ┌─────────────────────┐                                    │
│  │ VS Code + Kilo Code │                                    │
│  │ Extension           │                                    │
│  └──────────┬──────────┘                                    │
│             │ dockersh wrapper                              │
│             ▼                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Docker Container (smartspec-dev)                     │   │
│  │  ┌─────────────────────────────────────────────┐    │   │
│  │  │ Ubuntu 22.04                                 │    │   │
│  │  │ - Node.js 20                                 │    │   │
│  │  │ - Python 3.11                                │    │   │
│  │  │ - Git, npm, pnpm                             │    │   │
│  │  │ - Project files mounted at /workspace        │    │   │
│  │  └─────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Benefits:**
- VS Code extensions work normally
- Kilo Code runs with full functionality
- Commands execute in isolated Linux environment
- Easy to debug and develop

### Approach B: Everything in Docker

For fully containerized development, all services including the IDE run inside Docker.

## Directory Structure

```
docker/
├── Dockerfile.dev          # Development container image
├── docker-compose.dev.yml  # Full development stack
├── scripts/
│   ├── docker-dev.sh       # Environment management script
│   └── dockersh            # Command wrapper for Kilo CLI
└── README.md               # This file
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| smartspec-dev | - | Main development container |
| postgres | 5432 | PostgreSQL database |
| redis | 6379 | Redis cache |
| chromadb | 8000 | Vector database for embeddings |
| ollama | 11434 | Local LLM (optional) |

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Database (auto-configured for Docker)
DATABASE_URL=postgresql://smartspec:smartspec@postgres:5432/smartspec

# Redis
REDIS_URL=redis://redis:6379/0

# ChromaDB
CHROMADB_URL=http://chromadb:8000
```

### Kilo Code Configuration

To use Kilo Code with Docker execution, configure in VS Code settings:

```json
{
  "kilocode.shellCommand": "/path/to/SmartSpec/docker/scripts/dockersh"
}
```

Or in `.kilocode/config.json`:

```json
{
  "shell": {
    "command": "/path/to/SmartSpec/docker/scripts/dockersh"
  }
}
```

## Commands Reference

### docker-dev.sh

```bash
# Setup and start
./docker/scripts/docker-dev.sh setup       # First time setup
./docker/scripts/docker-dev.sh up          # Start services
./docker/scripts/docker-dev.sh up --build  # Rebuild and start

# Management
./docker/scripts/docker-dev.sh status      # Show service status
./docker/scripts/docker-dev.sh logs        # View logs
./docker/scripts/docker-dev.sh logs postgres  # View specific service logs

# Development
./docker/scripts/docker-dev.sh shell       # Enter container as devuser
./docker/scripts/docker-dev.sh shell-root  # Enter container as root
./docker/scripts/docker-dev.sh test        # Run tests in container

# Cleanup
./docker/scripts/docker-dev.sh down        # Stop services
./docker/scripts/docker-dev.sh clean       # Remove everything
```

### dockersh

The `dockersh` script wraps commands to execute inside the Docker container:

```bash
# Run any command
./docker/scripts/dockersh "npm install"
./docker/scripts/dockersh "python -m pytest tests/"

# Run in specific directory
./docker/scripts/dockersh "npm test" --workdir /workspace/desktop-app
```

## Integration with SmartSpec Pro

### Python Backend

Enable Docker execution in `KiloConfig`:

```python
from app.services.kilo_session_manager import KiloConfig, KiloSessionManager

config = KiloConfig(
    use_docker=True,
    docker_container="smartspec-dev",
    docker_user="devuser",
    docker_workdir="/workspace",
)

manager = KiloSessionManager(config)
```

### API Configuration

Set in environment or `.env`:

```bash
KILO_USE_DOCKER=true
KILO_DOCKER_CONTAINER=smartspec-dev
```

## Troubleshooting

### Container won't start

```bash
# Check Docker status
docker ps -a

# View container logs
docker logs smartspec-dev

# Rebuild image
./docker/scripts/docker-dev.sh up --build
```

### Permission issues

```bash
# Enter as root and fix permissions
./docker/scripts/docker-dev.sh shell-root
chown -R devuser:devuser /workspace
```

### Database connection issues

```bash
# Check if PostgreSQL is running
docker exec smartspec-dev pg_isready -h postgres -U smartspec

# Reset database
./docker/scripts/docker-dev.sh down -v
./docker/scripts/docker-dev.sh up
```

### Kilo Code not working

1. Verify dockersh is executable:
   ```bash
   chmod +x docker/scripts/dockersh
   ```

2. Test dockersh manually:
   ```bash
   ./docker/scripts/dockersh "echo Hello from Docker"
   ```

3. Check container is running:
   ```bash
   docker ps | grep smartspec-dev
   ```

## Performance Tips

1. **Use Docker volumes** for node_modules to avoid slow file syncing
2. **Enable BuildKit** for faster builds: `DOCKER_BUILDKIT=1`
3. **Allocate sufficient resources** in Docker Desktop settings
4. **Use .dockerignore** to exclude unnecessary files from build context

## Security Notes

- The development container runs as non-root user `devuser`
- API keys should be stored in `.env` (gitignored)
- Don't expose development ports to public networks
- Use Docker secrets for sensitive data in production
