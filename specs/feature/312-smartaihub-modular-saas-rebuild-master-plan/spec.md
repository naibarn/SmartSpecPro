---
spec_id: 312
semantic_id: smartaihub.modular-saas-rebuild-program
title: SmartAIHub Modular SaaS Rebuild Master Program & Full-System Inventory
revision: R1.7
date: 2026-11-11
status: PROPOSED_NOT_IMPLEMENTED
scope: Architecture, census, module allocation, migration ordering, acceptance governance
---

# SPEC-312 — Modular SaaS Rebuild: Master Program and Complete Inventory

> **Current-revision note (R1.7, 2026-11-11):** Earlier R0.x–R1.6 proposal text is retained for provenance. R1.7 controls default personal Chat workspace behavior; R1.6 controls shared database, environment and development-path boundaries. The [current owner-decision register](../../../docs/architecture/R1.5-OWNER-DECISION-PRECEDENCE.md) controls unrelated conflicts.

## 0. Owner decision

SmartAIHub SHALL be re-architected as a small SaaS Core plus independently built, deployed and rolled-back first-party modules, while the original `apps/web` continues to run on Debian. Every module is copied selectively from the legacy source into a clean destination folder, dependencies slimmed, UI modernized where beneficial, tests added, and modules made available in scoped beta as soon as a usable slice exists. Slower individual delivery is acceptable; a one-shot rewrite/cutover is NOT.

**Goals:** reduce build RAM/time, bundle size, deployment blast radius, runtime overhead, accidental restarts and Cloudflare cost; preserve existing users, tenant IDs, canonical data, application functions and accepted business behavior. The programme SHALL begin inventory and Core-boundary discovery immediately, **in parallel with bounded implementation of demonstrably owned slices**; inventory completion is not permission to postpone coding, previews, or human UAT. Spec 312 is program governance, **not** a second deployment/job/payment authority.

## 1. Non-negotiable invariants

- `smartaihub.app`: existing Debian legacy / development surface. Do not interrupt real users still using it.
- `aimarkethubs.com`: Debian-based new modular development and authorized-user UAT. Same features and effective role/entitlement semantics as production for the same authorized principal.
- `smartsihub.com`: **confirmed canonical NEW production domain**, Cloudflare Workers/Hono; activate the Core/slices progressively for controlled real-user beta and expand as evidence improves. Domain is final for this program, not a provisional placeholder.
- PostgreSQL `smartspec` remains the canonical **Core control-plane** database for identity, tenants, canonical credit ledger, `worker_jobs`, product registry, App installs and subscriptions. **New Mini App business data MUST NOT be stored there.** The only business-data exception is an explicitly registered Mini App/module migrated from Legacy that already owns tables there. See SPEC-323; never clone identity, credit ledger or job authority.
- A different host or `NODE_ENV` label does not itself elevate or reduce a user's entitlements.
- New module code MUST NOT import the executable legacy `apps/web` server/client runtime or another module's implementation.
- Each first-party deployment unit MUST build, package, activate and roll back without rebuilding/restarting unrelated units.
- Specs 207/224/261/267/272/273/280/293/295/304/311 remain authoritative in their original scope; reconcile conflicts explicitly, do not overwrite history.
- No automatic Cloudflare recreation based on decommissioned resource IDs, no unapproved domain cutover, no deletion of legacy features to fake progress.

## 2. Continuous discovery (starts immediately; does not postpone first Core code)

Inventory the full **active**, not merely sample, system:

