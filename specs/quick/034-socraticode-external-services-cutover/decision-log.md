# Decision Log

## Planning depth

- depth: `standard`
- reason: focused single-domain infrastructure change with repository source,
  installed runtime, systemd, Docker metadata, and live verification
- sections: 3
- promotion: not required

The task remains suitable for quick-plan because it does not change application
code, schemas, APIs, auth, or user-visible behavior.

## Key decisions

1. Use the reviewed external-only launcher design rather than direct `npx`.
2. Keep SocratiCode pinned to `1.8.11`.
3. Pin exact Qdrant/Ollama endpoints in the launcher.
4. Remove Docker socket access from the MCP container.
5. Limit MCP to two concurrent containers, 3 GiB each.
6. Add `socraticode.slice` with `MemoryHigh=5G`, `MemoryMax=6G`,
   `MemorySwapMax=0`, and `TasksMax=512`.
7. Preserve local containers and volumes but set both restart policies to
   `no`.
8. Keep watcher, indexer, and cleanup timer disabled.
9. Use safe rollback: disable the MCP entry rather than restore a local-data
   fallback.
10. Stay in the current worktree because owned paths are clean and a worktree
    cannot isolate live Docker/systemd mutations.
11. Use no sub-agents; Codex standard-light direct execution is smaller and
    avoids file ownership conflicts.

## Five-round stabilization review

### Round 1 — completeness

[AUTO-FIX] Made the endpoint contract immutable in production planning and
required external probes before cleanup or other runtime mutation.

### Round 2 — contradictions

[AUTO-FIX] Ordered backups before `docker update`, config installation, or
systemd installation so every mutable surface has a restore record.

### Round 3 — security and abuse cases

[AUTO-FIX] Required an assertion that the MCP container has no Docker socket
mount and that the local data-container start timestamps do not change.

### Round 4 — missing integration risks

No meaningful findings. Manual MCP JSON-RPC smoke plus installed-container
inspection covers the current-task tool-catalog reload limitation.

### Round 5 — obvious missing improvement

No meaningful findings. Two consecutive rounds are clean; stabilization stops.

## Risks that would trigger promotion

- external MCP transport becomes required;
- remote source synchronization is added;
- local Qdrant data migration becomes required;
- the existing image cannot operate without Docker socket access.

If the last risk occurs, stop safely with SocratiCode disabled. Do not add a
local Qdrant/Ollama fallback.
