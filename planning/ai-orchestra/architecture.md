# AI Orchestra Agents - Architecture & Specification

## Overview

AI Orchestra is a multi-level agent coordination system designed specifically for SmartSpecPro development. It provides structured, parallel, domain-aware assistance for planning, debugging, implementation, and system design.

## Architecture: 3-Level Hierarchy

```
Level 0: CONDUCTOR (Main Claude Instance)
  Receives requests, analyzes scope, delegates to specialists, coordinates results

Level 1: DOMAIN COMMANDERS (8 Specialist Agents)
  Each owns a domain, has deep context, can spawn sub-agents

Level 2: TACTICAL AGENTS (Spawned on-demand)
  Focused single-task agents for implementation, testing, analysis
```

---

## Level 0: Conductor

The main Claude Code instance acts as the orchestra conductor. It:

1. **Receives** user requests (bugs, features, questions, refactoring)
2. **Classifies** the request into domains and complexity levels
3. **Decomposes** complex requests into parallel work streams
4. **Delegates** to Domain Commanders using the Task tool
5. **Synthesizes** results from multiple agents
6. **Validates** that all changes are consistent across domains
7. **Reports** progress and results to the user

### Decision Matrix

| Request Type | Complexity | Action |
|---|---|---|
| Single-file bug fix | Low | Handle directly (no agents) |
| Multi-file bug | Medium | Spawn Debug Detective + relevant Domain Commander |
| New feature | High | Spawn parallel analysis agents, then implementation agents |
| System design | High | Spawn Architecture Council (parallel commanders) |
| Performance issue | Medium-High | Spawn Debug Detective + Performance Analyzer |
| Security concern | High | Spawn Security Auditor + affected domain commanders |
| Refactoring | Medium | Spawn affected Domain Commanders in parallel |

---

## Level 1: Domain Commanders

### CMD-1: Frontend Architect

**Domain:** React UI, client-side state, routing, video editor, components

**Context Files:**
- `apps/web/client/src/` (all 74 pages, 112+ components)
- `packages/ui/` (58 Radix UI components)
- `apps/web/client/src/index.css` (global styles, TailwindCSS)
- `apps/web/client/src/App.tsx` (routing)
- `apps/web/client/src/contexts/` (Auth, Tenant, Theme)

**Specializations:**
- React 19, Vite 7, TailwindCSS 4, Radix UI
- Wouter routing, TanStack Query state management
- Video editor (Phase 3): Timeline, PreviewPlayer, MediaLibraryPanel, TextClipEditor
- tRPC client hooks (`trpc.router.procedure.useQuery()`)
- Framer Motion animations, CVA variants
- Responsive design, accessibility (ARIA)

**Sub-agents it can spawn:**
- Component Builder (create/modify specific React components)
- CSS Debugger (layout, styling, CSS-in-JS issues)
- Video Editor Specialist (timeline, preview, export pipeline)
- Accessibility Auditor (ARIA, keyboard nav, screen readers)

---

### CMD-2: Backend Architect (Node.js)

**Domain:** Express, tRPC, server services, API design, auth

**Context Files:**
- `apps/web/server/` (32 routers, 39 services)
- `apps/web/server/_core/` (server entry, tRPC context, env, SDK)
- `apps/web/server/routers/` (chat, media, skills, llmProviders, etc.)
- `apps/web/server/services/` (llmRouter, creditService, skillExecutor, etc.)
- `apps/web/server/middleware/` (auth, rate limiting)
- `apps/web/shared/` (types, constants, validation)

**Specializations:**
- Express 4 middleware chain, tRPC 11 procedures
- JWT auth (jose), session cookies
- BullMQ job queues, IORedis caching
- Zod input validation, error handling
- OpenAI-compatible gateway (`llmRoutes.ts`, `openaiCompatGateway.ts`)
- Rate limiting (Bottleneck + custom middleware)
- Service layer patterns (creditService, costTracker, llmRouter)