1. Repository and build: root/workspace package graph, scripts, files and sizes, used dependencies, dynamic imports, assets, native modules, CI workflow triggers/cost and current source SHA.
2. HTTP/HTTP-RPC: every method/path/router, tRPC procedure and batch usage, auth policy, cookies, session bootstrap, OAuth callback, tenant resolution, SSE/WebSocket, webhook and third-party ingress.
3. UI: navigation/page IDs, screen to API mapping, global stores, reusable UI components, feature flags, lazy loading, public SEO/CMS and brand assets.
4. Data: all active PostgreSQL tables/views/triggers/functions, migration history and drift, tenant/data ownership, shared identity/credentials, wallet/ledger write paths, existing `worker_jobs`, canonical outbox and job lease states.
5. Work: background jobs, schedulers, media renderers, Python/native executors, external providers, R2/Vectorize data references, side effects, failure/recovery routes.
6. Runtime: current systemd names, ports, tunnels, DNS/host aliases, `APP_URL`/`PUBLIC_URL` settings, `smartaihub.app` and `aimarkethubs.com` actual use, saved Admin configuration, active production/non-production permissions.
7. Provider resource status: use latest receipts and live readback; previously decommissioned Cloudflare migration Workers/Containers/Queues/Hyperdrive are NOT live resources.
8. Security & cost: authorization scope, tenant limits, privileged operations, auth writes, payment/webhook side effects, memory/CPU baseline, DB connections, storage/egress and fixed-cost resources.

For each item produce `module-inventory.csv` (stable ID), plus a human-readable mapping with ownership, dependency evidence, proposed target and acceptance evidence. Every identified active item MUST end with one allocation: `SAAS_CORE`, `PUBLIC_APP`, `FIRST_PARTY_MODULE`, `SHARED_CONTRACT`, `SPECIALIZED_EXECUTOR`, or `LEGACY_ONLY_PENDING_DECISION`. Unknown ownership is labeled `UNKNOWN_OWNER` and scoped to the affected capability; it does **not** freeze unrelated implementation or beta release. An unproven write path must not be enabled for real financial/privileged mutations until its owner is established.

## 3. Core selection test

A capability belongs in Core only if: (a) it applies to most/all modules as platform authority; (b) duplicating it compromises identity/tenant/financial correctness or module entitlement; or (c) it is needed to authenticate/authorize/measure module calls. Core includes identity/session, tenant/domain/membership, RBAC/policy, wallet authority adapters, purchase/payment reconciliation adapters, module registry, entitlement/licensing, usage accounting contract and scoped API credentials. `SPEC-207` owns financial logic; `SPEC-280` owns usage pricing/revenue. Chat/model selection, video and asset editors, application-specific CMS, specialized execution, social posting and document parsing MUST NOT be moved into Core merely for convenience.

Separate `Core Runtime` from `Shared Type/SDK Contract`. UI primitives are a separate optional package. No global import of legacy DB schema/runtime through a convenience barrel.

## 4. Module and app target inventory

Initial classification candidates — **revalidate in continuing source discovery (nonblocking)**: `public-website`, `chat`, `miniapp-creator`, `vertical-drama`, `media-studio`, `document-management`, `social-publish`, `motion-studio`, `task-control`, `library-rag`, `marketplace` and other discovered active features. Distinguish public website/application shell from sellable Mini App; infrastructure Core is not a toggleable customer Mini App. Detachable third-party/customer Mini Apps use separately governed repos, following SPEC-293/261.

## 5. Delivery policy — implement-first, deploy-early, human-verified (owner override of old gate ordering)

**A. Authoritative delivery rule.** The 2026-11-01 owner decision supersedes the **blocking sequence** previously described as G0–G6 in these new draft specs. Codex SHALL begin implementable Core slices while inventory proceeds. Audit, source provenance, dependency tracing, automated tests, budgets and readiness receipts are **work outputs and advisory status**, not prerequisites requiring a green global gate to start writing code, building, exposing a development URL, or beginning bounded human UAT. No percentage/coverage/10-review/completeness threshold may be invented as a condition to start implementation.

**B. The only automatic hard stops are narrowly scoped:** (i) credible cross-tenant/unauthorized disclosure or privilege escalation on the affected route; (ii) loss/corruption of canonical data or unbounded destructive DDL; (iii) duplicate/unauthorized charge, payment capture or irreversible external side effect; (iv) accidental deployment to a target different from the selected exact target or inability to authenticate scoped deployment identity; (v) missing non-delegable infrastructure credentials/authority; (vi) verified leak of secrets. Stop **only the affected action/route**, contain/revert, report the exact evidence and keep unaffected development moving. Failed noncritical tests, UI defects, incomplete inventories, stale docs, cost-budget warnings and unrelated module failures are `KNOWN_GAP`, not `BLOCKED_ALL`.

**C. Three independently observable lanes:**

