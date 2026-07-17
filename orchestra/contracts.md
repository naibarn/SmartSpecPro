# Orchestra Contracts

## Runtime lifecycle contract

### Shared Interface
- Managed container labels identify project, launcher PID, role, and creation epoch.
- Cleanup removes a container only when it is managed, old enough, not caller-owned, and its launcher PID is absent or fails command-line ownership validation.
- Watcher request timeouts terminate only the owned launcher child and exit non-zero so systemd can restart the dedicated watcher.

### Ownership Boundaries
- Conductor owns staged runtime sources/tests under `/home/dev/projects/SmartSpecPro/ops/socraticode-runtime/`.
- Conductor owns installation of validated staged copies to `/home/dev/tools/socraticode-docker`, `/etc/systemd/system`, and `/etc/logrotate.d` after backup.
- Conductor may modify `/home/dev/projects/SmartSpecPro/scripts/system-crash-monitor.sh` only for directly related observability.
- Application, DB, web/backend service, auth, and unrelated dirty files are forbidden.

### Test Boundary
- Shell fixture tests cover cleanup eligibility and fail-closed Docker behavior.
- Node integration tests cover watcher initialize/watch/status timeouts and single-flight status polling.
- Live verification covers systemd, logrotate, MCP startup/status, active-container preservation, PSI, cgroup events, SSH session count, and production health.

### Impact Boundary
- in-scope-now: SocratiCode runtime, cleanup timer, watcher unit, log rotation, crash-monitor telemetry.
- quality-gate-only: agent slice config, public/local web and backend health, DB readiness.
- out-of-scope: application features, database/schema, auth, tenant data, unrelated feature tests.

Contracts freeze when Wave 2 implementation begins.
