Now I have all the context I need. Let me generate the section content.

# Section 1: Docker Foundation -- Docker Compose Setup and Service Management

## Overview

This section establishes the Docker infrastructure for running OpenSandbox locally and integrates it into the existing SmartSpecPro service management system. It covers the Docker Compose file, network configuration, and updates to `run-services.sh`. This is the foundational section with no dependencies -- all other sections build upon it.

**What this section does NOT cover**: The Python SDK client code (section 03), database schema (section 02), and service layer (section 04) are separate sections. This section is purely infrastructure: Docker containers, networks, and shell script integration.

## Files to Create/Modify

| Action | File Path |
|--------|-----------|
| CREATE | `/home/dev/projects/SmartSpecPro/docker-compose.opensandbox.yml` |
| MODIFY | `/home/dev/projects/SmartSpecPro/run-services.sh` |

## Tests First

Since this section deals with Docker infrastructure (YAML config, shell scripts), the tests are operational validation commands rather than unit tests. Run these after implementation to verify correctness.

### Test 1: Docker Compose file validates

```bash
cd /home/dev/projects/SmartSpecPro
docker compose -f docker-compose.opensandbox.yml config
```

Expected: YAML parses without errors, all services and networks are defined. Exit code 0.

### Test 2: No port conflicts with existing services

Port 8080 must not be used by any other service in the project. Verify across all compose files:

```bash
cd /home/dev/projects/SmartSpecPro
grep -r '8080' docker-compose*.yml docker/docker-compose*.yml
```

Expected: Only `docker-compose.opensandbox.yml` references port 8080. The existing `docker/docker-compose.sandbox.yml` uses ports 5433, 9000, 9001, 7070, and 8000 -- no conflict.

### Test 3: Network opensandbox-exec is internal

After starting the sandbox stack:

```bash
docker compose -f docker-compose.opensandbox.yml up -d
docker network inspect opensandbox-exec --format '{{.Internal}}'
```

Expected: Output is `true`. This confirms sandbox containers cannot reach the host network (PostgreSQL :5432, Redis :6379, or any other local services).

### Test 4: Sandbox start/stop/status commands work in run-services.sh

```bash
cd /home/dev/projects/SmartSpecPro
./run-services.sh sandbox-start
./run-services.sh sandbox-status
./run-services.sh sandbox-stop
```

Expected: Each command completes without errors. `sandbox-status` shows the opensandbox-server container as running between start and stop. After stop, the container is removed.

### Test 5: Existing commands still work (regression)

```bash
cd /home/dev/projects/SmartSpecPro
./run-services.sh help
./run-services.sh status
```

Expected: `help` output now includes sandbox commands. `status` output includes sandbox status line. No regressions in existing commands.

## Implementation Details

### 1. Create docker-compose.opensandbox.yml

**File**: `/home/dev/projects/SmartSpecPro/docker-compose.opensandbox.yml`

This file is deliberately separate from `docker-compose.yml`, `docker-compose.media.yml`, and `docker-compose.infra.yml` to avoid any risk of breaking existing services. The filename `docker-compose.opensandbox.yml` avoids collision with the existing `docker/docker-compose.sandbox.yml` (which is for local dev infra with Postgres, MinIO, and control-plane).

The compose file defines one service and two networks:

**Service: opensandbox-server**

- Image: `registry.cn-hangzhou.aliyuncs.com/opensandbox/server:latest`
- Container name: `smartspec-opensandbox`
- Port mapping: `127.0.0.1:8080:8080` -- bound to localhost only, never exposed externally. This prevents any external network access to the OpenSandbox API.
- Volume: `/var/run/docker.sock:/var/run/docker.sock:ro` -- Docker socket access for container management. The `:ro` flag is a filesystem-level read-only mount, but it does NOT prevent Docker API write operations. The OpenSandbox server has full Docker control through this socket and must be treated as a privileged infrastructure component.
- Networks: `opensandbox-network` (for API access from Python backend)
- Resource limits: 2 CPUs, 2 GB memory for the server process itself (not the sandbox containers it creates)
- Healthcheck: HTTP GET to `http://localhost:8080/health` (or equivalent OpenSandbox health endpoint)
- Restart policy: `unless-stopped`
- Environment variables placeholder for `OPENSANDBOX_API_KEY` (loaded from env or `.env` file)

**Network: opensandbox-network**

- Driver: bridge
- Purpose: API access network. The Python backend connects to the OpenSandbox server through this network. Created as an external network so other compose stacks can reference it.

**Network: opensandbox-exec**

