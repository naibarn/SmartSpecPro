# SmartSpecPro Codex Instructions

## Project Rules

- Read this file before making changes.
- Prefer minimal, focused changes.
- Do not rewrite unrelated files.
- Preserve existing code style.
- Do not remove or delete any functions, features, or UI capabilities unless explicitly requested by the user.
- Use the package manager already used by this repo.
- Do not add new dependencies unless necessary.
- Do not run `npm run typecheck` in a local/shared implementation session because
  of RAM constraints. Repository-wide TypeScript checks may run in CI only after
  the implementation SHA is integrated into `origin/main`, or locally when the
  user explicitly requests it and resource admission allows it. Never make a
  heavy typecheck a prerequisite for integrating a fast-gate-passing change.
- If you discover issues directly related to the requested work, required
  verification, task-caused failing tests, data safety, security, or correctness,
  report and address them as part of the task.
- If you discover unrelated issues, report them separately and do not change
  them unless the user asks.

## Retired Systems — Strictly Prohibited

The following systems are retired and must not be used, called, imported,
enabled, restored, extended, or developed further:

- Agency and every Agency-related service, router, task, UI, adapter, and
  integration.
- `work/request`
- `work/requests`
- `workpacks/intake`
- `workpacks/discovery`
- `workpacks/roi`
- `workpacks/*` in its entirety.
- `/workflows` and the legacy custom workflow engine in its entirety.
- OpenSandbox, `sandbox_jobs`, Docker/OpenSandbox dispatch, and every related
  integration.

Do not add new callers, routes, schemas, migrations, tests, documentation,
feature flags, or compatibility code that brings any retired system back into
active use. Do not route new work through a retired system as a temporary
workaround.

Removal and migration work is allowed only when explicitly requested. Such
work must first perform a read-only dependency/runtime audit, preserve
unrelated worktree changes, and identify data-retention and rollback impact
before destructive deletion.

Use these replacement boundaries for new work:

- OpenAI Agents API on the Python backend is the agent runtime.
- Risky or isolated execution belongs in the approved Cloudflare Container
  runtime; do not introduce Docker/OpenSandbox as a replacement.
- Hermes, Claude, or Codex may be used as external workers directly; do not
  build a new in-house Agency or workflow engine around them.
- Remaining long-running skill, LLM, media, agent, and external-worker work
  must enter the canonical `worker_jobs` plus outbox control plane before
  execution.

## Spec 224 Verification Resource Profiles

- Select a scoped verification profile: `quick` (small focused checks),
  `package` (one package), `integration` (a bounded cross-service slice), or
  `full` (repository-wide build/typecheck/test gates).
- Resource admission is separate from code correctness. OOM, exit 137,
  `SIGKILL`, stale/missing resource samples for memory-heavy profiles, or a
  recent cgroup OOM kill are `RESOURCE_BLOCKED` / `QUEUED_RESOURCE`, never
  `CODE_FAILED` and never a repair attempt. Baseline failures remain distinct.
- A repository may have at most one live `full` verification lease. Leases
  expire and are reclaimed with a higher fencing version; stale owners cannot
  heartbeat or release a reclaimed lease. Scoped checks do not wait on the
  full-check lease, but must meet their own resource admission requirements.
- Record the profile, revision, command/scope, timestamps, exit/signal,
  resource observation, and outcome as evidence. Redact secrets from commands
  and never persist raw lease owner tokens. Do not blindly retry a resource
  block without a fresh resource observation or changed capacity.
- Full verification remains serialized even when focused checks continue. Keep
  the explicit repository typecheck/RAM restriction below; these profiles do
  not authorize running a forbidden full check.

## Codebase Discovery

Use targeted `rg`, file reads, and normal shell tools to inspect the relevant
files before making changes. Prefer narrow searches and bounded reads, and record
any discovery fallback when a specialized codebase index is unavailable.

## Orchestra

Prefer the `orchestra` skill when the user's request is not merely a factual
question and the work requires inspecting, understanding, changing, or validating
code in the repository. This includes feature work, bug fixes, code reviews,
impact analysis, multi-file changes, architecture/routing decisions, or any
"check the system/code and then decide or implement" request.

