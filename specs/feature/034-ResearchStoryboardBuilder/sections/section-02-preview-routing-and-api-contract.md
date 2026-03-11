# Section 02 - Preview Routing And API Contract

## Objective

Turn validated structured results into preview-first product behavior, expose preview data and commit actions through stable APIs, and ensure previews remain useful even when commit is deferred or fails.

## Prerequisites

- Section 01 complete.

## Scope

- Implement preview routing from `AgencyResultEnvelope`.
- Expose preview details and commit actions through Node-facing APIs.
- Keep plain-text rendering intact.
- Define preview lifecycle states visible to UI and backend consumers.

## Primary files and areas

- Node routing and service layers near `apps/web/server/routers/agency.ts`
- Node bridge/service contract near `apps/web/server/services/agencyBridge.ts`
- Any new result-router service in `apps/web/server/services`
- Supporting Python response adapters only if Section 01 did not finish all response-shape work

## Required implementation work

### 1. Create preview routing behavior

Map structured intents to preview models:

- research preview
- storyboard preview
- deck preview

Preview routing must:

- persist preview state in `agency_run_artifacts`
- expose summary text for chat
- expose structured preview data for specialized UI
- avoid downstream artifact creation automatically

### 2. Define preview lifecycle

Support deterministic lifecycle states such as:

- generated preview
- expired preview
- commit pending
- committed
- commit failed

The UI and APIs must be able to distinguish these states without inspecting raw metadata blobs.

### 3. Expose preview and commit APIs

Add or update APIs so clients can:

- fetch preview details for a run
- inspect provenance and citation data
- trigger confirm or promote
- see commit outcome and open-target identifiers when commit succeeds

The API surface must include a streaming-compatible contract. Existing SSE consumers should continue receiving readable text and progress events. Structured preview support should appear as a terminal preview-ready signal or equivalent final structured payload event, not as a breaking replacement for the existing stream format.

For Phase 1, the streaming contract is:

- existing upstream events remain valid and unchanged
- a new optional `preview_ready` event is emitted for structured-preview runs
- `preview_ready` carries run ID, preview artifact identifiers, intent, and a compact summary
- `run_finished` still terminates the stream for legacy clients

### 4. Preserve compatibility

Text-only agencies must still render properly. Structured preview data is additive and should not force all callers to understand envelopes immediately.

### 5. Define payload-size and snapshot behavior

Specify how preview APIs behave when payloads are too large for inline runtime storage. Lock thresholds and fallback behavior for:

- inline database storage
- referenced snapshot storage
- API truncation or summarization for oversized previews

For Phase 1, use `64KB` as the inline threshold and `5MB` as the maximum direct preview persistence size.

## Tests to write first

- Node test: router maps each supported intent to the correct preview type.
- Node test: preview records are created without creating downstream committed assets.
- Node test: lifecycle states are surfaced clearly in API responses.
- Node test: expired previews remain auditable but cannot be committed.
- Node test: text-only runs still render correctly through the same API surface.
- Node test: streaming preview-ready behavior remains backward-compatible for SSE clients.
- Node test: oversized preview payloads still produce stable preview APIs via snapshot indirection.

## Risks and safeguards

- API drift risk if preview DTOs are loosely defined. Use stable typed DTOs.
- UX ambiguity risk if preview and committed states are overloaded. Keep separate status fields.
- Retry risk if commit metadata is not stable. Always include a commit token.

## Exit criteria

- Supported structured intents produce preview artifacts and preview DTOs.
- APIs expose preview read and commit initiation paths.
- Text-only agencies remain unaffected.
- Preview lifecycle states are explicit and test-covered.

## Implementation notes

- Added `apps/web/server/services/agencyPreviewService.ts` to normalize `research_report`, `video_storyboard`, and `presentation_deck` envelopes into stable preview DTOs with explicit lifecycle, provenance, audit, and commit metadata.
- Updated `apps/web/server/routers/agency.ts` so `sendMessage` returns additive `preview` metadata, `getRunPreview` fetches normalized preview details for a run, and the new `commitPreview` mutation reserves the client contract ahead of Sections 03-04.
- Expanded `apps/web/server/services/agencyBridge.ts` run detail metadata so preview DTOs can read artifact payload snapshots, payload storage mode, provenance, and expiry/commit timestamps.
- Hardened preview reads by threading `conversation_id` through run details and reusing the existing conversation ownership guard before returning a preview.
- Extended `python-backend/app/services/agency_service.py` to persist the payload-size policy (`<=64KB` inline, `run_structured_result_payload` indirection up to `5MB`, summary-only above `5MB`) and to emit `preview_ready` after streaming preview persistence succeeds.
- Expanded Python run detail payloads with artifact payload/provenance metadata so Node can rebuild stable preview DTOs without inspecting raw table state.

## Tests added and updated

- `apps/web/server/services/agencyPreviewService.test.ts`
- `apps/web/server/routers/__tests__/agency.test.ts`
- `apps/web/server/_core/agencyStreamProxy.test.ts`
- `python-backend/tests/unit/test_agency_service.py`

## Known follow-ups

- Sections 03-04 must replace the `commitPreview` placeholder with the real research/storyboard and deck commit handlers.
- The SSE proxy test file now includes a `preview_ready` passthrough assertion, but full execution still depends on an environment that permits local socket binding during tests.
