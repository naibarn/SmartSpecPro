# Compaction Safety — Durable Snapshot

Context compaction and terminal/session loss must not erase work state. This is a **checkpoint/resume mechanism**, not a new review, approval or integration gate.

## When to persist

- Keep `orchestra/progress.md` and `orchestra/backlog.md` up to date after meaningful completed waves/checkpoints and before anticipated context or session loss. A simple direct edit need not create a separate Orchestra session.
- For multi-wave work approaching compaction, before intentional pause, or before handing off a long-running operation, write `orchestra/snapshot.json` and `orchestra/snapshot.md`. **Continue work automatically** after writing; never require user permission just to checkpoint.
- Preserve dirty owned files and the commit/PR identifiers needed to reconcile interrupted operations. Do not use fixed wave quotas or mandatory warning banners as stop criteria.

## Existing snapshot schema (unchanged)

```json
{
  "checkpoint": {
    "timestamp": "ISO-8601",
    "task_description": "...",
    "phase": "...",
    "completed_waves": [],
    "in_progress": {},
    "pending_waves": [],
    "decisions": [],
    "blockers": [],
    "key_files": ["/absolute/paths/only"]
  }
}
```

Write real timestamps and **absolute** `key_files` paths. In `snapshot.md`, summarize what was integrated, current worktree/base/commit/Main SHA, unfinished step, pending gaps, and next executable action. Write/replace snapshot files without truncating earlier valid state if an error occurs. If a partial snapshot is observed on resume, reconcile its JSON with newer progress/filesystem/Git evidence; never assume a stale snapshot is authoritative. Use [session-resume](session-resume.md) to continue.
