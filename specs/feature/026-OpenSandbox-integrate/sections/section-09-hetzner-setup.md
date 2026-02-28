I now have all the context needed. Let me generate the section content.

# Section 9: Hetzner Production Setup -- Server Provisioning, TLS, Firewall, and Monitoring

## Overview

This section covers provisioning and configuring a Hetzner Cloud CPX31 server in Singapore as the production OpenSandbox execution environment. The Hetzner server runs the OpenSandbox server container and accepts HTTPS connections from the GCP-hosted Python backend (Cloud Run). The domain `sandbox.smartaihub.app` points to this server with TLS termination via Let's Encrypt and Nginx reverse proxy.

This section is infrastructure-focused: it produces a setup script, Nginx configuration, firewall rules, monitoring endpoints, and a connectivity verification suite. No application code (Python or TypeScript) is modified. The output is a single idempotent provisioning script and supporting configuration files.

**What this section does NOT cover**: Python SDK client code or config changes are in section 03. Feature flags and environment variables are in section 11. Admin observability UI is in section 10. Production hardening and chaos testing are in section 12.

**Dependencies**: Section 06 (media pipeline migration) must be complete so that sandbox jobs can flow through the system before production deployment is meaningful. The setup script itself has no code dependencies -- it runs on a fresh Hetzner server.

## Files to Create/Modify

| Action | File Path |
|--------|-----------|
| CREATE | `/home/dev/projects/SmartSpecPro/scripts/setup-hetzner-sandbox.sh` |
| CREATE | `/home/dev/projects/SmartSpecPro/scripts/hetzner-sandbox/nginx-sandbox.conf` |
| CREATE | `/home/dev/projects/SmartSpecPro/scripts/hetzner-sandbox/docker-compose.hetzner-sandbox.yml` |
| CREATE | `/home/dev/projects/SmartSpecPro/scripts/hetzner-sandbox/opensandbox.service` |
| CREATE | `/home/dev/projects/SmartSpecPro/scripts/hetzner-sandbox/verify-connectivity.sh` |
| CREATE | `/home/dev/projects/SmartSpecPro/scripts/hetzner-sandbox/README.md` |

## Tests First

Since this section deals with server infrastructure (provisioning scripts, Nginx config, firewall rules), the tests are operational verification commands run on the provisioned Hetzner server. Some are also validation commands that can be run locally against the generated config files before deployment.

### Test 1: Health check endpoint responds with 200

After running the setup script on the Hetzner server:

```bash
curl -sf https://sandbox.smartaihub.app/health
```

Expected: HTTP 200 response with a JSON body containing `{"status": "healthy"}` or a plain-text health indicator. This confirms TLS, Nginx, and the OpenSandbox server container are all working end-to-end.

### Test 2: TLS certificate valid

```bash
openssl s_client -connect sandbox.smartaihub.app:443 -servername sandbox.smartaihub.app </dev/null 2>/dev/null | openssl x509 -noout -dates -subject
```

Expected: Certificate subject includes `sandbox.smartaihub.app`. `notAfter` date is at least 60 days in the future. Issuer is Let's Encrypt (R3 or R10/R11).

### Test 3: Firewall blocks non-GCP IPs

From a non-GCP IP address (e.g., a local machine or a different cloud provider):

```bash
curl --connect-timeout 5 https://sandbox.smartaihub.app/health
```

Expected: Connection times out or is refused. Only GCP Cloud Run egress IPs and explicitly allowed admin SSH IPs should be able to reach the server.

Verification from the Hetzner server itself:

```bash
sudo ufw status verbose
```

Expected: Default deny incoming. Allow rules present ONLY for:
- SSH (port 22) from admin IPs
- HTTPS (port 443) from GCP Cloud Run egress IP ranges
- HTTP (port 80) for Let's Encrypt ACME challenge (temporary, or permanent if using HTTP-01)

### Test 4: Python orchestrator can create sandbox on Hetzner

From the GCP Cloud Run environment (or a machine with a GCP egress IP), using the OpenSandbox API:

```bash
curl -X POST https://sandbox.smartaihub.app/api/v1/sandboxes \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${OPENSANDBOX_API_KEY}" \
  -d '{"image": "python:3.11-slim", "timeout": 60}' \
  -w "\nHTTP_CODE: %{http_code}\nTIME_TOTAL: %{time_total}s\n"
```

Expected: HTTP 200 or 201 with a sandbox ID in the response body. `TIME_TOTAL` should be under 5 seconds for the API call itself (sandbox creation is async).