Do not use Orchestra for simple factual answers, one-off shell utility requests,
or obvious single-file edits where orchestration adds no value.

When using the `orchestra` skill, apply the same targeted-discovery rule during
task analysis, routing, impact assessment, and sub-agent planning.

## Sub-Agent Model Routing

Use GPT-5.6 Terra (`gpt-5.6-terra`) by default for normal conductor work and every
non-planning Codex sub-agent. Use GPT-5.6 Sol (`gpt-5.6-sol`) only for an agent whose
primary deliverable is planning, such as architecture, decomposition, specification,
product/UX planning, acceptance criteria, wave planning, risk analysis, or choosing an
implementation approach.

When the sub-agent tool exposes a model override, pass the selected model through that
override; Task-packet metadata alone is not enough. An explicit user model request takes
precedence. Do not upgrade implementation, review, test, security, performance, or retry
work to Sol merely because it is complex or high risk.

## Sub-Agent Opening Rules

Main Codex is the conductor and remains accountable for intent, scope, risk,
integration, proof, and the final report. Sub-agents are scoped helpers, not a
way to hand off ownership of the critical path.

Open sub-agents only for meaningful work that benefits from independent context
or parallel review across real boundaries such as DB, API, auth, payments, UI,
proof, customer flow, security, or browser verification. For broad or uncertain
work, start with one read-only scout/explorer first, then add sidecar agents only
when the scout result proves distinct workstreams.

Do not open sub-agents for short one-shot work: single-answer questions, reading
one file, running one command, checking one proof surface, obvious single-file
edits, or fast-lane fixes.

When sub-agents are used:
- avoid fanout of 3-6 agents just to show parallelism
- give each worker explicit `ownership_paths`; agents must not fight over files
- keep critical-path decisions in main Codex
- wait only for results that affect the next decision
- track agent id, role, scope, proof, usefulness, and close status
- close every agent or report why it could not be closed
- reconcile or rebrief agents if the user changes the command and scope drifts

## Communication Style

- Respond in Thai by default unless the user explicitly asks for another
  language.
- Keep answers concise, direct, and practical.
- Put the answer, command, or patch first.
- Avoid long background explanations unless requested.
- For errors, explain the likely cause and the fix directly.

## Coding Workflow

Before editing:

- Inspect relevant files first.
- Identify the smallest safe change.

After editing:

- Summarize changed files.
- Provide test or verification commands.
- If tests were not run, state that clearly.

## Pordee Mode

When the user says "pordee", "พอดี", "ตอบสั้น", "สั้น ๆ", or "กระชับ":

- Use extra concise Thai.
- No long intro.
- No unnecessary bullets.
- Give the practical answer first.

## Parallel Codex Development Workflow

Use the project-neutral lifecycle contract in `skills/development-lifecycle/SKILL.md` for WorkUnit ownership, dependency predicates, valid `WAITING_*` states, independent work, automatic reactivation, and machine-readable handoffs. The repository policy below configures this repository's canonical ref; reusable skills and lifecycle code must read project policy instead of assuming `main`.

Implementation may run in parallel, but `origin/main` is the central source of truth for the current integrated development state. Promote safe, valuable progress at each coherent checkpoint; task completion is not a prerequisite. `main` is not a release-ready, production-ready, or fully validated marker. Release and deployment remain separate gated lifecycles.

### Core invariant

Use this development sequence throughout the task:

`implement → safe checkpoint → FAST INTEGRATION GATE → commit → integrate into origin/main → record handoff → continue`

Repeat this sequence as work advances. Run heavy verification/UAT continuously or after integration against the recorded SHA; release and deployment require their own gates.

Do not use per-session branches as the durable destination for valuable work. If concurrent isolation or repository branch protection requires a temporary branch/PR, promote safe checkpoints throughout the work lifecycle, using the required normal non-force path. Retain a temporary ref only while needed for isolation or protection; verify each integrated SHA before cleanup.

Serialize only the short promotion step so sessions cannot race `origin/main`; do not serialize implementation or wait for unrelated sessions. Any authorized task session may promote work using a normal non-force GitHub path. Never bypass required repository protection.

### Safe checkpoints and session stop

