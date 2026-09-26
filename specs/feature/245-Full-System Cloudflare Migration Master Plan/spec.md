---
spec_id: 245
title: SmartAIHub Full-System Cloudflare Migration Master Plan
subtitle: Compatibility Assessment, Pre-Migration Refactoring, Incremental Cutover, Disaster Recovery & Debian Retirement
revision: 8.0
status: PROVISIONAL / R8 URGENT CUTOVER PRIORITY AMENDMENT / NOT IMPLEMENTED / NOT PRODUCTION CERTIFIED
created: 2026-09-24
updated: 2026-09-26
merge_scope: 2026-09-23 Incremental Zero-Downtime Migration Plan + Spec 245 R1 + R3 twelve-pass audit + R4 fourteen-pass audit + R5 fifteen-pass audit + R6 fifteen-pass audit + R7 thirteen-pass audit
numbering: PROVISIONAL 245; verify canonical SmartSpecPro registry, main branch, active PRs and worktrees before commit
suggested_repository_path: specs/feature/245-full-system-cloudflare-migration-master-plan/spec.md
risk_class: CRITICAL — full production hosting migration
primary_owner: Platform Migration / Infrastructure / SRE
implementation_strategy: discover -> classify -> remediate -> shadow -> canary -> promote -> drain -> retire
canonical_job_authority: Feature 186 / Feature 195 worker_jobs
canonical_migration_subsystem: Spec 232 Redis/BullMQ migration
canonical_runtime_integration: Spec 242 Cloudflare Native Agent & Sandbox Runtime Integration
canonical_data_authority: PostgreSQL
canonical_semantic_index: Cloudflare Vectorize
canonical_asset_store: Cloudflare R2
implemented_baseline_rule: Specs <=213 are compatibility boundaries and MUST NOT be retroactively rewritten
---

# Spec 245 — SmartAIHub Full-System Cloudflare Migration Master Plan (R8 Cutover Amendment)

> **CURRENT NORMATIVE REVISION — R8:** Read §118 first for the urgent cutover decision, then §§101–117 for R7 compatibility, security, recovery and evidence requirements. R8 removes the fixed 14–30 day Redis retirement wait; it does not remove per-responsibility readiness, data-safety, security, or live cutover checks. Older R1–R7 material remains preserved for traceability. Full-system live status remains **unverified**, and the proposed 245 ID still needs authoritative Git registry validation.

## 0. Executive decision

SmartAIHub SHALL migrate from the current Debian mini-server production dependency to a **Cloudflare-first production architecture** through independently certifiable migration waves.

This specification is the **master migration coordination authority**. It owns:

- full-system discovery and dependency inventory;
- compatibility assessment;
- target-runtime placement decisions;
- required pre-migration refactors;
- migration wave ordering;
- cross-wave readiness and blocking rules;
- cutover / rollback / disaster-recovery evidence;
- final proof that the Debian mini server is no longer a production dependency.

It MUST NOT create a second job ledger, workflow state machine, permission engine, credit ledger, retrieval authority, model router, or agent authority.

Existing canonical owners remain authoritative.

### 0.1 Target end state

```text
Clients / Browser / Mobile / Desktop / Tenant Domains
                         |
                    Cloudflare Edge
        DNS / WAF / TLS / Routing / Static Assets
                         |
                  Cloudflare Workers
       API / Auth / Chat / Gateway / Lightweight Logic
                         |
       +-----------------+-----------------+
       |                 |                 |
  Hyperdrive        Durable Objects      KV
       |           coordination/state   bounded-stale
       |                 |
 Managed PostgreSQL      |
 canonical business      |
 state / ACL / credits / |
 worker_jobs / audit     |
       |
       +------ Transactional Outbox ------> Cloudflare Queues
                                             |
                       +---------------------+-------------------+
                       |                     |                   |
                 Worker execution     Cloudflare runtime      SmartAIHub Runner
                   bounded work        / Containers /          desktop/local/
                                      Sandbox where certified  external compute
                       |
                 R2 / Vectorize
            assets / artifacts / semantic index
```

**Cloudflare-first** does not mean every workload must execute inside Workers.

The migration is complete when the Debian mini server can be powered off without breaking supported production functions.

---

## 0.2 R2 merge authority and precedence

This R2 merges **Spec 245 R1** and the previously *un-numbered* **SmartAIHub Incremental Cloudflare Migration & Redis Retirement Plan** dated 2026-09-23. The old plan was an operational plan, **not a separately reserved spec**. R2 is the single normative full-system document; the old plan is retained only for provenance. Spec 232 remains a separate specialist execution/Redis migration spec. No retroactive changes to Specs ≤213 and no edits to in-progress Spec 224 are authorized by this merge.

Source digests (content SHA-256, not evidence of deployed state):

```yaml
source_full_system_r1_sha256: 27e96e284685b32172c9765c5044a66280a569203e97d80c70e2c38d738852af
source_incremental_plan_sha256: c678d20154813d89701af542bd6be0719d1556fd5ce94df046851defcb8914d0
merge_revision: '2.0'
precedence: 'R2 resolution clauses; otherwise full existing R1 and imported operational constraints both apply'
```

**Conflict-resolution decisions:**

- Preserve the R1 whole-system assessment/compiler, placement, remediation and Debian retirement gates; preserve the incremental plan's detailed release work packages, security continuity, canary/rollback, SLO, cost and operational evidence.
- **DB track is parallel:** Managed PostgreSQL must be ready before *final Debian retirement*, not before every public Worker or Redis slice. A Workers↔current-PG bridge is allowed only when connection and data-policy tests pass. Neither plan authorizes dual writable primaries.
- **Discovery gate is risk-scoped:** all dependencies of a promoted component must be classified; a certified side-effect-free public route need not wait for every daemon to be discovered. Full retirement always waits for exhaustive production inventory.
- **No silent live fallback on promoted paths.** Explicit, fenced, auditable rollback may return *new* traffic to a pre-certified legacy implementation while in-flight work follows its persisted authority and generations. Critical revocation, credits and locks require verified monotonic safety across rollback.
- **Zero planned customer-visible downtime is the objective, not an unconditional physical guarantee.** If a database provider migration cannot safely avoid a brief write freeze, communicate its measured scope and operate a tested bounded admission/retry or maintenance strategy; never sacrifice correctness to claim 0 ms interruption.
- **WP00–WP12 are operational release work packages within Spec 245**, not separate specs, and are mapped to independent M245 tracks below. P232.* remains Spec 232-only, and `worker_jobs` retains its single authority.

## 0.3 Non-negotiable always-on migration rules (merged from the incremental plan)

1. **Old version remains serviceable until each new slice earns traffic.** Keep existing API domain/routes and users' session semantics whenever possible.
2. **One authority per business effect:** exactly one canonical PostgreSQL record for a job, credit movement, webhook delivery, revocation, or idempotency result. Shadow systems must not send real emails, create paid generations, charge credits, or mutate browsers.
3. **Never operate old and new lock services as independent authorities for the same protected resource.** Establish the shared fencing check in PostgreSQL *before* switching acquisition between Redis and DO/PostgreSQL.
4. **Use an explicit per-capability traffic router** (`legacy`, `shadow`, `canary`, `new`, `rollback`) with allowlists by tenant, user cohort, route, workload category, and region. Use durable and auditable rollout state; no global all-on switch.
5. **Feature-flag rollback and code rollback are different.** Every phase must document both. Keep schema/data compatible with the stable old version until the rollback window expires.
6. **Expand → backfill → verify → switch → contract.** Do not drop Redis fields/keys, DB columns, consumers, compatibility API, or legacy secrets before the appropriate contract phase.
7. **Every async action has a canonical idempotency key and trace ID.** At-least-once queues, delivery retries, replay after outage, and worker lease expiry must not duplicate chargeable effects.
8. **Security cannot silently fail open.** If the fresh auth/revocation path is unavailable, high-risk actions fail closed or remain on a *proven synchronized* legacy decision path. Never claim a live token is safe using a lagging KV cache.
9. **No surprise user logout.** Preserve existing session compatibility during cutover. If safe session migration cannot be proven, retain the legacy auth path for those cohorts instead of mass-invalidating production sessions.
10. **Independently observable slices.** Every live canary carries `migration_capability`, `backend_selected`, `release_version`, `tenant_id` (hashed/pseudonymous in logs), `trace_id`, `operation_id`, and rollout epoch. Strip secrets and PII.
11. **P213/C03 and other active program gates remain respected.** Do not bootstrap a migration by bypassing approvals, secret rotation, tenant isolation, or Runner trust/fencing.
12. **Rollback must not orphan newer business data.** Keep forward and backward-compatible DB reads/writes until both data and code rollback drills pass.

### Safer routing mechanism

Deploy a migration adapter **without immediately moving the whole application**: a provider-neutral `CacheStore`, `RevocationStore`, `RateLimitPolicy`, `IdempotencyStore`, `LeaseCoordinator`, `RealtimeBus`, and `QueueTransport` interface. Each wrapper returns a normalized contract and records backend selection. Existing services continue to use Redis by default, while isolated Workers routes can call the new providers. Changes should be additive and scoped; avoid a sweeping dependency inversion of all service code before the first canary.

```text
request/job → stable public route → migration router → chosen backend
                                     ├─ LEGACY: current Redis/DB + old services
                                     ├─ SHADOW: legacy serves; new runs read/verify only
                                     ├─ CANARY: allowlisted subset uses new implementation
                                     └─ NEW: new serves; legacy stays available for bounded rollback
```

**Avoid naïve dual-writes:** Dual-write a *cache copy* if cheap and safe, but do not dual-write independent credit ledgers, revocation sources of truth, queue side effects, or mutex acquisitions. Prefer PostgreSQL as the single write authority, an outbox for durable delivery, and observational shadow reads against the new layer.

---

## 0.4 Observed planning clues — verify against live repository and Debian

The following table records paths and job-family **hypotheses from the September 23 plan**. These are not verified present-day production facts. The compiler SHALL confirm each path/queue against current HEAD, running processes, deploy SHA and runtime traces, marking missing/renamed/disabled accurately.

This plan uses the **user-provided implementation status**, not a live repository scan. The first work package must confirm it against the current HEAD, deployments, dashboards, and code ownership before changing production.

| Domain | Known/currently reported live dependency | Target | Source-of-truth rule |
|---|---|---|---|
| General cache | `apps/web/server/services/redisClients.ts` | Public HTTP/Workers Cache where appropriate; KV for noncritical high-read data; optional Hyperdrive query cache | PostgreSQL/R2 remains source; cache is disposable |
| Auth / revocation | `_core/authz.ts`, `_core/revocation.ts` | PostgreSQL + cache-disabled Hyperdrive on Workers; carefully scoped DO for coordinated session operations, if needed | Authoritative fresh PostgreSQL decisions for sensitive actions |
| Rate limit / idempotency | `apiKeyRateLimiter.ts`, `idempotencyMiddleware.ts` | WAF/Workers Rate Limiting for abuse; DO for specified exact-rate coordination; PostgreSQL for financial quota/idempotency | Credits and idempotent effects in PostgreSQL |
| Ephemeral locks | `redisEphemeralKeyRegistry.ts` | PostgreSQL lease + fencing for durable effects; DO for per-key serialized coordination | PostgreSQL fencing on every durable write/settlement |
| Pub/sub / voice realtime | `routes/voiceGateway.ts` | DO WebSocket Hibernation for sessions; transactional outbox + Queues for durable fan-out | Database/event log for recoverable business events |
| BullMQ/background work | notification, backup, webhook, embedding, Vertical Drama; plus any unlisted producers/consumers | PostgreSQL outbox + Cloudflare Queues + existing/new runners | `worker_jobs` / receipt / idempotency |
| Packages | `bullmq`, `ioredis` reportedly present in `apps/web/package.json` | Remove only after runtime reachability audit | No hidden Redis imports, deployment jobs, or rollback dependence |

**Important:** Do not assume that the five named BullMQ worker families comprise every active queue. Enumerate the reported six Redis/BullMQ migration groups, other queue names, delayed/repeatable jobs, Celery/Beat Redis usage, and shared deployment processes. Some job paths (such as shot prompt) may be partially hard-cut over while still retaining a fallback.

## 1. Canonical architecture boundaries

| Area | Canonical owner | Spec 245 responsibility |
|---|---|---|
| Durable jobs / lease / fencing | Feature 186 / 195 | Verify placement and migration readiness only |
| Development orchestration | Spec 224 | Preserve existing lifecycle/finality |
| Tenant/product runtime | Spec 219 | Coordinate hosting migration |
| Security / data authority | Spec 220 | Verify Cloudflare deployment conforms |
| Retrieval / Vectorize | Spec 229 | Connectivity/compatibility only; no vector re-migration |
| LLM routing | Spec 231 | Preserve provider/model routing contracts |
| Redis/BullMQ migration | Spec 232 | Consume its family-level migration state |
| Agent/Sandbox Cloudflare integration | Spec 242 | Consume runtime certification |
| R2 artifacts | Existing storage authority | Verify local filesystem elimination |
| PostgreSQL | Existing SoT | Migrate hosting/connectivity without parallel truth |

### 1.1 Non-negotiable rules

1. PostgreSQL remains canonical for transactional business truth.
2. Vectorize remains the semantic index; do not migrate back to pgvector.
3. R2 remains canonical durable object/media/artifact storage where applicable.
4. `worker_jobs` remains durable execution authority.
5. Cloudflare Queues remain transport only.
6. A migration wave may not silently fall back to a retired Debian path.
7. A component may remain temporarily on Debian only while its migration state is explicitly `LEGACY_ACTIVE`.
8. A migrated component MUST be usable in production before later waves complete.
9. Final Debian retirement requires runtime evidence, not static source scans alone.
10. Specs <=213 are immutable historical design inputs and compatibility boundaries; runtime, schema and deployment availability must be verified from current source and environment evidence. Any required change is additive via later specs/adapters.

---

# 2. Mandatory first stage — Full Compatibility Assessment

No **high-risk, stateful, irreversible, or broad production migration** starts before the relevant Compatibility Assessment and complete upstream dependency inventory have passed. An **isolated, public/read-only, no-side-effect Worker route** MAY canary earlier under a narrowly complete **component-local inventory** and explicit no-cross-dependency proof, while full-system discovery continues. This exception never applies to auth, billing, queue ownership, persistent writes or Debian retirement.

## 2.1 Migration Compatibility Compiler

Implement a reusable repository/runtime tool:

```text
smartaihub-migrate inspect
smartaihub-migrate classify
smartaihub-migrate verify
smartaihub-migrate plan
smartaihub-migrate report
```

Suggested repository location:

```text
tools/cloudflare-migration/
  scanner/
  probes/
  classifiers/
  runtime-tests/
  schemas/
  reports/
```

Required outputs:

```text
migration/
  compatibility-inventory.json
  dependency-graph.json
  runtime-placement.yaml
  required-refactors.yaml
  migration-waves.yaml
  secret-bindings.redacted.yaml
  network-egress-map.yaml
  filesystem-dependency-map.yaml
  cron-service-map.yaml
  compatibility-report.md
```

## 2.2 Classification result

Every executable component SHALL receive exactly one primary placement classification:

| Classification | Meaning |
|---|---|
| `WORKERS_NATIVE` | Runs on Workers without material behavior change |
| `WORKERS_WITH_REFACTOR` | Suitable for Workers after specified code change |
| `PYTHON_WORKER_NATIVE` | Suitable for Python Workers and tested package set |
| `CONTAINER_REQUIRED` | Requires process/filesystem/native binaries/longer execution better suited to Container |
| `RUNNER_REQUIRED` | Requires local GPU/device/browser/desktop/private network capability |
| `MANAGED_EXTERNAL` | Managed database/provider/service remains external |
| `EDGE_PROXY_ONLY` | Cloudflare fronts service but implementation remains elsewhere during migration |
| `DECOMMISSION` | Obsolete component can be removed instead of migrated |
| `BLOCKED` | No certified destination yet; blocks retirement if production-critical |

The compiler MUST NOT classify a package as compatible merely because it bundles successfully.

---

# 3. Node.js / TypeScript compatibility

For every Node/TS entry point inspect:

```text
built-in Node APIs
native npm modules
binary addons
child_process / spawn / exec
worker_threads
cluster
VM usage
server/listen assumptions
raw sockets
TLS server behavior
filesystem persistence assumptions
process signals
OS-specific paths
long-running loops
in-memory singleton state
local cron/scheduler
WebSocket server implementation
streaming
multipart upload
temporary file usage
dynamic require/import
ORM/database driver
Redis clients
BullMQ
background threads
```

Current Cloudflare Workers Node compatibility is broad, but partial or stubbed APIs still exist. Therefore compatibility MUST be proven with runtime conformance tests rather than package import success.

Required checks:

```text
CF-NODE-001 package imports successfully
CF-NODE-002 required API methods execute successfully
CF-NODE-003 request/response semantics match current API
CF-NODE-004 stream ordering is preserved
CF-NODE-005 abort/cancellation works
CF-NODE-006 WebSocket behavior is compatible
CF-NODE-007 database driver works through approved binding
CF-NODE-008 no persistent local-disk assumption
CF-NODE-009 no process supervisor dependency
CF-NODE-010 no hidden Redis/BullMQ fallback
```

### Required pre-migration refactors when detected

- Express server boot/listen logic -> Worker request entrypoint or compatibility adapter.
- Process-global singleton authority -> Durable Object / PostgreSQL / bounded cache.
- Local filesystem persistence -> R2 / PostgreSQL.
- Local temp processing -> bounded temporary/runtime workspace or Container.
- `child_process` / shell tool calls -> Container/Sandbox/Runner.
- long CPU loops -> split, queue, Container, or Runner.
- in-process cron -> canonical scheduler.
- Redis/BullMQ -> Spec 232.
- server-side socket room state -> Durable Objects/realtime bridge.

---

# 4. Python compatibility assessment

SmartAIHub Python code MUST be classified per module rather than migrated as one FastAPI/Celery monolith.

Python Workers can run Python via Pyodide and support FastAPI plus compatible pure/PyEmscripten/Pyodide packages, but not every CPython/native package behaves identically.

For every Python package inspect:

```text
requirements / pyproject dependencies
C/C++/Rust extensions
subprocess
multiprocessing
threading assumptions
fork
fcntl / POSIX-only APIs
local file persistence
system package dependency
FFmpeg / ImageMagick / browser binaries
GPU / CUDA
PyTorch / native ML runtime
Playwright / Chromium
Celery broker/backend
long-running task
blocking network client
database driver
shell invocation
temp files
large memory
```

Classification rules:

```text
pure request/response + supported packages
  -> PYTHON_WORKER_NATIVE candidate

native Linux binary / subprocess / filesystem-heavy
  -> CONTAINER_REQUIRED candidate

GPU / desktop / device / local model
  -> RUNNER_REQUIRED

Celery/BullMQ-like background execution
  -> canonical worker_jobs + Spec 232 transport

large model inference
  -> provider / approved external inference runtime

unsupported package with replaceable equivalent
  -> WORKERS_WITH_REFACTOR / PYTHON_WORKER after replacement
```

Required Python test fixture:

```text
python-compatibility-matrix.yaml

module:
package:
version:
import_ok:
runtime_ok:
native_extension:
filesystem:
subprocess:
network:
memory_peak:
cpu_profile:
target_runtime:
required_refactor:
test_ref:
evidence_ref:
```

---

# 5. Database and Hyperdrive compatibility

## 5.1 PostgreSQL inventory

Before moving application traffic, inventory:

- all schemas;
- migrations;
- extensions;
- RLS policies;
- triggers;
- functions;
- advisory locks;
- `LISTEN/NOTIFY`;
- session-local settings;
- prepared statement assumptions;
- connection pooling assumptions;
- long transactions;
- serializable transactions;
- `SKIP LOCKED`;
- bulk copy/import;
- backup/restore;
- PITR;
- database roles;
- service accounts;
- tenant isolation;
- replication;
- connection geography;
- latency to Cloudflare.

## 5.2 Hyperdrive compatibility gate

Hyperdrive currently does not support some PostgreSQL session features such as advisory locks and `LISTEN/NOTIFY`. Any dependency on these features MUST be discovered before cutover.

Classification:

```text
normal SQL / transactions
  -> HYPERDRIVE_FRESH

bounded-stale permitted read
  -> HYPERDRIVE_CACHED

unsupported session feature but still required
  -> REFACTOR_REQUIRED
     or separately governed direct DB connection

business lock
  -> PG row lock / lease / DO depending canonical ownership

pub/sub
  -> outbox / Queues / realtime event contract
```

### Required database pre-migration changes

- eliminate undocumented direct DB URLs from application code;
- centralize DB connection factory;
- tag repositories `STRICT_FRESH` vs `BOUNDED_STALE`;
- remove correctness dependence on session state;
- replace advisory locks where used by application control;
- replace `LISTEN/NOTIFY` where used as durable event transport;
- verify transaction behavior through Hyperdrive;
- define connection caps;
- benchmark edge-to-database latency;
- prove restore and PITR before production cutover.

---

# 6. Filesystem and object-storage compatibility

Scan the Debian server and repository for:

```text
/uploads
/tmp
/cache
/output
/artifacts
/media
generated thumbnails
render output
download staging
user uploads
model files
browser profiles
session files
sqlite files
cron-generated reports
logs used as application state
```

Every persistent file MUST be classified:

| Class | Target |
|---|---|
| User assets | R2 |
| Generated media | R2 |
| Immutable artifacts | R2 |
| Temporary bounded compute data | runtime temporary workspace |
| Large processing workspace | Container/Runner |
| Application state | PostgreSQL / canonical state store |
| Secrets | Cloudflare secrets / approved secret manager |
| Logs | observability system, not filesystem |
| obsolete | delete after verified retention policy |

Before Debian retirement:

```text
persistent_local_file_count == 0
unclassified_file_count == 0
production_write_to_debian_disk == 0
```

---

# 7. Process / systemd / Docker / cron inventory

The migration compiler MUST inspect:

```text
systemctl list-unit-files
systemctl list-units
crontab
/etc/cron.*
Docker Compose
running containers
open TCP/UDP ports
reverse proxy config
startup scripts
watchdog scripts
PM2/supervisor
Celery workers
Celery Beat
Node workers
Redis
PostgreSQL if local
background Python
browser automation
FFmpeg/render workers
local webhooks/tunnels
backup services
monitoring exporters
```

For each process:

```yaml
service:
owner:
criticality:
startup:
port:
dependencies:
writes:
reads:
network_egress:
scheduler:
state_authority:
target_runtime:
migration_wave:
rollback:
retirement_gate:
```

No service may disappear simply because it was not declared in Docker Compose.

---

# 8. Network compatibility and service discovery

Inventory:

- inbound domains/subdomains;
- internal ports;
- localhost calls;
- private IP calls;
- callback URLs;
- webhooks;
- WSS endpoints;
- SSH-based orchestration;
- DNS assumptions;
- IP allowlists;
- CORS;
- cookie domains;
- OAuth callback origins;
- CSP;
- mTLS;
- outbound API destinations;
- provider webhook verification;
- rate-limit origin identity.

Required changes before migration may include:

```text
localhost URL -> service binding / public governed API
fixed Debian IP -> DNS/service binding
webhook endpoint -> stable Cloudflare route
cookie domain -> cross-domain-safe canonical domain
origin trust by IP -> signed/mTLS/service identity
SSH orchestration -> Runner Control Plane
```

---

# 9. Auth, session, tenant and security compatibility

Compatibility tests MUST cover:

```text
login
logout
refresh
token rotation
session revocation
role change
tenant suspension
tenant switch
admin impersonation if supported
API key
service identity
Runner identity
WebSocket reconnect
cross-region revocation
cross-tenant denial
expired session
old deployment token
```

No migration is allowed to weaken authorization semantics because edge caching or distributed coordination is introduced.

Security-critical state SHALL use fresh canonical verification according to Spec 220 / Spec 232.

---

# 10. API compatibility contract

Every production route receives:

```yaml
route:
method:
current_handler:
target_handler:
request_schema_hash:
response_schema_hash:
auth_policy:
tenant_policy:
streaming:
websocket:
max_body:
timeout:
external_side_effect:
idempotency:
current_latency:
target_latency:
migration_state:
```

Migration states:

```text
DISCOVERED
INCOMPATIBLE
REFACTOR_REQUIRED
SHADOW_READY
SHADOW_PASS
CANARY
CLOUDFLARE_PRIMARY
LEGACY_DRAIN
RETIRED
```

## 10.1 Differential compatibility test

For safe/idempotent fixtures:

```text
same request fixture
    |
    +--> Debian implementation
    |
    +--> Cloudflare candidate
              |
       normalize volatile fields
              |
      schema + semantic comparison
```

Compare status code, headers, body schema, error codes, authorization decision, tenant scope, ordering, pagination, stream events, tool-call/event semantics, latency and audit events.

Shadow tests MUST NOT duplicate paid or destructive side effects.

---

# 11. Background execution compatibility

Spec 245 delegates Redis/BullMQ migration mechanics to Spec 232.

Before full-system migration, verify all background families:

```text
media
video/render
embedding/indexing
mail
notifications
billing settlement
maintenance
agent/development
browser/computer use
workflow
research
scheduled tasks
cleanup
webhook reconciliation
```

Each family must declare:

```yaml
job_family:
producer:
canonical_worker_job: true
transport:
executor:
max_runtime:
memory:
cpu:
gpu:
network:
external_effect:
provider_idempotency:
lease:
fencing:
retry_policy:
schedule:
artifact_store:
migration_owner:
```

No unnamed background loop is permitted at final certification.

---

# 12. Runtime placement decision tree

```text
Does workload require durable canonical business state?
  -> state stays PostgreSQL / canonical owner

Can request finish safely within Worker constraints?
  YES -> Worker candidate
  NO  -> continue

Does Python package/runtime work in Python Workers?
  YES -> Python Worker candidate
  NO  -> continue

Needs shell, native binary, writable workspace or process?
  YES -> Container/Sandbox candidate
  NO  -> continue

Needs GPU/local model/device/browser profile/private machine?
  YES -> Runner / approved external compute

Needs only transport/retry?
  -> Queue, but never source of truth

Needs per-key serialized coordination/realtime?
  -> Durable Object

Needs read-mostly eventually-consistent cache?
  -> KV

Needs durable file/object?
  -> R2
```

Placement MUST be evidence-driven and versioned.

---

# 13. Pre-Migration Refactor Backlog

The compatibility compiler SHALL automatically create a backlog grouped by blocking severity.

## P0 — Migration blockers

Examples:

- local-only production database;
- undocumented state on Debian filesystem;
- hard-coded localhost;
- direct Redis job authority;
- process-global authorization state;
- persistent in-memory session state;
- missing idempotency for external paid effects;
- missing fencing;
- untracked cron;
- unsupported native package with no target runtime;
- missing DB backup/PITR;
- unversioned webhook endpoint;
- secrets embedded in files;
- Docker-only service not represented in deployment architecture.

## P1 — Required before component promotion

Examples:

- route adapter;
- Worker request wrapper;
- service binding;
- Hyperdrive repository classification;
- R2 upload refactor;
- Queue producer bridge;
- WebSocket DO bridge;
- retry/idempotency normalization;
- telemetry;
- health/readiness probes.

## P2 — May follow initial promotion

Examples:

- performance tuning;
- cost optimization;
- cold-start optimization;
- caching;
- advanced autoscaling;
- dashboard refinement.

No P0 item may be waived silently.

---

# 14. Proposed Migration Waves

**Important: M245.* are master-level tracks, not a strictly serial global cutover.** M245.0/M245.1 establish the critical baseline; an independently certified M245.3 public route may reach production while M245.4 managed-PostgreSQL migration remains pending. M245.4 is an independent gated track and is *not* a prerequisite for the entirety of M245.5/M245.6; particular stateful routes may depend on it if the current database cannot safely support Workers through Hyperdrive. Redis retirement may finish before managed-PostgreSQL migration, but full Debian retirement cannot. Detailed per-slice order is in §14A.

## M245.0 — Discovery only

Actions:

- repository scan;
- Debian runtime scan;
- DB/schema scan;
- network map;
- filesystem map;
- secret map (redacted);
- Cloudflare account capability inventory;
- current production SLO baseline.

No production routing changes.

Exit:

```text
100% known production processes classified
100% externally reachable routes inventoried
100% persistent local paths classified
all unknowns assigned owner
```

## M245.1 — Compatibility Lab

Build:

- Migration Compatibility Compiler;
- Cloudflare test harness;
- differential API runner;
- database compatibility suite;
- Node package probes;
- Python package probes;
- deployment smoke environments.

Output: `COMPATIBLE`, `REFACTOR_REQUIRED`, or `BLOCKED`.

No component enters **its own promotion gate** without component-scoped evidence; full-system certification additionally requires complete discovered inventory and all remaining UNKNOWN dependencies triaged.

## M245.2 — Cloud foundation

Prepare:

- Cloudflare environments;
- DNS strategy;
- WAF;
- secrets;
- IaC;
- Wrangler configuration;
- CI/CD;
- observability;
- service bindings;
- Hyperdrive;
- R2 bindings;
- Vectorize bindings;
- DO namespaces;
- Queues;
- isolated staging.

## M245.3 — Stateless / low-risk edge migration

First candidates:

- static frontend;
- public/read-only routes;
- health endpoints;
- low-risk APIs;
- signed download/upload front doors.

Use shadow + canary.

## M245.4 — Managed PostgreSQL migration (independent, parallel data track)

Goal: migrate the single transactional PostgreSQL authority from Debian to certified managed PostgreSQL before final Debian retirement. **Do not make this entire track a global prerequisite for edge stateless and separately qualified Redis/Queue slices.** Initially a bounded approved Worker read route MAY reach the **current** PostgreSQL through Hyperdrive if networking, TLS, credentials, region latency, connection pooling and supported PostgreSQL features pass; otherwise use an isolated staging database and keep that production slice on legacy until ready. Keep old Debian writers on the current canonical database during early Workers adoption; never create two independent writable primaries.

Steps:

1. managed PostgreSQL readiness;
2. schema parity;
3. replication/data movement if current database is local;
4. consistency verification;
5. PITR test;
6. application dual-environment compatibility;
7. Hyperdrive fresh/cached separation;
8. migrate reads;
9. migrate writes;
10. retire local DB only after soak.

Do not operate two independent writable systems of record.

## M245.5 — Core API / Auth / Chat / LLM Gateway

Migrate route families separately while preserving user/session behavior, tenant ACL, credits, provider configuration, model routing, streaming, tool calling and webhook behavior.

## M245.6 — Redis/BullMQ/background plane

Execute Spec 232. Master status consumes Spec 232 family states rather than recreating them.

## M245.7 — Python / agent / sandbox / heavy workloads

Use classification result: Python Worker, Container, Sandbox, Runner or external provider.

Integrate Spec 242 where Cloudflare Agents/Sandbox are used.

## M245.8 — Realtime / browser / media / workflows

Certify:

- DO WebSocket recovery;
- Browser/Computer Use;
- media processing;
- long-running tasks;
- external agent execution;
- scheduled jobs;
- callback recovery.

## M245.9 — Full traffic primary

Requirements:

- Cloudflare path is default;
- Debian receives no new production ownership;
- old callbacks still safely reconciled;
- rollback remains available for defined horizon.

## M245.10 — Debian retirement

Sequence:

```text
STOP new assignment
DRAIN known legacy work
VERIFY no scheduled legacy occurrence
VERIFY no local DB authority
VERIFY no local file authority
VERIFY no Redis authority
VERIFY no hidden callback target
DENY production traffic to Debian
RUN production smoke
POWER OFF test
OBSERVE
REMOVE credentials
ARCHIVE evidence
DECOMMISSION
```

