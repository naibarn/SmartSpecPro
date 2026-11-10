---
spec_id: 317
semantic_id: smartaihub.progressive-modular-migration
revision: R1.6
date: 2026-11-10
status: PROPOSED_NOT_IMPLEMENTED
title: SmartAIHub Progressive Legacy-to-Module Copy, Isolation, Modernization and Per-Module Cutover
---

# SPEC-317 — Progressive Module Migration and Independent Legacy Retirement

> **Current-revision note (R1.6, 2026-11-10):** Earlier proposal text is retained for provenance. R1.6 controls the Chat-first front door and independently built package boundary. For other migration, deployment, runtime, database, and always-on conflicts, R1.5 and the current owner-decision register control.

## 0. Decision

Migration is a **series of small reversible module releases**. The original `apps/web` remains running on `smartaihub.app` while new sources are selectively copied into clean module packages, with dependency pruning, modern UI replacement where appropriate, actual Debian UAT and Cloudflare staging, then production availability. Core login/tenant/Shell minimum viable vertical slice SHALL be usable first; completion of all Core commerce/admin features is **not** a prerequisite for beginning independent module migration or human tests. “Partially migrated” does not mean feature removed or traffic blindly forwarded.

## 1. Nonblocking progress states and release states

`DISCOVERED -> COPIED -> RUNNABLE_DEBIAN -> DEPLOYED_BETA -> HUMAN_UAT -> FIXING -> STABLE -> LEGACY_RETIRE_READY -> LEGACY_RETIRED` is a **progress view**, not an approval engine. Work may loop between beta, feedback and fixes. A module may ship working read-only paths while write/payment integrations are still being completed; label those specific paths as pending. `SAFETY_HOLD_AFFECTED_ROUTE` is reserved for the narrowly demonstrated tenant/finance/data/secret/target hazards. `ROLLED_BACK` records what happened. SPEC-295/304 remain canonical owners of release and routing state; this SPEC never creates a second lifecycle authority.

## 2. Per-module procedure

1. **Discover:** source screens, routes, tRPC/contracts, background jobs, DB tables, storage keys, providers, tenant/auth and credit paths, current runtime and dependent callers. Link to SPEC-312 inventory with exact commit.
2. **Copy:** selected files only, record source path + SHA/digest; no legacy deletes. Keep copy commit distinct if review helps.
3. **Isolate:** remove Node/Express/server globals, `apps/web` imports, massive third-party SDK barrels, native rendering and other module imports; use Core SDK, direct R2 and versioned interfaces. Capture dependency and bundle diff.
4. **Modernize UI:** where existing UI is coupled/unmaintainable, build a modern accessible and responsive first-party UI, preserve functional flows, user information architecture and feature coverage. Shared Shell and UI primitives not full legacy page trees.
5. **Prove progressively:** first user journey + narrow auth/tenant/data smoke on Debian UAT, local workerd compatibility, then real Cloudflare binding probe for that module. Additional tests/metrics collect during beta and follow-up fixes; unfinished unrelated suites do not prevent real-user tests.
6. **Release early:** deploy only the module that has a usable/safe slice to `aimarkethubs.com`, then independently to restricted `smartsihub.com` beta when Cloudflare runtime checks pass; record exact source, version, Worker/asset deployment, known limitations, smoke tests and rollback.
7. **Route:** canonical app/route binding chooses old or new per allowed tenant/user/feature until accepted. Avoid implicit dual write; immutable user/jobs in-flight remain tied to recorded executor/version until final settlement.
8. **Retire:** stop legacy handler only after all relevant active uses, callbacks, scheduled tasks and old release dependencies are accounted for. Maintain rollback with schema compatibility and duplicate job/charge prevention. No bulk deletion.

## 3. Suggested waves — order is tentative as discovery continues

| Wave | Scope | Rationale / prerequisite |
|---|---|---|
| 0 | Core + new Shell (`SPEC-313`) | Central identity, wallet, tenant, module registry tested first |
| 1 | Public Website (static-first) + small read-only pilot | Lowest likely transactional coupling, proves independent build/route |
| 2 | Document Management / Library lightweight views (split heavy parsing) | Prove auth/R2/data references and per-module UI without GPU |
| 3 | Chat as a first-party Module | Streaming, model routing, billing/usage contracts, provider callback and reconnect proof |
| 4 | Mini App Creator | Creator/source/workspace/build/deploy control plane, SPEC-224/293 integration |
| 5 | Vertical Drama, Media Studio | Series/asset graph, provider costs, long-running jobs/render executors |
| 6 | Social Publish, Motion Studio, other modules | External publish authorization, scheduled actions, native render dependencies |
| 7 | Task Control/Mission UI and remaining coupled features | Existing jobs/runner/approval contracts, broad cross-module dependency |

