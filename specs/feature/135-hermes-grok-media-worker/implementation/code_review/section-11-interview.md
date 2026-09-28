# Section-11 Code Review Triage — 2026-07-16

Mode: autonomous (user waived interviews). Auto-triage by conductor.

Round 1: loop wiring + download route + heartbeat surface + ACL + expiry → AUTO-FIX.
Round 2:

| # | Finding | Severity | Decision |
|---|---|---|---|
| A | Registration/heartbeat carry no real readiness | BLOCKER | AUTO-FIX (verified at the production call site, not just the builder) |
| B | No env_clear on the Rust spawn | BLOCKER | AUTO-FIX |
| C | Control jobs outside the isolated profile | BLOCKER | AUTO-FIX |
| D | Dual HERMES_HOME | MAJOR | AUTO-FIX |
| E | Slot independence dead | MAJOR | AUTO-FIX (real atomics + spawned execution) |
| F | Timeouts unenforced | MEDIUM | AUTO-FIX |
| G | assetId path traversal | MEDIUM | AUTO-FIX |
| H | Control-job affinity | MEDIUM | AUTO-FIX |
| — | 60s doctor cache staleness | MINOR | ACCEPT (self-healing) |
| — | ExecutorState single-slot UI display | — | ACCEPT (display only; documented) |

Conductor verification: grep on disk confirmed loop→executor wiring (9 refs),
hints fed by the real doctor, download route + heartbeat warning present.
