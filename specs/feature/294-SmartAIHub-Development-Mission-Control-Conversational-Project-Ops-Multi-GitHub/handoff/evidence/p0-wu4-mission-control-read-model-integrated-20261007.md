# P0-WU-4 Mission Control project read-model checkpoint

- Tested implementation commit: `2f384ba19` (merged PR #117).
- Integrated `origin/main`: `8cc6327d472bf78175fb9fa584d92a08aec98877`.
- Added `workspace_authority.py mission-control` and `build_project_mission_control_read_model` from resolver snapshots. It reports canonical/user workspace state and convergence receipt, counts active sessions only from explicit live ownership facts, and groups dirty, integrating, retireable, stale/unknown, and recovery workspaces.
- Production is `UNKNOWN` without supplied SPEC-295 evidence and uses the existing pure evaluator when evidence is supplied. Unpushed/pushed-unintegrated commit totals remain `UNKNOWN`, and agent/provider are null because current authority records do not provide those facts.
- Validation: workspace authority suite — 39 passed; bytecode compile and diff check — PASS; incident matrix — 35 mapped cases.
- This is a local authority-backed read model/CLI, not a complete web Mission Control UI or safe-action implementation.