A successful **real power-off test of the original mini server** is mandatory before destructive decommission; marking the same host as an optional Runner cannot bypass proof that powering it off leaves all supported production functions operable.

---

# 14A. Integrated incremental production-delivery playbook (normative R2)

**This is an internal chapter of Spec 245, not a second migration document.** Master tracks M245.0–M245.10 describe system coverage and retirement; the WP00–WP12 release cards below describe independent, production-observable *increments*. A track can have several WPs, and an WP can fulfill more than one track. Actual deploy order is determined by the signed dependency DAG and component gates, not by the numeric order alone.

## 14A.1 Explicit master-track / work-package mapping

| Master track | Operational releases | Mandatory prerequisite / permitted independence |
|---|---|---|
| M245.0 Discovery | WP00 | Global discovery begins; unclassified discoveries block full retirement |
| M245.1 Compatibility Lab | WP00 and each WP's component probes | Isolated WP01 public/read-only may proceed with closed local graph, safe shadow and approved local exception |
| M245.2 Cloud foundation | WP00 | Minimal environment for WP01, extend infrastructure only when needed |
| M245.3 Stateless edge | WP01–WP03 | Can run while local PG stays canonical |
| M245.4 Managed PostgreSQL | WP03 connectivity + WP11 full move | **Independent parallel track**, final retirement dependency |
| M245.5 Core API/Auth/Chat | WP03–WP06 + route-specific cards | Financial/identity paths require stricter gates |
| M245.6 Redis/BullMQ | WP02, WP04–WP10, WP12 | Spec 232 owns per-family truth/cutover; this chapter owns release sequencing/observability |
| M245.7 Python/Agent/Sandbox | independently certified workload cards | Spec 242 and existing Runner/Spec 224 authority, not all Python into Workers |
| M245.8 Realtime/Browser/Media/Workflow | WP08–WP10 plus domain cards | P213 live blockers cannot be inherited as PASS |
| M245.9 Full traffic primary | all promoted cards | All production ingress, egress, webhook and background ownership mapped |
| M245.10 Debian retirement | WP11 + WP12 + full-system gates | Proven power-off test and safe post-cutover observation required |

**Pre-migration check priority:** run `smartaihub-migrate inspect/classify` on all production-reachable processes and affected dependencies as early as feasible; create `required-refactors.yaml` from failed probes. Do not delay the first *locally isolated* public-read rollout merely to finish probing unrelated media/GPU services. No migration of stateful or privileged paths before their full dependency closures pass.

## 14A.2 Cloudflare target controls and consistency (additional operational detail)

- `HYPERDRIVE_FRESH`: authentication, revocation, permissions, tenant ACL, financial balance/credits, idempotency, `worker_jobs` state, approvals, and any read-after-write invariant. Disable query caching; do not rely on KV for emergency revocation.
- `HYPERDRIVE_CACHED`: explicitly approved read-only views that tolerate documented stale windows. Record max-age and stale-while-revalidate by route. Hyperdrive does not invalidate prior cached SELECT results when the application writes.
- Existing Debian services may initially continue connecting directly to the current PostgreSQL. Do **not** force them through a geographically remote Workers endpoint before a service is actually migrated.
- Hyperdrive is a connection pool and optional SQL query cache, **not** multi-region strongly consistent PostgreSQL replication. Confirm DB-region latency, backups, failover, connection counts, and provider capacity independently.
- Hyperdrive does not support PostgreSQL advisory locks or `LISTEN/NOTIFY`. If a workload must temporarily retain those features, it stays on a separately controlled direct PostgreSQL connection until redesigned and tested; the target architecture avoids both for ordinary migrated services.

**Caching policy:**
- Cache API data is local to a data center, and its invalidation is local; use it only for explicitly safe responses. Never cache Set-Cookie, authorization-sensitive payloads, credits, tenant-private documents, or unrestricted user-specific API bodies.
- Workers KV is eventually consistent, potentially stale for 60 seconds or more across locations. Use for versioned, noncritical, read-heavy cache; do not use as a globally exact rate counter, revocation SoT, or lock state.
- Cache key must include relevant tenant, public/private classification, locale, version, and content visibility. Prefer immutable/versioned keys and short TTLs instead of assuming global delete immediately purges all edges.

**Scale policy:**
- Use DO partitioning by tenant + purpose + entity (e.g., room/user/resource) with a stable hash to avoid a single hot global object. Introduce stripe/shards for tenants with unusually high traffic; do not put all SmartAIHub requests in one DO.
- Apply queue concurrency limits per provider, tenant, workflow, and budget, with backpressure rather than overloading external LLM/media providers.
- Preserve a region-conscious DB strategy for the largest transaction workloads. Test user-region p95/p99, cross-region round-trip, and connections under realistic contention before scaling traffic.

## 14A.3 Independently deployable release work packages WP00–WP12

**Relative sequence; do not interpret calendar ranges as guarantees.** Only start the next hazardous slice after its predecessor passes gates. Low-risk, isolated slices can proceed in parallel after the baseline is established.

| WP | Move | New production value visible immediately | Principal gate | Rollback route |
|---|---|---|---|---|
| 00 | Dependency/runtime inventory + SLO + rollout safety layer | Measured baseline; no change to users | Complete inventory + owner sign-off | All flags default legacy |
| 01 | Read-only **public** route → Workers cache (1 safe route) | Measurable cache hit / lower origin calls | Zero private-data cache leak; p95 no worse than guardrail | Route/flag back to old service |
| 02 | Noncritical cache → versioned KV / selected Cache API | Lower Redis read volume in production | Read parity + bounded staleness | Cache bypass; legacy read |
| 03 | PostgreSQL/Hyperdrive **fresh** bridge for one read route | Real Workers↔Postgres latency and connection evidence | Correct tenant isolation; no stale critical query | Switch the single route back |
| 04 | Rate limiting **abuse tier** on selected API routes | Early edge-level protection and reduced Redis limiter calls | No unintended 429 for legitimate traffic | Disable new enforcement; retain legacy until new proven |
| 05 | Canonical PostgreSQL idempotency + billing quota path | Hard protection against duplicate customer charges | Concurrent/replay tests; 0 duplicate effects | Existing shared PG authority + legacy adapter; no ledger rollback |
| 06 | Auth/revocation migrated by bounded session cohorts | Lower Redis auth dependency, fresh and auditable security decisions | Session parity, cross-region revoke test, no mass logout | Revert cohort only if revocation state is safely synchronized |
| 07 | Locks/leases with common PG fencing | No independent Redis mutex for migrated jobs | Crash/lease-expiry races, fencing proof | Roll back acquisition only after old/new compatibility proof |
| 08 | Realtime/pub-sub per isolated channel | WS hibernation; lower Redis fan-out | No duplicate user-visible event; reconnect/replay | New sessions revert to legacy; existing sessions drain |
| 09 | 1 low-risk BullMQ queue family → PG outbox + Queues | First real async workloads with stable worker_jobs | No missing/duplicate terminal effects + DLQ replay | Stop new dispatch, drain in-flight, resume legacy from PG authority |
| 10 | Remaining BullMQ/Celery/Beat job families | Progressive removal of queue workers and Redis traffic | Each family individually certified | Per-family route/drain |
| 11 | Managed PostgreSQL + Hyperdrive primary switch (**independent track within this spec**) | Managed HA + native Workers DB integration | CDC/cutover/failback data correctness | Tested provider-specific failback plan; no dual writers |
| 12 | Redis retirement + package cleanup | Remove infrastructure and on-call burden | 100% responsibility inventory + targeted cutover acceptance evidence; no fixed elapsed observation period | Preserve a recoverable snapshot/runbook until the new path is confirmed |

> **WP11 is intentionally decoupled:** Cloudflare Workers can begin serving approved slices while existing PostgreSQL remains the database. The managed-PostgreSQL migration must not hold WP01–WP10 hostage. If the new provider is needed earlier for a particular slice, treat it as a separate gated prerequisite for **that** slice only.

### WP00 — Before production traffic changes

**Inventory (mandatory):**
- Search active monorepo(s), CI/CD, deployment manifests, crons, worker services, feature flags, and runtime environment for: `redis`, `ioredis`, `bullmq`, `celery`, `kombu`, `broker_url`, `result_backend`, `rateLimit`, `pubsub`, `subscribe`, `publish`, `SET NX`, `redlock`, `lock`, `session`, `revocation`, `delayed/repeatable jobs`, and direct socket usage. Confirm each live caller via runtime tracing, not grep alone.
- Enumerate *all* producer/consumer pairs, group them by queue + payload version + side-effect risk; identify job owners, retries, schedules, stuck/delayed work, Redis TTLs, keyspace footprint, and key deletion effects.
- Record both **actual prod traffic** and code that exists but is disabled. Verify shot-prompt hard-cutover claims and whether Redis fallback can still activate.
- Capture baseline: 7 days if feasible (at least one normal peak and one quiet window) for API p50/p95/p99, 5xx, auth failure, 429, job queue age/completion, video/voice connection success, credit settlement, Redis commands/sec and active memory, PostgreSQL pool usage, cost per 10k operations, Vectorize job throughput.
- Set up synthetic traffic from the primary Thai user region **and** at least one non-Thai region; create isolated test tenants/users with explicit non-billable sandbox providers.
- Produce `redis-inventory.csv`, route ownership map, dependency DAG, current SLO worksheet, tenant/privacy risk matrix, release/rollback owner list, and incident comms template.

**Platform foundation:**
- Introduce the provider interfaces, centrally auditable rollout flags, request/job tracing, release labels, circuit breakers, capped retries, per-tenant quotas, canary allowlists, and replay-safe operation IDs.
- Prepare Workers staging and production environments, least-privilege service bindings, Hyperdrive FRESH/CACHED split, separate KV namespaces, per-purpose DO namespaces, per-family Queues/DLQs, Logpush/OTel/Workers Logs, and log redaction.
- Keep all stateful/privileged production routing **100% legacy** until the relevant WP00 exit. A single explicitly certified public/read-only route may receive limited WP01 canary earlier under `LOCAL_SLICE_READY` with a complete local dependency graph, scoped owner approval and a tested route-only rollback; verify configuration cannot accidentally enable any other capability.

**WP00 global exit:** signed inventory covers 100% of runtime Redis traffic and known cron/queue paths; dashboards and pager work; rollback of one dummy feature flag tested; no secrets exported to logs. **WP01 local exception:** while global discovery continues, only a provably isolated public/read-only route with all *its own* reachable dependencies inventoried and certified may canary; this exception never unlocks WP04–WP10 or Debian retirement.

### WP01 — First real customer-visible move: one safe public route

Pick **one actually existing** public or sanitized read-only endpoint after WP00, preferably an immutable public skills/catalog/config view that is already safe to expose. Do not invent a `/api/public/...` path and claim it is live.

1. Create a thin Worker route (or one Worker-to-origin service binding) that forwards misses to the original app. **Prevent recursive Worker invocation** by using an origin-only hostname, direct origin route excluded from the Worker trigger, or a tested service binding; do not blindly `fetch()` the same public URL intercepted by this Worker. Keep the original service authoritative and its hostname/API contract unchanged.
2. Enable caching only when the response is demonstrably public and carries no user-specific auth, tenant-private material, private RAG result, credentials, cookies, or credit balance. Use versioned keys and explicit TTL.
3. Deploy at zero traffic, verify preview URL against production-like payload, then gradually route 1% → 5% → 25% → 50% → 100% of **this route only**; use version affinity/sticky hashing where session or assets demand it.
4. Show independent evidence: request volume, cache hit ratio, origin offload, p95/p99, response diffs, error rates, and stale window. Observe over real peak traffic before declaring passed.
5. If any security/data leakage or significant error appears, bypass cache/Worker route immediately; original public API remains functional.

**Expected proof of incremental success:** the main app and all old Redis-backed functions keep running while a small but genuine production endpoint is served by Workers. Do not delay WP01 waiting for DB/Queue migration.

### WP02 — Move noncritical caches, one namespace at a time

- Build cache classification by consequence of staleness: `A_public_safe`, `B_tenant_noncritical`, `C_fresh_critical`. Only A and carefully scoped B can migrate to KV/Cache API. C bypasses KV and Hyperdrive caching.
- For each cache: run read comparison in shadow; new cache miss falls back to authoritative database/origin (optionally temporarily Redis where contract allows), record hit/miss; warm versioned keys without bulk-copying expired/sensitive data.
- Apply write-through version bump or outbox-driven invalidation for *specific* noncritical keys. Do not rely on cross-colo `KV.delete` as an instantaneous correctness barrier.
- Canary per namespace, compare real cache hit, storage operations and egress to old Redis. Restore legacy adapter on error; do not change unrelated services.
- Success means target cache namespace no longer needs Redis in the request path and upstream correctness is maintained under cache loss.

### WP03 — PostgreSQL integration, without moving the primary yet

- Connect one safe Workers read path through Hyperdrive to the **current** PostgreSQL if network/security compatibility permits; otherwise run this WP against an isolated managed-provider staging database until the separate DB migration passes.
- Establish `FRESH` (cache disabled) and `CACHED` bindings. Validate TLS, `pg`/Postgres.js driver behavior, transactions, prepared-statement usage, pool saturation, failover, statement timeout, and cold-start performance.
- Benchmark Workers → Hyperdrive → DB across realistic regions and load, including p95/p99 and query plan. Never equate global Worker placement with global transaction latency.
- Keep legacy writers unchanged. PostgreSQL migration is tracked under WP11 and may happen later.

### WP04 — Rate limiting: security layer first, accounting separate

- Add WAF/bot management and Workers Rate Limiting to a **small selected stateless abuse-sensitive route**, keeping the existing Redis limiter as the sole authoritative service limiter initially.
- Shadow new decisions first. During mixed enforcement, define the combined policy to avoid unintentionally double-decrementing quota or rejecting users with independent counters. Use feature flags to choose one active *application* quota policy for an assigned cohort.
- Measure actual 429 false positives by tenant and region, known attack traffic, paid API latency, cost. Keep fraud/security baseline protections active even when new custom limits are disabled.
- Workers Rate Limiting is **per Cloudflare location and permissive**; it is not an accurate global billable quota. Use PG reservations/settlement for financial limits and, where exact global coordination is indispensable, sharded DO with an explicitly tested concurrency design.
- Full cutover only after policy parity; retire old Redis rate limit keys after stable observation and proper TTL expiry.

### WP05 — Idempotency and credit/financial consistency before risky queue changes

- Migrate idempotency records to PostgreSQL with unique `(tenant_id, operation_class, idempotency_key)`-like constraints, request fingerprint, result/receipt, expiry policy, and explicit behavior for conflicting reused keys.
- Every paid action follows a single transactional reservation/authorization gate, durable job creation, outbox insertion, and later reconciled settlement/refund. Enforce at DB constraint level; callbacks/webhooks also pass through canonical dedup. Keep a **provider capability matrix**: when the external provider does not support idempotency keys or status lookup, quarantine ambiguous outcomes for reconciliation instead of automatically repeating an expensive operation.
- Test concurrent identical requests from multiple Workers/regions; timeout after provider success; repeated queue delivery; lease recovery; refund retries; interrupted confirmation; duplicate webhook callbacks.
- If the result of a previous operation is unknown, return an honest pending/lookup result; **do not reissue a paid call just because an HTTP request timed out**.
- Do not duplicate a financial write to Redis and PostgreSQL; Redis can remain a non-authoritative cache until removed.

### WP06 — Auth and revocation: highest availability *and* security scrutiny

**Do not use Redis/KV dual-authoritative revocation.** Establish a new canonical PostgreSQL representation (e.g., `session_version`, `revoked_at`, token-family revocation ID/expiry, user/tenant epoch). Preserve compatibility with current tokens, sessions, and secret rotation policy.

1. Inventory exact login/OAuth/refresh/logout/SSO/2FA/session/token flows and existing Redis revocation TTL semantics. Include admin emergency revoke and tenant suspension.
2. Implement canonical PostgreSQL writes for **new** revocations while legacy enforcement remains active. For previously issued tokens, backfill all currently active Redis revocation entries, reconcile expiration and session issuance boundaries, and establish a durable change feed. If no lossless backfill/bridge is possible, retain legacy verification for the affected token lifetime; do not declare cutover.
3. Shadow compare legacy and new decisions using test/safe requests. Do **not** perform login, logout, revoke, email, session mutation, or extra token issuance in shadow.
4. Use `HYPERDRIVE_FRESH` for sensitive decisions and read-after-revoke. Prove emergency revocation works across geographic regions and under cache pressure. Sensitive endpoints fail closed if neither verified authority is available.
5. Canary with internal accounts, then explicit tenant cohorts, preserving old sessions and a tested per-cohort escape hatch. Rollback only after proving old enforcement sees every revocation issued during the new period, including pending events; otherwise keep the fresh canonical path or block sensitive writes.
6. Remove Redis auth reads only after the maximum pre-cutover token/session validity expires **or** every still-valid legacy session has a safe canonical representation and all entry points honor it.

**Hard stop:** Any cross-tenant authorization bypass, emergency-revoke mismatch, token replay vulnerability, or unplanned mass logout blocks promotion immediately.

### WP07 — Distributed locks and ephemeral state: fence first, move later

- Catalog every Redis lock and ephemeral key: ownership, TTL, extension policy, quorum assumptions, crash handling, whether it guards money, runner commands, backup snapshots, document writes, duplicate generation, or media processing.
- Introduce a shared PostgreSQL **monotonically increasing fencing token** for each protected resource and require every **durable state mutation** to reject stale fencing tokens. Do this even while lock acquisition remains in Redis.
- Move the acquisition path only after old/new actors both honor the same fencing epoch and lease owner in the shared PostgreSQL transaction. DO provides serialized per-entity admission/coordination; PostgreSQL validates authority before writes/settlements.
- Test Redis owner dies; DO owner dies; lease expires while a slow worker is active; network partitions; double dispatch; clock skew; timeout with provider callback; recovery after DB reconnect. Explicitly verify stale worker cannot commit after a newer lease owner.
- For truly ephemeral noncritical coordination, use DO keyed by user/tenant/resource. For critical jobs, use the existing `worker_jobs` lease/fencing contract rather than a second incompatible lock service.
- **Never roll back to a Redis-only lock algorithm** if it would ignore fencing issued by the new coordinator. Retain common PG guard through and after rollback.

### WP08 — Pub/sub and realtime: bridge via durable events

- Separate transient voice/signaling presence from persistent business notifications, approvals, `worker_jobs` progress, credits, and workflow state changes.
- Route new WebSocket sessions of an internal/test channel to sharded Durable Objects with Hibernation, per-connection authenticated tenant scope, sanitized attachment data, idle eviction, reconnect auth, heartbeat/resume, bounded memory and backpressure.
- Add canonical PostgreSQL outbox and monotonically scoped event ID/sequence for durable business events. Use Queues for fan-out and replay when warranted, NOT Redis/DO in-memory pub/sub as the only record.
- Transitional bridge: a **single elected publisher per event class** reads the canonical event stream and fans out to legacy Redis subscribers and new DO subscribers while both exist. Consumers deduplicate by canonical event ID. Avoid two independently firing publishers for one side effect.
- Test old subscribers with new publishers, new subscribers with old publishers, cross-region reconnect, lost WebSocket, hibernation/wake, offline clients, duplicate/delayed delivery, and no leakage across tenant/room boundaries.
- Reassign channel cohorts gradually; existing long-lived sessions drain normally unless a tested resumption strategy safely transfers them. If rollback occurs, route *new* sessions back immediately and drain/reconnect migrated sessions under a continuity policy.

### WP09 — First real BullMQ → PostgreSQL outbox + Cloudflare Queues cutover

Select a **low-risk, low-cost queue family** after audit—often a noncritical internal notification if it is truly reversible/non-financial. Do not use first cutover for charged media generation, backup restore, webhooks to third parties, live browser mutations, or Vertical Drama unless their idempotency is independently proven.

**Canonical pipeline:**

```text
API/service transaction:
  INSERT worker_jobs (idempotency key, tenant, payload ref, state=PENDING)
  INSERT outbox (event_id, job_id, routing family, version)
  COMMIT

Legacy dispatcher OR new dispatcher (exclusive job-family ownership):
  SELECT outbox WHERE undispatched WITH SKIP LOCKED
  SEND event_id + job_id to chosen transport
  MARK dispatched (reconciler replays uncertain sends)

Queues pull/push consumer or legacy BullMQ consumer:
  claim worker_jobs lease via PG fencing and tenant authorization
  if already completed/claimed by newer lease: ACK safe duplicate
  execute via registered runner (external effects guarded by idempotency)
  write receipt/settlement/state/audit with fencing
  ACK transport only after durable commit
```

- At-least-once Queues delivery requires application dedup. Push consumers and pull consumers have different ack/retry semantics; choose by workload. Existing local/non-Cloudflare runners can consume via a narrowly scoped pull client or receive calls from a short Workers dispatcher.
- Provide DLQ from day one, page on sustained backlog/oldest age, and give admins audited replay/quarantine controls. A configured DLQ is vital: messages without one may be discarded when retry limits are reached.
- Send small message **references**, not large prompts, private documents, media, or secrets. Store large payloads/artifacts in PostgreSQL/R2 with tenant-scoped fetch authorization.
- Drain the selected legacy BullMQ queue: pause new production enqueues for *that family only* through the transport router, allow active legacy consumers to finish, reconcile repeatable/delayed jobs, then enable the new family. Never let two independent schedulers create the same canonical job.
- Queue message order must not be treated as guaranteed business serialization. Enforce ordering where necessary through resource keys, PG sequence checks, and the job lease.
- Record the first live cohort's results and compare against old production p95/p99, queue lag, completion, provider cost, settlement, retry rate, and customer-visible status.

### WP10 — Migrate remaining queues as separately reversible families

A suggested **risk order** (subject to actual repository inventory and business criticality):

1. Proven-idempotent internal notifications / event projection.
2. Embedding refresh/update jobs: target **existing Vectorize**, avoid reindexing or changing search architecture; retain metadata/ACL in PostgreSQL.
3. Webhook deliveries, after downstream idempotency/event IDs, signing, retries and customer replay contract pass.
4. Backups, after immutable snapshots, checksum, restore drill and storage lifecycle verification.
5. Vertical Drama / video generation, after expensive-provider idempotency, long-running runner lease renewal, refunds, GPU/API concurrency and artifact persistence pass.
6. All remaining discovered BullMQ, Celery, Celery Beat, repeatable, delayed, watchdog, and maintenance workloads, **each with an owner, mapping and separate exit gate**.

Use Workflows *selectively* for durable multi-step orchestration where it adds value; do not introduce a second competing execution authority or automatically port active Spec 224/215 workflows. Store canonical job lifecycle in `worker_jobs` and map platform workflow state to it. Keep heavy encoding/browser/GPU execution out of short Workers consumer CPU paths.

For scheduled work, replace legacy Beat/repeatable producer with a **single authorized scheduler per schedule ID**; create canonical occurrences transactionally with `schedule_id + scheduled_at + tenant_id` uniqueness. Run both old and new scheduler calculations in shadow before switching the writer; catch up missed occurrences without duplicating paid work.

### WP11 — Separate managed-PostgreSQL migration (not a Redis prerequisite)

**Provider evaluation:** PlanetScale PostgreSQL connected to Hyperdrive is an integrated option; compare actual provider region near customers and/or Workers, HA/failover behavior, backup/PITR and restore objectives, TLS/IAM, supported extensions, logical migration/replication options, storage IOPS, p95/p99, connection caps, and price under the actual SmartAIHub workload. Do not assume a provider feature is included without testing it on the intended plan.

**Sequence:** provision target → schema/constraint parity → snapshot/initial copy → establish verified incremental change replication if supported → shadow read checks → test app with Hyperdrive FRESH/CACHED → rehearse promote and failback → **fence old writers** → reconcile final delta/checksum/sequence → move one controlled writer authority → reopen writes on new primary only → keep old primary read-only until rollback strategy is settled. With a sufficiently rehearsed provider-supported switchover, aim for zero planned customer disruption through buffered/retried writes, but publish the measured brief write pause if one is unavoidable. **Never promise an instantaneous or zero-risk DB failback** after new-primary writes; use a documented data-safe reverse replication/reconciliation plan, not a DNS flip.

Keep this work package independent from Redis retirement. If Redis is fully retired while PostgreSQL still runs on existing infrastructure, that is a legitimate successful interim milestone.

### WP12 — Prove Redis is no longer on any live execution path

- Prove there are no remaining active SmartAIHub Redis responsibilities through the complete inventory, call-site/runtime reachability checks, and targeted cutover evidence; a fixed elapsed observation window is not required.
- Audit direct imports, transitive dependencies, cron, deployment manifests, worker images, Celery broker/result backend, auth revocation checks, pub/sub consumers, fallback flags, runbooks, disaster-recovery scripts and tests. Delete code only once the bounded rollback dependency has expired.
- Freeze Redis production writes, snapshot safely, restrict credentials, retain restoration procedures per retention policy, then retire service and packages; remove unused secrets, network access and recurring cost.
- Retain a rollback-compatible artifact and the documented DB fencing/idempotency semantics for incident recovery; do not impose a fixed post-cutover delay before Redis retirement.

---

## 14A.4 Per-slice rollout and rollback protocol

Every work package above **must** supply a one-page release card with owner, upstream/downstream inventory, user cohort, start/stop gate, compatibility version, data-reconciliation method, monitoring links, cap on blast radius, on-call contact, and rollback rehearsal evidence.

| Stage | Suggested exposure | Required proof | Automatic stop example |
|---|---:|---|---|
| 0. Legacy baseline | 0% new | Real peak/quiet traffic and error budgets known | Baseline or owner missing |
| 1. Shadow (read-only/no side effects) | Mirror sampled requests, no user responses from new | Semantic diff; sensitive fields never logged | Permission/token or payload mismatch |
| 2. Internal dogfood | Allowlisted staff/test tenants | End-to-end real transaction, audit and rollback | Cross-tenant access or duplicate effects |
| 3. Canary A | ~1% **of eligible slice**, not whole site | Production metrics, peak observation | Availability/security breach |
| 4. Canary B | ~5% → 25% | SLO/cost/DB/queue checks and support report | Error or 429 deviation beyond guardrail |
| 5. Limited rollout | ~50% | Long-run soak including normal peak | Backlog/lease lag or unresolved rollback defect |
| 6. Full slice | 100% **of this slice only** | Post-release 24–72h observation | Guardrail alert → auto/manual traffic rollback |
| 7. Contract | After independent stability window | All residual consumers found, live drill pass | Any unknown Redis dependency |

Percentages and soak times are **initial rollout defaults**; adjust after measuring peak volume and risk. For sparse/high-consequence flows, percentages are misleading: use explicit internal user IDs, tenant allowlists, operation budgets, and 100% test coverage of critical scenarios.

**Proposed initial production guardrails** (tune against actual baseline before deploying):
- Planned customer-facing outage minutes: **0**. Track availability separately for API, auth, wallet, background jobs, and realtime; do not hide a broken subsystem in global uptime.
- No migration-attributable cross-tenant data exposure; revoked token accepted; duplicate paid provider call; double settlement/credit charge; stale fencing commit; or lost canonical event: **0 tolerated**.
- Candidate general-API availability: **≥99.95%** over suitable measurement windows where baseline supports it; route-specific regression cannot be masked by aggregate availability.
- General endpoint p95/p99 not more than a **provisional 15% slower** than comparable old cohorts at matched load; stricter for authentication. Record absolute ms as well as ratio and exclude warm-cache cherry-picking.
- No statistically meaningful increase in legitimate 401/403/429, 5xx, failed logins, websocket disconnects, or unresolved job queue age. Abort immediately for a security invariant breach, independent of statistical significance.
- Backlog recovery/RTO and correctness RPO must be established **per slice** before promotion; set RPO=0 for committed financial/job state in canonical PostgreSQL, acknowledging that upstream provider availability is not guaranteed.

**Rollback button / drill:**
1. Halt further flag promotion and suppress new dispatch on the affected capability; leave unaffected production paths intact.
2. Flip **only the affected route/tenant/job family** to its last known-good implementation, where doing so is data-safe. Use Workers version rollback if a code defect cannot be isolated by flags.
3. Drain, preserve, or fence in-flight requests/jobs and reconcile canonical PostgreSQL state before resuming the legacy worker; do not replay unverified provider-side effects.
4. For auth/locks/credit, refuse an unsafe rollback if it would discard new revocations, epochs, fences or settlements. Stay on the safe fresh-authority path or temporarily deny affected high-risk operations while reconciling.
5. Verify a real synthetic business transaction on the original API with the old handler, normal auth, consistent credits, and completed job receipt. Record detection-to-recovery time and customer impact.
6. Open a postmortem/bug entry and reduce canary exposure or redesign before the next attempt.

**Traffic reroute should be practicable within minutes for stateless slices**; long-lived WebSocket sessions, queue drains and database failback need their own explicitly tested recovery targets. No universal five-minute guarantee is implied.

---

## 14A.5 Operational risk and emergency policy

| Risk | Prevention | Detection | Safe response |
|---|---|---|---|
| Leaked tenant/private data in cache | Public-only allowlist; sanitized keys; no auth response cache | Differential privacy tests + trace sampling | Bypass/disable offending cache; investigate exposure |
| Stale revocation via KV/Hyperdrive | PG FRESH + verified session epoch | Cross-region emergency revoke probes | Fail closed on sensitive endpoints; keep proven legacy enforcement for compatible cohorts |
| Independent old/new lock owners | Shared PG fence before any coordinator change | Forced lease-expiry race tests | Fence stale worker; pause that job class, reconcile |
| Duplicate paid effect from Queues | PG idempotency + provider idempotency key + receipts | Billing/receipt reconciler | Quarantine event; never blind-retry paid call |
| Message loss in pub/sub bridge | PG outbox + consumer replay offset + dedup | Gap detector/sequence audit | Replay from canonical event log, not transient cache |
| DLQ silently grows | Configured DLQ, alert and admin replay | Oldest age/retry and DLQ dashboard | Stop new family dispatch if required; replay after remediation |
| Redis lock-in from hidden scripts | Runtime inventory + package graph + audit | Unexpected Redis commands post-cutover | Keep Redis running, add owner/work package; no premature shutdown |
| PlanetScale/provider outage | Independent DB HA/PITR validation | DB latency/connection saturation + synthetic transactions | Provider DR runbook; no blind old-primary reactivation |
| Excessive DO hotspots / costs | Partition/shard and bounded per-key workloads | per-object overload, rate, duration, cost | Scale shard count with compatible routing epoch or move traffic to old path |
| API origin and Workers both unhealthy | Cached safe fallback only for public data | Synthetic multi-region monitors | Serve degraded public content; preserve customer data correctness |
| Secret/token leakage in logs | Structured redaction/least privilege | DLP checks + incident alert | Rotate, contain and suspend affected integration per security runbook |
| Vectorize/embedding regression | Separate existing Vectorize from queue transport change | Index lag and RAG quality probes | Revert embedding transport only; preserve current index |

**No traffic flag may override** emergency secret containment, tenant scope, approval/fencing, or unresolved external provider certification.

---

## 14A.6 Observability, dashboard, alerts and business continuity

Provide a single **Admin Migration Control Center** (or integrate with existing Task Control Center) with: capability card, owner, legacy/new traffic %, by-tenant cohort, last successful rollout, current error budget, PG pool/latency, KV hit, DO overload, Queue backlog/DLQ/oldest age, Redis residual operations, active legacy jobs, reconciliation gap, error/incident link, cost delta, approval status, and button to request rollback (RBAC + auditable approval).

