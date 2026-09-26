---
spec_id: 242
title: SmartAIHub Cloudflare Native Agent & Sandbox Runtime Integration
revision: 1.2
review_rounds: 24
review_method: two source-verified architectural hardening cycles; runtime verification pending
created: 2026-09-24
status: PROPOSED / IMPLEMENTATION SPECIFICATION / NOT IMPLEMENTED / NOT PRODUCTION CERTIFIED
numbering: USER-ASSIGNED 242; MUST verify canonical SmartSpecPro registry, main branch, active PRs and worktrees before commit
suggested_repository_path: specs/feature/242-cloudflare-native-agent-sandbox-runtime-integration/spec.md
risk_class: HIGH — durable autonomous execution, untrusted code, privileged egress, tenant isolation, financial side effects
primary_owner: Cloudflare Native Runtime Integration
normative_language: MUST, MUST NOT, SHALL, SHOULD, MAY follow RFC 2119 intent
architecture_baseline_date: 2026-09-24
cloudflare_documentation_reviewed: 2026-09-24
canonical_goal_agent: Feature 196
canonical_job_authority: Feature 186 / Feature 195 (worker_jobs, worker_job_events, outbox, lease, fencing)
canonical_workflow: Spec 215
canonical_generic_orchestration: Shared Durable Orchestration Kernel introduced by Spec 224
canonical_development_runtime: Spec 224 (IN PROGRESS; DO NOT REWRITE)
canonical_tenant_runtime: Spec 219
canonical_authz_and_secrets: Spec 220
canonical_billing: Spec 207
canonical_migration: Spec 232
canonical_data: PostgreSQL via approved managed provider/Hyperdrive; R2 artifacts; Vectorize semantic index only
related_specs: [187, 195, 196, 199, 200, 206, 207, 208, 209, 212, 213, 214, 215, 218, 219, 220, 221, 222, 224, 225, 226, 228, 229, 230, 231, 232, 236, 237, 238, 239, 240, 241]
---

# Spec 242 — Cloudflare Native Agent & Sandbox Runtime Integration

**Revision 1.2 delta:** An additional twelve independent gap-review passes (R13–R24) added C81–C100, production-vs-local DirectoryBackup parity, fail-closed Agent startup, live identity/SDK migrations, poison recovery, and stronger artifact/output/revocation protections. These are design requirements, not executed certification.

**Goal:** Add Cloudflare Agents SDK's durable identity, persistent state, realtime connections, local scheduling and recoverable execution, plus Cloudflare Sandbox SDK's isolated Python/Node.js/Shell execution, to SmartAIHub **without introducing a parallel orchestration authority, physical job ledger, permission engine, billing ledger, or product-specific daemon**.

**Implementation posture:** additive adapters and versioned conformance contracts. Specs <=213 remain immutable historical design inputs and compatibility boundaries; their runtime, schema and deployment availability must be verified from source and environment evidence. Spec 224 is already being implemented; this spec shall consume its existing shared Kernel / `ExecutionWorkspace` extension seams, not retroactively change Spec 224's development lifecycle or Final Verify logic. Spec 232 owns migration and per-job-family route ownership, not this spec.

**Evidence caveat:** The baseline below was reviewed against accessible design snapshots, notably Spec 215 r3, Spec 219 r3, Spec 224 r17, Spec 232 r2, Spec 237 v1.2, Spec 238 v1.2, and Spec 240 r0.3. File names and snapshots are **not evidence of deployed behavior**. `P242.0` must inspect the current repository, live schema/migration journal, package lockfile, Wrangler bindings, active environments, feature flags and deployed build SHA before implementation.

---

## 0. Executive decisions and non-negotiable invariants

1. **SmartAIHub remains the product, policy and execution authority.** Feature 196 understands user intent and owns the assistant goal; Spec 215 owns compiled logical workflow semantics; the shared Durable Orchestration Kernel owns canonical run transitions; Feature 195 / `worker_jobs` owns admitted physical work; PostgreSQL owns tenant/principal ACL, permissions, credits, canonical jobs, audit and business records.
2. **Cloudflare Agents SDK is a provider-native stateful agent execution substrate.** A Cloudflare Agent's durable identity/SQLite state, connections, scheduled callbacks and fibers are allowed for **instance-local coordination, derived session data and recoverable execution**, never an independent canonical assistant, billing, approval or physical-job ledger.
3. **Cloudflare Workflows is an optional multi-step durable substrate** behind the existing Kernel adapter; use it for long waits and multi-step execution where appropriate. A fiber and a Workflow must never independently own the same canonical step or externally visible side effect.
4. **Cloudflare Sandbox SDK is an execution placement** behind a versioned `ExecutionWorkspace`/Sandbox adapter. A sandbox ID is durable addressing, **not durable filesystem, process, terminal or code-interpreter memory**. Build/test/data-analysis artifacts must be checkpointed to authorized R2 before depending on recovery.
5. **One canonical active execution owner per job family, per logical run/step and per route generation.** No accidental Celery/BullMQ/Queue/Workflow/Agent-scheduler dual activation. An authorized, audited ownership-transfer protocol is required for rollback/cutover.
6. **At-least-once signals are normal; exactly-once external effects are not assumed.** All paid, destructive or externally visible effects require existing idempotency, intent/receipt and reconciliation; unknown results must park rather than blindly replay.
7. **Tenant/principal/project/product boundaries are re-evaluated at use time.** A DO instance ID, Sandbox ID, WebSocket connection, URL host, cached JWT, provider session or retrieved Vectorize document is **never** itself authorization.
8. **Cloud-only users must work without a local PC.** Every in-platform task with an approved cloud placement must run on Workers/Agents/Workflows/Containers. Local Runner and external harnesses are optional capabilities, not a mandatory dependency of Chat, Mini Apps or monitoring.
9. **Develop/preview Sandboxes cannot directly become production servers or deploy authority.** Spec 218/219 release and immutability gates remain mandatory.
10. **Ship by independently certified canary slices.** A proposed design is not certification evidence; no unapproved production migration, real provider spend, secret rotation, external mutation or browsing of private accounts during deterministic tests.

### 0.1 Design assumptions to verify

- Cloudflare Agents SDK supports per-instance SQLite-backed state, realtime WebSocket connections and local scheduled tasks. Its durable execution/fiber API includes `runFiber`, `startFiber`, `stash` and `onFiberRecovered` in the documentation reviewed 2026-09-24. Pin, probe and re-verify APIs and default recovery behavior against the exact installed version.
- Cloudflare Sandbox SDK stable and `@next` 1.0 preview are **different API families**. Stable `exec(string)` returns buffered results; preview `exec(argv)` returns a process handle and each invocation has independent `cwd`/`env`. Interpreter and terminal APIs differ. A deployed Worker package and Container image must use a certified matching family.
- Workers, DO, Queues, Workflows, Containers and Sandbox limits/prices evolve and may depend on account/plan. Admission reads a reviewed capability/limits profile, not numbers permanently hard-coded from September 2026 documents.

### 0.2 Formal authority hierarchy and handoff safety (R01)

- **Policy/identity authority:** existing Spec 220 / Feature 196 + current PostgreSQL facts. **Logical run authority:** shared Kernel and Spec 215. **Physical work authority:** Feature 195 / `worker_jobs`. **Financial authority:** Spec 207. **Long-term memory authority:** the current source-verified Memory Service/scoped-memory contracts; Spec 241 is the proposed governance extension and may become the authority only after the canonical revision/registry and migration are verified in P242.0. Agent SQLite/Cloudflare native records can be durable locally without becoming another business ledger.
- A backend-native `accepted`, `completed`, scheduler due event, Fiber recovery event or successful Sandbox command is **evidence**, never authorization to update canonical job/credit/approval state by itself. The only terminal commit is a PG compare-and-swap against `(job_id, attempt, route_generation, fencing_token, security_epoch, current_policy_revision)` where those fields apply.
- Every delegated step has **one active substrate ownership record**: `logical_step_id`, `owner_backend`, `backend_execution_ref`, `owner_epoch`, `route_generation`, `lease_fence`, `handoff_phase`, `last_reconciled_at`. Prefer extension of existing Kernel/worker metadata over new tables. During handoff old-owner effects are denied **before** new-owner admission; an uncertain old external effect parks the step until resolved.
- PostgreSQL and Agent SQLite have **no shared atomic transaction**. Implement canonical PG state + outbox, then idempotent projection/dispatch with a reconciler for each crash window: PG commit before publish, publish before ACK, backend starts before correlation persistence, effect occurs before receipt, and callback arrives after a new route generation. No distributed-transaction or exactly-once claim is permitted.

**R01 exit evidence:** owner/authority matrix against live repository, schema/migration journal, overlap fault tests and explicit route rollback owner. Existing numbers and design snapshots are not implementation proof.

---

## 1. Baseline coverage, new scope and explicit non-goals

| Capability | Existing owner / design baseline | Spec 242 additive deliverable |
|---|---|---|
| Durable Agent identity | Feature 196; Spec 220; Spec 224 | Deterministic, scoped Cloudflare instance mapping and lifecycle; revocation epochs; identity migration |
| Agent state | Shared Kernel/PG; Spec 215 | DO-local state schema/version and PG-derived projection sync/replay contract |
| Realtime connections | Spec 232 DO/WebSocket; Spec 237 session gateway | Agents SDK lifecycle adapter, credential/epoch-bound attach, backfill and connection resumption |
| Schedules | Spec 215; Spec 232 PG due-occurrence sweeper; Spec 238 monitors | Separation of ephemeral/local Agent alarms from canonical user schedules; occurrence mapping |
| Durable recovery | Spec 224 Kernel; Spec 215 checkpoints | Fiber adapter, Workflows coordination, duplicate-effect prevention and recovery drill |
| Cloud execution | Spec 219 Containers; Spec 224 `ExecutionWorkspace` | Version-pinned Sandbox SDK adapter for Python/Node/Shell, process/lifecycle/artifacts |
| Tenant runtime | Spec 219 / 220 | Sandbox isolation classes, egress broker, credentials, quotas and privileged-operation review |
| Mini App UX | Spec 240 | Typed Code Interpreter result and progress adapter; same governed action API as Chat |
| Monitoring | Spec 238 | Bound local wake/realtime coordinator only; not a second monitor database or delivery gateway |
| Zero-downtime cutover | Spec 232 | Agent/Sandbox job-family routes, canary, shadow test and handback certification |

**In scope:** adapter interfaces, instance addressing, signed capability claims, DO/PG event reconciliation, WebSocket session lifecycle, Agent-local schedules, Fibers and Workflows normalization, Sandbox workspace/process/interpreter lifecycle, R2 checkpoints, isolation, approvals, resource budgets, observability, incident integration, deterministic tests and staged rollout.

**Out of scope:** a new first-party autonomous planner; new job/credit/ACL/notification ledger; a second arbitrary-code application hosting platform; replacing LangGraph or Agents SDK Python entirely; replacing Spec 224 Final Verify; publishing unreviewed customer code directly into production; guaranteeing that DO hibernation preserves in-memory variables or that Sandbox eviction preserves files; treating provider-native features as product guarantees.

---

## 2. Canonical architecture and ownership

```text
Chat / Mobile / Tablet / Mini App / Tenant Product / Realtime / API
                  | authorized intent and device context
                  v
        Feature 196 Universal Assistant
                  |
       Shared Durable Orchestration Kernel
        | logical run/step + action intent |
        +-- Spec 215 compiled Workflow ----------+
        +-- Spec 224 Development Runtime ---------+-- Capability / Placement Resolver
        +-- Spec 238 Monitor profile -------------+       |
                                                        +-- CF Agents Adapter
                                                        |     DO/SQLite: local state
                                                        |     Connections/Alarms/Fibers
                                                        +-- CF Workflows Adapter
                                                        |     durable multi-step waits
                                                        +-- CF Sandbox Adapter
                                                        |     isolated Container Linux
                                                        +-- Local Runner / Browser / External Agent
                                                        |
                  Feature 195 worker_jobs <-------------+
                       PG claims, lease, fencing
                        events, outbox, side-effect ledger
                  |              |                |
              PostgreSQL        R2           Vectorize
          business/job truth  artifacts    semantic index
                  |
       Spec 220 policy + Spec 207 credits
       Spec 225/226 delivery and Task Control Center
       Spec 228 incidents and operator alerts
```

### 2.1 Owner-vs-cache rules

| Data/operation | Canonical owner | Allowed Cloudflare-native copy |
|---|---|---|
| Principal, tenant, project membership, ACL and global security epoch | PostgreSQL / Spec 220 | Time-bounded, versioned hint only; fresh PG gate for sensitive use |
| Conversation/project documents and personal/project memory | Their existing canonical service/PG/R2 | Explicitly authorized, minimised session projection with TTL |
| Logical run and workflow policy | Kernel / Spec 215 canonical store | Backend execution token/checkpoint and provider status |
| Physical job admission, lease, retry, result, audit | `worker_jobs`/events/outbox | DO-local pending wake/streaming cache, correlation IDs |
| Agent UI/session state | Feature 196/225/237 contract | DO SQLite local state and connected-client projection |
| User-facing schedule / monitor subscription | Existing scheduler / Spec 238 PG data | Local wake hint/registered callback bound to canonical occurrence |
| Ephemeral scratch/process | Active sandbox Container | Not durable; reconstructable from R2 manifest or rerun safe step |
| Assets/evidence | R2 with authoritative PG metadata/ownership | Temporary working copy, digest and expiring signed ref |
| Provider credentials | Existing Secret Broker / Spec 220 | Never copied into untrusted sandbox files, state or logs |
| Charges and financial reservations | Spec 207 ledger | Metering observations and pending settlement correlation only |

### 2.2 Physical vs logical work

A user intent may produce a Kernel run and a Spec 215 workflow with several logical steps. An Agent fiber or Cloudflare Workflow may supervise those steps. Only when a step needs durable **physical work** shall it be admitted through Feature 195. The same physical job retains its `worker_jobs.id` across transport/backend retries; backend process IDs and Cloudflare native IDs are subordinate correlation IDs. Local Agent conversation-state mutation need not manufacture a worker job unless it performs governed asynchronous or external work.

### 2.3 Placement decision

