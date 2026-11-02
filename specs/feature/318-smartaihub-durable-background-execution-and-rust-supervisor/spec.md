---
spec_id: 318
semantic_id: smartaihub.durable-background-execution
revision: R1.5
date: 2026-11-02
status: PROPOSED_NOT_IMPLEMENTED
scope: Canonical worker_jobs authority, Workers Agents/Workflows/Queues, OS-boot Runner Core Connector, on-demand native executors, multi-tenant recovery
supersedes_draft: R0.4 optional Go executor proposal
---

# SPEC-318 — SmartAIHub Durable Background Execution, Cloudflare Queues & Native Rust Job Supervisor

> **Current-revision note (R1.5, 2026-11-02):** Earlier proposal text is retained for provenance. Its Rust-native-supervisor-first choice and old bootstrap sequence are superseded for new-platform cloud continuity by the final R1.5 section, Workers-first Durable Agents ADR and current owner-decision register. Rust remains a workload-specific executor; Legacy SPEC-267/311 scope is unchanged.


## 0. Owner decision: correctness first, small Workers, deploy early

Long-running background jobs are a **primary product workload**, not an optional auxiliary feature. Provide a small independent executor system that supports large concurrent tenant workloads, preserves accepted jobs across process crashes and host failures, supports observable progress/restart/cancel/reconciliation, minimizes idle Cloudflare spend, and does not require the giant legacy `apps/web` build.

**Decision:** Keep SaaS Core/Hono, Queue producer and small Cloudflare Push Consumer on **TypeScript** by default. Use a separately built **native Rust executable** as the preferred new long-running `job-supervisor` and native I/O executor outside Cloudflare Workers. Go remains a qualified alternate executor implementation, not a mandatory dependency; Rust is not mandatory for every job. Retain Python OpenAI Agents SDK, Codex/Runner and FFmpeg/GPU/provider-specific executors. A thin Rust/Wasm Worker using `workers-rs` MAY be benchmarked for focused Cloudflare bindings, but SHALL NOT be substituted for a native multi-hour process and SHALL NOT enlarge the default TS Queue worker merely to share language.

**Critical truth:** Neither Go, Rust nor Cloudflare Queues guarantees a business effect executes exactly once, a task never crashes, or zero loss following failure of primary DB plus backups. Queue delivery is at least once. Reliability SHALL be defined by durable admission, idempotency, canonical state, recovery ownership and measured backup/restoration, not programming-language marketing.

Canonical authorities remain unchanged: SPEC-224/278 and existing `smartspec.worker_jobs` + transactional outbox + canonical job/attempt/lease/fencing owner; SPEC-207 wallet/credit reserve/settlement; SPEC-280 pricing; SPEC-295 deployment/release; SPEC-293 Git provenance; SPEC-267/311 existing Cloudflare legacy context. This spec adds *implementation and reliability contracts*, never a second job ledger, settlement writer, approval subsystem, state machine or `worker_jobs` copy. Legacy schema is preserved; exact catalog introspection and compatible additive change are required where necessary.

## 1. Execution topology and placement

```text
Browser / Module -> Hono TS Job API (authorize, admission, status, cancel)
                         |
                         v
Existing PostgreSQL smartspec (worker_jobs + attempts + transactional outbox)
                         |
                  durable outbox publisher/reconciler
                         |
          +--------------+------------------------------+
          |                                             |
   Debian Development                           Cloudflare Production
   PostgreSQL claim                             Queue transport (optional)
          |                                      |                    |
   Native Rust Supervisor                   TS Push Worker    HTTP Pull Queue
          |                                      |                 (Rust native)
          +------------------------------+-------+--------------------+
                                         |
                        Canonical claim / lease / fencing
                                         |
               +-------------------------+-----------------------+
               |                         |                       |
          Rust async/native      Python/Agent/Runner       FFmpeg/GPU/provider
               |                         |                       |
               +-------------------------+-----------------------+
                                         |
                      checkpoint + progress + R2 artifact references
                                         |
                  single canonical terminal state and credit settlement
```