**Minimum telemetry dimensions:** `tenant_cohort`, `capability`, `route`, `job_family`, `provider`, `backend`, `release_id`, `operation_id`, `correlation_id`, `deployment_version`, `colo/region`; user or tenant raw identifiers only where required and access-controlled. Publish OpenTelemetry traces/Workers Logs and aggregate counters in a suitable metrics store (e.g., Analytics Engine plus existing monitoring). Do not write raw tokens, session IDs, voice streams, card/PromptPay details, private prompts or other secrets to logs.

**Alerts:**
- P0: cross-tenant exposure, revoked-token success, duplicate paid charge, stale worker commit, data loss.
- P1: broad elevated 5xx/401/429, failed login spike, queue delivery stalled, PostgreSQL unavailable, DLQ accumulation above budget, user-visible voice/realtime failure.
- P2: low hit ratio, elevated p95, persistent new-worker cold-start cost, Redis residual calls, slower drain, isolated noncritical degraded route.

Runbook must include: alert owner, escalation path, test-tenant synthetic check, safe feature flag rollback, in-flight transaction and queue reconciliation, scope of external provider effects, and public/customer communication criteria. Protect existing user flows on each release: signup/login, prompt/payment credit display, chat/LLM calls, RAG retrieval via Vectorize, R2 media, notifications, media generation, webhook, Runner/browser-related operations, and admin approval flows.

---

## 14A.7 Capacity, double-run economics and load tests

Treat monthly cost as a measured function, **not** a static vendor price quote:

```text
Total migration-run cost = old Redis and old compute still live
 + Workers requests and CPU
 + KV reads/writes/storage
 + DO requests + storage + active duration (hibernation where applicable)
 + Queues messages/operations/storage/DLQ retries
 + Hyperdrive + managed PostgreSQL compute/storage/IO/backup
 + existing Vectorize + R2
 + observability, cross-region network, extra staging and rollback capacity.
```

- **Double-run budget:** approve a temporary overlap budget; avoid declaring savings until the individual Redis consumer/process is actually shut down. Compare unit economics by 10k requests, 1k jobs, 1k concurrent WS clients, 1k RAG queries and one completed paid media generation.
- **DB sizing:** forecast QPS, concurrent DB connections, p95/p99 round trips from Thailand and other active regions, pool waiting, write amplification/outbox growth, table partitioning/archive, backup size, PITR and recovery rehearsal. Size for real peaks, not average traffic.
- **DO sharding:** do not centralize all tenant events/quotas/locks in one object; Cloudflare documents a soft ~1,000 requests/sec per individual Object and horizontal scale across objects. Benchmark specific key hotspots; consider multi-stripe mapping with epoch-safe remapping.
- **Workers rate limiting:** use as fast per-location abuse control only; globally exact plan credits and usage budgets require PG transactional accounting or specifically engineered sharded coordination.
- **Queues:** batch where useful; set per-provider concurrency and retry budget; route large/long-running work to existing runners/pull clients or future Containers. Dead-letter failed events rather than retry forever; avoid storing large payloads in messages.
- **Realtime:** prefer Hibernatable WebSockets for mostly idle connections; batch update frames as appropriate and observe fan-out hot spots. Separate presence from durable events.
- **Managed PostgreSQL:** evaluate plan tiers based on production HA/failover + regional performance rather than cheapest starting price. Keep provider selection reversible at the adapter boundary, not by scattering provider-specific SQL through all services.

### Required load tests before broad rollout

Test 1× measured peak, 2× peak, projected 6–12-month peak, a single hot-tenant burst, multi-region auth/revocation race, 10× queue redelivery scenario, long-lived WS reconnect storm, DB primary failover, R2/Vectorize throttling, Redis loss during old/new overlap, and complete Cloudflare service-specific throttling. Report throughput, latency, cost, data correctness, and recovery time by workload.

---

## 14A.8 Operational validation matrix T01–T24

These T-series checks complement Spec 245 A01–A40 and do not replace Spec 232-specific acceptance gates. In the original September plan they were **pre-Redis-decommission** tests; full-system retirement requires all additional R2 gates as well.

| ID | Test | Acceptance requirement |
|---|---|---|
| T01 | Worker public cache misses, hits, eviction | Same approved response contract; no private leakage |
| T02 | Cache stale/invalidate between regions | Staleness stays within documented safe contract |
| T03 | Hyperdrive FRESH vs CACHED | Sensitive reads always fresh; read-after-write passes |
| T04 | Login/logout/refresh/2FA/session continuity | No forced logout from migration; no token bypass |
| T05 | Emergency user/tenant revocation global | Revoked tokens rejected on all protected paths |
| T06 | Cross-tenant auth and Vectorize retrieval | Unauthorized metadata/document never exposed |
| T07 | Rate limit local/multi-region | Abuse blocked; legitimate traffic false-429 within gate; quota isolation per tenant |
| T08 | Exact paid credits/idempotency under concurrency | One canonical reservation/settlement per operation |
| T09 | Redis/DO/PG lock owner crash and lease expiry | Stale actor cannot commit after fence is superseded |
| T10 | Duplicate/late webhook and Queue events | No duplicate externally visible business effect |
| T11 | Queue retry, transient failure, DLQ and replay | Every committed job terminally reconciled or actionable |
| T12 | Scheduler overlap, delayed/repeat jobs | One canonical occurrence per schedule/time/tenant |
| T13 | Pub/sub bridge duplication/drop/reorder | Durable events deduped, gap replay; no loss |
| T14 | WebSocket Hibernation and reconnect | Presence reasonable; durable state recoverable |
| T15 | Runner disconnection mid paid generation | Receipt/lease/settlement safe; no blind provider retry |
| T16 | Embedding worker replacement | Vectorize data integrity, index lag and search parity |
| T17 | Backup job migration | Verified restore and immutable checksum |
| T18 | Version/config rollback at peak load | User-facing route reverts without unsafe state loss |
| T19 | Managed DB failover rehearsal if WP11 used | Tested write ownership and provider RPO/RTO |
| T20 | Complete Redis-off chaos test | Every certified capability works without Redis |
| T21 | High-load 2× peak and hot-tenant scenario | SLO and budget within approved thresholds |
| T22 | Secrets/PII/log and tenant audit review | No leakage; traceability and least privilege intact |
| T23 | Residual runtime import/scheduler scan | No Redis-dependent reachable path in decommission scope |
| T24 | Mixed old/new deployment compatibility | Old version can safely serve during each rollout window |

The independent verifier must exercise production-like conditions; unit tests alone do not constitute migration certification. Record evidence artifacts per test, run timestamp, exact git SHA, deployment version, plan/version, synthetic account IDs (redacted), logs/trace links, reviewer and PASS/BLOCKED.

---

## 14A.9 Ownership, evidence and checkpoint semantics

**Per work package deliverables:**
- Design/ADR, current-vs-target dependency map, concrete files changed, migrations (expand and later contract), deployment manifests, feature flags, dashboards, alert rules, runbooks, backup/recovery evidence, performance/cost reports, independent QA result, and owner approval.
- A machine-readable checkpoint: `WP`, `phase`, `candidate_sha`, `deployed_version`, `backend_old`, `backend_new`, `cohort`, `approval`, `test_run`, `rollback_run`, `RPO`, `RTO`, `observed_metrics`, `open_incidents`, `blocked_reason`, `resume_from`.
- Store reports as repository artifacts and link them from the Task Control Center. Avoid declaring completion while the worktree is dirty without a reproducible candidate SHA or while production evidence is absent.

**Responsibility model:**
- Migration lead: dependency map, per-capability sequencing, release approvals.
- Service owners: cache/auth/rate/leases/realtime/queue adapters and contract tests.
- Database owner: PG transactions, migrations, Hyperdrive, backup/PITR, PG primary transition.
- Security owner: tenant ACL, revocation correctness, secrets, audit, high-risk fallback decisions.
- SRE/on-call: SLO, capacity, alerting, canary, incident response and rollback drills.
- Independent verifier: adversarial and end-to-end checks, no reliance solely on implementer report.
- Business/support owner: customer communication criteria, payment/credit impact, rollback business acceptance.

**Do not mark `REDIS_RETIREMENT_DONE` until** every in-scope Redis responsibility is migrated or explicitly classified out of scope, the new paths pass their targeted acceptance checks, production telemetry/configuration confirms no remaining application dependency, and rollback data hazards are resolved. There is no fixed 14–30 day waiting period. `CODE_COMPLETE`, `STAGING_PASS`, `SHADOW_PASS`, `CANARY_PASS`, `PRODUCTION_100%`, and `RETIRED` remain distinct states; post-cutover monitoring continues for defect discovery but does not delay the Redis retirement decision.

---

## 14A.10 First-release implementation handoff

The first release must ship something observable in production without waiting for a platform-wide transition:

**Sprint/Release A — safe foundation + first live route:**
1. Audit the actual running Redis/BullMQ inventory, active route and deployment topology. Do not touch production code based solely on the filenames in this plan.
2. Add isolated provider interfaces and default-to-legacy feature flags with no behavior change. Add tracing and a per-capability owner dashboard.
3. Select one provably public read-only production endpoint, create a thin Worker + safe cache implementation, run contract/privacy tests and shadow comparisons.
4. Canary this one route under 1% → 5% → 25% → 50% → 100% while every other user operation remains on old infrastructure. Document live metrics and execute a route-only rollback rehearsal.
5. Publish `WP01_PRODUCTION_PASS` only with measured real request traffic and zero unauthorized cache exposure. If the endpoint lacks enough volume, measure a longer production window rather than simulating success.

**Release B — independently reduce Redis load:** migrate one audited noncritical cache namespace, establish one Hyperdrive-FRESH read path against the current DB (where supported), and test one selected abuse-rate route in shadow, each with separate flags/rollback. Publish the observed reduction in Redis commands and origin calls, not a subjective "migration complete" claim.

**Release C — correctness foundation:** move canonical idempotency and credit safety to PG if not already present; then revocation cohorts; then shared fencing for leases. These have security/data correctness gates and cannot be rushed merely to hit a calendar deadline.

**Release D — realtime and background jobs:** choose one isolated realtime channel, then one low-risk queue family. Do not pause all BullMQ workers, migrate all sessions, or repoint all cron jobs together. Use the outbox/reconciler/DLQ and tenant-based canaries throughout.

**Release E — scale and retire:** complete the remaining job families, certify managed PostgreSQL separately if selected, remove residual Redis callers only after production observation, and retire infrastructure last.

### Example implementation instruction for Codex / Claude / Spec 224

> Implement **WP00 → WP01 only** from this plan, on the actual current SmartSpecPro/SmartAIHub HEAD. First audit real routes and runtime Redis/BullMQ usage. Preserve current production Redis, PostgreSQL, Vectorize, R2, `worker_jobs`, auth, credits, existing Runner certification gates and all customer flows. Introduce additive provider adapters and default-legacy rollout flags; ship one verified safe public read-only Workers route with cache. Use shadow read comparisons, tenant/privacy contract tests, allowlisted canary, production telemetry and an exercised single-route rollback. Do not proceed to the next *dependent/high-risk* work package or decommission a Redis workload until the selected WP01 slice has independent PASS evidence; isolated inventory/compatibility work may continue in parallel. Report exact changed files, test outcomes, candidate SHA, live metrics, blockers and `resume_from`. Do not call paid providers unnecessarily.

---

## 14A.11 State and route-transition reconciliation

A single API route or job family MUST own one production-serving backend for each persisted operation, with route generation and immutable operation/request identity where applicable. Maintain a compatibility table of currently deployed producer/consumer binaries, DB schema range, accepted event/message versions, session/token generations, webhook callback versions, and feature-flag cohort. During source-schema expansion, deploy backward-compatible readers/writers **before** transferring traffic; contract cleanup waits until rollback obligations expire. Legacy Redis consumers may continue on *unmigrated* families; no hidden Redis fallback is permitted on promoted families. Legacy sessions/tokens must be safely backfilled or kept on a proven authorized path until expiry; do not cause a mass logout. New global revocations must remain enforceable if an individual cohort is explicitly rolled back. Shadow traffic is restricted to reads/synthetic providers and MUST NOT cause real external effects.

### Database cutover: special global authority fence

The managed PostgreSQL provider transition is **not** an ordinary feature-flag rollback. All old writer identities must be fenced before accepting writes on the new primary. Replication/checksum and sequence-level reconciliation must be demonstrated. Repointing DNS to the old database after new writes **is prohibited** without a separately proven reverse replication and data-safe failback protocol. Track the application-level write pause/queuing window and fail-closed behavior; a proxy-only rollback is insufficient.

---

# 15. Compatibility gates by subsystem

| Gate | Required evidence |
|---|---|
| Web/UI | production build + asset routing + CSP + auth callback |
| Node API | runtime contract suite + differential tests |
| Python | package/runtime matrix + execution test |
| PostgreSQL | restore/PITR + schema + latency + transaction tests |
| Hyperdrive | unsupported-feature scan + fresh/cached tests |
| R2 | local-file elimination + integrity hash |
| Vectorize | retrieval/ACL regression only |
| Auth | revocation/role/tenant cross-region tests |
| Credits | exact-once settlement tests |
| Queues | duplicate/redelivery/unknown ACK tests |
| Durable Objects | restart/hibernation/serialization tests |
| Realtime | gap-free replay/reconnect tests |
| Agents | canonical authority conformance |
| Sandbox/Container | isolation/resource/egress tests |
| Runner | lease/fence/offline recovery |
| Media | artifact integrity/cancel/retry |
| Browser Use | session/auth/certification |
| Scheduler | timezone/DST/missed occurrence |
| Observability | full trace correlation |
| Security | secrets/IAM/WAF/supply-chain |
| DR | restore + regional/provider outage drill |

---

# 16. Cloudflare compatibility facts to encode in tests

The implementation MUST treat platform documentation as versioned input, not timeless assumptions.

As verified on 2026-09-24:

1. Workers Node.js compatibility is broad and enabled by default for newer compatibility dates, but some APIs remain partial/stubbed.
2. Python Workers run under Pyodide and support FastAPI and compatible package ecosystems, but native/system behavior still requires package-by-package verification.
3. Hyperdrive does not support PostgreSQL advisory locks, `LISTEN/NOTIFY`, SQL-level prepared-statement management, or arbitrary session state.
4. Queue messages are limited and Queue consumers have bounded execution duration; long work needs durable handoff.
5. Durable Objects have their own storage, CPU and connection limits and are not a substitute for PostgreSQL business truth.
6. Compatibility dates/flags affect Worker runtime behavior and MUST be pinned and regression-tested.

A weekly or pre-release compatibility refresh job SHOULD record:

```yaml
checked_at:
cloudflare_compatibility_date:
workers_runtime_version:
node_compat_assumptions:
python_compat_assumptions:
hyperdrive_assumptions:
queue_limits:
do_limits:
container_limits:
breaking_change_review:
evidence_refs:
```

---

# 17. Automated scanner requirements

## 17.1 Static repository scan

At minimum detect:

```regex
redis|ioredis|bullmq|celery
localhost|127\.0\.0\.1
child_process|spawn\(|exec\(
fs\.|/tmp|/var/|/home/
listen\(
cluster
worker_threads
LISTEN |NOTIFY |pg_advisory
cron|schedule
systemctl|service
docker.sock
playwright|chromium|puppeteer
ffmpeg|imagemagick
sqlite
CUDA|torch|tensorflow
process\.env
http://
ws://
```

Do not treat each match as an error. Each finding must be classified by AST/runtime context.

## 17.2 Dependency scan

For each dependency:

```yaml
name:
version:
runtime:
native_binary:
postinstall:
node_builtin_usage:
python_native_extension:
browser_assumption:
filesystem:
network:
known_worker_compat:
probe_status:
placement:
```

## 17.3 Runtime tracing

Run a bounded production/staging trace window to discover open connections, Redis calls, DB statements by class, local file reads/writes, subprocess launches, ports, DNS names, webhook callbacks, job producers, cron execution and memory/CPU hotspots.

Static scan without runtime trace is insufficient for final classification.

---

# 18. Migration Control Center

Extend the existing admin control surface.

Views:

```text
Full Migration Overview
Compatibility Matrix
Runtime Placement
Required Refactors
Wave Planner
Service Dependency Graph
API Route Cutover
Database Migration
Spec 232 Status
Cloudflare Runtime Certification
Legacy Debian Dependencies
Cost / SLO
DR / Rollback
Retirement Checklist
```

For every component show:

```text
Current Runtime
Target Runtime
Compatibility
Blockers
Required Refactor
Tests
Owner
Current Wave
Canary %
Error Budget
Rollback State
Last Evidence
```

No UI control may directly override canonical job ownership.

---

# 19. Cutover protocol

For each independently routable component:

```text
1. DISCOVER
2. COMPATIBILITY_PASS
3. REFACTOR_COMPLETE
4. SHADOW_DEPLOY
5. DIFFERENTIAL_VERIFY
6. CANARY_1
7. CANARY_5
8. CANARY_25
9. CANARY_50
10. CLOUDFLARE_PRIMARY
11. LEGACY_DRAIN
12. RETIRED
```

Percentages are configurable; high-risk routes may require tenant allowlists instead.

Automatic promotion is allowed only when no hard invariant failure exists, SLO is within accepted budget, security tests pass, financial reconciliation passes, rollback is tested and evidence is current.

---

# 20. Rollback rules

Rollback is a versioned routing transition, not a runtime exception fallback.

Never:

```text
try Cloudflare
catch
  silently send to Debian
```

Instead:

```text
PAUSE new promotion
reconcile in-flight effects
fence current owner
create new route generation
activate certified rollback target
observe
```

For destructive/paid external operations, reconcile provider state before replay.

---

# 21. Disaster recovery

Mandatory drills:

1. PostgreSQL unavailable.
2. Hyperdrive unavailable.
3. Queue delivery duplicate.
4. Queue publish result unknown.
5. DO restart/hibernation.
6. R2 transient failure.
7. Cloudflare Worker deployment regression.
8. Runner offline.
9. external provider 429/5xx.
10. webhook delayed/duplicated.
11. secrets revoked.
12. DNS route error.
13. managed PostgreSQL regional incident.
14. Debian disabled before final cutover (staging drill).
15. full Debian power-off after M245.9.

For each drill record:

```yaml
scenario:
impact:
detection:
automatic_behavior:
manual_action:
rpo:
rto:
data_loss:
duplicate_effect:
security_effect:
evidence:
result:
```

---

# 22. Cost compatibility

Migration shall compare:

```text
Debian electricity/hardware
managed PostgreSQL
Hyperdrive
Workers requests/CPU
Queues
Durable Objects
KV
R2
Vectorize
Containers
Browser Rendering
Workers AI if used
external LLM/media providers
Runner electricity/hardware
observability
egress
backups
```

Cost is evaluated per active user, tenant, 1,000 chat calls, 1,000 jobs, 1 GB media, workflow run, browser session and agent run.

A component may be technically compatible but economically inappropriate; placement can remain Runner/external when policy permits.

---

# 23. Repository and CI gates

Add CI commands conceptually equivalent to:

```text
migration:scan
migration:compat
migration:verify-node
migration:verify-python
migration:verify-db
migration:verify-routes
migration:verify-storage
migration:verify-background
migration:verify-security
migration:verify-retirement
```

CI fails on:

```text
new unclassified Debian dependency
new direct Redis/BullMQ caller on retired family
new local persistent filesystem write
new localhost production endpoint
unsupported Hyperdrive session feature
unknown cron/service
missing target runtime
secret in migration artifact
route promoted without evidence
```

---

# 24. Definition of Ready before migration begins

Spec 245 implementation may begin immediately with discovery. **Two-tier readiness applies:** (a) `LOCAL_SLICE_READY` for isolated, side-effect-free read routes with complete local dependencies; (b) `STATEFUL_WAVE_READY` requiring full affected dependency closure and canonical-authority tests. Full Debian retirement additionally requires **complete production process/network/storage coverage**. A missing unrelated component inventory must not prevent an isolated certified public read route from launching; it always prevents `FULL_SYSTEM_READY`.

The following checklist applies to each stateful/broad component; for a `LOCAL_SLICE_READY` public route, supply a written scoped exception for currently unneeded system-wide items, retain all hard security/rollout gates, and continue global discovery:

- [ ] authoritative repo/spec registry checked;
- [ ] compatibility compiler implemented sufficiently for target wave;
- [ ] Debian runtime inventory captured;
- [ ] target Cloudflare account capabilities verified;
- [ ] managed PostgreSQL plan approved;
- [ ] rollback architecture available;
- [ ] baseline metrics captured;
- [ ] secret handling approved;
- [ ] staging environment available;
- [ ] route ownership recorded;
- [ ] monitoring and alerting available.

---

# 25. Full-system Definition of Done

Migration is complete only when all are true:

- [ ] all production routes classified;
- [ ] no production request requires Debian;
- [ ] no production background job requires the original Debian mini server; an optional registered Runner on the same hardware is permitted only if it can be powered off without impacting any required customer capability;
- [ ] Debian is not PostgreSQL authority;
- [ ] Debian is not Redis/BullMQ authority;
- [ ] no canonical file exists only on Debian;
- [ ] no production cron/systemd task exists only on Debian;
- [ ] no webhook points exclusively to Debian;
- [ ] no secrets require Debian filesystem;
- [ ] Cloudflare path passes auth/tenant/credits regression;
- [ ] Spec 232 completion gates pass;
- [ ] managed PostgreSQL restore/PITR passes;
- [ ] R2 integrity passes;
- [ ] Vectorize retrieval/ACL passes;
- [ ] agent/workflow/Runner authority tests pass;
- [ ] production observability traces complete end-to-end;
- [ ] disaster recovery drills pass;
- [ ] cost is within approved operating envelope;
- [ ] rollback runbook exists and is tested;
- [ ] Debian network-deny smoke passes;
- [ ] Debian power-off smoke passes;
- [ ] observation window passes;
- [ ] production credentials removed from Debian;
- [ ] final retirement evidence signed.

---

# 26. Required artifacts during implementation

```text
P245_COMPATIBILITY_INVENTORY.json
P245_RUNTIME_PLACEMENT.yaml
P245_REQUIRED_REFACTORS.yaml
P245_DEPENDENCY_GRAPH.json
P245_NETWORK_MAP.yaml
P245_FILESYSTEM_MAP.yaml
P245_SERVICE_MAP.yaml
P245_DB_COMPATIBILITY.md
P245_NODE_COMPATIBILITY.md
P245_PYTHON_COMPATIBILITY.md
P245_ROUTE_MATRIX.yaml
P245_MIGRATION_WAVES.yaml
P245_ROLLBACK_RUNBOOK.md
P245_DR_EVIDENCE.md
P245_COST_BASELINE.md
P245_DEBIAN_RETIREMENT.md
P245_FINAL_VERIFY.md
```

---

# 27. Initial implementation order

### P245.0A — Repository scanner
Build static source/dependency scanner.

### P245.0B — Debian inspector
Read-only process/systemd/cron/network/filesystem inventory.

### P245.0C — Database compatibility inspector
Detect unsupported Hyperdrive/session features and transaction assumptions.

### P245.0D — Node runtime probes
Generate entrypoint/package compatibility results.

### P245.0E — Python runtime probes
Generate package/module placement results.

### P245.0F — Runtime placement compiler
Convert evidence into classification.

### P245.0G — Pre-migration backlog generator
Produce P0/P1/P2 required changes.

### P245.0H — Migration Control Center read-only view
Expose discovered topology and blockers without changing production routing.

Only after **a specific component's** dependency and compatibility evidence is reliable may that component enter its independently gated first production wave. Global P245.0 discovery continues in parallel. The earliest production milestone should be an *actually existing* safe public/read-only route with a live shadow/canary and independently verified rollback, never a made-up API path.

**OP245-WP00→WP01 instruction:** inventory the real running repo/host, generate compatibility classification and P0 refactors for the selected route, add default-legacy migration adapter + telemetry, ship only that one verified Workers route. Preserve Redis/PostgreSQL/Vectorize/R2/Runner/credits and all existing live certification blockers. Do not trigger paid external providers, change DNS globally, or start a database write transfer in this first increment.

---

# 28. Acceptance scenarios

## A01 — Unknown daemon
A Debian daemon not declared in repository is discovered at runtime.
Expected: classified `UNKNOWN`, owner required, final retirement blocked.

## A02 — Node package imports but uses stubbed API
Expected: runtime probe fails; not `WORKERS_NATIVE`.

## A03 — Python module requires native Linux package
Expected: Container/Runner placement or explicit refactor.

## A04 — API writes local disk
Expected: P0 refactor to R2/approved storage before promotion.

## A05 — PG advisory lock
Expected: compatibility blocker; refactor or governed direct path.

## A06 — `LISTEN/NOTIFY`
Expected: compatibility blocker for Hyperdrive path.

## A07 — localhost service call
Expected: target service binding/API generated before migration.

## A08 — hidden Celery schedule
Expected: discovered via runtime/systemd/cron inspection.

## A09 — Redis fallback remains after promotion
Expected: CI/runtime retirement gate fails.

## A10 — Queue duplicate
Expected: one business effect.

## A11 — Cloudflare route slower than baseline
Expected: promotion pauses according to SLO policy.

## A12 — auth revocation during migration
Expected: old session denied under canonical policy.

## A13 — two writable databases
Expected: migration blocked unless one is canonical and replication contract is explicit.

## A14 — R2 upload succeeds but DB pointer update fails
Expected: orphan reconciled; no false canonical pointer.

## A15 — Debian power off before final retirement
Expected: staging drill identifies dependencies.

## A16 — final Debian power-off test
Expected: complete production smoke passes.

## A17 — Vectorize
Expected: no pgvector migration task created; only compatibility regression.

## A18 — media tool uses FFmpeg
Expected: placed on certified Container/Runner, not blindly Worker.

## A19 — browser automation requires persistent profile
Expected: certified browser/runtime placement, not stateless Worker assumption.

## A20 — existing Spec <=213 behavior
Expected: preserved through adapters; no retroactive spec rewrite required.

## A21 — Spec 224 in-progress
Expected: migration consumes current interfaces and does not rewrite its active lifecycle.

## A22 — Spec 232 partially migrated
Expected: Master Plan reflects per-family state independently.

## A23 — secret found in `.env`
Expected: redacted finding + secret migration/rotation requirement; secret never copied into report.

## A24 — external webhook still points to Debian
Expected: Debian retirement blocked.

## A25 — production filesystem has unknown files
Expected: retirement blocked until classified.

## A26 — component is compatible but too costly on Cloudflare
Expected: placement review may choose Runner/managed external without violating Cloudflare-first control plane.

## A27 — Worker compatibility date changes
Expected: conformance suite reruns before rollout.

## A28 — Cloudflare product limit changes
Expected: compatibility metadata invalidated and re-certified.

## A29 — rollback requested
Expected: explicit new route generation; no silent runtime fallback.

## A30 — final verification
Expected: independent verifier uses live evidence; document completion alone cannot mark migration complete.

## MP31 — Public safe-route first without global inventory completion

Expected: a specific existing public, read-only route passes its **complete local** dependency graph, privacy and differential contract tests, shadow/allowlisted canary, route-only rollback and measurable real traffic while unrelated Debian discovery remains active; no undocumented stateful writes are affected.

## MP32 — Database is not a global Redis/edge prerequisite

Expected: a certified Worker read route and/or Redis cache slice operates against the existing canonical PostgreSQL where approved; M245.4 proceeds independently; final Debian retirement is BLOCKED until managed DB migration is certified.

## MP33 — Auth backfill of still-valid revoked tokens

Expected: old token families and Redis revocation TTLs are inventoried and represented in the new fresh authority or remain under proven legacy checks through natural expiry. Cross-region emergency revoke and safe rollback retain all new revocations.

## MP34 — Old and new real side-effects never shadow together

Expected: every mirrored request touching money, email, media providers or browser mutation uses fake/no-op or read-only comparison; a duplicate production external effect is a release-blocking failure.

## MP35 — Shared resource fencing precedes coordinator migration

Expected: old Redis lock holder and new DO coordinator both respect one current PostgreSQL fencing epoch; a delayed Redis worker cannot commit after the switch or explicit rollback.

## MP36 — Database write-authority transfer/failback

Expected: old writers fenced, verified final delta and one new writable primary; attempted DNS-only failback after new-primary writes must fail a safety gate unless approved reverse replication/reconciliation has passed.

## MP37 — Capacity hot tenant / real peak / double-run budget

Expected: 1× and 2× measured peak, hot-tenant load, mixed old/new peak, queue backlog and DB pool tests produce per-cohort p95/p99, spend and RTO evidence; production promotion blocks on breached guardrail.

## MP38 — Explicit per-slice rollback and observation

Expected: staged 1%/5%/25%/50%/100% eligible-route canary or risk-adjusted allowlist, per-slice traffic evidence, rehearsed code and feature rollback, rollback horizon and no conflation of `SHADOW_PASS` with `PRODUCTION_PASS`.

## MP39 — Managed database and Redis finish in either order

Expected: removing Redis first does not mark full-system done while the Debian PostgreSQL instance remains essential; finishing managed PG first does not mark Redis-retirement done while reachable Redis callers remain.

## MP40 — Comprehensive merged-document lineage

Expected: operational WP00–WP12, T01–T24, A01–A30 and MP31–MP40, master M245.0–M245.10 and canonical Spec 232/242 interfaces all resolve to one R2 file; no accidental creation of a second migration spec or replacement execution ledger.

---

# 29. Known design risks

1. Treating "Cloudflare compatible" as "should run on Workers".
2. Moving Python monolith without module-level classification.
3. Forgetting systemd/cron/manual scripts.
4. Assuming Docker services equal actual runtime services.
5. Local filesystem state surviving unnoticed.
6. Hyperdrive session incompatibilities.
7. Edge-to-database latency.
8. Queue retry mistaken for business retry.
9. Duplicate execution during mixed old/new deployment.
10. secrets copied during migration.
11. application route compatibility drift.
12. WebSocket state loss.
13. external callbacks to old origin.
14. hidden paid provider side effects.
15. premature deletion of Debian.
16. Cloudflare cost surprises.
17. overloading Durable Objects.
18. long jobs placed in Queue consumers.
19. incomplete Python package support.
20. platform compatibility-date changes.

All risks require explicit evidence or mitigation; none may be closed solely by architectural intent.

---

# 30. Implementation handoff instruction

An implementation agent receiving this spec SHALL begin with **read-only P245.0 discovery**.

It MUST NOT:

- cut production traffic;
- stop Redis;
- stop BullMQ;
- stop Celery;
- migrate the database;
- edit production DNS;
- rotate secrets;
- delete files;
- rewrite Specs <=213;
- alter Spec 224 lifecycle;
- claim compatibility from source inspection alone.

First deliver:

```text
1. actual repository topology
2. actual Debian process topology
3. compatibility matrix
4. blockers
5. required refactors
6. proposed target runtime placement
7. recommended first low-risk migration wave
```

Only then may production migration work packages be admitted.

---

# 31. Source-verification baseline

Cloudflare platform assumptions used by this specification were reviewed against current Cloudflare documentation on 2026-09-24 for:

- Workers Node.js compatibility and compatibility dates;
- Python Workers and supported package model;
- Hyperdrive PostgreSQL feature compatibility;
- Cloudflare Queues limits;
- Durable Objects limits;
- runtime compatibility flags.

These assumptions SHALL be rechecked during P245.0 and before each major production migration wave.


## 31.1 Integrated September 23 operational documentation reference set

