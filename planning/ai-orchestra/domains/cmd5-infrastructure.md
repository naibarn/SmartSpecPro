# CMD-5: Infrastructure Engineer — Domain Knowledge

## Ownership
- `docker-compose*.yml` (5 variants)
- `nginx/` (reverse proxy, SSL, rate limiting)
- `scripts/` (backup, monitoring, deployment)
- `control-plane/` (management service)
- `apps/tauri-shell/` (desktop app wrapper)

## Docker Architecture

### Compose File Variants
| File | Purpose | Use Case |
|------|---------|----------|
| `docker-compose.yml` | Base infrastructure | PostgreSQL, Redis, ChromaDB |
| `docker-compose.full.yml` | Full production | All services (Web, Backend, Control Plane, Docker Status) |
| `docker-compose.nginx.yml` | Production with proxy | Full stack + Nginx entry point (ports 80/443) |
| `docker-compose.media.yml` | Media workers | Celery workers (media + video), Beat scheduler, Flower |
| `docker-compose.dev.yml` | Development | All services + PgAdmin + Redis Commander |

### Service Map
```
Infrastructure:
  postgres:5432 (smartspec/smartspec123/smartspecpro, healthcheck: pg_isready)
  redis:6379 (healthcheck: redis-cli ping)
  chromadb:8001→8000 (IS_PERSISTENT=TRUE, vector store for RAG)

Applications:
  smartspec-web:3000 (Node.js, depends: postgres, redis, python-backend)
  python-backend:8000 (FastAPI, depends: postgres, redis, chromadb)
  docker-status:3001 (Docker monitoring, mounts /var/run/docker.sock)
  control-plane:7070 (Fastify+Prisma, session/task/artifact management)

Media Workers (separate compose):
  celery-media (queue: media, concurrency: 4, CPU: 2.0, RAM: 3GB)
  celery-video (queue: video, concurrency: 2, CPU: 4.0, RAM: 8GB)
  celery-beat (periodic scheduler, single instance)
  flower:5555 (Celery monitoring dashboard)

Reverse Proxy:
  nginx:80/443 (SSL termination, upstream routing, rate limiting)

Optional (profile: tools):
  pgadmin:5050 (PostgreSQL web admin)
  redis-commander:8081 (Redis web admin)
```

### Startup Order
1. postgres, redis, chromadb (infrastructure, no dependencies)
2. python-backend (waits for postgres + redis healthy)
3. smartspec-web (waits for postgres + redis + python-backend healthy)
4. docker-status, control-plane (waits for postgres)
5. nginx (waits for smartspec-web + python-backend)

## Nginx Configuration

### Performance
- `worker_processes auto`, `worker_connections 1024`, `use epoll`
- `sendfile on`, `tcp_nopush on`, `tcp_nodelay on`
- gzip level 6 for text/css/json/js/svg
- `client_max_body_size 100MB` (large uploads)

### Rate Limiting Zones
- `api_limit`: 30 req/sec per IP (10MB zone)
- `web_limit`: 60 req/sec per IP (10MB zone)
- `conn_limit`: Connection limit per IP (10MB zone)

### SSL (TLS 1.2 + 1.3)
- Domains: smartaihub.app, smartspec.pro, smartspec.local
- Certs: `/etc/nginx/ssl/smartaihub.app.crt/.key`
- HSTS: 1 year, includeSubDomains

### Routing
| Location | Upstream | Notes |
|----------|----------|-------|
| `/trpc/` | smartspec_web | Streaming, no buffering |
| `/api/` | smartspec_web | Standard buffering |
| `/` | smartspec_web | WebSocket for Vite HMR |
| `docker.*` subdomain | docker_status | Cookie forwarding for SSO |

### Security Headers
```
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
X-XSS-Protection: 1; mode=block
HSTS: max-age=31536000; includeSubDomains
Referrer-Policy: strict-origin-when-cross-origin
```

## Production Scripts

### backup-prod.sh
- `pg_dump | gzip` → `./backups/postgres/pg_backup_*.sql.gz`
- 7-day retention, auto-cleanup

### logs-prod.sh
- Service aliases: backend, web, db, redis, chroma, control, docker-status, all
- Options: `--tail N`, `--follow`
- Auto-detects docker compose v1/v2

### restart-prod.sh
- Per-service or all-service restart
- Shows docker ps status after restart

### alert-monitor.sh
- HTTP health checks: Web:3000, Backend:8000, Control:7070
- TCP checks: PostgreSQL:5432, Redis:6379
- Discord/Slack webhook alerts
- Modes: once (single check) or daemon (5-min interval)

## Control Plane

**Framework:** Fastify + Prisma (PostgreSQL)
**Port:** 7070

**Purpose:**
- Project/Session/Iteration management
- Task Registry with deterministic dedup
- Reports & Artifacts (R2/S3 presigned URLs)
- Test/Coverage/Security result intake
- Gate evaluator (tasks → tests → coverage → security → approval)
- Approval tokens (scoped, one-time use, audited)

**Auth:** API key → scoped JWT minting (server-to-server)

## Tauri Desktop

**App:** `com.smartspec.pro`, 1400x900 default, 900x600 minimum
**Dev:** Connects to localhost:3000 (web dev server)
**Prod:** Serves from `apps/web/dist/public/`
**Bundled:** FFmpeg + FFprobe binaries
**CSP:** Strict (self + WASM + inline styles + HTTPS/WSS)

## Environment Config Flow
```
.env.example (template)
  → .env (not committed, contains secrets)
  → docker-compose.yml environment: (injects into containers)
  → app reads from process.env / Pydantic Settings
```

## Common Operations

```bash
# Local dev (Docker infra + host apps)
./dev-local.sh start    # Start PostgreSQL/Redis/ChromaDB
./dev-local.sh web      # Start web app (terminal 1)
./dev-local.sh backend  # Start Python backend (terminal 2)

# Full Docker
docker compose -f docker-compose.full.yml up -d
docker compose -f docker-compose.media.yml up -d

# Production with Nginx
docker compose -f docker-compose.nginx.yml up -d

# Monitoring
./scripts/alert-monitor.sh daemon
./scripts/logs-prod.sh backend --follow
```