A placement decision MUST evaluate `task_profile`, `toolchain`, `os_family`, GPU requirement, data locality/residency, provider support, queue depth, tenant quota, cost ceiling, approval state, preferred duration and interruption tolerance. Workers for bounded control/data; CF Agent for stateful session/local alarms; CF Workflows for durable multi-step wait; CF Sandbox/Container for Linux filesystem/process work; Local Runner for opted-in user-local resources; certified external agent for remote provider-native harnesses. Provider model API availability **does not prove provider CLI/harness can run in that placement**.

---

## 3. Identity, routing and instance lifecycle

### 3.1 Two identities, not one

- `logical_agent_id`: SmartAIHub-owned stable Agent profile or assistant instance; attaches to Feature 196 tenant/owner/project/conversation as policy requires.
- `provider_agent_instance_key`: versioned, opaque Cloudflare DO routing name derived deterministically from `(environment, tenant_id, isolation_scope, logical_agent_id, identity_epoch)` and a secret-keyed digest. Never concatenate raw email, project name, token or other PII into the DO name.
- `provider_agent_instance_ref` is a mapping entry **not** login identity; SmartAIHub's authenticated principal and authorization remain authoritative.
- A new project, product, tenant or security epoch must not silently reuse an old Agent context. Scope changes require create/migrate/revoke semantics and consent for context transfer.

### 3.2 Identity mapping contract (illustrative internal schema)

```ts
interface NativeAgentBinding {
  tenantId: string;
  logicalAgentId: string;
  scope: 'PERSONAL'|'PROJECT'|'TEAM'|'TENANT'|'PRODUCT'|'EPHEMERAL';
  scopeRef: string;
  provider: 'CLOUDFLARE_AGENTS';
  instanceKeyDigest: string; // opaque HMAC-derived routing label
  identityEpoch: number;
  securityEpoch: number;
  schemaVersion: number;
  adapterVersion: string;
  lifecycle: 'ALLOCATED'|'ACTIVE'|'SUSPENDED'|'DRAINING'|'REVOKED'|'DELETING'|'DELETED';
  ownerPolicyRef: string;
  createdAt: string;
  expiresAt?: string;
}
```

These are **proposed semantic fields**. Reuse existing canonical identity/agent/session tables and current FK/column names where available. No migration until actual schema and migration journal have been inspected.

### 3.3 Lifecycle requirements

`ALLOCATED -> ACTIVE -> SUSPENDED <-> ACTIVE -> DRAINING -> REVOKED -> DELETING -> DELETED`. A revoked identity cannot reactivate through stale WebSockets, an alarm, recovered fiber, old signed URL or sandbox process. Deletion is a tracked saga: stop admission; revoke capability and credentials; cancel schedules/fibers; close connections; drain/settle jobs; erase eligible DO/R2 projections and cached artifacts; preserve legally required minimally redacted audit; issue verifiable deletion receipt. Do not claim immediate deletion of Cloudflare's hidden backups unless documented and covered by vendor retention policy.

### 3.4 Large-scale sharding

Do not create one hot global Agent DO per tenant, nor one DO for every trivial request. Choose sharding based on state isolation and active connection count, with measurable hot-key thresholds and authenticated remapping. `tenant_id` must be an explicit access-control claim independent of DO name. Provide a quota and inactivity eviction policy for millions of dormant identities.

### 3.5 Agent ingress/RPC identity authorization (R02)

- Inventory **every** public ingress path: HTTP `fetch`, WebSocket upgrade, SDK callable methods/RPC, scheduled callbacks, webhooks, service-to-service bindings and sandbox preview/tunnel URLs. The application must authorize at its own router and **again inside each privileged Agent method**; a valid DO name or trusted internal binding is not an entitlement to run arbitrary methods.
- Issue one-time short-lived connection grants bound to `(tenant, principal, agent_instance_digest, environment, project/product, authorized methods, security_epoch, audience, nonce, expiry)`. Consume or track nonce server-side for replay-sensitive grants; never authorize from user-supplied tenant/project fields alone. Same-origin cookie paths enforce Origin/CSRF and session revocation; cross-origin paths follow the supported signed-query-token handshake, redact full URLs and refuse open redirects.
- Background Agent callbacks do not inherit indefinitely valid user grants. Resolve their restricted service principal plus the **current** owner consent, project state, capability scope, budget and policy before external calls. An authorized connection must not automatically authorize a protected RPC, state subscription for another scope, a file URL or a Sandbox allocation.
- Identity remap/revocation is a monitored saga: deny admission, revoke scoped grants and outbound capability, fence old route/session epochs, block old alarms/fibers/connections, reconcile outstanding effects, then retire old DO bindings. Repeatable deletion and rollback may restore data only after renewed authorization, never by reactivating the old revoked identity epoch.

---

### 3.6 Fail-closed activation and Agent `onStart` bootstrap (R14, P0)

An Agent instance waking after hibernation, deploy or class migration MUST enter `ACTIVATING`: load persisted schema, validate the binding and current instance/security epochs against fresh canonical identity, check PG stream watermark, resume an authorized projection or mark `PROJECTION_STALE`, reconcile local schedules/fibers and only then set `ACTIVE_READY`. The SDK's automatic initial state-sync protocol must also be suppressed for not-yet-authorized connections (using the pinned SDK's documented per-connection protocol-message gate where available). If initial sync cannot be withheld until `ACTIVE_READY`, deny/hold the WebSocket upgrade at the authenticated ingress rather than depending on a later `onConnect` callback. All callable methods, queued alarm handlers, private snapshot delivery and sensitive WebSocket events MUST reject or park while the bootstrap barrier is incomplete; `onStart` execution alone is not proof of current authorization. Bounded concurrent activation uses a single application-owned activation generation and fails closed on timeout or PG outage. A public liveness response may remain available without disclosing private data.

**Exit:** C83 interrupts boot between wake, policy refresh and projection replay, injects a WebSocket/RPC/alarm race and verifies no privileged data or effect escapes.

---

### 3.7 Agent namespace, identity-key and class migration (R15)

A changed Agent routing digest, HMAC key, scope, binding class or DO namespace is a **migration of a live identity**, not a harmless routing rename. Maintain an auditable, immutable mapping `logical_agent_id + identity_epoch -> provider_instance_ref + namespace_generation + schema_version` in existing canonical metadata. Rotate HMAC keys via explicit key versions with a bounded old-key read window; never let a stale key mint a new privileged Agent or remap two users to one instance. Fence original instances and reject their alarms/fibers/callbacks before admitting the new owner. Copy only authorized derived state with provenance and a PG projection watermark; do not import old credentials, client-grant caches or deprecated owner policy. Drain existing connections and issue new tickets; keep old namespaces temporarily read-only for recovery evidence, then delete under the standard tracked erasure flow.

**Exit:** C84 covers same-logical-agent key rotation/collision/revoked-key attempt, C85 covers in-flight migration and stale old-namespace callbacks with zero overlapping authority.

---

## 4. DO-local state, synchronization and consistency

### 4.1 State categories

**Allowed native state:** current view model, connected-device cursors, transient Agent planning hints, recoverable local Fiber snapshot, local due callbacks, minified authorized context, local UI draft and coordination locks. **Disallowed authoritative state:** current tenant ACL, credits, canonical business orders, approval grant, `worker_jobs` transitions, source-document ownership, irreversible provider-effect receipt.

`Agent.setState()` and DO SQLite are persisted per instance. On a new activation reconstruct runtime-only memory and reconcile critical derived fields with PG. Include state `schema_version`, `security_epoch`, projection source watermark, updated time, redaction class and TTL. Migrations are additive and reversible or have a documented one-way migration/cutover plan.

### 4.2 Projection and replay

1. A PG transaction updates canonical source facts/events with a monotonic per-stream event sequence and outbox record.
2. Publisher delivers at least once to the Agent projection handler; dedupe by `(stream_id,event_seq)` and reject older policy/security epochs.
3. The DO applies local derived state transactionally; its own SQLite sequence **does not replace PG event order**.
4. After hibernation/restart/redeploy, compare last applied PG watermark; detect and replay missing events or rebuild from an authorized snapshot. On unrecoverable gap set `PROJECTION_STALE` and fail closed for privileged operations.
5. A client state update is a proposal, not an authoritative ACL or order update. A sensitive mutation calls the existing action/policy API, verifies expected revision and commits in PG first.

**Large state:** keep media/transcripts/source files in existing authorised R2/PG services. DO state stores short summaries, typed refs and capped UI data, not arbitrarily large files or entire Project RAG corpora. Vectorize remains a search index and never grants permission.

### 4.3 Memory isolation

Agent-local session memory is separate from Personal/Project/Team/Tenant long-term memory. A scope- or project-switch invalidates old local retrieval caches; externally connected Agents receive only explicit per-grant projections. Pending deletion, consent withdrawal and data-residency changes block subsequent reads and initiate cache invalidation/erasure. Spec 242 must integrate whichever canonical memory contracts exist at implementation time; it must not invent a second memory owner.

### 4.4 SDK client-state pre-commit guard (R03, P0 security)

**Verified vendor behavior:** `setState()` saves state and broadcasts it; `onStateChanged()` runs **after broadcast** and is best-effort. Clients may propose state updates over their Agent connection. Therefore `onStateChanged()` SHALL NOT be used as a security validator, ACL filter or a pre-broadcast sanitizer.

1. Prefer **server-only** state updates for any Agent that carries non-public context. Override the installed SDK's synchronous `validateStateChange(nextState, source)` hook: reject all client-origin mutations by default; optionally accept a strict schema of cosmetic/shared values only. Validate maximum state bytes/depth, allowed fields, current revision and source connection classification **before persistence or broadcast**.
2. `setState()` broadcasts the **whole shared state** to eligible connections; do not store personal/project/role-specific information in an instance whose subscribers have different grants. Partition instances appropriately, or use explicit recipient-scoped encrypted/filtered events with authorized retrieval from PG/R2. Per-connection connection state is not an ACL grant; reconstruct it securely after hibernation.
3. A client wanting to perform an action sends a typed intent through the authorized action/RPC router. The server rechecks current PG policy and expected revision and commits canonical facts there, then projects **redacted** state. `onStateChanged()` may emit telemetry only; no paid/external side effect may rely solely on it.
4. Spec 241 long-term Memory retrieval, promotion and erasure require separate purpose-bound grants. Local Agent session hints never become a silent persistent memory write, and a former project member receives no previously synchronized private state on reconnect.

**R03 hard stop:** Any sensitive data observable by a lower-privileged connection via normal SDK state sync blocks promotion even if subsequent action APIs reject mutations.

---

### 4.5 Multi-device mutation order and optimistic concurrency (R13, P0)

A synchronous SDK `validateStateChange()` protects the Agent's local state boundary but cannot await a fresh PG authorization query or serialize a PG commit with DO SQLite. It SHALL validate the *complete* next state, exact allowlisted changes, connection classification and client-supplied expected `agent_state_revision` against the current local revision. Every accepted server projection increments a monotonic DO-local revision; stale cosmetic updates get a typed `STATE_CONFLICT` with safe resync, never last-writer-wins replacement of an entire previous privileged projection.

**Authoritative updates** MUST instead submit an idempotent typed intent with `expected_domain_revision` to a PG transaction that rechecks current permission and applies a CAS. The resulting outbox sequence then updates the Agent projection; concurrent Workflow callbacks and client proposals cannot bypass ordering. For shared low-trust cosmetic state, disallow writes whenever the projection is stale, reconnecting or awaiting policy epoch refresh. Do not infer that SDK state persistence provides a distributed PG/DO transaction.

**Exit:** C81 tests conflicting device writes and C82 races revoked authorization against concurrent client/Workflow state updates.

---

## 5. Realtime WebSocket, streaming and device continuity

### 5.1 Connection security

Authenticate before joining any Agent connection. Same-origin authenticated cookies may be used with CSRF/origin checks and secure SameSite policy. Cross-domain hosts use short-lived, audience/scope/nonce-bound signed connection grants verified by the backend; never put raw API secrets, durable credentials or PII in URLs. Avoid logging token-bearing query strings. On connection and each privileged action validate tenant/principal/project/product scope, `security_epoch`, grant expiry and current suspension. Revalidate on resumption, access-change event and action-time, not only at upgrade.

**Connection state is ephemeral** and distinct from durable Agent identity. On hibernation/redeploy the SDK may preserve hibernatable WebSockets, but in-memory application data must be reconstructible and connections must be revalidated before privilege-sensitive operations. A client that disconnects or signs out does not cancel a previously approved independent background job unless its policy says so.

### 5.2 Race-free attach and resume

Required sequence: authenticate -> subscribe/open live channel with bounded buffer -> query PG event high watermark `H` -> replay `(last_seq, H]` -> merge buffered live events `>H`, deduping by canonical `(stream_id,seq)` -> continue. If buffer overflows, a sequence gap appears or policy epoch changed, resnapshot before permitting an action. DO-local counters are **not** canonical event sequence numbers. Ensure exactly one terminal UI projection for one canonical terminal transition even if transport delivers duplicates.

Spec 237 Realtime media's WebRTC/session signaling remains a separate modality with its own media consent/session epoch; the Agents SDK may coordinate session metadata and tool events but must not reinterpret a browser WebSocket as raw WebRTC media transport. Spec 240 UI components and Mini Apps consume the same typed event/action projection; no untrusted generated JavaScript may call protected Agent RPC directly.

### 5.3 Backpressure and privacy

Cap connections per instance, events/sec, bytes/event, pending broadcast buffer, replay range, token refresh attempts and log retention. Coalesce low-value progress updates; never coalesce audit/approval decisions or terminal events. On overload send a typed `RESYNC_REQUIRED` and downgrade to a canonical snapshot, not silently drop privileged decisions. All visible previews and logs are tenant-scoped, sanitized and have explicit retention.

### 5.4 Connection replay, caller-loss and private progress (R04)