These URLs were listed in the previously un-numbered operational plan. They are **reference inputs, not a claim that the account or currently deployed runtime was reverified by this document merge**. Recheck the exact Cloudflare compatibility date, account plan, limits, and vendor pricing before using them for production admission.

(accessed for this plan on 2026-09-23)

- Cloudflare Hyperdrive + PlanetScale: https://developers.cloudflare.com/hyperdrive/planetscale/
- Hyperdrive query caching and disabling for fresh reads: https://developers.cloudflare.com/hyperdrive/concepts/query-caching/
- Hyperdrive unsupported PostgreSQL features: https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/
- Workers KV consistency: https://developers.cloudflare.com/kv/concepts/how-kv-works/
- Workers Cache API locality: https://developers.cloudflare.com/workers/runtime-apis/cache/
- Workers Rate Limiting per-colo accuracy: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Durable Objects guidance: https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
- Durable Objects capacity limits: https://developers.cloudflare.com/durable-objects/platform/limits/
- Durable Objects hibernation WebSockets: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- Cloudflare Queues delivery: https://developers.cloudflare.com/queues/reference/delivery-guarantees/
- Cloudflare Queues DLQ: https://developers.cloudflare.com/queues/configuration/dead-letter-queues/
- Cloudflare Queues pull consumers: https://developers.cloudflare.com/queues/configuration/pull-consumers/
- Cloudflare Queues limits: https://developers.cloudflare.com/queues/platform/limits/
- Cloudflare Workers gradual deployments: https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/
- Cloudflare Workers rollbacks: https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/
- Cloudflare Workers observability: https://developers.cloudflare.com/workers/observability/

**Integrated historical reference limitation:** Cloudflare products, limits, billing and integration terms change. Confirm the exact account plan, region availability, and latest docs again at implementation time. This plan does not claim access to private production dashboards, the current repository filesystem, or provider account settings.

---

# 32. Final architectural principle

The objective is not:

> "Move every Debian process to a Cloudflare product."

The objective is:

> **Remove the Debian mini server as an untracked production dependency while preserving SmartAIHub's canonical authorities, behavior, security, recoverability and economics.**

Therefore migration decisions are made per workload.

Cloudflare becomes the primary **edge, API, control, coordination and managed execution platform**, while workloads that are structurally better suited to managed PostgreSQL, approved external providers, Containers or registered SmartAIHub Runners remain there under the same canonical SmartAIHub control plane.

---

# 33. R2 merge provenance and duplicate-authority prevention

The September 23 operational migration plan was an **un-numbered** planning artifact. Its substantive WP00–WP12 implementation content, zero-downtime invariants, deployment protocol, risk policies, telemetry, load/cost test matrix, T01–T24, handoff, and reference set are integrated in §0.3–0.4 and §14A. The original 245 R1 compatibility/compiler, whole-system M245 tracks, per-domain tests A01–A30 and retirement contract remain present. R2 resolves two ambiguities: (1) managed PostgreSQL is an independent parallel track rather than a global early-phase blocker; and (2) component-local readiness for isolated public reads does not weaken stateful and final full-system gates.

| Original un-numbered plan section | Integrated location |
|---|---|
| §0 Executive decision | §0.2 conflict resolution and existing §0–1 |
| §1 Reported current caller inventory | §0.4 unverified inventory hints |
| §2 Architecture, cache, limits | §0.1, §5, §14A.2 |
| §3 Always-on safety | §0.3 |
| §4 WP00–WP12 | §14A.1–14A.3 |
| §5 Cutover, rollback, SLO | §14A.4 |
| §6 Risks/emergency | §14A.5 |
| §7 Observability | §14A.6 and existing §18 |
| §8 Capacity/cost | §14A.7 and existing §22 |
| §9 T01–T24 test matrix | §14A.8 |
| §10 Owners/evidence | §14A.9 and existing §§24–26 |
| §11 Immediate production handoff | §14A.10 and existing §§27,30 |
| §12 Official references | §31.1 |

## 33.1 Source checksums

```text
Spec 245 R1: 27e96e284685b32172c9765c5044a66280a569203e97d80c70e2c38d738852af
September 23 incremental plan: c678d20154813d89701af542bd6be0719d1556fd5ce94df046851defcb8914d0
```

These identify **document contents**, not a signed migration/commit, verified current repository tree or successful Cloudflare production test.

## 33.2 Invariants required by the independent verifier

- No independent job-ledger, credit ledger, permission store or workflow-finality authority added by the merge.
- P232.* and its six redis groups remain inside Spec 232; Spec 245 consumes certified per-family readiness.
- Spec 242 Cloudflare Agents/Sandbox certification remains separate and is not inferred from Workers deployment.
- Specs ≤213 source spec files remain immutable; Spec 224 in-progress execution is not rewritten.
- Vectorize is already migrated and only requires compatible retrieval/ACL/indexing transport smoke.
- One complete **production-critical host dependency closure**, an actual Debian network-deny and power-off test, and full post-cutover observation are mandatory before `M245.10 = VERIFIED`.
---

# 33. R3 — Twelve-Pass Failure-Oriented Gap Audit and Mandatory Corrections

**Audit date:** 2026-09-24  
**Baseline:** Spec 245 R2 Integrated  
**Audit scope:** architecture, compatibility, data correctness, runtime placement, operational rollout, tenant/custom-domain behavior, external integrations, disaster recovery and Debian retirement.  
**Evidence limitation:** These passes harden the specification. They do **not** certify current repository code, the Debian host, Cloudflare account limits, managed PostgreSQL, production traffic, or a deployed candidate.

## 33.1 Normative precedence

Sections **33–46 are normative R3 corrections**. Where any earlier R1/R2 wording can be interpreted more weakly, these sections prevail.

The implementation SHALL NOT treat an R3 audit `FIXED` result as implementation evidence. A gap is “fixed” only in the specification until the corresponding acceptance test has live evidence.

## 33.2 Twelve-pass audit register

| Pass | Failure-oriented lens | Gap found | R3 correction |
|---:|---|---|---|
| 01 | Worker runtime fidelity | Build/import success can mask partially supported/stubbed Node APIs; compatibility-date changes can alter behavior. | Pin a **Runtime Compatibility Profile** per deployed Worker, run behavioral probes, and prohibit promotion on import-only evidence. |
| 02 | Filesystem semantics | `node:fs` availability could be mistaken for persistent server disk compatibility. | Add **Persistence Semantics Probe**; all durable files must map to R2/PG, while Worker virtual FS is temporary/runtime-only. |
| 03 | Large request/upload path | Proxying large uploads through Workers can create memory/body/time pressure and duplicate buffering. | Use signed/direct R2 upload or streaming path where appropriate; certify limits and integrity before route promotion. |
| 04 | Database cutover integrity | Schema parity alone does not prove sequence/identity, trigger, extension, replication lag, DDL-lock or final-delta correctness. | Add **Database Migration Compatibility Manifest**, online-DDL gate, sequence/high-watermark reconciliation and old-writer fencing. |
| 05 | External callbacks and provider trust | Providers may whitelist origin IP/URL, sign exact callback URL, or continue calling Debian after route cutover. | Add callback dual-route window, signature-version overlap, provider inventory, callback drain and “zero old-origin callback” retirement gate. |
| 06 | Secret/key migration | Copying secrets without version overlap can break JWT/webhook/API verification; indefinite overlap weakens security. | Add versioned key epochs, bounded dual-verification windows, rotation proof, revocation and old-secret destruction evidence. |
| 07 | Tenant/custom-domain migration | White-label domains, TLS certificates, OAuth origins, cookies and CSP may fail independently from `smartaihub.app`. | Add per-domain compatibility inventory and tenant-domain canary/rollback before global Debian retirement. |
| 08 | Privacy/data lifecycle during shadow | Shadow comparison can duplicate private data into logs, caches or temporary stores beyond original retention. | Add migration-data classification, minimization, retention TTL, deletion propagation and no-cross-tenant shadow reuse. |
| 09 | Configuration/IaC drift | Staging/prod bindings, queue names, DO namespaces, compatibility dates and secrets can drift from the reviewed plan. | Introduce signed **Deployment Configuration Manifest**, drift detection and promotion only from immutable candidate configuration. |
| 10 | Dependency graph / migration cycles | Per-component readiness can still form cycles such as API→DB→Auth→API or scheduler→queue→worker→scheduler. | Require machine-checkable migration DAG, strongly-connected-component detection, explicit bridge strategy and critical-path ownership. |
| 11 | Long-lived connection draining | HTTP canary rollback does not safely migrate WebSocket/WebRTC/streaming sessions already bound to old deployment. | Add connection generation, drain deadline, resume cursor, session reauthorization and old-endpoint shutdown gate. |
| 12 | Final retirement false positive | Network-deny/power-off may pass during quiet periods while monthly jobs, rare callbacks, backups or dormant tenant routes remain hidden. | Add **time-horizon coverage proof**, scheduled-occurrence simulation, rare-path synthetic suite and post-power-off observation before credential destruction. |

---

# 34. Runtime Compatibility Profile

Every Worker or Cloudflare runtime deployment SHALL have an immutable profile:

```yaml
runtime_profile_id:
candidate_sha:
wrangler_version:
compatibility_date:
compatibility_flags:
node_compat_mode:
python_runtime:
bindings_schema_hash:
deployment_config_hash:
probe_suite_version:
certified_at:
evidence_refs:
```

Rules:

1. `compatibility_date` MUST be explicitly pinned in the deployed artifact even where newer Workers enable Node compatibility by default.
2. Upgrade of compatibility date, Wrangler major/minor affecting runtime behavior, or compatibility flags invalidates the relevant behavioral certification until the probe suite passes again.
3. A dependency MAY import successfully while calling an unsupported/stub API later. Therefore `npm install`, bundling, import tests or TypeScript compilation do not prove runtime compatibility.
4. Probe actual methods used by SmartAIHub, not the entire theoretical package API.
5. Record the exact Cloudflare documentation/runtime assumption date in evidence.

Required probes include:

```text
HTTP client/server assumptions
TLS client/server assumptions
streams and abort
AsyncLocalStorage/context propagation
worker_threads if used
filesystem semantics
crypto
WebSocket
timers
environment access
database driver
multipart/form-data
request/response streaming
module loading
```

`RUNTIME_PROFILE_DRIFT` blocks automatic promotion.

---

# 35. Persistence Semantics and Large Payload Contract

## 35.1 Filesystem

A runtime exposing a filesystem API is not automatically compatible with a Debian service that depends on durable local disk.

Every file operation is classified:

```text
EPHEMERAL_RUNTIME
DURABLE_OBJECT
DURABLE_ARTIFACT
CACHE_DISPOSABLE
SECRET
LOCAL_DEVICE_REQUIRED
UNKNOWN
```

Placement:

- `EPHEMERAL_RUNTIME` → bounded Worker/Container/Sandbox temporary space where certified.
- `DURABLE_OBJECT` → PostgreSQL or approved canonical state store.
- `DURABLE_ARTIFACT` → R2 with integrity metadata.
- `CACHE_DISPOSABLE` → approved cache.
- `SECRET` → approved secrets mechanism.
- `LOCAL_DEVICE_REQUIRED` → Runner.
- `UNKNOWN` → migration blocker.

A successful write/read inside one Worker invocation SHALL NOT be used as proof of persistence across invocations, deployments or locations.

## 35.2 Upload/download

For large objects, media and documents:

1. Prefer direct or signed R2 upload/download when business policy permits.
2. Avoid buffering the entire body in Worker memory.
3. Preserve content hash, content type, declared/observed size, tenant ownership and upload intent.
4. Finalize canonical PG metadata only after object existence/integrity validation.
5. Orphan uploads are reconciled and removed under retention policy.
6. Client retry uses upload/session idempotency and cannot create multiple canonical assets.
7. Antivirus/content-policy pipelines, if present, remain enforced after direct upload.
8. Differential tests include interrupted upload, retry, oversized object, malformed multipart and expired signed URL.

---

# 36. Database Migration Compatibility Manifest

Before M245.4 can promote writes, create:

```yaml
database_migration:
  source_engine:
  source_version:
  target_engine:
  target_version:
  extensions:
  schemas:
  tables:
  partitions:
  sequences_and_identity:
  triggers:
  functions:
  generated_columns:
  rls:
  collations:
  timezones:
  large_objects:
  advisory_lock_users:
  listen_notify_users:
  logical_replication:
  ddl_lock_risk:
  migration_tool:
  snapshot_lsn_or_equivalent:
  replication_lag_slo:
  final_delta_method:
  old_writer_fence:
  rollback_data_strategy:
  pitr_test:
  checksum_strategy:
```

Mandatory corrections:

- Reconcile sequences/identity high-watermarks after copied data; duplicate primary keys after cutover are a hard failure.
- Inventory extension/version compatibility and application-visible collation/timezone behavior.
- Test trigger/function semantics, not merely schema creation.
- Large/locking DDL MUST use an online or bounded-lock method with measured lock budget.
- Migration jobs MUST be resumable/idempotent and store progress outside transient shell state.
- Final writer transfer requires a **write fence**. DNS change is not a write fence.
- If CDC/logical replication is used, persist source checkpoint/LSN-equivalent and prove no gap from snapshot through final delta.
- Old primary remains read-only or otherwise fenced for the rollback horizon; it MUST NOT be blindly reopened as writer after new-primary writes.
- Restore/PITR must include `worker_jobs`, credits, outbox, audit and ownership state at a logically consistent recovery point.

---

# 37. External Callback, Webhook and Egress Compatibility

Create `external-integration-migration.yaml` for every provider/integration:

```yaml
integration:
direction: inbound|outbound|bidirectional
current_origin:
target_origin:
callback_urls:
signature_scheme:
signature_key_epoch:
ip_allowlist:
dns_dependency:
mtls:
timeout:
retry_semantics:
idempotency:
old_origin_last_seen:
drain_deadline:
owner:
```

Rules:

1. Provider callback migration is a first-class dependency, not an afterthought.
2. During a bounded transition, old and new callback URLs MAY coexist only if both map to the same canonical idempotent business operation.
3. Signature/key rotation MUST support a bounded overlap where required.
4. IP-based trust alone SHOULD be replaced or supplemented by cryptographic service identity where provider capability permits.
5. Capture `old_origin_last_seen`; Debian retirement requires zero unexplained callback activity over the defined horizon plus provider configuration verification.
6. Outbound provider calls must preserve egress requirements, TLS/mTLS, request signing, timeout and idempotency semantics.
7. A callback to an old binary cannot mutate a newer attempt without current tenant/job/fence validation.

---

# 38. Secret and Cryptographic Key Epoch Migration

Secrets SHALL NOT be copied ad hoc from Debian `.env` files into Cloudflare.

For each security-sensitive key:

```yaml
secret_name:
purpose:
scope:
current_epoch:
target_epoch:
dual_verify_allowed:
dual_verify_deadline:
issuer_locations:
verifier_locations:
rotation_owner:
revocation_proof:
old_material_destroyed:
```

Protocol:

1. provision new secret/key version;
2. deploy verifiers that understand allowed epochs;
3. rotate issuers;
4. observe old epoch decay;
5. revoke old epoch;
6. prove old material no longer works;
7. remove old material from Debian/backups according to retention/security policy.

JWT signing, refresh-token protection, webhook signatures, service credentials and encryption keys require purpose-specific handling.

Indefinite “accept both old and new” is prohibited.

---

# 39. Tenant / Custom Domain / OAuth Compatibility

The migration inventory SHALL enumerate every production domain class:

```text
smartaihub.app
API/MCP hosts
tenant subdomains
custom white-label domains
asset/CDN domains
webhook callback domains
OAuth redirect domains
WebSocket/WebRTC/signaling domains
email link domains
```

Per domain verify:

- DNS ownership and TTL;
- certificate issuance/renewal;
- Cloudflare zone/account ownership;
- Worker route;
- host-based tenant resolution;
- canonical URL;
- cookie `Domain`, `Secure`, `SameSite`;
- CORS;
- CSP/connect-src/frame-src;
- CSRF origin;
- OAuth/OIDC redirect registration;
- magic/reset/invite links;
- WebSocket upgrade;
- custom-domain fallback/rollback.

No global `smartaihub.app` success may be used to certify custom tenant domains.

Tenant domains migrate by bounded cohorts and have their own evidence.

---

# 40. Migration Data Privacy and Shadow-Execution Policy

Migration testing can create secondary copies of private data. Therefore every shadow/differential path SHALL declare:

```yaml
data_classes:
source_scope:
shadow_destination:
retention:
redaction:
encryption:
cross_tenant_reuse: false
model_provider_egress:
log_fields:
deletion_propagation:
owner:
```

Requirements:

1. Default to metadata/hash comparison instead of copying full private payloads.
2. Paid/destructive side effects are disabled in shadow.
3. Private prompt/document bodies are not written to broad observability logs.
4. A user/tenant deletion or legal-retention action propagates to migration copies according to policy.
5. Shadow cache keys cannot be reused across tenants unless data is explicitly public/declassified.
6. Production data copied to staging requires an approved sanitized path; raw production secrets/tokens are prohibited.
7. Migration evidence stores enough information to prove behavior without becoming a new sensitive-data repository.

---

# 41. Deployment Configuration Manifest and Drift Gate

Each candidate promotion SHALL bind code and infrastructure configuration:

```yaml
candidate:
  git_sha:
  build_digest:
  wrangler_version:
  runtime_profile_id:
  compatibility_date:
  bindings:
  queues:
  durable_objects:
  kv_namespaces:
  r2_buckets:
  vectorize_indexes:
  hyperdrive_configs:
  routes:
  environment:
  feature_flags:
  secret_epoch_refs:
  schema_version:
  migration_manifest_digest:
```

Rules:

- staging and production differences must be explicit, not accidental.
- no production deploy from an uncommitted/dirty worktree.
- config drift from IaC/approved manifest raises `CONFIG_DRIFT`.
- resource names/IDs are environment-scoped to prevent staging-to-production cross-binding.
- promotion evidence includes configuration digest, not only source SHA.
- rollback identifies both code version **and configuration version**.

---

# 42. Dependency DAG and Cycle Resolution

`dependency-graph.json` SHALL be executable as a migration DAG.

Every node includes:

```yaml
component:
requires_before_shadow:
requires_before_canary:
requires_before_primary:
blocks_debian_retirement:
bridge_available:
bridge_expiry:
owner:
```

The planner SHALL detect strongly connected components.

A cycle is not resolved by ordering fiction. It requires one of:

```text
compatibility bridge
stable interface extraction
temporary edge proxy
shared canonical database authority
versioned dual-protocol adapter
explicitly co-migrated atomic wave
```

For each cycle, store the selected break strategy and rollback implications.

The Control Center shows:

- critical path;
- SCC/cycles;
- blockers;
- parallelizable waves;
- irreversible steps;
- retirement blockers.

---

# 43. Long-Lived Session Drain Contract

HTTP traffic percentages do not fully control existing WebSocket/WebRTC/streaming sessions.

Every long-lived protocol SHALL carry:

```text
deployment_generation
session_generation
tenant/security_epoch
resume_cursor or canonical receipt
connected_at
drain_deadline
```

Deployment/cutover procedure:

1. stop assigning **new** sessions to legacy generation;
2. allow existing sessions to drain for a bounded policy window;
3. preserve canonical progress/events outside connection memory;
4. notify/reconnect where protocol permits;
5. reauthenticate and reauthorize on resume;
6. deduplicate replay against canonical event sequence;
7. terminate legacy session endpoint only after drain or explicit forced-migration policy.

For WebRTC/media, signaling migration and media-plane behavior are certified separately.

A closed socket is not proof that its associated background job was cancelled.

---

# 44. Time-Horizon Coverage and Debian Retirement Proof

A quiet 24–72 hour period is insufficient when monthly/weekly/rare paths exist.

Before `M245.10 DECOMMISSION`:

1. inventory recurrence intervals for all schedules;
2. simulate future scheduled occurrences for at least the longest supported recurrence class;
3. execute synthetic rare-path fixtures for backup, restore, maintenance, tenant onboarding, password/reset/invite, payment reconciliation, expiry jobs, webhook retry, provider callback, certificate/domain renewal and any discovered low-frequency function;
4. inspect access logs/firewall denies for Debian over the observation period;
5. keep Debian powered off but recoverable during the observation window;
6. alert on any attempted dependency;
7. re-open migration if an unexplained dependency is observed.

Required retirement evidence:

```yaml
power_off_started_at:
observation_window:
longest_schedule_class:
simulated_occurrence_coverage:
rare_path_suite:
old_origin_callback_last_seen:
debian_network_attempts:
unclassified_attempts:
rollback_artifact:
credential_destruction_authorized:
final_approvers:
```

Credentials are destroyed only after the observation/rollback policy permits.

---

# 45. R3 Additional Acceptance Scenarios

## A31 — Stubbed Node API
Package bundles and imports, but a used API throws `Not implemented`.
Expected: `WORKERS_NATIVE` certification fails.

## A32 — Virtual filesystem false positive
Worker can write `/tmp` or virtual FS, while app expects persistence across deployment.
Expected: classified temporary only; durable dependency must move to R2/PG/Runner.

## A33 — Compatibility-date upgrade
Candidate changes compatibility date with no application source change.
Expected: runtime profile invalidated; behavioral probes rerun.

## A34 — Interrupted 4 GB class media upload
Expected: direct/streaming object path resumes/retries without duplicate canonical asset or Worker full-body buffering.

## A35 — Database sequence lag
Rows copy correctly but target identity/sequence is below max imported ID.
Expected: write cutover blocked until high-watermark corrected and tested.

## A36 — Long DDL lock
Schema migration blocks production write path beyond approved budget.
Expected: abort/rollback DDL, no route promotion.

## A37 — Provider sends old webhook after cutover
Expected: accepted only through bounded compatibility route, idempotently reconciled against current canonical state; retirement remains blocked while unexplained traffic continues.

## A38 — Old webhook signing key
Expected: works only during approved overlap; fails after epoch revocation.

## A39 — White-label custom domain
Main domain passes but tenant OAuth callback/cookie scope fails.
Expected: affected tenant cohort not promoted; global pass cannot mask failure.

## A40 — Shadow privacy deletion
Tenant data is deleted while shadow artifacts exist.
Expected: migration copies follow required deletion/retention policy and evidence records completion.

## A41 — IaC binding drift
Production Worker points at staging KV/Queue/R2 binding.
Expected: configuration digest/drift gate blocks promotion.

## A42 — Migration dependency cycle
API requires new auth, new auth requires migrated DB, DB validation relies on API.
Expected: SCC detected and explicit bridge/co-migration strategy required.

## A43 — WebSocket rollback
HTTP traffic rolls back while old WebSocket sessions remain on candidate generation.
Expected: generation-aware drain/resume; no mixed authority or lost terminal event.

## A44 — Monthly backup path during power-off
No live traffic hits Debian for seven days, but monthly backup would.
Expected: scheduled simulation/rare-path suite catches dependency before credential destruction.

## A45 — Old primary failback temptation
Managed PostgreSQL has accepted writes, operator attempts DNS failback to old DB.
Expected: prohibited until reverse reconciliation/fencing proves data-safe writer transfer.

## A46 — Candidate code identical, configuration changed
Expected: new configuration version receives independent evidence and rollback target.

---

# 46. R3 Implementation Order Amendment

The existing R2 incremental rollout remains valid, with these mandatory insertions:

### Before any live Worker route
- create/pin Runtime Compatibility Profile;
- create Deployment Configuration Manifest;
- pass behavioral probes for APIs actually used.

### Before any route handling private/user data
- pass migration privacy/shadow policy;
- verify auth/domain/cookie/CORS/CSP behavior for that cohort.

### Before database write cutover
- complete Database Migration Compatibility Manifest;
- certify online-DDL impact;
- reconcile sequence/identity and replication high-watermark;
- fence old writers.

### Before custom-domain tenant rollout
- run per-domain TLS/DNS/OAuth/cookie suite.

### Before realtime rollout
- certify long-lived session drain/resume generations.

### Before Debian credentials are destroyed
- complete time-horizon/rare-path coverage;
- complete power-off observation;
- prove no unexplained callbacks/network attempts.

## 46.1 Updated first implementation slice

The first implementation work SHOULD remain non-destructive:

```text
P245.0A repository scanner
P245.0B Debian inspector
P245.0C database compatibility inspector
P245.0D Node runtime behavioral probes
P245.0E Python runtime probes
P245.0F runtime placement compiler
P245.0G required-refactor generator
P245.0H read-only Migration Control Center
P245.0I runtime/configuration manifest generator
P245.0J dependency-DAG/SCC analyzer
```

The first production Worker route may proceed once **its own** readiness gate passes; it does not need to wait for unrelated full-system refactors. However, retirement of Debian remains blocked until the full-system gates pass.

---

# 47. R3 Audit Outcome

The twelve requested review passes found material gaps and all were incorporated as normative requirements in R3.

R3 specifically strengthens:

- runtime fidelity instead of import/build-only compatibility;
- filesystem persistence semantics;
- large-file transfer behavior;
- database replication/cutover correctness;
- external callback draining;
- key/secret epochs;
- tenant/custom-domain migration;
- privacy of shadow data;
- IaC/configuration drift control;
- migration dependency-cycle resolution;
- long-lived connection draining;
- Debian retirement evidence over rare/long-horizon paths.

**Remaining unknowns are implementation evidence, not document claims:** actual SmartSpecPro HEAD, Debian services, package versions, live PostgreSQL features, tenant domains, provider callback configuration, Cloudflare account entitlements/limits and production traffic MUST be discovered in P245.0.
---

# 48. R4 — Fourteen Additional Failure-Oriented Audit Passes (R4-01–R4-14)

**Review date:** 2026-09-25 (Asia/Bangkok). **Input baseline:** the complete Spec 245 R3 file, including prior twelve-pass appendix and merged WP00–WP12. **Revision status:** design-hardened candidate, **not** deployed, implementation-tested or production-certified. These are **fourteen additional review lenses**, not a relabeling of R3 passes. The source of each new finding is either a concrete omission in R3 or a clarified currently documented Cloudflare failure mode.

## 48.1 Precedence, acceptance inventory and source-of-truth boundaries

- R4 §§48–64 are normative additions/clarifications; R3 §§33–47 supersede weaker R2 material, and R4 supersedes conflicting earlier text. Requirements not explicitly superseded remain effective.
- **Acceptance-ID normalization (newly found during merge audit):** historical R2 merged-plan scenarios previously named `A31–A40` collided with the independently added R3 `A31–A40`. This R4 assigns the ten historical operational scenarios stable IDs **MP31–MP40**, preserving their content and traceability. R3 A31–A46 retain their identifiers. Complete canonical acceptance inventory is **A01–A60**, plus **MP31–MP40** (ten additional merged-plan scenarios), operational **T01–T24**, and all specialist gates in Spec 232 / Spec 242. Historical phrases “A01–A40” in provenance-only text must not be treated as the current count. CI SHALL reject duplicate test IDs within each namespace and resolve historical A31–A40 references by title/source digest instead of guessing.
- The previous numbering reservation remains **provisional**: inspect current authoritative repo registry, main branch and open PRs/worktrees before committing any `245-*` path. Source-file delivery alone does not reserve the number.
- Spec 245 owns **migration planning, compatibility, release gates and Debian retirement only**. Spec 232 retains ownership of six Redis/BullMQ categories and job-family cutover; Spec 242 owns Cloudflare Agent/DO/Sandbox runtime integration; Feature 186/195 and existing `worker_jobs` remain the single durable job authority; Spec 220 retains authorization; Spec 207 financial ledger; Spec 229 retrieval and existing Vectorize index; Spec 224 implementation/finality must not be rewritten. Specs 1–213 original files remain untouched.
- `FIXED_IN_SPEC` is not `IMPLEMENTED`, `TESTED`, `DEPLOYED`, `CERTIFIED`, or `RETIRED`.

# 49. R4 audit register — fourteen independent review passes

| ID | New failure lens | Material gap in R3 | R4 normative correction | New acceptance |
|---|---|---|---|---|
| R4-01 | Cross-Worker identity propagation | A Service Binding can call an internal Worker without propagating Cloudflare Access `ctx.access`; R3 lists bindings but not downstream principal proof. | Signed/scoped internal invocation context, independent downstream authorization and denial tests (§50). | A47 |
| R4-02 | Multi-Worker/versioned frontend rollout | HTTP % can mix frontend assets and Worker-to-Worker RPC schema versions; R3 config digests do not certify cross-service release compatibility. | Cross-Worker version matrix, version affinity and immutable asset retention (§51). | A48 |
| R4-03 | Durable Object irreversible lifecycle | Class lifecycle changes are not ordinary gradual deployments and can prevent rollback across the change. | Dedicated DO lifecycle release train, expand/migrate/contract, forward/backward RPC probes and explicit no-rollback gate (§52). | A49 |
| R4-04 | PostgreSQL RLS under transaction pooling | R3 tags Fresh queries but does not prove per-query/transaction tenant settings with reused Hyperdrive pool connections. | Transaction-scoped RLS context and hostile pool-reuse isolation suite (§53). | A50 |
| R4-05 | R2/CDN deletion and revocation | Strongly consistent R2 deletes do not evict cached custom-domain content; R3 retention/deletion testing ignores cached old bytes. | Private-asset CDN policy, purge verification, negative-cache and revoked-download probes (§54). | A51 |
| R4-06 | R2 multipart integrity | R3 requires hash parity but could use multipart ETag as a whole-file digest. | Explicit end-to-end SHA-256/checksum manifest and immutable object promotion (§55). | A52 |
| R4-07 | Cross-store disaster recovery | PG PITR alone cannot rewind already-mutated R2 objects, DO coordination or Vectorize projection to the same logical time. | Recovery consistency manifest, R2/PG reconciliation, DO rebuild strategy, governed Vectorize repair (§56). | A53 |
| R4-08 | Direct-origin / WAF bypass | A Cloudflare-fronted service can still expose Debian IP or unprotected origin routes while migration is in progress. | Origin ingress allowlist, authenticated origin-only path and spoofed-header denial (§57). | A54 |
| R4-09 | Feature-flag/control-plane partition | Config drift is covered, but flag cache delay or Control Center outage may create split routing generations or unsafe emergency toggles. | PG-fenced rollout decisions, bounded snapshots, fail-safe freeze, approved break-glass (§58). | A55 |
| R4-10 | Offline/old client replay | Browser PWA, mobile app and Desktop Runner may replay queued operations against new API contracts after old UI/API retirement. | Client protocol support window, offline-outbox test and versioned receipt/idempotency migration (§59). | A56 |
| R4-11 | Active realtime authorization expiry | R3 reauthorizes reconnect; a continuously open WebSocket can retain authorization after tenant suspension. | Time- and event-bounded reauthorization on active sessions and privilege-sensitive messages (§60). | A57 |
| R4-12 | Migration action crashes | A controller can crash between irreversible DNS/DB/route commands and recording its checkpoint; re-running blindly may duplicate transitions. | Crash-safe migration command journal with preconditions, observation/reconcile and guarded resume (§61). | A58 |
| R4-13 | Release supply-chain provenance | Source SHA and Wrangler manifest do not alone prove the deployed artifact matches reviewed dependencies, IaC and approvals. | Immutable build/SBOM/provenance/deploy attestation and separation of privileges (§62). | A59 |
| R4-14 | Capacity and entitlement admission | Estimated Workers/DO/Queues capacity can pass staging yet exceed account-specific limits or temporary dual-run spend during canary. | Per-wave entitlement proof, measured cost ceiling and overload/pause drills (§63). | A60 |

---

# 50. Cross-Worker Service Identity and Authorization Contract (R4-01)

