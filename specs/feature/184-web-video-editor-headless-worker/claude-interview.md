# Deep-plan interview transcript — Feature 184

No additional stakeholder question was required. The supplied implementation specification defines the product scope, migration stages, responsibility boundary, compatibility requirements, and acceptance criteria sufficiently to proceed without inventing business rules.

## Q1 — Product outcome and migration boundary

**Answer from supplied requirements:** The Web editor becomes the primary editing surface. The more capable Worker editor is the feature-parity baseline. The existing Worker UI remains available during migration and is removed only after measured parity and stability gates.

## Q2 — Heavy work and queue behavior

**Answer from supplied requirements:** Browser/server control-plane work stays interactive; heavy media probe, proxy, analysis, encoding, upload, and QC work becomes a durable job pulled by a headless Worker. The existing `worker_jobs` queue and `/api/worker-jobs/*` transport are reused.

## Q3 — Compatibility and data safety

**Answer from supplied requirements and codebase evidence:** Preserve existing Web `video_editor_projects` and `videoEditorProjects` consumers. Add revision/asset/job relationships safely through schema evolution or companion tables, preserve immutable source data, reject stale writes, and never silently drop unsupported imported fields.

## Auto-decisions

- Use TypeScript/React/tRPC/Zod/Drizzle/Vitest/Playwright and Rust/Cargo patterns already present in the repository.
- Reuse `worker_jobs`, existing worker runtime routes, scheduler, billing, artifact, and monitor services rather than create a second queue.
- Add new editor operation types through an allowlist and adapters; preserve existing job-family payloads.
- Treat `video_editor_projects` as the current persistence base and add companion revisions/assets only where required.
- Use `/worker-jobs` and Thai page title `คิวงานประมวลผลของฉัน` as the canonical queue surface; preserve `/render-jobs` as a query-preserving compatibility alias.
- Keep paid/provider/runtime execution out of planning verification unless a safe local fixture is available; do not spend credits or mutate production data during implementation proof.
