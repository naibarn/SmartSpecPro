# Section 01 Diff Capsule

Files reviewed:
- `ops/socraticode-runtime/socraticode-cleanup.sh`
- `ops/socraticode-runtime/socraticode-mcp.sh`
- `ops/socraticode-runtime/tests/test-cleanup.sh`

Change summary:
- Added fail-closed managed-container discovery and orphan eligibility checks.
- Added PID, UID, start-time, command-line, age, project, and caller ownership validation.
- Added signal-aware stdio-preserving launcher wrapper with owned-container cleanup.
- Added fake-Docker/fake-proc regression scenarios without production Docker mutation.

Evidence: `bash ops/socraticode-runtime/tests/test-cleanup.sh` -> PASS.