A Service Binding establishes a configured internal call path, **not automatic end-user authorization propagation**. In particular, Cloudflare Access `ctx.access` does not propagate from Worker A to Worker B across an HTTP/RPC Service Binding. Do not permit internal Workers to assume the caller's frontend auth decision automatically travels with the RPC.

Every privileged Service Binding hop SHALL carry an internal invocation envelope derived server-side from the original verified principal:

```yaml
internal_invocation:
  schema_version: 1
  request_id:
  authenticated_principal_ref:
  tenant_id:
  delegated_scopes:
  authz_epoch:
  audience_service:
  issuer_service:
  issued_at:
  expires_at:
  nonce_or_jti:
  parent_trace:
  signature_or_verified_capability:
```

**Rules:** receiving Worker validates service identity, audience, scope, tenant, expiry and replay/idempotency as appropriate; it fetches fresh PG authorization on protected mutations and does not trust arbitrary inbound `X-Tenant` or forwarded identity headers. Bindings/service accounts are least privilege; public and internal entrypoints are enumerated separately. Avoid arbitrary forwarding of browser cookies or full Access JWTs. Service-identity proofs and user authorization are **both** necessary for sensitive operations.

**Certification:** test missing/stale/forged invocation context; compromised low-privilege Worker calling admin or cross-tenant RPC; service recursion and missing downstream contract version; ensure an unauthorized downstream side effect leaves neither business mutation nor credit charge.

**Dependency:** Spec 220 owns authorization semantics; Spec 245 only requires deployment conformance. Cloudflare source: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/ (Access context limitation and binding lifecycle).

# 51. Cross-Worker Version Matrix, Affinity and Asset Compatibility (R4-02)

Workers Gradual Deployments can independently route successive requests to different active versions. Independent Worker-to-Worker subrequests may cross an older/newer API contract. The existence of a tested single Worker SHA does not certify a composed production request chain.

**Required `cross-worker-release-matrix.yaml`:**

```yaml
release:
  frontend_build:
  asset_manifest_digest:
  worker_versions: {gateway: null, auth: null, chat: null, billing: null}
  rpc_contract_min_max: {}
  queue_envelope_versions: {}
  tenant_domain_cohort: []
  version_affinity_strategy:
  downstream_version_override_if_justified:
  old_asset_retention_deadline:
  compatibility_test_refs: []
  rollback_target_matrix:
```

**Rules:** use version affinity for multi-request browser flows where it prevents incompatible asset/API combinations; version keys are routing hints, not authentication credentials. Retain prior content-hashed JS/CSS/assets through the rollback window or serve them from immutable versioned assets; do not allow HTML version A to reference a JS bundle unavailable under Worker B. Test forward/backward RPC combinations and queue envelopes across every supported release window. Version overrides, if used, must refer to an active deployment version and have an explicit fallback/stop policy if unavailable. A Worker-to-Worker call chain must not become authorized merely because a version key matches.

The release matrix SHALL be validated at canary, 50%, 100% and rollback, including tenant custom domains and fresh anonymous sessions. **Version skew in frontend assets is a hard stop if it breaks login, payments or persistent work.**

Source: https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/ ; https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/version-affinity/

# 52. Durable Object Lifecycle Release Train (R4-03)

Gradual Worker code deployments and Durable Object class lifecycle changes are not interchangeable. Existing and new Worker/DO API versions may coexist during a gradual deployment, while class lifecycle changes are atomic and cannot be rolled back across the migration boundary in the ordinary Worker rollback mechanism.

**Mandatory release lanes:**

1. `DO_SCHEMA_COMPAT`: forward/backward-compatible DO storage and RPC evolution, covered by old/new client matrices.
2. `DO_CLASS_LIFECYCLE`: class create/rename/delete/transfer or storage-backend-sensitive namespace change; dedicated change ticket, explicit rollback limitation and independent release approval.
3. `REGULAR_WORKER_CODE`: normal Worker code changes; no implicit class lifecycle change embedded in a routine canary.

For `DO_CLASS_LIFECYCLE`, require read-only preflight of current class/namespace mappings, durable state backup/rebuild plan when business-relevant, approved migration semantics, staging reproduction, compatibility deployment before any destructive contract, independent security review, and a forward-recovery plan. Never advertise `wrangler rollback` as sufficient if crossing the class lifecycle boundary is prohibited. Do not attempt in-place storage-backend conversion if Cloudflare does not support it; introduce an explicitly governed new namespace/dual-compatible adapter and reconstruct or transfer state according to Spec 242.

**Hard gate:** No irreversible DO class transition until all Worker versions that may call it are compatible and the recovery procedure has passed staging. Source: https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/with-durable-objects/ ; https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/

# 53. Hyperdrive Pool-Reuse Tenant Isolation (R4-04)

Hyperdrive transaction pooling returns connections to a shared origin pool after each transaction and resets session settings. Therefore an ORM assuming `SET app.tenant_id` persists across queries is unsafe. Treat RLS and tenant scope as a **behavioral contract**, not merely an enabled database flag.

**Required repository strategy:**

- All authorization-relevant reads use `HYPERDRIVE_FRESH`, with query caching disabled.
- Every RLS-dependent query MUST establish its trusted tenant/principal context **within the transaction containing that query** (e.g. transaction-scoped `SET LOCAL` or `set_config('app.tenant_id', trusted_tenant, true)`), or use proven tenant-parameterized SQL plus enforced DB policy. Do not pass untrusted client tenant IDs straight into database context.
- If one logical HTTP operation issues queries in distinct transactions, context is re-established for each; an ORM may not silently run a protected statement on a separate pooled connection with absent context. Never rely on sticky session state.
- Use least-privileged roles; privileged admin/migration access uses separate connections and audited paths, not ordinary tenant pooled roles.
- Verify the same logical tenant is enforced for R2 pointer resolution, Vectorize post-filter and credit settlement.

**Hostile suite:** alternate two tenants on a single small pool under high concurrency; inject transaction abort/timeouts, missing context, malicious stale session settings and long transaction starvation. Assert denied cross-tenant reads and writes and that an absent tenant context fails closed. Measure p99 transaction wait and connection limits. Cloudflare source: https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/

# 54. R2 Cache Invalidation and Private Asset Revocation (R4-05)

R2 object reads/deletes through binding/S3 API are strongly consistent, but **content served through a cached custom domain may remain stale** after overwrite/deletion; cached 404 may also outlive a newly uploaded object.

- Default restricted/private assets to an authenticated Worker retrieval route with fresh ACL and short-lived, scope-bound access grants; never assume deleting the R2 object or revoking an R2 key revokes already cached public bytes or leaked presigned URLs instantly.
- For public/versioned CDN content, immutable keys are preferred. On sensitive delete/revoke, invalidate public cached copies when applicable and verify through each documented delivery route and region; also address client/browser caches and signed URL expiry as distinct exposure windows.
- Disallow caching of private raw documents, tenant-only generated media or regulated content in unscoped Cloudflare Cache API/CDN. If selective private caching is explicitly approved, a fresh authorization gate must always precede delivery and cache keys must be tenant/user-policy-version scoped.
- Upload/overwrite/404 regression suite checks origin R2 binding vs CDN custom-domain response vs authorized Worker access; mismatches become migration blockers for restricted content.

Source: https://developers.cloudflare.com/r2/reference/consistency/

# 55. Multipart Artifact Checksum and Immutable Promotion (R4-06)

R2 multipart ETags are composition markers and are **not** a cryptographic whole-file digest. In a multi-TB media/artifact pipeline, confusing ETag with SHA-256 could certify corrupted or truncated artifacts.

**Required object manifest:**

```yaml
artifact:
  canonical_asset_id:
  tenant_id:
  immutable_staged_key:
  object_version_or_upload_ref:
  upload_session_id:
  expected_bytes:
  observed_bytes:
  sha256_expected:
  sha256_verified:
  multipart_completion_ref:
  content_type:
  scan_policy_result:
  committed_pg_pointer:
  promotion_fencing_token:
```

- Use a cryptographically strong application-level content digest (e.g. SHA-256) or separately verified equivalent integrity workflow, not a multipart ETag equality as sole proof.
- Complete multipart upload first; verify object size/checksum and any policy scan; update canonical PG object pointer only after authoritative current job/tenant/lease checks. Immutable staged keys avoid concurrent last-writer-wins overwrite of one canonical key; garbage-collect stale incomplete uploads according to reviewed retention and lifecycle policy.
- Recovery reconciles `R2_PRESENT_PG_MISSING`, `PG_POINTER_R2_MISSING`, `STALE_ARTIFACT`, and `PARTIAL_MULTIPART` without inventing a successful job completion.

Source: https://developers.cloudflare.com/r2/objects/upload-objects/ ; https://developers.cloudflare.com/r2/api/workers/workers-api-reference/

# 56. Cross-Store Recovery Consistency Manifest (R4-07)

A Worker version rollback **does not roll back R2, KV, Durable Objects or Vectorize state**, and PostgreSQL PITR does not automatically rewind other services. The master recovery protocol SHALL produce a cross-store consistency manifest before admitting writable traffic after a major recovery.

```yaml
recovery_epoch:
pg_restore_checkpoint_or_lsn:
pg_canonical_schema_revision:
worker_jobs_reconciliation_checkpoint:
outbox_replay_checkpoint:
credit_effect_reconciliation_checkpoint:
r2_object_inventory_digest:
r2_missing_or_orphaned_count:
do_coordination_rebuild_policy:
vectorize_index_version_and_ingest_watermark:
external_provider_effects_unknown:
cutover_or_incident_epoch:
independent_verifier:
```

Restore sequence:

1. Freeze privileged/new side-effect admission and fence stale deployment/executor generations.
2. Restore/verify the one canonical PostgreSQL point-in-time state and replay only authorized transaction/effect intents that were not settled.
3. Validate R2 immutable objects, canonical PG pointers, encryption-key availability and any object orphans. Never delete objects before historical retention and job state permit.
4. Rehydrate/rebuild noncanonical DO coordination caches and KV projections from authorized PG state; respect Spec 242 DO identities rather than recreating competing business truth.
5. Keep **existing Vectorize production design** unchanged. If disaster actually destroys/corrupts its index, coordinate a targeted rebuild from authorized PG/R2 via Spec 229 with content/index version and ACL checks; this is recovery, **not** a migration back to pgvector.
6. Reconcile uncertain external media/LLM/payment/provider effects before dispatch; no blind replay of paid work.
7. Resume limited cohorts; verify RPO/RTO separately for PostgreSQL, artifacts, realtime continuity, and retrieval index readiness. Rollback of code alone does not satisfy storage recovery.

Source: https://developers.cloudflare.com/workers/versions-and-deployments/ (storage state not part of Worker version).

# 57. Direct Origin Isolation and Header Trust (R4-08)

A Debian origin can remain exposed through public IPv4/IPv6, an old hostname, Docker-published port, tunnel, temporary staging URL or an allowlisted provider callback. Routing normal traffic through Cloudflare/WAF is insufficient proof that direct-origin bypasses have closed.

**Create `origin-exposure-inventory.yaml` with:** inbound listener, source CIDR/Cloudflare IP handling, DNS aliases, TLS/mTLS configuration, direct-origin hostname, webhook exception owner, SSH/admin route, ingress policy, expiry and test evidence. During transition, old origin routes are restricted to known legitimate Cloudflare/proxy/integration identities with **cryptographic** caller validation as appropriate; no browser-origin override that bypasses WAF/Auth/Rate controls.

Reject spoofed user-controlled `CF-Connecting-IP`, `X-Forwarded-For`, tenant, auth and internal service headers from untrusted direct requests. Establish the exact trusted proxy chain before using source IP for rate limit, security logs or audit; validate both IPv4 and IPv6. Test direct-IP, old hostname, hostname/SNI mismatch, accidental Docker port, old WSS port and callback exception, and schedule expiry of temporary holes. Do not close an in-use legitimate callback until its signed successor is certified (§37).

# 58. Rollout Flag Authority, Partition and Break-Glass (R4-09)

Feature flags are useful for routing but not a second source of job or financial truth. `migration_ownership`/canonical release metadata in PostgreSQL, or the existing approved deployment-control authority, SHALL determine persisted family/tenant generation. Edge KV/config snapshots may accelerate **noncritical** read-only decisions within versioned bounds but cannot grant new privileges, steal a lease or move an already-created job to another executor.

For each promotion or rollback require `{component, cohort, previous_generation, next_generation, config_digest, approval_ref, command_id, effective_at}`. If flag/config service is stale or Control Center unreachable, **freeze new high-risk promotions**, continue known good unambiguous routes, and fail closed for high-risk operations whose current ownership/authz cannot be proven. A signed pre-authorized emergency pause/runbook is allowed only within a bounded scope and existing approval policy; it must reconcile its outcome to PG audit as soon as access returns. No unlogged “set all legacy” kill switch.

Chaos tests: simultaneous conflicting operator actions; stale KV flag at one edge; PG partition after approval before route update; unsafe high-risk rollback; UI unavailable during active incident. Verify no duplicated lease owners or lost revocation.

# 59. Offline Client and Old API Contract Migration (R4-10)

SmartAIHub serves mobile/tablet/PWA/Desktop clients that may stay offline while server API and queue contracts change. Browser-compatible online differential tests do not cover deferred writes or long-idle sessions.

**Required `client-protocol-compatibility.yaml`:** supported frontend/PWA service-worker versions, mobile/Desktop protocol versions, local queued operation schema, retry/idempotency preservation, min/max server contract versions, deprecation notice, signed update policy, old-callback grace, tenant/auth epoch and resume mechanism.

Tests SHALL include: old PWA service worker serving stale HTML; user submits offline job under API vN then syncs after server vN+1; Desktop Runner reconnects with an old capability snapshot; duplicate replay after token expiration; delayed media upload and idempotency conflict. Server must version/translate supported legacy requests or return typed `CLIENT_UPGRADE_REQUIRED` without losing locally queued business intent. Never replay unauthorized data after a tenant/project membership revocation. Keep previous hashed static assets available through the defined client upgrade grace.

# 60. Continuous Authorization on Live Sessions (R4-11)

Reauth at WebSocket reconnect alone is insufficient where a connection remains active after role change, session revoke or tenant suspension. Active DO websocket/RPC subscriptions and long-lived streaming/control channels SHALL have a bounded authentication freshness policy tied to risk and canonical `security_epoch`, including event-driven revocation where applicable.

At each privileged command/tool invocation, use fresh authorized scope; on privilege change, suspend/re-scope protected subscriptions, drain/redact pending buffered private events, deny new privileged actions and terminate/rechallenge sessions as policy requires. Avoid a global PG query on every low-risk typing signal where a proven safe coordination mechanism suffices, but never deliver post-revoke private content based only on an old connection handshake. Include stream reconnect/replay scope-change tests. Spec 220/237/242 remain owners of underlying security/realtime contracts.

# 61. Crash-Resumable Migration Operation Journal (R4-12)

Migration actions mutate diverse systems (PG writer fence, DNS, Cloudflare routing, provider webhooks, secret epochs) without a distributed transaction across them. A controller or human runbook may stop after an external action succeeds but before checkpoint persistence. Repeating the whole script can then create destructive double transitions.

Reuse existing approved work/audit/approval persistence and `worker_jobs` if an operation is executed as a durable job. Store a **migration-command record, not another execution ledger**, with:

```yaml
command_id:
plan_revision:
component:
cohort:
from_generation:
to_generation:
precondition_digest:
requested_by:
approval_ref:
external_operation_id:
observed_state:
checkpoint:
reconcile_strategy:
retry_class: SAFE_IDEMPOTENT|OBSERVE_FIRST|HUMAN_ONLY
terminal_evidence:
```

Each irreversible step uses **prepare → verify preconditions → execute once → observe external reality → reconcile → record checkpoint**. An uncertain result enters `OBSERVE_FIRST`, not blind retry. Every recovery run is generation-fenced and refuses unknown/different data digests. Destructive DNS/DB/DO/key steps require explicit owner sign-off and independent verification before completion. A later Spec 224-driven implementation may orchestrate the runbook, but this document does not change Spec 224 finality semantics.

# 62. Reproducible Supply Chain and Promotion Attestation (R4-13)

A Git SHA alone does not prove which npm/pip dependency tree, Wrangler config, runner image, third-party CI action or migration script ran in production. Before promoting a critical wave, tie exact artifacts to an immutable approved candidate:

```yaml
promotion_attestation:
  source_commit:
  lockfile_digest:
  build_artifact_digest:
  sbom_digest:
  pinned_ci_actions_and_toolchain:
  infrastructure_config_digest:
  deployment_version:
  schema_migration_digest:
  migration_inventory_digest:
  scanner_version:
  approval_refs:
  verifier_identity:
```

CI/CD deploy identity is least-privileged by environment and resource. Separate code build from privileged DB/DNS/DO lifecycle/purge operations. Require signed/provenance-verified artifacts or equivalently controlled trusted internal chain according to existing platform policy. Prevent untrusted pull requests and forked jobs from receiving production secrets or applying migrations. Verify rollback target artifact still exists and matches its original attested digest.

# 63. Account-Specific Quotas, Double-Run Capacity and Cost Admission (R4-14)

The cost model from R2 remains in force, but a production wave cannot rely on generic product-plan limits. Before each wave, collect account/zone/environment entitlements and hard quotas for Workers requests/CPU/subrequests, Queues throughput/retention/concurrency, DO requests/storage/hot objects, Containers/Sandbox availability and concurrency, Hyperdrive connection counts, managed PG IOPS/connections, R2 storage/operations and observability export. Record provider quota-increase lead time and whether a regional/provider restriction changes placement.

**Required `capacity-admission.yaml`:**

```yaml
wave:
peak_baseline:
canary_request_rate:
full_rollout_estimate:
dual_run_peak:
pg_connection_budget:
queue_lag_ceiling:
do_hot_key_ceiling:
provider_parallelism:
per_tenant_spend_cap:
platform_monthly_spend_cap:
quota_source_and_checked_at:
backpressure_policy:
auto_pause_thresholds:
rollback_capacity_reserved:
```

Promotion is blocked if the projected dual-run peak, temporary recovery spike or rollback target cannot fit within the approved budgets and quotas. Test quota-exhaustion, 429 storms, external provider throttle, DO hotspot and origin-PG pool saturation in staging; ensure admission throttles preserve committed canonical jobs and do not create unbounded retry pressure. For unexpectedly expensive but technically compatible workloads, keep registered external Runner/managed compute until capacity and cost gates support moving them.

---

# 64. R4 New Acceptance Scenarios A47–A60 and Release Handoff

## A47 — Forged internal Service Binding context
A downstream Billing Worker receives an internal request without Access context and with a caller-controlled tenant header. **Expected:** independent authenticated service identity + fresh delegated tenant authorization required; reject forgery; no billing effect.

## A48 — Cross-Worker mixed-version frontend
Gateway vN+1 calls Auth Worker vN; a page from vN references a content-hashed asset only bundled with vN+1. **Expected:** matrix rejects incompatible RPC combination, version affinity/asset retention prevents a 404, controlled rollback remains viable.

## A49 — Durable Object class lifecycle rollback
An operator applies class rename/transfer and attempts to roll back to code from before the lifecycle change. **Expected:** cannot advertise ordinary rollback; controlled forward-recovery/lifecycle-specific runbook and independent gate are mandatory.

## A50 — Tenant RLS context lost across pooled queries
An ORM sets tenant context once; a later query uses a different Hyperdrive pooled connection. **Expected:** fresh transaction-scoped context or safe tenant-parametrized policy; missing context denies; no cross-tenant data.

## A51 — Deleted private R2 file remains CDN cached
Owner revokes access/deletes object; custom-domain URL still serves cached old bytes. **Expected:** protected retrieval route and verified cache/signed-link policy; block migration certification until revocation exposure window is met.

## A52 — Multipart ETag mistaken for SHA-256
Upload completes with multipart ETag, but reconstructed object differs in expected content hash. **Expected:** fail integrity, quarantine staged artifact; no canonical PG pointer promotion.

## A53 — PG PITR with newer R2/DO/Vectorize state
Restore PG to an earlier checkpoint while R2 holds later artifacts and a DO holds later coordination data. **Expected:** explicit cross-store reconciliation; no false settled job, orphan leak, duplicated provider effect or unauthorized Vectorize content exposure.

## A54 — Bypass Cloudflare WAF through legacy Debian IP
Attacker reaches exposed Docker port/old hostname and supplies forged forwarding headers. **Expected:** origin restriction and cryptographic caller validation deny direct protected action; inventory captures needed signed callback exceptions.

## A55 — Split release flags during control-plane outage
Region A sees previous route generation while region B sees a new feature flag; PG is unavailable after approval. **Expected:** persisted route assignment/fencing prevents dual side effects; pause promotions and surface incident.

## A56 — Offline client submits old schema after rollout
A PWA/Desktop Runner returns after an extended offline period and replays deferred job creation. **Expected:** supported version bridge with preserved request idempotency; if unsupported, explicit non-destructive upgrade path; auth revalidated.

## A57 — Role removed on still-open WebSocket
An active socket keeps receiving protected progress after project membership removal. **Expected:** bounded active-session reauthorization and buffered-event redaction/disconnect; no post-revoke private events.

## A58 — Controller crash after DNS or DB fence succeeds
Deployment process crashes before writing its checkpoint and restarts. **Expected:** observe actual external state, reconcile command ID/generation, never blindly repeat irreversible action.

## A59 — Approved commit but unreviewed build dependency
Same source SHA is built with a modified package lockfile or altered CI deployment action. **Expected:** attestation mismatch blocks promotion and records supply-chain incident.

## A60 — Canary passes but double-run exceeds account quota
Two versions plus legacy workloads saturate managed PG and Cloudflare Queue/DO quota. **Expected:** pre-admission capacity gate, backpressure and scoped pause; no lost committed jobs, uncontrolled paid retries or missing rollback capacity.

## 64.1 Implementation inserts, not rework of in-progress Specs

**Before first sensitive cross-Worker route:** P245.0K service identity and cross-worker contract probes; P245.0L release/asset version matrix.

**Before DO lifecycle change:** DO migration readiness from Spec 242, isolated lifecycle deployment and documented non-rollback boundary.

**Before first RLS-backed Hyperdrive tenant query:** tenant pool-isolation suite, explicit context transaction pattern and least-privileged DB role verification.

**Before migrating private R2 delivery or large media uploads:** CDN-revocation proof, artifact checksum manifest and object-pointer reconciliation.

**Before recovery drill or final Debian retirement:** cross-store recovery consistency manifest; direct-origin attack surface audit; rare-path/protocol coverage; capacity and rollback reserve proof.

**Before any complex cutover:** generation-fenced crash-safe command journal, independent operator approval and deployment provenance attestation.

A certified **isolated public read-only Worker route** can still go live first once *its own* readiness gates pass. Do not hold safe incremental production value hostage to unrelated heavy-workload refactors. Production database source-of-truth migration may run in parallel, and Vectorize remains the existing production semantic index.

## 64.2 Evidence/status discipline

All fourteen passes are `FIXED_IN_SPEC` only. Every A47–A60 test begins `NOT_RUN` until a real candidate build and independently verified staging/production observations exist. Final Debian power-off and decommission still require existing Spec 245 M245.10 / R3 §44 gates, plus newly relevant cross-store and origin-isolation evidence.

## 64.3 Primary technical references verified 2026-09-25

- https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/ — Access context and RPC lifecycle.
- https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/ — cross-Worker version skew.
- https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/version-affinity/ — consistent routing and frontend asset skew.
- https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/with-durable-objects/ — DO version assignment and atomic class lifecycle.
- https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/ — class lifecycle and storage-backend constraints.
- https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/ — transaction pooling and reset semantics.
- https://developers.cloudflare.com/r2/reference/consistency/ — bucket strong consistency vs custom-domain CDN stale content.
- https://developers.cloudflare.com/r2/objects/upload-objects/ — multipart ETag composition.
- https://developers.cloudflare.com/workers/versions-and-deployments/ — Worker version does not capture external storage state.

---

# 65. R5 — Fifteen Additional Gap-Review Passes and Normative Corrections

**Review date:** 2026-09-25. **Input:** complete Spec 245 R4 (3,072 lines), including the merged operational plan, R3 and R4 amendments. **Method:** fifteen distinct failure-oriented architectural reviews, verified against current platform documentation where Cloudflare-specific behavior matters. **Status:** `FIXED_IN_SPEC` only; no claim of live repository conformance, Cloudflare account entitlements or production certification.

## 65.1 Precedence, numbering and inherited contracts

R5 §§65–82 supersede conflicting earlier text. All unaffected R1–R4 and original merged operational requirements remain effective. The canonical acceptance inventory becomes **A01–A75**, plus preserved **MP31–MP40** and **T01–T24**. New audit IDs are `R5-01` through `R5-15`; IDs of earlier audits and their historical findings remain unchanged. The suggested `spec_id=245` remains **provisional** pending validation against the actual Git registry/main branch and unmerged PR/worktrees. Do not alter original Specs 1–213, active Spec 224 or specialist Spec 232 and Spec 242 as a side effect of this document review. Spec 220 remains the canonical authorization/data-policy authority; Spec 229 remains the retrieval/Vectorize authority. No new job ledger, scheduler authority, billing ledger, ACL authority, retrieval authority or migration execution engine is created here.

## 65.2 Fifteen-pass gap register

| Pass | Distinct review lens | Previously insufficient guarantee | R5 fix | Required acceptance |
|---:|---|---|---|---|
| 01 | Post-response durability | `ctx.waitUntil()` and unawaited work could be mistaken for reliable job admission and fail after HTTP response/disconnect. | §66 durable receipt/transactional outbox before acceptance; reserve `waitUntil` for bounded disposable telemetry/cache work. | A61 |
| 02 | Authoritative DNS and email continuity | HTTP/domain canary does not prove MX/SPF/DKIM/DMARC, DNSSEC/registrar DS, CAA, verification and mail remain intact. | §67 whole-zone immutable comparison and DNS change gate. | A62 |
| 03 | Edge upload limits | Direct media upload design did not explicitly account for zone-plan `413` body limit, cross-origin multipart CORS and browser retry semantics. | §68 request-size admission, R2 direct/multipart conformance and safe fallback. | A63 |
| 04 | Residency vs performance placement | Global edge/Smart Placement can be misinterpreted as data-residency enforcement, and RPC/Queues/Cron may execute differently from fetch. | §69 per-tenant processing/egress/storage/log locality certification. | A64 |
| 05 | Object event/index convergence | R2 event notifications through Queues can produce duplicate/stale hints; successful object write is not a certified successful index mutation. | §70 canonical PG intent, versioned R2 notification dedup and bounded index reconciler. | A65 |
| 06 | Erasure after disaster restore | PITR can restore metadata that predates an authorized deletion and accidentally reintroduce older R2/Vectorize exposure. | §71 protected erasure journal, post-restore barrier and tombstone replay. | A66 |
| 07 | Recovery control dependency loop | Recovery UI/flags/audit stored only in unavailable PG/Cloudflare services can make the safe recovery path inaccessible during a compound outage. | §72 offline preauthorized read-only recovery bundle and external operator communication; no bypass of approval. | A67 |
| 08 | Outbound fan-out/provider compatibility | Per-wave quotas did not test the Workers six simultaneous pending connection budget shared across Service Bindings and outbound APIs, or mail/SMTP provider placement. | §73 measured fan-out budget and provider-specific egress/deliverability conformance. | A68 |
| 09 | Full product feature coverage | Core API test matrix may pass while product verticals, Mini Apps, white-label products and later specs have unclassified paths. | §74 feature/capability × tenant × runtime coverage matrix generated from *actual* registry and deploy manifests. | A69 |
| 10 | Cross-wave aggregate resource collisions | Independently approved parallel canaries and online DB migration can together exhaust PG, Queues or rollback capacity. | §75 shared global change calendar/admission with aggregate resource reservations and mutually exclusive hazardous operations. | A70 |
| 11 | Evidence tamper resistance | A candidate/manifest hash without separately protected evidence can be silently replaced along with its matching hash. | §76 cross-checked content-addressed independent attestation, evidence retention and verifier challenge. | A71 |
| 12 | Post-retirement platform-wide outage | Removing Debian eliminates an informal emergency fallback; a broad Cloudflare outage needs an honest degraded-mode/public-communications design. | §77 critical-function outage playbook with explicit unavailable states and out-of-band operational access. | A72 |
| 13 | Cross-runtime scheduled ownership | Spec 232 schedule conformance alone does not prove Agent-local alarms, Alert schedules and legacy cron all cease competing for the same durable occurrence. | §78 program-level schedule-owner coverage and recurrence equivalence. | A73 |
| 14 | Observability outage / data residency | Logs and alerts may fail along with primary control services, or observability egress may violate tenant geographic policy. | §79 independent failure probes, telemetry loss accounting, safe redaction and residency contract. | A74 |
| 15 | Tenant Worker/asset topology scaling | One-Worker-per-tenant or uncontrolled Mini App bundles could reach account Worker/static asset/domain quotas without affecting simple single-tenant staging tests. | §80 tenant release-topology compiler, quota-aware isolation and per-tenant deploy/rollback contracts. | A75 |

---

# 66. HTTP Acceptance and `waitUntil` Durability Boundary (R5-01)

Cloudflare's HTTP `ctx.waitUntil()` is intended for work that can finish after a response; it extends execution by **at most 30 seconds after request completion/disconnect**, and pending work may then be cancelled. An unawaited Promise may also be cancelled when the invocation ends. Consequently:

1. `200`/`202 Accepted` for any job, upload finalization, outbound webhook, payment/credit mutation, approval, email or agent tool operation is forbidden until the existing canonical PostgreSQL transaction has durably written its business intent, idempotency/request digest, event and outbox (or the existing approved durable equivalent for an explicitly documented non-job operation).
2. `worker_jobs` remains the sole durable job authority, including for Cloudflare-native agent/alarm executors. A direct Queue `send()` after issuing HTTP `202` is not a substitute for the committed outbox receipt.
3. On PG unavailable **before** durable admission, return a typed retriable/temporarily-unavailable response. Do not claim a queued job based on an in-memory ID or optimistic Queue ACK.
4. On network timeout **after** an uncertain commit, request retry with the original scoped idempotency key and request digest; query PG before creating a new job or external side effect.
5. Use `waitUntil` only for bounded, non-authoritative cache warming or best-effort telemetry whose loss is explicitly acceptable. Durable audit/billing and authorization records are not best effort.
6. Test client disconnect *before commit*, *after commit but before response*, and *after 202*; test worker cancellation after the bounded `waitUntil` window. Every admitted job must be recoverable solely from PG and its outbox.

**Official reference:** https://developers.cloudflare.com/workers/runtime-apis/context/

---

# 67. Authoritative DNS, DNSSEC and Mail Continuity (R5-02)

The scope of a zone/nameserver change is broader than routed HTTP traffic. Before a production nameserver, authoritative zone or DNS-record migration, create `dns-zone-transition.yaml` with:

```yaml
zone:
registrar:
current_authoritative_nameservers:
target_authoritative_nameservers:
current_ds_records:
dnssec_transition_plan:
all_records_digest_before:
all_records_digest_after:
mx_spf_dkim_dmarc:
caa_and_acme_challenges:
verification_txt:
other_srv_cname_records:
mail_provider:
customer_owned_custom_domains:
rollback_authority:
observation_and_probe_results:
```

Requirements:

