# Section 01 — Media contracts

## Goal

Create the strict shared contract layer used by the web app, Worker Control
Plane, Tauri pipeline, storyboard, and server publication. Do not implement
FFmpeg, database queries, or provider calls in this section.

## Files

- Add `apps/web/shared/verticalDramaMedia/contracts.ts`.
- Add `apps/web/shared/verticalDramaMedia/workflow.ts`.
- Add `apps/web/shared/verticalDramaMedia/errors.ts`.
- Extend `apps/web/shared/workerRuntime.ts` only with job family/capability
  values and typed request/result references required by these contracts.
- Add focused Vitest tests under
  `apps/web/shared/verticalDramaMedia/__tests__/` and
  `apps/web/shared/__tests__/workerRuntime.verticalDramaMedia.test.ts`.

## Required behavior

Define strict bounded Zod schemas/types for:

- root binding, source manifest/probe/analysis, dead-air/focus/reframe/still
  motion/shot budget policies, edit plan, QC report;
- start-frame asset/revision/fingerprint and ordered reference-frame pack with
  semantic role/order, optional last frame/reference video/audio;
- workflow request/policy snapshot/resolution, capability probe and route;
- media ingest, B-roll preprocess, and shot-video generation job payloads,
  artifact manifests, progress/domain states, and stable errors.

Reject unknown keys, client authority fields, absolute paths, URLs, credentials,
raw graphs, and unbounded arrays/strings. Preserve server-owned tenant/user
ledger fields as output-only attribution, never input authority. Ensure source
and derived artifact references carry revisions/fingerprints and that the
workflow resolution is immutable.

## TDD requirements

Write tests before implementation for strict rejection/bounds, valid payloads,
reference ordering, role uniqueness, shot budget limits, workflow resolution
selection-source values, forbidden path/URL/secret detection, and all error
codes. Run the focused shared tests before and after implementation.

## Acceptance

All later sections can import stable named schemas/types without redefining
media contracts; TypeScript and Vitest pass for changed shared files.

## UI/UX Contract

### Target User / JTBD
N/A — shared contracts only; downstream UI sections consume these states.
### Surface Inventory
N/A — no surface is rendered here.
### Component Map
N/A — schemas only.
### State Matrix
Contract states cover loading, blocked, processing, ready, failed, stale, and revoked.
### Responsive Matrix
N/A — no layout.
### Accessibility Acceptance
Downstream components must expose schema-driven status and error text semantically.
### Copy Contract
Stable error codes provide Thai/English localized messages downstream.
### Browser Evidence Required
N/A — validate contracts with Vitest; browser evidence belongs to section 05.
