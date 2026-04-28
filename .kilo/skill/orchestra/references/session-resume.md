# Session Resume — R4 Algorithm

The R4 algorithm is executed by SKILL.md Step 0 whenever `/orchestra` is invoked and `orchestra/snapshot.json` is detected at the project root. Its purpose is to fully restore the orchestration session's in-context state so that work can continue from exactly where it left off.

---

## Trigger Condition

Run R4 when **all** of the following are true:

- `/orchestra` (or `/orchestra resume`) has been invoked
- `orchestra/snapshot.json` exists at the project root
- The user has not explicitly requested a fresh start (e.g., `/orchestra new`)

If the user explicitly requests a fresh start (e.g., with an argument like `new` or `fresh`), skip R4 and follow the archive-and-fresh-start procedure in `artifact-management.md` — this means archiving the existing `orchestra/` directory (not deleting it) and starting a new session.

---

## The R4 Algorithm

### Step 1: Read

Parse all available state from the filesystem:

1. Parse `orchestra/snapshot.json` → extract all 9 fields from the `checkpoint` object.
2. Read `orchestra/snapshot.md` → load the human-readable summary for additional context that may not be captured structurally in the JSON.
3. Read every file listed in `checkpoint.key_files` (absolute paths) → these are the critical reference files that define what was built and what decisions were made.

**If `orchestra/snapshot.json` is corrupt or unparseable:** Fall back to reading `orchestra/snapshot.md` only. Reconstruct state from the human-readable summary. Note the parse failure in the resume banner.

### Step 2: Restore

Re-establish the complete in-context mental model:

- **What is being built:** From `checkpoint.task_description` — understand the full original task scope.
- **What decisions were made:** From `checkpoint.decisions` and the full `orchestra/decisions.md` — understand all past conductor choices.
- **What contracts are active:** Read `orchestra/contracts.md` in full — these define the interfaces all sub-agents are working against.
- **Which waves are done:** From `checkpoint.completed_waves` — understand what has been delivered and integrated.
- **What is in-progress:** From `checkpoint.in_progress` — understand where work was interrupted.
- **What is pending:** From `checkpoint.pending_waves` — understand the remaining work plan.

### Step 3: Reconcile

Verify that actual filesystem state matches the snapshot's recorded state:

1. For each file in `checkpoint.key_files`:
   - Check that the file **exists**. If missing: add it to the blockers list; do not auto-recreate.
   - Check the file's **modification time** against `checkpoint.timestamp`. If a file is **newer** than the snapshot: read the current file content and update the in-memory state to reflect the newer version (the file is authoritative over the snapshot).
2. For each wave in `checkpoint.completed_waves`:
   - Verify that the output artifacts for that wave exist. If a wave's output file is missing, flag that wave's status as `NEEDS_VERIFICATION` before resuming.
3. If any blockers were identified: list them in the resume banner, then continue automatically from the earliest safe incomplete stage. Ask the user only if resolving the blocker would require destructive reset/archive, accepted-risk security bypass, or a product-direction decision.

### Step 4: Resume

Continue work from the interrupted point:

- Start from the step recorded in `checkpoint.in_progress`. **Never re-execute** waves listed in `checkpoint.completed_waves` unless a key file from that wave is verified as missing.
- If `checkpoint.in_progress` was mid-wave: re-read the wave plan and continue from the last completed sub-step, not from the beginning of the wave.
- Print a **resume banner** (see below) to confirm the restored state to the user before doing any work.

---

## Resume Banner Format

```
═══════════════════════════════════════════════════════════════
SESSION RESUMED
═══════════════════════════════════════════════════════════════
Task:           {task_description}
Phase:          {phase}
Completed:      {completed_waves joined by ", "}
In progress:    {in_progress.wave} ({in_progress.step}, {in_progress.sub_agents_complete} of {in_progress.sub_agents_launched} complete)
Pending:        {pending_waves joined by ", "}
Blockers:       {blockers joined by ", " or "None"}
Key files:      {count} files read and verified

Continuing from: {in_progress.step description}
═══════════════════════════════════════════════════════════════
```