- If a domain is **already** delegated to Cloudflare, do not stage a fictitious nameserver move; inventory actual DNS changes only. If moving authoritative DNS, verify registrar DS/DNSSEC compatibility, transfer-zone completeness, and re-enable/verify DNSSEC at the correct point of the approved plan.
- Compare exported old/new zone records including hidden TXT verification, CAA, ACME, MX, SPF, DKIM, DMARC and SRV records; a Cloudflare quick scan is not exhaustive.
- Probe inbound delivery, outbound sender authentication, reset/invite/OTP emails, bounce/complaint paths and provider domain verification from an independent mail test destination. DNS records for email are normally **DNS-only**; never proxy mail host records unintentionally.
- Scope and certify each custom domain/tenant domain independently under §39. No default global nameserver flip for tenant domains without proof of their registrar/provider authority.
- DNS TTL and nameserver propagation are not rollback clocks. Preserve the old provider/config as long as the verified propagation/failback policy requires, and record split-resolver observations.

**Official reference:** https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/

---

# 68. Request Size, Direct-to-R2 Upload and Browser Capability Gates (R5-03)

Workers request body-size limits depend on the **Cloudflare zone/account plan**, not only the Workers Paid/Free plan. Some media uploads can exceed the limit even if the Worker uses streams; a path above the limit may receive HTTP `413` before application code runs. The upload compatibility probe must therefore cover the **actual production zone** and each tenant custom-domain entrypoint.

Required `upload-admission-matrix.yaml`:

```yaml
entrypoint_host:
zone_plan_and_verified_limit:
asset_class:
expected_max_bytes:
path: WORKER_PROXY|R2_SIGNED_SINGLE|R2_SIGNED_MULTIPART|REGISTERED_RUNNER
cors_origins:
preflight_methods_and_headers:
resume_and_retry_contract:
content_hash_and_scan_policy:
finalize_endpoint:
abort_and_orphan_cleanup:
```

- For large media, use a tenant-scoped approved direct R2 signed single/multipart path with verified CORS, short expirations and one-time/bounded finalize intent; a signature does not confer indefinite canonical asset ownership.
- File-size admission is based on current account/zone limits and object/storage policy. Do not hardcode a universal 4 GB Worker proxy capability.
- Multipart resume must account for completed-part inventory, duplicate retries and abort; immutable staged keys, application SHA-256 and guarded PG promotion remain governed by §§35,55.
- Test expired/signature-leaked URL, forged Content-Type, oversize object, missing CORS preflight, interrupted mobile network, wrong tenant, orphan multipart lifecycle and a direct R2 object that exists while PG metadata finalization failed.
- Where upload malware/content-policy scanning is required, newly uploaded objects remain non-public/non-retrievable pending certification; cross-origin direct upload is not an antivirus bypass.

**Official reference:** https://developers.cloudflare.com/workers/platform/limits/

---

# 69. Runtime Placement, Tenant Data Residency and Egress (R5-04)

Smart Placement is a **latency optimization**, not proof of residency. Official placement behavior affects `fetch` handlers; it does not generally control Worker RPC/named entrypoint execution, Queue consumers or Cron wakeups. Cloudflare Regional Services can regionalize a configured Worker custom-domain execution, but its documentation notes that code and secrets are deployed globally, outbound subrequests are not automatically constrained by that hostname, and Queues/Cron triggers are outside that hostname's regional execution guarantee. Availability and exact product/region entitlements MUST be verified for the actual account/contract.

Required per-tenant `locality-policy.yaml`:

```yaml
tenant_or_product:
data_classes:
http_tls_termination_regions:
worker_execution_regions:
queue_and_cron_execution_constraints:
service_binding_and_rpc_location_policy:
outbound_provider_regions:
postgresql_region:
r2_bucket_jurisdiction:
vectorize_data_location_policy:
logs_and_analytics_location:
key_material_policy:
contract_or_policy_basis:
certification_evidence:
```

- Measure p95/p99 Thailand and other active user-region access separately from DB-origin latency and per-Worker Smart Placement.
- Do not claim an unrestricted multi-tenant Worker satisfies a stricter tenant residency contract because the frontend hostname is regionalized. If a full end-to-end locality requirement cannot be met with certified runtimes and entitled services, classify it `BLOCKED_RESIDENCY`, move the affected operation to an approved constrained execution path, or defer that tenant's promotion.
- Private client data must not enter an out-of-region model/provider, queue, telemetry or cache through an unreviewed fallback. Authorization and data-residency admission precede inference routing (Spec 231); retrieval remains governed by Spec 229/220.

**Official references:** https://developers.cloudflare.com/workers/configuration/placement/ and https://developers.cloudflare.com/data-localization/how-to/workers/

---

# 70. R2 Events, Index Version Convergence and Recovery (R5-05)

R2 Event Notifications deliver object-change hints via Cloudflare Queues; Queues provide **at-least-once** delivery by default. No R2/Queue notification should be treated as proof of a current authorized object version or a completed Vectorize update.

Program-level compatibility contract:

1. PG/R2 object intent and immutable `content_hash`, tenant, object version/upload ID and visibility epoch determine whether an object remains eligible for indexing. An R2 event merely wakes the existing Spec 229 indexing worker through the canonical job/outbox path.
2. Deduplicate observed notifications using object event identity where available plus current object/version state; older/reordered create/delete events cannot resurrect a deleted or superseded asset.
3. After direct multipart upload, canonical PG pointer promotion is gated by actual object integrity; indexing only starts for an authorized committed pointer.
4. Track `PG_INDEX_DESIRED_VERSION`, `R2_OBSERVED_VERSION`, `VECTORIZE_INDEXED_VERSION`, `INDEX_DELETE_PENDING` and `INDEX_CONVERGED` as **projections of existing Spec 229 state**; do not build a second retrieval state machine.
5. A bounded reconciler compares committed PG object/index intents against R2 and Vectorize status independent of Queue retention. Quarantine impossible references and hard-delete/tombstone according to existing data lifecycle policy.
6. Retrieval continues to enforce fresh PG tenant/ACL checks before revealing restricted text, regardless of stale Vectorize candidates. Production Vectorize stays in place; no new pgvector migration.

**Official references:** https://developers.cloudflare.com/r2/buckets/event-notifications/ and https://developers.cloudflare.com/queues/reference/delivery-guarantees/

---

# 71. Deletion Safety Across PostgreSQL PITR and Storage Recovery (R5-06)

A database restore to an earlier timestamp can recover rows that were later deleted in response to a user request or tenant deprovisioning. The existing cross-store recovery manifest (§56) SHALL include a protected, access-controlled **post-restore deletion/hold command journal** retained outside the restore snapshot, consistent with the user's legal and product retention policy. This is a recovery input to the existing PG/data authority, **not** a second everyday authorization database.

Required recovery fields:

```yaml
erasure_recovery:
  pg_restore_time:
  deletion_journal_verified_through:
  user_and_tenant_tombstone_epochs:
  legal_hold_exceptions:
  r2_erasure_replay_status:
  vectorize_delete_replay_status:
  kv_cdn_projection_invalidations:
  backup_retention_and_expiry:
  external_processor_delete_obligations:
  read_admission_barrier:
```

- Before reopening private read/search/inference after PITR, replay all applicable deletion/tombstone/tenant-revocation decisions newer than the recovered snapshot; deny access to any scope whose deletion state cannot be proven.
- Reconcile R2 originals, Vectorize index IDs, thumbnails, cached objects and shadow/test copies as needed. Respect valid retention/legal-hold rules without exposing retained bytes to unauthorized applications.
- The journal must be immutable/tamper-evident enough for disaster recovery and protected under the existing deletion/retention authority. Design recovery keys for the full-backup restore scenario and test their availability.
- Test a deletion immediately before PITR, a restore past the deletion event, later R2/Vectorize state, and a failed journal lookup. A journal outage blocks protected read admission rather than quietly reopening deleted data.

---

# 72. Compound-Outage Recovery Bootstrap and Operator Access (R5-07)

The Migration Control Center, deployment flags, approved audit and job control metadata may all depend on Cloudflare and managed PostgreSQL. If both are unavailable, the recovery path must not depend on a healthy instance of the same control plane.

- Pre-provision a **minimal protected recovery bundle** with last approved code+configuration digests, signed/admissible runbooks, authorized owner contacts, backup/restore instructions, current provider/registrar/account recovery contacts, break-glass policy and independently stored decryption-key recovery instructions. Store it through the approved secure operational channel outside the simultaneously failing components; do not publish raw keys in the bundle.
- Define read-only *incident observation* and an out-of-band way to notify users/operators while the primary Cloudflare-hosted UI cannot load. Do not create an alternate public mutation API or authorize new paid work while PG authority is unknown.
- Every emergency state change remains subject to pre-approved scoped authority and two-person review when existing policy requires. After recovery, reconcile emergency actions and observed external effects to canonical PG audit and Spec 228 issues.
- Test recovery when the Control Center is inaccessible, the selected Cloudflare account API is limited, PG restore metadata is unavailable temporarily, and an authorized owner is offline. Define explicit `BLOCKED_SAFE` and escalation conditions rather than inventing a universal downtime-free failover guarantee.

---

# 73. Provider Egress, Shared Outgoing Connections and Email Delivery (R5-08)

Official Workers limits include **six simultaneous outgoing connections waiting for response headers per invocation**, and this limit is shared across Workers invoked by Service Bindings under the same top-level request. Outbound fetch, KV/R2/Queue operations, TCP sockets and outbound WebSockets may contribute. Requests in excess of the limit may wait, increasing p99 and triggering timeouts/cancellations. Actual quotas must be captured per account/current documentation before implementation.

`external-provider-egress.yaml` must include provider endpoint, required origin/IP allowlist behavior, mTLS/signing, retry/429 contract, per-request concurrent outstanding connections, TCP/SMTP requirements, regional egress restrictions, long-stream behavior, payment/media idempotency and failover policy.

- Certify realistic LLM/tool fan-out including Service Binding chains rather than benchmarking one isolated provider call. Bound concurrency, use cancellation correctly and separate completion-time latency from model service time.
- An external provider that requires a fixed egress IP or unsupported SMTP/TCP protocol must use a certified compatible outbound gateway, managed provider API or external Runner, not an assumed implicit Workers feature.
- Mail sending and inbound email remain independently classified. Preserve SPF/DKIM/DMARC domain authentication, suppression/unsubscribe/bounce webhooks, provider templates and send idempotency. A failed or timed-out send may be `UNKNOWN_EXTERNAL_EFFECT`, never automatically double-send from both Debian and Cloudflare.
- Provider policy/consent/tenant authorization is enforced before dynamic routing or any region-dependent fallback.

**Official reference:** https://developers.cloudflare.com/workers/platform/limits/

---

# 74. Product/Feature Coverage and Dynamic Spec Registry Contract (R5-09)

A successful migration of the shared API does not certify a product that includes additional scheduling, publishing, credit, browser, RAG, realtime, custom domain or external harness paths. The compiler SHALL generate **feature-coverage-matrix.yaml** from the actual checked-out registry, route manifests, capability registry, enabled tenant products, feature flags, process/service telemetry and deployed Mini App inventory.

```yaml
feature_or_product:
registry_identity:
implementation_state: IMPLEMENTED|IN_PROGRESS|PROPOSED|DISABLED|RETIRED
owners:
frontend_and_api_routes:
background_job_families:
scheduled_occurrences:
websocket_webrtc_channels:
external_webhooks:
runner_and_sandbox_dependencies:
r2_vectorize_dependencies:
billing_and_approval_dependencies:
tenant_domains:
cloudflare_compatibility_result:
migration_wave_and_gates:
retirement_blocker:
```

The matrix SHALL include every **implemented/enabled** capability discovered, not assume a design document proves deployment. Check current registry for areas such as Live Commerce/Realtime (Specs 236/237), intelligent alerts (238), external personal agents (239), generated UI/Mini Apps (240), personal memory (241), native Cloudflare agents (242), managed agents (243) and research (244) **only to the extent currently present and enabled**. Include later specs/verticals automatically; do not maintain a static hardcoded list. The active Spec 224 development runtime must be assessed without rewriting it; Spec 232/242 remain specialist authority gates. A dormant feature is not a retirement blocker unless it has reachable production routes, data, schedules, credentials or committed restart promises.

Require a business-flow smoke test for each production-critical product family and at least one tenant-specific test for every distinct permission/domain/runtime configuration class. An unknown production-enabled feature blocks **final Debian retirement** even if generic health endpoints pass.

---

# 75. Concurrent Migration-Wave Admission and Aggregate Capacity (R5-10)

Individual release cards and per-wave capacity approval can pass independently yet together overload shared managed PostgreSQL, Hyperdrive pools, queue consumers, provider accounts, DO hot keys or legacy rollback capacity. Extend the existing Migration Control Center and approved program manifest with a **global change-admission view**, not a second job authority.

```yaml
concurrent_wave_budget:
  active_change_ids:
  shared_pg_connections_and_iops:
  shared_outbox_reconciler_capacity:
  shared_provider_quotas:
  shared_queue_ingress_and_dlq:
  deployment_version_mixing:
  legacy_rollback_reserved:
  predicted_combined_peak:
  additive_cost_ceiling:
  excluded_simultaneous_actions:
  operator_approval_and_expiry:
```

- Reserve explicit capacity across overlapping rollout windows, including the extra load generated by database migration/CDC, shadow parity, replay sweeps and fallback. A canary pass at low average QPS does not bypass peak or incident surge admission.
- Prohibit simultaneous **conflicting** owner transitions: two database write-primary promotions, shared DO namespace lifecycle change during dependent Worker rollback, or Redis job-family promotion concurrently with an unapproved schema contraction.
- Multi-wave automatic pauses use the existing rollout metadata and approval/audit contract; on aggregate budget breach stop affected promotions before impacting already-admitted production workloads. Preserve independently rollback-safe slices.
- Track correlated SLO regression across waves; compare origin capacity and end-to-end user flows, not just per-Worker dashboards.

---

# 76. Independent Verification and Evidence Integrity (R5-11)

The source SHA/build digest attestation in §62 is necessary but not sufficient if both the report and its claimed digest can be edited in the same unprotected location. Extend the existing approved audit/evidence service; do not introduce a parallel workflow/job ledger.

Each critical gate evidence bundle includes a content-addressed manifest, signer/verifier identities, trusted capture timestamp, sanitized immutable artifact references, candidate+config+schema+route generation, source telemetry query/window, and a recorded independent verifier challenge. The approved signing key or equivalent trusted attestation mechanism SHALL be managed separately from the deployer's ordinary write permission. Retain a separately protected/off-account approved copy where the recovery policy demands survivability during a Cloudflare or primary PG outage.

- Recompute file/artifact digests at verification time, compare deployed resource IDs and actual observed production SHA/config against expected values, and reject stale/mismatched evidence.
- “Test passed in developer worktree” is not “candidate commit deployed.” Claim `PRODUCTION_CERTIFIED` only after the independent verifier confirms the exact release and relevant live metrics.
- Redact payloads/secrets and apply legal retention/minimization; tamper resistance is not permission to retain user private content forever.
- Periodically sample previously signed slices after platform runtime/zone-policy updates. A signed old result is historical evidence, not a perpetual compatibility guarantee.

---

# 77. Debian-Free Broad-Cloudflare-Outage Operating Mode (R5-12)

Debian retirement removes a possible legacy hosting fallback. The final runbook MUST state the explicit behavior if Cloudflare Edge/Workers/Queues/DO/Account API are broadly unavailable, including dependencies on managed PG/registrar/external providers.

- Classify critical operations into `SAFE_READ_ONLY_DEGRADED`, `DEFER_WITH_DURABLE_EXISTING_RECEIPT`, `UNAVAILABLE_FAIL_CLOSED` and `APPROVED_ALTERNATE_CHANNEL` where the alternate is independently certified and does not create competing writes/ledger/job truth.
- Provide approved **out-of-band status and operator communication** not dependent on the same Cloudflare domain/account; include DNS/operator credential and certificate access recovery procedures where applicable.
- Do not promise no customer-visible interruption in an uncontrollable platform-wide outage. No anonymous emergency checkout, duplicate paid generation or stale cached authentication is permitted to mask the event.
- Predefine incident commander, customer notification trigger, disabled provider billing/automation state, backup/PITR verification path, temporary workload admission policy and post-incident reconciliation before serving mutation traffic again.
- Conduct tabletop and scoped outage drills without intentionally breaking unrelated customer production services.

---

# 78. Cross-Runtime Schedule Ownership and Recurrence Equivalence (R5-13)

Spec 232 owns the migration of durable BullMQ/Celery Beat/PG schedules, while other implemented features may independently define agent-local alarms, alert rules, workflow timers and user-facing recurring tasks. **Spec 245 only aggregates and verifies their ownership and temporal compatibility**; it MUST NOT create another scheduler authority.

Every discovered schedule or agent alarm is tagged `EPHEMERAL_LOCAL`, `USER_DURABLE`, `SYSTEM_DURABLE` or `LEGACY_TRANSITION`, with canonical owner, timezone, recurrence definition, occurrence idempotency key, planned target wake source, missed-run policy and conflict-fencing evidence. Each durable occurrence has exactly one authorized creator under its existing canonical schedule authority. Cloudflare Cron/Agent alarms/Queues are wake hints where that authority requires a PG-owned occurrence.

Run temporal simulations for the longest recurrence class and at least DST gap/overlap, missed 48-hour wakes, late provider callbacks, deployment-version split and offline-client reconnection. During migration, any old legacy repeat producer remains explicitly fenced or approved as the sole writer until its scheduled occurrences are durably transferred. Do not assume local-agent ephemeral housekeeping events can safely substitute a user-facing reminder that must survive a reset or host retirement. If two owners can create the same economic/user-visible occurrence, block the affected wave and report the ambiguity to Spec 232/feature owner.

---

# 79. Telemetry Loss, Alert-Path Failure and Observation Residency (R5-14)

A green dashboard is not evidence if the metrics exporter, Workers logs, queue consumption or managed PG telemetry stopped updating. Every live gate SHALL include independent synthetic health observations and a `last_evidence_at` freshness threshold, plus a **telemetry coverage indicator** for critical user paths.

- Probe a simulated log/metrics-export failure while app traffic continues: the release gate must mark coverage `UNKNOWN`, pause promotion, and alert through an independent approved channel. Missing error data is not zero errors.
- Preserve canonical PG state/business audit for required durable events. Diagnostic logs may be sampled; financial/security audit must be retained according to existing authority, not `ctx.waitUntil` best effort.
- A per-tenant observation locality/retention policy covers Workers Logs, Analytics Engine, external Sentry/PostHog/OTel collectors and R2 evidence. Regionalized HTTP execution does not automatically constrain log storage or outbound collector requests.
- Cardinality budgets and redaction rules must not erase the correlation keys needed to prove a job/tenant/attempt/fence/release migration; sample safely by cohort and maintain explicit exceptions for critical audit events.

---

# 80. Tenant Worker Topology, Asset Footprint and Release Isolation (R5-15)

SmartAIHub may deploy shared multi-tenant Workers, tenant-specific Workers, custom-domain Workers or independent Mini App/Product Workers. The master compiler SHALL discover the **actual** deployment topology and simulate projected tenant/asset growth against Cloudflare account quotas. A design that works for one test tenant is not certified for many branded tenants.

`tenant-release-topology.yaml`:

```yaml
tenant_or_product:
runtime_topology: SHARED_WORKER|TENANT_WORKER|PRODUCT_WORKER|EXTERNAL_EXECUTION
isolation_boundary:
worker_count_estimate:
static_asset_file_count_and_individual_size:
route_and_custom_domain_count:
service_bindings_per_worker:
secrets_and_env_binding_count:
do_namespace_and_queue_dependencies:
artifact_and_frontend_version_retention:
rollout_cohort:
rollback_release_pair:
quota_evidence:
```

- Verify account-specific Workers/static asset/route/domain/binding quotas and CI deployment concurrency before adopting per-tenant isolation as the default. Shared Workers require strong tenant resolution and fresh authorization; dedicated Workers require separate least-privilege environment bindings and reproducible per-tenant release manifests.
- For platform-wide changes, certify shared core Worker interoperability with both current and previous supported tenant Worker/Mini App RPC versions (§51). Do not accidentally require simultaneous redeploy of every white-label tenant.
- Static asset budget is version-specific and must include temporarily retained prior assets for old PWA clients (§59), with controlled retirement and no broken active sessions.
- Cross-tenant rollout incident can pause one tenant/product while leaving unrelated live tenants on their certified release, subject to shared DB/queue capacity rules (§75).

**Official reference:** https://developers.cloudflare.com/workers/platform/limits/

---

# 81. R5 Acceptance Scenarios — A61–A75

## A61 — Durable receipt after HTTP request termination
A Worker returns `202` for paid generation, then the caller disconnects and a `waitUntil` task is cancelled. **Expected:** committed `worker_jobs` + event + outbox allow safe independent dispatch; if commit did not occur, no job is falsely acknowledged; uncertain response replay uses original request digest and idempotency key.

## A62 — Nameserver move leaves mail or DNSSEC broken
Main API still resolves, but MX/DKIM/DMARC or registrar DS is missing after delegation. **Expected:** whole-zone diff and mail/DNSSEC probes block cutover and exercise the approved registrar recovery plan.

## A63 — Tenant media upload exceeds zone request limit
A browser uploads media above the actual Cloudflare zone body limit, or R2 preflight blocks a multipart part. **Expected:** approved signed/direct multipart path succeeds safely or the client receives a typed capability limit; no Worker full buffering, cross-tenant asset grant or orphan canonical pointer.

## A64 — Region-restricted tenant via unconstrained Queue
An EU-restricted tenant request enters a regionalized Worker custom domain but later runs via Queue/Cron/outbound provider outside approved processing regions. **Expected:** full end-to-end locality gate rejects or reroutes to an independently certified eligible runtime; no false claim that hostname regionalization covers all triggers.

## A65 — Stale R2 create notification after object deletion
A delayed/duplicate create notification arrives after PG tombstone and Vectorize delete intent. **Expected:** current version/visibility validation prevents reindexing and protected text exposure; independent reconciler converges.

## A66 — PITR restores previously erased user metadata
PG backup predates deletion while R2/Vectorize may retain later versions. **Expected:** protected post-restore deletion journal replay precedes private read admission; legal holds respected without unauthorized exposure.

## A67 — Cloudflare and PG unavailable during migration recovery
Migration Control Center and PG-hosted audit are both unavailable. **Expected:** pre-authorized protected runbooks and independent operator contact are usable; no unapproved alternate writer or loss of reconciliation trail.

## A68 — Cross-Worker LLM fan-out exhausts connections
One HTTP invocation invokes chained Workers, six pending network/storage operations and additional provider calls. **Expected:** bounded fan-out/backpressure or appropriate durable decomposition meets budget; no silent dropped effects or uncontrolled SMTP workaround.

## A69 — Unclassified product vertical on Debian
Common Chat/API routes pass but an enabled tenant Mini App or alert/research workflow still invokes a monthly Debian-only component. **Expected:** generated feature coverage matrix catches it; retirement blocked until classified and tested.

## A70 — Two healthy canaries overload shared DB during CDC
Two separately approved canaries and ongoing database replication together saturate Hyperdrive/managed PG. **Expected:** aggregate resource admission stops conflicting promotion while preserving already committed jobs and reserved rollback capacity.

## A71 — Audit artifact silently replaced with matching hash file
An implementer changes both a report and the digest stored beside it. **Expected:** separately protected approved verifier/attestation record exposes tampering; final gate fails.

## A72 — Full Cloudflare outage after Debian decommission
Critical public UI and operator dashboard are unavailable simultaneously. **Expected:** approved independent incident channel, explicit safe degraded/unavailable behavior, and no false silent retry of paid effects.

## A73 — Agent alarm and Celery Beat both create same reminder
A new agent scheduler and old Beat trigger the same user-facing reminder at overlap or DST transition. **Expected:** unique canonical occurrence and one fenced authorized creator; duplicate path quarantined with recovery evidence.

## A74 — Canary appears healthy only because telemetry died
Production error exporter stops during a risky wave, leaving a dashboard with stale green numbers. **Expected:** evidence freshness/coverage check pauses promotion and independent synthetic alert works; sensitive log residency remains enforced.

## A75 — Multi-tenant growth exceeds Worker/asset quota
Tenant Worker count or retained Mini App static asset files exceed verified account limits, or shared core release breaks old tenant Workers. **Expected:** topology/contract compiler blocks unsafe promotion, recommends approved consolidation or capacity extension and preserves per-tenant rollback.

---

# 82. R5 Implementation Inserts and Completion Rules

1. **Before first async/paid API Worker cutover:** P245.0M admission-before-202 contract suite and `waitUntil` cancellation tests; preserve Spec 232 job authority.
2. **Before DNS/tenant domain changes:** P245.0N whole-zone DNS/mail/DNSSEC comparison and external delivery smoke.
3. **Before uploading real media through a Worker entrypoint:** P245.0O plan-aware request-size matrix, signed direct-R2 and browser multipart tests.
4. **Before tenancy with geographic constraints:** P245.0P complete HTTP/Queue/Cron/egress/log/data-store residency and entitlement mapping.
5. **Before accepting R2 event-driven indexing as a migrated slice:** P245.0Q object/index version convergence and delayed-event duplicate/delete tests, owned by Spec 229.
6. **Before major PITR/restore certification:** P245.0R post-snapshot erasure journal and private-read admission barrier test.
7. **Before destructive and account-wide migration:** P245.0S independent protected recovery bundle, offline owner escalation and scoped emergency runbook rehearsal.
8. **Before large provider/LLM/mail traffic move:** P245.0T chained-Worker fan-out/egress conformance and unknown-send reconciliation.
9. **Before declaring all application features moved:** P245.0U registry-generated per-product deployment/scheduler/webhook coverage matrix.
10. **Before overlapping two production migration waves:** P245.0V global concurrent capacity reservation/change-conflict gate.
11. **Before critical promotion or Debian retirement:** P245.0W independently protected content-addressed evidence and verifier challenge.
12. **Before destroying Debian recovery capability:** P245.0X external incident communication, broad-platform outage tabletop and safe degraded-mode acceptance.
13. **Before disabling old schedulers:** P245.0Y durable schedule-owner / occurrence equivalence certification including Agent alarms and Spec 238 alerts where implemented.
14. **Before trusting green promotion dashboards:** P245.0Z telemetry freshness and independent alarm-path fault injection.
15. **Before broad white-label tenant migration:** P245.0AA tenant Worker/custom domain/static asset capacity and cross-version topology certification.

All P245.0M–P245.0AA work packages are **additional conditional gates**; they do not force unrelated low-risk public/read-only routes to wait for every feature. Discovery remains read-only by default. Existing implemented Spec ≤213 compatibility boundaries are not rewritten, Spec 224 in-progress implementation is left untouched, and specialized execution/Redis/Cloudflare-agent logic remains owned by Specs 232/242.

**R5 exit condition:** `DESIGN_AUDIT_COMPLETE` when every new clause is present and independently structurally verified; `IMPLEMENTATION_READY_BY_SLICE` only after live repo/host/account inspection and owners sign required wave evidence; `PRODUCTION_CERTIFIED` only with matching deployed candidate SHA/config, independent verifier and real production acceptance traces. There is no assertion here that zero downtime, exact-once external effects or Cloudflare-wide disaster failover has been achieved in production.

## 82.1 External specification references checked for R5

- Cloudflare Worker request context and `waitUntil`: https://developers.cloudflare.com/workers/runtime-apis/context/
- Workers plan/body/subrequest/connection/static asset limits: https://developers.cloudflare.com/workers/platform/limits/
- Authoritative DNS setup, mail records and DNSSEC: https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/
- Runtime placement semantics: https://developers.cloudflare.com/workers/configuration/placement/
- Regionalized Workers restrictions: https://developers.cloudflare.com/data-localization/how-to/workers/
- R2 event notifications: https://developers.cloudflare.com/r2/buckets/event-notifications/
- Queues default at-least-once delivery: https://developers.cloudflare.com/queues/reference/delivery-guarantees/
---

# 83. R6 — Fifteen Additional Failure-Oriented Audit Passes and Normative Amendments

**Audit date:** 2026-09-25 (Asia/Bangkok). **Baseline:** entire Spec 245 R5, including merged operational WP00–WP12, the R3–R5 audit appendices, `A01–A75`, `MP31–MP40` and `T01–T24`. **Method:** inspect existing contracts for absent or weak failure behavior; cross-check material Cloudflare platform behavior against official documentation; add one independently testable corrective clause per pass. **Boundary:** documentation review, not proof of deployed code, current repository/production topology, owner approval or Cloudflare account entitlement.

## 83.1 Precedence, identity and unchanged authorities

R6 §§83–100 supersede conflicting weaker language in R1–R5; compatible clauses remain normative. New main acceptance IDs are `A76–A90`, taking the primary series to **A01–A90**. Historical `MP31–MP40` and `T01–T24` remain intact. New audit IDs are `R6-01–R6-15`; do not renumber prior audit IDs or rewrite their evidence. `spec_id=245` remains provisional until verified on authoritative repository main plus pending PRs/worktrees.

Spec 245 is solely the **full-system migration program**, compatibility testing, release gates and Debian retirement authority. Feature 186/195 remains the one `worker_jobs` authority; Spec 232 remains Redis/BullMQ and delivery migration authority; Spec 242 remains Agent/DO/Sandbox runtime authority; Spec 219 governs tenant runtime; Spec 220 governs authorization/privacy; Spec 207 governs credits; Spec 229 governs production Vectorize retrieval; Spec 231 governs inference routing; in-progress Spec 224 is consumed, not rewritten. Original Specs 1–213 are immutable design-history compatibility boundaries. Do not add a second job, scheduler, payment, permission or workflow ledger.

## 83.2 Fifteen-pass gap register

| Pass | Lens | Gap or insufficient R5 guarantee | R6 corrective requirement | Acceptance |
|---:|---|---|---|---|
| R6-01 | Route failure semantics | Global “fail closed” application policy does not certify the **Cloudflare Worker Route fail-open/fail-closed configuration** on exhaustion/error. | §84 per-route fail mode and origin-bypass denial tests. | A76 |
| R6-02 | Container rollback artifacts | Retaining Worker source/version does not guarantee the old Container image still exists; Container disk is not durable application storage. | §85 immutable image retention, restore probe and artifact checkpoint. | A77 |
| R6-03 | Transitional Debian bridge HA | A single Debian host or one `cloudflared` host can fail during incremental migration even if the Worker edge is healthy. | §86 classified per-slice transitional dependency and meaningful tunnel/host failure injection. | A78 |
| R6-04 | CDC and WAL exhaustion | A replication checkpoint can be correct while a long snapshot/lagging slot fills source disk and causes a legacy production outage. | §87 replication slot/WAL retention and lag admission; throttle or stop safely. | A79 |
| R6-05 | Streaming protocol fidelity | WebSocket drain does not certify SSE/HTTP streaming, MCP/A2A event order, cancellation or last-event recovery across proxies. | §88 protocol-level streaming compatibility matrix and end-to-end test. | A80 |
| R6-06 | Partial object delivery | R2 integrity/private ACL tests do not certify HTTP `Range`, `If-Range`, `HEAD`, `206`, `304`, `416` or seek/resume semantics for large media. | §89 secured conditional/ranged access tests on all delivery routes. | A81 |
| R6-07 | Zone-wide blast radius | Per-route Canary cannot contain changes to WAF, cache rules, TLS modes or other zone-global settings affecting unmigrated routes. | §90 zone-global change admission and full-zone rollback proof. | A82 |
| R6-08 | Nonproduction external effects | Shadow side effects may be disabled in code while staging accidentally uses live provider secrets/webhooks or production billing accounts. | §91 binding-level sandbox isolation and negative side-effect evidence. | A83 |
| R6-09 | Late durable messages | Cross-Worker version tests do not fully exercise old persisted Queue/outbox/event payloads arriving after code and DB contracts have changed. | §92 durable-message version window, fixtures, quarantine and non-destructive recovery. | A84 |
| R6-10 | Whole business-journey continuity | Route-local pass can miss failures at mixed legacy/new boundaries across signup, payment, tool action, R2/Vectorize and terminal notification. | §93 versioned end-to-end journey matrix with real inter-wave handoff. | A85 |
| R6-11 | Canary inference quality | Percentage canary at low volume can appear green without enough exposure or a peak period; simple before/after p95 may be confounded. | §94 baseline/comparable-cohort, sample-coverage and high-consequence stop policy. | A86 |
| R6-12 | Per-user external connectors | Platform secret rotation does not automatically preserve user-owned OAuth grants, redirect URIs, BYOK credentials and refresh-token transitions. | §95 connector-by-connector delegated credential continuity and revocation tests. | A87 |
| R6-13 | Placement observability | Smart Placement applies to `fetch` handlers, not all RPC/named invocations, so an HTTP benchmark can conceal expensive remote backend work. | §96 invocation-class placement/latency matrix and data-residency separation. | A88 |
| R6-14 | Webhook ingress security | Routing a provider callback around a challenge can accidentally produce an unauthenticated origin or all-path WAF bypass. | §97 narrow rule scope, signature/replay validation, attack probes and retirement of exceptions. | A89 |
| R6-15 | Pricing/credit continuity | A migrated or delayed long-running operation can be settled under a **new** price/rate table rather than the originally approved quote. | §98 immutable quote/policy version and settlement parity across runtime cutover. | A90 |

