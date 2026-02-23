diff --git a/deep_plan/skills/orchestra/references/artifact-management.md b/deep_plan/skills/orchestra/references/artifact-management.md
new file mode 100644
index 0000000..06e4d60
--- /dev/null
+++ b/deep_plan/skills/orchestra/references/artifact-management.md
@@ -0,0 +1,77 @@
+# Orchestra Artifact Management
+
+> **Note:** `orchestra/` is at project root and is shared across sessions.
+
+The `orchestra/` working directory is the single source of truth for an orchestration session. It lives at the project root — for example, `/home/dev/projects/SmartSpecPro/orchestra/` — relative to the current working directory when `/orchestra` is invoked.
+
+**Concurrent-session limitation:** If two developers simultaneously run `/orchestra` sessions, they will share this directory — this is an acceptable limitation for a single-developer workflow tool.
+
+---
+
+## File Inventory
+
+| File | Created When | Updated When | Retired When | Purpose |
+|------|-------------|--------------|--------------|---------|
+| `plan.md` | Step 1 (task analysis) | Step 2 (routing), Step 3 (wave plan) | Never | Scope, risk, route, wave structure |
+| `progress.md` | Step 5 (first wave complete) | Every wave integration | Never | Wave status: completed / in-progress / pending |
+| `backlog.md` | Step 2 (if large/project scope) | When items are resolved | Never | Pending items, expected artifact paths from deep-* handoffs |
+| `decisions.md` | First auto-decision | Every auto-decision (append-only) | Never | Timestamped log of all conductor decisions |
+| `contracts.md` | Step 3 (contract definition) | Never after Wave 1 | Never | Agent interface contracts (frozen after Wave 1) |
+| `platform.md` | First platform detection | Never (permanent) | User deletes it | Detected platform (claude-code / codex / open-code) |
+| `decision-mode.md` | First mode selection | Never (permanent) | User edits it | Decision mode (ask_every_choice / smart_auto / auto_by_default) |
+| `risk_register.md` | When security gate triggers | Each security gate run | Never | All security findings regardless of verdict |
+| `snapshot.json` | Red-state CHC trigger | Every red-state checkpoint | Never | Structured machine-readable session checkpoint |
+| `snapshot.md` | Red-state CHC trigger | Every red-state checkpoint | Never | Human-readable session summary for context restoration |
+| `archive/` | First fresh-start run | Never | Never | Timestamped copies of old `orchestra/` contents |
+
+---
+
+## Lifecycle Rules
+
+### `contracts.md` — Frozen After Wave 1
+
+`contracts.md` is written once during Step 3 (contract definition, before Wave 1 begins) and **never modified** after Wave 1 starts. This ensures that all sub-agents operating in Wave 1 and later work from stable interface definitions. If a contract must change:
+
+1. Document the required change in `decisions.md` with a timestamp and rationale.
+2. Plan a new wave specifically to re-define contracts.
+3. Only write the new `contracts.md` after that wave is fully planned and gated.
+
+### `decisions.md` — Append-Only with Timestamps
+
+Every entry in `decisions.md` is timestamped and appended to the end of the file. **No entry is ever deleted or edited after it is written.** Format:
+
+```
+[YYYY-MM-DDTHH:MM:SSZ] DECISION: <what was decided>
+  Context: <why this was needed>
+  Alternatives considered: <if any>
+```
+
+This append-only constraint provides a full audit trail across compaction events and session resumes.
+
+---
+
+## Fresh Start vs. Resume
+
+When `/orchestra` is invoked and an existing `orchestra/` directory is detected at the project root:
+
+1. **Archive the existing directory:** Move the entire `orchestra/` directory to `orchestra/archive/<ISO-8601-timestamp>/`. For example: `orchestra/archive/2026-02-22T14:30:00Z/`.
+2. **Create a fresh `orchestra/` directory** and proceed with a new session.
+
+This convention ensures that old session data is never deleted — only moved aside — so recovery from an incorrect fresh start is possible by moving the archived directory back.
+
+**Do NOT delete** the old `orchestra/` directory. Archiving is mandatory.
+
+---
+
+## Git Tracking
+
+`orchestra/` **should be committed** to the project repository. It is not ephemeral — it documents decisions, contracts, and progress that have long-term value as project history.
+
+**Important:** Your project's `.gitignore` must **NOT** exclude `orchestra/`. Verify this before and after adding the directory to git.
+
+Recommended commit workflow:
+- Commit `orchestra/` at the end of each wave cycle together with the wave's output artifacts.
+- Use commit messages like: `chore: orchestra progress — wave N complete`
+- Never commit `orchestra/snapshot.json` and `orchestra/snapshot.md` without the wave output that prompted the checkpoint.
+
+The `orchestra/archive/` subdirectory may be excluded from git if old sessions are not relevant to the current project's history, but this is optional.
diff --git a/deep_plan/skills/orchestra/references/compaction-safety.md b/deep_plan/skills/orchestra/references/compaction-safety.md
new file mode 100644
index 0000000..11d7b7f
--- /dev/null
+++ b/deep_plan/skills/orchestra/references/compaction-safety.md
@@ -0,0 +1,110 @@
+# Compaction Safety — Context Health Check Protocol
+
+Context compaction (when the AI context window is cleared or auto-compressed) is the primary failure mode for multi-wave orchestration sessions. This document defines the **Context Health Check (CHC)** protocol — how to classify current context state, when to take a snapshot, and how to notify the user.
+
+---
+
+## When CHC Runs
+
+The Context Health Check runs at the following trigger points:
+
+1. **After every wave** — Check state after integrating each completed wave's output.
+2. **Before any HIGH or CRITICAL risk work** — A snapshot must be taken before executing a wave classified as HIGH or CRITICAL in the risk register.
+3. **After more than 5 wave cycles** — After any session that has completed more than 5 wave cycles, a CHC is mandatory regardless of apparent context size.
+
+---
+
+## Context State Classification
+
+| State | Criteria | Action |
+|-------|----------|--------|
+| `green` | Short conversation, few decisions, simple task (trivial/small scope); context window is well below limits | Continue normally; no additional logging required |
+| `yellow` | Multiple waves complete, growing context, medium scope; approaching 50% of context window capacity | Log a warning entry in `progress.md`; no other action required |
+| `red` | Many decisions + active contracts + more than 5 wave cycles, **OR** about to change major topic, **OR** HIGH/CRITICAL risk work upcoming, **OR** context window above 75% capacity | **Mandatory snapshot** before proceeding (follow 4-step protocol below) |
+
+---
+
+## Snapshot-Before-Compact Protocol (Red State)
+
+When context state is `red`, execute all 4 steps before continuing:
+
+1. **Update `orchestra/snapshot.json`** — Write the full structured checkpoint using the canonical schema below. All file paths in `key_files` must be absolute paths.
+2. **Update `orchestra/snapshot.md`** — Write a human-readable summary of what was accomplished, what decisions were made, what is in-progress, and what is pending. This is the file a human reads to understand session state after a `/clear`.
+3. **Update `orchestra/progress.md` and `orchestra/backlog.md`** — Ensure these reflect the current wave status accurately. `progress.md` must show every completed wave with a status line. `backlog.md` must list any pending items or expected artifact paths.
+4. **Notify the user** — Print the red-state notification message (see User Notification Messages below).
+
+---
+
+## Canonical Snapshot JSON Schema
+
+`orchestra/snapshot.json` must always conform to exactly this structure:
+
+```json
+{
+  "checkpoint": {
+    "timestamp": "ISO-8601",
+    "task_description": "...",
+    "phase": "wave-N-integration",
+    "completed_waves": [],
+    "in_progress": {},
+    "pending_waves": [],
+    "decisions": [],
+    "blockers": [],
+    "key_files": ["/absolute/paths/only"]
+  }
+}
+```
+
+**Field definitions:**
+
+| Field | Type | Description |
+|-------|------|-------------|
+| `timestamp` | string (ISO-8601) | UTC timestamp of when this checkpoint was written |
+| `task_description` | string | Original task description from Step 1 |
+| `phase` | string | Current orchestration phase (e.g., `"wave-3-integration"`, `"pre-wave-4"`) |
+| `completed_waves` | array of strings | Names/IDs of all waves that have been fully integrated |
+| `in_progress` | object | The wave or step currently being executed, with its state |
+| `pending_waves` | array of strings | Waves that are planned but not yet started |
+| `decisions` | array of strings | Summary of key decisions from `decisions.md` (most recent first) |
+| `blockers` | array of strings | Any known blockers preventing progress |
+| `key_files` | array of strings | **Absolute paths only** — files critical for session resume |
+
+**Critical rule:** `key_files` must always contain **absolute paths**, never relative paths. Use the full path from filesystem root (e.g., `/home/dev/projects/SmartSpecPro/orchestra/contracts.md`, not `orchestra/contracts.md`). This prevents resume failures when `/orchestra` is invoked from a different working directory.
+
+---
+
+## Resume After Compaction
+
+When a user clears context (e.g., `/clear`) and re-invokes `/orchestra`, the skill's Step 0 checks for the existence of `orchestra/snapshot.json`:
+
+- If `orchestra/snapshot.json` **exists**: Run the R4 algorithm (see `session-resume.md`) to restore session state before proceeding.
+- If `orchestra/snapshot.json` **does not exist**: Start a new session; check for existing `orchestra/` and archive if present.
+
+The `orchestra/snapshot.md` file serves as the human-readable companion for context restoration — the skill reads it during R4 Step 1 alongside the JSON, and the user can read it to understand what was happening before the compaction event.
+
+---
+
+## User Notification Messages
+
+**Yellow state:**
+```
+⚠️  CONTEXT WARNING: Growing session context detected.
+Logged in progress.md. No action required — continuing.
+```
+
+**Red state (before snapshot):**
+```
+🔴 CONTEXT CRITICAL: Snapshot required before continuing.
+Taking checkpoint... (orchestra/snapshot.json + orchestra/snapshot.md)
+After this checkpoint, you may run /clear and re-invoke /orchestra to resume cleanly.
+```
+
+**Red state (after snapshot complete):**
+```
+✅ Snapshot complete.
+  snapshot.json: /absolute/path/orchestra/snapshot.json
+  snapshot.md:   /absolute/path/orchestra/snapshot.md
+
+To resume after /clear: /orchestra resume
+To continue in this session: type "continue"
+```
diff --git a/deep_plan/skills/orchestra/references/session-resume.md b/deep_plan/skills/orchestra/references/session-resume.md
new file mode 100644
index 0000000..0fa2e8f
--- /dev/null
+++ b/deep_plan/skills/orchestra/references/session-resume.md
@@ -0,0 +1,159 @@
+# Session Resume — R4 Algorithm
+
+The R4 algorithm is executed by SKILL.md Step 0 whenever `/orchestra` is invoked and `orchestra/snapshot.json` is detected at the project root. Its purpose is to fully restore the orchestration session's in-context state so that work can continue from exactly where it left off.
+
+---
+
+## Trigger Condition
+
+Run R4 when **all** of the following are true:
+
+- `/orchestra` (or `/orchestra resume`) has been invoked
+- `orchestra/snapshot.json` exists at the project root
+- The user has not explicitly requested a fresh start (e.g., `/orchestra new`)
+
+If the user passes `new` or `fresh`, skip R4 and follow the archive-and-fresh-start procedure in `artifact-management.md`.
+
+---
+
+## The R4 Algorithm
+
+### Step 1: Read
+
+Parse all available state from the filesystem:
+
+1. Parse `orchestra/snapshot.json` → extract all 9 fields from the `checkpoint` object.
+2. Read `orchestra/snapshot.md` → load the human-readable summary for additional context that may not be captured structurally in the JSON.
+3. Read every file listed in `checkpoint.key_files` (absolute paths) → these are the critical reference files that define what was built and what decisions were made.
+
+**If `orchestra/snapshot.json` is corrupt or unparseable:** Fall back to reading `orchestra/snapshot.md` only. Reconstruct state from the human-readable summary. Note the parse failure in the resume banner.
+
+### Step 2: Restore
+
+Re-establish the complete in-context mental model:
+
+- **What is being built:** From `checkpoint.task_description` — understand the full original task scope.
+- **What decisions were made:** From `checkpoint.decisions` and the full `orchestra/decisions.md` — understand all past conductor choices.
+- **What contracts are active:** Read `orchestra/contracts.md` in full — these define the interfaces all sub-agents are working against.
+- **Which waves are done:** From `checkpoint.completed_waves` — understand what has been delivered and integrated.
+- **What is in-progress:** From `checkpoint.in_progress` — understand where work was interrupted.
+- **What is pending:** From `checkpoint.pending_waves` — understand the remaining work plan.
+
+### Step 3: Reconcile
+
+Verify that actual filesystem state matches the snapshot's recorded state:
+
+1. For each file in `checkpoint.key_files`:
+   - Check that the file **exists**. If missing: add it to the blockers list; do not auto-recreate.
+   - Check the file's **modification time** against `checkpoint.timestamp`. If a file is **newer** than the snapshot: read the current file content and update the in-memory state to reflect the newer version (the file is authoritative over the snapshot).
+2. For each wave in `checkpoint.completed_waves`:
+   - Verify that the output artifacts for that wave exist. If a wave's output file is missing, flag that wave's status as `NEEDS_VERIFICATION` before resuming.
+3. If any blockers were identified: list them in the resume banner and ask the user how to proceed before starting work.
+
+### Step 4: Resume
+
+Continue work from the interrupted point:
+
+- Start from the step recorded in `checkpoint.in_progress`. **Never re-execute** waves listed in `checkpoint.completed_waves` unless a key file from that wave is verified as missing.
+- If `checkpoint.in_progress` was mid-wave: re-read the wave plan and continue from the last completed sub-step, not from the beginning of the wave.
+- Print a **resume banner** (see below) to confirm the restored state to the user before doing any work.
+
+---
+
+## Resume Banner Format
+
+```
+═══════════════════════════════════════════════════════════════
+SESSION RESUMED
+═══════════════════════════════════════════════════════════════
+Task:           {task_description}
+Phase:          {phase}
+Completed:      {completed_waves}
+In progress:    {in_progress}
+Pending:        {pending_waves}
+Blockers:       {blockers or "None"}
+Key files:      {count} files read and verified
+
+Continuing from: {in_progress step description}
+═══════════════════════════════════════════════════════════════
+```
+
+If blockers were found:
+```
+⚠️  BLOCKERS DETECTED — resolve before continuing:
+  - {blocker 1}
+  - {blocker 2}
+
+Respond with how to proceed, or type "skip" to continue past blockers.
+```
+
+---
+
+## Worked Example: Wave 2 Resume
+
+**Scenario:** The user was executing Wave 2 (backend API implementation) when context was compacted. Wave 1 (schema + contracts) is complete. Wave 3 (frontend integration) is pending.
+
+**Snapshot state:**
+```json
+{
+  "checkpoint": {
+    "timestamp": "2026-02-22T10:15:00Z",
+    "task_description": "Add user notification system with email and in-app channels",
+    "phase": "wave-2-execution",
+    "completed_waves": ["wave-1-schema-contracts"],
+    "in_progress": {"wave": "wave-2-backend-api", "step": "sub-agent-dispatch", "sub_agents_launched": 2, "sub_agents_complete": 0},
+    "pending_waves": ["wave-3-frontend-integration", "wave-4-testing"],
+    "decisions": ["Chose BullMQ over Redis Pub/Sub for notification queue due to retry semantics"],
+    "blockers": [],
+    "key_files": [
+      "/home/dev/projects/SmartSpecPro/orchestra/contracts.md",
+      "/home/dev/projects/SmartSpecPro/orchestra/plan.md",
+      "/home/dev/projects/SmartSpecPro/apps/web/shared/notifications/contracts.ts"
+    ]
+  }
+}
+```
+
+**R4 execution:**
+
+1. **Read:** Parse snapshot.json. Read snapshot.md. Read `contracts.md`, `plan.md`, and `contracts.ts` — all found, all timestamps older than `2026-02-22T10:15:00Z`.
+2. **Restore:** Task is notification system. Wave 1 produced the contract types in `contracts.ts`. Wave 2 was dispatching sub-agents for backend API work. Decision recorded: BullMQ chosen.
+3. **Reconcile:** All 3 key files exist. None are newer than the snapshot. No blockers.
+4. **Resume:** Wave 2 sub-agents were dispatched but no results were collected. Re-launch Wave 2 sub-agents from scratch (since no output was integrated before compaction). Do NOT re-run Wave 1.
+
+**Resume banner output:**
+```
+═══════════════════════════════════════════════════════════════
+SESSION RESUMED
+═══════════════════════════════════════════════════════════════
+Task:           Add user notification system with email and in-app channels
+Phase:          wave-2-execution
+Completed:      wave-1-schema-contracts
+In progress:    wave-2-backend-api (sub-agent dispatch, 0 of 2 complete)
+Pending:        wave-3-frontend-integration, wave-4-testing
+Blockers:       None
+Key files:      3 files read and verified
+
+Continuing from: Wave 2 sub-agent re-dispatch
+═══════════════════════════════════════════════════════════════
+```
+
+---
+
+## Edge Cases
+
+### `snapshot.json` is corrupt
+
+Fall back to `snapshot.md` for a human-readable reconstruction. Parse what you can and note the corruption in the banner. Proceed with best-effort restore.
+
+### A `key_file` is missing
+
+Add the file to blockers. Present the blocker to the user before resuming. Do not auto-recreate the file — the user may have deleted it intentionally or it may be in a different location.
+
+### A `key_file` is newer than the snapshot
+
+This means work continued after the snapshot was taken (possibly in a different session). Accept the current file as authoritative. Read it and update the in-memory state. Log a note in the resume banner: `"Note: {file} was modified after snapshot — using current version."`
+
+### Snapshot is from a completely different task
+
+If `task_description` does not match any currently visible task or the wave structure makes no sense in context, print a warning and ask the user whether to archive the existing `orchestra/` and start fresh or continue with the snapshot.
diff --git a/deep_plan/skills/orchestra/references/skill-pack-integration.md b/deep_plan/skills/orchestra/references/skill-pack-integration.md
new file mode 100644
index 0000000..c8b6683
--- /dev/null
+++ b/deep_plan/skills/orchestra/references/skill-pack-integration.md
@@ -0,0 +1,155 @@
+# Skill Pack Integration — Handoff to deep-* Skills
+
+## Overview
+
+The orchestra conductor handles tasks up to a certain complexity threshold using its parallel-wave model. When a task is classified as `large` or `project` scope, the wave model is insufficient — the task requires structured specification decomposition, section-level planning, and implementation tracking that are provided by the `deep-plan-codex` and `deep-project` skills.
+
+Orchestra does **not** replicate these skills' functionality. Instead, it creates the input artifact (a requirements spec or requirements document), hands off to the appropriate skill via a user instruction, and waits. The handoff is a clean boundary: orchestra owns the session lifecycle and progress tracking; the deep-* skill owns the actual planning and implementation work.
+
+---
+
+## Large Scope Handoff
+
+Used when Step 1 (task analysis) classifies scope as `large`.
+
+### Procedure
+
+1. Orchestra classifies scope as `large` in Step 1 and records this in `orchestra/plan.md`.
+2. Orchestra reads available context (user requirements, existing code structure, known constraints) and **composes a requirements spec file** at `specs/feature/NNN-name/spec.md` (where `NNN` is the next available feature number).
+3. Orchestra writes the **expected output paths** to `orchestra/backlog.md`:
+   ```
+   [PENDING] deep-plan handoff for: {task_description}
+   Expected artifacts:
+     - specs/feature/NNN-name/claude-plan.md
+     - specs/feature/NNN-name/sections/index.md
+     - specs/feature/NNN-name/claude-plan-tdd.md
+   Handoff invocation: /deep-plan-codex @specs/feature/NNN-name/spec.md
+   ```
+4. Orchestra prints the handoff instruction to the user:
+   ```
+   Requirements spec created at: specs/feature/NNN-name/spec.md
+
+   Run this command to begin planning:
+     /deep-plan-codex @specs/feature/NNN-name/spec.md
+
+   When the deep-plan session is complete, return with:
+     /orchestra resume
+   ```
+5. Orchestra **saves a snapshot** (follow the red-state protocol in `compaction-safety.md`) and **halts**.
+
+Orchestra does not proceed until the user returns with `/orchestra resume`.
+
+---
+
+## Project Scope Handoff
+
+Used when Step 1 classifies scope as `project` (multiple independent features or a large system decomposition).
+
+### Procedure
+
+1. Orchestra classifies scope as `project` in Step 1.
+2. Orchestra composes a **high-level requirements document** at `specs/project/NNN-name/requirements.md` covering all sub-features, their relationships, and constraints.
+3. Orchestra prints the handoff instruction:
+   ```
+   Requirements document created at: specs/project/NNN-name/requirements.md
+
+   Run this command to decompose the project:
+     /deep-project @specs/project/NNN-name/requirements.md
+
+   deep-project will split this into individual feature specs.
+   After splitting, follow the large-scope handoff pattern for each split:
+     /deep-plan-codex @specs/feature/NNN-split-name/spec.md
+
+   When all deep-plan sessions are complete, return with:
+     /orchestra resume
+   ```
+4. Orchestra writes expected artifact paths for each anticipated split to `orchestra/backlog.md`.
+5. Orchestra saves a snapshot and halts.
+
+After deep-project splits the project into individual specs, the user runs the large-scope handoff pattern for each one. Orchestra tracks all expected artifacts in `backlog.md`.
+
+---
+
+## Backlog Tracking
+
+`orchestra/backlog.md` is the tracking file for all pending items and expected artifact paths from deep-* handoffs. Format for each entry:
+
+```
+[PENDING] {item description}
+  Type: deep-plan-handoff | deep-project-handoff | manual-task
+  Expected artifacts:
+    - /absolute/or/relative/path/to/expected/file.md
+    - /absolute/or/relative/path/to/another/file.md
+  Invocation: /skill-name @arg
+  Added: YYYY-MM-DDTHH:MM:SSZ
+```
+
+When an item is resolved, update its status:
+```
+[DONE] {item description}
+  Resolved: YYYY-MM-DDTHH:MM:SSZ
+  Artifacts verified: yes
+```
+
+---
+
+## Resume Verification
+
+When the user returns with `/orchestra resume` after a deep-* handoff:
+
+1. Orchestra reads `orchestra/backlog.md` for all `[PENDING]` entries with expected artifact paths.
+2. For **each expected artifact path**, check whether the file exists on the filesystem.
+3. If **any expected artifacts are missing**:
+   ```
+   Expected artifacts from deep-plan not found at [path]. Did the deep-plan session complete successfully?
+
+   Missing:
+     - [path 1]
+     - [path 2]
+
+   Options:
+     1. The deep-plan session is still running — return when complete.
+     2. The session failed — re-run: /deep-plan-codex @specs/feature/NNN-name/spec.md
+     3. The files are at a different path — confirm the actual paths.
+
+   Orchestra will not proceed until you confirm or the files exist.
+   ```
+4. Orchestra **does not proceed** until the user confirms (e.g., types "confirmed" or corrects the paths) or all files are verified to exist.
+5. If **all expected artifacts exist**: proceed to state synchronization.
+
+---
+
+## State Synchronization
+
+After the user confirms that deep-* artifacts exist, orchestra syncs output into the session:
+
+1. Read each confirmed artifact (e.g., `claude-plan.md`, `sections/index.md`).
+2. Update `orchestra/progress.md`:
+   ```
+   [COMPLETE] deep-plan: {task_description}
+     Plan: specs/feature/NNN-name/claude-plan.md
+     Sections: specs/feature/NNN-name/sections/index.md
+     Completed: YYYY-MM-DDTHH:MM:SSZ
+   ```
+3. Mark the corresponding `backlog.md` entry as `[DONE]`.
+4. Log the artifact absorption in `orchestra/decisions.md`:
+   ```
+   [YYYY-MM-DDTHH:MM:SSZ] DECISION: Absorbed deep-plan output for {task_description}
+     Artifacts: {list of paths}
+   ```
+5. Continue with the next wave — typically quality gates for the planned sections, or deep-implement invocation for each section.
+
+---
+
+## Shared Context: Passing `orchestra/` to deep-* Skills
+
+When creating the requirements spec or requirements document for handoff, orchestra includes a comment block at the top of the spec file so that deep-* skills know where to append shared decisions:
+
+```markdown
+<!-- Orchestra session: /home/dev/projects/SmartSpecPro/orchestra/ -->
+<!-- Append key decisions to: /home/dev/projects/SmartSpecPro/orchestra/decisions.md -->
+```
+
+This allows a deep-plan session to record its own architectural decisions in the shared `orchestra/decisions.md` audit trail, maintaining continuity across the handoff boundary.
+
+Deep-* skills are not required to use this comment — it is a hint, not a protocol requirement.