- A successful socket connection is not a durable subscription receipt. Persist the **last canonical PG sequence acknowledged by the recipient** or require the client to submit a signed scoped cursor; cap replays and reconstruct a sanitized snapshot after retention gaps. Join the live channel before reading watermark `H`, but **buffer authorization-filtered events** until replay completes. Cancel and reauthorize on epoch, role, product-domain or project membership change.
- Every privileged method carries an operation idempotency key, expected UI/source version and a current nonce- or session-bound action grant; connection IDs and mutable client state cannot sign business mutations. Include browser-origin validation on reconnect, short grant lifetime and maximum device/session count.
- After an HTTP caller/phone disconnects mid-`runFiber`, the original promise result cannot be delivered to it. Return a stable **canonical run/job receipt** before initiating long work (or use `startFiber` where locally appropriate). Reconnection retrieves fresh PG-backed status and private per-recipient events; a WebSocket `connected` or provider `done` event never settles credits.
- Separate publicly shareable progress from principal-scoped logs, tool inputs, source excerpts and approvals. A global `setState` projection SHALL NOT include authorization-sensitive output even within a shared project unless all active subscribers are entitled to the same content.

---

## 6. Scheduling and exactly-one owner semantics

### 6.1 Distinguish four scheduling classes

| Class | Source of schedule truth | Wake/executor | Examples |
|---|---|---|---|
| Agent-local ephemeral/short-lived | Agent DO SQLite; tied to instance identity | Agents `schedule`, `scheduleEvery` | debounce, idle cleanup, session refresh, non-user-facing temporary checks |
| User-owned durable recurring schedule | Existing canonical PG schedule + timezone/DST policy | Spec 232 due-occurrence sweeper; Agent alarm MAY be a delegated wake hint | weekly assistant task, task automation |
| Monitor evaluation/subscription | Spec 238 canonical PG Monitor Blueprint and shared source scheduler | Existing Feature 195 admitted job via Spec 232 | price/flood/service monitoring |
| Durable multi-step wait/event | Kernel/Spec 215 run + approved backend state | Cloudflare Workflows or certified Kernel backend | 24h approval wait, multi-stage content pipeline |

A Cloudflare Agent-local schedule must not silently become an independent recurring user task. For long-lived user-owned schedules, persist `(schedule_id, revision, occurrence_instant_UTC, tenant_id, route_generation)` canonically; alarm callback asks existing scheduler/Feature 195 to claim the occurrence. No same-occurrence dual scheduler with Celery Beat, BullMQ, Cloudflare Cron or Agent alarms. Cloudflare Cron is a wake mechanism, not an independent owner of timezone/DST business semantics.

### 6.2 Scheduling correctness

- Make timezone, DST gaps/repeats, missed-run policy, blackout windows, quiet hours, billing/admission and user pause/resume explicit in existing schema.
- Dedup by stable schedule occurrence and revision, not Cloudflare alarm ID alone.
- Under route transfer, increment ownership generation; old alarms/checkpoints return a no-op after fresh ownership check. Disable old publisher only after new path passes contract tests; prevent two active claims.
- Restore overdue occurrences with bounded catch-up/jitter and priority/fairness. Prevent a 48h outage from creating unbounded burst spend, stale emergency advice or notification storms.
- Agent-local alarms have an expiry/budget and named callback allowlist. No model-generated arbitrary function name or unbounded recurrence.

### 6.3 Vendor interval overlap and callback guarantees (R05)

Cloudflare `scheduleEvery()` is idempotent only for the **same callback, interval and payload** on the same Agent; different payload/revision creates an independent schedule. If a run exceeds its interval, the next tick is **skipped**, not queued. Thus it is suitable for best-effort Agent-local maintenance, **not** an authoritative reminder, alert evaluation or guaranteed user-facing occurrence.

- Canonical user and monitor schedules remain in PG. For each occurrence, `due_at_utc + schedule_revision + owner_route_generation` is the dedup key; only the PG transaction deciding admission marks the occurrence claimed. A native alarm is an at-least-once wake hint, never the occurrence ledger. Check consent/tenant security epoch even if the Agent has no active connections.
- On Agent `onStart`, reconcile current local schedules against the approved callback allowlist and **desired schedule revision**. Cancel stale callback/payload variants; use a bounded lease/jitter for local periodic maintenance; never assume built-in same-argument idempotency prevents cross-epoch duplicates.
- Local schedule skip, callback exception, lost DO alarm or account outage must be observable as `WAKE_MISSED`/`WAKE_FAILED`, with PG sweeper/reconciler owning catch-up where promised. This is separate from Cloudflare Cron propagation lag. Enforce a minimum allowed interval by workload plan and aggregate common data-source polling instead of a per-user high-frequency alarm storm.

---

## 7. Fiber, Workflows and canonical recovery

### 7.1 Selection and authority matrix

| Mechanism | Appropriate work | Must not own |
|---|---|---|
| Agent `runFiber()` | Bounded recoverable Agent-local operation with explicit `stash` checkpoint | New canonical worker-job state or unrestricted external effects |
| Agent `startFiber()` | Durable acceptance of short/background local operation, keyed and inspectable | User-visible schedule ownership or new billing ledger |
| Cloudflare Workflows | Multi-step durable orchestration, retries, sleep and waits behind Kernel | Reimplementation of Spec 215 workflow compiler or Spec 224 Final Verify |
| Feature 195 `worker_jobs` | Real physical task admission, leases, fencing, outcome and effect settlement | Agent-specific UI conversation logic |
| PG outbox/reconciler | Cross-backend delivery and recovery of missing jobs/effects | Blind repeat of unknown irreversible effects |

A Fiber recovery callback is **not automatic continuation of the original stack**. Persist a bounded semantic checkpoint via `stash`, detect interrupted fibers with `onFiberRecovered`, inspect fresh canonical job/approval/effect state and either resume from a safe step, reconcile external status, park for human review or mark no-op. The platform's default `onFiberRecovered` behavior must never be relied on for critical work: override it and test the pinned SDK. Handle managed `startFiber` retention/cancel semantics separately from unmanaged fibers.

### 7.2 Recoverable step contract

Each backend operation must carry `run_id`, `logical_step_id`, `job_id` where applicable, `attempt`, `route_generation`, `lease_fencing_token`, `idempotency_key`, `policy_snapshot_ref`, `effect_intent_id`, `checkpoint_schema_version`, `backend_instance_ref`, `source_revision` and redacted trace IDs. Do not embed secrets, raw document bodies or credential-bearing URLs in Fiber metadata/Workflows payloads.

Algorithm:

```text
Admit: PG canonical run/job + effect intent + outbox under transaction.
Dispatch: Current route owner claims PG lease and fencing token.
Execute: Backend creates local fiber/workflow/sandbox process correlation.
Checkpoint: Store semantic step, output refs/digests, pending effects in approved PG/R2.
Observe: Provider or backend result; verify current lease and policy epoch.
Settle: PG guarded commit; append event/outbox; reconcile credits with Spec 207.
Recover: Re-read PG; if terminal -> no-op; if stale fencing -> abort;
         if external outcome unknown -> reconcile or park; otherwise resume safe step.
```

### 7.3 Failure and effect taxonomy

`NOT_STARTED`, `STARTED_NO_EXTERNAL_EFFECT`, `CHECKPOINTED`, `EFFECT_CONFIRMED`, `UNKNOWN_EXTERNAL_EFFECT`, `COMPLETED`, `CANCELLED`, `RECOVERY_BLOCKED`. A lost Queue ACK or DO restart must not trigger another email, payment, video generation, source-code push, external browser submission or domain operation unless the external provider supports reliable reconciliation/idempotency and the existing approval/economic policy authorizes retry.

### 7.4 Wait, cancellation and policy change

Approval wait uses existing Approval Engine/Spec 220 and Kernel semantics. On resume, recheck approval scope/version/expiry, tenant status, remaining budget, source/context revision, provider model and environment fingerprint. Cancellation is cooperative and bounded: revoke future capability; stop local fiber or process; record uncertain external effects; clean resources; settle/refund only through the existing ledger. A provider-native `CANCELLED` status without observed cleanup is not sufficient certification.

### 7.5 Managed/unmanaged Fiber retention and watchdog (R06)

- Vendor `ctx.stash(data)` is a **complete replacement** of the prior JSON snapshot; include full `run_id`, `step`, external-effect intent, owner/route/security epochs, redacted input refs and checkpoint version on **every** stash. Keep snapshots small; canonical evidence stays PG/R2. It provides DO-local persistence, not an atomic PG+SQLite commit.
- `runFiber()` is an unmanaged awaited/firable execution; the original caller is gone on eviction and the closure cannot be replayed. On a successful unmanaged recovery hook, old metadata can be deleted; if continuing work, create a new governed Fiber after fresh policy/lease checks. `startFiber()` is for durably accepted, inspectable retained local work with an SDK idempotency key; inspect/resolve/cancel it explicitly and still correlate with PG. Its callback result is **not** a persisted application result.
- Override `onFiberRecovered()` for every required task name and return a deliberate result for **managed** interrupted fibers. Returning `undefined` leaves them interrupted; unknown names, malformed snapshots and deleted principal/scope are parked/aborted according to policy. The SDK's default handler can delete interrupted metadata. Throwing recovery hooks retry with backoff but the documented recovery max-age default is **24 hours**: configure a finite reviewed value and detect impending expiry **independently from PG** before evidence is discarded. Never set infinite retention by default.
- `cancelFiber()` is cooperative: the SDK may mark it `aborted` while non-cooperative code keeps running until it observes `ctx.signal`. Fence outgoing effects, revoke egress, signal cancellation before spend, and separately verify process termination/receipts. Audit cleanup of retained fibers by terminal state and age, not blanket deletion of unresolved `interrupted` records.
- A DO recovery alarm does not substitute for the Spec 232 PG sweeper. If no Agent activation occurs, a region fails or native Fiber records expire, the PG watchdog still detects overdue canonical work, missing checkpoint/effect receipt and stale backend owner. **No Fiber transition can mint Kernel/Spec 224 Final Verify PASS.**

---

### 7.6 Workflow-origin state writes and callback provenance (R16)

Cloudflare Agent+Workflow integration can update or merge Agent state from Workflow steps. Treat each such call as a **backend projection proposal**: require canonical `(run_id, step_id, attempt, owner_epoch, route_generation, security_epoch, source_event_seq)` and the current authorized typed reducer. Only a registered, least-privileged projection service may invoke the SDK update path. `updateAgentState`, `mergeAgentState` or equivalent helpers SHALL never directly set ACLs, final verification, credit balance, approval outcomes or recipient-private fields; a full-state replacement is disabled for mixed-privilege instances. On a reordered/duplicate/late callback, preserve the higher PG watermark and return an auditable no-op; never trigger a side effect solely from `onStateChanged`.

**Exit:** C86 injects a late Workflow merge/full replace after user removal, newer event and route transfer; no private broadcast or canonical state reversal.

---

## 8. Sandbox SDK adapter and SDK compatibility

### 8.1 Version policy

At implementation, select a **certified package+container-image pair**, pin exact versions/digests and test all called API surfaces. Cloudflare docs reviewed on 2026-09-24 describe a current stable SDK and a distinct **1.0 preview `@cloudflare/sandbox@next`**. Cloudflare recommends `@next` for new projects, but SmartAIHub shall promote a preview to paid production only after internal security/recovery/cost certification and a tested rollback. No mixed stable Worker SDK against preview Container image.

| API concept | Current stable (verify exact pinned version) | 1.0 preview (verify pinned version) |
|---|---|---|
| Short command | `exec(string)` -> buffered response | `exec(argv)` -> process handle, then `output()`/`waitForExit()` |
| Long process | `startProcess` / stream APIs | supervised `exec(argv)` handle and log cursor |
| Shell state | Default/explicit session may persist | each exec independent; pass `cwd`/`env` or explicit shell argv |
| Interactive terminal | Stable terminal/session API | `createTerminal()` -> PTY/terminal handle |
| Code interpreter | Stable Interpreter API | Opt-in `withInterpreter` and `sandbox.interpreter` |
| Process recovery | Container-local handles; re-probe | Stale handles fail closed; re-launch from approved checkpoint |

`SandboxRuntimeAdapter` hides this variation. The rest of SmartAIHub must not import vendor process/result types into its canonical job schema.

### 8.2 Canonical execution contract (proposed, not vendor API)

```ts
interface SandboxCapabilities {
  sdkFamily: 'STABLE'|'PREVIEW_1_0'|'OTHER_CERTIFIED';
  sdkVersion: string;
  imageDigest: string;
  osFamily: 'LINUX';
  arch: string;
  languages: string[]; // python, javascript, typescript, shell if certified
  toolchains: string[];
  shell: boolean;
  interpreter: boolean;
  interactiveTerminal: boolean;
  outboundPolicy: boolean;
  r2Checkpoint: boolean;
  supportsProcessObservation: boolean;
  certifiedAt: string;
  certificationEvidenceRef: string;
}

interface SandboxExecutionRequest {
  jobId: string;
  stepId: string;
  tenantId: string;
  ownerId: string;
  executionScopeRef: string;
  sandboxId: string;
  isolationClass: 'EPHEMERAL_PER_JOB'|'PERSISTENT_PER_OWNER'|'DEDICATED_PRODUCT';
  imageDigest: string;
  argv: string[]; // shell grammar only through approved explicit shell profile
  cwd: string;
  envRefs: string[]; // resolve only approved non-secret execution variables
  inputManifestRef?: string;
  artifactDestinationRef: string;
  resourcePolicyRef: string;
  egressPolicyRef: string;
  permissionGrantRef: string;
  deadlineAt: string;
  idempotencyKey: string;
  routeGeneration: number;
  fencingToken: string;
}

interface SandboxRuntimeAdapter {
  discoverCapabilities(): Promise<SandboxCapabilities>;
  prepare(request: SandboxExecutionRequest): Promise<{ workspaceRef: string; incarnationRef: string }>;
  restore(workspaceRef: string, manifestRef: string): Promise<void>;
  execute(request: SandboxExecutionRequest): Promise<{ processRef: string; incarnationRef: string }>;
  observe(processRef: string, cursor?: string): AsyncIterable<unknown>;
  checkpoint(workspaceRef: string): Promise<{ manifestRef: string; sha256: string }>;
  cancel(processRef: string): Promise<void>;
  collectArtifacts(workspaceRef: string): Promise<string[]>;
  destroy(workspaceRef: string): Promise<void>;
}
```

**Compatibility:** Spec 224 existing `ExecutionWorkspace` operations (`prepare`, materialize, checkout, execute, stream logs, collect artifacts/evidence, checkpoint, cancel, cleanup) remain the standard; this interface is a provider adapter extension. Translate fields into actual repository names after P242.0; do not introduce competing workspace abstractions.

