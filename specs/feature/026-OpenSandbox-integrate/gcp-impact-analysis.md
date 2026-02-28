# OpenSandbox + GCP Migration Impact Analysis (Revised)

Date: 2026-02-26
Revision: 2 — Localhost Docker + Hetzner Production
Related: specs/feature/011-DeployPlan/, specs/feature/026-OpenSandbox-integrate/spec.md

---

## Revised Architecture: Two-Environment Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    LOCALHOST (Development)                       │
│                                                                  │
│  systemd                          Docker                         │
│  ├─ smartspec-backend :8000       ├─ postgres :5432              │
│  └─ smartspec-web :3000           ├─ redis :6379                 │
│                                   ├─ chromadb :8001              │
│  screen                           ├─ celery-media                │
│  └─ docker-status :3001           ├─ celery-video                │
│                                   ├─ celery-import               │
│  Docker (Nginx)                   ├─ flower :5555                │
│  └─ nginx :80/:443               │                              │
│                                   │  ┌──────────────────────┐   │
│                                   ├──│ opensandbox-server    │   │
│                                   │  │ :8080                 │   │
│                                   │  │ (opensandbox-network) │   │
│                                   │  └──────┬───────────────┘   │
│                                   │         │ creates            │
│                                   │    ┌────┴────┐               │
│                                   │    │ sandbox │ (ephemeral)   │
│                                   │    │ containers              │
│                                   │    └─────────┘               │
│                                   └──────────────────────────────│
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    PRODUCTION (GCP + Hetzner)                    │
│                                                                  │
│  GCP Cloud Run (asia-southeast1)     Hetzner Cloud (Singapore)  │
│  ├─ node-api                         ├─ OpenSandbox Server      │
│  ├─ python-orchestrator ──HTTPS──────►  :8080                   │
│  └─ video-job-runner (Cloud Run Job)  │  (Docker bridge mode)   │
│                                       │                          │
│  GCP Managed Services                │  ┌────────────────────┐  │
│  ├─ Cloud SQL (PostgreSQL)           │  │ sandbox containers │  │
│  ├─ Memorystore (Redis)             │  │ code / media /     │  │
│  ├─ Cloud Tasks (6 queues)          │  │ browser / file     │  │
│  ├─ Cloud Scheduler (12 jobs)       │  └────────────────────┘  │
│  ├─ Secret Manager                   │                          │
│  └─ Artifact Registry               │  Shared Storage           │
│                                      │  └─ S3/R2 (Cloudflare)  │
│  Cloudflare R2 (object storage)     │     ↑ upload/download    │
│  └── accessible from both ──────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Localhost (Development)

### Feasibility: HIGH — ทำได้เลย

#### Resource Availability

| Resource | Currently Used | Available for OpenSandbox |
|----------|---------------|--------------------------|
| **Port** | 3000,3001,5432,6379,8000,8001,5555,7070,80,443 | **8080** (or 8888) |
| **Memory** | 4 GB reserved / 18.5 GB peak | **4-8 GB** headroom |
| **CPU** | 0.5 reserved / 9 peak | **2-3 CPUs** available |
| **Network** | smartspec-network | New: **opensandbox-network** |
| **Disk** | ~3-5 GB volumes | **5-10 GB** for sandbox images |

#### Docker Compose File

**New file: `docker-compose.sandbox.yml`**

```yaml
# docker-compose.sandbox.yml
# OpenSandbox execution plane — separate from core services
# Start: docker compose -f docker-compose.sandbox.yml up -d
# Stop:  docker compose -f docker-compose.sandbox.yml down

services:
  opensandbox-server:
    image: registry.cn-hangzhou.aliyuncs.com/opensandbox/server:latest
    container_name: smartspec-opensandbox
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:8080"    # localhost only
    environment:
      - OPENSANDBOX_API_KEY=${OPENSANDBOX_API_KEY:-dev-sandbox-key-change-me}
      - OPENSANDBOX_RUNTIME=docker
      - OPENSANDBOX_DOCKER_NETWORK=opensandbox-exec
      - OPENSANDBOX_DEFAULT_TIMEOUT=600
      - OPENSANDBOX_MAX_SANDBOXES=10
      - LOG_LEVEL=info
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - opensandbox_data:/data
    networks:
      - opensandbox-network       # API accessible from python-backend
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 1G
        reservations:
          cpus: "0.25"
          memory: 256M
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s

networks:
  opensandbox-network:
    name: opensandbox-network
    driver: bridge
    # NOT internal — python-backend (host) needs to reach it
  opensandbox-exec:
    name: opensandbox-exec
    driver: bridge
    internal: true
    # internal — sandbox containers cannot reach host services

volumes:
  opensandbox_data:
    name: opensandbox_data
```