- `DEV_BUILD_AND_UAT`: Debian `aimarkethubs.com`, independently deploy partial working features with authorized real developers; incomplete features may be visibly tagged `BETA` / `IN_PROGRESS` without inventing a success state.
- `CLOUDFLARE_BETA`: after the minimum deployable slice is built, use a **new scoped Worker**, current bindings, auth/tenant isolation, payment/ledger safety, and a rollback version. Deploy early and invite authorized human testers; do not require full-system inventory, full route parity, 24h soak or all Modules completed as a generic prerequisite for this beta.
- `PRODUCTION_GENERAL_AVAILABILITY`: `smartsihub.com` remains the production hostname even during restricted beta. Broaden audience per feature with recorded defects, user feedback and operational observation. Legacy full retirement is independent and later.

**D. Release controller behavior:** new-domain beta/production launch within the owner's delegated release scope may proceed from an exact committed revision via direct Wrangler after targeted checks and scoped authentication. No repeated owner pop-ups for every Build/Test/Dev Deploy or every approved beta iteration. Existing non-delegable provider permissions remain necessary. Status records are informational unless a *specific hard-stop condition above* is evidenced. Unrelated stale SPEC-311/295 global gates cannot be silently imported as new-domain beta blockers: write an additive cross-SPEC applicability decision identifying the independent new-platform scope; leave their legacy cutover safety contract intact.

**E. Human UAT:** expose a stable browser URL early. Each working slice has a named user journey, authorized human testers, feedback/issues, observed outcome and a follow-up fix/redeploy loop. Automated tests cannot replace actual human acceptance. Conversely human acceptance cannot waive tenant/financial integrity.

**F. Progress milestones (NOT serial approval gates):**

| Milestone | Shippable output | Can overlap? |
|---|---|---|
| M0 ongoing | living route/DB/dependency inventory, target mapping and risk list | YES — with M1/M2 |
| M1 | login/session + tenant-scoped Core API + Shell usable on Debian | YES — iterative partial releases |
| M2 | wallet entitlement integration and one real module, real human UAT | YES |
| M3 | first minimal Cloudflare Worker + approved bindings, live user beta on `smartsihub.com` | YES — do not wait for full migration |
| M4 | copy/slim/release modules independently, collect real-user feedback and fix | YES — each module |
| M5 | retire legacy feature only when that feature no longer needs it | per-module only |

**G. Release evidence and reversibility:** exact source SHA, selected target, scoped identities, smoke test of essential login/authorization, real HTTP response, Worker-version observation, affected DB writer, rollback target, known gaps and human feedback are sufficient as a compact per-slice receipt. Do not create another release ledger; integrate SPEC-295. Never claim a module fully migrated solely because a beta page works.

## 6. Living inventory, work products and completion semantics

Maintain an **incrementally populated** inventory, source-to-target SHA map, dependency DAG, financial and DB ownership matrix, external side-effect list, runtime route map, build/cost baseline and user-UAT issue log. Each new finding is filed against a specific module or API, with source link/evidence, owner, user impact, severity, available workaround and next repair action. Publish partial inventory immediately. Unknown active items are visible but cannot block unrelated Core development or a safe new-domain beta.

Readiness/status words: `DISCOVERING`, `IMPLEMENTING`, `DEPLOYABLE_BETA`, `HUMAN_UAT`, `FIXING`, `STABLE`, `LEGACY_RETIRED` or `ACTION_BLOCKED_SAFETY` with evidence/affected scope. `DONE` denotes the relevant demonstrated user journey, **not** a speculative project-global completeness claim. Prior G0 checklists remain useful as nonblocking audit prompts only.

## 7. Cross-spec ownership

- 313 Core details; 314 Module API/packaging; 315 environments/shared DB; 316 Git release/build; 317 per-module migration.
- 207 wallet; 280 pricing/revenue; 261/273 portable app/data; 304 identity/alias; 293 Git; 295 deploy/rollback; 224/278 jobs; 272 secrets; 267 Cloudflare; 311 legacy migration history/cutover.

## 8. Normative conflict resolution and scope

