---
spec_id: 324
semantic_id: smartsi.autonomous-bootstrap-self-hosted-development-handover
revision: R1.5
date: 2026-11-02
status: PROPOSED_NOT_IMPLEMENTED
primary_control_surface: https://smartaihub.app
new_development_surface: https://aimarkethubs.com
new_production_surface: https://smartsihub.com
---

# SPEC-324 — Autonomous Bootstrap, Self-Hosted Development and Control-Plane Handover

> **Current-revision note (R1.5, 2026-11-02):** Earlier proposal text is retained for provenance. If R0.x–R1.4 mandatory Legacy bootstrap, cutover, runtime, database, or always-on assertions conflict with the final R1.5 section or current owner-decision register, R1.5 controls.

## 0. Binding owner decision

**The new SmartSIHub platform SHALL be built from the existing SmartAIHub autonomous facilities.** An administrator creates the program and child development Goals in the live `https://smartaihub.app` Autonomous Implements or Autonomous Mini App Creator surface. The current SPEC-224 execution authority, existing canonical `worker_jobs`, Runner and selected Codex/Claude/Pi/etc Harness shall build, test, deploy, diagnose and repair the new modular platform on the existing Debian Linux host. No parallel, independent project orchestrator is introduced for this build.

New code is placed in a clean, isolated modular workspace/repository; its web UAT runs on `https://aimarkethubs.com`. New production modules are deployed individually on Cloudflare for `https://smartsihub.com`. The old `smartaihub.app` runtime must continue serving the development command/control entry point until the new Autonomous Implements has proven real self-development and the owner is able to switch to it, with fallback available. The historical SPEC-311 full legacy cutover is a different workstream; it is not a prerequisite to restricted new-domain beta.

**Important distinction:** 'through `smartaihub.app`' means initiation, authorization, progress/control visibility, evidence and human feedback through its real authenticated UI; autonomous Runner processes execute normal CLI/build/browser/deploy tools on the authorized Debian machine. Do not claim the current UI is functioning without an observed authenticated Goal→Run→Release receipt.

## 1. Hard priority order, flexible implementation lanes

| Priority | Deliverable | Primary owner/specs | Minimal visible acceptance |
|---|---|---|---|
| P0 | Legacy autonomous bootstrap repair/proof | SPEC-224/277/278/294/324 | From `smartaihub.app`, create one Development Goal, choose Runner/Workspace/Harness, get logs, commit and UAT URL; refresh/reconnect retains Run |
| P1 | Lean NEW Core + Shell | SPEC-312/313/315/316 | Login, tenant context, existing Core PostgreSQL, small Hono API and Shell on `aimarkethubs.com` |
| P2 | NEW Chat as first Module | SPEC-314/317/319 | Authenticated chat, model routing/streaming, tools/Skill, durable Run/status, actual usable UI + headless action |
| P3 | NEW Autonomous Mini App Creator | SPEC-314/317/323/324 | Chat/Goal→new App source→isolated DB→build→internet UAT URL, App ID preserved; legacy Creator does the creating |
| P4 | NEW Autonomous Implements + Task/Mission Control | SPEC-224/277/278/294/318/324 | New system can accept a real goal, select runner/model/workspace, implement code, auto-continue children and deploy a change |
| P5 | Selective self-hosted autonomy handover | SPEC-295/304/317/324 | New orchestrator completes repeated real tasks, resumes after fault, controlled move of selected Goals; old control path retained for rollback |
| P6 | Fresh Astro Public Website, Creator Portfolio, Mini App/Services Marketplace | SPEC-320/321/322 | Creator publicly lists and shares working App, user registers/buys/uses within supported commercial scope |
| P7 | Remaining first-party modules | SPEC-317 & domain specs | Each feature independently rebuilt/migrated, tested and deployed |

