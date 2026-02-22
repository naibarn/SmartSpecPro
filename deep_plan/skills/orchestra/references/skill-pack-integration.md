# Skill Pack Integration — Handoff to deep-* Skills

## Overview

The orchestra conductor handles tasks up to a certain complexity threshold using its parallel-wave model. When a task is classified as `large` or `project` scope, the wave model is insufficient — the task requires structured specification decomposition, section-level planning, and implementation tracking that are provided by the `deep-plan-codex` and `deep-project` skills.

Orchestra does **not** replicate these skills' functionality. Instead, it creates the input artifact (a requirements spec or requirements document), hands off to the appropriate skill via a user instruction, and waits. The handoff is a clean boundary: orchestra owns the session lifecycle and progress tracking; the deep-* skill owns the actual planning and implementation work.

---

## Large Scope Handoff

Used when Step 1 (task analysis) classifies scope as `large`.

### Procedure

1. Orchestra classifies scope as `large` in Step 1 and records this in `orchestra/plan.md`.
2. Orchestra reads available context (user requirements, existing code structure, known constraints) and **composes a requirements spec file** at `specs/feature/NNN-name/spec.md` (where `NNN` is the next available feature number).
3. Orchestra writes the **expected output paths** to `orchestra/backlog.md`:
   ```
   [PENDING] deep-plan handoff for: {task_description}
   Expected artifacts:
     - specs/feature/NNN-name/claude-plan.md
     - specs/feature/NNN-name/sections/index.md
     - specs/feature/NNN-name/claude-plan-tdd.md
   Handoff invocation: /deep-plan-codex @specs/feature/NNN-name/spec.md
   ```
4. Orchestra prints the handoff instruction to the user:
   ```
   Requirements spec created at: specs/feature/NNN-name/spec.md

   Run this command to begin planning:
     /deep-plan-codex @specs/feature/NNN-name/spec.md

   When the deep-plan session is complete, return with:
     /orchestra resume
   ```
5. Orchestra **saves a snapshot** (follow the red-state protocol in `compaction-safety.md`) and **halts**.

Orchestra does not proceed until the user returns with `/orchestra resume`.

---

## Project Scope Handoff

Used when Step 1 classifies scope as `project` (multiple independent features or a large system decomposition).

### Procedure

1. Orchestra classifies scope as `project` in Step 1.
2. Orchestra composes a **high-level requirements document** at `specs/project/NNN-name/requirements.md` covering all sub-features, their relationships, and constraints.
3. Orchestra prints the handoff instruction:
   ```
   Requirements document created at: specs/project/NNN-name/requirements.md

   Run this command to decompose the project:
     /deep-project @specs/project/NNN-name/requirements.md

   deep-project will split this into individual feature specs.
   After splitting, follow the large-scope handoff pattern for each split:
     /deep-plan-codex @specs/feature/NNN-split-name/spec.md

   When all deep-plan sessions are complete, return with:
     /orchestra resume
   ```
4. Orchestra writes expected artifact paths for each anticipated split to `orchestra/backlog.md`.
5. Orchestra saves a snapshot and halts.

After deep-project splits the project into individual specs, the user runs the large-scope handoff pattern for each one. Orchestra tracks all expected artifacts in `backlog.md`.

---

## Backlog Tracking

`orchestra/backlog.md` is the tracking file for all pending items and expected artifact paths from deep-* handoffs. Format for each entry:

```
[PENDING] {item description}
  Type: deep-plan-handoff | deep-project-handoff | manual-task
  Expected artifacts:
    - /absolute/path/from/filesystem/root/to/expected/file.md
    - /absolute/path/from/filesystem/root/to/another/file.md
  Invocation: /skill-name @arg
  Added: YYYY-MM-DDTHH:MM:SSZ
```

**Path rule:** All artifact paths in `backlog.md` must be **absolute paths** (starting from the filesystem root). This is required for resume verification to work correctly when `/orchestra` is invoked from any working directory — the same rule as `key_files` in `snapshot.json`.

When an item is resolved, update its status:
```
[DONE] {item description}
  Resolved: YYYY-MM-DDTHH:MM:SSZ
  Artifacts verified: yes
```

---

## Resume Verification

When the user returns with `/orchestra resume` after a deep-* handoff:

1. Orchestra reads `orchestra/backlog.md` for all `[PENDING]` entries with expected artifact paths.
2. For **each expected artifact path**, check whether the file exists on the filesystem.
3. If **any expected artifacts are missing**:
   ```
   Expected artifacts from deep-plan not found at [path]. Did the deep-plan session complete successfully?

   Missing:
     - [path 1]
     - [path 2]

   Options:
     1. The deep-plan session is still running — return when complete.
     2. The session failed — re-run: /deep-plan-codex @specs/feature/NNN-name/spec.md
     3. The files are at a different path — confirm the actual paths.

   Orchestra will not proceed until you confirm or the files exist.
   ```
4. Orchestra **does not proceed** until the user confirms (e.g., types "confirmed" or corrects the paths) or all files are verified to exist.
5. If **all expected artifacts exist**: proceed to state synchronization.

---

## State Synchronization

After the user confirms that deep-* artifacts exist, orchestra syncs output into the session:

1. Read each confirmed artifact (e.g., `claude-plan.md`, `sections/index.md`).
2. Update `orchestra/progress.md`:
   ```
   [COMPLETE] deep-plan: {task_description}
     Plan: specs/feature/NNN-name/claude-plan.md
     Sections: specs/feature/NNN-name/sections/index.md
     Completed: YYYY-MM-DDTHH:MM:SSZ
   ```
3. Mark the corresponding `backlog.md` entry as `[DONE]`.
4. Log the artifact absorption in `orchestra/decisions.md`:
   ```
   [YYYY-MM-DDTHH:MM:SSZ] DECISION: Absorbed deep-plan output for {task_description}
     Artifacts: {list of paths}
   ```
5. Continue with the next wave — typically quality gates for the planned sections, or `/deep-implement` invocation for each section. For each section in `sections/index.md`, run: `/deep-implement @specs/feature/NNN-name/sections/.` and track the resulting implementation commits.

---

## Shared Context: Passing `orchestra/` to deep-* Skills

When creating the requirements spec or requirements document for handoff, orchestra includes a comment block at the top of the spec file so that deep-* skills know where to append shared decisions:

```markdown
<!-- Orchestra session: {project_root}/orchestra/ -->
<!-- Append key decisions to: {project_root}/orchestra/decisions.md -->
```

Replace `{project_root}` with the actual absolute path to the project root (e.g., `/home/dev/projects/MyProject`).

This allows a deep-plan session to record its own architectural decisions in the shared `orchestra/decisions.md` audit trail, maintaining continuity across the handoff boundary.

Deep-* skills are not required to use this comment — it is a hint, not a protocol requirement.
