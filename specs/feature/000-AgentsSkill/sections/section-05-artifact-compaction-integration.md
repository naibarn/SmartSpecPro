Good. No existing reference files yet. Now I have all the context needed to generate the section content. Here is the complete implementation section:

---

# Section 05 — Artifact Management, Compaction Safety & Skill Pack Integration

**Feature:** 000-AgentsSkill
**Depends on:** Section 01 (contract schemas, directory structure)
**Blocks:** Section 06 (Orchestra SKILL.md)
**Batch:** 2 (can run in parallel with sections 02 and 07)

---

## Overview

This section creates four reference documents that collectively define how the `orchestra/` working directory is managed across the full lifecycle of an orchestration session: what files live there, how context compaction is handled safely, how a session is resumed after interruption, and how orchestration hands off to the `deep-plan-codex` and `deep-project` skills for large or project-scope tasks.

---

## Deliverables

All four files go in `deep_plan/skills/orchestra/references/`:

| File | Lines | Purpose |
|------|-------|---------|
| `artifact-management.md` | 100–200 | Full `orchestra/` file inventory, lifecycle rules, git tracking |
| `compaction-safety.md` | 100–200 | Context Health Check protocol, snapshot schema, red-state protocol |
| `session-resume.md` | 100–150 | R4 algorithm (Read, Restore, Reconcile, Resume) with examples |
| `skill-pack-integration.md` | 100–150 | Handoff mechanics for large/project scope tasks |

---

## TDD Validation (Run Before Marking Section Complete)

These checks must pass before this section is considered done. Implementers should work through this list top to bottom.

### artifact-management.md

- **S:** File inventory table covers exactly 11 entries under `orchestra/`: `plan.md`, `progress.md`, `backlog.md`, `decisions.md`, `contracts.md`, `platform.md`, `decision-mode.md`, `risk_register.md`, `snapshot.json`, `snapshot.md`, `archive/`
- **S:** Document states that `orchestra/` lives at project root (e.g., `/home/dev/projects/SmartSpecPro/orchestra/`) and is relative to the current working directory when `/orchestra` is invoked
- **S:** Document includes the concurrent-session collision note: "If two developers simultaneously run `/orchestra` sessions, they will share this directory — this is an acceptable limitation for a single-developer workflow tool."
- **S:** Banner note is specified: "`orchestra/` is at project root and is shared across sessions."
- **S:** Lifecycle rules specify that `contracts.md` is frozen after Wave 1 (never changed mid-session)
- **S:** Lifecycle rules specify that `decisions.md` is append-only with timestamps
- **S:** Fresh-start-vs-resume flow is documented: when existing `orchestra/` is detected, archive to `orchestra/archive/<ISO-timestamp>/`
- **S:** Git tracking recommendation is explicit: `orchestra/` should be committed; `.gitignore` must NOT exclude it
- **C:** The 11 files in the inventory match the files that SKILL.md Steps 1–8 actually create and update (verify against Section 06 when it is written)

### compaction-safety.md

- **S:** Defines exactly 3 context state classifications: `green`, `yellow`, `red` with criteria for each
- **S:** States when Context Health Check (CHC) runs: after every wave, before any HIGH/CRITICAL work, after >5 wave cycles
- **S:** Documents the snapshot-before-compact protocol for red state in 4 numbered steps: (1) update `orchestra/snapshot.json`, (2) update `orchestra/snapshot.md`, (3) update `progress.md` and `backlog.md`, (4) notify user
- **S:** Contains the canonical snapshot JSON schema with exactly 9 fields under `"checkpoint"`: `timestamp`, `task_description`, `phase`, `completed_waves`, `in_progress`, `pending_waves`, `decisions`, `blockers`, `key_files`
- **S:** Explicitly notes that `key_files` must use absolute paths only (not relative paths)
- **S:** Explains resume-after-compaction: when user clears context and re-invokes `/orchestra`, skill reads `orchestra/snapshot.md` and `orchestra/snapshot.json` to restore state
- **C:** Snapshot field names here exactly match what SKILL.md Step 8 will write and what `session-resume.md` R4 Step 1 (Read) parses

### session-resume.md