The earlier SPEC-311 R1.1 full-legacy-cutover requirement and Cloudflare compute decommission receipt describe a **different release operation**. They do not prevent creation and early restricted-beta deployment of a separate new Core/Module application on `smartsihub.com`. This R0.3 is a design draft, not a unilateral edit to SPEC-311 or provider resources. Before execution, Codex records a targeted 311/295 applicability note explaining why no legacy DNS cutover is taking place. For initial new-platform beta, the owner's instruction to begin real-user UAT is the program intent; provision minimal fresh resources only when a deployed slice requires them and credentials/target are verified. No resurrection of deleted IDs.

The current `smartaihub.app` Debian process may still serve legacy users. Labeling it `legacy-debian-dev` does not grant unrestricted access to their data or authorize interruption. `aimarkethubs.com` is new modular Debian development; developers receive effective production-equivalent app capabilities under **their existing legitimate** roles/grants.

## 9. R0.3 binding architecture decisions — NEW Core, existing PostgreSQL, maximum lean runtime

This R0.3 section is normative and resolves any ambiguity in earlier wording. The primary objective is **performance and runtime/build-size reduction**, not a line-by-line Cloudflare conversion of `apps/web`.

1. **NEW Core = clean-room application architecture.** Implement business-facing Core services, handlers, DB adapters and Shell anew in the new platform repo. The legacy service is a behavioral/data compatibility reference, not a source-code skeleton. Do NOT migrate Express/tRPC routers wholesale, import legacy backend packages, clone the legacy UI tree, replicate the monolithic service locator or ship a Node/Python HTTP Container as a Core dependency. Existing audited cryptographic/authentication primitives, protocol parsers or pure isolated algorithms MAY be reused only when source-scoped, Worker-safe and demonstrably smaller than the equivalent rewritten code. This exception does not permit copying the legacy architectural dependency graph.
2. **Modules differ from Core.** For first-party business modules, selective Copy → Isolate → Slim → Modernize from identified legacy source is expressly allowed. The Core itself is rewritten with fresh boundaries and thin contract-compatible adapters.
3. **Same actual PostgreSQL Core database and existing schema.** `smartspec` is the single canonical **Core** DB, **not** a migrated/imported copy or replacement D1; it holds identity, wallet/ledger, platform jobs, App registry and existing Legacy data. Fresh Mini Apps MUST use independent App data stores under SPEC-323, not tables in `smartspec`. Identity, hashes, MFA, user/tenant IDs and existing ledger remain intact. First Core slice defaults to **zero DDL**; justified Core metadata is additive only. Do not confuse app-control metadata in Core with its business data.
4. **Default stack** is fixed in `docs/architecture/STACK-DECISION-ADR.md`, mirrored in SPEC-313/314. Hono/TypeScript on Cloudflare Workers, lightweight React/Vite static Shell, `pg` through Hyperdrive for production DB, pnpm/Turborepo targeted builds, Wrangler local workerd and direct source-pinned releases. No Go or Rust service for ordinary Core APIs. Native/heavy compute stays in isolated on-demand executor lanes.
5. **Small means measured output**, not folder count. Measure real uncompressed Worker bundle, gzip bundle, frontend initial-route transfer, Worker startup, CPU, isolate memory indicators, DB query count/time, p50/p95/p99 API latency, requests/subrequests, build peak RSS/duration, and cost. Source lines or folder size do not substitute. Target budgets are **engineering optimization goals** and do not become another arbitrary UAT/deploy approval loop; Cloudflare's actual enforced limits and scoped data/security integrity still apply.
6. **Prevent regression.** No top-level dependency barrel that imports all Core/Module domains, no aggregate legacy UI build, no bundled video/models/binaries, no giant ORM/schema import, no unconditional per-request N+1 queries, and no always-on paid application Container merely to service normal API calls.
7. **Code ownership priority:** preserve user-visible behavior and canonical DB compatibility while permitting internal redesign, simpler flows, modern UI and API versioning. Use small compatibility adapters where a consumed external API needs continuity; record and retire temporary adapters separately.

This program's milestones show working developer-facing URLs immediately, with actual performance results attached to each iteration. A performance miss is an optimization issue unless a real provider limit or verified safety defect affects the released capability.

## 10. R0.5 — Background-first architecture decision

