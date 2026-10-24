# SmartSpecPro Codex Instructions

## Project Rules

- Read this file before making changes.
- Prefer minimal, focused changes.
- Do not rewrite unrelated files.
- Preserve existing code style.
- Do not remove or delete any functions, features, or UI capabilities unless explicitly requested by the user.
- Use the package manager already used by this repo.
- Do not add new dependencies unless necessary.
- For project-owned skills, edit the canonical `skills/` sources first. Inspect
  and reconcile installed differences before choosing a sync direction; do not
  overwrite newer work with an older mirror. Before finishing a skill change,
  run `bash skills/publish-to-installed-skills.sh` and
  `bash skills/verify-installed-skills-sync.sh` so every package in
  `skills/mirrored-skills.txt` matches its installed runtime mapping. Preserve
  repo-only tests and host-managed `.system` skills. Known mirror drift is an
  unfinished skill change, not a completed sync.
- Do not run `npm run typecheck` in a local/shared implementation session because
  of RAM constraints. Repository-wide TypeScript checks may run in CI only after
  the implementation SHA is integrated into `origin/main`, or locally when the
  user explicitly requests it and resource admission allows it. Never make a
  heavy local typecheck a prerequisite for integrating a fast-gate-passing change.
  Run CI checks when repository protection or the requested outcome requires
  them; optional CI must not delay a safe development checkpoint.
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
- Reuse the primary checkout for ordinary development and focused verification. Only when isolation is actually necessary, create task worktrees through `workspace_authority.py` and immutable build/release source worktrees through `canonical_source.py`; preserve unknown worktrees. These tools are creation mechanisms, not a requirement to create a worktree.

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

### Autonomous non-production approval across SPECs

The user's instruction to start or continue a development task authorizes its
normal end-to-end implementation, focused verification, repair, Git commit,
push/integration and migration of the configured development database. This
repository has one human developer: that user is the authority across its local
branches and worktrees. Do not search for another human owner, invent grants,
or request the same approval at each phase. Local owner/lease records describe
process coordination and recovery; they are not an additional human permission.
Preserve actual in-flight writes and serialize conflicting Git/DB mutations.

Apply the shared policy in `skills/development-lifecycle/workspace-policy.md`
across all skills and SPECs, including SPEC 224. Existing tenant/provider IAM,
credential scope, real GitHub branch protection, unrecoverable data-loss and
genuinely production-specific controls remain scoped to those operations;
they do not turn ordinary dev work into a production approval workflow.

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

## Single-Developer Git Workflow

Use `skills/development-lifecycle/SKILL.md`, `$integration-controller`, and `$session-finish` for checkpoint and integration details. `origin/main` is the current shared development baseline; it does not certify production readiness.

### Default development flow

`refresh main → implement → focused check → commit + push/integrate → verify main == origin/main → apply pending dev migrations → continue debugging`

The authoritative detailed policy is
`skills/development-lifecycle/workspace-policy.md`. Use the primary checkout
on local `main` tracking `origin/main`; no branch/worktree per task or section.
Each development commit is followed immediately by non-force push/integration
and fetched local/remote SHA reconciliation before the next slice. Do not leave
branches open while waiting for optional full tests, UAT, complete SPEC evidence
or historical workspace cleanup. Main is an integrated development baseline;
debugging and forward fixes continue there after the focused fast gate.

Run a focused check appropriate to the changed files. Do not wait for full tests, UAT, task completion, unrelated work, or a build to checkpoint safe code. When only an artifact is needed, use `pnpm run build:canonical` from the repository root or `apps/web`; both invoke the same latest-main isolated builder. This does not activate production. To publish and restart the Linux web service from that exact artifact, use `pnpm run release:web:linux` or its compatibility alias `npm run build:deploy`; both enter the existing sudo-gated release workflow and verify runtime health. Do not automatically build or deploy after every merge. If a build fails, diagnose and repair the relevant issue; unrelated development can continue. Record only useful remaining work in the existing HandOff; do not create extra ledgers or status gates.

### Workspace and release evidence

- Preserve dirty or separately owned work. Keep the primary source checkout current in place when safe. Historical workspace housekeeping must not delay integration of the current safe change.
- Keep integration, build, publication, and serving claims distinct. Claim a user-visible or runtime fix only after checking the actual target environment. A build alone does not prove deployment.
- Production release, production database mutation, external publication, or other irreversible operations use their existing authorization and safety controls. The configured dev database is covered by the standing development authority below.

At a checkpoint, stage only task-owned paths, run the fast gate (valid patch, no conflict, no accidental secret), commit, and push/integrate through the path repository rules allow. If branch protection requires a PR, open it without delaying unrelated work and merge when its required conditions pass. Never stage or overwrite another owner's changes, force-push, bypass protection, or perform production actions without their existing authorization.

Before reporting an integrated task finished, fetch and verify the resulting integrated commit is reachable from `origin/main`; for squash merges verify the actual merge SHA and owned diff. A local commit, pushed feature branch, or open PR is not integration. For any temporary task branch/worktree created by this task, return to the primary checkout, safely sync `main`, and complete ownership-safe retirement after integration. If cleanup is blocked, report the exact path, retained content, reason and next action; do not silently abandon it or create another copy to avoid the blocker. Build/release workspaces and artifacts retain their existing lease, retention and rollback controls; never delete a serving or rollback source as ordinary task cleanup.

### Development database freshness

Keep the configured development database current as part of ordinary work,
especially immediately after integrating schema/migration changes and before
asking test users to exercise them. The start instruction already authorizes
this: do not leave applicable migrations unapplied waiting for a Database Owner,
release approval, another user confirmation or full UAT. Use the existing
migration runner, serialize DDL, back up before destructive or broad recovery,
repair normal technical failures and verify schema plus applied evidence.
Historical ledger drift is a repair task, not permission to fabricate applied
rows. Do not replay retired-system migrations to modernize active features.
Production targets, missing credentials and an actually unrecoverable destructive
operation retain their exact boundary; continue all other dev work.

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
