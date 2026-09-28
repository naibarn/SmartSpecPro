# Orchestra Completion Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Orchestra complete or explicitly block a seven-stage implementation lifecycle without silently skipping missing work.

**Architecture:** Add a lifecycle ledger and deterministic gap-recovery protocol. Keep `orchestra/progress.md` for bounded loop counters, keep `orchestra/backlog.md` as a secondary pointer only, and preserve the existing `deep-plan` → `deep-implement` chain. Every blocker routes to the earliest affected stage; every repair invalidates downstream evidence and reruns stale gates.

**Tech Stack:** Markdown skill references, JSON behavior scenarios, Bash skill audit/sync scripts.

**Spec:** `docs/portable-skill-pack/specs/2026-09-20-orchestra-completion-loop-design.md`

## Global Constraints

- Do not modify product code, runtime `orchestra/` state, or unrelated dirty-worktree files.
- Do not run `npm run typecheck` or any full-repository TypeScript check.
- Preserve the existing Test Design Gate and resource-aware typecheck policy.
- Preserve `deep-plan` → `deep-implement` routing and standard light mode.
- A blocker never closes a stage; a blocked stop must include `resume_from` and residual risk.

## Review Focus

- Missing prerequisites must backtrack to the earliest affected stage instead of becoming a skipped stage; cover with lifecycle scenarios.
- A repair must invalidate downstream evidence; cover with stale-gate assertions.
- A clean run must still record `DEBUG_FIX`; cover with no-gap scenario.
- Retry/loop limits must produce a blocked resumable state, not false completion; cover with limit scenario.
- Existing backlog/progress artifacts must remain compatible; cover with artifact-management and audit marker checks.

### Task 1: Add lifecycle and gap-recovery contract

**Files:**
- Create: `skills/orchestra/references/completion-loop.md`
- Modify: `skills/orchestra/references/artifact-management.md`
- Modify: `skills/orchestra/references/gap-closure-before-final.md`
- Modify: `skills/orchestra/references/agent-loop-policy.md`

**Interfaces:**
- Produces the stage state machine, gap schema, recovery transition map, and completion invariants consumed by all later Orchestra steps.

- [x] Add the failing lifecycle contract scenarios and define the expected recovery transitions.
- [x] Add `orchestra/lifecycle.md` inventory and persistence rules.
- [x] Add typed blocker/gap rules, backtracking, stale evidence invalidation, and no-silent-skip invariants.
- [x] Add loop-limit behavior that preserves open gaps and resume stage.

### Task 2: Wire lifecycle into Orchestra execution

**Files:**
- Modify: `skills/orchestra/SKILL.md`
- Modify: `skills/orchestra/references/routing-decision.md`
- Modify: `skills/orchestra/references/quality-gates.md`
- Modify: `skills/orchestra/references/verification-before-completion.md`
- Modify: `skills/orchestra/references/review-convergence.md`

**Interfaces:**
- Consumes the completion-loop contract from Task 1.
- Produces mandatory stage initialization, stage-exit audits, recovery transitions, and final completion invariants.

- [x] Require lifecycle initialization before implementation and carry `current_stage`/`resume_from` through deep-* handoff.
- [x] Require every gate/blocker/review finding to create or update a gap and transition to the earliest affected stage.
- [x] Make `DEBUG_FIX` and `FINAL_VERIFY` explicit lifecycle stages, including clean no-gap evidence.
- [x] Prevent final summary when an open must-do gap, stale required gate, or blocked stage remains.

### Task 3: Add behavior coverage and validate the skill pack

**Files:**
- Modify: `skills/orchestra/references/skill-behavior-tests.md`
- Modify: `skills/orchestra/references/skill-behavior-scenarios.json`
- Modify: `skills/audit-skills.sh`

- [x] Add scenarios for missing TDD design, verify failure repair, review backtracking, clean no-gap debug, and loop-limit blocking.
- [x] Add required reference/gate markers to the skill audit.
- [x] Validate JSON, targeted lifecycle assertions, and `git diff --check` without running repository typecheck.

### Task 4: Publish and integrate

**Files:**
- Modify: installed `/home/dev/.codex/skills/orchestra/` through `skills/publish-to-installed-skills.sh` only.

- [x] Publish the source skill pack.
- [x] Verify installed sync.
- [ ] Commit owned source/docs only and integrate the commit into `main` without disturbing unrelated dirty files.