---

# 84. Per-Route Fail-Mode and Protected-Origin Gate (R6-01)

Cloudflare documents Workers route **Fail open** versus **Fail closed** behavior when account request quotas are exceeded. A fail-open route may bypass Worker logic and return the underlying origin response; this is unacceptable where the Worker enforces security or financial admission. A security policy described in TypeScript is not equivalent to verified zone route configuration.

Required `edge-route-failure-manifest.yaml` for every Worker Route, Custom Domain and fallback origin:

```yaml
route_id:
zone:
worker_name:
entrypoint:
fail_mode: FAIL_CLOSED|FAIL_OPEN|NOT_APPLICABLE
security_role: PUBLIC_READ|AUTH_GATE|BILLING|TENANT_DATA|CALLBACK|OTHER
origin_behavior_on_worker_bypass:
quota_plan_and_observed_limit:
error_page_or_degraded_response:
fallback_route:
change_owner:
last_exhaustion_probe:
```

- `AUTH_GATE`, `BILLING`, `TENANT_DATA` and protected service routes MUST fail closed on any path whose bypass would evade authorization, tenant controls, consent, charging or existing rate policy. Prefer a verified safe unavailable response over exposing the legacy origin.
- A truly public immutable route MAY use fail-open only after confirming origin/cache privacy, correct fallback behavior and no bypassed abusive-action or origin-cost controls.
- Prove quota exhaustion/failure via isolated test configuration or authorized non-disruptive simulations; do not intentionally exhaust the live account. Measure whether the underlying legacy Debian origin is reachable directly, through Worker bypass, from `workers.dev`, or from an alternate hostname.
- Route configuration and tested mode are part of the §41 Deployment Configuration Manifest and §62 promotion attestation. A code rollback that changes route settings must re-run this gate. Protect customer-facing operators from a false “green” when a fail-open route silently bypasses monitoring.

**Official platform reference:** https://developers.cloudflare.com/workers/platform/limits/

---

# 85. Container Image Retention, Ephemeral Workspace and Rollback Gate (R6-02)

An attested old Worker version is **not a functional rollback** if its referenced Container image has been deleted, its startup contract changed or its execution depended on lost instance-local files. Cloudflare warns that deleting Container images may break a Worker rollback to earlier versions.

For each Container/Sandbox-backed workload create:

```yaml
container_rollback:
  logical_executor:
  image_digest_current:
  image_digest_prior_certified:
  source_and_sbom_digest:
  image_registry_and_retention_deadline:
  entrypoint_and_compatibility_profile:
  instance_type_memory_cpu_disk:
  startup_readiness_and_grace:
  workspace_persistence_class:
  r2_checkpoint_pointer:
  pg_job_attempt_and_fencing:
  cold_start_and_crash_probe:
  rollback_reattach_result:
```

- Pin images by immutable digest and retain current + last certified rollback images through the per-family rollback horizon. Registry garbage collection needs a verified reference graph, not image age alone.
- Container disk is an **execution workspace** unless its specific persistence semantics have been separately certified. Store durable artifacts in R2 and durable job/checkpoint/effect state in existing canonical PG authorities; recover from terminated/replaced instances without assuming a surviving local file.
- Before promotion, boot the old image against the **new compatible control-plane schema** in a staging rollback drill; test known runtime binaries (FFmpeg/Remotion/Chromium/Python libraries), startup/shutdown time, cache warming and resource ceilings. Do not claim rollback if the image can no longer be pulled.
- Respect per-account Container instance, image-storage and concurrency quotas already collected in §63; ensure overlap of old/new images plus staging capacity.

**Official platform reference:** https://developers.cloudflare.com/containers/platform/limits/

---

# 86. Transitional Tunnel/Origin Availability and Dependency Exposure (R6-03)

During incremental migration, the Debian machine remains a live production dependency for explicitly unmigrated routes. Moving DNS to Cloudflare does not make those legacy services independently highly available. `cloudflared` replicas provide alternate **connectors**, but replicas on the same Debian host do not protect against that host's failure; tunnel replicas alone do not guarantee deterministic traffic steering.

- P245.0 inventory shall distinguish `DEBIAN_SINGLE_HOST_DEPENDENCY`, `TUNNEL_CONNECTOR_DEPENDENCY`, `MANAGED_DB_DEPENDENCY`, and `CLOUDFLARE_DEPENDENCY` for **every** active route and job family throughout transition, not just at the final retirement gate.
- Maintain an explicit `legacy-origin-bridge.yaml` with route, owner, DNS/Tunnel ID, connectors and physical hosts, health probe, origin-only hostname, firewall rule, expected degraded behavior, emergency routing control, certificate and callback exceptions, and retirement deadline.
- For a service that requires host-level continuity, either provision a legitimately independent legacy failover host or record the residual single-host risk and prefer early migration of that route. Two replicas on one computer MUST NOT be called host HA.
- Conduct connector-loss, full-Debian-power-loss (staging/safe-drill only), private-network partition and legacy origin timeout tests. A healthy edge Worker returning cached public HTML while Auth/Chat still requires Debian is **partial availability**, not full-system zero downtime.
- Never route a protected request to an unverified fail-open legacy origin when Cloudflare/Tunnel/managed PG is unavailable. Avoid recursive origin proxying and unbounded request retries.

**Official platform reference:** https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-availability/

---

# 87. PostgreSQL Replication-Slot, WAL and Snapshot-Capacity Gate (R6-04)

A source→managed PostgreSQL migration may require logical replication/CDC. Correct LSN or row-count checks do not prevent a stalled consumer from retaining WAL indefinitely, exhausting Debian disk and taking down the still-live production primary before cutover.

Before enabling snapshot/CDC collect `pg-cdc-capacity.yaml` **only if the selected source/provider supports and uses this mechanism**:

```yaml
source_disk_free_and_headroom:
source_write_peak_bytes_per_hour:
base_backup_size_and_duration:
replication_slot_count_and_owners:
confirmed_flush_lsn_per_slot:
restart_lsn_per_slot:
retained_wal_bytes:
wal_retention_limit_and_alert:
expected_and_observed_lag:
source_io_cpu_network_budgets:
backfill_rate_cap:
cdc_failure_policy:
rollback_consumer_cleanup:
```

- Size for worst-case baseline write amplification plus snapshot/backfill and the other simultaneously admitted migration waves; use an explicit WAL/disk alarm that stops/throttles the migration before it harms legacy serving traffic.
- Test disconnected replica, stalled apply worker, snapshot restart and unexpectedly long index build; reconcile CDC continuity on resume.
- Do not delete an active slot blindly, silently skip changes to meet a deadline or claim `RPO=0` without verified final LSN/sequence and writer fencing. If provider CDC/slot support is absent, switch to an alternative documented copy/cutover mechanism rather than inventing a logical-replication path.
- Include backups/PITR/storage and replica slot cleanup after cutover with owner sign-off. Report **observed** lag/headroom, not only estimated budget.

---

# 88. SSE, MCP, A2A and Long-Response Stream Compatibility (R6-05)

The §43 long-lived-session contract emphasizes WebSocket/WebRTC. SmartAIHub also needs protocol-level checks for any actually deployed SSE/HTTP event streams, MCP HTTP transport, A2A endpoints, provider streams and download streams. Do not assert that the system uses a protocol merely because a spec describes it: identify actual server route, supported version and client first.

`stream-protocol-compatibility.yaml` for each real endpoint:

```yaml
route_and_version:
transport: SSE|HTTP_STREAM|WEBSOCKET|WEBRTC|OTHER
client_protocol_min_max:
auth_and_reauthorization:
content_type_and_cache_control:
intermediary_compression_and_buffering:
idle_timeout_and_heartbeat:
event_id_and_resume_semantics:
ordering_and_dedup:
cancel_and_provider_abort:
canonical_run_receipt:
usage_and_credit_settlement:
proxy_fallback:
observed_mobile_reconnect:
```

- Preserve each protocol's actual contract for event ordering, IDs, tool arguments, partial function calls, cancellation, `Last-Event-ID` **where the protocol supports it**, and typed terminal conditions. If the original protocol has no replay semantics, use a canonical run/job receipt + authorized snapshot rather than inventing guaranteed resumability.
- Test client disconnect immediately after durable admission, after an external provider accepts paid work, during tool call and just before terminal settlement. Cancellation of an HTTP stream MUST NOT automatically cancel a canonical background job unless the existing job policy explicitly requires it; usage/credits must settle against real provider effect.
- Verify buffering/timeout/compression through real Cloudflare route, Service Bindings, tenant custom domains and any remaining Debian origin proxy; local Miniflare/Vitest success is insufficient for production route certification.
- Preserve Spec 199/200/206/231 protocol and inference ownership; this section only certifies hosting migration fidelity.

---

# 89. Authorized HTTP Range and Conditional Media Delivery (R6-06)

A correct R2 SHA-256 and private object ACL do not prove browser seek, resumable downloads or conditional cache behavior. Test **all actual delivery surfaces** (authenticated Worker, signed direct link, public asset domain, mobile/mini-app client).

- Implement and certify relevant `HEAD`, `Range`, `If-Range`, `If-None-Match` and `If-Modified-Since` semantics for supported media routes. Map satisfiable partial requests to HTTP `206` and correct `Content-Range`, `Content-Length`, `Accept-Ranges` and safe MIME; invalid/unsatisfiable ranges to appropriate `416`; conditional not-modified responses to `304` where permitted.
- Recheck current tenant/user ACL **before** returning `304`, `206` or metadata in protected routes: the absence of a response body does not make headers, existence or media duration public. Avoid caching private `206` chunks without an approved scope-aware cache policy. Cache purge, signed link expiration and client offline caches remain separately assessed by R4.
- Propagate cancellation and backpressure to R2 streams; do not buffer multi-GB objects in Worker memory. Test browser seeking at object boundaries, interrupted download/retry, media playback across version changes and content hash verification after reassembly.
- Validate with the exact deployed video/editor/browser clients, including mobile/tablet, not a lone `curl 200` fixture.

**Official platform reference:** https://developers.cloudflare.com/r2/api/workers/workers-api-reference/

---

# 90. Zone-Global Settings and Uncanaried Traffic Blast Radius (R6-07)

Some Cloudflare settings are **zone-level**, not per-Worker, per-route or percentage-canary controls. A changed WAF rule, cache rule, TLS setting, bot challenge, redirect transform or Access policy can affect an unmigrated Debian route before its own migration wave begins.

Add `zone-change-impact.yaml` to each production change:

```yaml
zone_and_account:
change_kind:
affected_hosts_paths_and_tenants:
global_or_scoped:
legacy_routes_impacted:
old_and_new_config_digest:
rollback_method:
canary_feasible:
shadow_or_rule_simulation:
protected_business_journeys:
owner_and_approval:
```

- Treat globally scoped changes as a separate high-blast-radius wave requiring **whole-zone route inventory**, tested alternate domains where available, independent approval, planned observation and verified rollback rather than advertising them as a 1% request canary.
- For WAF/bot challenges, test third-party signed callbacks, mobile/Desktop API clients and OAuth redirects in addition to ordinary browser sessions. For cache rules, prove no private pages, tokens, sensitive headers or authenticated responses become publicly cacheable.
- Where a zone-global change is irreversible, document an explicit forward-fix/compensating mechanism; do not promise feature-flag reversal.

---

# 91. Shadow/Staging Isolation of Production Provider Effects (R6-08)

Disabling writes in a shadow handler is insufficient when a staging environment shares a real LLM/media/payment account, webhook destination, BYOK credential, OAuth app or admin notification channel. One wrong binding could still incur costs or mutate a real account outside the code path under test.

- Each staging/preview/shadow deployment SHALL have a **negative entitlement manifest** declaring prohibited production billing/provider keys, outbound domains, real customer email/SMS destinations, Cloudflare prod R2/Queue/DO bindings and real callback registration. Assert nonproduction identities cannot perform real production economic mutations even when their code attempts them.
- Default to synthetic tenant IDs and fake providers. When fidelity requires a real paid provider, use an explicitly approved isolated account, per-test spend cap, resource naming prefix, preauthorized cleanup and owner acknowledgment; no background test should create live customer side effects.
- Add binding and network **deny tests**, not merely positive tests that the configured sandbox works. Verify Worker `env`, Python/Container environment, CI runners, Docker secrets, external harnesses and webhook callbacks independently.
- Prevent shadow request duplication to a provider that charges for reads, exposes private payloads or mutates a remote state. Any permitted shadow egress must satisfy §40 tenant privacy/data-locality policy and Spec 207 cost gates.

---

# 92. Persisted Event/Queue Envelope Compatibility and Poison Recovery (R6-09)

Gradual deployment can be short while queue delay, outbox retry, Runner disconnection or provider callback extends for days. A new consumer must safely receive **persisted old-version** events from an already retired producer. The R4 cross-Worker API matrix and Spec 232 delivery contract must be tested together at the Master Program level.

- Inventory actual schema IDs/versions for `worker_job_events`, outbox entries, Queue envelopes, callback bodies, scheduled occurrences and cached offline client operations. For each family record oldest in-flight version, maximum retention/delay, supported consumer range, transformation adapter, request-digest and tenant/fencing fields, plus a deprecation/retirement horizon.
- Enforce expand → dual-read/new-write (as appropriate) → backfill/replay → observe → contract. Do not drop old deserializers/DB columns while any old-format delayed message or offline Runner can legitimately arrive.
- Unknown future schema versions, malformed envelopes or revoked tenants are quarantined with non-sensitive metadata and canonical PG incident record; **never** silently drop or guess a default tenant/permission, and never blindly replay a paid effect.
- Test delayed old messages after a Worker rollout, provider callback from an old job attempt, re-deploy of a previous Worker code version and queue batch mixed envelope versions. `worker_jobs` remains owner of business outcome; Spec 232 retains broker/retry implementation authority.

---

# 93. Cross-Wave Business-Journey Conformance (R6-10)

A route-level/API schema test can pass when the entire customer workflow fails after crossing independently migrated services. Build a journey graph from the **actual current deployed feature/product registry**, not a guessed complete feature list.

Mandatory families **where deployed**: signup/login/2FA; project+tenant access; credits/PromptPay approval and refund; Chat/LLM streaming and tool action; R2 document upload→existing Vectorize indexing→authorized retrieval; media generation→artifact playback; alerts/scheduling; Mini App publication and custom-domain access; offline Runner reconnect; admin approvals/bug reporting; relevant external MCP/A2A agent traffic.

For each journey, explicitly inject mixed-placement transitions: Debian→Worker, Worker→legacy Python, Worker→managed PG, Queue→Runner/Container, webhook→Worker, and old-version mobile→new API. Capture full trace IDs, tenant identity class, immutable provider/economic intent and terminal UX observation.

- Verify business **semantics**, not just HTTP status: exactly one effect under replay, same credits/pricing snapshot, correct ACL, latest authorized project context, same user-visible artifact and eventual canonical terminal state.
- Build at least one failure scenario per bridging edge that is actually used (timeout, 401/403, stale tenant, version mismatch, provider unknown, R2 outage) and require correct recovery/no unauthorized egress.
- Production smoke must include at least one entire real synthetic journey for each critical migrated slice within its approved risk scope. A green standalone Worker health endpoint or static asset render is insufficient.

---

# 94. Canary Statistical Validity and Sparse High-Risk Traffic (R6-11)

The existing 1→5→25→50% stages are configurable defaults, **not evidence** that an API is healthy. For low-traffic or seasonal features, an apparently perfect cohort can contain no meaningful exposure. A simple old-versus-new p95 comparison may hide differences in traffic geography, tenant size, cold starts or hour of day.

Every rollout card SHALL define, **before seeing candidate results**:

```yaml
control_window_and_population:
new_cohort_sampling_or_allowlist:
request_and_user_counts_required:
real_peak_coverage:
region_device_tenant_strata:
error_budget_and_latency_thresholds:
synthetic_journey_coverage:
rare_high_risk_paths:
cost_per_successful_operation:
minimum_observation:
hard_invariant_stop_policy:
```

- Use deterministic cohort assignment and compare like-for-like traffic where feasible, preserving privacy of tenant telemetry. Report **sample sizes and confidence limitations**; do not advertise an inferred statistically significant improvement from a handful of operations.
- Critical low-volume security/payment/approval paths require explicit sandbox and internal cohort fixtures plus human-gated production observation, **not a made-up traffic-percentage guarantee**. Any confirmed authorization bypass, duplicate settlement or stale fencing commit aborts promotion regardless of aggregate success rate.
- If the sample is insufficient at planned deadline, extend observation or hold/pause; do not turn a lack of error observations into a PASS. Baselines must be refreshed when major traffic/device mix or production config changes.

---

# 95. Per-User OAuth, BYOK and Connected-App Continuity (R6-12)

Migrating platform secrets does not imply that **user-owned** external authorizations or BYOK model credentials keep working. The platform may have integration-specific redirect URI registrations, encrypted refresh tokens, host-bound webhooks, delegated scopes and user revocation obligations.

- Inventory actual connected integrations from repository and deployed configuration (without enumerating private credentials in artifacts). For each record integration slug, OAuth client environment, allowed redirect URI, scopes, encrypted token/key storage, envelope-key epoch, webhook/callback, user reconnection behavior, rate quota, data-egress locality and authorized tenant/project scope.
- Preserve valid grants when provider contract and security allow it. If moving to a different OAuth client/redirect requires **fresh user consent**, implement a typed `RECONNECT_REQUIRED` state and safe UX; do not silently reuse incompatible grants or fabricate access. New Worker/service identities must not expand access beyond original user approval.
- Test refresh-token rotation races across legacy/new deployments; stale callback to Debian; revoked account; expired token; insufficient scopes; BYOK provider/model policy under Spec 231; encrypted token inaccessible after KMS/key transition; and offline desktop reconnection.
- Public per-user status is limited to authorization state and necessary reconnection action; secret values must never enter compatibility reports, support traces or cross-tenant caches. Spec 220 owns authorization/privacy and existing provider adapters retain their service integration contracts.

---

# 96. Fetch-vs-RPC Placement and End-to-End Data-Residency Benchmark (R6-13)

Cloudflare Smart Placement optimizes Worker **`fetch` handlers**. It is not a blanket performance or data-residency guarantee for Worker RPC/named entrypoints, Queue/Cron, Durable Objects or every chained Service Binding. Therefore an HTTP-only latency benchmark cannot certify the latency, geography or cost of an MCP/Agent/background route.

Required `invocation-placement-matrix.yaml`:

```yaml
logical_operation:
entrypoint_kind: FETCH|RPC|QUEUE|CRON|DO|CONTAINER|EXTERNAL_RUNNER
actual_location_evidence:
backend_pg_region:
provider_region:
observed_p50_p95_p99:
subrequest_count:
policy_permitted_processing_regions:
placement_config_and_state:
comparison_baseline:
```

- Benchmark actual cross-entrypoint execution chains at normal and peak traffic, including cold and warm DB connection paths, Queue wake time and remote tool/provider egress. Do not extrapolate `fetch` Smart Placement results to RPC or background jobs.
- Measure Thailand/client-region response time **and** origin PG round trips; optimize location only after hard tenant privacy/locality constraints are satisfied. A regional latency improvement does not establish compliant data residency.
- Keep the current fully signed-off production placement when optional optimization worsens cost, tail latency, security, locality or operational stability. Re-run when origin provider/region or Worker entrypoint topology changes.

**Official platform reference:** https://developers.cloudflare.com/workers/configuration/placement/

---

# 97. Provider Webhook WAF Exceptions and Replay-Safe Ingress (R6-14)

External providers may not solve JavaScript challenges or carry end-user sessions. A broad WAF skip to make one webhook work can unintentionally expose an entire API origin; outright blocking can strand paid provider callbacks during migration.

- For each actual provider webhook, create a dedicated route with exact host/path/method/content-type/size policy; scope a necessary WAF exception to that route and approved source conditions where verifiable. **A WAF exception is not authentication**: independently verify provider signature/HMAC/mTLS or approved equivalent before reading or changing canonical business state.
- Validate timestamp/nonce or provider event ID with bounded replay window and existing tenant/job/effect idempotency; reject stale attempt/route generation for state changes. An unauthenticated callback may be observed with non-sensitive telemetry but MUST NOT settle credits or complete a job.
- Test legitimate signed delivery, wrong signature, path traversal/alternate method, oversized body, replayed event, old origin callback, compromised header, provider IP change and high-rate abuse. Maintain a bounded old/new endpoint overlap only while verified and independently auditable.
- Any emergency skip/challenge override requires security owner approval, expiry, automated reminder and old-origin retirement gate. This requirement complements §37 and §90 without creating a second webhook state authority.

---

# 98. Immutable Economic Quote and Cross-Runtime Settlement Parity (R6-15)

Paid work admitted before a migration or model/provider configuration update may finish after cost tables, markup, FX/credit conversion or cancellation policy change. Repricing solely from the **current** table at completion can overcharge/refund incorrectly even when there is one canonical ledger transaction.

For each real billable operation, reuse the existing Spec 207 financial owner and persist/retrieve an immutable authorized economic intent containing the applicable **quote/pricing policy revision**, user consent/grant where required, reservation or hold ID, provider/deployment selection where relevant, credit-conversion basis, cancellation/partial-charge terms and provider effect reference. Do not add a duplicate credit ledger in Spec 245.

- During migration, compare old/new implementations against the **same admitted economic snapshot**. Charge/refund once against the scoped canonical effect key after reconciling observed provider usage and applying the originally consented policy or explicitly authorized change terms.
- Test old Runner→new Worker settlement, provider callback arriving after migration, cancellation during WebSocket disconnect, late provider usage report, expired hold and duplicated outbox dispatch. If provider usage is unknown, expose `SETTLEMENT_PENDING_RECONCILIATION` rather than estimating a final charge without a governed policy.
- Confirm any new price policy affects only operations admitted under its effective revision unless an approved and communicated exception exists; preserve existing pricing authority and legal/customer obligations under Spec 207.

---

# 99. R6 Acceptance Scenarios — A76–A90

## A76 — Security Worker quota exhaustion unexpectedly bypasses origin
A protected `auth` or tenant-data Worker reaches its request quota while its route was accidentally set fail-open. **Expected:** CI/config gate prevents deployment; authorized safe simulation proves the route cannot bypass authorization and exposes a safe unavailable result.

## A77 — Rollback refers to deleted Container image
A previous Worker version is available but its FFmpeg/agent Container image has been garbage-collected. **Expected:** rollback admission fails before cutover; immutable image retention and a boot/recovery test are required.

## A78 — Transitional tunnel connector/host failure
One tunnel connector disconnects, then the entire Debian mini server fails while some routes still depend on it. **Expected:** connector failover only where real independent host capacity exists; all non-HA legacy slices report honest degraded state; no false zero-downtime certification.

## A79 — Replication slot stalls during peak writes
PostgreSQL CDC apply stalls while long-running backfill continues to retain WAL. **Expected:** headroom alarm pauses/throttles migration before legacy production disk exhaustion; replay resumes from validated checkpoint or approved alternate migration path.

## A80 — HTTP event stream loses tool/result ordering
An SSE/MCP stream crosses Cloudflare and the legacy origin during canary; client disconnects between tool execution and terminal event. **Expected:** canonical receipt, correct event ordering and authenticated recovery/snapshot where supported; no duplicate paid tool action or premature settlement.

## A81 — Private video range after tenant revocation
A revoked user requests `Range`/`If-Range` against a previously allowed R2 video while another user seeks a public video. **Expected:** fresh protected ACL denies metadata/bytes on every conditional/partial path; valid public request returns correct `206` or `416` semantics and plays correctly.

## A82 — Zone-wide WAF change breaks legacy OAuth and provider callback
A 1%-route canary includes a zone-global WAF challenge rule that blocks unmigrated OAuth and provider callbacks. **Expected:** whole-zone blast-radius gate rejects the per-route canary label; scoped change or independently approved global rollback test required.

## A83 — Staging Worker sends real paid media generation
Staging accidentally contains a production provider API key and a test handler calls the live generation endpoint. **Expected:** negative entitlement/egress gate denies effect before paid call; redacted incident/audit and binding remediation required.

## A84 — Old-format delayed Queue message after new DB schema
A job created under old BullMQ/Queue envelope is delivered days after a consumer deploy and schema contraction. **Expected:** approved old-version deserializer and canonical fencing are preserved; otherwise message quarantined with durable recovery, never silently dropped or guessed.

## A85 — All routes pass separately but cross-wave user journey fails
User pays, launches an agent tool and uploads an artifact while Auth is on Workers, Python remains Debian and notification uses new Queue. **Expected:** cross-wave end-to-end synthetic journey detects incorrect ACL/economic finality/artifact/notification continuity; wave cannot promote based on route-local tests alone.

## A86 — Five green requests used as a production confidence claim
A quiet or seasonal operation observes no failures from a tiny canary sample. **Expected:** report sample limitations and missing peak/cohort coverage; extend observation/hold rather than issue a production PASS; hard security invariants retain zero-tolerance stop.

## A87 — User OAuth grants stop working after host migration
An external provider's registered redirect URI or OAuth client changes; old refresh tokens and BYOK grants cannot be used unchanged. **Expected:** scoped continuity check, typed `RECONNECT_REQUIRED` if re-consent necessary, preserved existing authorized data and no secret exposure.

## A88 — Smart Placement benchmark certifies only fetch, RPC still remote
An HTTP benchmark improves while chained Agent RPC/Queue calls incur remote PG round trips and violate tenant locality. **Expected:** invocation-class performance/geography matrix rejects generalization from fetch and blocks unapproved data egress.

## A89 — Broad WAF webhook exception exposes tenant API
To receive a provider callback, a global rule skips challenges for all `/api/*` traffic. **Expected:** least-scope exact webhook exception, signature and replay enforcement, negative attack tests, approval and expiration before migration promotion.

## A90 — Job settles under the wrong rate table after cutover
A video job admitted with one credit-conversion/pricing revision finishes after migration to a newer rate card. **Expected:** settlement uses the original authorized economic snapshot, reconciles actual usage and charges/refunds exactly once; unknown outcome remains pending.

---

# 100. R6 Implementation Inserts, Rollout Effects and Audit Exit

R6 adds the following **conditional** migration gates and work packages. They supplement—not replace—P245.0A–P245.0AA and WP00–WP12:

```text
P245.0AB  Edge route fail-mode manifest + quota-bypass negative tests
P245.0AC  Container image retention + image-pull rollback drill
P245.0AD  Legacy-origin/Tunnel host-availability and failure-injection matrix
P245.0AE  PG CDC WAL/slot capacity + stalled-replica probe
P245.0AF  Streaming protocol fidelity (SSE/MCP/A2A) and disconnect suite
P245.0AG  Authenticated R2 HTTP Range / conditional-media suite
P245.0AH  Zone-global settings blast-radius and rollback admission
P245.0AI  Staging/shadow provider-effect negative-entitlement suite
P245.0AJ  Persisted asynchronous envelope/schema backward compatibility
P245.0AK  Cross-wave end-to-end business-journey coverage
P245.0AL  Canary sample adequacy and cohort/peak parity audit
P245.0AM  User OAuth/BYOK/connected-app continuity tests
P245.0AN  Fetch/RPC/Queue placement and tail-latency benchmarking
P245.0AO  Exact-scope provider webhook WAF/signature/replay tests
P245.0AP  Immutable economic quote/credit settlement parity
```

**Gating policy:** a safe, proven public and side-effect-free Worker slice may launch once its own gates (including AB where a Worker Route is involved) pass; it need not wait for unrelated OAuth, heavy media, CDC or Docker refactoring. Before any sensitive route, enforce AB/AH/AI as applicable. Before any Container-backed paid production wave, require AC/AK/AP. Before managed PostgreSQL CDC, require AE. Before complete Debian retirement, every observed live path and rare-path schedule must be assigned to the applicable gate or an independently approved `NOT_APPLICABLE` with evidence; unresolved critical dependencies remain `BLOCKED`.

**Source verification (official docs accessed 2026-09-25):**

- Workers limits and fail-open/fail-closed route behavior: https://developers.cloudflare.com/workers/platform/limits/
- Containers instance types/image-retention warning: https://developers.cloudflare.com/containers/platform/limits/
- Tunnel connector replicas and physical failure boundaries: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-availability/
- Workers Gradual Deployments/Version Skew: https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/
- Workers version affinity: https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/version-affinity/
- R2 conditional/ranged reads API: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
- Workers placement entrypoint scope: https://developers.cloudflare.com/workers/configuration/placement/
- Workers versions do not version storage state: https://developers.cloudflare.com/workers/versions-and-deployments/

**Status discipline:** `R6_SPEC_AUDIT_COMPLETE` means fifteen distinct document audit lenses were checked, the newly discovered gaps were specified and deterministic document-integrity checks passed. It is not `P245.0_DISCOVERY_COMPLETE`, `IMPLEMENTED`, `LIVE_CERTIFIED`, `PRODUCTION_PRIMARY` or `DEBIAN_RETIRED`. Current Git registry, source/runtime inventory, account quotas, security policy, production SLO baselines, managed database capabilities and each deployment's actual configuration must be verified before live changes.

---

# 101. R7 — Thirteen New Failure-Oriented Audit Passes and Current Precedence

**Audit date:** 2026-09-25 (Asia/Bangkok). **Baseline:** the complete Spec 245 R6 including R1/R2 integration and R3/R4/R5/R6 amendments. **Audit type:** design-document and publicly documented platform-contract review; **not** live SmartSpecPro implementation, cloud-account entitlement testing, Debian host inspection or production certification.

**Effective precedence:** R8 §118 supersedes R7 and earlier wording only on Redis-retirement timing and the acceptance of a planned maintenance pause; R7 §§101–117 otherwise supersede conflicting earlier wording. R6 §§83–100 supersede R5; R5 §§65–82 supersede R4; R4 §§48–64 supersede R3; R3 §§33–47 supersede R2; inherited R1/R2 requirements remain effective when compatible. Original merged-plan WP00–WP12 remain valid as operational work packages, not independent specs. A document audit PASS does not mean code or live deployment PASS.