#### Network Isolation Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│  smartspec-network (existing)                                    │
│  ├─ postgres, redis, chromadb                                   │
│  ├─ celery-media, celery-video, celery-import                   │
│  └─ flower                                                       │
│       ↕ (host.docker.internal)                                   │
│  Python Backend (systemd, port 8000)                             │
│       │                                                          │
│       │ HTTP localhost:8080                                       │
│       ↓                                                          │
│  opensandbox-network                                             │
│  └─ opensandbox-server                                           │
│       │                                                          │
│       │ Docker API (creates containers)                          │
│       ↓                                                          │
│  opensandbox-exec (internal, isolated)                           │
│  └─ sandbox-abc123 (ephemeral)                                   │
│  └─ sandbox-def456 (ephemeral)                                   │
│       ↕ (NO access to smartspec-network)                         │
│       ↕ (NO access to postgres, redis, etc.)                     │
│       → (egress controlled by OpenSandbox)                       │
└─────────────────────────────────────────────────────────────────┘
```

**Key isolation**:
- `opensandbox-exec` is `internal: true` — sandbox containers CANNOT reach host services
- Sandbox containers are on a separate network from PostgreSQL/Redis
- OpenSandbox server controls egress per-sandbox
- Python backend reaches OpenSandbox via `localhost:8080` (port binding)

#### Integration with run-services.sh

Add OpenSandbox as step 7 (after media workers):

```bash
# In run-services.sh — add after media workers section:

start_opensandbox() {
    echo "Starting OpenSandbox..."
    docker compose -f docker-compose.sandbox.yml up -d
    wait_for_health "opensandbox" "http://localhost:8080/health" 30
}

stop_opensandbox() {
    echo "Stopping OpenSandbox..."
    docker compose -f docker-compose.sandbox.yml down
}
```

#### Environment Variables (python-backend/.env)

```bash
# OpenSandbox (localhost)
OPENSANDBOX_ENABLED=true
OPENSANDBOX_BASE_URL=http://localhost:8080
OPENSANDBOX_API_KEY=dev-sandbox-key-change-me
OPENSANDBOX_REQUEST_TIMEOUT_SECONDS=30
OPENSANDBOX_CREATE_TIMEOUT_SECONDS=120
```

#### Pre-Pull Sandbox Images

```bash
# Pre-pull base images for faster sandbox creation
docker pull registry.cn-hangzhou.aliyuncs.com/opensandbox/sandbox-python:latest
docker pull registry.cn-hangzhou.aliyuncs.com/opensandbox/sandbox-node:latest
# Add custom images as needed
```

---

## Part 2: Production (GCP + Hetzner)

### Feasibility: HIGH — ทำได้ มีข้อควรระวังเรื่อง latency

#### Why Hetzner?

| Factor | GCE VM | Hetzner Cloud |
|--------|--------|---------------|
| **Cost (4 vCPU, 8 GB)** | ~$70-100/month | ~€14.49/month (~$16) |
| **Cost (8 vCPU, 16 GB)** | ~$140-200/month | ~€28.49/month (~$31) |
| **Docker access** | Yes | Yes (full root) |
| **Singapore DC** | asia-southeast1 | **Singapore available** |
| **SLA** | 99.95% | 99.9% |
| **Bandwidth** | Egress charged | 20 TB included |

**Hetzner Singapore** → GCP asia-southeast1: **~1-5ms latency** (same city)

#### Hetzner Server Recommendation

| Workload Level | Server | Specs | Cost |
|---------------|--------|-------|------|
| **Light** (dev/staging) | CPX21 | 3 vCPU AMD, 4 GB, 80 GB | €7.49/mo |
| **Standard** (production) | CPX31 | 4 vCPU AMD, 8 GB, 160 GB | €14.49/mo |
| **Heavy** (media + browser) | CPX41 | 8 vCPU AMD, 16 GB, 240 GB | €28.49/mo |

#### Network Connectivity: GCP → Hetzner

**Option A: Direct HTTPS (Simple, Recommended)**

```
GCP Cloud Run (python-orchestrator)
  │
  │ HTTPS + API Key + IP Allowlist
  ↓