The order is execution priority, not a global gate. Core contracts, UI/branding, Marketplace scaffolding, Rust job adapter, cloud bindings and payment compatibility can advance in parallel **if** they do not force the first functional Chat→Creator→Autonomous Implements path to wait. A working P1 slice can be used for P2 while another P1 feature is unfinished. A public website may be prototyped earlier but P6 business delivery does not displace the Chat/Creator/autonomous path.

## 2. Two control planes, one active authority per development Goal

- **Bootstrap plane:** authenticated old SmartAIHub UI, current SPEC-224 Job/Run, Runner, project/workspace and selected Harness. This is the active authority for all migration development tasks P0–P4 and during selective P5.
- **Target plane:** rebuilt Core, Chat, Mini App Creator and new Autonomous Implements on the new platform. It is the artifact being built and tested. Its own development authority starts only with explicitly migrated Goals in P5.
- A Goal has one owning orchestration authority and one canonical Run/attempt identity at a time. A test invocation on the new plane is explicitly marked test, not a second live executor for the same Goal. During handover, freeze new dispatch for that Goal, reconcile active leases/children and transfer ownership atomically or drain before switch; never dual-dispatch.
- The canonical PostgreSQL `smartspec` stays authoritative for platform identity, tenant, wallet, app registry and `worker_jobs`. Newly generated Mini App business data uses its own D1/DB; no new Mini App tables in Core DB. The legacy business-data exception is explicit only for migrated legacy modules.

## 3. P0 bootstrap capability checklist (do not invent new gates)

The existing system should support or be repaired to support:

1. Actual authenticated `smartaihub.app` administrator selection of the new-platform program/workspace/Goal or canonical SPEC/pasted prompt.
2. Real discovery/selection of an available Debian Runner, workspace, harness and model (not hardcoded unavailable choices).
3. One scoped Development Goal authorization including repository, budget, allowed tools and deploy target; child tasks inherit bounded authority until Goal completion. No endless approval, token/expiry or GRANT retries.
4. Background durable Run admission, live status/log/step, changed files, source SHA, cost/credit and artifacts. UI disconnect cannot terminate a valid long Run.
5. Independent `pnpm`/`cargo` build, Playwright/browser URL verification, and local workerd test on Debian; direct Wrangler for approved bounded Cloudflare beta.
6. Automatic phase/child progression with failure classification. A recoverable error yields a scoped diagnosis/repair attempt, not repeated superficial continue prompts; irreversible effects remain narrowly authorized.
7. Visible human-UAT feedback and repair loop, including wrong-URL and cache/serving-source mismatches.
8. Honest terminal receipt: actual URL + source SHA + observed success or precise remaining issue, never synthetic completed status.

P0 success is demonstrated by **at least one real new-platform modification through the old web control path** with a verifiable Debian build and externally accessible UAT URL. This is a proof of the necessary tool, not a barrier to all nondependent design/source work.

## 4. Dogfooding failure and autonomous repair loop

When implementing any P1–P7 work, record failures as (a) **bootstrap platform** defect (Goal/Runner/Queue/UI/Approval/Deploy/Logs); (b) **new platform** product defect; or (c) external/credential issue. For (a), open a repair child against existing SmartAIHub `smartaihub.app` under the same approved Goal; produce a reproducible failing step and focused fix, release to the old site using its scoped existing controller, verify browser and then resume the original new-platform step. Do not reset a completed phase, lose logs, clone the Goal or modify protected data to work around a guard. For (b), fix the new target module and redeploy only that module. For (c), report actionable required permission/evidence once, continue unrelated work.

When the old web UI or orchestrator is itself unreachable, a **narrow break-glass direct Debian Codex/Runner repair** is permitted under pre-existing owner authorization and infrastructure permissions; this is a disaster-recovery exception only. Record exact shell/workspace/commit/deploy receipts and reconcile them with canonical history when UI returns. It must not become the normal development method.