- **S:** Documents all 4 steps of the R4 algorithm with headings: Read, Restore, Reconcile, Resume
- **S:** Read step: reads `orchestra/snapshot.json` for structured state AND `orchestra/snapshot.md` for human summary AND all files listed in `checkpoint.key_files`
- **S:** Restore step: re-establishes mental model of what was being built, what decisions were made, what contracts are active, what waves are complete, what is in-progress
- **S:** Reconcile step: verifies actual file state matches snapshot state; handles files that are missing or newer than the snapshot
- **S:** Resume step: continues from `in_progress` step; explicitly states "Never re-execute completed waves unless files are missing"
- **S:** At least one concrete example is included (e.g., a wave-2 resume scenario showing which files are read and what state is restored)
- **C:** Field names read in the R4 algorithm (`completed_waves`, `in_progress`, `pending_waves`, `key_files`, `decisions`, `blockers`) match the canonical snapshot schema in `compaction-safety.md`

### skill-pack-integration.md

- **S:** Documents the `large` scope handoff: orchestra creates a requirements spec file, instructs user to run `/deep-plan-codex @spec-file.md`, and logs expected output paths to `orchestra/backlog.md`
- **S:** Documents the `project` scope handoff: orchestra creates a high-level requirements document and instructs user to run `/deep-project @requirements.md`; after splits, runs large-scope pattern for each split
- **S:** Documents handoff verification on resume: when `/orchestra resume` is invoked after a deep-* handoff, check `orchestra/backlog.md` for expected artifact paths
- **S:** Documents the user-facing message when artifacts are missing: `"Expected artifacts from deep-plan not found at [path]. Did the deep-plan session complete successfully?"`
- **S:** Documents that orchestra does NOT proceed until the user confirms or files exist
- **S:** Documents state synchronization: after deep-* skills complete, orchestra syncs output artifacts into `orchestra/progress.md`
- **S:** Documents shared context passing: the `orchestra/` directory location is passed to deep-* invocations so they can append to `orchestra/decisions.md`
- **X:** References to `/deep-plan-codex`, `/deep-project`, and `/deep-implement` match the invocation patterns (verify these skill names against the existing `deep_plan/` plugin structure)

---

## Implementation Details

### File 1: `deep_plan/skills/orchestra/references/artifact-management.md`

This document is the authoritative reference for what the `orchestra/` working directory contains and how it changes over time. An implementer reading it should immediately know the purpose of every file and when it is written.

**Required structure:**

1. Opening paragraph: location convention (`orchestra/` at project root), shared-session limitation, banner note
2. Full file inventory table with columns: File, Created When, Updated When, Retired When, Purpose
3. Lifecycle rules section: specific rules for `contracts.md` (frozen after Wave 1) and `decisions.md` (append-only with timestamps)
4. Fresh-start-vs-resume section: detection logic and archive convention
5. Git tracking section: rationale and `.gitignore` instruction

**The 11 inventory entries and their lifecycle:**

| File | Created When | Updated When | Retired When | Purpose |
|------|-------------|--------------|--------------|---------|
| `plan.md` | Step 1 (task analysis) | Step 2 (routing), Step 3 (wave plan) | Never | Scope, risk, route, wave structure |
| `progress.md` | Step 5 (first wave complete) | Every wave integration | Never | Wave status, completed/in-progress/pending |
| `backlog.md` | Step 2 (if large/project scope) | When items are resolved | Never | Pending items, expected artifact paths |
| `decisions.md` | First auto-decision | Every auto-decision (append-only) | Never | Timestamped log of all conductor decisions |
| `contracts.md` | Step 3 (contract definition) | Never after Wave 1 | Never | Agent interface contracts (frozen) |
| `platform.md` | First platform detection | Never (permanent) | User deletes it | Detected platform (claude-code/codex/open-code) |
| `decision-mode.md` | First mode selection | Never (permanent) | User edits it | Decision mode (ask_every_choice/smart_auto/auto_by_default) |
| `risk_register.md` | When security gate triggers | Each security gate run | Never | All security findings regardless of verdict |
| `snapshot.json` | Red-state CHC trigger | Every red-state checkpoint | Never | Structured machine-readable checkpoint |
| `snapshot.md` | Red-state CHC trigger | Every red-state checkpoint | Never | Human-readable session summary |
| `archive/` | First fresh-start run | Never | Never | Old `orchestra/` contents, timestamped |

### File 2: `deep_plan/skills/orchestra/references/compaction-safety.md`

This document defines the Context Health Check (CHC) protocol. The most critical part is the canonical snapshot JSON schema — implementers must use this exact structure, not any generic research document schema.