**Actual wave order is informed by ongoing inventory and evolving dependency graph; no `G0 complete` milestone blocks the next small working module. Multiple independent modules MAY migrate in parallel if their write authority/routing is isolated.** Pilot must include one genuine authenticated Core-dependent module, not only an anonymous static webpage.

## 4. Per-module acceptance manifest

Living fields (fill as discovered, do not require the entire table before coding): `moduleId`, product/tenant scope, current legacy routes and source SHA, new source path/commit, all front/back/API/cron/jobs/procedures accounted, data table owners, financial writer/job executor, runtime class, actual dependency graph/bundle size, modern UI acceptance scope, tests (unit/contract/UAT/workerd/CF), current/desired release versions, routing source, backup/rollback, cost baseline and production observations. Unknown active behaviors affect only claims of FULL PARITY or `LEGACY_RETIRED`, **not** development or restricted production beta of verified capabilities.

## 5. Shared database safety while two applications run

- Maintain one canonical User/Wallet/Job identity. For an individual command, route to exactly one writer/executor. No unsafe shadow writes, no duplicate billing, no double provider call.
- Read from both old/new only when compatible and approved; mutation routing must have a durable owner/fence and idempotency.
- In-progress operations retain canonical job/executor ownership through release changes; release rollback does not blindly replay queued messages.
- Schema changes are backward compatible for existing legacy endpoints and already-deployed new Modules. Destructive schema/column migration waits until all consumers retired and data retention/export proven.
- Feature/permissions parity and entitlements are checked server-side for both old and new routes. Legacy redirect or proxy may be an explicit temporary transition for unported features; it is not evidence a module is Worker-native.

## 6. User-facing experience

Modules launched from a consistent Shell under platform routes (`/m/{moduleId}` illustrative). Existing deep links, bookmarks and custom-domain aliases use SPEC-304 compatibility. Avoid iframe for trusted first-party modules. Untrusted third-party source uses isolated origin/context. A disabled module remains installed but unavailable to unentitled users; this must not erase customer data or turn off platform identity/wallet infrastructure.

## 7. Defect handling and real-human testing

- Cross-module imports or frontend coupling: record a concrete isolation task. Fix before declaring that Module fully independent, but do not freeze other releases or prohibit partial UI UAT.
- Financial parity failure: disable the affected money-moving command; reconcile canonical ledger. Continue nonfinancial development and read-only user journeys.
- Cloudflare runtime mismatch: keep Debian developer URL working, repair only the affected Worker. Deploy a narrower beta slice if a safe path exists.
- Verified cross-tenant exposure, bypassed session revocation, unverified signed callback or repeated paid provider action: stop **that unsafe endpoint/module**, contain and fix before enabling it for testers.
- Legacy still used by active customers: preserve its route and data writer; there is no forced retirement just because the new module is live.
- A real authorized human UAT session SHALL be recorded for each meaningful feature: route/role, steps, observed success/failure, tester feedback, bug owner, fix commit and redeploy outcome. Automated tests are supporting tools, not a substitute for real users.
- No single open backlog item, missing noncritical feature, incomplete automated coverage or unrelated failed module test creates a program-wide `BLOCKED` state.

## 8. Evidence levels / definition of done

`BETA_AVAILABLE`: the selected working scope responds at a real URL for authorized testers, has correct tenant/auth boundaries, traceable build/target/rollback, and its known gaps are visible. No promise of all-feature parity.

`MODULE_STABLE`: implemented scoped business journeys have passed targeted tests, real-user UAT and operational observation, with financial/write authority reconciliation where applicable; module-only build/deploy/rollback is demonstrated.

`LEGACY_RETIRED`: complete active legacy route/job/callback/data ownership coverage for that module and compatible cutover/fallback proof. This is **never** a prerequisite to another Module's beta. Full legacy retirement remains separately governed under existing authorities.

## 9. R0.3 — Distinguish fresh Core rewrite from selective module copies

**Core is NEW implementation:** never carry the legacy monolith API/UI/dependency architecture into `apps/saas-core`; use fresh lightweight code against the exact existing DB contract (SPEC-313). **Modules use selective migration:** per source provenance copy only the business logic or UI elements that are still useful, then remove imports, refactor toward Worker compatibility, lazy-load heavy UI and rewrite screens where better. No obligation to convert old Express/tRPC/Remotion code or preserve legacy technology decisions when customer-facing behavior and existing data contracts can be retained.

For each module record old and new measurable dependency closures: uncompressed/gzip Worker bundle, route-initial gzip JS/CSS, peak build RSS/time, p50/p95 API, CPU, SQL query count, actual Cloudflare requests and paid-resource profile. Compare user journeys, not line count. A failed advisory size/latency target creates a scoped optimization issue; Cloudflare real limits and data/security correctness constrain the affected route only. `smartsihub.com` remains the confirmed production domain; `aimarkethubs.com` is the Debian-first production-equivalent development site.

