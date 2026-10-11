# SmartAIHub Marathon R10 — Evidence Index

- Canonical integrated checkpoint: `86d744878dcd67e1f8187a125f713b9364353573` (PR #676).
- Implementation source: `f42e3d9f241b457b02b5c41248046055afa50023`.
- Full acceptance record: `specs/feature/224-Autonomous Development Orchestrator Runtime/handoff/evidence/r10-developmentrun-synthetic-repair-20261011.json`.
- Exact focused command: `SPEC224_EMIT_EVIDENCE=1 node_modules/.bin/vitest run --config apps/web/vitest.config.ts apps/web/server/services/__tests__/spec224DevelopmentRunTaskControl.integration.test.ts apps/web/server/services/__tests__/spec224DevelopmentRunPersistence.test.ts apps/web/server/services/__tests__/spec224DevelopmentRunIntegration.test.ts apps/web/server/services/__tests__/spec224DisposableGitAcceptance.test.ts`.
- Result: 4 files, 24 tests passed; owner-marked disposable PostgreSQL and temporary Git repository; one Run/WorkUnit identity; all 12 phases exercised in canonical action order (candidate edit in IMPLEMENT; real failure in TEST; bounded repair in DEBUG_REPAIR; pass in TEST; independent process in VERIFY); fresh process reread persisted run and evidence; cancellation gate blocked repair writes; same-run PLANNING lease expired/reclaimed with fencing 1→2 and the stale worker could not persist a result; Final Verify denied completion due missing real workspace receipts.
- No provider API or live Runner execution; no shared/production database, migration, deploy or release.
- Canonical CI baseline: [CI run 38120077317](https://github.com/naibarn/SmartSpecPro/actions/runs/38120077317), SHA `b73ef6dd…`; broad Python and repository typecheck failures predate R10. The migration-named run 38120076733 had zero jobs and was not retried.
- Typecheck attempt: manually scoped `tsc` expanded to about 3.3 GiB RSS and broad existing diagnostics; stopped to protect shared resources. No `npm run typecheck` or full repository check run.
- Live Runner status: not verified from a fresh registry/session; SPEC-205 records owner authorization and installed-candidate acceptance as pending. Protected dispatch remains DENY.
