# Section 02 — Registry, version, and search

## Goal
Complete exact and historical manifest registry behavior and compact semantic discovery.

## Files
- Modify `apps/web/server/services/workflowNodeContracts.ts`.
- Extend `apps/web/shared/workflowNodeContracts.test.ts`.

## Requirements
- Provide exact type/version resolution, deterministic search over type/family/intents/concepts/retrieval summary, binding requirements, compatible preset filtering, and coverage metadata.
- Historical lookup returns only retained immutable digest-verified manifests; missing history fails closed.
- Reject duplicate keys, mutable manifest replacement, and unknown/precanonical IDs as registry entries.
- Return compact summaries without leaking system-only control-plane entries.

## TDD and acceptance
Tests cover exact/current/unsupported/historical lookup, duplicate registration, deterministic query ordering, preset ranges, metadata, and unknown ID behavior.

## Dependencies / gates
Depends on Section 01. No DB persistence is added; retained history is explicit in-memory/static registry input until a separately owned persistence contract exists.

## UI/UX Contract

### Target User / JTBD
N/A: this section changes contract/service behavior only and does not change a user-visible workflow.

### Surface Inventory
N/A: no browser route, visual surface, or rendered component changes in this section.

### Component Map
N/A: no React component ownership changes; existing Studio facade remains the presentation boundary.

### State Matrix
N/A for loading, empty, error, success, disabled, hover, focus, and selected UI states; preserve stable backend reason codes for current UI consumers.

### Responsive Matrix
N/A: no layout or responsive behavior changes.

### Accessibility Acceptance
N/A: no rendered controls or interaction semantics change.

### Copy Contract
N/A: no new user-facing copy; preserve existing Thai/English localization behavior.

### Browser Evidence Required
N/A: service/shared-contract tests cover this section. If implementation changes browser-visible behavior, add browser evidence before completion.

## Implemented Result

Implemented exact current and explicit historical registries, compatible preset filtering, deterministic bounded search including `retrievalSummary`, binding requirements, and coverage metadata. Registry remains in-memory/static; no persistence migration was added.

## Verification

`workflowNodeContracts.test.ts` covers exact version, historical separation, duplicate registration, deterministic search, presets, and coverage metadata.
