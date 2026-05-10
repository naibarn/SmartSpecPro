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