## 10. R0.5 — Long-running migration safety

Before migrating a job type, identify all legacy producers, consumers, retry paths, provider side effects, job ownership and checkpoint storage. A new Rust supervisor/executor is an additional adapter, never a parallel unauthorized executor of the same outstanding job. Default to pinning in-flight jobs to their current compatible executor until completion or an explicit fenced handoff; do not drain all Legacy work or delete Queue data as a prerequisite to shipping unrelated UI or API slices. Human UAT should begin with a real background job and visible progress/cancel/restart recovery; record issue-by-issue gaps instead of stopping module delivery for unrelated job classes. See SPEC-318.


---

## R0.6 Addendum — Public website rewrite and portfolio migration (2026-11-01)

- **Exception to selective-copy rule:** the public website is a complete greenfield Astro implementation per SPEC-320. Study legacy SPEC-263/content/SEO and preserve URLs/redirects where relevant, but DO NOT copy the legacy app frontend stack or CSS into public website.
- New Mini App and Skill owner profiles are published through canonical App/Asset identity with explicit permission. Agent marketplace remains optional secondary discovery; Mini App commerce and creator portfolio are priority.


---

## R0.9 — Agentic Payments / Platform Subscription / PAYG integration

During progressive migration, retain verified legacy Beam/PromptPay/credit writers and reuse existing SPEC-207 payment/ledger authority. New App/Core Agent charge flow, Platform subscription and optional PAYG can go live feature by feature after narrow financial correctness tests. Avoid full financial big-bang conversion, preserve 10x credit-unit compatibility across old/new; no fake claim that unsupported third-party ACP/AP2/x402 adapters have been activated.

## R1.0 — Legacy-DB exception vs greenfield Mini App rules
Migration must inventory the **actual pre-existing Legacy-owned tables** in `smartspec` and bind them to canonical App/module IDs in a Legacy Shared-DB Exception registry. Only these explicitly inherited business records may remain in the Core PostgreSQL; they are not a model to follow when creating NEW Mini Apps. A legacy App may later opt to move its business data into an app-owned D1 or PostgreSQL with controlled export, dual-runtime compatibility and verified cutover; do not force a legacy move before useful beta. New Mini Apps start with independent data contracts and storage from day one; no “temporary add tables to Core” shortcut.


## R1.1 — Owner-directed autonomous bootstrap and priority order (2026-11-01)

**Normative owner directive:** ALL development of the new SmartSIHub platform SHALL be initiated, orchestrated, observed and accepted through the *currently running* `https://smartaihub.app` Autonomous Implements / Autonomous Mini App Creator facilities, using their existing SPEC-224 Job/Run, Runner, Workspace, Harness and deployment authorities. `smartaihub.app` is the **temporary development control plane**, not the new SaaS Core implementation or the new production domain. This rule applies to source changes, builds, tests, release requests, UAT and repair work; executors may run CLI internally as delegated tools. An emergency out-of-band repair is permitted ONLY when the old UI/control path is nonfunctional; reconcile its exact SHA/Run/receipts back into the canonical record as soon as recovery permits. Never claim that a task was executed through the UI unless actual Run evidence confirms it.

The priority order is fixed for planning: **P0 legacy autonomous-system repair/proof → P1 fresh lightweight Core/Shell → P2 Chat → P3 Autonomous Mini App Creator → P4 new Autonomous Implements → P5 selective autonomy handover → P6 Public Portfolio/Marketplace → P7 other modules**. Thin dependencies (login, job contracts, SDK, billing read-only, public designs) MAY be built in parallel; this is an execution priority, not a global blocking gate. No new Core/Mini App is allowed to write business data into canonical `smartspec` other than the existing narrowly registered Legacy module data exception under SPEC-323.

The development loop SHALL be: **Goal entered on old website → durable Run and owned Debian workspace → implement/test/build → real `aimarkethubs.com` UAT → scoped `smartsihub.com` Cloudflare beta when appropriate → user feedback → automatic child repair/continue**. A defect in the existing control plane becomes an **in-scope bootstrap repair task** for the affected operation, not a reason to abandon the migration or create another approval system. Preserve task identity, source SHA, logs and work artifacts through restart/disconnect; no silent success claims. The new autonomous implementer becomes the primary authority only after it has completed real development tasks and recovery/rollback tests; user-visible traffic switches selectively, with the old tool retained as fallback until stable. See SPEC-324 and [roadmap](../../../docs/smartsihub-r1.4/ROADMAP-AUTONOMOUS-IMPLEMENTATION.md).

