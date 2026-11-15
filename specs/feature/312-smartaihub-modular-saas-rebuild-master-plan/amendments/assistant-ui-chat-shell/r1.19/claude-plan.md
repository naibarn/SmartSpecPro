# R1.19 Implementation Plan

## Baseline and requirements

Continue from Chat Shell R1.18 at `smartaihub-platform@ad04c244c3996cc81220d7efae0f0c536dd07f4b`. Previous audit: Architecture, SPEC, Chat UI, Runtime Adapter and Inspector PARTIAL; Inline Artifacts, Task Control integration and Mission Control integration MISSING. Preserve these historical facts and reuse the existing Core chat/queue/attachment APIs.

Trace every R1.19 requirement to: (a) SPEC-312 R1.19 plus relevant canonical contracts SPEC-318 (jobs), SPEC-310 (Harness), SPEC-294 (Mission Control), SPEC-200 (Task Control), SPEC-325 (security), (b) source/API, (c) regression tests, (d) current integrated SHA, (e) exact modular-debian-dev receipt. Mark authenticated UAT BLOCKED unless a real authorized browser session is used.

## Work order

1. Inspect canonical identity/job/execution/artifact schemas and existing SPEC contracts. Add the smallest additive event envelope + cursor/event schema and service contracts; tests cover auth scope, dedupe and ordering. Do not invent missing entity relations.
2. Implement replayable event read/write and Hono SSE on the Core, with event delivery generated from canonical job transitions; reconnect via last cursor, polling fallback, terminal event handling. Keep queue dispatch durable and `stream:false` truthfully represented.
3. Implement artifacts using existing private R2/attachment patterns; authenticated registration/read/download, canonical metadata and safe content-type preview. Enable capability only when end-to-end routes pass.
4. Add authorized truthful execution/inspector projection and canonical Task/Mission links only where authoritative APIs exist. Document unavailable facts/dependencies rather than duplicating tables or orchestrators.
5. Integrate event/artifact/inspector state into assistant-ui; complete responsive behavior and targeted tests at desktop/tablet/mobile dimensions where test tooling supports it.
6. Reconcile SPEC-312, affected authoritative SPECs, traceability, audit, release evidence and canonical handoff. Run targeted tests, typechecks/builds, Worker dry runs, deployment-target preflight, deploy DEV, verify exact source and runtime.

## Constraints

No legacy site changes; no Cloudflare production deployment; no browser auth bypass; no assistant-generated executable artifacts in app origin; no user-visible fabricated state. Preserve unrelated SmartSpecPro worktree changes and stage only owned files. Integrate each coherent platform source slice through configured main workflow.

## Definition of Done

All implementable slices integrated; additive schema deployed to authorized development DB and verified; event replay/SSE, artifacts, inspector and cross-navigation have focused tests; Chat package and Core build checks pass; exact source is healthy on `aimarkethubs.com`; SPEC and existing canonical handoff identify evidence and remaining real blockers. Final report lists all eight areas and accurately labels authenticated UAT.
