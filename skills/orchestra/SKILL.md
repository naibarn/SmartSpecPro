---
name: orchestra
description: "Route multi-step development and coordinate implementation, integration, and recovery using existing skills."
license: MIT
---

# Orchestra — Development Conductor

Use the existing repository `AGENTS.md` and [development lifecycle](../development-lifecycle/SKILL.md). The goal is working software, not completion of an orchestration checklist. Prefer direct execution when delegation adds no value. Never invent a new control plane or an extra approval boundary.

## Route the task

### Canonical SPEC-ID requests

When a user supplies a `SPEC-ID` (with or without `/orchestra`) and asks to
continue, implement, finish, or debug it, resolve the ID from the current
configured canonical Git ref before routing. Use the canonical Spec index and
registry authority metadata (`specs/_status/spec-index.json` and the configured
registry source), then read that entry's `spec.md`, existing Spec HandOff
manifest/ledger/history, relevant implementation and planning artifacts, and
current Git/PR state. The registry entry determines SPEC identity and scope;
copied descriptions, stale chat text, directory-name matches, and another SPEC's
artifacts cannot redirect the task. If the requested ID is aliased, conflicted,
missing, or not canonical, follow its registry disposition and resolve authority
before changing SPEC files.

Select the existing `deep-plan`, `deep-implement`, resume, or debug route from
the reconciled artifacts and current source state. Reuse completed planning and
implementation; resume the earliest actually incomplete requirement. Apply this
rule to every SPEC-ID, not just named examples. Continue through functional
output, normal protected integration into the configured canonical ref, and a
verifiable update to the existing Spec HandOff without asking the user to
orchestrate each stage. A merge receipt or documentation-only commit is not
functional output and cannot close a SPEC requirement or count as completion;
when documentation is the actual requirement, verify it directly and record
that requirement's evidence in the canonical HandOff instead of looping on
receipts.

- **Simple fix / UI edit:** investigate the affected files, implement directly, run a relevant focused check, integrate a coherent checkpoint, and continue.
- **Feature / SPEC:** follow `deep-plan` when planning is needed, then `deep-implement` section by section. Do not repeat finished planning or require every requirement to pass final acceptance before integration.
- **Agents SDK SPEC implementation (migration path):** for remaining SPEC implementation work, keep this Codex session as the conductor and use the Python OpenAI Agents SDK as the planner, implementation/debug agent, and independent reviewer. Model requests must go through the existing `OpenAIAgentsAdapter` and `openai_agents_gateway_model.py` SmartAIHub Gateway transport, with code-edit and focused-check tools scoped to the registered task worktree and authorized SPEC section. Reuse the existing Deep Implement state, DevelopmentRun/`worker_jobs` plus outbox for long-running execution, Spec HandOff, approval, and settlement; do not add a second orchestrator or authority system. Before each run, verify the route from the actual SDK/provider trace and Gateway usage receipt. The API's default adapter call can have no registered tools, and its `nativeSkillRuntime` branch currently runs an SDK Agent directly; do not use that branch for SPEC implementation unless it is explicitly Gateway-backed and exposes scoped write/check tools. If the configured Gateway or required tools are unavailable, mark the implementation route `UNVERIFIED` and do not silently implement through Codex Native or direct provider APIs.
- **Moli + Playwright UAT:** after an authorized development build is available, use the repository's Moli-backed Playwright UAT as the default agent-oriented browser verification (`npm run test:uat`); verify actual interactions, state transitions, tenant boundaries when relevant, browser errors, and preserve the trace/receipt. Use Chromium when human-browser rendering or interaction semantics need separate confirmation. Keep functional UAT evidence distinct from Gateway usage evidence. Label runs `AGENTS_SDK_VERIFIED` only when the SDK, Gateway provider route/accounting, implementation evidence, focused checks, and required browser UAT are all confirmed; never infer it from this policy, a successful Moli browser session, or a Codex subscription trace alone.
- **Parallel work:** delegate only genuinely independent owned file scopes. Do not serialize unrelated implementation work; serialize the Git merge-critical section when necessary.
- **Debug / blocked task:** inspect errors, logs, source and actual environment; repair, retry with an improved strategy, or continue independent work. A verification tool being unavailable is not a defect in the implementation.

Load the relevant existing reference **only when needed**, rather than loading the entire skill catalog. For complex routing use `references/routing-decision.md`; for delegates use `references/sub-agent-dispatch.md` and `references/task-packet-format.md`; for concrete debugging use `references/data-first-debug.md`. Other references are optional specialist guidance, not implicit preconditions.

## Execute

