---
description: "AI Orchestra Conductor: analyzes tasks, dispatches specialized ssp-* sub-agents in parallel waves, integrates results, enforces quality and security gates, manages file-based memory to survive context compaction, and automatically chains into deep-project/deep-plan/deep-plan-quick/deep-implement when needed. Use for any medium+ complexity task spanning multiple domains (frontend + backend, or backend + Python, etc.)."
argument-hint: "<task description> or 'resume'"
---

# Orchestra — AI Multi-Agent Conductor (launcher)

This command is a thin launcher. The full, canonical Orchestra workflow lives in
the skill definition and its reference files — the single source of truth that is
kept in sync across Claude Code, Codex, and OpenCode hosts.

**Do this now:**

1. Read `skills/orchestra/SKILL.md` in full (relative to the repository root).
2. Follow its instructions exactly, starting from its "CRITICAL: First Actions"
   section (print the banner, check for an existing `orchestra/` session, run
   platform detection, etc.).
3. Load the `skills/orchestra/references/*.md` and `*.json` files on demand, as
   SKILL.md directs. When SKILL.md refers to a reference with a path relative to
   the skill directory (e.g. `references/task-analysis.md`), resolve it under
   `skills/orchestra/` (e.g. `skills/orchestra/references/task-analysis.md`).

**Task input:** `$ARGUMENTS`

If `$ARGUMENTS` is empty or equals `resume`, follow SKILL.md's resume path
(re-hydrate from the existing `orchestra/` session directory) instead of starting
a new analysis.

> Why a launcher? SKILL.md is ~900 lines and evolves continuously. Embedding a
> full copy here caused it to silently drift months out of date. Deferring to the
> live SKILL.md guarantees `/orchestra` always runs the current workflow.