### 8.3 Code Interpreter integration

- P1: Python, Node.js and Shell scripts using the certified process API, with typed stdout/stderr/exit/status/artifact references.
- P2: Opt-in Notebook-like interpreter for Python/JavaScript/TypeScript where the pinned SDK/image supports it. Treat interpreter contexts as **container-local**; on replacement replay only user-approved deterministic cells from a versioned checkpoint, never assert Python heap/variable continuity.
- Structured result envelope: `{execution_id, language, exit_status, log_cursor, stdout_ref, stderr_ref, rich_results[], artifact_refs[], runtime_image_digest, evidence_ref, data_classification}`. HTML/SVG/JavaScript output is untrusted; Spec 240 may render only allowlisted/sanitized typed components or signed reviewed widgets.
- A Mini App may share approved workflow/result APIs with Chat, but must not receive Sandbox admin credentials, direct Container bindings, arbitrary provider secrets or cross-tenant session references.

### 8.4 SDK-preview process and environment error contract (R07)

For `@cloudflare/sandbox@next` **only**, implement typed error normalization, not one broad retry catch:

| Vendor observation | Normalized meaning | Permitted action |
|---|---|---|
| `ContainerUnavailableError` before process admission | Explicitly not started | Bounded backoff/retry under same PG job identity and fresh lease |
| `OperationInterruptedError` / `RPCTransportError` | **May already have started** | Probe same-incarnation process/evidence; if uncertain, park/reconcile before relaunch |
| `StaleProcessHandleError` / `StaleTerminalHandleError` | Handle belongs to old Container | Drop old handle/cursor; restore permitted files from R2; safe new attempt only |
| `getProcess(id)` returns `null` or `listProcesses()` returns `[]` | No live matched process; **does not start a Container** | Compare current incarnation + canonical checkpoint; do not infer previous effect absence |
| Wait/output/log `AbortSignal` or wait timeout | **Only the observation stopped** | Explicit `kill()`/terminal terminate for actual cancellation; verify outcome |

A preview `exec(argv)` returns on **process start**, not exit. Collect `status()/output()/logs()/waitForExit()` and persist process/attempt identity. Record log cursor **with container incarnation**; invalidate after replacement. Every independent launch specifies `cwd`/non-secret `env`; `setEnvVars()` values live in the Sandbox DO's memory and disappear on DO eviction—reinitialize per request/activation or use explicit launch env. Never use `setEnvVars` for long-lived credentials.

On 1.0 preview, the interpreter is **opt-in** via `withInterpreter(this)` on an exported subclass; Python requires a certified `-python` image variant. Interpreter contexts are Container-local. The preview does **not** support the stable self-deployed bridge; when BYOC/self-deployed is required, select a separately certified stable bridge or a different execution target rather than silently mixing package families. Capture this limitation in capability discovery and deployment admission.

---

### 8.5 Process-tree ownership, cancellation and output finality (R19)

Do not equate a sandbox `kill()` acknowledgment, aborted wait, closed WebSocket or a top-level PID exit with complete termination of all child/background processes. Each admitted executable runs under an identifiable per-attempt process group or equivalent certified supervisor. Cancel in order: fence new effects and revoke scoped egress -> signal graceful termination -> enforce bounded grace -> terminate descendants / interactive PTY / exposed preview ports -> independently probe liveness in the **same incarnation** -> seal final logs/exit status -> release capacity. If descendant isolation/termination cannot be enforced, prohibit high-risk persistent/mutating placements rather than declaring cleanup success.

Capture bounded stdout/stderr chunks with `(attempt, incarnation_nonce, process_id, stream, monotonic_chunk_seq)` and per-stream loss/truncation flags. Scrub sensitive payloads before showing or indexing; transport EOF is not proof the process exited. On process stop/Container replace mark an explicit terminal or `OUTCOME_UNCERTAIN` with missing-sequence evidence; outputs arriving from older incarnation/fencing tokens are discarded for user result and settlement, but recorded redacted for diagnostics.

**Exit:** C91 forks detached children after parent termination and C92 forces log-cursor gaps, old-attempt late data and output truncation without incorrectly marking success.

---

### 8.6 Rich interpreter output and exported-file trust (R22, P0)

The preview Code Interpreter may return `html`, `svg`, `markdown`, `png`, `jpeg`, `latex`, `json` and chart-like rich payloads. **All** user/model-generated output, errors, stack traces, log lines, filenames and artifact metadata remain untrusted even though they were produced inside an isolated Container. The output broker must validate MIME against magic bytes, schema, size/depth, dimensions/pixel limits and classification; strip scripts/event handlers, external resource loads, SVG active content, data URLs and unsafe links before Spec 240 rendering. Prefer image rasterization or sandboxed static previews for complex SVG/HTML; never inject raw model-generated HTML or use its text as a system/tool instruction.

CSV/spreadsheet exports MUST neutralize formula injection (including leading `=`, `+`, `-`, `@`, control characters and locale-specific cases), preserve source-data provenance and avoid unsafe automatic spreadsheet opening. Block download if the current principal/source rights changed since execution or if output includes restricted data not covered by the grant. Store sanitized previews separately from immutable raw evidence with distinct access policies, hashes and retention periods.

**Exit:** C96 probes HTML/SVG/script and forged MIME plus prompt-injection output; C97 probes CSV formula injection and export after source permission revocation.

---

## 9. Sandbox lifecycle, filesystem durability and recovery

### 9.1 Distinguish four IDs

`logical_workspace_id` (SmartAIHub), `sandbox_id` (stable Cloudflare routing), `container_incarnation_id` (current Linux environment), `process_id`/`terminal_id` (current incarnation only). A reused `sandbox_id` **must not** cause SmartAIHub to assume an earlier process or file still exists. In the 1.0 preview stale handles fail closed; on current stable detect equivalent stale state explicitly.

### 9.2 Lifecycle states and reaper

`REQUESTED -> ADMITTED -> ALLOCATING -> READY -> RUNNING -> CHECKPOINTING -> IDLE/SUSPENDED -> RESTORING -> READY`; terminal `COMPLETED`, `FAILED`, `CANCELLED`, `DESTROYED`, `ORPHANED_UNCERTAIN`. A watchdog compares PG active leases, DO/Container status, provisioned resources, R2 manifests and outstanding reservations. Bound start time, command time, idle sleep, maximum active lifetime, shutdown deadline and number of restore attempts. `keepAlive` is an opt-in budgeted exception; call `destroy()` or disable it at completion/cancel to prevent indefinite charges.

### 9.3 Checkpoint algorithm

Before relying on recovery: flush files and tool outputs -> enumerate explicit allowlisted working paths -> create manifest with per-file SHA-256, total size, image digest, toolchain lockfile, command plan, repo commit, source/project permissions and checkpoint schema -> upload permitted assets to tenant-namespaced R2 -> verify successful R2 read/digests and PG manifest commit -> atomically reference the checkpoint from the canonical run/step. Do not accept a manifest pointing at data that has not been durably written. Never checkpoint `.env`, SSH private keys, token-bearing CLI caches or protected files outside the grant.

After stop/replacement: allocate a new container incarnation; re-evaluate fresh permission and residency; restore/download allowlisted R2 files; verify manifest checksums, source revision and image/toolchain availability; re-install from pinned dependencies if needed; recreate interpreter contexts and safe processes; reconnect event logs from canonical PG or R2. An unknown external mutation or unreproducible prior compilation parks for review rather than asserting deterministic resume.

### 9.4 Data class and erasure

Apply Spec 220 classification before any file materialization. No production customer database dumps for routine tests, no training on private artifacts without explicit separate consent, no cross-tenant warm workspaces. All R2/PG/DO/workspace snapshots have a configured TTL, cryptographic or logically isolated tenant scope, deletion flow and audited legal-retention exception. Expired signed URLs are not durable artifact IDs.

### 9.5 Realtime process logs

Persist only bounded, redacted log chunks or a cursor with an attached Container incarnation. A cursor is valid only while that same process/container is running. After replacement display a log discontinuity and link to last committed PG/R2 evidence, then start a new attempt with a new process ref. Large stdout/stderr is never inlined into Agent state, Queue payloads or LLM prompts by default.

### 9.6 Workspace incarnation and crash-consistent snapshot publication (R08)

- Cloudflare does not promise a public permanent Container incarnation ID. The adapter SHALL establish an **application incarnation nonce** by writing an ephemeral boot marker inside the Container and checking it against the current process/workspace; if an unambiguous marker is unavailable, treat all existing handles as stale. Bind `(sandbox_id, incarnation_nonce, attempt, owner_epoch, fencing_token)` to each active resource. Never treat `sandbox_id + process_id` alone as a globally safe identity.
- Checkpoint via **two-phase publish**: (1) inventory allowlisted files after quiescing writable processes; verify no symlink/path traversal/device/special file escapes; (2) upload encrypted/classified objects to tenant-scoped **staging** R2 keys with SHA-256 and maximum bytes/count; (3) verify manifest content and object readability; (4) perform one PG CAS to publish immutable `COMMITTED` manifest and source/lease/epoch references; (5) make an outbox cleanup event for abandoned staging uploads. Only committed manifests can be used as restore inputs or billed evidence. R2 read-after-write and PG commit are not a distributed transaction.
- Immutable manifest includes exact path-to-digest mapping, normalized ownership/mode, OCI image digest, package lock, `cwd`/argv, source commit, data classification, execution policy digest, current clean-room restore version, generated-at and expiry. Prohibit unbounded archives, absolute path extraction outside the workspace, symlinks to host mounts and executable auto-run from untrusted archives. Restore to a **new empty** private workspace and scan/declassify output before exposing artifacts through existing signed R2 APIs.
- Reaper is **outside** the doomed Sandbox: a PG-indexed/scheduled reconciler finds staged objects, orphan Containers, exhausted credits, revoked workspaces and resources left by DO crashes. A timeout in `destroy()` remains a cleanup incident with follow-up, not a successful destroy receipt. Archive log discontinuities and any `UNKNOWN_EXTERNAL_EFFECT` before reuse.

---

### 9.7 Production-directory backup vs local restore parity (R17, P0)

Cloudflare's documented **production** `restoreBackup()` mounts the backup archive read-only with an ephemeral writable OverlayFS upper layer; it does not make later upper-layer modifications durable. After Container sleep/replacement the overlay mount is gone and the approved backup handle MUST be restored again. A subsequent restore of the same handle discards upper-layer writes. In `wrangler dev` with `localBucket: true`, restoration extracts/replaces the target tree rather than using the production overlay. Therefore local restore PASS SHALL NOT certify production recovery; tests MUST use both mechanisms, realistic shutdown and an actual staged R2 backup handle. Snapshot publication waits for quiesced writes and a new committed manifest; never treat a restored lower-layer archive as the latest mutable workspace.

Cross-layer directory renames may return `EXDEV`, including generated caches such as Vite `node_modules/.vite/deps`. Exclude disposable caches from backup and regenerate them, or use a reviewed copy/rename strategy within the upper layer; do not automatically retry the same failing rename indefinitely. Verify separate backup expiry, encryption/access scope, quotas and cleanup for restored archives and ephemeral upper layers.

**Exit:** C87 executes a real staging overlay restore/sleep/replace cycle; C88 reproduces production `EXDEV` and demonstrates a deterministic certified fallback instead of relying on local extraction behavior.

---

### 9.8 Archive and restore trust boundary (R18, P0)

Every archive, R2 object and repository cache is **untrusted input** until the signed/immutable manifest and actual bytes pass tenant ownership, declared data classification, maximum expanded bytes/file count, SHA-256, dependency/image provenance and malware/content policy checks. In a fresh private directory, reject archive entries with absolute paths, `..`, Unicode/path-normalization collisions, symlinks/hardlinks escaping the workspace, device/FIFO/socket entries, setuid/setgid bits, suspicious ownership and case-fold collisions before mount/extract. Validate both the original archive and the effective mounted/restored tree, because the approved R2 handle alone does not prove its file content safe for execution.

Untrusted restored scripts, package post-install hooks, project workspace settings and shell dotfiles SHALL NOT auto-run before command policy, network policy and explicit required approvals are ready. Reject mismatch between source commit, lockfile, container image, workspace policy or grant revision; never silently fall back to a broader-privilege old checkpoint. Record the verified normalized path inventory and restore decision in R2/PG evidence, not in a provider-generated success message.

**Exit:** C89 covers malicious archive entries/path escapes and C90 refuses a valid-hash snapshot with wrong tenant, changed grants or incompatible runtime policy.

---

### 9.9 Deletion tombstones that survive backup and disaster recovery (R23)

Deletion, consent withdrawal and tenant suspension MUST create a monotonic canonical deletion/revocation tombstone, tagged with subject/scope and security epoch, in approved PG/audit **and** a signed independently retained anti-resurrection journal outside the same PG point-in-time-restoration boundary before attempting asynchronous cleanup of DO, Sandbox, R2 and derived projections. Every restore, replay, snapshot promotion, old-Fiber recovery and restarted external harness rechecks the current tombstone **before** revealing, loading or reindexing bytes; old backups cannot resurrect deleted material or superseded grants. Maintain a versioned erasure inventory across staging and committed R2 objects, transient Vectorize projection refs, previews, attached clients, Container mounts and pending Workflows; suppress eligible material immediately on access even if physical erasure awaits retention or platform backup windows.

Retention/legal-hold exceptions need an authorized purpose, expiry and encryption/access separation, not a silent bypass of user-facing revocation. DR rehearsal MUST restore an earlier PG/R2 snapshot in isolation, verify the newest externally retained tombstone-journal watermark against the restored snapshot and apply all post-backup tombstones/epochs before serving or activating execution, and produce a verifiable erasure/restriction receipt. If the independent tombstone stream or its signed watermark is unavailable, stale or incomplete, privileged restored data stays quarantined; never infer that an old PG PITR image contains the newest deletion records.

**Exit:** C98 restores an otherwise valid pre-erasure workspace+Agent backup and proves no deleted user/project content can reappear, run, be downloaded or become Vectorize-retrievable.

---

## 10. Security, trust, network and permission boundaries

### 10.1 Sandbox isolation classes