SPEC-318 is the narrow implementation contract for the dominant long-running jobs. `SAAS_CORE` SHALL own only authentication/authorization and thin job intake/status adapters, not an embedded Queue processor/Rust supervisor. Reuse canonical `worker_jobs` and outbox/lease authority across Debian and Cloudflare. Local Debian execution may use zero Cloudflare Queues cost, while verified production jobs may select TypeScript push, external Rust pull, or existing provider/runner executors by job class. Do not mandate Cloudflare Queue or Rust for every Mini App. Never hold Worker Queue invocations for multi-hour jobs. Short/long routes may use distinct queues only with measured need and no double-consumer configuration. See SPEC-318; planned performance and cost tracking are advisory, not pre-implementation approval gates.


---

## R0.6 Addendum — UI/WebMCP marketplace-first strategy (2026-11-01)

- Adopt SPEC-319 as the modern UI and agent-ready Action Contract implementation profile; SPEC-320 owns the greenfield public Portfolio + Mini App + Services Marketplace; SPEC-321 owns additive credit V2 and four-role commerce compatibility. Core UI and Public Site intentionally use **different builds** (React/Vite SaaS Shell; Astro public website), sharing design tokens and API contracts rather than complete app bundles.
- Business priority changes to **Mini App-first marketplace** with agent/Skill capability as the execution layer. Public Creator Portfolio and Services offers are first-class. No new agent-first directory is required before beta.
- User-confirmed production domain remains **smartsihub.com**. `aimarkethubs.com` is production-functional-parity Debian Modular Development. `smartaihub.app` is legacy/development while users still present are preserved.
- The cross-spec audit SHALL reference existing SPEC-207, 256, 261, 263, 270, 273, 277, 280, 287, 293, 294, 295, 303, 304, 311, 318 and existing 199/248/224 authorities. Do not declare all old specs obsolete or recreate parallel canonical systems.
- Credit redenomination is a coordinated legacy/new Financial Authority update, not a presentation-only display change. Old balance value must be preserved.
- Early deploy/human UAT is the norm; scoped auth/tenant/ledger/target protections remain on only the affected operation. No new general approval gate.

## R0.8 credit-first commercial simplification

SPEC-321 fixes four and only four commercial owner share roles; settlement for initial product version means credit grants into the **existing canonical user wallet**, not cash payouts. Referral/affiliate is a one-time funded promotional credit grant outside all four shares. A future withdrawal system with minimum threshold is a separate subsequent initiative and cannot delay creator-earnings UAT. Preserve the existing ledger authority and credit-unit compatibility with `smartaihub.app`.


---

## R0.9 — Agentic Payments / Platform Subscription / PAYG integration

**Owner-confirmed:** Add SPEC-322 as optional-agent payment / credit-limit contract in the fresh Modular platform. Account-first registration and separate SmartSIHub Platform Subscription vs Mini App Subscription are core invariants. Implement small real UI/headless slices and run bounded financial tests without using project-wide gates. The first-release finance baseline is the canonical SPEC-207 ledger, not a duplicated wallet. `smartsihub.com` production and `aimarkethubs.com` Debian Dev domain policy remains unchanged.

## R1.0 — Mini App tenancy, hosting and data authority owner amendment (2026-11-01)
This programme has TWO different data scopes. **Core control-plane** state and migrated legacy data remain in PostgreSQL `smartspec`; **new Mini App business data** lives outside that DB. If Mini App is stateless it need not provision any DB. Hosted-domain choice is independent of DB owner/provider and does not grant write access to Core. SPEC-323 is the authoritative specialization. M0 shall inventory legacy App tables and mark exact allowable shared-DB exceptions, while building fresh Mini Apps directly on isolated storage. Do not block unrelated UI/agent beta on inventory completion.


## R1.1 — Owner-directed autonomous bootstrap and priority order (2026-11-01)

**Normative owner directive:** ALL development of the new SmartSIHub platform SHALL be initiated, orchestrated, observed and accepted through the *currently running* `https://smartaihub.app` Autonomous Implements / Autonomous Mini App Creator facilities, using their existing SPEC-224 Job/Run, Runner, Workspace, Harness and deployment authorities. `smartaihub.app` is the **temporary development control plane**, not the new SaaS Core implementation or the new production domain. This rule applies to source changes, builds, tests, release requests, UAT and repair work; executors may run CLI internally as delegated tools. An emergency out-of-band repair is permitted ONLY when the old UI/control path is nonfunctional; reconcile its exact SHA/Run/receipts back into the canonical record as soon as recovery permits. Never claim that a task was executed through the UI unless actual Run evidence confirms it.