- Driver: bridge
- `internal: true` -- This is the critical security property. When Docker creates an internal network, containers on that network cannot reach any external network, including the host. Sandbox containers created by OpenSandbox are placed on this network, ensuring they cannot access PostgreSQL (:5432), Redis (:6379), the host machine, or the internet.
- Purpose: Isolated execution network for sandbox containers.

The compose file structure should follow the patterns established in the existing `docker-compose.infra.yml` and `docker-compose.media.yml` files (comments, section headers, restart policy, resource limits with deploy section).

```yaml
# SmartSpecPro - OpenSandbox Execution Plane
# Runs the OpenSandbox server for secure, isolated code/media execution.
# Separate from main infra and media stacks to avoid conflicts.
#
# REQUIRES: Docker running, Docker socket accessible
#
# Usage:
#   docker compose -f docker-compose.opensandbox.yml up -d
#   docker compose -f docker-compose.opensandbox.yml down
#
# Security note:
#   The opensandbox-server container has Docker socket access and is a
#   privileged infrastructure component. Never expose port 8080 externally.

services:
  opensandbox-server:
    image: registry.cn-hangzhou.aliyuncs.com/opensandbox/server:latest
    container_name: smartspec-opensandbox
    ports:
      - "127.0.0.1:8080:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      - OPENSANDBOX_API_KEY=${OPENSANDBOX_API_KEY:-dev-sandbox-key-change-me}
      - OPENSANDBOX_RUNTIME=docker
      - OPENSANDBOX_DOCKER_NETWORK=opensandbox-exec
      - OPENSANDBOX_DEFAULT_TIMEOUT=600
      - OPENSANDBOX_MAX_SANDBOXES=20
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8080/health || exit 1"]
      interval: 15s
      timeout: 5s
      start_period: 30s
      retries: 3
    restart: unless-stopped
    networks:
      - opensandbox-network

networks:
  opensandbox-network:
    name: opensandbox-network
    driver: bridge
  opensandbox-exec:
    name: opensandbox-exec
    driver: bridge
    internal: true
```

**Key details in the YAML**:

- The `name:` property on networks ensures predictable network names regardless of the Docker Compose project prefix.
- The `internal: true` on `opensandbox-exec` is the primary security boundary for sandbox containers.
- The healthcheck uses `curl -sf` (silent + fail on HTTP errors) to check the OpenSandbox health endpoint.
- Environment variables use `${VAR:-default}` syntax for local development defaults.
- The OpenSandbox server is told to use `opensandbox-exec` as its Docker network for spawned sandbox containers via `OPENSANDBOX_DOCKER_NETWORK`.

### 2. Update run-services.sh

**File**: `/home/dev/projects/SmartSpecPro/run-services.sh`

Add sandbox management commands that integrate with the existing service manager pattern. The changes are additive -- no existing commands are modified, only extended.

**New variable** at the top of the file (near line 13, after `MEDIA_COMPOSE`):

```bash
SANDBOX_COMPOSE="docker-compose.opensandbox.yml"
```

**New functions to add** (after the existing `stop_media_workers` function, around line 255):

`start_sandbox()` -- Starts the OpenSandbox Docker stack:
- Check if the `smartspec-opensandbox` container is already running (skip if so)
- Run `docker compose -f "$SANDBOX_COMPOSE" up -d`
- Wait up to 30 seconds for health check to pass (similar to `wait_for_postgres` pattern)
- Log success or failure

`stop_sandbox()` -- Stops the OpenSandbox Docker stack:
- Check if the container is running
- Run `docker compose -f "$SANDBOX_COMPOSE" down`
- Log result

`wait_for_sandbox()` -- Health check polling loop:
- Poll `http://localhost:8080/health` every 2 seconds
- Max 30 attempts (60 seconds total)
- Return 0 on success, 1 on timeout
- Follow the same pattern as `wait_for_postgres`, `wait_for_redis`, etc.

**Modifications to existing functions**:

`cmd_status()` -- Add a new status section for OpenSandbox between the Infrastructure section and the Application section. Check if `smartspec-opensandbox` container exists and is healthy. Display like:

```
--- Sandbox Services ---
  [check] OpenSandbox      Running (healthy) [port 8080]
```

or

```
--- Sandbox Services ---
  [x] OpenSandbox      Not running (optional)
```

Note: OpenSandbox is optional -- its absence should show as a warning, not an error. The system operates in legacy mode without it.

`cmd_start()` -- Add sandbox start as an optional step. It should be attempted but failure should not block the rest of the startup sequence (since sandbox is optional). Add it after infrastructure (Step 1) and before backend (Step 3), or as a separate step at the end. Log a warning if it fails but continue.