### Test 5: Artifact transfer via R2 signed URLs works

From within a sandbox container on Hetzner, verify that outbound HTTPS to Cloudflare R2 is permitted (the sandbox-exec network blocks general internet, but the OpenSandbox server can reach R2 for artifact staging):

```bash
# This is tested via the sandbox dispatcher, not directly from sandbox containers.
# The Python backend on GCP generates signed URLs; sandbox outputs are collected
# by the Python backend via the OpenSandbox filesystem API, then uploaded to R2.
# Direct sandbox-to-R2 is not needed -- the orchestrator handles artifact transfer.
```

Expected: The Python backend can read files from the sandbox via `files.collect_outputs()` and upload them to R2 using the existing storage abstraction. No direct network path from sandbox container to R2 is needed.

### Test 6: Latency under 10ms for API calls (GCP to Hetzner)

```bash
# From GCP Cloud Run (Singapore region) to Hetzner (Singapore)
for i in $(seq 1 10); do
  curl -sf -o /dev/null \
    -H "X-API-Key: ${OPENSANDBOX_API_KEY}" \
    -w "%{time_total}\n" \
    https://sandbox.smartaihub.app/health
done
```

Expected: Median response time under 10ms. Both GCP and Hetzner are in the Singapore region, so network latency should be minimal. If latency exceeds 10ms consistently, investigate DNS resolution caching, TLS session resumption, and HTTP keepalive settings.

### Test 7: Docker Compose file validates (local pre-deployment check)

```bash
cd /home/dev/projects/SmartSpecPro
docker compose -f scripts/hetzner-sandbox/docker-compose.hetzner-sandbox.yml config
```

Expected: YAML parses without errors. Exit code 0.

### Test 8: Nginx config validates (local pre-deployment check)

```bash
docker run --rm \
  -v /home/dev/projects/SmartSpecPro/scripts/hetzner-sandbox/nginx-sandbox.conf:/etc/nginx/conf.d/sandbox.conf:ro \
  nginx:alpine nginx -t
```

Expected: `nginx: configuration file /etc/nginx/nginx.conf test is successful`. This validates the Nginx config syntax before deploying to Hetzner.

### Test 9: Setup script is idempotent

Running the setup script a second time on the same server should not break anything:

```bash
ssh root@<hetzner-ip> "bash /opt/opensandbox/setup-hetzner-sandbox.sh"
# Run again:
ssh root@<hetzner-ip> "bash /opt/opensandbox/setup-hetzner-sandbox.sh"
```

Expected: Second run completes without errors. Services remain running. No duplicate firewall rules. No duplicate cron entries.

## Implementation Details

### 1. Server Provisioning (Manual via Hetzner Cloud Console or hcloud CLI)

The Hetzner CPX31 server is provisioned manually (or via `hcloud` CLI). This is a one-time step, not automated in the setup script.

**Hetzner CPX31 specifications**:
- 4 shared vCPU (AMD EPYC)
- 8 GB RAM
- 160 GB NVMe SSD
- Location: Singapore (`sgp1`)
- OS: Ubuntu 22.04 LTS
- Cost: approximately $16/month

**hcloud CLI provisioning example** (for reference, not part of the setup script):

```bash
hcloud server create \
  --name opensandbox-prod \
  --type cpx31 \
  --location sgp1 \
  --image ubuntu-22.04 \
  --ssh-key <your-ssh-key-name>
```

After provisioning, point the DNS A record for `sandbox.smartaihub.app` to the server's public IP address. DNS propagation must complete before running the setup script (Let's Encrypt needs to resolve the domain).

### 2. Create the Setup Script

**File**: `/home/dev/projects/SmartSpecPro/scripts/setup-hetzner-sandbox.sh`

This is an idempotent bash script that configures a fresh Ubuntu 22.04 server to run OpenSandbox. It is designed to be copied to the Hetzner server and run as root.

The script performs these steps in order:

**Step 1: System update and hardening**
- `apt update && apt upgrade -y`
- Install essential packages: `curl`, `ca-certificates`, `gnupg`, `ufw`, `fail2ban`, `unattended-upgrades`, `jq`, `htop`
- Configure `unattended-upgrades` for automatic security updates
- Disable password authentication in `/etc/ssh/sshd_config` (SSH key-only access)
- Restart sshd

**Step 2: Docker installation**
- Add Docker's official GPG key and repository
- Install `docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-compose-plugin`
- Enable and start Docker service
- Verify Docker is running: `docker info`