- `smartaihub.app`: Legacy development/runtime remains separate, with explicitly managed legacy job ownership.
- `aimarkethubs.com`: modular development on Debian; same canonical user/role/tenant/wallet data and business contracts as production; Rust supervisor can consume the **existing** DB job authority directly, without paid Cloudflare Queues. Development write authority must remain tenant/job scoped; no duplicate job claim by old Debian and new Rust processes.
- `smartsihub.com`: production Cloudflare API + optional scoped Queue. The native supervisor runs on approved external compute (Debian, Runner, BYOC, provider, or separately justified on-demand host). If production Rust depends on the same Debian box, report the failure-domain dependency. Cloudflare Workers cannot keep that native process alive.
- No standing application Containers merely for regular HTTP or idle polling. Do not recreate Cloudflare migration resources decommissioned on 2026-11-01 without a reviewed need and new resource identity.

## 2. Language decision and build boundaries

| Component | Default | Alternative and justification |
|---|---|---|
| Core API, job intake, auth and UI transport | Hono/TypeScript Workers | No Go/Rust Core rewrite |
| Queue producer / outbox publisher / short push consumer | TypeScript Worker | Rust `workers-rs` only after size/CPU/maintainability benchmark |
| Long-running job supervisor / bounded I/O executor | **Rust native** (`tokio`, minimal SQL/HTTP/serde/tracing) | Go adapter permitted if a workload requires it or code exists |
| Python-only harness / Agents SDK | Existing Python runtime | Native supervisor wraps or dispatches; do not silently reimplement SDK |
| Native video, GPU, ffmpeg | Existing specialized executor/provider | Native Rust supervisor for lifecycle only if helpful |
| Provider async waiting | Durable state + callback / scheduled reconciliation | No process held open simply to wait |

Rust native and Rust `wasm32-unknown-unknown` builds are distinct targets: `tokio` OS-thread/process/file APIs and native DB drivers may not run inside Workers Wasm. Cross-compile only **pure versioned contracts** where demonstrated. Bundle size, initial CPU, throughput and peak RSS MUST be measured for each actual target. No automatic assertion that Rust/Wasm is faster or smaller than TS.

Recommended first-party Rust crates by function, subject to lockfile/security review and minimal feature selection: `tokio` (async runtime), `serde`/`serde_json` (contracts), `tracing` (structured observability), one evaluated PostgreSQL client (`tokio-postgres` **or** `sqlx`, not both by default), and one bounded HTTP client with TLS. Avoid a broad plugin framework, unnecessary brokers or permanent polling daemons at initial release. Use bounded task concurrency; reject process-spawning workloads outside their declared capability and budget.

Build Rust supervisor as a versioned standalone artifact with checksum and source SHA; service lifecycle/restart independent from Hono Core, UI and every other Module. Cold builds may be slower than Go; compilation time and build RAM are optimization metrics, not a reason to weaken job recovery.

## 3. Durable admission and dispatch invariants

