# SmartSpecPro Codex Instructions

## Project Rules

- Read this file before making changes.
- Prefer minimal, focused changes.
- Do not rewrite unrelated files.
- Preserve existing code style.
- Do not remove or delete any functions, features, or UI capabilities unless explicitly requested by the user.
- Use the package manager already used by this repo.
- Do not add new dependencies unless necessary.
- Do not run `npm run typecheck` anywhere in this repository because of RAM
  constraints. Run the repository's TypeScript type-check command only when
  the user explicitly requests it; this rule applies across all packages,
  workflows, and agents.
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

This repository supports multiple Codex/Claude implementation sessions running in parallel through isolated Git worktrees.

### Core invariant

Use:

`1 session = 1 task/Spec = 1 worktree = 1 session branch`

Implementation sessions MUST NOT push or merge directly into `main`.

Only the designated Integration Controller may advance `origin/main` while parallel development is active.

### Session completion

When an implementation session is complete, use the repo Skill:

`$session-finish`

Do not replace this with an ad-hoc sequence of commit/push commands.

The Skill owns:

- scoped verification based on the actual change risk;
- reconciliation with the latest `origin/main`;
- commit/push of the session branch;
- READY marker creation;
- session handoff/completion state.

A session may finish as:

- `READY_FOR_INTEGRATION`
- `READY_FOR_INTEGRATION_WITH_BASELINE_ISSUES`
- `READY_FOR_HEAVY_VERIFICATION`
- `ALREADY_IN_MAIN`
- `SESSION_BLOCKED`

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

Use change-aware scoped verification instead.

Examples:

- UI/presentation-only change → targeted checks / relevant component tests / lightweight compile checks;
- localized backend change → affected unit/integration tests;
- high-risk schema/auth/security/dependency/platform change → mark heavy verification pending when a safe heavy-verification slot is required.

A pre-existing failure on `origin/main` MUST NOT automatically block an unrelated session.

Distinguish:

- regression introduced by the session;
- pre-existing baseline failure;
- environment/tooling limitation.

Do not consume enough shared RAM/CPU to interrupt other active sessions.

### Heavy verification

Heavy verification is a separate lifecycle from normal session completion.

Use:

`READY_FOR_HEAVY_VERIFICATION`

when a task requires expensive repository-wide verification that cannot safely run while other development sessions are active.

Heavy checks should preferably run:

1. on CI or a dedicated runner; or
2. in a controlled quiet resource window.

Do not wait for unrelated implementation sessions to finish merely to complete a low-risk session.

### Integration

Use the repo Skill:

`$integration-controller`

only from a designated integration session.

The Integration Controller must:

- discover eligible session branches automatically;
- preserve active/dirty worktrees;
- integrate one branch at a time;
- refresh `origin/main` before each integration;
- use scoped verification for normal branches;
- defer high-resource verification when no safe resource slot exists;
- never force-push;
- never perform destructive cleanup as part of integration.

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

`origin/main` is the canonical integrated Git baseline.

A local checkout or worktree may legitimately be behind `origin/main`.

Do not assume that pushing a branch updates `/home/dev/projects/SmartSpecPro`.

Deployment/build synchronization is a separate lifecycle.

### Skills are authoritative for workflow details

Do not duplicate or reinvent the detailed finish/integration procedures in chat.

When the lifecycle action is requested:

- session completion → read and execute `$session-finish`
- repository integration → read and execute `$integration-controller`

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
