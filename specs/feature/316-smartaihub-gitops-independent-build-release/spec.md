---
spec_id: 316
semantic_id: smartaihub.module-gitops-independent-delivery
revision: R1.4
date: 2026-11-01
status: REVISED_DRAFT_NOT_IMPLEMENTED
title: SmartAIHub GitHub Repository Federation, Targeted CI, Immutable Per-Module Release and Wrangler Deploy
---

# SPEC-316 — GitHub and Independent Delivery

## 0. Intent

Reduce monorepo blast radius, checkout/build footprint, build RAM and runtime overhead. Keep git/source/release traceability without making GitHub Actions the only deployment executor. Use existing SPEC-293 Git authority and SPEC-295 Release/Deployment authority; do not create competing Git or release ledgers.

## 1. Repository strategy (may be implemented while inventory continues)

**GitHub decisions are parallel to Core implementation.** A pending complete inventory, repo provisioning, CODEOWNERS review or CI matrix cannot defer building and testing the first new Core slice in a clean local workspace. Known scope-specific security/financial deployment hazards are the only holds.

**Proposed default:** keep `naibarn/SmartSpecPro` as existing legacy source AND canonical host for official platform SPEC files. Create a *new* clean `smartaihub-platform` repo for Hono Core, Shell, Public Website, first-party Modules and small shared contracts. Creator/detachable Mini Apps use separate per-product repos according to SPEC-293/261. New repo name/owner/org is provisional until actual repository availability and scoped provisioning credentials are verified; lack of a new repo must not stop local creation/build of the clean workspace or a developer preview. This document does NOT create it.

Reasons: avoid copy/mirror of huge legacy sources/assets/dependencies; independent CI and clean history; maintain shared versioned package contracts while first-party modules are tightly coordinated. **Do not** split every first-party Module into its own repo on day one; independent packages and CI/CD are sufficient. Separate later only if lifecycle/ownership dictates.

Canonical SPEC registry lives in existing `SmartSpecPro/specs/feature`, where numbers/ownership are checked. New repo references `spec_id`, semantic ID and exact approved canonical spec SHA; it MUST NOT maintain divergent second canonical copies. GitHub branch naming or repo location never grants the authority to deploy/modify a tenant.

## 2. New repo layout and package conventions

```text
apps/{saas-core,saas-shell,public-website}/
modules/{chat,miniapp-creator,vertical-drama,media-studio,document-management,social-publish,motion-studio,task-control,library-rag}/
packages/{saas-contracts,module-sdk,ui-primitives,db-contracts}/
.github/{workflows,CODEOWNERS}
docs/{adr,deploy,architecture}/
module-inventory/
pnpm-workspace.yaml
pnpm-lock.yaml
turbo.json
```

Use pnpm workspaces + a small dependency DAG/Turborepo (already known in existing repository) with incremental install and targeted tests/build. Node/workerd/tooling versions pinned; no `apps/web` legacy package dependency. Versioning: independent module SemVer with compatible Core API and SDK constraints. Release tags are `core/vX.Y.Z`, `chat/vX.Y.Z`, etc. Central release catalog maps tags to immutable artifacts and deployed Worker identities.

## 3. Git workflow

- `main` is the integrated source truth, feature branches/PRs are short-lived (`feat/core-*`, `feat/module-<id>-*`, `fix/module-*`). Long-lived per-module branches are NOT mandatory.
- **Targeted PR validation (not global dev blocker):** affected-package unit tests, TS check, imports/dependency audit, secret scan, financial/auth/tenant contract tests where relevant. A module change does not trigger unrelated huge legacy/desktop/remotion test suites. Noncritical failing checks generate issues; safely usable dev/UAT deployments continue.
- A change to `packages/saas-contracts` or `packages/module-sdk` SHALL run **affected downstream consumers** plus compatibility suite; a change to one Module SHALL run that Module and its actual impacted dependents, not all by default.
- Path filtering is an optimization, not sole source of correctness; an always-running lightweight required aggregator avoids GitHub required checks stuck `Pending` when a workflow is path-skipped.
- CODEOWNERS for ownership/helpful review, branch protection for published source and signed/delegated automation identity, PR commit/source provenance. Do not make human review a requirement on every autonomous development commit/deploy. Existing genuinely enforced repository rules are respected; remove accidental redundant branch/ruleset/check blockers via ordinary authorized admin configuration rather than bypassing them.
- For each legacy-to-new copy, record legacy repo SHA, path, license, copied hash, new path and transformation issue; separate baseline copy from modernization changes when possible.

