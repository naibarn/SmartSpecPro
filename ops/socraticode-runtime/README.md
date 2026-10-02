# SocratiCode Runtime Hardening

Repository-managed source for the SmartSpecPro host's SocratiCode launcher,
watcher, resume indexer, orphan cleanup, systemd units, log rotation, and
focused lifecycle tests.

## Active install paths

| Staged source | Active path |
|---|---|
| `socraticode-mcp.sh` | `/home/dev/tools/socraticode-docker/socraticode-mcp.sh` |
| `socraticode-cleanup.sh` | `/home/dev/tools/socraticode-docker/socraticode-cleanup.sh` |
| `watch-smartspecpro.mjs` | `/home/dev/tools/socraticode-docker/watch-smartspecpro.mjs` |
| `index-smartspecpro.mjs` | `/home/dev/tools/socraticode-docker/index-smartspecpro.mjs` |
| `systemd/*.service`, `systemd/*.timer` | `/etc/systemd/system/` |
| `logrotate/socraticode-smartspecpro` | `/etc/logrotate.d/socraticode-smartspecpro` |

## Validation

Run from the repository root:

```bash
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
- Run cleanup in `--dry-run` mode before enabling its timer.
- Restart only `socraticode-smartspecpro-watch.service`.
- Preserve all existing interactive MCP container IDs and launcher PIDs.
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