A failed test is not by itself an all-project block. Unfinished cosmetic UI, performance target, coverage, or unrelated module does not prevent usable development/UAT. Wrong-target deploy, unauthenticated access, financial double charge, destructive schema/data mutation, credential leak or cross-tenant exposure pauses only the affected unsafe operation until controlled.

## 5. Data and runtime boundaries

- New Core: fresh Hono/TS Worker-native code, existing PostgreSQL schema as authority; do NOT convert `apps/web` as the new Core.
- First migrated Module: Chat, with model/harness discovery, streaming/cancellation and canonical credit/usage authority via versioned adapters.
- Second migrated Module: Mini App Creator; newly created Apps receive own data plane, app identity, repo and independently deployable artifact. BYOC/self-hosted support may follow incrementally.
- New Autonomous Implements: reuse existing SPEC-224 Job/Run, SPEC-278 recovery, SPEC-293 source/federation, SPEC-318 durable execution; Rust native job supervisor only where it helps real long jobs, not in the Core Worker bundle.
- `aimarkethubs.com`: accessible new Debian UAT with authorized-user feature parity; `smartsihub.com`: confirmed Cloudflare production, restricted beta and independent module rollouts; `smartaihub.app`: active old control website and preserved live users until explicit retirement decisions.

## 6. P5 handover — measurable proof, not a bureaucratic rollout gate

The new Autonomous Implements must successfully complete real development changes (not a mocked job), with visible Run→Child→Build→URL receipts, interruption/reconnect recovery, correct tenant and credit isolation, cancellation semantics, and rollback of a selected deploy. Run a shadow **read-only** status comparison where useful but never allow two executors to perform the same billable side effect. Move one selected Goal/workspace to the new control plane, observe and expand. Roll back that Goal to old control only after active execution has been drained or fenced; preserve its original identity and audit history. Once users can perform new development through SmartSIHub and it remains reliable, use new Autonomous Implements as default; do not shut down the old interface until rollback/reconciliation and its remaining user activity are addressed.

## 7. Evidence and reporting contract

For every independently delivered slice: goalId, project/workspace, responsible agent/harness/model, machine/runner, source repo/branch/SHA, affected files, tests, build result, exact Debian or Cloudflare URL, underlying runtime, current job and child state, cost, real browser/UAT observation, known gaps, recovery/rollback instructions and owner next action. These are status records, **not** additional manual approval steps.

Report momentum as working URLs and tested user journeys: P0 first real autonomous deploy, P1 Core login, P2 Chat turns, P3 first generated isolated DB Mini App, P4 first new-system autonomous deploy, P5 switched Goal, P6 public creator listing. Do not report a GitHub commit or CI green check alone as usable product.

## 8. Compatibility and authority

SPEC-324 does not replace SPEC-224 (autonomous development), SPEC-278/318 (job durability), SPEC-277/294 (task/mission UI), SPEC-293 (Git/source workspace), SPEC-295 (release), SPEC-303/304 (ownership/App routing), SPEC-207/280/321/322 (money/commerce) or SPEC-323 (Mini App data/hosting). This is a binding additive ordering, dogfooding and handover contract. Earlier tentative SPEC-317 waves and any broad SPEC-311 full-legacy-cutover prerequisite do not block this new-platform sequence. Update their *applicability* by additive crosswalk, not by rewriting history.


## R1.2 — Dogfooding Chat-native interactive UI and Agent Browser

P0 old `smartaihub.app` Autonomous Implements SHALL author the new Chat renderable block contract, Artifact Panel and agent browser adapter as target platform work. Development progress must appear in the old Task/Thread status until the new system has accepted a real run. First implementation proves static/streamed inline code+diagram and choice cards, then saves an artifact and opens it in a panel; after this, a browser session controlled by the agent can demonstrate UAT through `aimarkethubs.com`. A temporary outage in Moli or Cloudflare Browser Run is scoped provider fallback work, not an all-project stop. Keep state and development Run receipts even when user browsers close. Migration to the new Autonomous Implement occurs only after durable end-to-end jobs/deploys and retries are demonstrated, not when a mockup alone renders.

