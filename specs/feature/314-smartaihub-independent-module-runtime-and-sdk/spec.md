---
spec_id: 314
semantic_id: smartaihub.independent-first-party-modules
revision: R1.4
date: 2026-11-01
status: REVISED_DRAFT_NOT_IMPLEMENTED
title: SmartAIHub Independent Module SDK, Build Boundaries, Worker Runtime and UI Shell
---

# SPEC-314 — Independent First-Party Module Architecture

## 0. Objective

The platform SHALL make modules separately buildable, deployable and rollbackable, with a small common SDK and Core API. First-party Modules can appear under one SaaS navigation/domain without sharing one executable bundle. Do not confuse a **module** (development/deployment unit) with a **Mini App product** (APP identity, license, lifecycle under SPEC-261/304). Some platform apps are not user-toggleable; untrusted third-party apps require extra runtime/origin isolation.

## 1. Packaging and directory contract

Proposed new-platform repo paths:

```text
apps/saas-core/          # Hono API only
apps/saas-shell/         # React SPA / navigation and account UI
apps/public-website/    # static-first SEO/CMS site
modules/chat/{src,tests,package.json,wrangler.jsonc,module.manifest.json}
modules/miniapp-creator/
modules/vertical-drama/
modules/media-studio/
modules/document-management/
modules/social-publish/
modules/motion-studio/
modules/task-control/
modules/library-rag/
packages/{saas-contracts,module-sdk,ui-primitives,db-contracts}/
```

Each module MUST declare its own package name, owned routes, runtime profile (static only, Worker API, external executor), files/asset limits, dependencies, tests, build target, deploy target, module version, capability scopes, plan/entitlement and cost budget. `modules/` MUST be a workspace selection pattern. Do not add all feature code to root import barrels.

## 2. Dependency rules

- **Allowed:** `module -> module-sdk/contract -> Core authenticated API` and explicitly documented versioned provider client.
- **Forbidden:** `module -> apps/web` runtime source, `module A -> module B` implementation source, `module -> shared mutable process state`, `module -> whole legacy Drizzle schema via a broad barrel`, module-owned credit ledger or privileged platform tokens in UI.
- UI component package may contain only dependency-light primitives (a11y, styling, primitives) and MUST NOT drag in video editors, provider SDKs or platform admin services.
- Any source copy requires original file path + source commit + license/provenance + transformation record. Copies remain independently edited; no recurring full repo mirroring.
- Dependency graph is enforced in CI (import restrictions, package resolution trace, actual Wrangler bundle report). Isolation is **not** proven by folder structure alone.

## 3. Module Manifest (proposed schema)

```json
{
  "schemaVersion": "1.0",
  "moduleId": "vertical-drama",
  "version": "0.1.0",
  "publisher": "first-party",
  "runtime": { "ui": "static-spa", "api": "worker", "executor": "external-on-demand" },
  "routeBase": "/m/vertical-drama",
  "requiredCoreApi": "1.x",
  "capabilities": ["storage.r2", "jobs.submit", "wallet.reserve"],
  "entitlements": ["drama.read", "drama.create", "drama.render"],
  "releaseArtifact": "sha256:recorded-at-build",
  "deployIndependently": true
}
```

Manifest labels do not confer actual privileges: Core evaluates tenant/user grants per invocation. No need to create every Module Worker until its feature requires it.

## 4. UI composition and runtime selection

- Trusted first-party modules: modern React/Vite SPA per module, independently deployed static assets and scoped Worker API. Use shared Shell navigation and normal top-level routing, not forced iframe. Module can keep deep links; Shell must resolve installed/versioned route and authorization before loading.
- Static Public Website: pure Static Assets by default; no Core API invocation for cacheable anonymous content unless business logic requires it.
- Untrusted customer Mini App: NEVER load untrusted JS into the same browser origin as Core Admin credentials. Use independent origin and scoped SSO/context tokens or suitable isolation; user experience can remain seamless without iframe.
- Heavy rendering, Python SDKs, FFmpeg, native binaries and GPU work: **separate specialized job executors**, scoped per task and budget, not a standing Node/Python web backend in Core. Reuse canonical `worker_jobs`/lease/attempt/fencing/settlement, no second queue.
- R2 direct/presigned uploads and content-addressed assets where appropriate; long request payloads and local disk are not default API data planes.

## 5. Module lifecycle — observed states, not approval queue

`DISCOVERED -> COPYING -> RUNNABLE_DEV -> DEPLOYABLE_BETA -> HUMAN_UAT -> ITERATING -> STABLE -> RETIRED` are factual progress labels, not a serial permission workflow. Each state may have known noncritical gaps. `ROLLED_BACK` and `SAFETY_HOLD_AFFECTED_SCOPE` describe actual operational events. SPEC-295 continues to own release/deployment state; this module view is only a projection. `DISABLED` means tenant/user entitlement state, not deleting deployment, DB tables or R2 data.

