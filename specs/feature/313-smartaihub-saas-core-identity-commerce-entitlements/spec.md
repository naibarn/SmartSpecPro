---
spec_id: 313
semantic_id: smartaihub.modular-saas-core
revision: R1.5
date: 2026-11-02
status: PROPOSED_NOT_IMPLEMENTED
title: SmartAIHub Minimal SaaS Core — Identity, Tenancy, Entitlements and Canonical Commerce Integration
---

# SPEC-313 — Small Hono SaaS Core

> **Current-revision note (R1.5, 2026-11-02):** Earlier proposal text is retained for provenance. If R0.x–R1.4 identity, database, bootstrap, runtime, or always-on assertions conflict with the final R1.5 section or current owner-decision register, R1.5 controls.

## 0. Boundary

Build a NEW, **small**, Worker-native Hono + TypeScript SaaS Core in an independently buildable app (`apps/saas-core` in the proposed new platform repo) and `apps/saas-shell` UI. Do not port `apps/web` wholesale. Reimplement the Core domain/request/UI architecture from scratch against the existing database contract. Existing code is a behavior/schema reference; only small audited, Worker-safe pure primitives may be reused with source SHA provenance and regression tests. No Python/Node Container, Express server, or Debian application proxy is a runtime prerequisite of accepted ordinary Core APIs.

The Core **coordinates existing canonical authorities**. It SHALL NOT create a second identity store, wallet/ledger/settlement engine, job queue, deployment authority, secret store or portable app standard.

## 1. Functional domains

| Domain | Minimum responsibility | Canonical owner |
|---|---|---|
| Identity | account lookup, password verification compatibility, OAuth, MFA/TOTP/recovery, login/logout, email verification, reset, account state | Existing identity tables/contract |
| Session | separate per-host cookies, rotation, expiry, revocation, device/session history where existing | Existing session semantics |
| Tenancy | tenant resolution, verified domain binding, membership, scope and audit | Existing tenancy + SPEC-304 |
| Authorization | RBAC, policy evaluation, scoped grants, entitlement checks, anti-CSRF, protected actions | Current effective permissions |
| Wallet facade | balance, reserve, settle, cancel, refund, idempotency, transaction history | SPEC-207/legacy ledger until migrated |
| Commerce facade | purchase intents, provider webhook validation, top-up reconciliation, subscriptions, quotas | SPEC-207 + existing providers |
| Usage | canonical usage event and charge reference for modules | SPEC-280 |
| Module registry | module IDs, versions, capabilities, tenant/user installation and enablement | SPEC-261/304; SPEC-314 behavior |
| Entitlements | license, plan, tenant grant, user grant and invocation policy; server-side every request | Shared Core policy |
| Scoped access | service-to-service auth, per-module audience/permissions and revocation | Existing secret authority + SPEC-272 |

Core UI: login/account, tenant/role management, wallet/purchase, module catalog, module/user grants, minimal admin diagnostics. Public marketing/SEO, Chat, video, document parsing, social publishing, native runners and Mini App Creator are outside Core.

## 2. Data continuity

- Canonical database is existing PostgreSQL `smartspec`; preserve existing user IDs, password algorithm/hash + parameters, encrypted MFA secrets, tenant IDs, wallet balances/ledger, audit/job histories and OAuth ownership.
- Development `aimarkethubs.com` and Production `smartsihub.com` share identity, effective RBAC and entitlement logic. A developer's access is determined by actual role/tenant grants, not a watered-down mock development permission profile.
- Existing users log into BOTH domains separately (different domain-bound cookies, separate session IDs). Shared password/account state and revocation policy MUST work for both. No cross-site cookie tricks, no shared browser session assumption.
- No automatic schema migration, seed, double-writing ledger, or payment provider live call on request startup/cold start.
- Additive new tables only if SPEC-312 inventory proves no current equivalent. Record ownership, indexes, tenant columns, migration compatibility (old and new active together) and rollback via SPEC-295. Use a single schema authority; read-only schema audit precedes change.
- Authorization, ledger and mutable session/entitlement reads SHALL use transactional/consistent reads, not stale Hyperdrive query cache. Protect all records by tenant and principal.

## 3. Financial invariants