1. Identify the user's intended functional outcome, existing work, and current canonical Git ref. Inspect targeted source and tests; avoid rebuilding already completed plans or running global branch audits during ordinary feature work.
2. Make a short implementation plan only when necessary. Choose and own the next independently useful code slice; preserve unrelated working-tree edits.
3. Implement and debug with the available LLM, scripts and tools. Use focused syntax/compile/checks for the changed scope. If a normal technical failure occurs, diagnose and fix it instead of asking the user merely to authorize continuation.
4. **Integrate each coherent development checkpoint** through the repository's normal non-force, protected Git path. Use [integration-controller](../integration-controller/SKILL.md); do not wait for full SPEC acceptance, all UI screenshots, all test suites, hosted UAT, or production provisioning. Required repository checks still apply and must not be misreported or bypassed.
5. Record the integrated SHA, finished scope, unresolved gaps and next action in the existing HandOff. Refresh the base for the next slice; reconcile in-flight changes at their next checkpoint without resetting other sessions.
6. Build/preview the integrated development source on the authorized development runtime as soon as possible. Review, test and close remaining gaps iteratively; each subsequent fix can become another integrated checkpoint.
7. Continue until the requested scope is implemented and the relevant testing is done, or until an **actual external permission/product decision** prevents the affected path. Continue independent work while any path is waiting.

### SmartAIHub authenticated UAT

For SmartAIHub UI, authentication, tenant permissions, Mini Apps, or Gateway work,
always apply [UI Browser Verification](references/ui-browser-verification.md)
as part of development verification. Moli is the default for agent-oriented UAT;
use Chromium when the user asks to verify behavior like a human browser user.
Direct Codex over SSH is supported and Runner is not a prerequisite.

## Durable progress and interruption recovery

For multi-step execution, **write durable state**, not just conversation memory. In an owned isolated Orchestra workspace, update its `orchestra/progress.md` (what works, active step, source/commit/Main SHA, workspace, tests, unresolved defects, and exact next action) and `orchestra/backlog.md` (remaining sections and dependencies) at each meaningful wave/integration checkpoint and before a known session boundary. When multiple sessions share a checkout, use each task's existing WorkUnit/Spec HandOff or Deep Implement `state_dir` instead of concurrently overwriting the same `orchestra/` files. Record the owned in-flight step **before** dispatching long-running work so a lost session does not orphan it. For Deep Implement, the existing section-state tool now writes `{state_dir}/HANDOFF.md` automatically from the authoritative config: record `in_progress` before work, local SHA after commit and merged SHA only after protected merge; read it anytime with `--show` (see `deep-implement` skill). The canonical Spec HandOff remains authoritative for cross-workunit requirement closure; neither projection substitutes for it. Do not use these writes as merge approval gates.

When work is long enough to risk context loss, follow [compaction-safety](references/compaction-safety.md) to write the owned workspace's `orchestra/snapshot.json` and `orchestra/snapshot.md` using the **existing schema**, or update the existing task-owned HandOff when sharing a checkout. On `/orchestra resume`, or when unfinished `orchestra/` artifacts are found, apply [session-resume](references/session-resume.md): read saved progress, backlog, snapshot (if present), plan/section state and Git/PR reality, then continue from the earliest **actually incomplete** step. Never blindly restart, overwrite newer outputs or repeat an already integrated step. Preserve partial/dirty work and use the existing canonical Spec HandOff where configured.

## What does and does not block progress

- **Repair automatically:** syntax/type errors, ordinary failing tests, Git conflicts, outdated base, missing development migration on an authorized dev DB, broken fixtures, incorrect field names, missing tools when an allowed alternative exists, and incomplete UI behavior.
- **Defer without blocking unrelated integration:** final SPEC/UAT evidence, screenshot differences, polish, post-integration full tests, production deployment, hosted runtime provisioning and environment capabilities not required for the current development slice. Record them in HandOff, never as PASS.
- **Stop only the affected operation:** missing genuine external permission, irreversible or destructive action without authority, protected-branch required check failure, or a demonstrated critical security/data-isolation defect in the change being integrated. Preserve work and identify the exact decision/permission needed.

A routine UI/UX change does not trigger a three-specialist security review or a seven-stage lifecycle gate by default. Use security expertise when the diff actually changes authentication, authorization, tenant data isolation, secrets, user-data handling or other security-sensitive paths. Production acceptance is distinct from development integration.

## Reporting and handoff

Be concise: **what now works**, code/Main SHA, focused checks, development preview/build status, outstanding gaps with owners and next actions. Do not claim a pending or unrun check passed. Do not report completion for functionality that has not been implemented or verified; an integrated partial checkpoint is valuable progress but not final acceptance.

Do not make banners, reviewer waves, requirement matrices, repeated clean review rounds, lifecycle ledgers, resource leases or broad repo inventories mandatory for ordinary development. Use the existing specialized tools where they provide concrete value and do not turn an optional diagnostic into a transition blocker.