- Publish partial working module URLs early on `aimarkethubs.com`, even if dependent product features remain incomplete.
- Permit controlled real-user beta of one module on `smartsihub.com` without requiring all other modules, full legacy route coverage or a monolithic launch signoff.
- Domain/route ownership is explicit: Shell `/m/{moduleId}` navigation must not require building Shell each time a module API or asset version changes. Use versioned manifest/registry, content-hashed assets, SPA deep-link fallback, route precedence verification and Cache-Control rules so independent deploy means independent serving.
- Prefer zero-cost static assets for UI, one small Worker API only when used, and no permanently running Containers. Worker-to-Worker calls should not become a chatty N+1 network mesh; measure and consolidate endpoints on actual evidence.
- Local workerd covers JS runtime/API behavior, but not Hyperdrive pooling/query cache, true network edge behavior or every remote binding. Run a short Cloudflare beta smoke for those before widening audience; it is not a 24h/global soak gate.

## 6. Independent-build acceptance

1. A changed `modules/vertical-drama/**` file builds/tests only affected module plus its actual upstream dependencies.
2. An unrelated Chat build is not invoked, no `apps/web` Vite build, no legacy main service restart, and no SaaS Core restart.
3. Failure or rollback of one Module leaves others responding and their sessions/tenant state correct.
4. Contract compatibility is verified when Core or SDK version changes. Breaks require compatibility testing and scoped rollout decisions, **not** a global gate or blanket rebuild/deploy.
5. Static asset routes work with browser reload/deep link. No cross-origin credential leak.
6. Context tampering/entitlement removal/tenant mixing fails server-side, not only by hiding UI controls.
7. Actual production-like Worker CPU/requests, artifact size, outbound calls, idle cost, API latency and worker DB connection usage are reported.

## 6A. Browser-origin and module safety contract

The Shell and first-party modules may share a product hostname while still deploying independent Workers/assets; verify Cloudflare route specificity and SPA asset prefixes in runtime probes. A new Module release MUST NOT rewrite the root shell route or flush unrelated asset versions. The module manifest declares API origin and required Core contract version (not privileged tokens). Customer-created/untrusted Mini Apps execute on isolated browser origins; no untrusted script insertion into Core Admin context or local Miniflare on the Debian host without hardened isolation.

A small pilot proves: User installs/enables module, navigates without page errors, the module enforces permissions server-side, a rebuild/redeploy changes only its version, known bugs can be reported by human testers, and rollback does not restart the legacy site. Optional features may be unfinished and visibly labeled `BETA`; this is not a reason to halt release of working functions.

## 7. Cross-spec

SPEC-261/273/304 product/runtime/data contracts; SPEC-312 inventory; SPEC-313 identity/entitlement/credit facade; SPEC-293 source ownership; SPEC-295 deploy authority; SPEC-316 CI/GitOps; SPEC-317 migration; SPEC-207/280 charging; SPEC-224/278 durable work.

## 8. R0.3 — Standard module tech stack, true bundle isolation and hard cost discipline

All new *first-party* modules default to **TypeScript + Hono 4.x** for API Workers and **React 19 + Vite 7 + Tailwind CSS 4** for independently built static UI; the Core alone uses `pg` to query canonical shared identity/billing/tenant data. A module may use its own narrowly scoped DB adapter only when authorized by the table/data ownership matrix; modules do **not** import the Core DB repository or full schema. Shared `module-sdk` and `saas-contracts` are small packages of public types/client functions, not a compiled monolith. Public Website is static-first; any SSR is approved only after a use-case and measured cost comparison. Heavy media processing remains on-demand external/provider/native executor rather than a Cloudflare application Container by default.

Per-module packaging SHALL make these checks repeatable: (1) dependency closure from actual bundle/metafile; (2) no import from legacy runtime or another Module's implementation; (3) `pnpm --filter <module> build` targets only module plus necessary tiny shared contracts; (4) source hash and release size; (5) isolated runtime/service, assets and path routing; (6) no Webpack/Vite mega-build across all modules; (7) one module deploy/restart/rollback leaves Core and all others intact.

**Engineering performance targets (advisory, revise after actual measurements):** per simple module API Worker <= **1 MiB uncompressed**, stretch <= **512 KiB**; browser initial module route <= **150 KiB gzip** of extra JS over Shell where practical, lazy-load editors/AI tooling and expensive chart/video libraries; avoid extra Worker hops on each page load; do not bundle rendering binaries, model weights, images or R2 objects into Workers; report Worker CPU p50/p95, request/subrequest counts, DB roundtrips, static-asset bytes and module-only peak build RSS. A complex module may exceed the target if a size breakdown justifies it; it is not automatically `BLOCKED` for beta. Cloudflare's current **64 MiB uncompressed** Worker bundle, **128 MB** isolate memory and **1-second** startup limits are real provider constraints, not design goals.