1. **Accepted means persisted.** HTTP 202 is returned only after canonical job row **and transactional outbox event** have committed in one PostgreSQL transaction. If commit outcome is unknown, query by client-supplied idempotency key rather than creating another logical job. An accepted job has stable `jobId`, owner/tenant, jobType, attempt policy, version and correlation ID.
2. **Queue is only a notification/transport.** Outbox publisher retries unconfirmed sends. Messages are compact (~2KiB desired), contain IDs/version/tenant/capability class, and NEVER carry credentials or large customer payloads. Provider enqueue succeeding but outbox mark failing can yield duplicate dispatch; consumer MUST dedupe against canonical state.
3. **Atomic claim.** Reuse existing atomic `worker_jobs` claim/lease/attempt ownership with unique attempt/dispatch and increasing fencing generation. A claim locks for only the DB transaction, not for job lifetime. Rust must not invent new lease or job tables to sidestep pre-existing controls.
4. **Fenced writes.** Heartbeat, checkpoint, terminal transition and settlement request validate current attempt, tenant, owner and fence token. A stale executor cannot overwrite a newer worker's result. All DB-side effects must be conditional/idempotent.
5. **Queue ACK after recovery ownership.** For short push jobs, ACK after verified terminal state or verified durable ownership transfer. For long jobs, ACK may follow durable DB claim + reconcilable handoff, **only if** the recovery scanner is implemented and tested; never ACK based merely on process spawning. If no durable handoff is proven, retry. Lost ACK and repeated deliveries must be harmless.
6. **Restarts are normal.** Rust handles OS signals, stops claiming new work, gives current work bounded checkpoint/graceful cancellation, and leaves uncompleted jobs recoverable through expired lease. Sudden kill (OOM/power loss) also must be repaired by the canonical reconciler; do not depend on destructor/finally execution.
7. **Unsafe replay is forbidden.** Side effects with non-idempotent external providers require provider idempotency keys, status lookup or reconciliation. When the result is uncertain after a crash, record a discoverable *outcome-unknown* condition using the existing canonical error/status machinery and require safe reconciliation before another external call. Do not assume a speculative retry is harmless.
8. **Exactly-one settlement owner.** Rust may report outcomes but cannot independently charge/refund Wallet. SPEC-207 accepts completion under canonical job/attempt idempotency. A job result and charge must not be committed twice after redelivery.
9. **Auditability.** Each job records source/contract/executor version, tenant, timeline, claim/heartbeat/checkpoint, retry reason, user cancellation, Queue delivery and R2 artifact reference; no copied secrets. Retain an immutable or sufficiently durable event trail in the existing authority.
10. **No hidden permanent failures.** Poison envelopes and jobs beyond retry budget become discoverable quarantine/DLQ cases with reason, owner and replay procedure. Reconciliation re-evaluates outstanding DB jobs even after Queue retention expires; this is not permission for unbounded automatic replay of unknown external side effects.

## 4. Rust Supervisor responsibilities

The native supervisor SHALL implement a minimal versioned interface: `discover -> claim -> execute-or-dispatch -> checkpoint -> heartbeat -> cancel -> reconcile -> complete/fail`. It MAY delegate actual work to Python/Runner/media providers. The executor MUST enforce per-job resource caps, tenant and provider quotas, deadlines, cancellation signals and bounded concurrency, while surfacing live progress/status to the existing UI contract.

Recommended operating model: `tokio::Semaphore` or equivalent bounded work slots; per-tenant weighted/fair queue selection with starvation protection; separate capacity classes for API I/O, AI provider waits and CPU/GPU tasks; exponential backoff with jitter on transient failures; bounded DB connection pool; cancellation tokens; structured traces; secure secrets retrieved from existing authority; small checkpoint metadata in DB and large artifacts in R2.

If Rust runs as a Debian system service, configure OS supervision/restart with scoped service user, graceful-stop timeout, pinned binary, health check and on-boot recovery. This makes process recovery more likely but **does not keep work running during a whole-machine outage**. To avoid a single failure domain for critical jobs, add second independent executor host or provider-managed async execution when measured availability requires it; do not conceal this as a language guarantee.

## 5. Cloudflare Queues integration details

- Cloudflare Queues default to **at-least-once**, non-exactly-once delivery. Message may be duplicated or arrive out of order; canonical attempt/fence and provider idempotency own business correctness.
- Cloudflare Push Queue consumer Worker wall time maximum **15 minutes** per invocation and CPU configurable up to **5 minutes**. Rust/Wasm does NOT lift this limit. Therefore native multi-hour agents/renders never execute inside a Push Queue handler.
- HTTP Pull Consumers can operate from native Rust, Go, Python or any HTTPS client. One Queue supports only one consumer *type* (Push or Pull), so if both are needed use explicitly separate queues and route classes. Multiple native pull clients on one pull-configured Queue are supported.
- HTTP Pull uses **short polling**; idle polling incurs Queue read operations. Default to TS Push + durable handoff for low-volume work, and justify a native HTTP Pull Queue based on measured capacity, operation cost and behavior. For Pull, ACK before completing a long job is acceptable only after durable claim/handoff + verified recovery; do not extend Queue visibility for an entire multi-hour run.
- Pull API `json`/`bytes` bodies may be base64-encoded and lease ACK may be accepted after visibility expiry even after redelivery. Decode contract and guard identity/fence in PostgreSQL, not just Queue lease ID.
- Messages have retention max **14 days**, message max **128KB**, and per-queue throughput/consumer concurrency limits published by Cloudflare. DLQ messages also expire. The canonical DB scanner must detect stuck `accepted`, `queued`, `retryable`, `leased`, `running`, and `outcome_unknown` jobs even if Queue data disappeared.
- Do not create one Queue per tenant/Module by default. Short queues and long pull queues are separately provisioned only when load warrants it. All costs (read/write/delete/retry, Worker CPU, external host) are measured by job class.