Use `$session-finish` whenever a coherent safe checkpoint is reached and before pausing, stopping, handing off, or ending a session. Triggers include user stop/pause, quota or context limits, provider timeout/rate limit, agent/developer handoff, end of work window, and implementation completion. Do not wait for the task or spec to finish, and do not leave valuable progress only in a branch, worktree, sandbox, or chat.

Partial work may enter `main` when it is coherent, valuable, and safe to coexist with current `main`. Isolate unfinished behavior when needed with a disabled feature flag, internal-only route, unregistered adapter, or another existing containment boundary. Examples include a backend slice before UI, schema/repository before business logic, or an untested provider adapter kept disabled. Do not execute production migrations or enable production behavior as a side effect of checkpointing.

Before stopping, normalize the task-owned delta, reconcile latest `origin/main`, split out any unsafe remainder, pass the FAST INTEGRATION GATE on the exact candidate, commit and promote the largest safe checkpoint, then record the handoff. If the whole delta cannot pass, promote an independent safe subset where possible and preserve the remainder with its owner and next action.

FAST INTEGRATION GATE:

- no syntax/compile error in the changed scope;
- no unresolved merge conflict;
- no damaged or unusable patch;
- no accidental secret.

Commit and promote each safe checkpoint after this gate passes. Record the integrated commit SHA and confirm it is reachable from the updated `origin/main`. For partial work, record completed scope, remaining scope, pending validation, known failures, next action, and a durable handoff/recovery reference.

Do not require full typecheck, full build, heavy tests, integration/UAT, provider/rights checks, or production verification before promotion unless a fast-gate finding shows the change would make the system unusable or unsafe to start. Run those checks after integration through CI, a dedicated runner, or a safe resource window.

Checkpoint outcomes:

- `CHECKPOINT_PROMOTED_PARTIAL` — safe valuable progress is in `origin/main`; the task remains open with a durable handoff.
- `PROMOTED_TO_MAIN` — implementation scope is complete and its commit is in `origin/main`; validation may still be pending.
- `ALREADY_IN_MAIN`
- `FAST_GATE_BLOCKED` — an explicit fast-gate failure prevents this delta from promotion; preserve the exact patch/commit durably and identify owner and next action. Promote any separable safe subset first. This is not completion.

### Resource-safety rule

This is a shared development host and multiple long-running sessions may be active simultaneously.

Implementation sessions MUST NOT run high-resource repository-wide verification merely to finish a scoped task.

By default, do NOT run from ordinary implementation sessions:

- full-repository typecheck;
- full monorepo build;
- full E2E/browser suite;
- full integration suite;
- broad dependency rebuild/install;
- other known high-RAM/high-CPU verification.

Use the fast gate before each checkpoint promotion. Run change-aware scoped and heavy verification after integration, without making resource admission a reason to leave safe valuable progress outside `origin/main`.

Examples:

- UI/presentation-only change → targeted checks / relevant component tests / lightweight compile checks;
- localized backend change → affected unit/integration tests;
- high-risk schema/auth/security/dependency/platform change → promote after the fast gate, then queue required heavy verification against the integrated SHA.

A pre-existing failure on `origin/main` MUST NOT automatically block an unrelated session.

Distinguish:

- regression introduced by the session;
- pre-existing baseline failure;
- environment/tooling limitation.

Do not consume enough shared RAM/CPU to interrupt other active sessions.

### Post-integration verification

Heavy verification, full typecheck, integration/UAT, provider/rights checks, and production gates run after the checkpoint is recorded in `origin/main` and are tied to its SHA. A later checkpoint creates a new SHA and may stale earlier evidence. Passing integration does not establish release or deployment readiness.

Track each pending check against its integrated commit SHA with a durable owner/status/next action. A pending check must not erase, strand, or move the implementation back to a session branch. On failure, create a repair task against current `main`, then commit and promote the repair to `main` as soon as its FAST INTEGRATION GATE passes.

Heavy checks should preferably run:

1. on CI or a dedicated runner; or
2. in a controlled quiet resource window.

Do not wait for unrelated sessions or an available shared-host resource slot before promoting a fast-gate-passing change.

### Integration

Use the repo Skill for promotion mechanics:

`$integration-controller`

from any authorized task session when a safe checkpoint is ready. It must not defer safe partial work solely because the task or a heavy check is pending.

