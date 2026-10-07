# Mission Control registered owner identity evidence

- Canonical integration: PR #182, SHA `55571e18378880a7058bde38548e8211aa280842`.
- Before fix, the Mission Control test had an active workspace with explicit `owner_session_id=session-1` but projected `agent_identity=UNKNOWN`, despite the authority facts being available.
- The projection now uses the active registered owner session ID as `agent_identity` with source `registered_owner_fact` when no stronger explicit agent identity exists. Provider remains `UNKNOWN` unless Runner inventory or another authoritative provider fact identifies it. No provider is guessed from task, host, path, or branch.
- Regression: `PYTHONPATH=scripts/development-lifecycle python3 -m unittest test_workspace_authority.WorkspaceAuthorityTests.test_project_mission_control_read_model_uses_authority_sessions_and_unknown_production -v` (PASS); pre-fix run was RED on `UNKNOWN != session-1`.
- Suite: `PYTHONPATH=scripts/development-lifecycle python3 -m unittest test_workspace_authority -v` — 41 passed. `python3 -m py_compile scripts/development-lifecycle/workspace_authority.py scripts/development-lifecycle/test_workspace_authority.py` and `git diff --check` passed.
- Residual boundary: provider identity, task-to-provider mapping, and authenticated host-to-agent mapping remain unknown unless those facts are explicitly recorded by an authoritative source. This change only projects the live owner session fact.