- `EPHEMERAL_PER_JOB` **default** for arbitrary user/model-generated source, uploaded code, marketplace content and unreviewed third-party dependencies. Destroy after result/evidence checkpoint.
- `PERSISTENT_PER_OWNER` **opt-in** for authorized interactive notebooks and developer workspaces; same owner/scope, bounded TTL, strong process/file isolation from other scopes, explicit expiration and quotas.
- `DEDICATED_PRODUCT` only for a vetted tenant Product runtime approved under Spec 219; release artifacts, immutable image and product-specific policy required. Never repurpose a developer workspace as live production server.

Cross-owner or cross-tenant sharing of a single writable Linux workspace is prohibited unless an independent, certified mandatory isolation boundary exists. A session/namespace within one Linux container is not treated as equivalent to full trust isolation for arbitrary untrusted code.

### 10.2 Network and credentials

Default public network **disabled** for untrusted sandboxes (`enableInternet=false` in the matching supported SDK). Explicit allowlists and trusted outbound HTTP(S) handlers control egress, method/path/payload size and outbound request count; block private metadata/admin/IP destinations, credential exfiltration, DNS tunneling patterns and unexpected redirects. Cloudflare's outbound handlers cover HTTP(S), not arbitrary protocols; deny other egress at the container/network boundary and test what DNS traffic remains possible. Export and configure required trusted proxy/sidecar components per the pinned SDK.

All live provider credentials remain in Spec 220 Secret Broker/Worker bindings; inject through policy-controlled trusted Worker outbound handlers, never persist secrets in sandbox image, writable files, `env`, shell history, code snippets or logs. If a tool **cannot** run without exposing a secret to untrusted code, deny the capability or require a separately certified elevated isolated service and explicit user/tenant approval. Revocation applies to live egress handlers and queued calls, not merely future sandboxes.

### 10.3 Command policy

Reuse Spec 224 Command Execution Broker, classes `READ_ONLY`, `BUILD_TEST`, `SOURCE_MUTATION`, `PACKAGE_INSTALL`, `NETWORK_MUTATION`, `GIT_MUTATION`, `SYSTEM_MUTATION`, `DATA_MUTATION`, `DESTRUCTIVE`. Evaluate tool-call intent against permissions, path allowlists, sandbox capability, approval freshness and resource budget **before** execution; avoid naive string matching as the only protection. Explicit shell execution needs a separately governed shell capability. Prevent untrusted stdin/output/prompt injection from promoting itself into new permissions. Enforce CPU, RAM, disk, fork/process, wall-time, port exposure and network quotas with measured limits and kill switch.

### 10.4 Git/development supply chain

Source checkout only from allowed repository/ref with tenant-scoped read rights; commit SHA pinned, manifest digest captured, dependency lockfile validated and package install constrained by egress policy. Record image provenance, SBOM/licence checks where required, dependency vulnerability gate and artifact attestation. Pull requests, external webpages, RAG documents, logs and tool output are untrusted instructions. `git push`, production deploy, secrets rotation and destructive DB operations require existing approvals; never infer approval from generated code or a successful test.

### 10.5 Principal and resource abuse

Signed grants bind to principal, tenant, project/product, capabilities, environment, workflow/run, target sandbox identity, generation, policy epoch, expiry and nonce. Replay and rate-limit controls live server-side. Admin suspend and tenant-wide revocation fail closed across DO shards, active Container egress, terminal connections, schedules and recovered fibers. Test timing races at precisely the transition between authorization and effect execution.

### 10.6 Complete egress and sandbox ingress threat gates (R09)

- Export the matching SDK's required `ContainerProxy`/sidecar for outbound interception; verify deployed code, not just a configuration flag. `enableInternet=false` applies **at Sandbox startup** and must be set before allocating an untrusted instance. `allowedHosts`, proxy handler, redirect policy and credential injection are separate controls; changing handlers at runtime does not retroactively constrain connections already made. New policy generations require active-resource drain/restart or verified immediate revocation.
- Official docs allow DNS queries through Cloudflare resolvers even with default public internet disabled. **Do not claim DNS-exfiltration prevention** from `enableInternet=false` alone. For restricted/private data require a tested DNS egress constraint or an offline placement with no sensitive material exposed to uncontrolled DNS; if unavailable, refuse that placement. Block public/private loopback/link-local/metadata IPs after DNS resolution, redirects and IP literals; fail closed on proxy escape or unsupported outbound protocol.
- Sandbox tunnels, exposed preview ports, callbacks and interactive PTY WebSockets are **separate inbound attack surfaces**. Bind each to an authenticated, short-lived, audience/method/port-scoped capability; allow only the originating tenant/product run and current release/route epoch. Never expose anonymous interactive shell, container control port, R2 credentials or platform-local service through a preview URL. Record port lifecycle and force-close on revocation, cancellation and reaper.
- Test container image supply-chain provenance and sandbox/host escape assumptions against the current threat model; ordinary process user, pathname and CLI session flags are **not equivalent to a tenant isolation boundary**. Run dynamic probes for HTTP redirect SSRF, DNS tunneling, alternate protocol attempts, preview URL guessing, stale token replay and attempts to read inherited runtime secrets. On failure block all workloads that rely on that isolation guarantee.

---

### 10.7 Public previews, tunnels and interactive PTY access (R20, P0)

A Sandbox preview URL, randomly generated tunnel hostname, per-port token or unguessable ID is **not sufficient product authentication**. By default, public preview/tunnel creation is disabled for sensitive work and must be independently requested through Spec 220; use a SmartAIHub-controlled reverse proxy/Access policy with short-lived audience-, owner-, workspace-, incarnation- and port-scoped grants. Recheck grant and tenant security epoch on every HTTP mutation and PTY/WebSocket attach, actively close existing privileged sockets on revocation, and bind preview exposure to the current immutable environment and process group. Restrict inbound request methods, path traversal, CORS, origin, content length and rate; deny metadata endpoints and credentials in forwarded request headers.

Log only non-redeemable preview references, never raw token-bearing URLs. After run completion, policy withdrawal, failed health check, idle shutdown or route rollback, revoke tunnel/port registrations and verify they no longer reach the former process. If a vendor tunnel cannot provide verifiable ingress auth, revocation, privacy and audit for the requested data class, deny that placement and offer the already certified protected preview path instead.

**Exit:** C93 exercises URL leakage, an already-attached PTY, token reuse after revoke and an orphan public tunnel, including real ingress tests for any promoted preview mode.

---

## 11. Billing, quota, placement and capacity policy

### 11.1 Admission and metering

Route every paid Container/LLM/provider operation through Spec 207 reservation/commit/refund. Chargeable units use provider-observed usage where available and verified platform billing observations; separate estimates, reserved maximum, actual cost, platform overhead and creator/tenant fees. Instrument Container provisioned memory/disk duration, active CPU, process startup/wait time, DO requests/storage/active time, Workers CPU/subrequests, Workflow steps, Queue delivery/retries, R2 read/write/storage and paid external inference.

Do not bake specific prices into the spec: record **dated plan/account-specific** rates and limits in an operator-reviewed policy table. Provide per-successful-result and per-recovered-run unit economics; distinguish free allowance from billed overage, background idle cost from productive work and cold starts from execution.

### 11.2 Prevent runaway agents

Max per-tenant simultaneous sandboxes, per-principal parallel jobs, total daily execution seconds, per-attempt CPU/memory/disk, network bytes, scheduled evaluations/day, retries, approval wait age, LLM tokens and Container keep-alive time are explicit configurable policy. On projected budget breach stop **admitting new paid effects**, checkpoint safe work, surface an approval or degraded alternative and preserve canonical pending state. A credit reservation is not permission to exceed execution policy.

### 11.3 Cold-start and prewarm policy

Default scale-to-zero for sporadic use. Prewarm/keepAlive only with measured p95 latency benefit, maximum idle spending and a guaranteed reaper; never reserve one Container per Chat user. Shared source observation for Spec 238 runs once per permitted cohort and fans out evidence to authorized subscriptions rather than spawning a Container per monitor. Prefer Workers for cheap deterministic transforms, Agents DO for session-local logic and Container only when Linux runtime is required.

### 11.4 Fairness, resource reservations and partial-failure economics (R10)

- Admission is a single bounded policy decision covering **both** economic reservation (Spec 207) and physical capacity ticket (Feature 195): reserve permitted maxima for total execution, Container provision, DO/Fiber active time, retries, R2 storage, optional egress and cleanup headroom. Never create a Sandbox on an unauthenticated status/health read or on a rejected quota request.
- Partition queue/admission by tenant and resource class; enforce weighted fairness, per-owner slots, burst limits and maximum waiting age, plus hard aggregate caps on expensive persistent Sandboxes and Fiber keep-alive heartbeats. A single hot tenant cannot starve small interactive Mini App jobs or saturate Hyperdrive connections.
- On cancellation, platform outage, timeout, abandoned run or user credit exhaustion, stop **new** chargeable effects, fence callbacks, checkpoint safe state when budget permits, initiate eventual cleanup and reconcile final platform/provider invoices. Do not promise zero charges for resources already provisioned while a kill/reaper request is outstanding; show estimated vs observed vs settled cost and require bounded disputed-usage handling.
- Admission must account for per-account verified Cloudflare limits and geography, not assume global free quotas or interchangeable GPU/CPU/ARM capability. Canary criteria include **marginal cost per completed and per safely recovered job**, idle orphan rate and tail latency; a cheap unit demo is not a production cost forecast.

---

## 12. Cross-Spec integration and change policy

| Spec/Feature | Owner retained | Exact Spec 242 integration | Explicit prohibition |
|---|---|---|---|
| 186/195 | Canonical job control, runner lease, outbox, effect receipts | Add CF Agent/Sandbox backend descriptors, correlation, route generation and verifier fixtures | A separate business job queue or permanent native-only job ledger |
| 196 | Goal parsing and universal assistant | Add `CLOUDFLARE_STATEFUL_AGENT` placement and provider-native session delegate | Another assistant planner or competing chat history authority |
| 199/200/206/239 | MCP, external agents, A2A/personal interoperability | Advertise bounded Cloud Sandbox capability as approved resource behind existing broker | Give third-party Agent direct cross-tenant Sandbox binding |
| 207 | Credits/financial authority | Container/DO/Workflow cost events, reserve/settle idempotently | Native SDK directly editing credits |
| 208/213 | Browser/Computer Use and live certification | Isolated approved browser-execution placement if separately certified | Sandbox existence interpreted as browser certification |
| 209/212/214/215 | Builder, marketplace, node catalog, logical workflow runtime | Reuse existing node/placement manifest; add backend-specific runtime profile and use-case verification | Duplicate Node Type for every vendor SDK method |
| 218/219 | Release, managed tenant deploy and product runtime | Version-pinned immutable Container image, staged deploy, preview/runtime separation | Developer sandbox becomes production deployment |
| 220 | Identity/tenant ACL/secret broker | Signed scoped execution capability, live epoch checks, outbound credential broker | Treat DO/Sandbox name as authorization |
| 221/222 | Skill engineering/self-improvement | Test/lint/analyse sandbox and offline improvement experiments | Self-modifying unreviewed production runtime/policies |
| 224 | Development semantic lifecycle and Final Verify | Existing `ExecutionWorkspace` provider adapter; evidence and environment fingerprint | Rewrite half-implemented Spec 224 or mint verification PASS in SDK |
| 225/226 | Cross-device UI/attention, compatibility/task center | Show Agent/Sandbox status, approvals, logs, artifacts and typed actions | Direct provider UI as authority |
| 228 | Incidents | Resource leaks, stale fibers, denied egress, failed recovery, credit/effect mismatch | A second alert/issue tracker |
| 229/231 | Vectorize/RAG and LLM routing | Authorized context fetch and approved inference placement | Vectorize access bypassing PG ACL or model choice bypassing policy |
| 241 | Personal/Project/Team/Tenant Memory (confirm canonical version) | Purpose-bound retrieval and local Agent/Sandbox projection invalidation on revocation | DO-local history becoming independent long-term memory or cross-project carryover |
| 232 | Cloudflare transport migration | New per-family route candidates, rollback manifest and cutover evidence | Redis/BullMQ retirement inferred from SDK availability |
| 236/237 | Live commerce and multimodal realtime | Session metadata and governed tool calls; preserve media permission/session gateway | Treat DO WebSockets as automatic audio/video media transport |
| 238 | Intelligent monitor | Local callback/wake, evidence/compute placement, worker admission, resilience | Agent Alarm as duplicate monitor scheduler |
| 240 | Chat/Mini App generated UI | Typed code results, progress, artifact/download and reviewed interactive components | Render untrusted generated HTML as privileged component |

### 12.1 Implemented/in-progress boundary

- For Specs <=213: additive compatibility layer only; release gate checks against existing deployed contract and tests, not revised historical prose.
- For Spec 224: do not edit its existing development lifecycle, pending branch or migration journal from this spec. Build a separate adapter package and send explicit dependency contract tests to the integration branch after owner sign-off.
- For the Spec 212 design/corpus baseline: add certified template/variant/use-case registrations only after its current publication owner and schema are verified; do not replace or renumber historical use cases.
- For Spec 232: each new Cloudflare route follows existing per-family shadow/canary/ownership-transfer rules; no global cutover requirement.
- For proposed Specs 237/238/239/240: consume version-pinned actual implementation contracts when those products land, and keep optional integrations feature-flagged meanwhile.

### 12.2 No unsupported future claims

Nothing in this spec certifies arbitrary Cloudflare GPU access, persistent Linux disk, live app installation on a user's device, support for a particular external harness inside a Container, or a specific AI model/SDK version. Discover each capability and treat an unverified placement as `UNSUPPORTED` or `BLOCKED_CAPABILITY`.

### 12.3 Spec 241, region, external-agent and tenant Product handoffs (R11)

