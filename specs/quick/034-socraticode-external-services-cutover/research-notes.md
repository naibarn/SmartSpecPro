# Research Notes

## Runtime evidence

- Current host identity: `192.168.1.124`.
- External Qdrant returned HTTP 200 and reported version `1.17.0`.
- External Qdrant collections are present.
- External Ollama returned HTTP 200 and exposes
  `nomic-embed-text:latest` with 768 embedding dimensions.
- Firewall/ESET investigation is not currently needed because both endpoints
  are reachable from `192.168.1.124`.

## Current control plane

- `/home/dev/.codex/config.toml` currently runs direct
  `npx -y socraticode@1.8.11` with the approved external environment.
- Project `.mcp.json` contains no MCP server override.
- The current Codex task did not expose SocratiCode MCP tools because task
  startup predated the current config; `codex mcp list` confirms the entry is
  enabled.
- Repository runtime source is `ops/socraticode-runtime/`.
- Installed runtime is `/home/dev/tools/socraticode-docker/`.

## Unsafe legacy path

`ops/socraticode-runtime/socraticode-mcp.sh` and its installed copy:

- default Ollama to the wrong port, `11434`;
- do not pass external Qdrant configuration;
- mount `/var/run/docker.sock` into the MCP container;
- use a 4 GiB per-container limit but no dedicated 6 GiB aggregate limit;
- do not enforce a two-session global concurrency limit.

That launcher could allow local data-service creation if re-enabled.

## Existing lifecycle safeguards

- Managed-container labels and launcher ownership metadata exist.
- Signal cleanup and fail-closed orphan cleanup exist.
- Cleanup fixture tests cover active, orphaned, PID-reused, caller-owned,
  legacy, malformed, young, cross-project, and Docker-timeout cases.
- The live MCP smoke test performs JSON-RPC initialize and
  `codebase_status`, then verifies the owned container is removed.

## Current local state

- `socraticode-qdrant`: stopped, restart policy `no`, volume preserved.
- `socraticode-ollama`: stopped, restart policy `unless-stopped`, volume
  preserved.
- watcher service: disabled/inactive.
- index service: disabled/inactive.
- cleanup timer: disabled/inactive.
- the paused installed launcher has mode `000`.

## Resource evidence

- Existing shared slice:
  - `MemoryHigh=8G`
  - `MemoryMax=10G`
  - `MemorySwapMax=0`
- Prior recurrence involved multiple MCP containers and a persistent watcher.
- External Qdrant/Ollama reduce local baseline usage, but MCP Node processes
  still require an explicit per-process and aggregate memory envelope.

## Dependency and security boundary

- SocratiCode `1.8.11` documents `QDRANT_MODE=external`,
  `QDRANT_URL`, `OLLAMA_MODE=external`, and `OLLAMA_URL`.
- The MCP image entrypoint is `socraticode`.
- With both services external, the MCP container does not need the host Docker
  socket.
- Removing the socket is the decisive control that prevents nested local
  Qdrant/Ollama startup even if application-level mode handling regresses.

## Worktree scope

The repository contains extensive unrelated dirty files. The owned source
paths under `ops/socraticode-runtime/`, the approved design document, and the
new quick-plan directory do not overlap those changes.

A separate git worktree would not isolate installed files, Docker state, or
systemd state, which are the risk-sensitive surfaces. The implementation will
therefore stay in the current tree with strict path allowlisting and
timestamped backups.