- SPEC-207 is authoritative for payer/funding source, authorization, credits reservation, ledger, settlement, refunds and reconciliation; SPEC-280 for usage metering, pricing and revenue sharing. Core exposes **facade APIs**, not a parallel financial ledger.
- Every financial mutation uses idempotency key + user/tenant/payer + source operation identity, durable reconciliation, transactional commits and auditable error receipts.
- For the same canonical `runId/jobId/attempt`, there MUST NOT be two independent charge authorities. Legacy and new Core MUST agree on transition ownership before any finance write cutover.
- Payment events require verified provider signature, duplicate notification tests, matching purchase state and observable reconciliation; UI success is not a paid invoice.
- Development uses **real business rules and same canonical financial contract**, not a mock wallet. Authorized test usage is clearly attributed/test-tagged, and irreversible outbound financial actions are explicitly scoped to avoid accidental duplicate charges.

## 4. Minimal API contracts (names are proposed, not existing routes)

- `GET /v1/core/me`, `POST /v1/core/auth/login`, `POST /v1/core/auth/logout`, `GET /v1/core/sessions`, `POST /v1/core/sessions/revoke`.
- `GET /v1/core/tenants/:tenantId/members`, `GET /v1/core/permissions/effective`.
- `GET /v1/core/wallet`, `POST /v1/core/wallet/reservations`, `POST /v1/core/wallet/settlements`, `POST /v1/core/wallet/refunds` via canonical authority.
- `GET /v1/core/modules`, `POST /v1/core/modules/:id/install`, `POST /v1/core/modules/:id/enable`, `POST /v1/core/modules/:id/grant`.
- API and error schemas MUST be versioned in small `@smartaihub/saas-contracts`. Validate per-request subject/tenant/module context, entitlement/version and spend ceiling. Secret tokens cannot enter browser bundles.

API spelling and `/trpc` adapter strategy MUST be decided from SPEC-312 route inventory; do not introduce duplicate endpoint authorities where current app contract can be preserved cleanly.

## 5. Workers-compatibility and size discipline

- Hono router, Fetch Request/Response, explicit bindings, small dependency closure and tested Worker runtime (`workerd` local + Cloudflare staging).
- No Node global process state, local filesystem, `child_process`, native image/video packages, hidden `apps/web` imports, or persistent in-memory payment/session authority.
- Introduce build size/CPU/DB-connection budgets from **measured** baseline; default to **warn and optimize** on non-safety budget overshoot. Never reject first live UAT of a usable Core because of a speculative bundle/latency target. Actual Worker platform hard limits still apply.
- Static SPA assets separate from Core API; cache only public immutable assets. Avoid warming always-on Containers. Minimize per-request multiple Worker hops, needless polling and database queries.

## 6. Deliverable slices and nonblocking verification

The ten `C` checks below are **test cases / evidence items**, not a ten-key approval gate before the first runnable Core. Implement and deploy the smallest usable Core flow as soon as it works and is scoped to approved human testers. Each failed check receives an issue and known limitation for the affected function; do not freeze unrelated API/UI implementation or unrelated beta features.

| Evidence | Demonstrated journey / expected proof | Outcome handling |
|---|---|---|
| C1 | independent clean build, no `apps/web` runtime/build import | architecture defect for affected module, repair iteratively |
| C2 | login, password/MFA/OAuth, account revocation on enabled auth flows | auth security flaw blocks only unsafe entrypoints; other work continues |
| C3 | tenant/member/permission denial tests | cross-tenant exposure = targeted hard stop |
| C4 | wallet funding/reserve/settle/refund with duplicate/race tests | financial mutation withheld if integrity unproven; browse/Core work continues |
| C5 | module install/grant/revoke by user/tenant | broken grants block affected module activation only |
| C6 | real authorized-user Debian browser UAT on `aimarkethubs.com` | expose as soon as the first journey exists |
| C7 | local `workerd` and focused Cloudflare binding/integration verification | remote runtime issue tracked to specific Worker/capability |
| C8 | source/release/cost/rollback receipt | concise operator evidence, not a global review board |
| C9 | no legacy backend proxy for claimed native Core API | if still proxying, label transitional, do not misclaim native |
| C10 | no stale writes/ledger drift across legacy and Core | affected financial/auth writer remains under existing authority |

**Minimum first Core beta:** verified domain/target, one authorized login/session/logout path, correct tenant scope, basic account/Shell navigation, real database read/write within a reviewed owner path, a reproducible build and rollback target. Wallet/payment can ship next as separately labeled slices if not yet ready; DO NOT fabricate a mock wallet or unlock unverified money-moving operations to satisfy a cosmetic 'all green' screen.

