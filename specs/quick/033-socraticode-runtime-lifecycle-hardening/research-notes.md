# Research Notes

## Runtime evidence
- Previous boot recorded Node memcg OOM kills at 19:03, 19:30, and 21:54.
- From 22:31 through 22:48 memory PSI stayed at 77-98% while SSH connections repeatedly reauthenticated and reset.
- `user-1000.slice` peaked at 23.6 GiB RAM and 4 GiB swap; `system-smartspec-agent.slice` peaked at 8.1 GiB against `MemoryHigh=8G`.
- Web, backend, PostgreSQL, and Redis health remained green; no disk, NVMe, NIC, MaxStartups, or kernel hardware fault was found.

## Current control plane
- MCP launcher: `/home/dev/tools/socraticode-docker/socraticode-mcp.sh`.
- Persistent watcher: `/home/dev/tools/socraticode-docker/watch-smartspecpro.mjs`.
- Resume index runner: `/home/dev/tools/socraticode-docker/index-smartspecpro.mjs`.
- Aggregate cgroup: `system-smartspec-agent.slice`, `MemoryHigh=8G`, `MemoryMax=10G`, no swap.
- Per-container default is 4 GiB; watcher/index currently request 6 GiB.
- Watcher already has a single-flight status flag and 15-minute interval, but no request timeout or orphan cleanup.
- Current Docker containers have no ownership labels, and the launcher uses `exec docker run`, so there is no wrapper lifecycle trap.
- `scripts/system-crash-monitor.sh` records service/agent cgroup events but not user-slice events or SSH/MCP counts.

## Codebase/impact scan
- SocratiCode search identified the approved design as the authoritative specification.
- SocratiCode impact analysis reports zero repository callers for `scripts/system-crash-monitor.sh`.
- No application source, schema, endpoint, auth, or tenant contract needs modification.

## Security and operations boundaries
- Cleanup must validate labels, age, launcher PID absence/ownership, and caller exclusion.
- Docker timeouts or malformed metadata must produce warnings and no deletion.
- Runtime installation must be reversible from a timestamped backup.
- Only the dedicated watcher may be restarted during rollout; interactive sessions remain untouched.