**Required structure:**

1. When CHC runs (3 trigger conditions)
2. Context state classification table (green/yellow/red) with criteria
3. Snapshot-before-compact protocol (4 numbered steps for red state)
4. Canonical snapshot JSON schema (full example block)
5. Resume-after-compaction procedure
6. User notification messages for each state transition

**Canonical snapshot JSON schema (embed this verbatim):**

```json
{
  "checkpoint": {
    "timestamp": "ISO-8601",
    "task_description": "...",
    "phase": "wave-N-integration",
    "completed_waves": [...],
    "in_progress": {...},
    "pending_waves": [...],
    "decisions": [...],
    "blockers": [],
    "key_files": ["/absolute/paths/only"]
  }
}
```

**Context state classification criteria:**

- `green` — short conversation, few decisions, simple task (trivial/small scope): continue normally
- `yellow` — multiple waves complete, growing context, medium scope: log warning in `progress.md`, no other action
- `red` — many decisions + active contracts + more than 5 wave cycles, OR about to change major topic, OR HIGH/CRITICAL risk work upcoming: mandatory snapshot before proceeding

**Key implementation note:** The document must explicitly state that `key_files` in `snapshot.json` must always contain absolute paths, never relative paths. This prevents resume failures when `/orchestra` is invoked from a different working directory.

### File 3: `deep_plan/skills/orchestra/references/session-resume.md`

This document specifies the R4 algorithm that SKILL.md Step 0 uses when a snapshot is detected. It should be written as an actionable procedure, not prose.

**Required structure:**

1. Trigger condition: when `/orchestra` is invoked and `orchestra/snapshot.json` exists
2. R4 algorithm, one heading per step with sub-bullets
3. At least one worked example (recommended: a Wave 2 resume scenario)
4. Edge cases: what to do if snapshot.json is corrupt, if key_files are missing, if the snapshot is stale (files are newer)

**R4 algorithm summary for implementers:**

- **Read:** Parse `orchestra/snapshot.json` → parse `orchestra/snapshot.md` → read every file listed in `checkpoint.key_files`
- **Restore:** Re-establish the in-context mental model: what is being built (from `task_description`), which decisions were made (from `decisions`), which contracts are active (read `orchestra/contracts.md`), which waves are done (`completed_waves`), what is in-progress (`in_progress`), what is pending (`pending_waves`)
- **Reconcile:** For each file in `key_files`, verify it exists and its modification time is consistent with the snapshot timestamp. If a key file is newer than the snapshot, update the in-memory state to reflect the current file content. If a key file is missing, note it as a blocker before resuming.
- **Resume:** Continue from the `in_progress` step. Do not re-execute waves in `completed_waves` unless a key file from that wave is missing. Print a resume banner to the user: what state was restored and where work continues.

### File 4: `deep_plan/skills/orchestra/references/skill-pack-integration.md`

This document explains the two cases where orchestra delegates to another skill: `large` scope (uses `deep-plan-codex`) and `project` scope (uses `deep-project`). The document covers the handoff, the waiting protocol, and the verification on resume.

**Required structure:**

1. Overview: why orchestra delegates (large/project scope is beyond its parallel-wave model; deep-* skills handle spec-writing, section decomposition, and implementation planning)
2. Large scope handoff procedure (step by step)
3. Project scope handoff procedure (step by step)
4. Backlog tracking: writing expected artifact paths to `orchestra/backlog.md`
5. Resume verification: what happens when `/orchestra resume` is invoked after a deep-* handoff
6. State synchronization: how deep-* output artifacts are absorbed back into the orchestra session
7. Shared context: passing `orchestra/` directory location to deep-* invocations

**Large scope handoff steps:**

1. Orchestra classifies scope as `large` in Step 1
2. Orchestra reads available context and composes a requirements spec file (e.g., `specs/feature/NNN-name/spec.md`)
3. Orchestra writes the expected output paths to `orchestra/backlog.md`:
   - `specs/feature/NNN-name/claude-plan.md`
   - `specs/feature/NNN-name/sections/index.md`
   - `specs/feature/NNN-name/claude-plan-tdd.md`
4. Orchestra prints: `"Requirements spec created at specs/feature/NNN-name/spec.md. Run: /deep-plan-codex @specs/feature/NNN-name/spec.md — then return with /orchestra resume"`
5. Orchestra saves snapshot and halts