## 4. CI/CD and early-beta artifact pipeline

`working module -> affected-only build -> Debian browser UAT -> committed SHA + module artifact -> minimal real Cloudflare binding smoke -> scoped human-test beta on smartsihub.com -> fix/redeploy -> optional wider release`; all stages produce evidence as available and **do not require global progress-gate closure**. A separate long-lived staging Worker is optional if a limited-scope beta has safe release/rollback and genuine runtime verification.

Frontend static assets are built once per approved release; handle runtime config separately from secrets and avoid rewriting sources for a host change. If platform requires a platform-specific repackaging step, record byte-level input/output provenance; don't falsely assert immutable binary identity when output changed.

Every deployment receipt includes: canonical source SHA, module ID/version, source copy provenance, build digest, tests, environment target, actual Worker name/version, static asset digest, database schema contract, cost/CPU/bundle measurements, smoke results, timestamp, rollback target. Keep secrets and user data out of logs/artifacts.

## 5. Deployment responsibilities

| Component | Role |
|---|---|
| GitHub | Source, PR, checks, versioned releases, provenance |
| Debian Codex/Runner | Scoped development builds/tests/deploys and local workerd/browser UAT |
| Wrangler CLI | Direct approved Worker/asset staging or production deploy; actual target config required |
| Cloudflare | Runtime, routes, Service Bindings, logs, traffic/version metrics |
| SPEC-295 | Existing canonical release/migration/rollback authority |
| SPEC-224 | Existing canonical dev execution control plane |

Do not use GitHub Actions just to bounce a deploy that Codex has delegated authority to perform directly. Conversely, deployment directly from working tree with untracked/unapproved source is prohibited for production. `production` is a target identity, not a domain string matched in arbitrary scripts. Separate credentials with least privileges.

## 5A. Deploy-without-approval-loop operational contract

1. Codex/Runner may Build, Test, Restart and Deploy `legacy-debian-dev` and `modular-debian-dev` autonomously under existing scoped service privileges. A host historically named production is **not** a production-approval condition when the explicitly selected target is `legacy-debian-dev`.
2. The owner directs an **early, restricted real-user beta** for `smartsihub.com` after a working Core slice exists. Treat this as the program's intent to prepare/execute a bounded Cloudflare launch within existing credentials and target grants; do not automatically introduce a new bureaucratic review board, fixed 24-hour soak or full SPEC-311 route-migration completion gate. Where an infrastructure permission genuinely cannot be delegated, report it precisely once with the required action and continue other work.
3. Use direct Wrangler where practical. GitHub Actions is optional CI/deployment automation and not an indirect manual-approval requirement. Do not deploy from untracked source into production: build a source-pinned candidate and record Worker version + rollback route.
4. `required` GitHub check on a path-filtered workflow can remain Pending indefinitely for unrelated changes. Prefer an always-executed lightweight summary required job and conditional targeted jobs, or make per-module checks optional where appropriate; never require a workflow that did not run. Do not leave branch protections that enforce absent checks.
5. A failed optional UI/polish/performance check is a known-issue annotation, not a denied Deploy. A verified cross-tenant/ledger/secret leak or wrong target is a stop for **only the affected release**. CI must print a direct executable next command and precise issue location, not generic GRANT/APPROVAL_REQUIRED loops.
6. Control-plane source and build receipts may refer to a canonical SPEC commit in legacy; no new release/job/billing authority is created. Live acceptance is a human-accessible endpoint with real user feedback, not merely GitHub green.

## 6. Deployment independence tests

1. `modules/chat` change does not execute root/full web build or invoke `apps/web` Vite.
2. `modules/vertical-drama` build/test failure does not roll back/restart Chat/Core/Legacy services.
3. Shell/public release does not redeploy unrelated APIs.
4. Shared contract breaking change is caught before either side upgrades; old module remains supported within documented version window.
5. Module-only rollback works with existing shared DB migration compatibility and safely handles in-flight jobs.
6. CI cost and memory are measured; cache performance and check duration are reported, with targets revised using continuously measured baseline rather than fabricated claims.
7. GitHub Actions, service/systemd deployment and Wrangler are linked by provenance receipts, not double authorities.