`cmd_stop()` -- Add `stop_sandbox` call alongside the other stop commands.

`cmd_restart()` -- Add `sandbox` as a valid service name option:
```bash
sandbox)
    log_step "Restarting OpenSandbox..."
    stop_sandbox
    sleep 1
    start_sandbox
    ;;
```

`cmd_logs()` -- Add `sandbox` option:
```bash
sandbox)
    log_info "Showing recent logs for OpenSandbox..."
    docker logs --tail 50 smartspec-opensandbox 2>&1 || echo "  Container not running"
    ;;
```

`cmd_attach()` -- Add `sandbox` option:
```bash
sandbox)
    log_info "Showing live OpenSandbox logs (Ctrl+C to exit)..."
    docker logs -f smartspec-opensandbox 2>&1 || echo "  Container not running"
    ;;
```

`cmd_help()` -- Add sandbox to the help text services list and examples.

**Important implementation notes for run-services.sh**:

1. The sandbox start is non-blocking for the overall startup. If OpenSandbox fails to start, the rest of the system works in legacy mode (no sandbox isolation).
2. The total service count in `cmd_status()` should NOT include sandbox in the denominator -- it is optional infrastructure. Track it separately or annotate as "(optional)".
3. The URLs summary in `cmd_start()` should include `OpenSandbox API | http://localhost:8080 (when enabled)`.

## Security Considerations

- The Docker socket mount (`/var/run/docker.sock:ro`) gives the OpenSandbox server full Docker API access. This is by design -- the server needs to create and destroy sandbox containers. The `:ro` flag prevents filesystem writes to the socket file itself but does NOT limit Docker API operations.
- Port 8080 is bound to `127.0.0.1` only, preventing external access. The Nginx reverse proxy (which handles HTTPS for the production domain) does NOT proxy to port 8080.
- The `opensandbox-exec` network with `internal: true` is the primary isolation boundary. Sandbox containers on this network cannot reach any external endpoint, host service, or the internet.
- The `OPENSANDBOX_API_KEY` environment variable should be changed from the default value in any non-local environment. The `.env` file pattern is used (same as other services).

## Dependencies on Other Sections

- **Section 02 (Database Schema)**: No dependency. Docker infrastructure is independent of database tables.
- **Section 03 (Python SDK Client)**: The SDK client will connect to the OpenSandbox server started by this section. The base URL (`http://localhost:8080`) is configured in the Python backend's `.env` file (covered in section 11).
- **Section 11 (Config and Feature Flags)**: Environment variables like `OPENSANDBOX_ENABLED` and `OPENSANDBOX_BASE_URL` are defined there. This section only sets the Docker-level config for the server itself.

## Implementation Notes (Actual)

### Files Created/Modified
- **CREATED**: `docker-compose.opensandbox.yml` — OpenSandbox server + two networks
- **MODIFIED**: `run-services.sh` — Added sandbox management (start/stop/status/restart/logs/attach)

### Deviations from Plan
1. **Server on opensandbox-exec network**: Plan showed server only on `opensandbox-network`. Implementation adds server to `opensandbox-exec` too, because Docker Compose only creates networks referenced by services. Server needs exec network to manage sandbox containers. API key auth is the security boundary.
2. **No standalone sandbox-start/sandbox-stop commands**: Sandbox is a service argument to existing commands (`./run-services.sh restart sandbox`, `./run-services.sh logs sandbox`), following the established pattern.
3. **Added `-p smartspecpro` project name**: Matches media worker compose pattern for consistency.
4. **Error visibility**: `start_sandbox()` captures stderr to `/tmp/sandbox-start.log` for diagnostics on failure.

### Code Review Fixes Applied
- Fixed `wait_for_sandbox()` elapsed time reporting (2s sleep interval → `$((attempt * 2))s`)
- Added error logging to `start_sandbox()` (stderr captured, shown on failure)
- Added `-p smartspecpro` project name to compose commands

## Verification Checklist

After implementation, verify:

1. `docker compose -f docker-compose.opensandbox.yml config` exits cleanly
2. `docker compose -f docker-compose.opensandbox.yml up -d` starts the container
3. `docker network inspect opensandbox-exec --format '{{.Internal}}'` returns `true`
4. `curl http://localhost:8080/health` returns a success response (when container is running)
5. `./run-services.sh status` shows sandbox status under "Sandbox Services (optional)"
6. `./run-services.sh restart sandbox` / `./run-services.sh logs sandbox` work correctly
7. Existing `./run-services.sh start` / `stop` / `status` commands still work correctly
8. No port conflicts: `lsof -i :8080` shows only the opensandbox container