Use `wrangler deploy --dry-run --outdir ...` and record *uncompressed* Total Upload plus gzip separately; since September 2026 the compressed size is not Cloudflare's rejection threshold. Keep static assets outside JavaScript Worker bundles (Cloudflare Workers Static Assets). Minimize `run_worker_first` so normal asset requests avoid Worker billable execution. An exact versioned module UI must be independently addressable under the Shell (unique asset prefixes/SPA fallback) without rebuilding Shell on every module release.

Do not create a separate Worker for a module that only serves static content. The deployment unit may consist solely of static assets with a tiny routing manifest. Likewise, do not create a standing Queue, Durable Object or Container without a demonstrated use case and idle cost analysis. Runtime resource provisioning is **just in time** per actual module feature, not a large pre-provisioning milestone.

## 9. R0.5 — Per-module async execution manifest

Each module with background work declares `jobTypes`, `requiredCapabilities`, `workloadClass` (`short-io`, `long-native`, `python-agent`, `native-media`, `provider-async`), `executorContractVersion`, `estimatedResourceClass`, `cancelSupported` and `progressContract`, linked to existing SPEC-224/278 jobs. TypeScript Workers perform bounded API/Queue handling; Rust is the preferred separately built native supervisor/executor (Go remains allowed via the same versioned contract) only for eligible long-running compute/IO or supervision. Modules never embed each others' handlers or duplicate Queue/ledger authority. A module may launch real beta with only its working job types enabled; other job types remain explicitly unavailable rather than blocking that module's UI and unrelated features. See SPEC-318.


---

## R0.6 Addendum — Design System V2 and Action/WebMCP adapters (2026-11-01)

- First-party Mini Apps consume small versioned semantic Design Tokens and accessible primitives per SPEC-319 without importing Legacy Astryx implementation or public Astro site. Third-party Mini App can style independently but must declare safe app integration and agent-callable Actions.
- Every billable Skill in a Mini App publishes a typed Action contract and economic Offer. React UI, browser WebMCP (when supported), remote MCP and headless HTTP call the same server handler. Browser WebMCP is optional-adapter, not a prerequisite for headless execution.
- One Mini App build/deploy does not rebuild other apps. Public listing/portfolio pages are separately rendered by SPEC-320 Astro public site.

## R0.7 — Mini App Skill scope is a commerce contract, not an import detail

The module manifest MUST distinguish newly authored `APP_EXCLUSIVE_SKILL` from `SHARED_BILLABLE_SKILL` dependencies by canonical `skillId`/version, owner `appId`, scope and provenance. Importing or calling a shared Skill never makes it App-exclusive or subscription-included; child invocation billing follows SPEC-321 even when the user-facing parent module is subscribed. Cross-App permission and code reuse stay auditable; app-only code must not be registered as reusable Skill without reclassification and compatible user billing disclosure.


---

## R0.9 — Agentic Payments / Platform Subscription / PAYG integration

Module SDK SHALL declare an Agent-callable `Quote/Reserve/Run/Usage/Receipt` contract and stable `appId`, `skillId`, `invocationId`, payerUserId and nested Skill trace. All licensed Shared Skills are metered per distinct invocation; App-exclusive subscription Skill stays included under SPEC-321. Module cannot create its own ledger, overdraft policy, credit denominator or PSP. UI and headless calls use same contract, with delegated payer authorization and no browser required. An optional Mini App managed on a different Cloudflare account still points to canonical payer/entitlement and settlement authority.

## R1.0 — Mini App is a product with its own hosting + data deployment
`modules/*` first-party development units and customer-owned `Mini App` products are distinct. Mini Apps MAY run via SmartSIHub main domain, verified custom domain, a separate Cloudflare account or self-hosted infrastructure, independent of the storage choice. Each new stateful Mini App MUST bind an app-owned database outside Core; default one dedicated D1 per App in a managed Mini App resource account, while BYOC D1, independent managed/user PostgreSQL, and owner-operated servers are first-class. Stateless apps need no DB. Include `appId`, owner/tenant, deployment/account/hostname, database provider/account/identity/ownership, portability class and credential reference in metadata (never plaintext).
The App SDK separates a headless SmartSIHub Core Client (user/tenant identity, entitlement, credit quote/reserve/settle, canonical worker_jobs) from a **portable App Data Client** (app business records only). An App or BYOC Worker calls Core via scoped authenticated HTTPS APIs; no cross-account Core DB binding or raw core DB credentials. Runtime path and browser origin policies prevent untrusted code from accessing Core admin cookies; only the app owner manages their own app resources. See SPEC-323.


## R1.1 — Owner-directed autonomous bootstrap and priority order (2026-11-01)