**Step 3: Firewall configuration (UFW)**
- `ufw default deny incoming`
- `ufw default allow outgoing`
- Allow SSH from admin IPs only: `ufw allow from <ADMIN_IP_1>/32 to any port 22 proto tcp`
- Allow HTTPS from GCP Cloud Run egress IP ranges: `ufw allow from <GCP_CIDR_1> to any port 443 proto tcp` (repeat for each CIDR)
- Allow HTTP port 80 for Let's Encrypt ACME HTTP-01 challenge: `ufw allow 80/tcp` (can be restricted further after initial cert issuance if using DNS-01 instead)
- Enable UFW: `ufw --force enable`

The script should accept GCP egress IPs and admin SSH IPs as variables at the top of the file (or as command-line arguments). The GCP Cloud Run egress IPs for the `asia-southeast1` region should be documented. Since GCP Cloud Run uses a range of egress IPs that can change, the recommended approach is to use a Cloud NAT with a static IP for the Python backend's outbound traffic, then whitelist only that static IP on Hetzner.

**Step 4: Docker network creation**
- Create the internal execution network: `docker network create --internal sandbox-exec`
- This network has no external connectivity. Sandbox containers attached to it cannot reach the internet, the host, or any other Docker network.

**Step 5: Docker Compose deployment**
- Copy the `docker-compose.hetzner-sandbox.yml` file to `/opt/opensandbox/`
- Run `docker compose -f /opt/opensandbox/docker-compose.hetzner-sandbox.yml up -d`