- **Spec 241 Personal AI Memory:** once its canonical registry/version is verified, request scope-bound `PERSONAL/PROJECT/TEAM/TENANT` memory through its governed APIs only. An Agent DO keeps an ephemeral **projection** with owner/scope/consent/revision/watermark; retrieval and scope inference must not widen ACL. On deletion or grant revocation purge connected clients' future access, local DO projection, R2 checkpoint eligible copies, Vectorize-derived transient views and active Sandbox copies using one tracked deletion/revocation saga. A shared session must not inherit the former user's or prior project's memory.
- **Spec 219 Tenant Products:** runtime placement, custom domains and BYOC change hosting/routing, never principal identity or release approval. Cross-region DO location, Container provisioning, backup placement and R2/PG storage must each independently meet Spec 220 residency. When regional pinning cannot be verified, refuse restricted-data placement instead of inferring compliance from the Worker edge location.
- **Spec 200/206/239 external agents:** expose a constrained `SandboxExecution` tool with signed task-specific grants, not global Cloudflare bindings or unrestricted MCP URLs. On exit collect signed redacted receipt, actual process+image identity, artifact digest and paid effect references; a third-party callback or natural-language success claim cannot authorize `COMPLETED` or `Final Verify`.
- **Spec 237 live sessions/Spec 240 Mini App:** prohibit automatic transfers from authenticated voice/screen captures into an offline long-lived Sandbox. New purpose, outbound destination, file/classification or agent grant requires existing approval; deliver a redacted result through the scoped UI action service only.

---

### 12.4 SDK/DO schema evolution, active-run pinning and rollback compatibility (R21)

An SDK upgrade is a versioned **protocol and persisted-state migration**, not only `npm update`. Maintain an `AgentCompatibilityManifest` for every release with Agent SDK exact version, Sandbox SDK family/version, Worker module/build digest, DO class and namespace, migration tags, SQLite state/schema version, Fiber checkpoint schema, Workflow input version, container image digest, `wrangler` compatibility date, and supported old/new decoder window. Every active logical run records the backend manifest digest used for admission. Callback dispatch must decode its recorded version and cannot let newer code silently reinterpret older checkpoints or write a newer schema into an instance still served by an older Worker.

Before deployment, use staged DO migration with backup/restore fixtures and oldest-live-run replay; prove monotonic projection versions and revocation with mixed old/new active Agents. Gate rollback by explicit **read/write schema compatibility**; if it cannot be proven, drain and hold affected job families and perform a forward-fix instead of blindly redeploying old code. Split upgrades from Spec 232 backend ownership transfers so a failure has one audited rollback axis at a time. Do not rename an active DO class/namespace without following vendor migrations and tested mappings.

**Exit:** C94 injects mixed SDK/state/checkpoint callbacks during rolling upgrade; C95 exercises an intentionally non-backward-compatible SQLite migration and proves rollback is blocked without data loss or parallel ownership.

---

## 13. API, event and storage contracts

### 13.1 API surface (illustrative routes; reconcile existing API names)

```text
POST   /v1/agents/native/bind           scope/policy-authorized logical binding
GET    /v1/agents/native/{logical_id}   status/capability view, owner/tenant-scoped
POST   /v1/agents/native/{id}/connect    ephemeral connection grant
POST   /v1/agents/native/{id}/invoke     signed, idempotent governed action
POST   /v1/agents/native/{id}/suspend    audited policy command
DELETE /v1/agents/native/{id}           governed delete/retention saga
POST   /v1/jobs/{job_id}/sandbox/prepare internal current-route admission
POST   /v1/jobs/{job_id}/sandbox/cancel  operator/user-scoped cancel request
GET    /v1/jobs/{job_id}/execution       PG-backed status+backend observations
GET    /v1/jobs/{job_id}/artifacts       scoped R2 artifact references
```

These are *design contract sketches*. Prefer extending existing Feature 195/196/226 routes over introducing public duplicates. Protect all state-changing requests against stale revisions, CSRF where relevant, replay, expired capability and missing approval. No direct browser-exposed `getSandbox()` capability with platform-global binding.

### 13.2 Normalized backend event types

`native_agent.allocated`, `.connected`, `.disconnected`, `.projection_stale`, `.projection_rebuilt`, `.revoked`, `.recovered`; `native_fiber.started`, `.checkpointed`, `.interrupted`, `.recovery_parked`, `.completed`; `sandbox.allocated`, `.ready`, `.process_started`, `.log_cursor`, `.checkpointed`, `.container_replaced`, `.restore_failed`, `.process_exited`, `.destroyed`; `native_route.promoted`, `.rolled_back`; `native_security.egress_denied`, `.stale_epoch_rejected`; `native_economics.reservation_exhausted`.

Event envelope: `{event_id, type, version, occurred_at, tenant_id, logical_run_id, logical_step_id?, job_id?, route_generation?, security_epoch?, backend_ref?, idempotency_key?, trace_id, redacted_payload}`. Append canonical business/job events only through existing PG event/outbox services; provider observations may be sampled and retained with bounded cardinality.

### 13.3 Schema change rule

No new DDL until inventory of current schema/tables/foreign keys/migration journal. Prefer existing records. If still missing, introduce **minimal additive** tables/columns for `native_agent_bindings`, backend correlation/attempts, `sandbox_workspace_manifests`, per-tenant resource policy and optional backend schedule delegation; name them according to canonical repository conventions. Never duplicate `worker_jobs`, `worker_job_events`, approval, credit or tenancy tables. Require unique identity/scope+epoch constraints, attempt/route-generation fencing, manifest content digest, job/tenant indexes, redacted audit and migration rollback/backfill plan.

---

## 14. Observability, control center, alerts and operations

### 14.1 Dashboard

Reuse Task Control Center (Spec 226) and incident/alert path (Spec 228). Visible fields: logical Agent identity/scope, state/projection watermark, current backend and version, active connections, alarms/delegated schedule owner, Fiber recovery state, active Sandbox incarnation, process status, latest committed checkpoint, R2 artifact refs, PG job state, leases/generation, budget reserved/spent, denied egress, approval state and redacted logs. Visually distinguish **canonical** PG facts from **observed** backend state, and `UNKNOWN_EXTERNAL_EFFECT` from ordinary retryable failure.

Admin actions require existing RBAC/ABAC, explicit reason and audit: pause agent, revoke access, cancel fiber/process, force reconcile, rotate backend route, run safe replay preview, emergency tenant suspend, drain Sandbox, adjust scoped quota or initiate delete. High-risk mutation requires existing two-person/step-up approval where applicable. Read-only troubleshooting must not accidentally create a new Container or retry a paid call.

### 14.2 Metrics, SLO and budgets

- Agent activation p50/p95; connection auth errors, disconnects, gaps and state replay lag.
- Agent local-alarm drift, due-occurrence lag, duplicate/old-generation alarm no-op count.
- Fibers active/interrupted/recovered/parked; uncertain external effects; stale policy/approval rejects.
- Sandbox cold/warm startup p95, container replacements, restore success, checkpoint R2 integrity, process exits, orphan/keepAlive seconds, artifact size, denied egress and secret-leak detections.
- PG lock/lease conflicts, Hyperdrive/origin pool saturation, outbox age, Queue/DLQ delay and per-family route ownership; mobile/mini-app user-visible recovery latency.
- Cost per attempted/successful/recovered run, budget stop rate, pooled-monitor cost and leakage from idle persistent Containers.

Propose per-slice SLO targets only after a measured staging baseline. Security invariants (cross-tenant separation, no duplicate paid effect, no unauthorized egress, stale fencing rejection, no credential disclosure) are **zero-tolerance certification gates**, not weighted availability objectives. Apply redaction and sampling to logs/traces; external Cloudflare analytics retention does not replace canonical audit retention.

### 14.3 Disaster recovery

Test PG point-in-time restore paired with coherent job/outbox/route/financial records, approved R2 artifact recovery, DO state projection rebuilding and Container recreation. During failover, stop mutation admission until route generations and uncertain external effects are reconciled. Region/data-residency constraints and account-wide Cloudflare incident scenarios must be considered: globally distributed Workers do not ensure region-local PostgreSQL writes or unrestricted data placement.

### 14.4 Reproducible recovery drills and evidence chain (R12)

Create a versioned `P242-recovery-fixtures` package with fake PG/R2/DO/Queue/Container/provider clocks and fault switches. At every state transition inject shutdown, double-delivery, stale owner/generation, revoked security epoch and delayed observation. Assert invariant snapshots **before and after** fault, not only a final HTTP 200. Include a zero-client Fiber recovery, a 25-hour overdue job caught by PG watchdog, a staged-R2 object orphan, a crashed `destroy()` reaper, preview `RPCTransportError` after process launch, DNS egress attempt, client-state pre-broadcast validation, and a resident-restricted project rejected on uncertain location.

Evidence packet MUST link each C-test to requirement ID, executable test name, build SHA, exact Agent and Sandbox package versions, Worker/Container image digests, Wrangler compatibility date and binding manifest, environment/region/account plan, migration version, test/fault seed, trace IDs (redacted), owner, independent verifier, evidence R2 digest and signed decision. `IMPLEMENTED`, `STAGING_VERIFIED`, `CANARY_VERIFIED`, `PRODUCTION_CERTIFIED` are separate states, per job family. Use `BLOCKED`/`PARKED_EXTERNAL_DEPENDENCY` for unavailable live prerequisites rather than converting skipped tests to PASS. Recheck all current vendor limitations at the time of promotion.

---

### 14.5 Poison recovery, independent watchdog and compliant degraded mode (R24)

Assign an explicit finite `recovery_attempt_budget`, `max_recovery_age`, exponential backoff/jitter and `quarantine_reason` to every recoverable step. Repeated invalid Fiber snapshots, crashing restore hooks, missing incompatible image, corrupted directory backups, persistent PG/outbox gaps or identical Sandbox launch failure transition to `RECOVERY_QUARANTINED` in canonical PG, stop further provider/resource spend and open a Spec 228 incident plus authorized operator action. Native Fiber metadata deletion, a DLQ expiry or periodic alarm silence never erases this canonical failure record. Only a policy-checked operator action or versioned deterministic repair can clear quarantine; resetting a Cloudflare instance must not reset its canonical retry budget.

If Cloudflare has a regional/account outage or quota exhaustion, the Placement Resolver may choose an alternative **only if** it independently passes the same current grants, data-residency/security class, process isolation, declared toolchain, job-owner fencing and budget. Do not downgrade from a protected sandbox to a public preview, consumer machine, cross-region provider or stale unencrypted workspace to preserve availability. Hold the job with explicit reason, estimate delayed budget exposure and offer a policy-authorized later retry when no compliant placement exists. Reconciler catch-up is rate-bounded and prioritized so a failed provider does not cascade to PG saturation or user notification floods.

**Exit:** C99 tests identical poison failures across Agent/Container recreation and recovery budget persistence; C100 injects Cloudflare outage with an attractive but non-compliant backup placement and requires `BLOCKED_PLACEMENT` rather than unsafe failover.

---

## 15. Implementation work packages and non-disruptive rollout

| WP | Scope | Outputs | Gate |
|---|---|---|---|
| P242.0 | Repository + registry + architecture inventory; current package/docs limits; threat model | Canonical contract/owner matrix, pinned-version decision record, representative baseline workload, risk register | No numbering collision; no invented deployed capability; owners sign off |
| P242.1 | `CloudflareNativeAgentAdapter` deterministic slice: identity, local state, connection auth, resync | Fake+staging Agent binding and authorized state projection; no real provider effects | C01–C12, C61–C64, C81–C85 PASS; cross-tenant/revocation negative tests |
| P242.2 | Fiber and Workflows mapping to Kernel and PG effect ledger; local alarm owner policy | One safe recoverable synthetic run + interruption and duplicate delivery drills | C13–C24, C65–C70, C86, C99 PASS; zero duplicate effects or dual schedules |
| P242.3 | Sandbox stable/preview spike; select pinned SDK/image; versioned Adapter; Python/Node/Shell | Isolated E2E command, typed logs, R2 manifest/restore, safe destroy | C25–C39, C71–C77, C87–C92, C98 PASS; egress/isolation/recovery/SDK version tests |
| P242.4 | Bridge to Spec 224 `ExecutionWorkspace`, Feature 196 and Spec 215 workflow execution | Approved task from Chat/Workflow -> canonical job -> sandbox -> verified artifact | C40–C47, C78, C96–C97 PASS; no Spec 224 regression |
| P242.5 | Cost/quotas, Operator UI, Mini App code results and optional monitored workloads | Signed resource policy, scoped UI, incident/alert and canary dashboards | C48–C54, C79, C93 PASS; no direct unsafe UI actions |
| P242.6 | Spec 232 per-family staging and restricted canary with rollback | Versioned route manifest, signed release/cost/evidence packet | C55–C60, C75–C80, C94–C95, C100 PASS; independent verifier and owner approval |

**Deployment ordering:** A standalone new adapter Worker/DO namespace first; no automatic transfer of legacy production jobs. Shadow tests compare read-only behavior; canary only the eligible low-risk family with independent rollback and fencing. Introduce real paid provider calls and mutable resources only after explicit admission/cost/security approvals. Preserve existing P213 certification blockers and active Spec 224 work; this spec cannot override them.

**First real product slice:** an authenticated user asks Chat to execute a non-sensitive Python data transform on a sample dataset. Feature 196 selects a certified cloud placement; Feature 195 admits a job; Sandbox runs with egress disabled, produces CSV/JSON and a sanitized chart artifact to tenant-scoped R2; Spec 240 presents typed result; user can disconnect and return; an induced Container restart restores from a committed manifest and safely resumes without duplicate billing or leaking another user's files.

---

## 16. Deterministic conformance and live certification matrix

All test fixtures use synthetic tenants/users/projects, fake LLM/payment/provider endpoints and allowlisted test artifacts by default. A test `PASS` requires executable evidence (test ID, environment/build SHA, SDK/image digest, schema revision, route generation, sanitized trace and verifier). `SKIPPED` is not PASS; unmet paid/live prerequisites remain `BLOCKED` or `PARKED_EXTERNAL_DEPENDENCY`.