**Overrides the tentative waves in §3 for this owner program.** The order is P1 Core, **P2 Chat**, **P3 Mini App Creator**, **P4 Autonomous Implements**, **P5 selective handover**, then Public Portfolio/Marketplace and other modules. Public page design may proceed concurrently but does not overtake the first functional Chat/Creator migrations. Existing Autonomous Implements and Autonomous Creator on `smartaihub.app` remain the tools that actually perform the migration. Never retire or redirect their routes before replacement acceptance; per-feature rollback is mandatory.


## R1.2 — First Chat migration includes interactive response and browser pilot

When migrating Chat first, implement basic durable text/streaming and tools, then in parallel add at least one inline structured code/diagram/choice render block, one persistent Artifact Panel and one Chromium/Playwright Browser Pilot through an authorized browser-provider adapter. Do not require every rich renderer or Moli compatibility target before the first user-visible Chat UAT. Mini App Creator remains second migration; it should reuse the same artifact preview, code diff and browser testing surface, never clone a separate chat renderer. See SPEC-319.

---

## R1.3 — Progressive Computer Use migration

During Chat migration, demonstrate a headless job that continues when the user closes the client, with final summary and artifact, before implementing elaborate Browser Live View. Mini App Creator reuses browser verification artifacts. Desktop Computer Use migration follows existing SPEC-208 and the current approved Runner devices. Start Chromium/Playwright as observed compatible route; measure optional Kitesurf and evaluate Moli security before production. A blocked optional provider does not stop independently working Modules. See Computer Use/Clef ADR.

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

### SPEC-317 targeted closure

**Ordering correction:** The first moved user-facing module is Chat, second Mini App Creator. After Creator is working, new Autonomous Implements becomes the next authority candidate, then selective Goal-by-Goal handover. Public/Portfolio design can progress in parallel but not replace Chat/Creator as the migration pilot. Every legacy module chooses copy/isolate, rebuild from behavior, keep legacy pending, or retire with explicit owner decision; *Core and public site are intentional fresh rewrites*, not conversions.

---

## R1.5 — Selective reuse without Legacy runtime dependency (2026-11-02)

Migrate capabilities by bounded module, not by converting the whole Legacy application. Existing code, schemas, screens and UI assets are references only. Each new or reused module must document owner/provenance, permitted source inputs, data authority, capability manifest, tenant boundary, secret placement, target-specific release and rollback before enabling its route. No Legacy server import, worker process or shared all-powerful credential may become a hidden dependency of ordinary Cloudflare Core or Chat paths.

A module may be developed and accepted while unrelated Legacy repair or migration continues. Existing smartaihub.app remains available to Legacy users; it is an optional development command surface when the particular Goal path is proven. New-platform authority handover is per Goal and single-owner: observe, transfer at a durable checkpoint, verify and retain rollback evidence without dual dispatch. Security acceptance is specific to each migrated route. See SPEC-325 for the common isolation and prompt-injection controls.

An existing Runner installation or pairing is a reference/integration candidate, not automatically trusted by the new product. Do not copy Legacy device keys, bearer tokens, local grants or browser sessions. Re-enrollment uses the SPEC-325 device trust flow and the new environment key hierarchy.

## R1.6 — Chat front door and independently built product modules (2026-11-10)

The new authenticated SaaS experience SHALL open directly to the new Chat workspace. After login, `/` SHALL resolve to `/chat`; the new application SHALL NOT expose or reuse the Legacy dashboard as its home screen. A request to `/dashboard` within the new application resolves to `/chat`. This route behavior applies only to the new Modular application; it does not authorize changing the currently serving `aimarkethubs.com` application before its replacement is healthy and a handover is intentional.

Build the new experience from small first-party packages: `apps/saas-core` is the Hono API Worker; `apps/saas-shell` is the account/navigation React SPA; `modules/chat` is a separately versioned Chat module with independently built assets and its own API Worker only where needed; shared packages contain only small versioned contracts/SDK primitives. Each deployable app/module SHALL have a package-filtered build command, its own build output, manifest, size record and deploy/rollback scope. A change to Chat SHALL NOT build or restart Core, Shell, Legacy `apps/web`, or another module. The root SHALL NOT provide a default aggregate build that bundles every application/module; build selection is explicit, such as `pnpm --filter @smartaihub/chat build` or the corresponding named script.

The Shell resolves first-party modules using versioned manifests and content-hashed assets. It lazy-loads the Chat route from the Chat artifact and keeps module API calls on their scoped Worker routes. No first-party module imports another module's implementation, Legacy runtime source, Express, or a broad shared database schema. Preserve the existing PostgreSQL `smartspec` identity and data authorities; re-use existing Chat records only after verifying their live schema and writer/tenant contract. Do not create a second user/session authority or a new Chat data schema in the shared Core database as a shortcut.

`aimarkethubs.com` remains the Debian development/UAT target, and `smartsihub.com` remains the separate future Cloudflare production target. Login success on the new dev application SHALL be tested with a pre-existing canonical account; do not create or reset the requested existing account as part of front-door work.