**Rendering note:** `in_progress` is a JSON object — render it as a human-readable string using the sub-field format shown above, not as a raw JSON dump. If sub-fields are missing (old snapshot format), fall back to printing the full JSON on one line.

If blockers were found:
```
⚠️  BLOCKERS DETECTED — resolve before continuing:
  - {blocker 1}
  - {blocker 2}
```

If blockers are non-destructive consistency issues, continue automatically after logging the recovery path.

---

## Worked Example: Wave 2 Resume

**Scenario:** The user was executing Wave 2 (backend API implementation) when context was compacted. Wave 1 (schema + contracts) is complete. Wave 3 (frontend integration) is pending.

**Snapshot state:**
```json
{
  "checkpoint": {
    "timestamp": "2026-02-22T10:15:00Z",
    "task_description": "Add user notification system with email and in-app channels",
    "phase": "wave-2-execution",
    "completed_waves": ["wave-1-schema-contracts"],
    "in_progress": {"wave": "wave-2-backend-api", "step": "sub-agent-dispatch", "sub_agents_launched": 2, "sub_agents_complete": 0},
    "pending_waves": ["wave-3-frontend-integration", "wave-4-testing"],
    "decisions": ["Chose BullMQ over Redis Pub/Sub for notification queue due to retry semantics"],
    "blockers": [],
    "key_files": [
      "<absolute-repo-root>/orchestra/contracts.md",
      "<absolute-repo-root>/orchestra/plan.md",
      "<absolute-repo-root>/apps/web/shared/notifications/contracts.ts"
    ]
  }
}
```

**R4 execution:**

1. **Read:** Parse snapshot.json. Read snapshot.md. Read `contracts.md`, `plan.md`, and `contracts.ts` — all found, all timestamps older than `2026-02-22T10:15:00Z`.
2. **Restore:** Task is notification system. Wave 1 produced the contract types in `contracts.ts`. Wave 2 was dispatching sub-agents for backend API work. Decision recorded: BullMQ chosen.
3. **Reconcile:** All 3 key files exist. None are newer than the snapshot. No blockers.
4. **Resume:** Wave 2 sub-agents were dispatched but no results were collected. Re-launch Wave 2 sub-agents from scratch (since no output was integrated before compaction). Do NOT re-run Wave 1.

**Resume banner output:**
```
═══════════════════════════════════════════════════════════════
SESSION RESUMED
═══════════════════════════════════════════════════════════════
Task:           Add user notification system with email and in-app channels
Phase:          wave-2-execution
Completed:      wave-1-schema-contracts
In progress:    wave-2-backend-api (sub-agent dispatch, 0 of 2 complete)
Pending:        wave-3-frontend-integration, wave-4-testing
Blockers:       None
Key files:      3 files read and verified

Continuing from: Wave 2 sub-agent re-dispatch
═══════════════════════════════════════════════════════════════
```

---

## Edge Cases

### `snapshot.json` is corrupt

Fall back to `snapshot.md` for a human-readable reconstruction. Parse what you can and note the corruption in the banner. Proceed with best-effort restore.

### A `key_file` is missing

Add the file to blockers. Do not auto-recreate the file blindly. Instead, resume from the earliest safe incomplete stage that can regenerate or re-verify the missing artifact. Ask the user only if the file appears intentionally removed, the recovery path would archive/discard work, or product intent is no longer clear.

### A `key_file` is newer than the snapshot

This means work continued after the snapshot was taken (possibly in a different session). Accept the current file as authoritative. Read it and update the in-memory state. Log a note in the resume banner: `"Note: {file} was modified after snapshot — using current version."`

### Snapshot is from a completely different task

If `task_description` does not match any currently visible task or the wave structure makes no sense in context:
- if the user explicitly asked to resume prior work, continue with the snapshot
- otherwise archive the old `orchestra/` directory automatically and start a fresh session

Do not delete the old `orchestra/` directory — archive it. This ensures the old snapshot is not detected on the next invocation (since it has been moved into `archive/`).