**Resume verification steps:**

1. User returns with `/orchestra resume`
2. Orchestra reads `orchestra/backlog.md` for expected artifact paths
3. For each expected path, check if the file exists
4. If any are missing: print the missing-artifact message and wait for user confirmation
5. If all present: sync artifact locations into `orchestra/progress.md` and continue with quality gates for the implemented sections

---

## Context: How These Files Are Used by SKILL.md (Section 06)

Section 06 (Orchestra SKILL.md) references these four files in the following steps — implementers of this section should understand the downstream usage to ensure compatibility:

| SKILL.md Step | Uses This Section's File | How |
|--------------|------------------------|-----|
| Step 0 — Banner + State Loading | `session-resume.md` | Reads snapshot and runs R4 algorithm |
| Step 2 — Routing Decision | `skill-pack-integration.md` | For large/project scope, follows handoff procedure |
| Step 7 — Progress Update | `artifact-management.md` | Knows which files to update and their rules |
| Step 8 — Context Health Check | `compaction-safety.md` | Classifies context state, triggers snapshot on red |

SKILL.md uses **lazy reference reading**: it reads `compaction-safety.md` only when context state is yellow or higher, and reads `skill-pack-integration.md` only for large/project scope. The artifact-management.md content is internalized from the start (Step 0) since it governs the entire session's file writes.

---

## Dependencies

- **Requires Section 01** to be complete: the `deep_plan/skills/orchestra/references/` directory must exist before these files can be placed there.
- **Does not require** Sections 02, 03, or 04 to be complete, though implementers should be aware that `skill-pack-integration.md` references `deep-plan-codex` and `deep-project` invocation patterns that originate from those skills' documentation in the existing `deep_plan/` plugin structure.

---

## Implementation Notes (Actual Build)

### Files Created
- `deep_plan/skills/orchestra/references/artifact-management.md` (~130 lines)
- `deep_plan/skills/orchestra/references/compaction-safety.md` (~130 lines)
- `deep_plan/skills/orchestra/references/session-resume.md` (~180 lines)
- `deep_plan/skills/orchestra/references/skill-pack-integration.md` (~175 lines)

### Deviations from Plan
- **artifact-management.md:** Expanded with additional lifecycle rule sections for `progress.md`, `risk_register.md`, and snapshot files (above 100-line minimum). Added `archive/` retention guidance.
- **compaction-safety.md:** Added "Partial Snapshot Detection" section for handling mid-write compaction. Removed an accidental 4th red-state criterion (75% context capacity) that was inconsistent with the 3-trigger spec requirement. Added `in_progress` sub-field schema.
- **session-resume.md:** Added `in_progress` object sub-field rendering note to banner template. Expanded "snapshot from different task" edge case to clarify archive-not-delete semantics.
- **skill-pack-integration.md:** Changed backlog artifact paths to absolute-paths-only (consistency with `key_files` rule). Added `/deep-implement` mention in State Synchronization. Replaced hard-coded project path with `{project_root}` placeholder.

### All TDD Checks Pass
All spec [S] checks verified. [X] check for `/deep-implement` addressed by adding mention in State Synchronization section.

---

## Common Pitfalls

1. **Using relative paths in snapshot.json** — the `key_files` array must always contain absolute paths. If orchestra is invoked from `/home/dev/projects/SmartSpecPro/`, all paths must start with `/home/dev/projects/SmartSpecPro/`. Document this explicitly.

2. **Confusing `orchestra/snapshot.md` and `orchestra/snapshot.json`** — `snapshot.json` is machine-readable (parsed by the R4 algorithm); `snapshot.md` is human-readable (summary for the user). Both must be updated in the red-state protocol. Session-resume.md reads both.

3. **Missing the archive convention** — fresh start does NOT delete the old `orchestra/` directory. It moves the entire directory to `orchestra/archive/<ISO-8601-timestamp>/`. This allows recovery of previous session data.

4. **Writing skill-pack-integration.md as if orchestra takes over deep-* work** — orchestra does NOT replicate deep-* functionality. It creates the input spec and waits. The handoff is a clean boundary.

5. **Omitting the mandatory user-confirmation gate** — when expected artifacts are missing after a deep-* handoff, orchestra must NOT proceed automatically. It must print the missing-artifact message and explicitly wait.