Official references: https://developers.cloudflare.com/workers/languages/rust/ ; https://developers.cloudflare.com/workers/runtime-apis/webassembly/ ; https://developers.cloudflare.com/queues/reference/delivery-guarantees/ ; https://developers.cloudflare.com/queues/configuration/pull-consumers/ ; https://developers.cloudflare.com/queues/configuration/dead-letter-queues/ ; https://developers.cloudflare.com/queues/platform/limits/

## 6. Reliability scale, backups and observability

- **Fairness:** strict tenant-scoped authorization, per-tenant concurrency/rate limits, provider resource ceilings and fair admission to prevent one tenant starving others; no global serial executor bottleneck.
- **Backpressure:** bound active Rust tasks, DB connection counts, outbound provider concurrency, queue inflight and R2 upload rate. A full executor does not silently drop accepted jobs; backlog is visible and progresses when capacity returns.
- **Job state reconciliation:** periodic sweep for orphan outbox events, exhausted Queue retries, expired leases, missing checkpoint progress, unacknowledged/unknown external outcomes and stuck cancellations. Use existing canonical sweep authority; do not run multiple conflicting sweepers.
- **Metrics:** accepted-but-not-dispatched, queue age p95/p99, time-to-start, time-to-terminal, active lease vs host heartbeat, retry/DLQ/quarantine counts, duplicate suppressions, stale-fence rejections, credit settlement mismatches, provider unknown outcome, Rust process RSS/CPU and durable checkpoint age. Dashboards distinguish broker health from actual job completion.
- **Database survivability:** PostgreSQL is a single canonical authority and therefore a critical dependency. Inspect backup and PITR configuration, replication/failover reality, restore drills and realistic RPO/RTO. No claim of zero job loss across database+backup loss. Maintain additive compatible schema and avoid unsafe automigrations on Worker cold start.
- **Performance:** benchmark Rust native against Go native on one real workload if available: p95 time-to-start, throughput per core, RSS/worker, build time, size, process restart, recovery latency, resource cost. Language is chosen by observed workload requirements; do not fabricate reliability advantages.

## 7. Incremental implementation and human UAT — no new project-wide gate

Start real code development and runnable UAT without waiting for a full legacy inventory or entire Cloudflare cutover. Milestones are **implementation slices**, not approval chains:

- **B0:** inspect existing `worker_jobs`, outbox, attempts, cancellation, leases, job classifications and SPEC-224/278; adapt exact canonical DB/API contracts. Build small fixtures concurrently, not a planning-only pause.
- **B1:** TypeScript `submit/status/cancel` and transactional durable admission, visible real `jobId` + progress on `aimarkethubs.com`.
- **B2:** tiny **native Rust Supervisor** on Debian, one safe real job type, run with authorized developer, show progress, restart recovery, cancellation and artifact/settlement proof.
- **B3:** separated TypeScript Queue producer/push consumer and local `workerd` contract tests; deploy one small scoped Cloudflare Queue as needed for first `smartsihub.com` beta, with real bindings and source-pinned receipt.
- **B4:** native Rust HTTP Pull Queue adapter only if measured long-job workload justifies it; separate pull Queue from push Queue. Optionally compare tiny `workers-rs` Queue adapter **without** making that a dependency of Core launch.
- **B5:** Python harness, Codex/Runner, FFmpeg/GPU and provider async adapters using existing canonical lease/settlement contracts; expand tenants/capacity as measurements support.