## 7. Current evidence and caution

Existing `.github/workflows/cloudflare-deploy.yml` still builds legacy `apps/web` Vite and asks Node for up to 8192 MiB heap; new pipeline MUST NOT inherit this. Existing 2026-11-01 SPEC-311 decommission record notes migration deployment workflow was disabled; do not re-enable it automatically for new platform. New deployment targets/workflows are separately justified.

## 8. Depends on

SPEC-293, 295, 224, 261, 304, 312, 314, 315 and 317; canonical Spec handoff tools and source registry.

## 9. R0.3 — Toolchain pinning, build-size receipts and performance regression workflow

- New platform standard: Node 22 LTS (build tools only), pnpm 10, Turborepo 2, strict TypeScript ESM, Hono 4.x, React 19, Vite 7, Tailwind CSS 4, Cloudflare Wrangler/workerd pinned by the platform lockfile. TypeScript/Hono/React patch versions MUST be pinned in lockfile after compatibility tests, not dynamically upgraded on deployment. The production request runtime is **workerd, not Node**, and no Node HTTP service is a Core production fallback.
- `apps/saas-core` and each `modules/<id>` have independent `package.json`, `wrangler.jsonc` where needed, explicit build/test scripts, versioned contract dependencies and generated artifact location. `pnpm-workspace.yaml` MUST include `modules/*`; output paths must not overlap. Support direct `pnpm --filter @smartaihub/saas-core build` and `pnpm --filter @smartaihub/<module> build` without root-wide build.
- Attach module-specific **Build Budget Receipt**: source SHA, pnpm lock hash, input dependency graph, build wall time, peak RSS, Worker uncompressed/gzip sizes, frontend initial-route gzip JS/CSS, sourcemap excluded from served bundle, dry-run startup report, test outcomes and comparison to prior measured release. Record `known-perf-gap` with actionable attribution when advisory targets are missed; allow authorized dev and restricted human beta if the actual runtime and scoped safety checks pass.
- Baseline `apps/web` build memory/duration and file graph read-only before making improvement claims. Current legacy CI uses `NODE_OPTIONS --max-old-space-size=8192`; that is a V8 heap ceiling, **not a measured 8 GiB peak**. Measure real RSS with a reproducible command/time and report clean vs incremental build separately.
- Dedicated changed-package checks use pnpm/Turbo affected dependency DAG; if `saas-contracts` changes only dependent modules rebuild. For a module-only change, demonstrate **zero** legacy Vite/Remotion builds and **zero** restarts of unrelated Debian services or Cloudflare Workers. A new performance report does not require a new human approval step.
- Source of truth for Worker size is `wrangler deploy --dry-run --outdir <dir>` (uncompressed Total Upload plus gzip informational value), and for actual performance is Cloudflare observability plus synthetic + real browser timings. Static asset requests should bypass Worker invocation when appropriate; do not create standing Cloudflare Containers/Queues/DOs purely to make a deploy pipeline complete.

## 10. R0.5 — Independent queue/executor build and release

Create targeted CI for `packages/job-contracts` and `executors/rust-job-supervisor` (proposed names; resolve package graph first), with a separately versioned Rust native binary and optional Docker image, checksums and rollback; Core/Hono Worker and Queue Consumer TS Worker deploy independently. Only rebuild consumers when their versioned contracts actually change. Verify Cloudflare Queue Push/Pull configuration conflict per Queue; no simultaneous modes. During Debian development run real Rust job UAT without Cloudflare paid infrastructure. Production rollouts are scoped to one job class/executor version and preserve active job leases. Record Rust build size/RSS, Worker upload bytes/CPU, Queue operations, host cost and behavior under crash. No `cargo build` step is included in ordinary Core/UI builds. See SPEC-318.


---

## R0.6 Addendum — Independent Astro public build and commerce release (2026-11-01)

- Add independent public Astro build/deploy/version/rollback and UI component Storybook/Playwright paths, plus WebMCP browser Evals. Do not bundle Astro SSR with SaaS Core; do not import legacy `apps/web` runtime.
- Maintain pinned source/contract versions for API, UI, headless, WebMCP, and commerce pricing so an independent module update cannot silently change public prices or disable paid skill tools. No blanket aesthetic/golden-screenshot CI gate on unrelated modules.


---

## R0.9 — Agentic Payments / Platform Subscription / PAYG integration

