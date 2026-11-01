# Owner-approved execution roadmap — SmartAIHub builds SmartSIHub

**Revision:** R1.4 | **Date:** 2026-11-01 | **Status:** DRAFT FOR CANONICAL INGEST; no code/deploy executed by this package.

## Domains and control path

- **CURRENT development tool/UI:** `https://smartaihub.app` on Debian — Autonomous Implements and Autonomous Mini App Creator. This website is the front door for ALL migration development Goals until selective P5 handover; retain current users.
- **NEW modular dev + human UAT:** `https://aimarkethubs.com` on same Debian, isolated process/port/workspace and exact target release.
- **NEW production:** `https://smartsihub.com` on Cloudflare Workers; selected working slices incrementally deployed, with explicit target/rollback. New platform name SmartSIHub.

Developer must distinguish **control surface**, **execution host**, **development target**, and **production deployment target**. Old web UI initiates and observes, delegated Codex/Runner executes, new dev shows result, new production hosts released artifacts. Neither repo commits nor shell commands alone are evidence a user commissioned a Goal through the UI.

## Roadmap in dependency order

| Rank | Deliverable | Legacy website must be able to do | New dev UAT success / first tangible result | Can advance before full completion? |
|---|---|---|---|---|
| P0 | Bootstrap repair and proof | Select real Debian Runner, model/Harness, workspace, input SPEC/prompt, authenticate Goal, see logs and automatic continuation, deploy | One actual source change→build→deploy to `aimarkethubs.com`, visible public URL, receipts | Other read-only design yes; reliable command path needs to work for core work |
| P1 | Lean SaaS Core | Generate new workspace/repo and Hono/TS source, run SQL compatibility and build | Login/session/tenant/permissions, existing `smartspec` control plane, Core shell and job intake | Chat can start once needed Core APIs work |
| P2 | Chat FIRST | Analyze legacy Chat, regenerate clean module, test model streaming/tools, deploy | One authenticated Chat conversation, user-selected usable model, stream/cancel/resume, record a durable Run; headless action parity | Creator foundation can start while chat polish continues |
| P3 | Mini App Creator SECOND | Drive existing Creator to generate genuinely new App with isolated data, source and deployment | New App ID/repo, its own D1 or separately owned DB, internet test URL, re-run creator modification | BYOC/Postgres/marketplace packaging can follow |
| P4 | New Autonomous Implements | Use old implementation tool to build new goal/run/runner UI + API with current contracts | New SmartSIHub UI creates and completes a real development Goal from spec/prompt, child auto-execution, files/tests/logs/deploy URL | Can reuse existing executor while new UI/control surfaces mature |
| P5 | Selective authority switch | Run matched control-plane tests, observe and safely move selected Goals | New platform autonomously modifies/deploys one real module with rollback and no dual worker execution | Other product work continues |
| P6 | Public Portfolio/Marketplace | Build independent Astro site, portfolios/miniapp listings/commerce | Real creator portfolio + published App + authenticated purchase/entitlement/skill payments | Public UX design parallel since P1; launch commerce as safe slices |
| P7 | Remaining modules | Orchestrate separate copy/rewrite/build/release tasks | Library/RAG, Task Control/Mission, Vertical Drama, Media, Documents, Social, etc. individually live | Parallel per scoped ownership |

**Important order:** `P1 Core -> P2 Chat -> P3 Mini App Creator -> P4 Autonomous Implements`; do not substitute anonymous public website pilot ahead of Chat/Creator. The fact that P0 concerns repairing old facilities does NOT make old source part of the new Core.

## The self-improving autonomous loop

1. Owner enters a Development Goal in the authenticated `smartaihub.app` Task Control/Autonomous UI, selects SPEC or prompt and explicit new project target.
2. Existing SPEC-224 creates one Goal/Run and dispatches to authorized Debian workspace, model/harness and runner. Human approves *goal-level bounded authority*, not each safe child step.
3. Runner implements, builds, executes focused tests, deploys only changed unit to `aimarkethubs.com` and captures browser/test/URL/SHA evidence.
4. Human tests real URL, reports missing/broken paths. Existing system automatically creates bounded repair/continue children and runs them, preserving original Goal history.
5. Failure in old Autonomous UI/Runner/approval loop becomes an in-scope repair of `smartaihub.app`; verify repair on old website then resume original Goal from checkpoint (no reset).
6. Once the usable slice runs on Debian/workerd, create scoped Cloudflare test/restricted production candidate only for the relevant module and exact commit. Observe and iterate with actual users.
7. After P4 reliability proof, transfer selected development Goals to new system; retain legacy backup/recovery path and independent live websites.

### Failure routing

| Symptom | Action and continuity |
|---|---|
| Old Run stuck/Runner offline/approval loop | Capture Run, lease, service, log and failed action, repair old control plane **using same Goal child**, requeue safely, resume; no automatic endless retries |
| Old web UI impossible to access | Narrow authorized Debian recovery, restore old site, backfill canonical receipt and continue through UI |
| New Core/Chat/Creator error | Repair new module, preserve old development command center and unrelated modules |
| Cloudflare incompatible/binding missing | Keep Debian working UAT, repair exact target, no all-project stop |
| Wrong target/data corruption/finance duplicate/cross-tenant | Contain only affected operation, restore/reconcile, keep other authorized work active |
| User requests UI changes | New screenshot/UAT issue + targeted implement/deploy, no general design approval queue |