**Human UAT loop:** authorized developer logs in, exercises actual navigation and module enablement; report observed bugs and user feedback; Codex fixes and redeploys same targeted unit. 'Automated passed' is not final human acceptance. New Core API may first go live on `smartsihub.com` as restricted beta without all future Core features implemented, provided required enabled actions are safe.

## 7. Known risks / open decisions

Password/MFA algorithm compatibility, existing tRPC surface, full provider/payment configuration, schema drift and ledger writer ownership remain **unverified** until actual continuous discovery and test evidence. New domain application must not silently default to privileged tenant/admin. External email and payment provider integration requires endpoint/callback and actual delivery/readback evidence, not fake-success UI.

## 7A. Core authority ownership migration without a new financial subsystem

The existing database is shared and remains canonical. Integration paths may initially call existing authoritative services **only for declared transitional functionality**, but an accepted `WORKER_NATIVE` Core API is not allowed to secretly proxy to Debian. For credit operations, select exactly one writer owner per transaction before enabling live mutation. An adapter to an existing authority is permitted if labeled as a temporary dependency; do not force reimplementation of settled financial logic merely to release account/Shell beta. Record payment webhook endpoint/domain and eventual provider-callback switch separately. Never run destructive schema changes automatically.

## 7B. Early UX and developer autonomy

Use a modern responsive SaaS Shell with functional Login, Account, Tenant Switcher and Modules navigation. User-facing beta status is truthful; no empty dashboard presented as completion. Codex may choose implementation details/libraries inside the stated API, financial and tenant contracts; no arbitrary new sign-off point for design systems, route naming, UI polish or package size. Required third-party credentials are surfaced as exact operational blockers to that integration only, not to development of the whole Core.

## 8. Dependencies

SPEC-312 continuing inventory; SPEC-207, 280, 261, 272, 293, 295, 304, 315, 316. SPEC-224/278 for canonical jobs where applicable. SPEC-311 is NOT a precondition to *new-domain* Core acceptance.

## 9. R0.3 — Mandatory Core stack, rewrite boundary and database contract

### 9.1 Exact new-Core technology choices

- **Runtime/API:** TypeScript (ESM, strict mode) + Hono **4.x**, standard Fetch `Request`/`Response`, Cloudflare Workers/workerd; pin concrete dependency versions via lockfile. `apps/saas-core` is a **brand-new application**. No Express, Nest, tRPC server runtime, legacy Node app bootstrap, Python web backend or Go/Rust HTTP backend in the normal Core request path. If external integrations still consume tRPC, a tiny typed HTTP compatibility adapter MAY be maintained; this is not permission to import the old router.
- **UI:** React **19** + TypeScript + Vite **7**, static-first `apps/saas-shell` (SPA with lazy route/chunk loading). Tailwind CSS **4** + dependency-light accessible primitives are the default design-system implementation; import individual components instead of an entire legacy component library. No Next.js SSR server or framework hydration for ordinary account/admin screens without measured justification. Public Website remains a separate static-first deployable app.
- **DB:** PostgreSQL 15+ canonical `smartspec` with **`pg`/node-postgres** as the primary lightweight Worker-compatible driver, through scoped Hyperdrive on Cloudflare; pin an officially supported version (`pg >= 8.16.3` at this review) and compatible Worker flags/date. On Debian use the same typed SQL/repository adapters with a direct scoped PostgreSQL connection. Use parametrized SQL + small per-domain row mappers or selective Drizzle models **only if measured to simplify code without enlarging Worker imports**. No wholesale import of legacy `apps/web/drizzle/schema` and no auto-migration via runtime ORM.
- **Validation/API:** type-safe small `@smartaihub/saas-contracts` with targeted Zod schemas; validate only relevant inputs. OpenAPI descriptors MAY be generated offline, never a giant schema generator at Worker request startup. `packages/db-contracts` exports strictly per-domain table/view interfaces; it is NOT a duplicate database authority.
- **Identity security:** use vetted Worker-compatible password hash/MFA/crypto libraries compatible with existing stored hashes, pepper/key wrapping and revocation behavior. Do not downgrade password hashes, re-enroll existing accounts, skip MFA or replace cryptography with homemade algorithms to meet size goals. Security-sensitive operations may cost more CPU than regular read routes and are measured in a separate workload class.
- **Packages/build:** pnpm 10 and targeted Turborepo/Workspace builds, Wrangler bundled/minified Worker with dry-run size report. Pin workerd/Wrangler compatibility date and versions; verify on Debian's actual workerd and Cloudflare binding smoke. `NODE_ENV` does not grant data or deploy authority.