| ID | Test / fault injection | Required outcome |
|---|---|---|
| C01 | Same owner, same scope, same epoch bind repeated | Deterministic same mapping, no duplicate authority |
| C02 | Same ID under another tenant/principal | No state/connection/artifact/route access |
| C03 | Change Project mid-session | Old scoped context inaccessible; fresh consent/scope required |
| C04 | Agent DO hibernates/redeploys | Projection/replay reconstructs; no in-memory assumption |
| C05 | Out-of-order/duplicate PG outbox events | Contiguous correct derived watermark; no stale overwrite |
| C06 | Projection event gap or PG unavailable | `PROJECTION_STALE`; privileged mutation blocked |
| C07 | Same-origin valid connection | Approved minimal state and typed events only |
| C08 | Cross-domain expired/forged connection grant | Reject and redact URL; no session created |
| C09 | Revoke user/tenant during live WS | Stale epoch rejected before next protected action |
| C10 | Disconnect exactly at terminal event | PG replay returns one terminal projection |
| C11 | Overflow live event buffer | `RESYNC_REQUIRED` and safe authoritative snapshot |
| C12 | High fanout/hot tenant | Bound connection/CPU/DB load; safe sharding/degraded mode |
| C13 | Duplicate local alarm after route switch | Only current owner claims canonical occurrence |
| C14 | DST skip/repeat + user timezone | Existing canonical schedule policy respected |
| C15 | 48-hour scheduler outage | Bounded fair catch-up; no notification or spend storm |
| C16 | Fiber interrupted after `stash` | Hook reconciles against PG and resumes safe step |
| C17 | Fiber restart before checkpoint | Redo safe idempotent work only; no duplicate effect |
| C18 | SDK default recovery behavior regression | Version-pin smoke detects, critical jobs never silently lost |
| C19 | Managed fiber cancel during approval wait | Policy checked; cancelled or parked accurately |
| C20 | Workflows + Fibers same step race | One active canonical attempt, stale backend aborts |
| C21 | Provider timeout after irreversible effect | `UNKNOWN_EXTERNAL_EFFECT`, reconcile or park; never blind retry |
| C22 | Lease expires before backend result | Old fence rejected; no second charge/effect commit |
| C23 | Resume after permission or budget change | Fresh PG/approval/economic gate enforced |
| C24 | Rollback during active Fiber | Route generation fences old owner; safe handback |
| C25 | Python/Node/Shell isolated smoke | Correct typed exit/logs/artifacts per certified image |
| C26 | Stable-vs-preview SDK semantic contract | Adapter returns identical canonical output envelope |
| C27 | Mixed SDK/image intentionally staged | Deployment admission refuses unsupported combination |
| C28 | Process handle after Container replacement | Fail closed; no misbinding to new incarnation |
| C29 | Restore from verified committed R2 manifest | Content hashes and environment match; resumes safe work |
| C30 | Missing/corrupt manifest or unavailable R2 | Recovery blocked with durable evidence; no invented files |
| C31 | Container killed mid-log / mid-output | Last durable cursor/artifact preserved; discontinuity explicit |
| C32 | Sandbox destroy/reaper under failure | No leaked keepAlive/process/ports; auditable cleanup |
| C33 | Untrusted sandbox attempts public egress by default | Denied and logged without secret exposure |
| C34 | Allowed HTTPS host with scoped secret injection | Only Worker handler holds credential; scope enforced |
| C35 | Redirect, raw TCP and DNS exfiltration probes | Denied or certified policy exception; no bypass |
| C36 | Cross-tenant file or direct R2 access | Denied; no shared writable workspace |
| C37 | Oversized stdout, disk fill, fork storm | Budgeted abort; sanitized bounded log/alert |
| C38 | Unsafe shell/Git/destructive action | Command Broker denies or requires approval |
| C39 | Python interpreter context after restart | Recreate/replay deterministic approved cells only |
| C40 | Feature 196 -> Kernel -> Feature 195 -> Sandbox | Canonical run/job/credits and evidence linked end to end |
| C41 | Existing Spec 224 development job switched to Sandbox | `ExecutionWorkspace` parity; no Final Verify bypass |
| C42 | Unsupported coding harness in Container | Capability probe blocks placement, explicit fallback |
| C43 | Workflow partial rerun and cancellation | Spec 215 semantics preserved; no leaked process |
| C44 | Spec 238 shared-source/coalesced monitor | One upstream collection, scoped per-subscriber assessment |
| C45 | Spec 237 reconnect/live tool event | Media consent/epoch preserved and old session rejected |
| C46 | Spec 240 Mini App renders code artifact | Typed sanitized UI, only approved actions callable |
| C47 | Admin+regular-user views | Correct redaction, authority, progress and receipt links |
| C48 | Credit cap exhausted during active process | Stop new paid effects, checkpoint and reconcile ledger |
| C49 | Container idle sleep and opt-in keepAlive | Measured cost + definite cleanup; no indefinite idle billing |
| C50 | Hyperdrive/PG transient loss | Backoff/backpressure; no shadow canonical ACL/job state |
| C51 | Concurrent tenant suspension across DO shards | Fresh security epoch deny on sensitive operations |
| C52 | SDK upgrade with live sessions/processes | Canary+drain plan; durable replay, no fake process continuity |
| C53 | Memory/context deletion under live Agent | Consent revoked; subsequent state/retrieval invalidated |
| C54 | Leak inspection of logs/errors/snapshots | No plaintext credentials, protected user data or URL tokens |
| C55 | Shadow route and 1% canary test workload | Measured latency/errors/cost within owner-approved envelope |
| C56 | Canary rollback with Queues/BullMQ overlap injection | No duplicate active executor; old generation fenced |
| C57 | Forced DO outage + Container loss + delayed Queue | Canonical PG/R2 recovery or explicit parked state |
| C58 | Region/data-residency and cost-cap admission | Disallowed placement rejected before work/data materialization |
| C59 | PG PITR and consistent outbox/job restore drill | Verifiable owner/lease/financial/effect coherence |
| C60 | Independent certification packet and live smoke | SRE/Security sign-off; unresolved items BLOCKED, not hidden |
| C61 | Malicious client `setState` attempts privileged fields | Synchronous `validateStateChange` rejects before SQLite commit **and before any broadcast** |
| C62 | Mixed-role connections on one Agent shared-state update | No cross-role/private data broadcast; authorized redacted private events only |
| C63 | Forged callable RPC or service binding bypassing HTTP auth | In-method current PG capability and identity-epoch check denies mutation |
| C64 | Reused WebSocket grant or reconnect after source-role change | Nonce/revision/epoch enforcement; no stale private replay |
| C65 | `scheduleEvery` callback longer than interval | Skipped interval observable; canonical PG schedule still catches every promised occurrence |
| C66 | Same callback with changed schedule payload after `onStart` | Stale schedules reconciled; no duplicate effect across revisions |
| C67 | Fiber recovery repeatedly fails beyond SDK default 24-hour age | Independent PG watchdog notices and parks/rebuilds before native metadata is lost |
| C68 | Evict `runFiber` while HTTP caller disconnects | Stable PG receipt and reconnectable result; no fake original promise delivery |
| C69 | Cancel retained `startFiber` with non-cooperative callback | Native aborted status never licenses external effect; egress and PG fence block it |
| C70 | Consecutive `stash` calls on same Fiber | Complete replacement snapshot sufficient for recovery; no missing earlier context |
| C71 | Preview `setEnvVars` lost on Sandbox DO eviction | Non-secret env re-established per process; no prior env assumed |
| C72 | Preview Python interpreter without `-python` image | Capability admission rejects; certified image/extension executes only when present |
| C73 | `ContainerUnavailableError` vs `OperationInterruptedError` / RPC loss | Safe pre-start retry only; potentially started work reconciled or parked |
| C74 | Abort `waitForExit` / log stream without `kill` | Active process remains tracked; actual cancellation needs explicit termination/verification |
| C75 | Crash between R2 staging object upload and manifest PG commit | No uncommitted restore, no orphan forever; independent staging GC |
| C76 | Same stable sandbox ID served by new Container while old attempt callback delayed | App incarnation nonce/fence rejects old process, outputs and settlements |
| C77 | DNS/HTTP redirect SSRF, unauthorized preview tunnel/PTY | Demonstrated deny or placement refused for restricted data; token+port+epoch scoped |
| C78 | Spec 241 memory grant revoked during active Agent/Sandbox run | Context and checkpoint invalidated; future retrieval/exfiltration denied |
| C79 | Process stopped after quota exhaustion but delayed provider/Container billing arrives | Single settlement/reconciliation; spend exposure shown, no phantom refund |
| C80 | BYOC preview bridge or residency-restricted project with unsupported placement | Certified stable bridge/alternative or explicit BLOCKED; never silent fallback |
| C81 | Two same-principal devices submit concurrent cosmetic changes with stale Agent state revision | Server-side revision guard rejects stale whole-state replacement with `STATE_CONFLICT`; no lost privileged projection |
| C82 | Client cosmetic mutation races PG authorization revoke and Workflow state update | Current PG action CAS + projection watermark wins; blocked action never executes or broadcasts sensitive fields |
| C83 | Wake/redeploy during asynchronous `onStart`, concurrent socket/RPC/alarm arrives | `ACTIVATING` gate blocks private projection and effects until canonical epoch+watermark reconciliation succeeds |
| C84 | Rotate Agent name HMAC key and inject forged old-key identity or digest collision | One correct canonical binding; retired key cannot allocate or reauthorize Agent or cross-scope access |
| C85 | Migrate active Agent class/namespace while old Fiber and WebSocket callback arrive | Old owner fenced, old clients re-ticketed, no overlapping accepted effects or private state bleed |
| C86 | Cloudflare Workflow state merge/full update races revocation and newer PG event | Only whitelist reducer, current run/epoch and ascending PG watermark apply; no privileged field overwrite |
| C87 | Production R2 DirectoryBackup restore -> local edits -> idle stop -> replacement | Overlay lost and restored from last committed backup handle; uncommitted upper-layer data never reported durable |
| C88 | Production overlay cross-layer rename triggers `EXDEV` while local extraction succeeds | Certified cache exclusion/copy fallback works; independent production restore evidence |
| C89 | Signed but malicious archive includes `../`, symlink escape, setuid, decompression bomb | Restore denied before mount/run; bounded safe extraction and audit evidence |
| C90 | Correct-hash backup belongs to another tenant or older policy/source revision | Fail-closed ownership, grant, image and manifest admission; no privileged old-script auto-run |
| C91 | Parent exits after cancellation while detached child still runs/exposes port | Independent process group termination + liveness probe; no false cleanup receipt |
| C92 | Chunk/log transport gaps, massive stderr, stale old-container output | Explicit sequence/truncation and incarnation markers; sanitization; no false terminal success or settlement |
| C93 | Exposed tunnel URL copied, attached PTY survives user revocation, tunnel orphans | Product-layer auth, immediate scoped revoke, bounded close and independently verified unreachable old preview |
| C94 | Rolling Worker/Agent SDK upgrade receives older state/Fiber/Workflow callbacks | Versioned manifest decoder or parked incompatibility; no unauthorized mutation, billing or projection corruption |
| C95 | Rollback after non-backward-compatible SQLite schema change | Promotion gate prohibits unsafe rollback; drain/forward-fix preserves canonical job ownership and evidence |
| C96 | Interpreter returns malicious SVG/HTML/script, spoofed MIME and instruction-looking stdout | Rich output converted to sanctioned inert typed results; raw evidence access-controlled, no tool instruction execution |
| C97 | CSV formulas and export/download after permission revocation | Formula neutralized, MIME validated and fresh output authorization denies revoked recipient |
| C98 | DR restores an Agent/R2 workspace from *before* erasure/tombstone | Current tombstone applied before data replay; removed content not re-exposed, executed or reindexed |
| C99 | Repeated Fiber/Container poison failure followed by DO rebuild and DLQ expiry | PG retry budget persists; `RECOVERY_QUARANTINED`, incident and zero infinite provider spend |
| C100 | Regional/Cloudflare outage with cheaper but wrong-region or unsafe alternate executor | No implicit downgrade; job holds `BLOCKED_PLACEMENT` with audit/owner alert and no extra paid effect |

### 16.1 Release hard stops

Stop promotion on: unverified canonical schema/Spec ID collision; auth/tenant boundary leak; missing fresh revocation gate; duplicated paid effect or settlement; unconstrained network/secret exposure; stable/preview SDK/image mismatch; inability to resume from Container replacement safely; missing R2 checkpoint integrity for recoverable jobs; dual scheduler or route ownership; Final Verify bypass; missing rollback owner; or unknown irreversible effects automatically replayed; sensitive state broadcast before authorization; ungoverned DNS/preview ingress for restricted content; or a Fiber silently aged out while canonical work remains active. Unrelated independently certified families may proceed under Spec 232's phased rollout, but no global `FINAL_VERIFY=PASS` while required gates are blocked.

---

## 17. Operator decision records and implementation checklist

### ADR-242-01 — Cloudflare Agent as substrate

**Decision:** Add native Agents SDK behind Kernel, not a second SmartAIHub assistant product. **Why:** existing ownership and audited durable business work survive provider changes. **Trade-off:** explicit adapter/projection code.

### ADR-242-02 — Fiber vs Workflows

**Decision:** Use Fiber for bounded Agent-local resilient tasks with semantic recovery; Workflows for complex multi-step durable waits; Feature 195 for physical work authority. **Trade-off:** correlated but distinct backend lifecycle IDs.

### ADR-242-03 — Sandbox package family

**Decision required during P242.0/P242.3:** Pin a vetted stable SDK or preview 1.0 SDK + matching image. Prefer the new argv/handle model for new code only after risk acceptance; provide a stable adapter if production preview promotion is not certified. **Trade-off:** one version-translation layer but no implicit SDK breakage.

### ADR-242-04 — Default isolation and network

**Decision:** Ephemeral per-job Container for untrusted work and deny-by-default egress; persistent workspaces only by explicit policy. **Trade-off:** cold-start and checkpoint overhead in exchange for tenant/data protection.

### ADR-242-05 — Recovery durability

**Decision:** PG canonical job/effect records and R2 verified artifacts survive; DO SQLite caches/local schedule and Container process/filesystem do not become business truth. **Trade-off:** bounded recovery reconciliation complexity.

### Mandatory pre-coding checklist