**Targeted correctness tests** for the job class being enabled: `kill -9` after claim, restart after checkpoint, crash after provider success before DB commit, duplicate delivery/lost ACK, dual-executor race, expired lease/stale fence, same-job concurrent attempts, cancel during execution, DB outage/recovery, broker outage/DLQ expiration, 2+ tenants fairness, saturation/backpressure, rolling executor version change, and Wallet charge once. Run a real-human flow with accepted `jobId` at each slice; don't require closure of unrelated job types or a generic 24-hour soak for restricted beta. Financially unsafe or unauthorized mutations stop **only the affected job type/action**, while unrelated Core UI and modules continue deploying.

## 8. Explicit non-goals

Do not rewrite SaaS Core in Rust; do not convert legacy giant Node/tRPC app; do not reimplement Python SDK in Rust; do not create a second background job/orchestration/ledger system; do not adopt Rust/Wasm Workers for long-running execution; do not require permanent Cloudflare Containers, per-tenant Queues, separate development user DB, broad all-system deployment gates, or global halt of human UAT due to unrelated job-class findings.

**Evidence status:** Proposed design only. No Rust supervisor, Cloudflare Queue, schema migration, DNS cutover or new deployment is implemented by this document.


---

## R0.6 Addendum — Billable Skill and subscription-aware durable jobs (2026-11-01)

- Every billable Skill invocation initiated by UI, WebMCP or remote headless action is admitted once to canonical `worker_jobs` and linked to SPEC-321 price/offer/subscription decision and SPEC-207 reservation/settlement. Duplicate transports/Queue deliveries do not trigger new debits or subscriptions.
- Only a newly written, App-exclusive Skill classified `APP_EXCLUSIVE_INCLUDED` by SPEC-321 is covered by the Mini App subscription without per-use subscriber debit. Any central/marketplace/other-App/shared Skill remains `SHARED_METERED` and incurs a credit charge **for every distinct invocation**, including nested child calls from an included Skill; persist unique child invocation IDs, source Skill ID/version, payer, quote and settlement linkage. Queue retry/lost ACK of the SAME logical child invocation must not debit again. Rust Supervisor only executes the resolved immutable billing decision and cannot grant subscription coverage, change Skill ownership or create a second wallet authority.

## R0.7 Addendum — Skill execution graph billing trace

- Preserve parent/child action lineage in canonical `worker_jobs` events or existing associated metadata. For nested shared Skills use independent stable invocation identities and an auditable `SHARED_METERED` decision; never collapse charged children into a free included parent.
- Run targeted kill/restart/double-delivery tests for mixed exclusive + shared calls to prove charge-once-per-distinct-call and no accidental credit bypass. These are tests of the paid path, not broad release gates for unrelated UAT.


---

## R0.9 — Agentic Payments / Platform Subscription / PAYG integration

SPEC-322 credit decisions are persisted with existing `worker_jobs`, transactional outbox and invocation/attempt lineage before Queue publish; a Rust Executor does NOT hold financial authority or deduct credits directly outside the canonical SPEC-207 service. Executor reports provider-verified units, reserve-extension requests, cancellation/partial billable consumption and `OUTCOME_UNKNOWN`. Queue retry/cold restart/reclaimed lease cannot duplicate charges or grants. Concurrent jobs share one class-based credit-line headroom and mandate limits. Independently run long jobs; the actual payment card charge can be batched or periodic, never require a full browser.

## R1.0 — Central job authority with external Mini App data planes
Hosted/BYOC/self-hosted Mini Apps submit paid tasks to canonical Core `worker_jobs` with verified appId/tenantId/payer/deployment and idempotency keys. Executors access app-owned data using scoped app credentials/short-lived grants, **never** master Core PostgreSQL or another app's database. An app-local private queue MAY support its implementation details but is not a parallel authority for Core-billed jobs; reconcile external job receipt and canonical settlement. Changing App host or DB does not change job identity.


## R1.1 — Owner-directed autonomous bootstrap and priority order (2026-11-01)

