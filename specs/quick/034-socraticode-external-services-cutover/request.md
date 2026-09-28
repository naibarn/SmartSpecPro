# Request

## Original request

Move SmartSpecPro SocratiCode to external data services only:

- Qdrant: `http://192.168.1.119:16333`
- Ollama: `http://192.168.1.119:11435`
- never start `socraticode-qdrant` or `socraticode-ollama` on
  `192.168.1.124`;
- if either endpoint is unreachable, inspect firewall/ESET on
  `192.168.1.119` before any fallback action.

The user approved the reviewed design in
`docs/portable-skill-pack/specs/2026-07-18-socraticode-external-services-cutover-design.md`
and requested implementation.

## Task summary

Replace unconstrained direct SocratiCode execution with one external-only,
resource-bounded launcher, preserve stopped local data containers and volumes,
and prove the cutover without starting local Qdrant/Ollama.

## Likely affected areas

- `ops/socraticode-runtime/`
- `/home/dev/tools/socraticode-docker/`
- `/home/dev/.codex/config.toml`
- `/etc/systemd/system/socraticode.slice`
- Docker restart policy for the two stopped local data containers

## Constraints

- Back up runtime/config state before mutation.
- Use TDD for launcher behavior.
- Keep SocratiCode `1.8.11` pinned.
- Keep watcher, indexer, and cleanup timer disabled/inactive.
- Cap each MCP container at 3 GiB and aggregate MCP memory at 6 GiB with no
  swap.
- Allow at most two concurrent MCP containers.
- Do not delete containers, volumes, collections, or model data.
- Preserve unrelated dirty worktree files.
- Do not start the local Qdrant or Ollama container even for verification.

## Assumptions

- The MCP process remains on `192.168.1.124` and reads the local SmartSpecPro
  checkout.
- The external endpoints remain reachable over the LAN.
- The existing `socraticode-mcp:1.8.11` image remains the MCP runtime.
- A failed MCP launch is preferable to host memory exhaustion or local
  fallback.

## Non-goals

- Remote MCP transport on `192.168.1.119`.
- SocratiCode version upgrades.
- Re-enabling persistent watcher/index services.
- Migrating the stopped local Qdrant data.