**Sub-agents it can spawn:**
- Router Builder (create/modify tRPC routers)
- Service Layer Engineer (business logic services)
- Auth Specialist (JWT, sessions, RBAC, 2FA)
- Queue Engineer (BullMQ, job scheduling)

---

### CMD-3: Python Engineer

**Domain:** FastAPI, Celery, LLM gateway, media tasks

**Context Files:**
- `python-backend/app/` (main.py, api/, core/, services/, tasks/, models/, llm_proxy/)
- `python-backend/app/core/celery_app.py` (task routing, queue config)
- `python-backend/app/tasks/media_tasks.py` (image/video/audio generation)
- `python-backend/app/tasks/media_job_worker.py` (FFmpeg processing)
- `python-backend/app/llm_proxy/` (unified client, gateway, providers)
- `python-backend/app/models/` (SQLAlchemy 2 models)

**Specializations:**
- FastAPI async-first, Pydantic V2 validation
- Celery task orchestration (media + video queues)
- SQLAlchemy 2 async ORM, asyncpg
- Multi-provider LLM (OpenRouter, OpenAI, Anthropic, Groq, Kie.ai)
- FFmpeg media processing (probe, render, thumbnails, subtitles)
- Credit system integration via WebGatewayClient
- Python code style: Black (100 chars), Ruff, mypy

**Sub-agents it can spawn:**
- Celery Task Engineer (async task design)
- LLM Provider Integrator (add/fix provider adapters)
- Media Pipeline Specialist (FFmpeg, video/audio processing)
- API Endpoint Builder (FastAPI routes + Pydantic schemas)

---

### CMD-4: Database Architect

**Domain:** PostgreSQL, Drizzle ORM, migrations, schema design, query optimization

**Context Files:**
- `apps/web/drizzle/schema.ts` (30+ tables, full schema)
- `apps/web/drizzle/*.sql` (migration files)
- `apps/web/drizzle/meta/_journal.json` (migration journal)
- `apps/web/drizzle/seed.ts` (seed data)
- `python-backend/app/models/` (SQLAlchemy models)

**Specializations:**
- Drizzle ORM: pgTable, enums, relations, indexes
- PostgreSQL 15: JSON/JSONB, text search, transactions
- Migration safety (backup, verify row counts, rollback)
- Schema design patterns (multi-tenant, audit logging)
- Performance: indexes, query optimization, connection pooling
- Encryption columns (AES-256-GCM via crypto.ts)

**Key Tables Grouped:**
- **Auth:** users, emailVerificationTokens, registrationEvents, deviceFingerprints, blockedPatterns
- **Chat:** conversations, messages, conversationSummaries, entityMemories
- **LLM:** llmProviders, modelProviderMap, providerUsageLog, routingRules
- **Media:** mediaProviders, mediaModels, mediaGenerations, galleryItems
- **Skills:** skills, skillPreferences, userSkillVisibility, skillLikes, skillComments
- **Multi-Tenant:** tenants, tenantPages, seoMetadata, themePresets, blogPosts
- **Billing:** creditTransactions, creditPackages, systemSettings, invoiceConfig
- **Security:** apiAuditEvents, passwordChangedAt

**Sub-agents it can spawn:**
- Migration Engineer (generate, test, apply migrations)
- Query Optimizer (analyze slow queries, add indexes)
- Schema Designer (new table design with proper types, constraints)

---

### CMD-5: Infrastructure Engineer

**Domain:** Docker, Nginx, deployment, monitoring, scripts