Hetzner Singapore (OpenSandbox :8080)
  │
  │ firewall: allow only GCP egress CIDRs
  ↓
OpenSandbox Server → sandbox containers
```

Setup:
1. OpenSandbox server listens on 0.0.0.0:8080 (or behind Nginx with TLS)
2. Hetzner firewall: allow TCP 8080 only from GCP Cloud Run egress IPs
3. API key authentication (OpenSandbox built-in)
4. TLS via Let's Encrypt (Nginx or Caddy on Hetzner)

**Option B: WireGuard VPN (More Secure)**

```
GCP Cloud Run → Cloud NAT → WireGuard → Hetzner VPN IP → OpenSandbox
```

- More complex to set up
- Better isolation (private network)
- Cloud Run serverless connector needed to reach VPN
- Recommended only if security requirements demand it

**Recommendation: Option A** — HTTPS with API key + firewall. Simpler, sufficient security.

#### Artifact Flow (File Transfer)

```
Input Files:
  1. User uploads → SmartSpecPro → Cloudflare R2
  2. Python orchestrator creates SandboxJob with input manifest
  3. OpenSandbox downloads files from R2 (signed URLs)

Output Files:
  1. Sandbox processes files
  2. OpenSandbox uploads results to R2 (signed URLs or API key)
  3. Python orchestrator reads artifacts from R2
  4. UI fetches results via signed URLs
```

**R2 is accessible from both GCP and Hetzner** — no special networking needed.

#### Hetzner Setup Script

```bash
#!/bin/bash
# scripts/setup-hetzner-sandbox.sh
# Run on Hetzner server after provisioning

set -euo pipefail

echo "=== SmartSpecPro OpenSandbox Server Setup ==="

# 1. Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# 2. Install Docker Compose
apt-get install -y docker-compose-plugin

# 3. Create app directory
mkdir -p /opt/opensandbox
cd /opt/opensandbox

# 4. Create docker-compose.yml
cat > docker-compose.yml << 'EOF'
services:
  opensandbox-server:
    image: registry.cn-hangzhou.aliyuncs.com/opensandbox/server:latest
    container_name: opensandbox-server
    restart: unless-stopped
    ports:
      - "0.0.0.0:8080:8080"
    environment:
      - OPENSANDBOX_API_KEY=${OPENSANDBOX_API_KEY}
      - OPENSANDBOX_RUNTIME=docker
      - OPENSANDBOX_DOCKER_NETWORK=sandbox-exec
      - OPENSANDBOX_DEFAULT_TIMEOUT=600
      - OPENSANDBOX_MAX_SANDBOXES=20
      - LOG_LEVEL=info
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - opensandbox_data:/data
    networks:
      - sandbox-api
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 2G

  # Optional: Nginx for TLS termination
  nginx:
    image: nginx:alpine
    container_name: opensandbox-nginx
    restart: unless-stopped
    ports:
      - "0.0.0.0:443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    networks:
      - sandbox-api
    depends_on:
      - opensandbox-server

networks:
  sandbox-api:
    driver: bridge
  sandbox-exec:
    driver: bridge
    internal: true

volumes:
  opensandbox_data:
EOF

