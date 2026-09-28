# Section 01 — Shared contracts and compatibility

## Scope and dependencies

This section freezes the versioned NLE and `smartaihub.media.job` v1 contracts before UI or queue changes. It depends only on repository TypeScript conventions; later sections consume these exports. Existing `MediaJobSpec` v0.1 and existing worker-family payloads remain readable through adapters.

## Tests first

- Add Vitest schema tests under `packages/shared/src/video-editor/__tests__/` for valid envelopes, unknown major/operation/output role, unsafe URL/path/overlay, duplicate roles, limits, allowed transitions, stable hash, and minor negotiation.
- Add fixture parity tests in `apps/web/shared/types/__tests__/` and Rust fixture tests under `apps/worker-app/src-tauri/tests/`.
- Add compatibility tests proving `apps/web/shared/types/mediaJob.ts` v0.1 projects to an allowlisted v1 operation without changing existing callers.

Run focused TypeScript tests before implementation and again after implementation. Rust tests are separate evidence; a mocked test is not real sidecar proof.

## Implementation

Create pure, dependency-light modules in `packages/shared/src/video-editor/`:

- `nleProject.ts`: rational timebase/fps, canvas, tracks/clips, managed discriminated asset refs, markers, render settings, approved edit maps, and migration provenance.
- `mediaExecutionContract.ts`: strict envelope/version negotiation, operation registry (`media.probe`, `media.proxy`, `media.waveform`, `media.thumbnail`, allowlisted analysis, `video.render`), stage DAG, resource/capability, retry/billing/verification policies, event/failure schemas, and canonical hash that excludes attempt/lease/signed URL metadata.
- `migrations.ts`: explicit Worker NLE 1.0.0 and legacy Web projections with unknown-field retention.
- `fixtures/*.json`: valid, unsupported-version, traversal, duplicate-role, and event-transition fixtures consumed by Web and copied into Rust tests.

Export the modules from `packages/shared/src/index.ts`. Keep Web-only compatibility projections in `apps/web/shared/types/mediaJob.ts` and `apps/web/shared/workerRuntime.ts`; do not import React, Tauri, or filesystem APIs into shared code. Rust uses serde structs matching the fixture JSON and rejects unknown major versions before claim.

## Acceptance and evidence

Record the schema version, fixture filenames, test commands and any Rust/toolchain skip in this section. This closes the contract portion of AC-05, AC-06, AC-09, AC-13, AC-15, and AC-16 and is a prerequisite for all later sections.

## Safety and rollback

All additions are additive. If a fixture or consumer fails, revert only the new exports/adapters; leave `MediaJobSpec` and existing worker payload validators unchanged.

## Implementation status

Implemented `packages/shared/src/video-editor/{nleProject,mediaExecutionContract,migrations,index}.ts` and deterministic JSON fixtures under `fixtures/`, including valid, unsupported-version, unsafe/traversal, duplicate-role and invalid-transition cases, exported from `packages/shared/src/index.ts`, with Web contract tests in `apps/web/shared/videoEditorContracts.test.ts`. The local validator now checks canonical IDs, integer time fields, marker/track/clip uniqueness, the full allowlisted media-analysis operation family, dependency references/cycles and the server status transition table. Focused tests pass; Rust fixture parity and full cross-language negotiation remain runtime follow-up evidence.

## UI/UX Contract
### Target User / JTBD
Creator and operator need understandable contract failures before a job is submitted.
### Surface Inventory
Schema errors surface in editor import/export and Worker Jobs detail.
### Component Map
Shared schemas own messages; editor and queue components render them.
### State Matrix
Valid, unsupported, rejected, and retryable validation states are represented.
### Responsive Matrix
Messages remain readable at mobile, tablet, laptop, and desktop widths.
### Accessibility Acceptance
Errors use semantic alert/status roles and are keyboard reachable.
### Copy Contract
Thai primary, English fallback; stable error codes stay machine-readable.
### Browser Evidence Required
jsdom assertions cover valid/rejected states and one authenticated route smoke.
