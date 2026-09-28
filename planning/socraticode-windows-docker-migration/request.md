# SocratiCode Migration to Windows Docker Desktop

## Objective

Create a complete, execution-ready migration plan for a Codex client running on
Windows to connect to this Linux production server over SSH, read the migration
instructions, and move the SocratiCode working set off the server into Docker
Desktop for Windows without risking SmartSpecPro production data or reintroducing
the prior memory-exhaustion failure.

This planning phase must not start SocratiCode, move data, change MCP
configuration, enable systemd units, or mutate Docker volumes.

## Current server context

- Repository: `/home/dev/projects/SmartSpecPro`
- SocratiCode MCP image: `socraticode-mcp:1.8.11`
- Server-side launcher:
  `/home/dev/tools/socraticode-docker/socraticode-mcp.sh`
- Repository-managed runtime sources:
  `/home/dev/projects/SmartSpecPro/ops/socraticode-runtime/`
- Qdrant container: `socraticode-qdrant`
- Qdrant volume: `socraticode_qdrant_data`
- Embedding provider previously used: external Ollama
- SocratiCode is intentionally stopped:
  - launcher mode is non-executable
  - watcher/index/timer units are disabled and inactive; the cleanup service is
    static and inactive
  - managed MCP container count is zero
  - Qdrant is stopped with restart policy `no`
- SmartSpecPro web, backend, database, Docker volumes, and application services
  must remain untouched.

## Target architecture

- Windows 11 or supported Windows host
- Docker Desktop using the WSL 2 Linux-container backend
- A WSL 2 Linux distribution used as the local development filesystem and shell
- A local SmartSpecPro working copy under the WSL Linux filesystem, not
  `/mnt/c`
- Codex on the Windows client uses a local MCP stdio process
- Docker Desktop owns Qdrant and, if selected, Ollama
- Do not reproduce the server's one-full-MCP-container-per-client pattern
- The Linux server remains free of active SocratiCode runtime after cutover

## Required planning deliverables

1. A canonical, self-contained migration runbook that a fresh Codex client on
   Windows can read over SSH and execute without conversation history.
2. Explicit SSH connection, host-key verification, least-privilege, and secret
   handling rules.
3. A read-only server inventory phase that discovers actual paths, versions,
   volume sizes, collection metadata, repository dirty state, and available
   disk space without starting SocratiCode.
4. A Windows/WSL/Docker Desktop preflight covering versions, Linux-container
   mode, filesystem placement, memory/CPU/swap limits, network access, disk
   capacity, Node.js, Git, OpenSSH, and checksum utilities.
5. A data classification that separates:
   - authoritative source code and planning/runtime files
   - rebuildable SocratiCode/Qdrant index data
   - Docker image artifacts
   - logs and diagnostic evidence
   - secrets and machine-specific configuration that must not be copied
6. A recommended transfer strategy and a fallback strategy for:
   - Git-tracked source
   - uncommitted server work when explicitly required
   - the pinned SocratiCode image
   - Qdrant collections or snapshots
   - runtime scripts/configuration used only as reference
7. A decision between fresh local reindexing and Qdrant snapshot migration,
   including compatibility, absolute-path/project-identity, version, downtime,
   and rollback trade-offs.
8. Checkpointed phases with entry criteria, commands described at runbook level,
   expected evidence, stop conditions, and rollback.
9. A strict rule that destructive actions such as deleting volumes, changing
   production Docker services, resetting Git state, or copying credentials
   require a separate explicit authorization and verified backup.
10. Validation covering:
    - Windows-side MCP initialize/status/search/symbol/impact smoke tests
    - index completeness and watcher behavior
    - Windows memory containment and no process/container fan-out
    - server-side confirmation that SocratiCode remains disabled
    - SmartSpecPro public/local/backend/Postgres health
    - checksum and inventory reconciliation
11. Cutover, observation window, rollback, and handoff instructions.
12. A machine-readable checklist or evidence manifest format for the Windows
    Codex client to update while executing.

## Assumptions to verify during execution

- The Windows client already has or can install Docker Desktop, WSL 2, Git,
  OpenSSH, Node.js, and Codex.
- The Windows client can authenticate to the server using an existing SSH key.
- Windows hostname, WSL distribution, Windows/WSL usernames, RAM, CPU, free disk,
  SSH host alias, and target paths are not known at planning time.
- These values must be discovered and stored as variables in the evidence
  manifest rather than hard-coded.
- The server repository contains extensive unrelated dirty work. The migration
  must not alter or discard it.
- A fresh reindex is preferred unless snapshot migration is proven compatible
  and provides meaningful value.

## Out of scope for this planning phase

- Executing the migration
- Re-enabling SocratiCode on the server
- Starting server-side Qdrant
- Installing software on Windows
- Copying source, images, volumes, snapshots, logs, or secrets
- Modifying Codex/Claude MCP configuration
- Changing SmartSpecPro application or database code
- Committing or pushing planning artifacts