**Step 6: Nginx + TLS (Let's Encrypt)**
- Install Nginx: `apt install -y nginx`
- Install Certbot: `apt install -y certbot python3-certbot-nginx`
- Copy the Nginx config for `sandbox.smartaihub.app` to `/etc/nginx/sites-available/sandbox`
- Symlink to `/etc/nginx/sites-enabled/`
- Obtain TLS certificate: `certbot --nginx -d sandbox.smartaihub.app --non-interactive --agree-tos -m <admin-email>`
- Certbot automatically modifies the Nginx config to add SSL directives
- Set up auto-renewal: `systemctl enable certbot.timer` (already enabled by default on Ubuntu)

**Step 7: systemd service for OpenSandbox**
- Copy `opensandbox.service` to `/etc/systemd/system/`
- `systemctl daemon-reload`
- `systemctl enable opensandbox.service`
- `systemctl start opensandbox.service`

**Step 8: Log rotation**
- Configure logrotate for OpenSandbox Docker logs: `/etc/logrotate.d/opensandbox`
- Rotate daily, keep 14 days, compress after 1 day
- Docker daemon log rotation via `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  }
}
```

**Step 9: Health check verification**
- Wait for services to start (up to 60 seconds)
- Test the health endpoint: `curl -sf http://localhost:8080/health`
- Test Nginx proxy: `curl -sf http://localhost/health`
- Print summary of installed services and their status

### 3. Create the Hetzner Docker Compose File

**File**: `/home/dev/projects/SmartSpecPro/scripts/hetzner-sandbox/docker-compose.hetzner-sandbox.yml`

This is a simplified version of the localhost `docker-compose.opensandbox.yml` tailored for the production Hetzner server. Key differences from the localhost version:

- No port mapping to `127.0.0.1:8080` -- Nginx proxies to the container via Docker network
- Environment variables for production configuration
- Higher resource limits (the full CPX31 capacity)
- No Docker socket volume mount exposed to external networks

The compose file defines:

**opensandbox-server** service:
- Image: `registry.cn-hangzhou.aliyuncs.com/opensandbox/server:latest`
- Expose port 8080 to the Docker bridge (NOT to host network -- Nginx handles external access)
- Volume: Docker socket mounted read-only
- Environment variables: `OPENSANDBOX_API_KEY`, `OPENSANDBOX_RUNTIME=docker`, `OPENSANDBOX_DOCKER_NETWORK=sandbox-exec`, `OPENSANDBOX_DEFAULT_TIMEOUT=600`, `OPENSANDBOX_MAX_SANDBOXES=20`
- Resource limits: 3 CPUs, 6 GB memory (leaving headroom for Nginx, OS, and sandbox containers)
- Restart policy: `unless-stopped`
- Network: `opensandbox-network` (bridge)
- Healthcheck: `curl -sf http://localhost:8080/health` every 30 seconds

**Networks**:
- `opensandbox-network`: Bridge network for API communication (Nginx to OpenSandbox server)
- `sandbox-exec`: External reference to the internal network created by the setup script. This network is where sandbox containers run with no internet access.

The environment variables should be loaded from an `.env` file at `/opt/opensandbox/.env` which is NOT committed to source control. The `.env` file contains:

```
OPENSANDBOX_API_KEY=<production-api-key>
```

### 4. Create the Nginx Configuration

**File**: `/home/dev/projects/SmartSpecPro/scripts/hetzner-sandbox/nginx-sandbox.conf`

This Nginx server block handles TLS termination and reverse-proxies to the OpenSandbox server container. It includes API key validation at the Nginx level for defense-in-depth.

The configuration should define:

**HTTP server (port 80)**:
- Redirect all traffic to HTTPS (301)
- Exception: `/.well-known/acme-challenge/` location for Let's Encrypt HTTP-01 validation

**HTTPS server (port 443)**:
- `server_name sandbox.smartaihub.app`
- SSL certificate paths (managed by Certbot)
- TLS 1.2 and 1.3 only
- Strong cipher suite

**Locations**:
- `/health` -- Proxy to OpenSandbox server, no API key required (used by uptime monitors)
- `/api/` -- Proxy to OpenSandbox server. Validate `X-API-Key` header matches the expected value. Return 401 if missing or invalid. This is defense-in-depth; the OpenSandbox server itself also validates the API key.
- All other paths -- Return 404

**Proxy settings**:
- `proxy_pass http://opensandbox-server:8080` (using Docker network DNS)
- Standard proxy headers (`Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`)
- Extended timeouts for sandbox creation (120s connect, 600s read for long-running operations)
- Request body size limit: 100M (for file staging)

**API key validation at Nginx** (defense-in-depth):

```nginx
location /api/ {
    # Defense-in-depth: validate API key at Nginx level
    if ($http_x_api_key != "EXPECTED_API_KEY_PLACEHOLDER") {
        return 401 '{"error": "unauthorized"}';
    }

    proxy_pass http://opensandbox-server:8080;
    # ... proxy headers and timeouts ...
}
```

Note: The placeholder `EXPECTED_API_KEY_PLACEHOLDER` is replaced by the setup script with the actual API key value during deployment. The API key must NOT be committed to source control.

### 5. Create the systemd Service File

**File**: `/home/dev/projects/SmartSpecPro/scripts/hetzner-sandbox/opensandbox.service`

This systemd unit ensures the OpenSandbox Docker Compose stack starts on boot and restarts on failure. It follows the same patterns as the existing SmartSpecPro systemd services (`smartspec-backend.service`, `smartspec-web.service`).

Key properties:
- `Type=oneshot` with `RemainAfterExit=yes` (Docker Compose manages the actual processes)
- `ExecStart=/usr/bin/docker compose -f /opt/opensandbox/docker-compose.hetzner-sandbox.yml up -d`
- `ExecStop=/usr/bin/docker compose -f /opt/opensandbox/docker-compose.hetzner-sandbox.yml down`
- `After=docker.service`
- `Requires=docker.service`
- Restart policy: `on-failure` with 10-second delay

### 6. Create the Connectivity Verification Script

**File**: `/home/dev/projects/SmartSpecPro/scripts/hetzner-sandbox/verify-connectivity.sh`

This script runs the full connectivity test matrix after deployment. It is designed to be run from the GCP environment (or any machine with the correct network path to Hetzner).

The verification tests:

1. **HTTPS connectivity**: `curl -sf https://sandbox.smartaihub.app/health` -- confirms TLS, DNS, firewall, Nginx, and OpenSandbox container are all working
2. **API key authentication**: `curl -sf -H "X-API-Key: ${OPENSANDBOX_API_KEY}" https://sandbox.smartaihub.app/api/v1/sandboxes` -- confirms API key validation works
3. **Sandbox creation round-trip**: Create a sandbox, run a simple command (`echo hello`), collect output, destroy sandbox -- confirms the full lifecycle works end-to-end
4. **Latency measurement**: 10 sequential health check requests with timing -- confirms sub-10ms latency
5. **TLS certificate validation**: Check certificate chain, expiry, and subject
6. **Firewall verification**: Attempt connection from a non-whitelisted IP (requires a second machine or VPN) -- confirms firewall blocks unauthorized access

The script outputs a summary report with PASS/FAIL for each test and overall status.

### 7. Create the README

**File**: `/home/dev/projects/SmartSpecPro/scripts/hetzner-sandbox/README.md`

Documentation for the Hetzner sandbox setup, including:

- Prerequisites (Hetzner account, DNS record, SSH key)
- Step-by-step deployment instructions
- How to update the OpenSandbox server image
- How to rotate the API key
- How to add/remove GCP egress IPs from the firewall
- Monitoring and alerting configuration
- Troubleshooting common issues
- How to tear down the server

### 8. Security Hardening Summary

The following security measures are applied by the setup script:

| Measure | Implementation | Purpose |
|---------|---------------|---------|
| SSH key-only | Disable `PasswordAuthentication` in sshd_config | Prevent brute-force SSH attacks |
| UFW firewall | Default deny, whitelist GCP + admin IPs | Network-level access control |
| TLS 1.2+ only | Nginx `ssl_protocols TLSv1.2 TLSv1.3` | Encrypt all traffic |
| API key at Nginx | `X-API-Key` header validation | Defense-in-depth before OpenSandbox |
| fail2ban | Auto-ban IPs with repeated failed attempts | Mitigate scanning/brute-force |
| unattended-upgrades | Automatic security patches | Keep OS patched |
| Docker log rotation | `max-size: 50m, max-file: 5` | Prevent disk exhaustion |
| No tenant secrets on Hetzner | Only `OPENSANDBOX_API_KEY` stored | Minimize blast radius |
| Internal Docker network | `sandbox-exec` with `--internal` flag | Sandbox containers cannot reach internet |
| Docker socket isolation | Only opensandbox-server has socket access | Limit Docker API exposure |

### 9. Monitoring Setup

The monitoring strategy uses lightweight, zero-dependency checks that can be driven from the existing GCP infrastructure.

**Health check endpoint**: `https://sandbox.smartaihub.app/health`
- Checked by: GCP Cloud Monitoring (uptime check) or external service (e.g., UptimeRobot, Healthchecks.io)
- Frequency: Every 60 seconds
- Alert: If health check fails for more than 1 consecutive minute

**Disk usage monitoring**: A cron job on the Hetzner server that checks disk usage and logs a warning if it exceeds 80%.

```bash
# /etc/cron.d/opensandbox-disk-check
*/5 * * * * root df -h / | awk 'NR==2 {gsub(/%/,"",$5); if ($5 > 80) print "DISK_WARNING: " $5 "% used"}' >> /var/log/opensandbox/disk-alerts.log
```

**Docker daemon health**: The systemd service healthcheck and Docker's built-in container health checks provide daemon-level monitoring. If the OpenSandbox container becomes unhealthy, Docker will log it and the health endpoint will fail, triggering the uptime alert.

**Container count monitoring**: A cron job that logs the number of active sandbox containers. Useful for capacity planning and detecting runaway sandbox creation.

```bash
# /etc/cron.d/opensandbox-container-count
* * * * * root echo "$(date -Iseconds) containers=$(docker ps --filter 'network=sandbox-exec' -q | wc -l)" >> /var/log/opensandbox/container-count.log
```

### 10. GCP Connectivity Architecture

The production data flow for sandbox operations:

```
Client Browser
      |
      v
GCP Cloud Run (Node.js/tRPC) -- control plane
      |
      v
GCP Cloud Run (Python FastAPI) -- orchestrator
      |
      | HTTPS (port 443)
      | X-API-Key header
      v
Hetzner CPX31 (Singapore)
  Nginx (TLS termination)
      |
      v
  OpenSandbox Server (:8080)
      |
      v
  Sandbox Containers (sandbox-exec network)
      |
      | (no internet access)
      v
  [isolated execution]
```

Artifact flow (file transfer):
1. Python backend on GCP generates signed R2 URLs
2. Python backend stages input files into sandbox via OpenSandbox Filesystem API
3. Sandbox executes workload (no network needed for artifact transfer)
4. Python backend collects output files from sandbox via OpenSandbox Filesystem API
5. Python backend uploads outputs to R2 using signed URLs
6. Node.js backend generates client-facing signed URLs for artifact access

The sandbox containers themselves never need internet access. All file transfer is mediated by the Python backend through the OpenSandbox API.

### 11. Rollback Procedure

If the Hetzner server needs to be taken offline (maintenance, security incident, or failure):

1. Set `OPENSANDBOX_ENABLED=false` in the Python backend environment (section 11 feature flags)
2. All workloads automatically fall back to the legacy subprocess path (when `DISPATCH_MODE=optional`)
3. No data loss -- sandbox jobs in progress will fail and can be retried via legacy path
4. The Hetzner server can be destroyed and reprovisioned from scratch using the setup script

## Dependencies on Other Sections

- **Section 01 (Docker Foundation)**: The localhost `docker-compose.opensandbox.yml` provides the reference configuration. The Hetzner compose file is a production variant of the same setup.
- **Section 03 (Python SDK Client)**: The Python SDK client's `OPENSANDBOX_BASE_URL` must be set to `https://sandbox.smartaihub.app` for production. Config changes are covered in section 11.
- **Section 06 (Media Pipeline Migration)**: Must be complete so sandbox jobs can actually execute on the Hetzner server. The setup script is infrastructure-only, but end-to-end verification requires working sandbox dispatch.
- **Section 11 (Config and Feature Flags)**: Production environment variables (`OPENSANDBOX_BASE_URL`, `OPENSANDBOX_API_KEY`) are defined in section 11. This section creates the server that those variables point to.
- **Section 12 (Production Hardening)**: The chaos testing scenarios in section 12 include Hetzner-specific tests (server restart, network flap). This section provides the infrastructure those tests run against.

---

## Implementation Status: COMPLETE

Implemented on 2026-02-27. All infrastructure scripts and configuration files have been created.

### Files Created

| File | Description |
|------|-------------|
| `/home/dev/projects/SmartSpecPro/scripts/setup-hetzner-sandbox.sh` | Idempotent server provisioning script (9 steps: system hardening, Docker, UFW firewall, sandbox-exec network, Docker Compose deploy, Nginx + Let's Encrypt TLS, systemd service, log rotation, health verification) |
| `/home/dev/projects/SmartSpecPro/scripts/hetzner-sandbox/docker-compose.hetzner-sandbox.yml` | Production Docker Compose stack — no host port mapping, higher resource limits (3 CPU / 6 GB), env_file reference, sandbox-exec as external network |
| `/home/dev/projects/SmartSpecPro/scripts/hetzner-sandbox/nginx-sandbox.conf` | Nginx TLS termination config — TLS 1.2/1.3, strong ciphers, `/health` (no auth), `/api/` (X-API-Key validation + EXPECTED_API_KEY_PLACEHOLDER substituted at deploy time), rate limiting, 100 MB body limit, 600s proxy read timeout |
| `/home/dev/projects/SmartSpecPro/scripts/hetzner-sandbox/opensandbox.service` | systemd unit (Type=oneshot + RemainAfterExit=yes) — starts/stops Docker Compose stack, Restart=on-failure with backoff, EnvironmentFile=/opt/opensandbox/.env |
| `/home/dev/projects/SmartSpecPro/scripts/hetzner-sandbox/verify-connectivity.sh` | Post-deployment connectivity verification — 6 tests: HTTPS health (200), TLS cert validity + expiry, API key auth (401 without key / 401 wrong key / pass-through with correct key), sandbox creation round-trip, latency measurement (10 requests, median vs 10ms target), HTTP→HTTPS redirect |
| `/home/dev/projects/SmartSpecPro/scripts/hetzner-sandbox/README.md` | Full operational documentation — prerequisites, step-by-step deployment, image updates, API key rotation, firewall management, monitoring, troubleshooting, teardown procedure |

### Design Decisions

- **API key substitution**: `nginx-sandbox.conf` uses the literal string `EXPECTED_API_KEY_PLACEHOLDER`. The setup script performs a `sed` substitution with the real `OPENSANDBOX_API_KEY` value during deployment so no secret is committed to source control.
- **Nginx uses Docker DNS** (`proxy_pass http://opensandbox-server:8080`) — the opensandbox-server container is on the `opensandbox-network` bridge which Nginx can reach via the Docker bridge gateway. This avoids host port mapping on 8080.
- **sandbox-exec as external network** — the Docker Compose file declares `sandbox-exec` as `external: true`. The network is created with `--internal` by `setup-hetzner-sandbox.sh` (step 4) before Docker Compose starts, ensuring sandbox containers have no internet access.
- **Idempotency** — every step guards against re-running: Docker is skipped if already running, UFW rules are reset before re-applying, Certbot uses `renew` if the cert exists, the systemd unit is only started if not already active.
- **No hardcoded IPs or domains** — all values come from environment variables (`SANDBOX_DOMAIN`, `ADMIN_SSH_IPS`, `GCP_EGRESS_IPS`, `OPENSANDBOX_API_KEY`, `ADMIN_EMAIL`) with safe defaults and clear warnings when production values are missing.