The priority order is fixed for planning: **P0 legacy autonomous-system repair/proof → P1 fresh lightweight Core/Shell → P2 Chat → P3 Autonomous Mini App Creator → P4 new Autonomous Implements → P5 selective autonomy handover → P6 Public Portfolio/Marketplace → P7 other modules**. Thin dependencies (login, job contracts, SDK, billing read-only, public designs) MAY be built in parallel; this is an execution priority, not a global blocking gate. No new Core/Mini App is allowed to write business data into canonical `smartspec` other than the existing narrowly registered Legacy module data exception under SPEC-323.

The development loop SHALL be: **Goal entered on old website → durable Run and owned Debian workspace → implement/test/build → real `aimarkethubs.com` UAT → scoped `smartsihub.com` Cloudflare beta when appropriate → user feedback → automatic child repair/continue**. A defect in the existing control plane becomes an **in-scope bootstrap repair task** for the affected operation, not a reason to abandon the migration or create another approval system. Preserve task identity, source SHA, logs and work artifacts through restart/disconnect; no silent success claims. The new autonomous implementer becomes the primary authority only after it has completed real development tasks and recovery/rollback tests; user-visible traffic switches selectively, with the old tool retained as fallback until stable. See SPEC-324 and [roadmap](../../../docs/smartsihub-r1.4/ROADMAP-AUTONOMOUS-IMPLEMENTATION.md).

**Program authority:** SPEC-324 is the executable bootstrap/self-hosting contract. SPEC-312's old wave or global-gate wording is subordinate to the owner-confirmed P0–P7 sequence and is not permission to delay Core→Chat→Creator. Do not conflate `smartaihub.app` legacy work-orchestration UI with the new `smartsihub.com` production domain.


## R1.2 — Interactive Chat is part of the Core/Chat product contract

New Core remains Hono/TypeScript; Rust native supervisor runs persistent Job orchestration. In Chat-first UX, inline structured widgets and artifact/browser panels are **clients** of canonical services, not a second application backend. Pilot interactive rendering with SPEC-319 R1.2 while Chat is the first migrated module, followed by Mini App Creator using the same facilities. Browser processes never run inside the Core Worker isolate. Three theme requirements remain Light, Dark, Balance. The screenshot designs are visual direction, not executable acceptance proof.

---

## R1.3 — Agentic Computer Use and Clef integration priority

Computer Use and fast decision routing are **cross-cutting optional capabilities** and MUST NOT block the P1 fresh Core/P2 Chat/P3 Mini App Creator beta when their own adapter is unready. Existing SPEC-208 is already the canonical Computer Use / Clef-first architecture. New platform adopts its contracts through thin adapters; no legacy monolith import, duplicate routing authority or Job ledger. Deliver one final-result-only headless browsing pilot early, then Desktop Runner and Clef optional routing, with Cloudflare Browser Run / Kitesurf and Moli benchmarked by eligibility and cost.

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

### SPEC-312 targeted closure

**Program-level reconciliation:** Maintain ONE living feature-to-owner inventory with `CORE|CHAT|CREATOR|AUTONOMOUS|PUBLIC|MODULE|LEGACY` disposition. Prioritize P0–P4 completion and a real URL/working user journey over inventory percentage. Distinguish preview, verified deployment and general availability; no old SPEC-311 full cutover requirement for the *new* `smartsihub.com` product. Measure post-deploy real-user usability and time from Goal to first real preview.

---

## R1.5 — New-platform scope and delivery invariants (2026-11-02)

This revision applies to the new SmartAIHub Modular SaaS platform at smartsihub.com. It is an independent product and is not a full migration or cutover of the existing smartaihub.app Legacy site. The Legacy site may remain operational for existing users and may serve as an optional development command tool only where the relevant workflow has current evidence; repairing or migrating the full Legacy infrastructure is not a prerequisite for Core, Chat, or new-platform work.

