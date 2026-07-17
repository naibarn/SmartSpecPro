# TDD Plan

## Red checks first
- Shell fixture invokes cleanup against a fake Docker CLI and fake `/proc` root. Before the helper exists, the test fails. Cases: live owner preserved, missing owner removed only in apply, PID-reused owner removed, caller-owned preserved, legacy reported only, timeout preserved, dry-run no mutation, and wrapper EOF/signal cleanup targets only its owned container.
- Node integration test starts the watcher against a fake stdio MCP child. Before watchdog implementation, initialize/watch/status hangs do not exit within the test deadline and overlapping status polls can accumulate.

## Green implementation
- Implement only the ownership/timeout behavior needed for each failing case.
- Keep production defaults conservative; expose unsafe short intervals only behind an explicit test flag.

## Regression checks
- `bash -n` staged launcher/cleanup and repository monitor scripts.
- `node --check` staged watcher/index runners and `node --test` staged watcher integration test.
- `systemd-analyze verify` installed and staged units.
- `logrotate --debug` then bounded force rotation after incident log backup.
- cleanup `--dry-run` and live MCP JSON-RPC smoke test.
- three short resource/health snapshots after rollout.

## Fixtures
- Tests may override Docker binary, `/proc` root, current epoch, launcher path, log path, polling interval, and watchdog timeouts.
- Production defaults cannot be weakened by test configuration unless `SOCRATICODE_ALLOW_UNSAFE_TEST_TIMEOUTS=1` is set.
