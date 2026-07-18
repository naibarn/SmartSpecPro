# Section 02 — Resource Guard and Cutover

## Ownership

- `ops/socraticode-runtime/systemd/socraticode.slice`
- `/home/dev/tools/socraticode-docker/socraticode-mcp.sh`
- `/etc/systemd/system/socraticode.slice`
- `/home/dev/.codex/config.toml`
- Docker restart-policy metadata for stopped local data containers
- timestamped backup/manifest files for this rollout

Do not edit application files or start any SocratiCode data container.

## Preconditions

- Section 01 tests pass.
- External Qdrant and Ollama/model probes pass.
- Local Qdrant/Ollama are stopped.
- Watcher/index/cleanup timer are disabled and inactive.
- Backup captures file hashes, container state/start timestamps, unit state,
  endpoints, and restore/disable instructions.

## Implementation

1. Add and verify the dedicated systemd slice.
2. Install the validated launcher atomically with executable permissions.
3. Change both stopped local data-container restart policies to `no`.
4. Keep persistent SocratiCode units disabled/inactive.
5. Change Codex MCP command to the installed launcher while preserving tool
   approval settings.
6. Reload systemd without starting watcher/index/timer.

## Acceptance checks

- staged and installed hashes match;
- `systemd-analyze verify` passes;
- effective slice values are 5/6 GiB, no swap, 512 tasks;
- both local data containers remain stopped with restart `no`;
- their start timestamps remain unchanged;
- `codex mcp list` shows the launcher command enabled;
- config contains no direct unconstrained `npx` entry.

## Rollback

On any blocking failure:

- disable the SocratiCode MCP entry;
- leave local Qdrant/Ollama stopped with restart `no`;
- restore only validated external-safe files if needed;
- do not re-enable persistent units or local fallback.

## Implementation result

Status: installed and ready for live MCP verification.

Repository file added:

- `ops/socraticode-runtime/systemd/socraticode.slice`

Installed/runtime changes:

- `/etc/systemd/system/socraticode.slice`
- `/home/dev/tools/socraticode-docker/socraticode-mcp.sh`
- `/home/dev/.codex/config.toml`
- restart-policy metadata for the two stopped local data containers

Backup and restore evidence:

- `/home/dev/tools/socraticode-docker/backups/20260718T032904Z-external-only-cutover`

Both local data-container start timestamps remained identical to the backup
baseline. Watcher, indexer, and cleanup timer remained disabled/inactive.
