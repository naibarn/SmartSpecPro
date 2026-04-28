# Compaction Safety — Context Health Check Protocol

Context compaction (when the AI context window is cleared or auto-compressed) is the primary failure mode for multi-wave orchestration sessions. This document defines the **Context Health Check (CHC)** protocol — how to classify current context state, when to take a snapshot, and how to notify the user.

---

## When CHC Runs

The Context Health Check runs at the following trigger points:

1. **After every wave** — Check state after integrating each completed wave's output.
2. **Before any HIGH or CRITICAL risk work** — A snapshot must be taken before executing a wave classified as HIGH or CRITICAL in the risk register.
3. **After more than 5 wave cycles** — After any session that has completed more than 5 wave cycles, a CHC is mandatory regardless of apparent context size.

---

## Context State Classification

| State | Criteria | Action |
|-------|----------|--------|
| `green` | Short conversation, few decisions, simple task (trivial/small scope); context window is well below limits | Continue normally; no additional logging required |
| `yellow` | Multiple waves complete, growing context, medium scope; approaching 50% of context window capacity | Log a warning entry in `progress.md`; no other action required |
| `red` | Many decisions + active contracts + more than 5 wave cycles, **OR** about to change major topic, **OR** HIGH/CRITICAL risk work upcoming | **Mandatory snapshot** before proceeding (follow 4-step protocol below) |

---

## Snapshot-Before-Compact Protocol (Red State)

When context state is `red`, execute all 4 steps before continuing:

1. **Update `orchestra/snapshot.json`** — Write the full structured checkpoint using the canonical schema below. All file paths in `key_files` must be absolute paths.
2. **Update `orchestra/snapshot.md`** — Write a human-readable summary of what was accomplished, what decisions were made, what is in-progress, and what is pending. This is the file a human reads to understand session state after a `/clear`.
3. **Update `orchestra/progress.md` and `orchestra/backlog.md`** — Ensure these reflect the current wave status accurately. `progress.md` must show every completed wave with a status line. `backlog.md` must list any pending items or expected artifact paths.
4. **Notify the user** — Print the red-state notification message (see User Notification Messages below).

---

## Canonical Snapshot JSON Schema

`orchestra/snapshot.json` must always conform to exactly this structure:

```json
{
  "checkpoint": {
    "timestamp": "ISO-8601",
    "task_description": "...",
    "phase": "wave-N-integration",
    "completed_waves": [],
    "in_progress": {},
    "pending_waves": [],
    "decisions": [],
    "blockers": [],
    "key_files": ["/absolute/paths/only"]
  }
}
```

**Field definitions:**

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | string (ISO-8601) | UTC timestamp of when this checkpoint was written |
| `task_description` | string | Original task description from Step 1 |
| `phase` | string | Current orchestration phase (e.g., `"wave-3-integration"`, `"pre-wave-4"`) |
| `completed_waves` | array of strings | Names/IDs of all waves that have been fully integrated |
| `in_progress` | object | The wave or step currently being executed. Recommended sub-fields: `wave` (string), `step` (string), `sub_agents_launched` (int), `sub_agents_complete` (int). On resume, any sub-agents not marked complete must be re-launched. |
| `pending_waves` | array of strings | Waves that are planned but not yet started |
| `decisions` | array of strings | Summary of key decisions from `decisions.md` (most recent first) |
| `blockers` | array of strings | Any known blockers preventing progress |
| `key_files` | array of strings | **Absolute paths only** — files critical for session resume |

**Critical rule:** `key_files` must always contain **absolute paths**, never relative paths. Use the full path from filesystem root (e.g., `<absolute-repo-root>/orchestra/contracts.md`, not `orchestra/contracts.md`). This prevents resume failures when `/orchestra` is invoked from a different working directory.

---

## Partial Snapshot Detection

If context compaction happens *during* the 4-step snapshot write (e.g., between step 1 and step 2), the snapshot may be in an inconsistent state on the next invocation. Handle partial snapshots as follows:

- If `snapshot.json` exists but `snapshot.md` is absent or has a timestamp older than `snapshot.json`: treat the state as partially written. Read `snapshot.json` for structured state and reconstruct any missing human summary from its fields.
- If both files are absent: no snapshot was taken. Start fresh (check for existing `orchestra/` and archive if needed).
- If `snapshot.json` is present but invalid JSON: fall back to `snapshot.md` only (see `session-resume.md` corrupt-snapshot edge case).

---

## Resume After Compaction

When a user clears context (e.g., `/clear`) and re-invokes `/orchestra`, the skill's Step 0 checks for the existence of `orchestra/snapshot.json`:

- If `orchestra/snapshot.json` **exists**: Run the R4 algorithm (see `session-resume.md`) to restore session state before proceeding.
- If `orchestra/snapshot.json` **does not exist**: Start a new session; check for existing `orchestra/` and archive if present.

The `orchestra/snapshot.md` file serves as the human-readable companion for context restoration — the skill reads it during R4 Step 1 alongside the JSON, and the user can read it to understand what was happening before the compaction event.

---

## User Notification Messages

**Yellow state:**
```
⚠️  CONTEXT WARNING: Growing session context detected.
Logged in progress.md. No action required — continuing.
```

**Red state (before snapshot):**
```
🔴 CONTEXT CRITICAL: Snapshot required before continuing.
Taking checkpoint... (orchestra/snapshot.json + orchestra/snapshot.md)
After this checkpoint, you may run /clear and re-invoke /orchestra to resume cleanly.
```

**Red state (after snapshot complete):**
```
✅ Snapshot complete.
  snapshot.json: /absolute/path/orchestra/snapshot.json
  snapshot.md:   /absolute/path/orchestra/snapshot.md

To resume after /clear: /orchestra resume
To continue in this session: type "continue"
```