**Normative owner directive:** ALL development of the new SmartSIHub platform SHALL be initiated, orchestrated, observed and accepted through the *currently running* `https://smartaihub.app` Autonomous Implements / Autonomous Mini App Creator facilities, using their existing SPEC-224 Job/Run, Runner, Workspace, Harness and deployment authorities. `smartaihub.app` is the **temporary development control plane**, not the new SaaS Core implementation or the new production domain. This rule applies to source changes, builds, tests, release requests, UAT and repair work; executors may run CLI internally as delegated tools. An emergency out-of-band repair is permitted ONLY when the old UI/control path is nonfunctional; reconcile its exact SHA/Run/receipts back into the canonical record as soon as recovery permits. Never claim that a task was executed through the UI unless actual Run evidence confirms it.

The priority order is fixed for planning: **P0 legacy autonomous-system repair/proof → P1 fresh lightweight Core/Shell → P2 Chat → P3 Autonomous Mini App Creator → P4 new Autonomous Implements → P5 selective autonomy handover → P6 Public Portfolio/Marketplace → P7 other modules**. Thin dependencies (login, job contracts, SDK, billing read-only, public designs) MAY be built in parallel; this is an execution priority, not a global blocking gate. No new Core/Mini App is allowed to write business data into canonical `smartspec` other than the existing narrowly registered Legacy module data exception under SPEC-323.

The development loop SHALL be: **Goal entered on old website → durable Run and owned Debian workspace → implement/test/build → real `aimarkethubs.com` UAT → scoped `smartsihub.com` Cloudflare beta when appropriate → user feedback → automatic child repair/continue**. A defect in the existing control plane becomes an **in-scope bootstrap repair task** for the affected operation, not a reason to abandon the migration or create another approval system. Preserve task identity, source SHA, logs and work artifacts through restart/disconnect; no silent success claims. The new autonomous implementer becomes the primary authority only after it has completed real development tasks and recovery/rollback tests; user-visible traffic switches selectively, with the old tool retained as fallback until stable. See SPEC-324 and [roadmap](../../../docs/smartsihub-r1.4/ROADMAP-AUTONOMOUS-IMPLEMENTATION.md).

Existing `smartaihub.app` canonical job control plane performs P0–P4 development work and observes Runs/children. The new Rust/TS job substrate must be verified with real background tasks spawned by the old autonomous tool, especially process death, reconnect, persisted progress, resume and non-duplicated settlement. A failed Run triggers a scoped repair/retry child with identical stable Goal and an auditable attempt, not a new parallel worker_jobs ledger. P5 handover requires no lost/duplicate jobs.


## R1.2 — Browser Jobs use durable Job authority, not immortal browser processes

Browser activity is an `worker_jobs`-backed asynchronous job. Browser sessions are leased ephemeral resources; timeout, provider restart, or user closing the Chat must not erase admitted job state. Use resume checkpoint with permitted idempotent steps, or return `NEEDS_HUMAN_REVIEW`/`OUTCOME_UNKNOWN` where an external side effect cannot safely be retried. Bookkeeping, credit reservation and settlement stay SPEC-207/280/318 authority; screenshot/trace/artifact pointers follow the artifact registry. Avoid retrying purchases, form submission or other irreversible browser actions blindly. Browser credentials must be per-tenant scoped and not carried into public chat artifacts.

---

## R1.3 — Durable Computer Use execution integration (additive)

Computer Use is a primary **long-running job type**, not a browser tab effect. Reuse SPEC-208 action/capability routing and SPEC-197 Runner while SPEC-318 owns durable execution contract for the new platform. Each browser/desktop action belongs to canonical `worker_jobs` `jobId` and `attemptId`; no second GUI/Browser job ledger.

- Preserve the Job through browser process crash, provider limits, offline human UI, temporary runner disconnection and executor restart, with bounded checkpoints and lease fencing. A browser session may be recreated; its cookies may not be silently transferred cross-engine.
- A durable action intent is not proof an external action happened. Retry only when idempotent or independently reconciled; financial and destructive ambiguous outcomes are `OUTCOME_UNKNOWN` pending reconciliation.
- Browser/desktop processes run outside the Hono worker bundle. Concurrency/fair-share limits are per tenant and per executor class; browser minutes and resource budgets are tracked separately from credits settled by canonical SPEC-207.
- Recovery must not leave multiple supervisors acting on one desktop session or one browser side effect after a lease expires; action epoch/fencing and recipient confirmation are mandatory.
- Clef may help select among **authorized** routes, but cannot admit jobs, extend leases, authorize spending, or settle credits.

