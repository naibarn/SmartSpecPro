# Section 03 — Live Verification and Convergence

## Ownership

- read-only live runtime verification
- rollout evidence under the timestamped backup/evidence directory
- final focused corrections only in Section 01/02 owned files

## Verification

Run:

1. endpoint and model probes;
2. full focused runtime fixture set;
3. Bash/Node syntax;
4. staged and installed systemd verification;
5. manual MCP JSON-RPC initialize, tool list, and `codebase_status`;
6. live MCP inspection for external environment, absent Docker socket,
   per-process limits, and cgroup parent;
7. controlled two-session admission plus rejected third attempt;
8. local data-container stopped/restart/start-time comparison;
9. watcher/index/timer state checks;
10. memory PSI, slice events, container count, and Docker-child snapshots;
11. SmartSpecPro public/local/backend health probes.

Do not convert missing evidence into a pass. If the external dependency becomes
unavailable, stop with the firewall/ESET diagnostic direction and keep
SocratiCode disabled.

## Review convergence

Run targeted conductor review because this is Codex standard-light mode.

Check:

- correctness of launcher ordering and locks;
- resource-limit enforceability;
- local-fallback closure;
- data preservation;
- rollback safety;
- stale gates after any repair;
- exact changed-path scope.

High-risk work requires two consecutive clean review rounds, up to five repair
rounds. Every repair reruns affected fixtures and live inspection.

## Acceptance

- all reviewed-design acceptance criteria have fresh evidence;
- no local data container started;
- no must-do-now gap remains;
- no unrelated dirty file changed;
- safe rollback evidence exists;
- final loop ledger and residual risks are recorded.

## Implementation results

Completed on 2026-07-18.

- Manual MCP JSON-RPC completed `initialize`, `tools/list`, and
  `codebase_status`; the status was green and the owned smoke container was
  removed.
- The live container used the exact external Qdrant/Ollama endpoints, the
  approved embedding model, 3 GiB memory/no-swap, 256 PIDs, and
  `socraticode.slice`. It had no Docker socket mount.
- Two concurrent sessions started successfully. A third launcher failed closed
  before creating a container.
- The slice enforced 5 GiB high, 6 GiB maximum, zero swap, and 512 tasks.
  `memory.events` recorded no high, maximum, OOM, or OOM-kill event.
- Local `socraticode-qdrant` and `socraticode-ollama` remained stopped with
  restart policy `no`; their start timestamps were unchanged.
- Watcher, indexer, and cleanup timer remained disabled and inactive.
- Qdrant `1.17.0`, the `nomic-embed-text:latest` model, and public/local/backend
  SmartSpecPro health probes all passed.
- Host memory PSI was zero at the final check. The inactive slice had no tasks,
  no anonymous memory, and no swap; its remaining memory accounting was
  reclaimable file cache.
- Backup checksums passed at
  `/home/dev/tools/socraticode-docker/backups/20260718T032904Z-external-only-cutover`.

The current Codex task cannot reload its MCP tool catalog dynamically. A new
task will load the installed launcher through `/home/dev/.codex/config.toml`.
This does not affect the successful direct JSON-RPC runtime proof.

## Review result

Two consecutive targeted conductor review rounds were clean after the earlier
launcher admission-race and backup-ownership repairs. No must-do-now gap,
configured local fallback, secret, socket exposure, data deletion, or unrelated
file edit remains.

`shellcheck` was unavailable on the host. Bash syntax, focused fixtures,
installed runtime checks, and live execution supplied the required proof.
