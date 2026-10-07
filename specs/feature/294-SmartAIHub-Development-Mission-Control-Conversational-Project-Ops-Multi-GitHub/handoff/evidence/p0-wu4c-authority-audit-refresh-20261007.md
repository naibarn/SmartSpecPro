# P0-WU-4C authority audit and regression refresh — SPEC-294

- Current canonical source: `origin/main` at `4d4d46259099721e088b9b9b47e452225426fb2c` (PR #199 merge, 2026-10-07T07:01:27Z).
- Local authority regression suite: `python3 -m unittest discover -s scripts/development-lifecycle -p 'test_*authority.py'` — 88 passed against the current canonical source.
- Fresh `AUDIT_ONLY` at 2026-10-07T07:05:02Z: 51 registered workspaces: 46 `UNKNOWN_OWNER`, 2 `RETIRED`, 1 `ACTIVE`, 2 `BLOCKED`. The task-owned `/tmp/smartspec-p0-wu4c-20261007` workspace was explicitly registered as `TASK_WORKTREE` with task ID `P0-WU-4C-20261007`; no other unknown workspace was modified.
- The remaining 46 unknown records have no active session; 37 are detached and 9 have branches/upstreams; 2 are dirty, 1 has a task ID without owner/session, and none has a recovery link. All remain non-destructive. Current evidence does not prove which are valid legacy, recovery, manually retained, stale metadata, external, or migration-era workspaces.
- The canonical user workspace remains at `1a30722479d6cb44f53f07dc411d7521df347aaa`, dirty with 2 paths. Convergence was attempted after PR #199 and verified `CONVERGENCE_PENDING`; latest recovery manifest: `/home/dev/projects/SmartSpecPro/.git/workspace-recovery/smartspecpro/workspace-63612604-a004-447e-b1c4-616de72d86b7/20261007T070153000619Z/manifest.json`.
- Migration evidence is bound to the existing `drizzle.__drizzle_migrations` source for applied and pending state. Repository discovery found no durable failed-attempt source; do not infer failed state or introduce a competing migration registry.
- `P0_CODE_IMPLEMENTATION = PARTIAL`; `P0_EXTERNAL_RUNTIME_VERIFICATION = NOT_VERIFIED`. Next workunit: `P0_INTERNAL_GAP_CLOSURE`.
