# P0-WU-4C UNKNOWN_OWNER evidence classification

- Integrated canonical ref: `refs/heads/main`
- Integrated merge SHA: `452a2073b64a7a610b504b5175196a95a5e58d81`
- Source implementation commit: `0e836a0880ecf045fa34ef1f0e4d9c4394fe3537`
- PR: #207
- Validation: `python3 scripts/development-lifecycle/test_workspace_authority.py` — 48 passed; `python3 scripts/development-lifecycle/test_runtime_authority.py` — 41 passed; Python compile and `git diff --check` passed.
- Fresh authority collector: 51 workspaces; 46 `UNKNOWN_OWNER` rows each carry state `UNRESOLVED_OWNER_PROVENANCE`; other rows: 1 `ACTIVE`, 2 `BLOCKED`, 2 `RETIRED`.
- Known evidence categories include explicit recovery linkage, stale filesystem/metadata, and active external owner lease. Unknown rows include facts on path and git metadata presence, lease/session status, task/recovery presence, dirty state, branch/upstream presence, and last verification state.
- Manual-retention, valid legacy-owner, and migration-era classifications remain unresolved where no authoritative provenance exists; no inference is made from names or age. Destructive action remains prohibited without explicit authority.
- The canonical user checkout still has two dirty paths on an older branch; do not overwrite. Its recovery receipt is `/home/dev/projects/SmartSpecPro/.git/workspace-recovery/smartspecpro/workspace-63612604-a004-447e-b1c4-616de72d86b7/20261007T072605093429Z/manifest.json`.

The latest AUDIT_ONLY observation reports 51 rows: 46 UNKNOWN_OWNER rows are explicitly UNRESOLVED_OWNER_PROVENANCE with per-row observed facts; 1 ACTIVE, 2 BLOCKED, and 2 RETIRED rows remain distinct. No unknown-owner row was retired. Manual-retention and migration-era categories remain unproven without authoritative provenance.