### 9.2 Explicitly NOT a legacy Core conversion

Write fresh `src/{app,identity,tenancy,authorization,entitlements,wallet-adapters,commerce-adapters,modules,db,config}` with domain-local imports. **Do not copy** existing server routers, Express middleware, global settings loaders, monolithic `drizzle/schema`, service container, public website assets or old admin page trees into Core. Investigate old logic as expected behavior/reference; implement focused equivalents against the existing schema. Reuse only individually reviewed, pure and Worker-portable functions with provenance and measured cost. The `Core` is not a bundle of all shared business services; Chat, LLM routing, files, media and background execution stay outside.

### 9.3 PostgreSQL schema is preserved, not converted

- Inventory exact current schema (tables, columns, PK/FK/unique/index constraints, enum, trigger, view, schema migration journal and known drift) using read-only catalog queries. Freeze a **compatibility fingerprint/contract**, not a database clone or forced cleanup.
- First Core slice reads/writes only existing verified authoritative entities and fields; preserve original primary keys, tenant isolation, password algorithm/hash/pepper, MFA material, session invalidation, wallet/ledger and existing job references. Any unidentified schema structure is an explicit scoped discovery task, **not** permission to invent a replacement table.
- No automatic DDL, seeding, renaming, dropping, mass backfill or key rehash. Default = `ZERO_DATABASE_MIGRATIONS`. If a new module-registry table genuinely has no equivalent, propose a backward-compatible additive table with necessary constraints and indexes, single existing migration authority and separately reviewed data owner. Never block unrelated Login/Shell implementation while this is pending.
- Both apps have shared canonical data but different origin-bound browser sessions. Historical records and object/R2 references remain in place. Test old/new application against the same actual DB with attributable authorized test rows and a single transaction/writer authority for money, account, entitlement and jobs.
- **Consistency:** Default to Hyperdrive **cache-disabled** binding for Core auth, sessions, permissions, wallet, balance and read-after-write; optionally use a distinct cache-enabled binding for genuinely stale-tolerant catalog data later, after verifying the total connection budget. Hyperdrive does not invalidate its query cache after writes. No unsafe reliance on cache TTL for authorization.

### 9.4 Core performance engineering target profile (ADVISORY, measurable)

| Metric | Initial proposed target / method |
|---|---|
| Core Worker bundle | Aim **<= 2 MiB uncompressed**, stretch <= 1 MiB; capture `wrangler deploy --dry-run --outdir ...` Total Upload and gzip for every release |
| Core/Shell main route transfer | Aim **<= 200 KiB gzip initial JS** excluding lazy routes and **<= 50 KiB gzip CSS**; inspect browser network payload and route chunks |
| First Core Worker startup | Aim **<= 100 ms** when observable; Cloudflare enforced platform startup limit **1 s** (not a new app permission gate) |
| Isolate memory | Cloudflare platform limit **128 MB**; stream payloads, avoid full-file buffers and large global caches |
| Normal DB-backed read | Aim **<= 2 DB round trips** on simple `/me` or effective-permissions path after justified batching; record actual queries and execution plan |
| API latency | Measure p50/p95/p99 on Debian and Cloudflare separately; target p95 at least **20% better than an equivalent measured legacy route** where comparable; if not comparable establish baseline and improve iteratively |
| CPU | Track Worker CPU p50/p95 per endpoint class; lightweight Core operations target low single-digit ms where feasible, with cryptographic auth separately categorized |
| Build | Aim **<= 1.5 GiB peak RSS** for clean Core-only build, lower after optimization; record measured peak RSS and elapsed time; never run `apps/web` or Remotion build |

These are **engineering aspirations**, not claims about measured current performance and not global beta gates. Size/latency misses receive a profiler report, smallest dependency attribution and next optimization action. Real Cloudflare limits and scope-specific auth/data correctness remain enforced.

### 9.5 Acceptance evidence for one lean Core slice

Alongside a real authorized-user login/tenant journey, capture: current source SHA, confirmed no `apps/web` import, target-compatible Worker bundle size, no SQL schema mutation, actual PostgreSQL database identity, p95 CPU/wall and query count for exercised endpoints, browser first-route transfer, Core-only build RSS/time, and effective authorization across the two development domains. Do not claim performance gains without side-by-side measured results. Missing historical baseline does NOT postpone developing or deploying the first working slice.