Independent per-module CI and Wrangler release shall not require all Agent payment protocols to be ready before shipping native account/plan/quotes to Debian or a scoped Cloudflare Beta. No GitHub Actions production-only release hardcode to legacy domain; `smartsihub.com` is final production. Persist release receipts with SPEC-322 payment adapter version and class-policy version for any money-moving module, without new approval queues.

## R1.0 — BYOC and self-hosting without a central deployment choke point
For customer-created Mini Apps use independent Git repository and immutable App release. Hosting choices: managed main-domain Worker + App D1, verified custom domain routed to managed App deployment, customer Cloudflare account/zone/Worker/D1, or owner VPS/on-prem/container. Repository credentials, Cloudflare access tokens and DB credentials belong to their **owner** and are stored only as scoped secret references (SPEC-272/293); user BYOC account MUST NOT be treated as a second Core authority. App owner can deploy an independently tested build without rebuilding Core or all Mini Apps. Self-hosted releases have deployment receipts and health/rollback capability without requiring SmartSIHub to own OS credentials. Activation can happen progressively; no global gate outside scope-specific wrong-account/credential/financial/data safety.


## R1.1 — Owner-directed autonomous bootstrap and priority order (2026-11-01)

**Normative owner directive:** ALL development of the new SmartSIHub platform SHALL be initiated, orchestrated, observed and accepted through the *currently running* `https://smartaihub.app` Autonomous Implements / Autonomous Mini App Creator facilities, using their existing SPEC-224 Job/Run, Runner, Workspace, Harness and deployment authorities. `smartaihub.app` is the **temporary development control plane**, not the new SaaS Core implementation or the new production domain. This rule applies to source changes, builds, tests, release requests, UAT and repair work; executors may run CLI internally as delegated tools. An emergency out-of-band repair is permitted ONLY when the old UI/control path is nonfunctional; reconcile its exact SHA/Run/receipts back into the canonical record as soon as recovery permits. Never claim that a task was executed through the UI unless actual Run evidence confirms it.

The priority order is fixed for planning: **P0 legacy autonomous-system repair/proof → P1 fresh lightweight Core/Shell → P2 Chat → P3 Autonomous Mini App Creator → P4 new Autonomous Implements → P5 selective autonomy handover → P6 Public Portfolio/Marketplace → P7 other modules**. Thin dependencies (login, job contracts, SDK, billing read-only, public designs) MAY be built in parallel; this is an execution priority, not a global blocking gate. No new Core/Mini App is allowed to write business data into canonical `smartspec` other than the existing narrowly registered Legacy module data exception under SPEC-323.

The development loop SHALL be: **Goal entered on old website → durable Run and owned Debian workspace → implement/test/build → real `aimarkethubs.com` UAT → scoped `smartsihub.com` Cloudflare beta when appropriate → user feedback → automatic child repair/continue**. A defect in the existing control plane becomes an **in-scope bootstrap repair task** for the affected operation, not a reason to abandon the migration or create another approval system. Preserve task identity, source SHA, logs and work artifacts through restart/disconnect; no silent success claims. The new autonomous implementer becomes the primary authority only after it has completed real development tasks and recovery/rollback tests; user-visible traffic switches selectively, with the old tool retained as fallback until stable. See SPEC-324 and [roadmap](../../../docs/smartsihub-r1.4/ROADMAP-AUTONOMOUS-IMPLEMENTATION.md).

All new-platform Git operations and deployments MUST be commissioned/observable as tasks from `smartaihub.app`; the execution tool can run git, pnpm, cargo, Playwright and Wrangler natively on its delegated Debian Runner. GitHub is source/version evidence, not a mandatory manual deployment relay. Every autonomous task reports branch, workspace, commit SHA, target, build/test evidence, deployment URL and next action. A browser outage can use emergency local recovery with later receipt reconciliation, not a second orchestrator.

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

### SPEC-316 targeted closure

**Release mechanics:** All migration development Goals originate from old authenticated Autonomous Implements. Dev target builds direct on Debian; Cloudflare deploy is only the *exact* explicitly selected `smartsihub.com` Worker/asset version with bounded target authority, provenance and rollback. GitHub tracks source, contracts and receipts, but is not required to be the sole deploy launcher. No blanket CI pass or all-module build required for scoped UAT; never silently recreate SPEC-311 decommissioned resources.