- [ ] Verify exact Spec 242 number across registry, main, branches and active PRs; reconcile conflicts before commit.
- [ ] Map current Feature 195/196/215/219/220/224/232 and Spec 241 Memory interfaces and migrations; record actual deployed statuses.
- [ ] Pin SDK/image pair, `wrangler` compatibility date/flags, DO migrations and account capability/limits profile.
- [ ] Identify whether native Agent APIs/permissions used here are GA, beta or preview **for the pinned version**.
- [ ] Produce threat model for multi-tenant isolation, code injection, network exfiltration, approval bypass and unknown external effects.
- [ ] Select one safe non-paid starter slice and exact rollback/feature flag route.
- [ ] Create synthetic deterministic fixtures and independent verifier before real paid providers.
- [ ] Reconcile actual Spec 224 checkpoint/protocol pack worktree; do not overwrite in-progress code.
- [ ] Trace canonical `worker_jobs.id` and credit reservation from command to terminal UI and R2 artifact.
- [ ] Document runbook: stale DO, alarm duplication, crashed Fiber, stopped Container, bad checkpoint, PG outage, DLQ loss, secret revocation, provider unknown effect and tenant emergency suspend.
- [ ] Capture release-candidate artifact digest, test suite output, cost trace, canary exposure, signed reviewer decision and `resume_from` on BLOCKED/PARKED.

---

## 18. Primary official references (reviewed 2026-09-24)

**Cloudflare Agents:**

1. [Overview — durable identity, state, connections, scheduling, recovery](https://developers.cloudflare.com/agents/)
2. [Quick start and required Wrangler bindings](https://developers.cloudflare.com/agents/getting-started/quick-start/)
3. [State and automatic synchronization](https://developers.cloudflare.com/agents/runtime/lifecycle/state/)
4. [Agent scheduling and alarms](https://developers.cloudflare.com/agents/runtime/execution/schedule-tasks/)
5. [Durable execution with Fibers](https://developers.cloudflare.com/agents/runtime/execution/durable-execution/)
6. [Realtime WebSocket communication](https://developers.cloudflare.com/agents/runtime/communication/websockets/)
7. [Cross-domain WebSocket authentication](https://developers.cloudflare.com/agents/runtime/operations/cross-domain-authentication/)

**Cloudflare Sandbox / Containers:**

8. [Stable Sandbox lifecycle](https://developers.cloudflare.com/sandbox/api/lifecycle/)
9. [Sandbox lifecycle and Container incarnation model — 1.0 preview](https://developers.cloudflare.com/sandbox/1-0-preview/lifecycle/)
10. [Sandbox process execution — 1.0 preview](https://developers.cloudflare.com/sandbox/1-0-preview/processes/)
11. [Interpreter — 1.0 preview](https://developers.cloudflare.com/sandbox/1-0-preview/interpreter/)
12. [1.0 preview get started and package/image pairing](https://developers.cloudflare.com/sandbox/1-0-preview/get-started/)
13. [Migration from stable to preview](https://developers.cloudflare.com/sandbox/1-0-preview/migrate/)
14. [Sandbox HTTP(S) egress and secure credential injection](https://developers.cloudflare.com/sandbox/guides/outbound-traffic/)
15. [Sandbox limits](https://developers.cloudflare.com/sandbox/platform/limits/)
16. [Containers pricing](https://developers.cloudflare.com/containers/platform/pricing/)
17. [Cloudflare Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/)
18. [Agents client state sync and synchronous validation](https://developers.cloudflare.com/agents/runtime/lifecycle/state/)
19. [Agents Fiber recovery max-age, managed cancellation and stash](https://developers.cloudflare.com/agents/runtime/execution/durable-execution/)
20. [Agent interval overlap/skip semantics](https://developers.cloudflare.com/agents/runtime/execution/schedule-tasks/)
21. [Sandbox 1.0 preview errors and ambiguous process launch](https://developers.cloudflare.com/sandbox/1-0-preview/errors/)
22. [Sandbox 1.0 preview process environment](https://developers.cloudflare.com/sandbox/1-0-preview/environment/)
23. [Sandbox 1.0 preview interpreter image requirement](https://developers.cloudflare.com/sandbox/1-0-preview/interpreter/)

24. [Directory backups — production OverlayFS, local extract and EXDEV](https://developers.cloudflare.com/sandbox/concepts/backup-restore/)
25. [Agent/Workflow updateAgentState and mergeAgentState](https://developers.cloudflare.com/agents/runtime/lifecycle/state/)
26. [1.0 preview interpreter rich output and execution-result types](https://developers.cloudflare.com/sandbox/1-0-preview/api/interpreter/)
27. [Sandbox preview URL ingress and authentication caveats](https://developers.cloudflare.com/sandbox/concepts/preview-urls/)
28. [Agent runtime and startup lifecycle](https://developers.cloudflare.com/agents/runtime/agents-api/)
29. [Sandbox 1.0 preview errors and uncertain operation recovery](https://developers.cloudflare.com/sandbox/1-0-preview/errors/)

**Reference policy:** Re-check these official pages and package release notes on implementation/promotion date. Cloudflare native docs are evidence for **vendor capability**, not evidence that SmartAIHub has implemented or certified it. Cloudflare preview features and plan-dependent quotas require independent deployment verification.

---

## 19. Definition of done

This spec is **IMPLEMENTED** only when versioned adapters, schema migrations, feature flags, observability, owner runbooks and all mandatory deterministic integration suites are merged with reviewed commit SHA. It is **PRODUCTION CERTIFIED** only when the applicable live staging/canary tests C01–C100 have independently reviewed evidence, the exact SDK/image/deployment versions are recorded, the responsible feature owners approve, security/financial invariants hold and an explicit rollback path has been exercised. Provider-native `ready`, a successful demonstration or green unit tests alone never imply SmartAIHub end-to-end Final Verify.

**Expected product outcome:** A user can start approved long-lived assistance, monitoring, coding or Mini App analysis from Chat or a phone; SmartAIHub can place eligible work in Cloudflare Agent/Workflow/Sandbox even while the user's computer is off; after a disconnect, Agent restart, Queue redelivery or Container replacement the system resumes safe work or clearly parks uncertainty; and the same canonical permissions, job identity, credits, artifacts and audit remain intact across Cloudflare and non-Cloudflare execution paths.


---

## 20. Twelve-round document hardening audit — 2026-09-24 (design verification only)

**Scope:** This audit re-read Spec 242 v1.0, reconciled the accessible design snapshots (215 r3, 219 r3, 224 r17, 232 r2, 237 v1.2, 238 v1.2 and 240 r0.3) and checked current official Cloudflare Agents/Sandbox documentation. Each pass identified one independently actionable gap, amended the normative contract **in this revision** and mapped regression tests. No SmartAIHub repository build, live credentials, paid provider calls or real Cloudflare deployment was available: all C-tests remain **REQUIRED / NOT EXECUTED** pending P242 implementation.

| Round | Gap found in v1.0 | Normative patch in v1.1 | Required regression | Document outcome |
|---|---|---|---|---|
| R01 | Ambiguous PG/DO split-transaction and native/backend owner handoff | §0.2 single authority, fences, outbox crash points; add Spec 241 owner | C20/22/56/59 | PATCHED |
| R02 | Auth checked at connection but not all callable RPC and background entrypoints | §3.5 per-method current authorization and revoked-instance drain | C02/08/51/63 | PATCHED |
| R03 | `setState` automatically broadcasts before `onStateChanged`; mixed grants leak | §4.4 synchronous `validateStateChange`, private streams, Memory grants | C53/61/62/78 | PATCHED |
| R04 | Evicted caller and reconnect cursor not explicitly governed | §5.4 PG receipt, scoped replay, per-recipient private progress | C10/11/64/68 | PATCHED |
| R05 | Native interval skipped overlapping ticks; changed payload duplicates schedule | §6.3 canonical due-occurrence and local skip reconciliation | C13/15/65/66 | PATCHED |
| R06 | Fiber managed/unmanaged behavior, default recovery age and cancellation ambiguous | §7.5 24h watchdog, full stash, explicit recovery result and fences | C16/19/67–70 | PATCHED |
| R07 | Preview `exec` start != exit, uncertain RPC errors, environment ephemeral | §8.4 typed error matrix, SDK/image/interpreter/bridge admission | C26/71–74/80 | PATCHED |
| R08 | Sandbox incarnation and staging R2 checkpoint could be misbound/lost | §9.6 ephemeral incarnation nonce, staged immutable manifest and GC | C28–32/75/76 | PATCHED |
| R09 | Disabled internet still permits DNS; exposed PTY/preview paths | §10.6 egress and ingress probes, deny restricted placement on unprovable isolation | C33–36/77 | PATCHED |
| R10 | Cross-tenant capacity and partial-use charges on failed termination | §11.4 joint economic/capacity admission and eventual reconciliation | C12/48/49/79 | PATCHED |
| R11 | Spec 241 Memory handoff, unverified placement residency and external agent grant | §12.3 governed scope, region and capability transfer | C42/53/58/78/80 | PATCHED |
| R12 | Recovery tests missed several exact vendor failure semantics | §14.4 evidence chain + C61–C80, phase gates and release stops | C57/59/60/61–80 | PATCHED |

**Verification rule:** `PATCHED` here means the specification text was amended and structurally checked, **not** that code is shipped or the conformance tests passed. At P242.0, compare every changed requirement against the latest actual repository and capture owner acknowledgment; regression evidence belongs in the existing verification service.

## 21. Open implementation gates and evidence not yet available

1. Canonical Spec 242 registration and latest Spec 241, 224 and 232 **repository** contracts, migrations and in-progress worktree still need reconciliation. Do not edit historical Specs <=213 or partially implemented Spec 224 in place.
2. SDK/package/container-image compatibility, actual Cloudflare plan/region/Sandbox bridge support, Fiber defaults and Container lifecycle must be probed with the **pinned** production candidate. Vendor documentation alone is not deployment certification.
3. Any restricted data class for which DNS egress, preview ingress isolation or regional placement cannot be proven has an **explicit unsupported Cloudflare placement**; support on a certified alternative substrate is optional, not an automatic bypass.
4. C01–C100 require executable traces; zero-tolerance gates must pass independently and contain no `SKIPPED` or fabricated runtime evidence. Incrementally canary a low-risk synthetic/non-paid job family first, and preserve existing Redis/BullMQ paths until Spec 232 authorizes ownership transfer.

---

## 22. Additional twelve-round gap audit and amendments — v1.2 (2026-09-24)

**Method:** For each of R13–R24, inspect the existing v1.1 requirement, compare against current official Agents/Sandbox lifecycle and security documentation or an uncovered cross-system race, update the normative section above, add an isolated fault-injection test and re-check the affected ownership boundary. The review verifies **specification completeness**, not production behavior; C81–C100 are REQUIRED / NOT EXECUTED until actual implementation. Earlier R01–R12 and C01–C80 remain intact.

| Round | Independent inspection focus | Concrete v1.1 gap | Normative patch and tests | Status |
|---|---|---|---|---|
| R13 | SDK state vs PG concurrency | Synchronous validation mentioned revisions but not multi-device CAS/lost-update protocol | §4.5; C81–C82 | PATCHED IN DOCUMENT |
| R14 | Hibernation/deploy startup races | No explicit fail-closed readiness barrier during async `onStart` and alarm/RPC arrival | §3.6; C83 | PATCHED IN DOCUMENT |
| R15 | Identity, HMAC and namespace rotation | Instance addressing existed but draining a live renamed class/key and old async callbacks lacked atomic ownership protocol | §3.7; C84–C85 | PATCHED IN DOCUMENT |
| R16 | Agent+Workflow state helpers | Workflow-initiated `updateAgentState`/merge could outlive principal rights or replace a newer projection | §7.6; C86 | PATCHED IN DOCUMENT |
| R17 | DirectoryBackup mechanism parity | Generic R2 restore omitted production OverlayFS upper layer vs local extract and cross-device `EXDEV` | §9.7; C87–C88 | PATCHED IN DOCUMENT |
| R18 | Artifact restore supply-chain | A manifest digest alone did not require exhaustive archive entry, mount and autorun policy validation | §9.8; C89–C90 | PATCHED IN DOCUMENT |
| R19 | Shell process termination and evidence | Parent PID exit/log EOF could hide detached descendants and missing terminal log chunks | §8.5; C91–C92 | PATCHED IN DOCUMENT |
| R20 | Public preview and PTY ingress | Tokenized/unguessable URL did not specify independent product auth and revocation of *already attached* streams | §10.7; C93 | PATCHED IN DOCUMENT |
| R21 | Live SDK/DO database upgrades | SDK/image pinning lacked durable manifest, oldest-live-run decoder and unsafe rollback denial | §12.4; C94–C95 | PATCHED IN DOCUMENT |
| R22 | Rich interpreter output/export | General sanitization did not specify MIME spoofing, active SVG/HTML, model-output instructions or spreadsheet formulas | §8.6; C96–C97 | PATCHED IN DOCUMENT |
| R23 | Erasure vs old backup/DR | Deletion saga lacked a replay-independent tombstone that blocks restoration of previously revoked material | §9.9; C98 | PATCHED IN DOCUMENT |
| R24 | Infinite failures and degraded placement | Watchdog lacked canonical poison quarantine and no-compliance-downgrade outage contract | §14.5; C99–C100 | PATCHED IN DOCUMENT |

### 22.1 Review evidence and boundaries

- **Official documentation checked 2026-09-24:** Agent state validation, Agent+Workflow integration, Sandbox 1.0 preview process/errors/interpreter, DirectoryBackup production/local restore semantics, Sandbox preview/tunnel security and current stable/preview version split; exact vendor APIs and account limits must be reverified for the pinned release candidate.
- **Not executed:** SmartAIHub repository builds/tests; live Cloudflare Agents/Containers/Queues/Fiber fault injection; actual region isolation proof; payment settlement, browser certification, production canary and provider-side erasure attestations. Mark them BLOCKED or NOT EXECUTED in the implementation tracker rather than PASS.
- **Cross-spec boundary preserved:** Specs <=213 unchanged; in-progress Spec 224 unchanged. All additions are Spec 242 adapter, tests or compatibility requirements; Spec 232 remains per-job-family migration authority. Spec 241 remains canonical memory owner only after repo registry/version confirmation.

### 22.2 Second-cycle release stop additions

Production certification MUST additionally fail on: (a) production backup overlay behavior assumed from `wrangler dev` only; (b) active preview/PTY accessible after revoke; (c) pre-erasure backup restores private data; (d) SDK rollback attempts to read incompatible on-disk schema; (e) detached child process remains live after claimed cleanup; (f) a stale Workflow callback changes a newer Agent projection; (g) a forced failover violates the current residency or data-class policy; or (h) a repeatedly failing Fiber silently exhausts vendor metadata without a canonical quarantined incident. These gates apply whether or not C01–C80 pass.

---
