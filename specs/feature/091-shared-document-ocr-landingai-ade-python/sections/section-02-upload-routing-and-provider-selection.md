# Section 02 - Upload Routing and Provider Selection

## Ownership

Own the Node upload pipeline and route document-centric content to ADE while keeping non-document vision intact.

## Target files / modules

- `apps/web/server/services/libraryUploadPipeline.ts`
- `apps/web/server/services/financeDocumentExtractionService.ts`
- `apps/web/server/services/libraryService.ts`
- `apps/web/server/routers/library.ts`
- `apps/web/server/routers/finance.ts`

## Work items

1. Add provider selection rules for document uploads.
2. Route `document_ocr` and finance-document capture intents to the ADE adapter.
3. Preserve existing multimodal / vision flows for non-document media.
4. Carry provider metadata forward into persisted item metadata and extraction records.
5. Keep trace IDs and capture intents intact across the handoff.
6. Gate ADE routing behind tenant policy and feature flags.
7. Route by deterministic allowlist instead of file-name heuristics.

## TDD expectations

- Write routing tests first.
- Include tests for:
  - document uploads selecting ADE
  - screenshot / scene-image uploads still using current vision path
  - finance uploads preserving capture intent and provider metadata
  - policy-disabled tenants skipping ADE
  - unsupported formats staying off the ADE path
  - trace IDs and lineage metadata surviving the route change

## Acceptance checks

- Document uploads use ADE when the feature flag and policy allow it.
- Non-document uploads are unaffected.
- Finance ingestion still produces drafts from extracted text.
- Routing decisions are deterministic and testable from analysis profile, MIME type, and policy.
