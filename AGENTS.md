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
  heavy local typecheck a prerequisite for integrating a fast-gate-passing change.
  Required repository checks still apply and must use an authorized CI runner.
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

- Choose a scoped profile (`quick`, `package`, `integration`, or `full`) for the work. Keep full-check leases serialized; scoped work does not wait for a full-check lease.
- Classify OOM, exit 137, SIGKILL, or missing/stale resource evidence as `RESOURCE_BLOCKED` / `QUEUED_RESOURCE`, not code failure. Retry only after fresh resource evidence or changed capacity; keep baseline failures distinct.
- Record profile, revision, command/scope, time, resource evidence and outcome. Redact secrets and never store lease tokens. Do not run `npm run typecheck` in a local/shared implementation session.
- Create task worktrees through `workspace_authority.py` and canonical source worktrees through `canonical_source.py`; preserve unknown worktrees.

## Codebase Discovery

Use targeted `rg`, file reads, and normal shell tools to inspect the relevant
files before making changes. Prefer narrow searches and bounded reads, and record
any discovery fallback when a specialized codebase index is unavailable.

For conflict resolution, use `skills/development-lifecycle/git_capabilities.py`:
on Git >=2.56 prefer `git add --resolved -- <scope>` through that policy; never
use broad staging to mark conflicts resolved. `--resolved` guards against
remaining textual markers; it is not semantic verification. Verify staged paths
before commit and preserve compatibility with Git <2.56 external runners via
the policy's explicit-path fallback.

## Outcome Completion

Use `skills/orchestra/references/autonomous-completion-contract.md` for recovery and closure. Debug and retry fixable technical failures automatically; continue independent work and keep non-blocking gaps in the existing WorkUnit/Spec HandOff. Stop only the affected path for a real external authority/product decision, critical security or data-safety issue, unauthorized irreversible action, or a required repository check that has not passed. Claim completion only from the required evidence.

## Orchestra

Use Orchestra to route repository work to the existing skills. Follow Deep Plan and Deep Implement when planning and section tracking are needed; handle a clear, bounded coding or debugging task directly with a focused check. Skill files own detailed procedures; they do not add approval gates.

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

Use `skills/development-lifecycle/SKILL.md`, `$integration-controller`, and `$session-finish` for detailed ownership, promotion, checkpoint and handoff procedures. `origin/main` is the integrated development baseline, not a release-readiness signal.

### Development loop

`Deep Plan → Deep Implement → Focused Check → Commit → Protected Merge Main → Build Debian → Debug → Gap Closure`

Use the existing task WorkUnit/Spec HandOff and Deep Implement section state. Record the owner/workspace, current base and commit, completed and in-progress sections, exact Main SHA after merge, checks actually run, open gaps and next action. Persist an in-flight step before lengthy work; resume from verified state without replaying completed work. Keep state writes atomic through the existing tools. Do not create a competing progress ledger.

Direct coding and debugging on Debian may run without `worker_jobs`. Use `worker_jobs` plus outbox for hosted background jobs and the long-running skill, LLM, media, agent and external-worker work identified by project policy.

Run focused checks for the changed slice and all actual GitHub required checks before merge. UI/UX slices do not wait for full SPEC acceptance, full UAT or production verification when the slice is ready and required checks pass. After protected merge, record the exact reachable Main SHA, build Debian from that SHA through the configured build workflow, debug any build/runtime defect, and continue gap closure. A build or test failure is evidence to diagnose and repair, not a reason to ask whether to continue. Track non-blocking acceptance and production gaps in HandOff for later closure.

Integrate coherent, safe checkpoints promptly; task completion and unrelated workspace cleanup are not merge prerequisites. Use the normal non-force protected PR path, honor required reviews/checks, and never bypass branch protection. Preserve dirty work owned by others; do not stage it, overwrite it, reset it, or remove its worktree. Do not force-push. Production actions still require their existing authorization and gates.

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