The current development-target registry identifies aimarkethubs.com as modular-debian-dev, prepared but not deployable: applicationAvailable is false, deployable is false, and the current service on port 3100 is preserved until its replacement is healthy. The smartsihub.com target is registered but not activated. Treat these as registry facts, not deployment proof. No hostname or optimized build mode grants authority.

The new sequence is a usable Core identity and action boundary, then Chat with a persistent Agent identity and durable run state, then complex workspaces and Mini Apps. Cloudflare Workers, Service Bindings, Durable Objects/Agents SDK, Workflows, Queues and appropriate data bindings are the default cloud compute. A Runner or approved Container is an on-demand executor for work that requires local OS, native, persistent-browser, GPU, large-memory or heavy-media capabilities. Always-on describes durable identity, schedules, wakeups, recovery and user control; it does not mean a continuously resident LLM, Worker, browser or cloud Container.

Chat is the primary post-login workspace. Closing Chat or any companion UI does not cancel an authorized durable run. The OS-boot device Core Connector and its on-demand Executor are distinct from cloud Agent authority. SPEC-325 is the cross-cutting security design. R1.4 remains historical evidence; this R1.5 clause and the [R1.5 owner-decision register](../../../docs/architecture/R1.5-OWNER-DECISION-PRECEDENCE.md) control conflicting claims.

Before remote device execution is enabled, the new product must pass the SPEC-325 enrollment, device proof-of-possession, signed-job-envelope, revoke/reconnect, locked-session and shared-Companion acceptance cases on a non-production environment. Device availability is a workload capability; it is never a prerequisite for cloud Agent identity or browser-closed job durability.

## R1.6 — Shared Core database, environment tenants and direct development (2026-11-09)

- The Legacy `smartaihub.app`, modular development `aimarkethubs.com`, and modular Cloudflare `smartsihub.com` runtimes MUST use the same canonical PostgreSQL `smartspec` database and Core identity, customer-tenant, entitlement, financial and `worker_jobs`/outbox authority. Existing user accounts and IDs MUST remain usable in the Modular product. Implementations MUST NOT clone users, create a second identity/ledger/job authority, copy the database or replace the existing schema. New Mini App business data MUST remain in its independent App data plane under SPEC-323.
- The new Core MUST use Hono/TypeScript for both local Debian/workerd development and Cloudflare Workers, and MUST remain small and fast for that runtime. Implementations MUST NOT introduce Express or import the Legacy Express runtime into the new Core; `apps/web` remains the Legacy application.
- Implementations MUST keep customer tenancy separate from deployment environment tenancy. `aimarkethubs.com` MUST bind to the modular development/test environment tenant and `smartsihub.com` MUST bind to a distinct modular production environment tenant. Existing customer tenant IDs and authorized canonical Core data MUST remain shared. Every customer-data request MUST resolve access from the verified account, membership and policy; hostname or request data MUST NOT grant tenant access. Development-only records and effects MUST stay scoped to the development environment tenant.
- Runtime DB credentials, deployment identities, Worker bindings and secrets MUST be separately scoped per environment where supported while connecting to the same canonical database. Existing authorization and schema semantics MUST be preserved; zero DDL remains the default. A different runtime credential MUST NOT imply a different database, and a shared database MUST NOT grant blanket cross-tenant access.
- Development MUST be supported directly through Codex or Claude in the canonical source repository and MAY instead use the existing SPEC-224 Job/Run, Runner, Workspace and Harness facilities on `smartaihub.app`. Both paths MUST preserve the same source, focused-check, commit and handoff evidence. Implementations MUST record SPEC-224 receipts only when that path was actually used and MUST NOT create a replacement in-house orchestration system.
- Implementations MUST preserve current target readiness: `aimarkethubs.com` remains unavailable for Modular traffic until its replacement is healthy, and the current port-3100 service remains in place until intentional handover. `smartsihub.com` remains inactive until its separate production release authority is provisioned. This clarification authorizes no runtime, database, DNS or production change by itself.