## Minimum evidence per task

`goal_id`, `run_id`, `child_id/attempt`, `app/module`, `old_ui_origin=smartaihub.app`, `debian_runner`, `workspace`, `harness`, `model`, `repo+sha`, `changed_files`, `tests`, `deploy_target`, `deployment_url`, `browser_evidence`, `job_status`, `known_gaps`, `next_action`, `budget/credit_usage`, `rollback_target`.

## Early delivery examples

- P0: Through old UI, generate a minimal isolated service/build and a real preview URL; show logs and refresh continuity.
- P1: Authenticate and view own tenant on new Core; read-only credit available before money-changing routes mature.
- P2: Login and send real chat turns through a selected available model, including streaming/reconnect and cost receipt.
- P3: Describe a simple app in old Creator; it creates code + App ID + isolated data + real UAT URL; edit via subsequent prompt.
- P4: On new platform, submit a spec to change a small module, test, deploy, observe and auto-fix a deliberate non-financial defect.
- P5: New system performs another real change with old system only observing, then demonstrate clean rollback to old job ownership if necessary.

## Cross-spec and restrictions

SPEC-312 is master program; 313 Core; 314 modules; 315 domain/DB; 316 source/release; 317 migration order; 318 durable jobs; 319 design/Chat action; 320 public marketplace; 321/322 credits/payments; 323 portable Mini App; 324 bootstrap. Existing SPEC-224/277/278/294 are reused as owners of old automation and target functionality, not duplicated.

Do not re-create deleted Cloudflare migration resources from SPEC-311 receipts, force a full old-site cutover, create separate identity/credit/job ledgers, run destructive DB migrations, import the entire legacy backend into the new Core, or turn incomplete inventory/coverage/UI polish into a program-wide block.


## R1.2 — Chat-first interactive experience work slices

After fresh Core bootstraps, the **first Chat migration** can deliver streaming text and basic messages immediately. Follow with inline code/YAML (copy), Mermaid diagram, interactive choice/form, immutable artifact preview/side panel, then Chromium/Playwright browser pilot and optional Cloudflare live view/handoff; Moli is an optional measured optimization. The **second Mini App Creator migration** reuses artifact panel, code diff, browser preview and UI controls. The old `smartaihub.app` Autonomous Implements continues to author/test/deploy this new UI until the new Autonomous Implements completes real work end-to-end. These slices are independently UAT-able; only unsafe actions are scoped-pending, not the whole product.

## R1.3 — Computer Use and Clef incremental delivery

P2: headless browser/API Chat run (final-result-only and artifact) survives UI closure. P3: Mini App Creator uses Chromium/Playwright to verify app URL. P4: native Windows/Linux Runner computer use and optional Cloudflare Browser Run. Optional low-resource Kitesurf and Moli follow provider-specific evidence; Clef-flash shadow routing can run in parallel. None create mandatory full-product approval gates. Source of truth stays SPEC-208 (computer use) / SPEC-318 (`worker_jobs`) / SPEC-207 (billing).


## R1.4 execution precision (controls legacy-to-new handover)

- **P0 success:** actual owner-authorized Goal initiated in old `smartaihub.app`, dispatched through its existing Runner, code deployed to `aimarkethubs.com`, real browser checked, correct logs/receipts visible. Repair/retry scoped old UI failures in same Goal rather than reporting false success.
- **P1 Core:** fresh small Hono/TypeScript Core, existing canonical `smartspec` contracts, no new App domain data in Core. Parallel Dev tests never grant unlimited tenant/payment permissions.
- **P2 Chat:** chat streaming first, then typed OpenUI interactive blocks/3 themes, durable job cards, panel/detached artifacts, Browser Use as an optional capacity-aware executor. No fake 'cloud always on' if job is waiting for local computer.
- **P3 Creator:** a real newly created Mini App with dedicated external app DB, versioned `appId`, source, preview URL, Agent-callable APIs, attached app-only Skills/subscription metadata. Human UAT as soon as usable.
- **P4–P5:** new autonomous implementation must prove real Goal creation, execution, continuation, artifact/receipt and rollback before moving *specific Goal ownership* away from old system. Never dual dispatch.
- **P6–P7:** independent Astro public portfolio/marketplace + remaining modules. Paid subscription and credit conversion must reconcile ledger, never fake financial success.
- **Actual cloud resource states:** SPEC-311 earlier resources may be decommissioned. New Cloudflare resources only after current account readback and exact owner-authorized scoped target. No automatic resurrection from old IDs.
- **Non-blocking rule:** user-facing UAT progress and target-specific safety evidence are parallel; no blanket 100% inventory, expensive soak or 10-review gate before first safe deployment.