The promotion flow must:

- refresh and reconcile with latest `origin/main` immediately before promotion;
- integrate each safe fast-gate-passing checkpoint promptly, including partial work;
- preserve unrelated dirty work and never stage it accidentally;
- run only the FAST INTEGRATION GATE before promotion;
- record heavy checks as post-integration obligations against the main SHA;
- use normal non-force GitHub promotion and honor required repository protection;
- never remove another session's worktree or discard uncommitted changes as part of promotion.

### Worktree safety

Never automatically run destructive commands against another session's worktree, including:

- `git reset --hard`
- `git clean -fd`
- `git clean -fdx`
- `git worktree remove`
- `git worktree prune`
- `git stash drop`
- `git stash clear`
- force push
- destructive branch deletion

A dirty worktree may contain valuable uncommitted implementation.

Do not assume `DIRTY` means "merge it" or "discard it".

### Canonical source state

`origin/main` is the latest integrated development state and the first durable landing point for safe valuable progress. It does not certify release readiness, production readiness, or full validation. Release/tag and production deployment follow separate gates.

A local checkout or worktree may legitimately be behind `origin/main`.

Do not assume that pushing a branch updates `/home/dev/projects/SmartSpecPro`.

Deployment/build synchronization is a separate lifecycle.

### Skills are authoritative for workflow details

Do not duplicate or reinvent the detailed finish/integration procedures in chat.

When the lifecycle action is requested:

- safe checkpoint or session pause/stop/handoff → read and execute `$session-finish`
- checkpoint reconciliation/promotion → read and execute `$integration-controller`

The Skill instructions and bundled scripts define the detailed procedure.

<!-- ASTRYX:START -->
Astryx v0.6.3 · 164 components
CLI: run every command as `npm run astryx -- <cmd>` from the repo root (shown below as `astryx ...`).

SETUP (once, in your app entry e.g. main.tsx) — without these, components render unstyled:
  import "@astryxdesign/core/astryx.css";
  import "@astryxdesign/theme-neutral/theme.css";
  import "@astryxdesign/core/tailwind-theme.css";
SmartSpecPro already uses Tailwind preflight; do not add Astryx reset globally unless a focused browser regression pass approves it.

WORKFLOW — discover, don't guess. Before writing UI:
1. `astryx build "<idea>"` — START HERE: returns a kit (closest [page] + [block]s + [component]s). No args = full playbook.
2. `astryx template <name> [--skeleton]` — scaffold the [page]/[block]s it named, or study their layout. Templates are reference code.
3. `astryx component <Name>` — props + examples for every component you use.

RULES:
- No <div> — components do all layout/spacing, page frame included.
- Frame first: read `astryx docs layout` before writing any page or screen — page frame, region widths, breakpoint behavior.
- Dense data = rows (Table, List/Item), never Card-wrapped list items; Card is for standalone widgets. Status = StatusDot/Token; Badge = counts only.
- Custom styling: component props first; else style/className with tokens — var(--color-*|--spacing-*|--radius-*). No raw hex/px. (No StyleX/Tailwind compiler here — don't use xstyle/utility classes.)
- Tokens for every value (`astryx docs tokens`). Brand/accent belongs in the theme (`astryx theme list` / `theme add <slug>`, or `astryx theme template` for a custom one) — never override --color-* in :root.
- SELF-CHECK before you finish: re-read the file and replace any raw <div>/<span> layout, imported .css/@apply, or hardcoded value (#hex, 16px) with the component or a token (var(--color-*|--spacing-*|…)). If unsure a component/prop exists, run `astryx component <Name>` / `astryx search "<thing>"`; don't hand-roll CSS.

MORE CLI:
  search "<query>"   find any component / hook / doc / template / block
  component --list   164 components by category
  template --list    page + block recipes
  docs <topic>       browser-support, cli-integrations, color, elevation, getting-started, icons, illustrations, internationalization, layout, migration, motion, principles, shape, spacing, styling-libraries, styling, theme, tokens, typography, working-with-ai
  swizzle <Name>     eject component source for deep customization
  upgrade --apply    run after any Astryx or integration dependency bump
<!-- ASTRYX:END -->
