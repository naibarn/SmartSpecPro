# CI Diagnosis — Canonical SHA d8d1bfe8 — 2026-10-23

- Workflow: [CI run 39876063126](https://github.com/naibarn/SmartSpecPro/actions/runs/39876063126), source SHA `d8d1bfe8606fb063f4829c6291a797fcb9757038`.
- Observed failed jobs: `python` and `turbo_build`. At the time of this record, `local_ai_runtime` and `smartspecweb` were still running, so this is a partial workflow result.
- Python job: 52 failed, 4,845 passed, 40 skipped. Root-cause groups:
  - 17 obsolete `SupervisorAgent` tests expect Kilo/OpenCode routing and methods absent from the current runtime. Production `supervisor_integration.py` still imports this retired surface, so removal needs a dedicated dependency/runtime migration; restoring those methods would violate the retired-system boundary.
  - 8 trigger tests assert old webhook/schedule return shapes and validation behavior.
  - 6 SPEC-224 PostgreSQL integration tests lacked the required loopback disposable database harness and failed closed (`SPEC224_DISPOSABLE_POSTGRES_TARGET_FORBIDDEN` or missing-target guard); classify these as harness/authority blocked, not implementation failures.
  - Remaining failures cover missing CI `ffmpeg`, missing API-key test setup, stale registry/inventory expectations, retired workflow behavior, unavailable slide-render service, and unrelated fixture/integration mismatches.
- Turbo build: 545 TypeScript diagnostics across many files. Largest groups were TS2339 (110), TS2322 (97), TS2345 (86), TS7006 (78), TS18048 (27), and TS2769 (25). Errors span stale tRPC/router clients, outdated schema/type contracts, unsafe inferred/nullable values, and imports/references to removed Agency/workflow surfaces. Do not restore retired systems or suppress errors broadly.
- One directly relevant SPEC-224 defect was fixed in candidate source `c899776f32626f7baf542baccec58e2da78f0103`: approval decisions now dispatch only recognized SPEC-224/P213 durable continuations and fail closed for unknown legacy workflow approvals without importing LangGraph or `app.orchestrator`. Focused test evidence is recorded separately.
- This CI run does not certify the candidate fix because it ran on the earlier canonical SHA `d8d1bfe8`; the next canonical CI run must verify the fix.