# 5. Setup firewall (allow only GCP + SSH)
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
# GCP Cloud Run egress IPs (asia-southeast1)
# Replace with actual GCP NAT IPs
ufw allow from <GCP_NAT_IP>/32 to any port 443
ufw allow from <GCP_NAT_IP>/32 to any port 8080
ufw enable

# 6. Pre-pull sandbox images
docker pull registry.cn-hangzhou.aliyuncs.com/opensandbox/sandbox-python:latest
docker pull registry.cn-hangzhou.aliyuncs.com/opensandbox/sandbox-node:latest

# 7. Start
docker compose up -d

echo "=== OpenSandbox server running on :8080 ==="
echo "=== Configure TLS with certbot for production ==="
```

#### Environment Variables (python-backend — production)

```bash
# OpenSandbox (Hetzner production)
OPENSANDBOX_ENABLED=true
OPENSANDBOX_BASE_URL=https://sandbox.smartaihub.app  # Or direct IP with TLS
OPENSANDBOX_API_KEY=<stored-in-secret-manager>
OPENSANDBOX_REQUEST_TIMEOUT_SECONDS=30
OPENSANDBOX_CREATE_TIMEOUT_SECONDS=120
```

Store `OPENSANDBOX_API_KEY` in GCP Secret Manager alongside other secrets.

---

## Part 3: Comparison Summary

### Cost Comparison (Monthly)

| Component | Current | + OpenSandbox (Localhost) | + OpenSandbox (Hetzner Prod) |
|-----------|---------|--------------------------|------------------------------|
| GCP Cloud Run | est. $50-150 | $50-150 | $50-150 |
| GCP Managed Services | est. $30-50 | $30-50 | $30-50 |
| Hetzner CPX31 | — | — | **€14.49 (~$16)** |
| Cloudflare R2 | est. $5-15 | $5-15 | $5-15 |
| **Total** | **$85-215** | **$85-215** | **$101-231** |
| **OpenSandbox cost** | — | **$0** | **+$16/month** |

### Latency Impact

| Path | Latency | Impact |
|------|---------|--------|
| Localhost → OpenSandbox | <1ms | None |
| GCP asia-southeast1 → Hetzner Singapore | 1-5ms | Negligible |
| GCP asia-southeast1 → Hetzner Europe | 150-250ms | Noticeable, avoid |
| GCP → R2 → Hetzner (file transfer) | 50-200ms per file | Acceptable (async jobs) |

**Decision: Use Hetzner Singapore datacenter** for minimal latency.

### Migration Impact on GCP Plan (011-DeployPlan)

| GCP Component | Impact | Change Required |
|---------------|--------|-----------------|
| Cloud Run Services | **None** | No changes |
| Cloud Run Jobs | **None** | Still used for non-sandbox jobs |
| Cloud Tasks | **Minimal** | Add sandbox queue (optional) |
| Cloud Scheduler | **None** | No changes |
| Secret Manager | **Minimal** | Add OPENSANDBOX_API_KEY |
| Artifact Registry | **None** | Sandbox images on Hetzner |
| Monitoring | **Minimal** | Add Hetzner health check |
| CI/CD | **Minimal** | Add Hetzner deploy step |
| Database | **None** | sandbox_jobs table same DB |
| Bootstrap script | **Minimal** | Add Hetzner provisioning |

**Overall: GCP migration proceeds unchanged. Hetzner is additive.**

---

## Part 4: Implementation Sequence

### Step 1: Localhost First (Week 1-2)

```
1. Create docker-compose.sandbox.yml
2. Create python-backend/app/integrations/opensandbox/ adapter
3. Add sandbox_profiles + sandbox_jobs tables (Drizzle migration)
4. Add OPENSANDBOX_* env vars to python-backend/.env
5. Update run-services.sh to manage OpenSandbox
6. Migrate FFmpeg pipeline → sandbox (highest risk)
7. Test locally
```

### Step 2: Backend Abstraction (Week 3)

```python
# SandboxBackend protocol — works with both Docker and Hetzner
class SandboxBackend(Protocol):
    async def create_job(self, req: SandboxJobRequest) -> SandboxJob: ...
    async def get_status(self, job_id: str) -> JobStatus: ...
    async def stage_files(self, job_id: str, files: list[FileManifest]) -> None: ...
    async def execute(self, job_id: str, command: str) -> ExecutionResult: ...
    async def collect_artifacts(self, job_id: str) -> list[Artifact]: ...
    async def destroy(self, job_id: str) -> None: ...

