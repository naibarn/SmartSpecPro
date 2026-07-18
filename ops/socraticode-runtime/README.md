# SocratiCode Runtime Hardening

Repository-managed source for the SmartSpecPro host's SocratiCode launcher,
watcher, resume indexer, orphan cleanup, systemd units, log rotation, and
focused lifecycle tests.

## External-only data services

The launcher runs the SocratiCode MCP container on `192.168.1.124`, but pins
its data services to:

- Qdrant: `http://192.168.1.119:16333`
- Ollama: `http://192.168.1.119:11435`

It probes both endpoints and verifies `nomic-embed-text` before cleanup or
container startup. A failed probe exits with firewall/ESET guidance for
`192.168.1.119`; local Qdrant/Ollama fallback is forbidden.

The MCP container has no Docker socket mount. Admission is limited to two
managed MCP containers, each capped at 3 GiB/no-swap under
`socraticode.slice`, whose aggregate hard limit is 6 GiB.

## Active install paths

| Staged source | Active path |
|---|---|
| `socraticode-mcp.sh` | `/home/dev/tools/socraticode-docker/socraticode-mcp.sh` |
| `socraticode-cleanup.sh` | `/home/dev/tools/socraticode-docker/socraticode-cleanup.sh` |
| `watch-smartspecpro.mjs` | `/home/dev/tools/socraticode-docker/watch-smartspecpro.mjs` |
| `index-smartspecpro.mjs` | `/home/dev/tools/socraticode-docker/index-smartspecpro.mjs` |
| `systemd/socraticode.slice` | `/etc/systemd/system/socraticode.slice` |
| `systemd/*.service`, `systemd/*.timer` | `/etc/systemd/system/` |
| `logrotate/socraticode-smartspecpro` | `/etc/logrotate.d/socraticode-smartspecpro` |

## Validation

Run from the repository root:

```bash
bash ops/socraticode-runtime/tests/test-external-launcher.sh
bash ops/socraticode-runtime/tests/test-cleanup.sh
node --test ops/socraticode-runtime/tests/watch-smartspecpro.test.mjs
node ops/socraticode-runtime/tests/live-mcp-smoke.mjs
bash -n ops/socraticode-runtime/*.sh scripts/system-crash-monitor.sh
node --check ops/socraticode-runtime/watch-smartspecpro.mjs
node --check ops/socraticode-runtime/index-smartspecpro.mjs
/usr/sbin/logrotate --debug ops/socraticode-runtime/logrotate/socraticode-smartspecpro
```

## Safe rollout invariants

- Back up active scripts, units, policy, logs, and container inventory first.
- Keep watcher, indexer, and cleanup timer disabled and inactive.
- Keep `socraticode-qdrant` and `socraticode-ollama` stopped with restart
  policy `no`; preserve their named volumes.
- Never restore a local data-service fallback during rollback.
- Verify public/local/backend health, PSI, cgroup events, and Docker child count.

Exact timestamped restore commands are recorded in the rollout backup's
`manifest/RESTORE.md`, the repository-side `orchestra/backups/` manifest, and
`orchestra/decisions.md`.

## Live status

```bash
systemctl status socraticode-smartspecpro-watch.service --no-pager
systemctl list-timers socraticode-smartspecpro-cleanup.timer --all --no-pager
/home/dev/tools/socraticode-docker/socraticode-cleanup.sh --dry-run
docker ps --filter name=socraticode-mcp \
  --format '{{.Names}} {{.Label "com.smartspec.socraticode.managed"}} {{.Label "com.smartspec.socraticode.role"}}'
cat /proc/pressure/memory
```

Do not manually remove a legacy container unless its launcher/client process is
proven absent. The automated cleanup intentionally reports legacy unlabeled
containers without mutating them.
