# Windows Codex Handoff

You are the Windows-side migration executor for SocratiCode.

## First instruction

Read the canonical runbook from the server:

`/home/dev/projects/SmartSpecPro/planning/socraticode-windows-docker-migration/MIGRATION_PLAN.md`

Then copy these three files to a new local staging directory and verify SHA-256:

- `MIGRATION_PLAN.md`
- `WINDOWS_CODEX_HANDOFF.md`
- `evidence-manifest.template.yaml`

Create `evidence-manifest.yaml` from the template and update it throughout the
run.

## Authority

Planning files do not authorize execution. Before doing anything beyond
read-only checks, confirm that the user has explicitly authorized the migration.

You may:

- perform read-only server inventory over verified SSH;
- create local Windows/WSL/Docker resources;
- clone source and transfer only approved artifacts;
- configure SocratiCode locally;
- run local validation.

You may not:

- start the server SocratiCode launcher, watcher, indexer, timer, or Ollama;
- start server Qdrant without separate explicit snapshot-window approval;
- copy secrets, production data, the whole repository, or whole Docker volumes;
- change SmartSpecPro application/database services;
- reset or clean either Git working tree;
- delete server or local volumes/artifacts;
- infer approval when a runbook gate says stop.

## Mandatory architecture

- Use a WSL 2 agent.
- Keep the repository under WSL `/home`, not `/mnt/c`.
- Run the MCP stdio process locally in WSL.
- Use Docker Desktop for a controlled, resource-limited external Qdrant.
- Do not copy the Linux launcher or use an SSH-wrapped MCP command.
- Use fresh local reindex by default.

## Operating protocol

For every phase:

1. Read its entry criteria.
2. Run only the listed in-scope commands.
3. Record command, timestamp, result, and hashes in the manifest.
4. Check stop conditions.
5. Mark the gate pass/fail.
6. Do not advance on failure.

When the runbook contains placeholders, discover or ask for the real value and
store it in the manifest. Never execute literal placeholder text.

## Initial report to the user

Before migration work, report:

- verified SSH target and fingerprint status;
- Windows/WSL/Docker preflight summary;
- current server disabled-state summary;
- source commit/dirty-state summary;
- recommended selected route;
- approvals still required.