See `docs/architecture/COMPUTER-USE-CLEF-BROWSER-ROUTING-ADR.md` and existing frozen SPEC-208 Rev 9.

---

## R1.4 — Cross-SPEC owner reconciliation and execution contract (2026-11-01)

> **Historical R1.4 provenance:** retained as the 2026-11-01 proposal record. For conflicting current requirements, R1.5 controls; see [R1.5 owner-decision precedence](../../../docs/architecture/R1.5-OWNER-DECISION-PRECEDENCE.md).

> **Historical R1.4 cross-spec review (2026-11-01):** This was the controlling addendum for the R1.4 proposal. It remains historical provenance; current conflicts follow R1.5 and the [R1.5 owner-decision register](../../../docs/architecture/R1.5-OWNER-DECISION-PRECEDENCE.md). Earlier sections remain for context and are not deployment or implementation evidence.


### R1.4 shared invariants (normative)

1. **Identity and domains.** `smartsihub.com` is the confirmed Cloudflare **production** hostname; `aimarkethubs.com` is the Debian-first new-platform development + real-human UAT; `smartaihub.app` is the still-running legacy system AND the sole initial user-facing development-command center, to be retired as a controller only after proven selective handover. Hostname, `NODE_ENV`, public link or site labels MUST NOT be used as substitute for verified runtime target, role or payment authority.
2. **No parallel financial or job authority.** PostgreSQL `smartspec` continues to own canonical identity, tenancy, wallet/credits, subscriptions, marketplace/app IDs, and `worker_jobs`; registered **legacy-migrated data** may stay there. New stateful Mini App business data MUST use an app-specific store outside Core; stateless Apps need none. Rust, TypeScript, Mini App, Browser and external Agent MUST access central financial/job effects through the versioned authorized contracts, not invent private settlement or job ledgers.
3. **Technical baseline.** Fresh minimal **TypeScript/Hono Core Workers**, **React/TypeScript fixed shell + optional OpenUI interactive renderers**, **Astro public marketplace** built from scratch, **Rust-native long-running supervisor** and TypeScript Queue transports. Never convert/copy the legacy server wholesale or require Rust/Wasm in every Core API. Optimize JS/asset/bundle size and queries using measurements, without blocking unrelated UAT on advisory targets.
4. **User-centric autonomy.** P0 repairs and exercises existing `smartaihub.app` Autonomous Implements / Creator; P1 new Core; P2 Chat; P3 Mini App Creator; P4 new Autonomous Implements; P5 selected authority handover; P6 portfolio/public marketplace; P7 remaining modules. Priorities allow parallel safe preparation, never global step-by-step approval loops. Scope only actual unauthorized data/finance, wrong-target deployments, unsafe effects or unavailable nondelegable authority.
5. **Chat-first, always-on when truly hosted.** Human Chat is the front door; direct HTTPS/MCP enables Agent use without UI. Dynamic inline diagrams/interactive forms/OpenUI and artifact/browser side-panels render one canonical action/run identity. `worker_jobs` persists independently of user browser sessions, but **do not claim cloud 24/7 persistence** for a job whose only authorized executor is an offline user device.
6. **Browser and Computer Use.** SPEC-208 remains authoritative: deterministic eligible-route policy then optional Clef bounded decision; direct API/MCP first, Chromium/Playwright dependable pilot, **Moli explicitly unqualified for production pending isolation/security evidence**, Kitesurf only supported beta profiles, Windows/Linux desktop via approved Runner. Browser snapshots/session state are not durable Job authority. WebMCP browser tools are optional early-preview projections, not a headless server API or permission escalator.
7. **Economic and commercial identity.** 1 USD = 10,000 **new** credits; preserve old purchased/earned value by atomic denomination-versioned x10 migration for old units, avoid historical ledger rewrite and mixed unit writers. Only four revenue roles (Platform, Tenant Infra, Mini App, Skill) credit verified owner user wallets. One-time referral bonus is Platform-funded, not a fifth share. SmartSIHub **platform** subscription (monthly credits) is distinct from Mini App subscription (only new **exclusive** in-app Skills included); all shared/external Skills charged per distinct invocation. Pay-as-you-go reserve/actual settle/unused release and per-class overdraft default **zero** unless authorized. Users must have a SmartSIHub account; paid platform subscription is not universally mandatory.
8. **Cross-provider portability and idempotency.** Core remains PostgreSQL; independent new Mini Apps use app-owned **D1** / independent PostgreSQL or self-hosted storage under **BYOC** or managed deployment. **Idempotency** is required for job admission, shared Skill usage, credit reservation/settlement, subscription grants, referral bonuses and replayed webhooks; this is a business-effect invariant rather than a new global approval gate.
9. **Visual product contract.** Include Light, Dark, and Balance theme tokens and three **reference** mockups. Public Website link appears when available; Admin/Back Office is capability-gated and hidden for ordinary users. These concept pictures are non-executable, illustrative screens: never fake percentages, status or receipts as real run telemetry. No generated UI may invent a valid payment, deploy, DB or browser action without typed server-side registration and authorization.