## 10. R0.5 — Thin asynchronous job boundary

Core API exposes an independently deployable small `submit/status/cancel` facade over existing authoritative job contracts, using durable PostgreSQL job+outbox intake; it does NOT include Rust/Go native runtime, FFmpeg/Python/Agent harness execution, a Queue service instance, a new job ledger, or cross-module orchestration engine. Preserve tenant, capability, budget and ledger policy. An accepted HTTP request persists a job record first and returns a canonical ID; execution continues outside the request in SPEC-318. No `waitUntil`-only durable admission.


---

## R0.6 Addendum — UI-independent Core actions and Credit V2 (2026-11-01)

- Core services expose typed business Action API independently of any UI; UI, browser WebMCP, remote MCP and headless HTTPS share existing SPEC-256 capability identity and identical billing/job semantics. Core MUST NOT import Astro, React, shadcn or any browser-only WebMCP runtime.
- Credit unit policy `USD 1 = 10,000 credits` uses SPEC-321 and existing SPEC-207 ledger authority; old credits are worth 10 new credits at unchanged USD value. Core does not create new balance/ledger tables by default, and cannot interpret shared balances differently from Legacy writers.
- Core presents public commerce read-only listings, entitlements and a small price/quote surface through existing SPEC-280/303/304 authorities; content publishing and public SSR belong to SPEC-320.

## R0.7 — Subscription entitlement must not grant shared Skill access free of charge

Core commerce facade checks app ID + exclusive Skill provenance/ownership at every admitted action. Only an `APP_EXCLUSIVE_INCLUDED` action can bypass per-call subscriber debit; shared Skills must generate distinct metered invocation charge/reservation through existing SPEC-207 authority even for active subscribers. App-only parent Skills may invoke shared child Skills only through individually billed canonical calls. Do not create a second Skill Registry or Credit Ledger.

## R0.8 economy integration refinement

SaaS Core MUST expose read-only and action facades for existing wallet credit balance, owner-earned credit grants, transaction provenance and one-time promotional referral grants as defined by SPEC-321, without introducing a second ledger or independent revenue payout service. The only owner revenue slots are Platform/Tenant/Mini App/Skill; monetary withdrawals are **future, out of scope**. Do not conflate purchased credits, earned credits and bonus credits even when presented as one spendable user balance.


---

## R0.9 — Agentic Payments / Platform Subscription / PAYG integration

SaaS Core SHALL provide one canonical signed-in user identity usable by human and delegated Agents, platform subscription plan/period/grants distinct from Mini App subscription, and thin facade on SPEC-207 existing credit reserve, PAYG, user-class limits and payment intents. Identity registration is prerequisite to accessing Mini Apps; a **paid** Platform plan is optional unless a published offer restricts a tier. Build Hono actions and schema adapters fresh, not a conversion of Express, and never emit PSP credentials to Agents. Financial actions remain durable/idempotent across Debian and Cloudflare and respect shared PostgreSQL `smartspec` schema.

## R1.0 — Core DB is control plane, not a new Mini App data warehouse
`apps/saas-core` may read/write canonical identity, tenancy, installation, product listing, subscription, wallet, payment and jobs metadata using existing `smartspec` schema/authority. **New Mini App business records** (orders, customers, creator-specific documents, appointments, domain business tables etc.) MUST NOT be written into `smartspec` through Core, except explicitly inventoried migrated-legacy tables. Core exposes signed, narrowly scoped API actions for auth, entitlements, payments and job admission to hosted/BYOC/self-hosted Apps; **no app receives Core PostgreSQL credentials**. Cross-service calls must not duplicate core identity/financial ledger. SPEC-323 owns new App data-plane placement.


## R1.1 — Owner-directed autonomous bootstrap and priority order (2026-11-01)

**Normative owner directive:** ALL development of the new SmartSIHub platform SHALL be initiated, orchestrated, observed and accepted through the *currently running* `https://smartaihub.app` Autonomous Implements / Autonomous Mini App Creator facilities, using their existing SPEC-224 Job/Run, Runner, Workspace, Harness and deployment authorities. `smartaihub.app` is the **temporary development control plane**, not the new SaaS Core implementation or the new production domain. This rule applies to source changes, builds, tests, release requests, UAT and repair work; executors may run CLI internally as delegated tools. An emergency out-of-band repair is permitted ONLY when the old UI/control path is nonfunctional; reconcile its exact SHA/Run/receipts back into the canonical record as soon as recovery permits. Never claim that a task was executed through the UI unless actual Run evidence confirms it.