Acceptance MUST prove that (1) an existing Legacy user can authenticate on the Modular development hostname using the current canonical account authority, (2) an authorized customer membership resolves to the same canonical customer data without changing the customer-tenant ID, (3) development-only data/effects cannot enter production scope, (4) the Core build and local runtime use Hono with no Express server dependency, and (5) each supported direct or SPEC-224 development path records truthful source/check/handoff evidence.

## R1.7 — Chat default personal workspace and user-controlled workspace switching (2026-11-11)

After successful authentication, `/chat` SHALL provision an environment-scoped personal default workspace idempotently for the signed-in account when one does not already exist, then open Chat directly in that workspace. An account SHALL NOT be blocked at a “no workspace” dead end solely because it has no customer-tenant membership. Chat SHALL provide a visible workspace selector and a user action to create and switch to another personal workspace; creating one SHALL select it for the current session. With no explicit user selection, the personal default remains the initial workspace. Preserve the user's explicit selection for the current session only when the selected workspace is still authorized.

Personal workspaces SHALL be isolated by the verified Modular environment tenant and remain separate from Legacy customer tenants and their business data. Existing customer workspaces may appear only through their existing active canonical membership and policy; default-workspace provisioning SHALL NOT create, infer, or grant a customer-tenant membership from a role, email address, or hostname. The development environment SHALL NOT provision or read production personal-workspace records. These workspace controls make the Chat area usable but do not enable message sending without the separately required scoped persistence and provider path. This clarification does not change the `aimarkethubs.com` development target or activate `smartsihub.com`.

## R1.8 — Durable Chat LLM queue and provider admission (2026-11-11)

Chat LLM requests SHALL be admitted quickly and executed in the background so provider latency does not hold the browser request open and concurrent users are buffered instead of overwhelming an LLM provider. Admission SHALL write the job and its outbox intent atomically to the existing canonical `worker_jobs` and `worker_job_outbox`; it SHALL NOT create a second job ledger. The outbox publisher SHALL deliver a small, versioned job reference to a Cloudflare Queue, and the Queue consumer SHALL claim the canonical job with a lease/fencing token before calling the provider. Queue redelivery, publisher retries and duplicate client submissions SHALL be idempotent.

The Chat UI SHALL receive a job ID promptly, display progress, and retrieve a completed response only through an authenticated user/workspace/environment scoped status read. Prompts and provider secrets SHALL NOT be copied into the Queue message. Job state, request, provider/model identity, response and settlement SHALL remain in the existing canonical database and Chat message records. Development Chat jobs SHALL be bound to `modular-development`; the new Core consumer SHALL ignore all non-Chat job types. Existing legacy workers and outbox publishers SHALL neither dispatch nor claim Modular Chat jobs.

Provider admission SHALL be coordinated across Worker instances using durable Cloudflare Durable Objects, not process-local memory. For OpenRouter free models, the limiter SHALL be keyed by a one-way hash of the provider account identity returned by `GET /api/v1/key`, so adding another key for the same account cannot multiply its allowance. It SHALL pace requests at no more than the documented 20 starts/minute and read the live daily limit and remaining quota (free accounts may have 50/day; eligible credited accounts may have 1,000/day). Cache the quota briefly, account for this system's starts since the snapshot, enforce global/per-user concurrency, honor `Retry-After` on definite 429 rejection, and fail closed when provider limits cannot be read. Provider credentials SHALL be transient to the rate-control lookup and SHALL NOT be stored in Durable Object state, Queue messages, logs or receipts. Durable Queue consumers SHALL use automatic concurrency scaling (no fixed maximum); the provider-account Durable Object SHALL keep outbound requests within the upstream account limit. Auto/model selection SHALL exclude provider models that are no longer present or that are no longer free; a stale catalog entry SHALL not cause an unbounded or paid fallback. A request whose provider outcome is ambiguous (including a lost response, 408, or 5xx after dispatch) SHALL NOT automatically call the provider again; an expired lease with an unfinished provider attempt SHALL settle as `provider_outcome_unknown`.

Development verification SHALL exercise producer, outbox replay, Queue redelivery, consumer claim/settlement, rate-limit contention and result polling in local Workerd, then deploy only the verified replacement to `modular-debian-dev` (`aimarkethubs.com`). `smartsihub.com` production resources and traffic remain untouched.
