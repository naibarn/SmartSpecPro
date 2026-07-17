# Section 01 - Tests and Container Ownership

## Ownership
- `/home/dev/projects/SmartSpecPro/ops/socraticode-runtime/tests/test-cleanup.sh`
- `/home/dev/projects/SmartSpecPro/ops/socraticode-runtime/socraticode-cleanup.sh`
- `/home/dev/projects/SmartSpecPro/ops/socraticode-runtime/socraticode-mcp.sh`

## TDD expectations
Write the fake-Docker cleanup fixture first and prove it fails while the helper is absent. Cover active, orphan, PID-reuse, caller-owned, legacy, timeout, dry-run, apply, and wrapper EOF/signal cleanup cases. Then implement managed labels, wrapper traps, bounded cleanup calls, and fail-closed validation.

## Acceptance checks
- Only a proven managed orphan older than the grace period is removable; a live launcher must match PID, UID, start-time identity, and command line.
- Docker failure, timeout, malformed metadata, or uncertain PID ownership never deletes.
- Wrapper EOF/signal cleanup targets only its own named container.

## Coordination risks
The wrapper and cleanup label keys are one frozen interface; change them together before Wave 2 begins. Installed copies under `/home/dev/tools/socraticode-docker` are rollout artifacts, not direct implementation targets.

## Implemented
- Added managed labels for project, launcher PID/UID/start ticks, role, and creation epoch.
- Added signal-aware wrapper ownership with explicit stdin fd preservation.
- Added fail-closed cleanup with bounded Docker calls, lock protection, dry-run/apply modes, and legacy reporting.
- Added 10 focused fake-Docker/fake-proc lifecycle scenarios.

Verification: Bash syntax passed and `bash ops/socraticode-runtime/tests/test-cleanup.sh` passed. `shellcheck` was unavailable.