The priority order is fixed for planning: **P0 legacy autonomous-system repair/proof → P1 fresh lightweight Core/Shell → P2 Chat → P3 Autonomous Mini App Creator → P4 new Autonomous Implements → P5 selective autonomy handover → P6 Public Portfolio/Marketplace → P7 other modules**. Thin dependencies (login, job contracts, SDK, billing read-only, public designs) MAY be built in parallel; this is an execution priority, not a global blocking gate. No new Core/Mini App is allowed to write business data into canonical `smartspec` other than the existing narrowly registered Legacy module data exception under SPEC-323.

The development loop SHALL be: **Goal entered on old website → durable Run and owned Debian workspace → implement/test/build → real `aimarkethubs.com` UAT → scoped `smartsihub.com` Cloudflare beta when appropriate → user feedback → automatic child repair/continue**. A defect in the existing control plane becomes an **in-scope bootstrap repair task** for the affected operation, not a reason to abandon the migration or create another approval system. Preserve task identity, source SHA, logs and work artifacts through restart/disconnect; no silent success claims. The new autonomous implementer becomes the primary authority only after it has completed real development tasks and recovery/rollback tests; user-visible traffic switches selectively, with the old tool retained as fallback until stable. See SPEC-324 and [roadmap](../../../docs/smartsihub-r1.4/ROADMAP-AUTONOMOUS-IMPLEMENTATION.md).

Build P1 as the smallest fresh Worker-compatible Core/Shell vertical slice; identity/session, tenant role, existing `smartspec` control-plane reads, canonical job admission and minimal entitlement interface first. Chat and Creator consumers must not need a complete marketplace, all billing adapters or a rewritten job ledger to begin. Integrate canonical financial writers only after verifying unit compatibility; do not gate the rest of development on those slices.

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

### SPEC-313 targeted closure

**Core acceptance slice:** Implement new Identity/Session/Tenant, scoped Action Registry, Credits facade, `worker_jobs` admission, App/Subscription registry from existing `smartspec` contract. Authenticate before paid Mini App entry. Reuse current password/hash and revocation semantics (verified from live schema); do NOT create an alternative users table, simulated ledger, duplicate job writer or import `apps/web` server. The Core API must remain independently callable by headless Agents; UI does not own authorization.

---

## R1.5 — Principal, session and authority boundaries (2026-11-02)

The new platform SHALL distinguish human, tenant, agent, service, module/Mini App and device/Runner principals. Authentication of a human browser session never authenticates an Agent, Service Binding caller or device. Cloudflare Access may be an additional edge control; it is not the end-user identity system and Access context is not implicitly propagated across Service Bindings. Resolve tenant membership from verified server-side session or grant state, never from a request-supplied tenantId.

Provide passkey/WebAuthn-ready authentication, MFA and recovery, secure short-lived sessions, HttpOnly/Secure/SameSite cookie policy, CSRF defenses, per-session revocation and auditable step-up authentication for sensitive effects. Delegated grants bind actor, tenant, audience, capability, goal/run, budget, expiry and policy epoch. Agents cannot mint grants or widen scopes. Recheck revocation and current policy before resolving a credential and before an externally consequential action.

Each product environment has one canonical authority for its identity, entitlements, finance and job lifecycle. New production and development SHALL use isolated database identities, least-privilege DB roles and separate credentials from Legacy; do not assume the same PostgreSQL host, database credential or direct data access. Do not create a second ledger or job-settlement engine inside the new platform. If continuity with Legacy is required, use an explicit audited API/event bridge with a single writer and reconciliation; this mission changes no user or financial data. See SPEC-325 and the [R1.5 credential authority ADR](../../../docs/architecture/ZERO-TRUST-CREDENTIAL-AND-ACTION-AUTHORITY-ADR.md).

Device enrollment is distinct from browser login. Pairing is owner-initiated and tenant-bound; reconnect uses device-key proof-of-possession and a short-lived audience-bound session, independent of the human web cookie. A bounded Goal grant covers ordinary authorized work without repeated prompts. Membership, device, credential and policy-epoch revocation prevent future actions while preserving truthful offline and locked-session outcomes. See SPEC-325.