**Normative owner directive:** ALL development of the new SmartSIHub platform SHALL be initiated, orchestrated, observed and accepted through the *currently running* `https://smartaihub.app` Autonomous Implements / Autonomous Mini App Creator facilities, using their existing SPEC-224 Job/Run, Runner, Workspace, Harness and deployment authorities. `smartaihub.app` is the **temporary development control plane**, not the new SaaS Core implementation or the new production domain. This rule applies to source changes, builds, tests, release requests, UAT and repair work; executors may run CLI internally as delegated tools. An emergency out-of-band repair is permitted ONLY when the old UI/control path is nonfunctional; reconcile its exact SHA/Run/receipts back into the canonical record as soon as recovery permits. Never claim that a task was executed through the UI unless actual Run evidence confirms it.

The priority order is fixed for planning: **P0 legacy autonomous-system repair/proof → P1 fresh lightweight Core/Shell → P2 Chat → P3 Autonomous Mini App Creator → P4 new Autonomous Implements → P5 selective autonomy handover → P6 Public Portfolio/Marketplace → P7 other modules**. Thin dependencies (login, job contracts, SDK, billing read-only, public designs) MAY be built in parallel; this is an execution priority, not a global blocking gate. No new Core/Mini App is allowed to write business data into canonical `smartspec` other than the existing narrowly registered Legacy module data exception under SPEC-323.

The development loop SHALL be: **Goal entered on old website → durable Run and owned Debian workspace → implement/test/build → real `aimarkethubs.com` UAT → scoped `smartsihub.com` Cloudflare beta when appropriate → user feedback → automatic child repair/continue**. A defect in the existing control plane becomes an **in-scope bootstrap repair task** for the affected operation, not a reason to abandon the migration or create another approval system. Preserve task identity, source SHA, logs and work artifacts through restart/disconnect; no silent success claims. The new autonomous implementer becomes the primary authority only after it has completed real development tasks and recovery/rollback tests; user-visible traffic switches selectively, with the old tool retained as fallback until stable. See SPEC-324 and [roadmap](../../../docs/smartsihub-r1.4/ROADMAP-AUTONOMOUS-IMPLEMENTATION.md).

P2 Chat and P3 Mini App Creator are the first two independent modules. Define versioned `Action`, Chat/session, Mini App creation/job, ownership and deployment contracts so existing `smartaihub.app` autonomous systems can create/test their replacements. Creator-generated Mini Apps are separately hosted/DB-isolated by SPEC-323; do not couple creator builds to Core package builds.


## R1.2 — Renderable Action and Artifact capability profile

Modules MAY publish `renderableBlocks`, `artifactTypes`, `browserAutomationRequirements` and `headlessActions` in their versioned manifests. Fixed, static first-party UX and optional OpenUI-generated inline UX share **one** Action/Capability Contract. An App may generate an inline preview and a full artifact panel, but the underlying file/version belongs to the existing canonical artifact authority. Module build/deploy independence remains unchanged. External Mini Apps may self-host and return versioned artifact/action references without receiving Core DB credentials. Browser Provider requirements are optional and never part of the default Hono Worker bundle. See SPEC-319 R1.2.

---

## R1.3 — Optional Computer Use placement metadata

A Mini App MAY declare browser/desktop Computer Use requirements, e.g. `browserEngineCapabilities`, `needsPersistentSession`, `needsHumanHandoff`, `desktopDeviceRequirements` and `supportsHeadlessFinalResult`. These are capability requests resolved by SPEC-208/197, not permission grants. No new Mini App can gain direct Core database credentials or a second paid-execution path. Stateless Kitesurf, experimental Moli and full Chromium compatibility SHALL remain distinct; do not hard-code one browser engine into the Mini App package.

---

## R1.4 — Cross-SPEC owner reconciliation and execution contract (2026-11-01)

> **R1.4 authoritative cross-spec review (2026-11-01):** This section is the controlling addendum for SPEC-312–324. When an earlier R0.x/R1.x addendum, specimen YAML, screenshot, or old SPEC conflicts with the latest owner decisions, follow this revision's [Cross-SPEC precedence and owner decisions](../../../docs/architecture/R1.4-OWNER-DECISION-PRECEDENCE.md). Historical sections remain for context; none may silently reintroduce a global gate. All changes in this artifact are proposals, not deployed code or official GitHub changes.


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

### SPEC-314 targeted closure

**Module SDK:** One versioned `appId` binds hosting, domain, repository, separate app data, entitlement and agent-callable Action descriptors. Static-only apps need no Worker and stateless apps need no DB. Each app builds, tests, deploys and rolls back alone; exclusive Skill inclusion must be server-verified by provenance/app ownership, with nested shared usage independently charged. OpenUI rendering is opt-in; owner-owned custom UI and API-only apps remain valid.