The thirteen rounds below are **new and distinct** from R3's 12, R4's 14, R5's 15 and R6's 15 lenses. A round is counted only where it identifies a traceable latent failure and adds a normative rule plus an acceptance fixture. Unresolved real-world unknowns remain BLOCKED pending P245.0 evidence.

| Pass | Distinct failure lens | Concrete R6 gap | Normative correction | Test |
|---|---|---|---|---|
| R7-01 | Scanner itself changes production | Read-only intent lacks explicit sandbox/privilege boundary for package install, postinstall, probe execution and `docker inspect` secrets. | §102 non-executing default scan, sandboxed behavioral probes, least-privilege Debian observer, redacted findings and no production credentials. | A91 |
| R7-02 | Method-level Node `dns` support | Generic API probes can classify `node:dns` as supported even when a used method throws. | §103 actual call-site/method coverage including known unsupported `lookup`, `lookupService` and `resolve`; no import-only PASS. | A92 |
| R7-03 | Edge↔origin recursion | R2 warns about loops but does not mandate a concrete negative runtime fixture through same-zone routes, tunnel and Service Bindings. | §104 route-hop graph, internal origin-only addressing, bounded hop IDs, Cloudflare 1019/1042 fault fixtures. | A93 |
| R7-04 | In-flight write at the cutover boundary | Generation/fencing protects durable jobs but an already admitted synchronous mutation can straddle a DB or API writer transfer. | §105 cross-ingress admission epoch, drain/abort and uncertain-commit reconciliation; never silently replay financial/tool mutations. | A94 |
| R7-05 | Webhook signature loses byte identity | Signature/replay checks exist, but proxy/middleware JSON parsing or redirects can alter the signed body/URL before verification. | §106 capture exact raw bytes, verify before transform, preserve canonical host/path/method and deny unsafe redirects. | A95 |
| R7-06 | Backfill misses live deletes or updates | Snapshot/CDC and high-watermarks are required, but deterministic chunk coverage and tombstones crossing snapshot boundaries are underspecified. | §107 bounded keyset chunks, snapshot cursor, CDC overlap, per-chunk checksum, delete tombstone precedence and exception ledger. | A96 |
| R7-07 | Cloudflare artifact quotas at full product scale | Account quota gate does not require per-Worker deployable bundle/static-file size checks **including rollback asset retention**. | §108 per-version build-artifact quota verification from current account limits and rollback-version availability. | A97 |
| R7-08 | Hyperdrive pool restart and ambiguous commit | Pool/PG failover tests exist, but a pool restart can sever an in-flight transaction *after* a client loses certainty of commit. | §109 explicit UNKNOWN_COMMIT branch, idempotent result lookup, no automatic replay of non-idempotent writes, pool-restart drill. | A98 |
| R7-09 | Cross-Service Binding subrequest exhaustion | R5 already budgets six outgoing connections, but lacks a full request-DAG budget for redirects, internal subrequests, retries and per-hop limits. | §110 per-entrypoint budget DAG, hop caps, end-to-end cancellation, retry-storm protection and current plan-limit verification. | A99 |
| R7-10 | Native binary/license migration gap | Compatibility scanner checks binary execution but omits deployment rights and distribution constraints for packaged codecs, fonts, SDKs and proprietary tooling. | §111 runtime image/SBOM/license and allowed-deployment inventory; uncertain packages BLOCKED until owner/legal review. | A100 |
| R7-11 | Preview-resource leak or destructive cleanup | Environment drift is covered but temporary test Workers/Queues/DOs/R2 buckets can accumulate or a cleanup job can delete shared production resources. | §112 resource lifecycle leases, ownership tags, environment-unique IDs, deny-by-default GC and account quota alerts. | A101 |
| R7-12 | Clock skew across edge, Runner and PG | Scheduling, lease and token checks exist separately but mixed runtimes may compare non-authoritative wall clocks for ownership/expiry. | §113 trusted canonical epoch/time source for mutations, skew budget, token leeway policy and negative race tests. | A102 |
| R7-13 | Long layered spec yields ambiguous active rule | R6 preserves historical “R2 latest” language; appendix precedence alone is hard to compile into a deterministic implementation contract. | §114 machine-readable effective-requirement index, supersedes/tombstone fields, gate resolution and collision checks; preserve provenance. | A103 |

---

# 102. Read-Only Compatibility Scanner and Probe Isolation (R7-01)

`P245.0` SHALL begin with a **non-executing** source/config parser. Reading a repository is not permission to execute its `postinstall`, npm/pip setup, Dockerfile `RUN`, workspace scripts, migration files, test hooks, Git hooks, cloud CLI or provider adapters. Runtime probes are a separately admitted operation.

Required `scanner-execution-policy.yaml`:

```yaml
scanner_identity: least_privilege_read_only
source_revision: pinned_sha
allowed_repo_roots: []
production_env_available: false
production_provider_egress: false
node_package_scripts: disabled
python_setup_hooks: disabled
subprocess_allowlist: []
probe_environment: isolated_nonproduction
filesystem: read_only_source_plus_ephemeral_scratch
network_policy: deny_by_default
resource_caps: {cpu: null, memory: null, runtime_seconds: null}
raw_secret_capture: prohibited
report_retention: bounded
operator_approval_for_host_probe: required
```

Static scans may inspect `package.json`, lockfiles, imports, ASTs, Dockerfiles, compose, systemd unit definitions and file metadata **without executing repository-controlled code**. The Debian host observer uses an explicitly enumerated command/capability allowlist; do not routinely print process environments, decrypted Docker secrets, service unit secret values or connection strings. Derive a redacted fingerprint/owner/path when evidence requires matching an environment variable.

When execution is necessary to establish compatibility, launch an isolated disposable Worker preview or approved sandbox from a reviewed, pinned build. No production service token, production database write authority, real webhook endpoint or paid provider credential may be present. Sandbox results require artifact hash, policy digest and negative egress proof. A scanner error or unsupported probe becomes `UNKNOWN`/`BLOCKED`, never automatically `COMPATIBLE`. Host observations from SSH are historical snapshots, not proof that the same binary is currently deployed in Production.

---

# 103. `node:dns` and API-Method Compatibility Fixtures (R7-02)

Cloudflare's currently documented Node compatibility exposes the `node:dns` module yet identifies `lookup`, `lookupService` and `resolve` as **not implemented**. A package that imports `node:dns` or uses supported methods in one path may still fail under ordinary Node libraries that invoke the missing methods at runtime.

The compiler SHALL record `{package, pinned_version, caller_symbol, invoked_method, runtime_profile_id, covered_test, observed_result}` for **every production-reachable Node API method**, with risk-based priority for `node:dns`, `node:fs`, `node:http`, `node:net`, `child_process` and process/thread behavior. Test actual call paths with realistic input, not only package import. Methods known unsupported under the pinned runtime force an adapter/refactor or alternate runtime placement. Re-probe after package or `compatibility_date` change.

A runtime compatibility PASS is scoped to an entrypoint+dependency graph+behavioral fixture+profile, never to an entire npm package name in all future versions.

Official evidence: https://developers.cloudflare.com/workers/runtime-apis/nodejs/dns/ ; https://developers.cloudflare.com/workers/runtime-apis/nodejs/

---

# 104. Same-Zone Fetch, Proxy Loop and Internal Origin Negative Tests (R7-03)

Incremental Cloudflare migration often introduces Worker → old-origin proxy → canonical domain → Worker loops. A second dangerous pattern is Worker A invoking Worker B using global `fetch` on a same-zone route instead of a governed Service Binding. Cloudflare documents loop and same-zone fetch error behavior; valid Custom Domain/Service Binding configurations are not a license for uncontrolled recursion.

**Required routing graph:** for each ingress route, record `{source_worker, target_service, target_hostname, CF_zone, expected_origin, route_generation, permitted_redirect_chain, hop_ceiling}`. Internal legacy origin hostnames MUST be excluded from their own edge route, authenticated and not publicly usable as an authorization bypass. Worker-to-Worker internal calls SHOULD use a declared Service Binding with independent downstream authorization under R4 §50.

Every migration proxy request carries a trusted internal trace/hop budget **only after stripping caller-supplied copies of that header**. Every redirect increments the observed hop count. Stop and report `ROUTE_LOOP` or `SUBREQUEST_BOUNDARY` rather than recursively calling the same public canonical URL. Test both direct and cross-Worker cycles, stale DNS/canonical redirects, both HTTP/HTTPS and old Tunnel paths. Cloudflare error 1019/1042 handling must not trigger an unbounded retry storm.

Official evidence: https://developers.cloudflare.com/workers/platform/limits/ ; https://developers.cloudflare.com/workers/observability/errors/

---

# 105. In-Flight Synchronous Mutation Cutover Barrier (R7-04)

The `worker_jobs` fencing contract remains in Feature 186/195; Spec 245 SHALL NOT invent a new job ledger or alter Spec 224 finality. This rule covers the **HTTP/ingress transition** for existing synchronous business mutations (payments, approvals, user changes, project permissions, domain publishing and webhook intake) when their Debian and Cloudflare handlers coexist.

Before changing active write routing, establish a versioned admission epoch using existing approved release metadata and the one canonical PostgreSQL authority. New ingress may be routed only after the new handler has passed schema/authz/idempotency compatibility. Every accepted mutation has a stable operation ID and canonical request digest, stored or reconciled via the existing business idempotency contract. Route propagation delay is expected; old-generation in-flight operations must finish against the same canonical primary, be safely rejected before effect, or enter explicit `OUTCOME_UNKNOWN_RECONCILE` if the response/commit result is ambiguous.

During **database writer transfer**, pause newly admitted high-risk writes at the approved ingress boundary; drain bounded in-flight operations and reconcile the durable request/transaction outcome before reopening. Queueing user mutations during a pause is allowed only with an explicit durable receipt, bounded retention, tenant authorization revalidation, accepted terms/pricing snapshot and a tested replay policy. A browser retry without durable receipt cannot be treated as a guaranteed queued transaction. DNS/feature flags do not by themselves fence the old writable database.

Promotion requires a mixed-old/new concurrent-invocation test with delayed responses, transaction commit before disconnect, old origin still receiving callbacks and a repeated client request. Exactly one canonical economic/business effect must remain observable.

---

# 106. Raw-Byte Webhook Verification and Redirect Fidelity (R7-05)

Webhook integrity depends on the provider's **actual** signature specification. For HMAC/signature schemes covering request bytes, capture the raw request body before parsing, compression transforms or reserialization. Verify permitted signature version, exact signed material, timestamp/replay window, expected tenant/provider endpoint and selected secret epoch before deserializing into business commands. Do not log raw signed payloads merely for migration debugging.

A legacy→Worker redirect MAY change method, body or provider-verified URL semantics; therefore do not assume 301/302/307/308 redirects preserve valid provider deliveries. Prefer direct provider callback reconfiguration and a bounded old-endpoint compatibility handler validating the same canonical operation. If the provider signs hostname/path, verify the exact expected host/path on each endpoint and version the overlap. Test body whitespace/order changes, content encoding, duplicate headers, malformed signature, stale timestamp, replay and old-origin retry; reject non-verifiable callbacks even when WAF permits ingress.

This supplements R6 §97 and R4 §37; those sections continue to own host/path authorization and signed callback migration.

---

# 107. Consistent Snapshot, CDC Backfill and Delete Tombstone Convergence (R7-06)

R3/R6 already require snapshot+CDC and WAL safeguards; R7 adds deterministic **row-level completeness** across snapshot boundaries. The data owner SHALL record snapshot cursor/LSN-equivalent, monotonically ordered keyset chunk boundaries, chunk row counts, stable row digests, CDC overlap window, application checkpoint and delete-tombstone provenance. Do not use offset pagination for a concurrently mutating dataset without a proven snapshot.

Every chunk is idempotently upserted into the *non-authoritative target*, with the canonical source's version/write epoch governing conflict resolution. A source delete or consent revoke observed after a chunk was copied must remain deleted in the target even if a delayed copy retries later. PostgreSQL remains single writable business authority; CDC is not independent client-write permission.

A target promotion gate SHALL prove zero unexplained missing/mismatched chunks, no silent skipped CDC window, correct identity/sequence high-watermark, tombstone parity and replay restart from an intentionally interrupted backfill. If counts cannot be fully compared due to size/time, use documented deterministic sampling **plus complete critical-table invariants**; state residual uncertainty and prohibit declaring the full migration certified without an approved closure strategy. WAL and source disk protection from R6 §87 remains mandatory.

---

# 108. Worker Build, Static-Asset and Rollback Retention Quota Gate (R7-07)

R5 §80 addresses tenant topology but the admission manifest MUST verify deployable **per-version** limits, not only the account's number of Workers. Current Workers documentation specifies bundle, number-of-static-asset-files and per-file limits by plan. Treat these as dated platform inputs; collect the actual plan's current figures at `P245.0` and again before a large Mini App/tenant release.

```yaml
build_quota_evidence:
  account_and_plan_ref:
  checked_at:
  candidate_sha:
  compressed_and_uncompressed_bundle_bytes:
  static_file_count:
  largest_static_file_bytes:
  tenant_product_count_and_growth:
  immutable_asset_generations_retained:
  max_allowed_current_plan:
  rollback_candidate_assets_present:
  config_and_profile_digest:
```

A green Cloudflare build on one tiny demo Mini App is not proof that the real multi-product asset graph fits. Require artifact-size budgets, shared immutable assets or a properly partitioned tenant/product build plan when approved. Build and deploy the largest representative tenant product plus its rollback static assets in staging. Never delete the only assets needed by offline clients (R4 §59) merely to fit the new version.

Official evidence: https://developers.cloudflare.com/workers/platform/limits/

---

# 109. Hyperdrive Restart and Ambiguous Transaction-Commit Recovery (R7-08)

Hyperdrive pools PostgreSQL connections in transaction mode. Restarting its pool drops active connections; an application can lose its response at the same time the authoritative PG transaction outcome is uncertain. Retrying **all** failed requests is unsafe for writes with financial, authorization or irreversible external effects.

Run an approved staging drill that restarts an isolated Hyperdrive pool **during** an in-flight transaction and immediately after the commit boundary. The application classifies the outcome using existing canonical request idempotency keys and a **fresh** PostgreSQL result lookup, not a cached query or a guessed client timeout. `UNKNOWN_COMMIT` must not reissue a distinct paid provider call or replay an approval until the prior operation has been reconciled. Pure reads may retry with bounded jitter; writes must follow their domain's certified idempotency semantics.

Record connection churn, recovery latency, failure mode when pool restart itself is unavailable, and whether a code/config rollback can recover without restarting every dependent pool. Avoid simultaneous origin-DB pool restart and managed-primary failover as an untested combined operation.

Official evidence: https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/

---

# 110. End-to-End Subrequest and Retry Budget per Ingress DAG (R7-09)

R5 §73 covers **six simultaneous pending outgoing connections**; that is not the same as total subrequests. Cloudflare also counts internal service operations and redirect chains toward per-invocation limits, with plan-specific ceilings. The Master compatibility compiler SHALL estimate and then instrument the **entire** request DAG across Worker proxy, Auth, Chat, Billing, R2/Vectorize, provider calls, retries and redirects.

```yaml
request_budget:
  entrypoint:
  worker_and_binding_path: []
  max_redirect_hops:
  expected_and_worst_case_subrequests:
  concurrent_open_connection_peak:
  total_retry_amplification:
  end_to_end_deadline:
  cancellation_propagation:
  provider_spend_budget:
  certified_account_limit_snapshot:
```

Use per-hop retry ceilings and a single end-to-end retry/timeout budget to avoid nested retries multiplying into provider 429 storms or request-limit errors. A downstream Service Binding failure must propagate a typed, correlation-preserving outcome rather than loop back to the same public route. Tests SHALL exercise the worst-case authenticated business journey at 1×/2× measured peak and simulate transient 429/5xx at multiple levels. If the budget fails, split the workflow into durable steps or use an appropriate long-running execution backend, preserving Feature 195 authority.

Official evidence: https://developers.cloudflare.com/workers/platform/limits/

---

# 111. Native Dependencies, Third-Party License and Distribution Readiness (R7-10)

For Container/Sandbox/Runner placement, technical execution of a Debian binary does not itself establish that the application may package, distribute, commercially host or export that binary, model, codec, font or third-party SDK in the new runtime. The existing SBOM/provenance gate (R4 §62) SHALL add a machine-readable **license/deployment-rights inventory** for the dependencies actually included in production images. This is an implementation compliance gate; uncertain legal rights require the designated rights owner or qualified legal review rather than automatic clearance by an LLM.

```yaml
third_party_component:
  name:
  version_and_digest:
  source:
  license_or_contract_ref:
  deployed_before:
  proposed_distribution_mode:
  geographic_or_provider_constraints:
  attribution_or_source_offer_actions:
  owner_review:
  outcome: APPROVED|ALTERNATIVE_REQUIRED|BLOCKED
```

Do not package proprietary CLI binaries/desktop applications into a public Worker image or publish redistributed model weights/fonts without recorded approval. This gate may be `NOT_APPLICABLE` for a strictly source-only public Worker route with verified clean dependencies; it does not block unrelated low-risk rollout.

---

# 112. Ephemeral Preview/CI Resource Leases and Safe Garbage Collection (R7-11)

Migration testing can provision real Cloudflare resources even when paid provider egress is disabled. Previews may create Worker routes, queues, dead-letter queues, temporary DO namespaces, Hyperdrive configs, buckets, test domains and external provider callback records. Leftovers consume quota; an overbroad cleanup command can delete a shared production resource.

Every preview/staging resource SHALL have a signed or equivalently governed manifest with `{environment, project, creator, purpose, owner, created_at, expires_at, resource_id, tenancy_class, deletable, linked_job_or_test, cleanup_approval}`. CI identities cannot delete production resources. Preview GC defaults to **dry run**, exact resource-ID match and environment-scoped permissions; it denies cleanup for any resource referenced by an active release, migration command, rollback artifact, `worker_jobs` lease, Container image or archival retention obligation.

Deletion of stateful Durable Object classes/namespaces, R2 buckets and managed PostgreSQL resources requires specialized provider-specific safety checks; no generic wildcard delete. Track orphaned preview resources and their estimated spend separately from real tenant workloads. Require a full dry-run diff, approval and sampled negative tests before activating automated GC.

---

# 113. Trusted Time, Clock Skew and Cross-Runtime Fencing (R7-12)

Debian, Workers, Durable Objects, Containers, external Runners and the managed database do not share one guaranteed wall clock. `Date.now()` or a Runner's local timestamp SHALL NOT decide canonical lease ownership, billing settlement deadline, scheduler occurrence uniqueness or security revocation order where the existing PG authority can provide a monotonic database-issued fence/time source.

Keep stable UTC instant semantics for canonical events, schedule occurrence keys and expiry decisions. Define bounded tolerance for JWT/webhook timestamp validation separately from business ownership; expired or future-skewed privileged credentials never become accepted solely to mask a migration clock issue. Cross-runtime telemetry may carry local timestamps but correlation must include stable operation ID, sequence and acknowledged source clocks; wall-clock ordering alone is not an event-causality proof.

Negative tests: skew Debian +90s and Runner -90s during lease expiry, replay a webhook with manipulated timestamp, repeat DST overlap, force DO alarm after reconnect and compare PG-issued route/lease generations. Feature 195/Spec 232 remains the lease owner; Spec 245 certifies that every migrated runtime follows it.

---

# 114. Effective Requirements Registry and Contradiction Gate (R7-13)

After six append-heavy revisions, an implementation agent may read an old “R2 is normative” header and incorrectly choose weaker gates. R7's front-matter `revision: 7.0` and the current-reader notice supersede historical latest-revision labels, which are retained **only as provenance**.

Create a versioned `spec-245-effective-requirements.json` / schema containing **at least the active R7 additions** and a complete compiler output from all earlier applicable sections before admitting production code work. Every effective requirement has:

```yaml
requirement_id:
source_section:
revision_introduced:
status: ACTIVE|SUPERSEDED|HISTORICAL|NOT_APPLICABLE
supersedes: []
canonical_owner:
applicability:
required_evidence:
verification_test_ids: []
blocker_class:
```

The specification build SHALL reject duplicate requirement IDs, acceptance IDs, orphan test references, supersession cycles, invalid cross-spec authority changes, a `NOT_APPLICABLE` without owner/evidence, and stale claims that an older appendix is the latest normative revision. Implementers MUST use the compiled **effective** registry plus preserved original text; this R7 document alone does not assert that a complete R1–R6 registry has already been derived or that those original paragraphs contain no other contradictions.

**Critical distinction:** a document-level requirements compiler is a static governance tool, **not a parallel migration job execution authority**, scheduler, approval service or business database. It cannot mark migrations or product features implemented without current live evidence.

---

# 115. R7 Acceptance Scenarios A91–A103

## A91 — Compatibility scan executes a production database migration
A repo's `npm postinstall` invokes a migration or a Python setup hook attempts paid egress during discovery. **Expected:** non-executing static scan skips all hooks; sandbox probe denies prod credentials/network and records a redacted blocker rather than changing production.

## A92 — DNS library imports but calls unsupported method
A Worker bundles `node:dns` but production path invokes `dns.lookup()`. **Expected:** method-level fixture fails and placement becomes refactor/alternate runtime; import-only classification is prohibited.

## A93 — Canonical-domain proxy loop
Worker fetches its own same-zone public route via old origin and redirects back into Worker. **Expected:** route-graph validation/hop budget denies the loop before runaway subrequests; no unbounded error retry.

## A94 — Client retries a payment during DB writer transfer
Old Debian handler commits the charge but response is lost as Cloudflare becomes primary. **Expected:** fresh canonical idempotency lookup returns original operation outcome; no second charge or falsely successful duplicate request.

## A95 — Webhook raw bytes altered by proxy
Provider signs the original body; an early JSON parser changes whitespace or order and a redirect changes delivery semantics. **Expected:** verify exact signed bytes before transform, reject invalid delivery and reconcile original callback idempotently.

## A96 — CDC snapshot copies a row after its source deletion
A delayed chunk retries after CDC already delivered a consent-delete tombstone. **Expected:** target remains deleted; chunk checksum and overlap reconciler detect the stale replay.

## A97 — Mini App deployment exceeds static-file quota
Many tenant products compile within code size but cross the account's per-version file limit or old versions' assets needed for rollback were deleted. **Expected:** artifact-size/quota and retained-generation gate block the rollout before production.

## A98 — Hyperdrive pool restarts just after transaction commit
Client receives network failure with ambiguous financial write outcome. **Expected:** result lookup against fresh PG reconciles original idempotency key; no blind retry or double effect.

## A99 — Nested Worker retries exhaust subrequest budget
Auth proxy, Chat service, retriever and provider each retry a throttled call, multiplying requests. **Expected:** DAG-wide budget/cancellation/backpressure prevents limit exhaustion and uncontrolled provider spend; durable operation remains recoverable.

## A100 — Native media dependency lacks deployment rights
Container build works with a bundled proprietary codec/font/model, but allowed hosting/distribution cannot be established. **Expected:** rights owner review blocks that image until cleared or replaced, without blocking unrelated routes.

## A101 — Preview cleanup selects production R2 bucket
CI cleanup uses a name prefix that collides with a shared production namespace. **Expected:** environment-scoped deny, exact-ID manifest and approval prevent deletion; orphan preview is tracked instead.

## A102 — Edge and Runner clocks disagree during lease expiry
Runner clock jumps forward while PG lease is valid and Worker clock lags. **Expected:** canonical PG fence/time governs settlement, schedule and claims; local timestamps cannot produce duplicate ownership.

## A103 — Agent follows stale R2-only requirement
An implementer reads an old R2 clause as latest and disables an R6 security gate. **Expected:** effective-requirement compiler resolves supersession, preserves provenance and blocks ambiguous/unmapped active rules before release.

---

# 116. R7 Implementation Inserts, Gate Ordering and Handoff

R7 adds optional-to-scope but **mandatory-when-applicable** preflight work packages after R6 `P245.0AP`:

```text
P245.0AQ  Non-executing repository/host scanner policy and isolated probes (A91)
P245.0AR  Node runtime call-site method conformance incl. node:dns (A92)
P245.0AS  Route graph, same-zone binding and proxy recursion denial (A93)
P245.0AT  Cross-ingress synchronous write cutover/unknown-commit barrier (A94)
P245.0AU  Exact-byte webhook verification/redirect fidelity (A95)
P245.0AV  Deterministic CDC chunk/tombstone convergence (A96)
P245.0AW  Bundle/static-asset and rollback-generation quota probes (A97)
P245.0AX  Hyperdrive pool-restart ambiguous commit drill (A98)
P245.0AY  Cross-binding subrequest/retry budget and cancellation tests (A99)
P245.0AZ  Third-party native binary/model/asset deployment-rights inventory (A100)
P245.0BA  Ephemeral Cloudflare preview resource lease and safe GC (A101)
P245.0BB  Cross-runtime trusted-time/fence conformance (A102)
P245.0BC  Effective-requirement compiler and historical-precedence validation (A103)
```

**Before running compatibility probes on Debian:** require AQ and read-only least-privilege observer; static parsing may start earlier without executable hooks.

**Before the first Worker-backed public route:** require AR for its reachable Node methods, AS for its exact origin/proxy topology, AW if it bundles assets, AY for its worst-case hop budget and BC for all applicable security gates. Unrelated DB CDC and heavy media work must not block a proven safe isolated public route.

**Before any financial, authorization, approval or synchronous-write route moves:** add AT, AX when Hyperdrive is used, BB where distributed expiry/lease is involved; prove unchanged Spec 207/220/Feature 195 authorities. For provider callback migration add AU.

**Before managed PostgreSQL primary cutover:** add AV plus R6 WAL/slot gate (§87), R3 source-to-target manifest (§36), writer fences, backup/PITR and independent restore verification. Real external writes require owner approval; no silent write freeze, optimistic replay or second writable business authority.

**Before production Containers and tenant product fleets:** add AZ for distributed assets/binaries, BA for preview resource lifecycle, AW for full-sized asset builds, and R6 retained image rollback tests. License uncertainty is an explicit blocker for the affected workload, not a universal blocker for the whole site.

**Before Debian retirement:** all deployed subsystems and historical supported clients must have applicable tests PASS or an owner-approved documented `NOT_APPLICABLE`. Complete the R4/R5/R6 retirement checks, including long-horizon schedules, old callbacks, offline clients, cross-store recovery and whole-journey production smoke. No document review substitutes for that evidence.

---

# 117. R7 Source Baselines, Remaining Unknowns and Status

Public platform documentation consulted 2026-09-25:

- Worker Node.js compatibility, including methods that exist only as shims: https://developers.cloudflare.com/workers/runtime-apis/nodejs/
- `node:dns` support and method exclusions: https://developers.cloudflare.com/workers/runtime-apis/nodejs/dns/
- Workers account, build/static asset, subrequest and same-zone limitations: https://developers.cloudflare.com/workers/platform/limits/
- Worker loop/invalid same-zone subrequest errors: https://developers.cloudflare.com/workers/observability/errors/
- Hyperdrive transaction pooling and pool restart behavior: https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/

**Audit result:** 13 distinct new design-audit passes recorded as R7-01–R7-13; all identified changes incorporated as normative specification clauses with scenarios A91–A103. This is `R7_SPEC_AUDIT_COMPLETE` only—not repository audit completion, running-code tests, source-of-truth DB reconciliation, paid-provider validation, production cutover, or Debian retirement. The currently live repo/worktree and 245 number reservation, Debian services/cron/files, current Cloudflare account/plan, authorized credentials, traffic baseline and managed PostgreSQL readiness remain empirical implementation gates. Earlier versions and individual specialist specs remain unmodified.

---

# 118. R8 — User-Directed Accelerated Cutover and Maintenance Window

**Decision date:** 2026-09-26. This section records the product owner's direction for the current beta: two active users can pause work during migration; the priority is to move the platform workloads to Cloudflare promptly, then fix ordinary defects found on the new platform. This section supersedes only conflicting migration timing and availability assumptions. It does not claim that a Cloudflare account is configured, a deployment has happened, or that any workload is already migrated.

## 118.1 No fixed Redis observation delay

The fixed **14–30 day** production observation requirement for Redis retirement is removed. The exact requirements superseded are the WP12 row in §14A.1, the WP12 observation-window clauses in §§14A.3/14A.9, and the WP12 post-cutover safety-window delay. Other observation requirements for full Debian retirement, rare schedules, data recovery or DNS propagation remain separate and are not reclassified as Redis waiting periods. Redis may be retired as soon as:

1. Every discovered Redis responsibility is migrated or explicitly proven out of scope.
2. Each replacement path passes its targeted acceptance checks, including its tenant/auth/data-integrity invariants where applicable.
3. The application no longer has a reachable Redis dependency for those responsibilities, and new-path health is confirmed after cutover.
4. A recoverable snapshot/configuration and a concrete repair or forward-recovery procedure exist for data-bearing responsibilities.

Production monitoring begins at cutover and remains active for finding and fixing defects. It is **not** a timer that delays the Redis retirement decision. Do not leave the old Redis service as a silent automatic fallback for an already migrated responsibility.

## 118.2 Planned task pause is allowed

The migration MAY use a controlled maintenance window instead of preserving uninterrupted task execution:

1. Announce/enable maintenance mode and stop accepting new long-running jobs for the slice being moved.
2. Pause that slice's schedulers, dispatchers and consumers; record the exact services and route generation stopped.
3. The owner has confirmed there is no business-critical backlog to preserve. Still inspect canonical job state and reconcile any provider call with an unknown outcome before retrying or discarding it; this prevents duplicate paid work.
4. Apply the Cloudflare configuration and cut over one responsibility group at a time. Do not run two active authorities for one lock, job family, schedule or financial side effect.
5. Run targeted smoke/regression checks, confirm logs/health, then resume intake and consumers on the new path.

A maintenance pause is an availability choice; it is not permission to discard canonical records, bypass authorization, duplicate external effects, or skip tenant/financial correctness checks. Existing data is retained unless a separate, explicit data-retention decision authorizes deletion.

## 118.3 Keep gates that prevent irreversible harm

Removing the elapsed-time gate does not remove the following pre-cutover checks:

- complete responsibility inventory for each Redis consumer, including auth/revocation, rate limits, locks, realtime and job transports;
- one authoritative writer/executor and the existing `worker_jobs` / PostgreSQL fencing contract for durable jobs;
- fresh authorization and tenant-isolation checks; KV must not become authoritative for revocation or exact counters;
- no blind retry of an external provider operation with an unknown completion result;
- backup/snapshot and restoration or forward-recovery instructions before destroying data or credentials;
- exact environment-specific Cloudflare binding/secret readiness and a tested service health check.

These are event-based checks and can be completed quickly. If a check fails, pause only the affected responsibility, fix its prerequisite and keep progressing through independent migration work.

## 118.4 Durable Objects are selective, not a platform prerequisite

Do not provision Durable Objects just to replace Redis wholesale. Use KV for disposable/read-mostly cache; use PostgreSQL and the canonical job control plane for durable business authority; introduce DO only where the inventory proves a need for serialized per-entity coordination or realtime connection state. Before a DO lifecycle change, retain its namespace/class compatibility and forward-recovery safeguards from §52.

## 118.5 Implementation handoff

The execution plan SHALL now prioritize: (a) close the live inventory and Cloudflare target configuration gaps; (b) move the simplest safe Redis cache slice; (c) migrate the remaining Redis responsibilities and queue families using controlled pauses where useful; (d) move application/runtime and database dependencies required for full Cloudflare hosting; and (e) prove Debian can be retired. Do not block code or configuration progress on a calendar observation period. Record real blockers by affected slice and continue all independent work.