# LocalDockerBackend — for localhost development
class LocalDockerBackend(SandboxBackend):
    """Calls OpenSandbox at localhost:8080"""
    base_url = "http://localhost:8080"

# HetznerBackend — for production
class HetznerBackend(SandboxBackend):
    """Calls OpenSandbox at Hetzner via HTTPS"""
    base_url = "https://sandbox.smartaihub.app"
```

Both backends use the same OpenSandbox API — only the URL differs.

### Step 3: Hetzner Setup (Week 4, parallel with GCP migration)

```
1. Provision Hetzner CPX31 in Singapore
2. Run setup-hetzner-sandbox.sh
3. Configure TLS (Let's Encrypt)
4. Configure firewall (GCP IPs only)
5. Add OPENSANDBOX_BASE_URL to GCP Secret Manager
6. Test from Cloud Run → Hetzner
```

### Step 4: Migrate Workloads (Week 5-8)

```
Phase 1: FFmpeg media pipeline (already done in Step 1)
Phase 2: Skill Python runner + workflow code nodes
Phase 3: Document parsing + presentation export
Phase 4: Browser automation (if needed)
```

### Step 5: Production Hardening (Week 9-10)

```
1. Hetzner monitoring (Uptime Kuma or similar)
2. Auto-restart on failure (systemd + Docker restart policy)
3. Backup sandbox profiles (DB)
4. Set OPENSANDBOX_DISPATCH_MODE=required
5. Remove legacy subprocess paths
```

---

## Part 5: Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Hetzner Singapore outage | Low | Sandbox jobs fail, core services unaffected | Health check + alert; fallback to Cloud Run Jobs |
| Network between GCP ↔ Hetzner down | Low | Sandbox jobs queued/fail | Retry policy; Cloud Tasks handles backpressure |
| Hetzner Docker daemon issues | Low | All sandbox jobs fail | Remote monitoring; auto-restart; manual SSH access |
| OpenSandbox API breaking change | Medium | Adapter needs update | Pin image version; test in staging first |
| Sandbox escape (container breakout) | Very Low | Hetzner host compromised | Separate server; no credentials on Hetzner; firewall |
| Cost overrun (many sandboxes) | Low | Higher Hetzner bill | Max concurrent limits; budget alerts |

### Failure Handling

```
If Hetzner is DOWN:
  1. SandboxBackend.create_job() → timeout after 30s
  2. SandboxJob status = "provisioning_failed"
  3. Retry via Cloud Tasks (3 attempts, exponential backoff)
  4. If still failing → mark job as "failed"
  5. Alert admin via existing audit/monitoring
  6. Core services continue normally (chat, CRUD, LLM calls unaffected)
```

---

## Decision Summary

| Question | Answer |
|----------|--------|
| Localhost ใช้ Docker แยกได้ไหม? | **ได้** — docker-compose.sandbox.yml แยก network |
| ซ้ำซ้อนกับ Docker ตัวอื่นไหม? | **ไม่** — network แยก (opensandbox-network + opensandbox-exec) |
| Port ชนไหม? | **ไม่** — ใช้ 8080 (ว่างอยู่) |
| ย้ายไป GCP แล้วใช้ Hetzner ได้ไหม? | **ได้** — เปลี่ยนแค่ URL (localhost → Hetzner HTTPS) |
| Latency เท่าไหร? | **1-5ms** (Hetzner Singapore → GCP Singapore) |
| ค่าใช้จ่ายเพิ่มเท่าไหร? | **~$16/month** (Hetzner CPX31) |
| กระทบ GCP migration plan ไหม? | **ไม่กระทบ** — Hetzner เป็น additive |
| ถ้า Hetzner ล่ม? | Core services ทำงานปกติ, sandbox jobs fail + retry |