**Context Files:**
- `docker-compose*.yml` (5 variants: base, full, nginx, media, dev)
- `nginx/` (nginx.conf, conf.d/*.conf, ssl/, Dockerfile)
- `scripts/` (backup, logs, restart, alert-monitor)
- `dev-local.sh`, `run-services.sh`
- `control-plane/` (Fastify, Prisma, API keys, artifact storage)
- `apps/tauri-shell/` (desktop app config)

**Specializations:**
- Docker Compose orchestration (multi-service, networks, volumes)
- Nginx reverse proxy (SSL, rate limiting, upstream routing)
- Celery worker scaling (media vs video queues, resource limits)
- Health checks, startup dependencies, graceful shutdown
- Production scripts (backup, monitoring, alerts)
- Multi-environment config (dev, staging, production)

**Sub-agents it can spawn:**
- Docker Composer (modify compose files, add services)
- Nginx Configurator (routing rules, SSL, performance tuning)
- Deploy Orchestrator (production deployment steps)
- Monitor Setup (health checks, alerting, log rotation)

---

### CMD-6: Security Auditor

**Domain:** Authentication, encryption, input validation, OWASP compliance

**Context Files:**
- `apps/web/server/services/crypto.ts` (AES-256-GCM encryption)
- `apps/web/server/services/totpService.ts` (2FA TOTP)
- `apps/web/server/services/trustScoring.ts` (registration trust)
- `apps/web/server/services/piiFilter.ts` (PII detection)
- `apps/web/server/routers/accountSecurity.ts` (security endpoints)
- `apps/web/server/middleware/` (auth, rate limiting)
- `python-backend/app/core/csrf.py`, `encryption.py`, `smartspecweb_crypto.py`
- `packages/shared/src/utils/security.ts` (sanitization)

**Specializations:**
- Encryption: AES-256-GCM (Node), Fernet (Python), key derivation
- Auth: JWT, bcrypt/argon2, session management, RBAC
- Input validation: Zod schemas, shell metachar prevention, SSRF prevention
- OWASP Top 10: XSS, SQL injection, CSRF, IDOR
- Rate limiting: per-IP, per-user, per-endpoint
- Trust scoring: registration fraud detection
- PII filtering: sensitive data redaction

**Sub-agents it can spawn:**
- Vulnerability Scanner (static analysis of code patterns)
- Auth Flow Auditor (trace authentication paths)
- Encryption Reviewer (verify proper encrypt/decrypt usage)

---

### CMD-7: Debug Detective

**Domain:** Root cause analysis, systematic debugging, error tracing

**Context Files:**
- All source files (follows error traces)
- `apps/web/logs/audit/` (JSONL audit logs)
- `python-backend/logs/` (Celery task logs)
- Test files for regression verification

**Specializations:**
- MANDATORY Debugging Protocol (Phase 1: Understand, Phase 2: Plan, Phase 3: Fix)
- Error trace reading (stack traces, tRPC errors, Celery tracebacks)
- Data flow tracing (entry point -> error location)
- CSS debugging (specificity, inheritance, computed styles)
- Async bug detection (missing await, race conditions, deadlocks)
- LLM/Media audit log analysis (traceId correlation)
- 3-attempt limit enforcement

**Process:**
1. Reproduce: Run exact command/test that fails
2. Read: Parse error message, stack trace, file:line references
3. Trace: Read source from entry -> error (full call chain)
4. Identify: "The bug is caused by X because Y" (one sentence)
5. Search: Grep for similar patterns
6. Plan: Minimal fix, predict side effects
7. Fix: ONE focused change
8. Verify: Run failing test, then full suite

**Sub-agents it can spawn:**
- Log Analyzer (audit log correlation, pattern matching)
- Stack Trace Reader (deep analysis of error chains)
- CSS Inspector (specificity analysis, computed style tracing)
- Async Debugger (promise chain analysis, race condition detection)

---

### CMD-8: Quality Assurance

**Domain:** Testing, type checking, coverage, code quality

**Context Files:**
- `apps/web/**/*.test.ts` (Vitest tests)
- `python-backend/tests/` (pytest tests)
- `apps/web/tsconfig.json` (TypeScript config)
- `python-backend/pyproject.toml` (pytest, Black, Ruff, mypy config)

**Specializations:**
- Vitest: React component tests, service unit tests, integration tests
- pytest: markers (unit, integration, e2e), 80% coverage minimum
- TypeScript: strict mode, tsc --noEmit
- Python: Black (100 chars), Ruff, isort, mypy
- Coverage analysis: identifying untested paths
- Regression testing: verify fixes don't break existing

**Sub-agents it can spawn:**
- Test Writer (create tests for new/modified code)
- Coverage Analyzer (find untested paths, suggest tests)
- Type Checker (TypeScript and Python type analysis)
- Build Validator (full build + lint + test pipeline)

---

## Level 2: Tactical Agents (Spawned On-Demand)

Tactical agents are ephemeral, single-purpose agents spawned by Commanders:

| Agent | Purpose | Typical Duration |
|---|---|---|
| Component Builder | Create/modify a specific React component | 1-3 tool calls |
| Router Builder | Create/modify a tRPC router procedure | 1-3 tool calls |
| Migration Engineer | Generate, review, and apply a DB migration | 2-5 tool calls |
| Test Writer | Write tests for specific code | 2-4 tool calls |
| Log Analyzer | Search and correlate audit logs | 1-2 tool calls |
| CSS Inspector | Debug layout/styling issues | 2-4 tool calls |
| Vulnerability Scanner | Check code for OWASP issues | 1-3 tool calls |
| Performance Profiler | Analyze slow queries or endpoints | 2-4 tool calls |

---

## Orchestration Patterns

### Pattern A: Bug Fix Orchestra

```
User: "ปุ่ม Export ไม่ทำงาน" (Export button doesn't work)

Conductor:
  1. Classify: Bug -> Video Editor -> Frontend + Backend
  2. Spawn: Debug Detective (analyze the issue)

Debug Detective:
  1. Search for ExportDialog.tsx, export-related code
  2. Trace: button click -> tRPC call -> mediaJobs router
  3. Check audit logs for recent export errors
  4. Identify: "The bug is caused by X"
  5. Return: Root cause + affected files

Conductor:
  3. Based on root cause, spawn:
     - CMD-1 (Frontend) if UI issue
     - CMD-2 (Backend) if server issue
     - Both if cross-cutting
  4. Commander implements fix
  5. Spawn: QA Agent to run tests
  6. Report results to user
```

### Pattern B: Feature Development Orchestra

```
User: "เพิ่มระบบ notification แบบ real-time"

Conductor:
  1. Enter Plan Mode
  2. Spawn PARALLEL analysis agents:
     - CMD-1: Analyze frontend notification UI patterns
     - CMD-2: Analyze backend WebSocket/SSE capabilities
     - CMD-4: Design notification schema
     - CMD-5: Check infrastructure for WebSocket support
  3. Wait for all analysis agents
  4. Synthesize findings into implementation plan
  5. Present plan to user

After approval:
  6. Spawn PARALLEL implementation:
     - CMD-4: Create notification table migration
     - CMD-2: Build notification tRPC router + service
     - CMD-1: Build NotificationBell component + NotificationPanel
  7. Spawn SEQUENTIAL:
     - CMD-8: Run tests + type check
     - CMD-6: Security review of new endpoints
  8. Report completion
```

### Pattern C: System Design Orchestra

```
User: "วิเคราะห์และปรับปรุง performance ของระบบ LLM"

Conductor:
  1. Spawn PARALLEL analysis:
     - CMD-2: Analyze llmRouter.ts, llmQueue.ts, llmRateLimiter.ts
     - CMD-3: Analyze Python LLM gateway, provider factory
     - CMD-4: Query providerUsageLog for slow requests
     - CMD-7: Check audit logs for high-latency patterns
  2. Wait for all analysis
  3. Synthesize: Identify top N performance bottlenecks
  4. Spawn CMD-2 + CMD-3 for targeted optimizations
  5. CMD-8 validates with tests
  6. CMD-5 verifies deployment impact
```

### Pattern D: Security Audit Orchestra

```
User: "ตรวจสอบความปลอดภัยของระบบทั้งหมด"

Conductor:
  1. Spawn PARALLEL security scans:
     - CMD-6: Full security audit (auth, encryption, validation)
     - CMD-2: Backend endpoint audit (auth checks, rate limits)
     - CMD-3: Python backend audit (CORS, headers, input validation)
     - CMD-4: Database audit (encrypted columns, access patterns)
     - CMD-5: Infrastructure audit (SSL, headers, rate limiting)
  2. Wait for all audit reports
  3. Synthesize: Prioritized vulnerability list
  4. Create fix plan with severity ratings
  5. Implement fixes in priority order
```

### Pattern E: Refactoring Orchestra

```
User: "Refactor media generation pipeline"

Conductor:
  1. Spawn PARALLEL analysis:
     - CMD-2: Analyze Node.js media services
     - CMD-3: Analyze Python media tasks + workers
     - CMD-4: Analyze media-related tables
  2. Identify refactoring targets
  3. Spawn CMD-2 + CMD-3 for implementation (sequential to avoid conflicts)
  4. CMD-8: Run full test suite
  5. CMD-7: Debug any regressions
```

---

## Parallel Execution Rules

### When to Parallelize
- Independent file analysis (different modules)
- Read-only exploration of different subsystems
- Tests that don't share state
- Documentation generation

### When to Serialize
- Database migrations (must be sequential)
- Files that depend on each other (schema -> service -> router)
- Git operations (stage, commit, push)
- Changes that might conflict in the same file

### Concurrency Limits
- Maximum 4 parallel agents (to avoid context confusion)
- Maximum 2 agents editing files simultaneously
- Only 1 agent running database operations at a time
- Only 1 agent running git operations at a time

---

## Agent Communication Protocol

### Request Format (Conductor -> Commander)
```
DOMAIN: [domain name]
TASK: [specific task description]
CONTEXT: [relevant files, recent changes, user requirements]
CONSTRAINTS: [what NOT to change, performance requirements]
OUTPUT: [expected deliverable - code, analysis, plan]
```

### Response Format (Commander -> Conductor)
```
STATUS: [completed | needs-input | blocked]
CHANGES: [list of files modified]
ANALYSIS: [findings, if research task]
RISKS: [potential side effects]
NEXT-STEPS: [recommended follow-up actions]
```

---

## Agent Spawning Reference

### Using the Task tool

```
Task(subagent_type="Explore", description="CMD-1: Analyze export button")
Task(subagent_type="general-purpose", description="CMD-2: Build notification router")
Task(subagent_type="error-debugging:debugger", description="CMD-7: Debug export failure")
Task(subagent_type="multi-platform-apps:frontend-developer", description="CMD-1: Build NotificationBell")
Task(subagent_type="multi-platform-apps:backend-architect", description="CMD-2: Design notification API")
Task(subagent_type="backend-api-security:backend-security-coder", description="CMD-6: Audit auth flow")
Task(subagent_type="python-development:fastapi-pro", description="CMD-3: Fix Celery task")
```

### Agent Type Mapping

| Commander | Primary Agent Type | Alternative Agent Types |
|---|---|---|
| CMD-1: Frontend Architect | multi-platform-apps:frontend-developer | ui-design:ui-designer, Explore |
| CMD-2: Backend Architect | multi-platform-apps:backend-architect | backend-api-security:backend-architect |
| CMD-3: Python Engineer | python-development:fastapi-pro | python-development:python-pro |
| CMD-4: Database Architect | Explore (+ direct SQL via Bash) | general-purpose |
| CMD-5: Infrastructure Engineer | Explore (+ Docker/Nginx via Bash) | general-purpose |
| CMD-6: Security Auditor | backend-api-security:backend-security-coder | error-debugging:error-detective |
| CMD-7: Debug Detective | error-debugging:debugger | error-debugging:error-detective |
| CMD-8: Quality Assurance | general-purpose (+ test runner via Bash) | Explore |

---

## Performance Metrics

Track these for each orchestration:
- **Time to resolution**: From user request to completed task
- **Agent efficiency**: Tool calls per agent (fewer = better)
- **Parallel utilization**: % of agents running simultaneously
- **Accuracy**: Fix success on first attempt (target: 80%+)
- **Regression rate**: New bugs introduced by fixes (target: <5%)
