# Section 08 — Local Runtime and Resource Admission

Read `../contracts-v2.md` before implementation. Depends on: 01, 04.

## Implementation and proof

- Implement registered Python process TTS adapters beside the Music3 sidecar; reuse lifecycle utilities after impact analysis, keep environments separate.
- Ownership targets: apps/worker-app/src-tauri/src (new tts runtime modules, worker_executor, worker_loop, runtime_manifest), provider sidecar folder and Worker provider management surface. Shared schema edits belong to section 01.
- Implement manifest locks, consented download, integrity, atomic model activation, rollback, cancel/process-group cleanup, scoped local artifact resolution and cross-operation GPU lease.
- VoxCPM2 first genuine adapter; optional providers registered disabled. No inferred Thai support or fabricated health. Cloud calls never enter this executor.
- Preflight/readiness truth persists through heartbeat; reject old contract/lease, stale rights and insufficient resources.
- Tests: fake subprocess hang/cancel/restart, corrupt download, local path/symlink containment, unknown model, OOM preflight, concurrent Music3/TTS lease, model unload, canceled publication. Genuine GPU test separately gated.
- Exit: approved authored line runs locally to verified audio; reference bytes remain local; production is disabled until calibration and release proof pass.

## User-facing acceptance

Use existing Thai-primary component patterns and the responsive/accessibility matrix in `spec.md`. Show ready, unavailable, running, partial, canceled, error and success with exact provider/target and repair action. No hidden generation or fallback. Test keyboard navigation, privacy/cost disclosures and persisted state on navigation.

## Expanded lifecycle dependency

Read ../voice-lifecycle-v2.md and sections 11/12. Validate reference-only vs transcript-required vs trained modes separately. Existing inference readiness cannot authorize training. Release evidence must distinguish A/B/C/D and must cover profile API lifecycle, transitive rights and rollback where enabled.