### SPEC-318 targeted closure

**Reliability profile:** Admit into canonical PostgreSQL transaction with stable `jobId` and outbox; dispatch may be duplicated or delayed; retries need lease epoch/fencing, checkpoint and idempotency. Queue ACK is transport-only, not Job completion; reconcile after dropped publish/ACK/expired leases. A job may be `WAITING_FOR_EXECUTOR` if only a disconnected local Runner exists; "always-on" promises require verified cloud/Debian-independent approved capacity. Never claim exactly-once execution of external side effects; support `OUTCOME_UNKNOWN`, compensations, provider lookup and no duplicate financial settlement.

---

## R1.5 — Cloudflare durable Agent first; device Executor on demand (2026-11-02)

Replace the R1.4 Rust-native-supervisor-first default for new-platform cloud Agent continuity with Cloudflare Agents SDK on Durable Objects for durable Agent identity/state and event wakeups, Workflows for recoverable multi-step work, Queues for asynchronous delivery, and Alarms/Schedules/Cron for future wakeups. These are event-driven services: a DO/Agent may hibernate or be evicted; an in-flight callback, timer or model process is not guaranteed to remain resident. Use Workflow checkpoints/retries and canonical durable job/outbox state for work that must recover.

The established worker_jobs plus transactional outbox, lease, attempt fencing, deduplication, idempotency and settlement contract remains the job authority. A Durable Object, Queue, Workflow, Runner or device-local journal is not a second job ledger or payment authority. Rust/native code and approved Cloudflare Containers remain workload-specific executors for capabilities Cloudflare Workers cannot safely or efficiently provide; neither is a universal cloud-Agent prerequisite.

An enrolled powered-on Windows/Linux device runs a small Core Connector service from OS boot through shutdown, before user login where supported. The workload-specific Executor starts only for an authorized job under a bounded OS permission boundary. Headless tasks may run without an interactive session only when the grant allows them; GUI work on a locked, logged-out, sleeping or offline device reports WAITING_FOR_INTERACTIVE_SESSION or WAITING_FOR_EXECUTOR and does not bypass the boundary. Closing the browser or Companion leaves the durable job intact. Define deployed-preview acceptance for browser closure, DO hibernation/deploy, reboot-before-login, network loss, token renewal, lock/sleep and revoke. See SPEC-325 and the two Runner ADRs.

Presence is a short-lived server observation, not a sticky online flag. Model boot, authenticating, core-only, headless-ready, interactive-ready, executing, sleeping, reconnecting, update-required, paused, quarantined, revoked and shutdown distinctly. The Connector reconnects with bounded exponential backoff, jitter, fresh device proof and epoch checks, then reconciles cursor/lease state from canonical job authority; it never replays an unacknowledged OS effect blindly. Windows Session 0 and Linux user-session/Wayland limits are explicit, and locked or absent GUI sessions wait rather than bypassing OS controls.
