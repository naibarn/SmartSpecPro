# SmartSpecPro Codex Instructions

## Project Rules

- Read this file before making changes.
- Prefer minimal, focused changes.
- Do not rewrite unrelated files.
- Preserve existing code style.
- Use the package manager already used by this repo.
- Do not add new dependencies unless necessary.
- If you discover issues directly related to the requested work, required
  verification, failing tests, data safety, security, or correctness, report and
  address them as part of the task.
- If you discover unrelated issues, report them separately and do not change
  them unless the user asks.

## SocratiCode First

This repository has SocratiCode installed as the local codebase intelligence MCP.
When developing with Codex, use SocratiCode as the default discovery layer before
broad file reads or grep-style exploration.

- Use `codebase_status` if you are unsure whether the index is ready.
- Use `codebase_search` before opening many files or running broad `rg` searches
  for architecture, feature, service, router, UI, data model, or domain questions.
- Use `codebase_impact` before refactoring, deleting, renaming, or changing shared
  modules, routers, schemas, services, or exported symbols.
- Use `codebase_graph_query`, `codebase_graph_stats`, or `codebase_flow` when
  tracing imports, dependency direction, runtime flow, or integration boundaries.
- Use `codebase_symbols` or `codebase_symbol` when locating or understanding a
  function, class, exported constant, route handler, or shared type.

After SocratiCode narrows the relevant area, use `rg`, file reads, and normal
shell tools for exact verification and edits. If the SocratiCode MCP transport is
unavailable, fall back to shell search and mention the fallback in the summary.

## Orchestra

Prefer the `orchestra` skill when the user's request is not merely a factual
question and the work requires inspecting, understanding, changing, or validating
code in the repository. This includes feature work, bug fixes, code reviews,
impact analysis, multi-file changes, architecture/routing decisions, or any
"check the system/code and then decide or implement" request.

Do not use Orchestra for simple factual answers, one-off shell utility requests,
or obvious single-file edits where orchestration adds no value.

When using the `orchestra` skill, apply the same SocratiCode-first rule during
task analysis, routing, impact assessment, and sub-agent planning whenever
SocratiCode is active.

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

<!-- ASTRYX:START -->
Astryx v0.1.2 · 148 components
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
- No <div> — components do all layout/spacing. Full page → AppShell; sidebar nav → SideNav.
- Custom styling: component props first; else style/className with tokens — var(--color-*|--spacing-*|--radius-*). No raw hex/px. (No StyleX/Tailwind compiler here — don't use xstyle/utility classes.)
- Tokens for every value (`astryx docs tokens`). Brand/accent via `astryx theme` — never override --color-* in :root.

MORE CLI:
  search "<query>"   find any component / hook / doc / template / block
  component --list   148 components by category
  template --list    page + block recipes
  docs <topic>       color, elevation, icons, illustrations, migration, motion, principles, shape, spacing, styling, theme, tokens, typography
  swizzle <Name>     eject component source (--gap reports why)
  upgrade --apply    run after any @astryxdesign/core bump
<!-- ASTRYX:END -->