---

## R1.3 — Computer Use & Clef workstream during autonomous dogfooding

Use **existing `smartaihub.app`** Autonomous Implements to ship this integration, not a second orchestration stack. Work order (independent UAT slices; no new global gate):

1. **P2 Chat first**: durable browser-less API task and Chromium/Playwright headless task, with final-result-only summary and artifact on `aimarkethubs.com`. Job survives user closing Chat.
2. **P3 Mini App Creator**: authorize Browser testing of public miniapp preview, save screenshot/diff/console artifacts, open verified preview in familiar browser.
3. **P4 Autonomous Implements**: reuse the current Windows/Linux Runner for physical Computer Use with selected device and user-granted scope; prove GUI execution without relying on a web browser tab.
4. Add `Cloudflare Browser Run Chromium` and optionally Kitesurf stateless fast-path, instrument cost/RSS/latency and verify no session-persistence claims. Test Moli after SPEC-208 producer isolation issues are resolved; until then use qualified fallback.
5. Integrate the **existing SPEC-208 Clef-first DecisionProvider** via a thin adapter, shadow-evaluate before routing real low-risk tasks. Rule-based eligibility and payments/security rules always have final authority.
6. Test provider crash, offline runner, lost ACK and ambiguous non-idempotent side effect. Record receipts, restore from canonical checkpoint, avoid repeat charges and unauthorized external action replay.

No global gating of Core/Chat/Creator because optional Moli, Clef or Cloud Browser experiments fail. A failing Computer Use provider is scoped to that provider, while working features remain publicly UAT-able under the delegated dev scope.

See `docs/architecture/COMPUTER-USE-CLEF-BROWSER-ROUTING-ADR.md` and SPEC-208 R9.

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

### SPEC-324 targeted closure

**Dogfooding runbook:** Owner starts first Goal in old `smartaihub.app`; old SPEC-224 Goal→Run→Debian Runner→workspace→Codex→new project deploy to `aimarkethubs.com`. When old UI/Runner stalls, record blocker, create bounded repair child, verify old route, resume same Goal from last safe checkpoint (no restart-from-zero approval loop). New system receives ownership of an individual Goal only when it can independently execute, continue after disconnection, display true receipts and roll back; old authority observes then safely releases, never dual dispatches.

---

## R1.5 — New-platform-first bootstrap and single-owner Goal handover (2026-11-02)

Build a usable new Core, then Chat plus a persistent Agent, then complex control workspaces and Mini Apps without making Legacy infrastructure cutover a global P0 gate. The existing smartaihub.app Autonomous Implements/Creator can remain operational for Legacy users and may be an optional development command tool where its route, source, authorization and receipts are currently proven. Repairing or migrating it is not required before independent new-platform progress.

Every Goal has one dispatch owner at a time. If the Legacy tool is used, bind the Goal to its current worker_jobs/Runner authority and checkpoint receipts; when handing off, revoke the old dispatch lease before the new authority dispatches. No dual-run and no repeated approvals for ordinary in-grant work. New Goal authority is accepted only after the new platform demonstrates durable continuation after Chat closure, truthful executor-wait states, revocation, device reconnection and rollback. The three R1.4 UI mockups remain design references and are not implementation evidence. See SPEC-325 and the [R1.5 owner-decision register](../../../docs/architecture/R1.5-OWNER-DECISION-PRECEDENCE.md).

The first-time Runner install grants OS-service installation permission and performs one explicit owner pairing. Later boot, network recovery, service restart and routine session renewal happen without a recurring Connect/Login prompt. Pairing after revoke, device transfer, key loss or quarantine always enters a separate authenticated recovery flow; it cannot be triggered by reconnect. R1.5 remote-execution acceptance includes Windows boot before login, Linux systemd boot, Companion closure, lost/recovered network, stale/revoked grant, locked desktop and safe rollback.
