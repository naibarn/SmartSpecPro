# Runtime Operations

## Inspect without mutation

```bash
/home/dev/tools/socraticode-docker/socraticode-cleanup.sh --dry-run
systemctl status socraticode-smartspecpro-watch.service --no-pager
systemctl list-timers socraticode-smartspecpro-cleanup.timer --all --no-pager
docker ps --filter name=socraticode-mcp \
  --format '{{.ID}} {{.Names}} {{.Label "com.smartspec.socraticode.managed"}} {{.Label "com.smartspec.socraticode.role"}}'
cat /proc/pressure/memory
```

Legacy unlabeled containers are report-only. Do not stop one unless its launcher
and owning client are proven absent.

## Focused verification

```bash
bash ops/socraticode-runtime/tests/test-cleanup.sh
node --test ops/socraticode-runtime/tests/watch-smartspecpro.test.mjs
node ops/socraticode-runtime/tests/live-mcp-smoke.mjs
sudo systemd-analyze verify \
  /etc/systemd/system/socraticode-smartspecpro-cleanup.service \
  /etc/systemd/system/socraticode-smartspecpro-cleanup.timer \
  /etc/systemd/system/socraticode-smartspecpro-index.service \
  /etc/systemd/system/socraticode-smartspecpro-watch.service
sudo /usr/sbin/logrotate --debug /etc/logrotate.d/socraticode-smartspecpro
```

## Rollback

Use the exact manifest and commands in
`orchestra/backups/20260716T165411Z-socraticode-runtime/RESTORE.md`. Disable the
new timer, restore the saved files, reload systemd, and restart only the
dedicated watcher. Do not restart web/backend/database services for this
rollback.
