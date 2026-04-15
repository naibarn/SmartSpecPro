# Implementation Plan

## Objective

Add a shared document OCR / parsing backbone powered by LandingAI ADE Python so the platform can reuse one reliable document pipeline across finance, library ingestion, and future document workflows.

## Current-codebase fit

This repo already has:
- a Python backend that can host the ADE client
- Node upload routing that already passes file metadata and internal trace IDs
- finance OCR ingestion that expects extracted text, source provenance, and audit trails
- library storage and chunking primitives that can store parse output and derived text
- storage backends that can mint short-lived public URLs for private objects
- existing scope filters that can enforce tenant / project / owner boundaries

This means the integration should be additive:
- introduce a shared document parse/extract service in Python
- route document-centric uploads to that service
- preserve the existing multimodal vision flow for non-document media

## Proposed architecture

### 1) Python service adapter

Add a small ADE adapter in `python-backend` that can:
- parse a document from a public or temporary URL
- optionally extract structured data from parsed markdown using a schema
- return normalized metadata:
  - provider name
  - model / version
  - source URL kind
  - page count
  - parse status
  - markdown / OCR text
  - warnings / errors
  - artifact hashes
  - trace ID

The adapter should enforce a single canonical response shape so the Node side does not have to infer provider-specific fields.
The adapter must treat OCR text and extracted markdown as untrusted input and validate the extracted schema before any downstream write.

### Safety and trust boundaries

Document OCR introduces untrusted content into the system. The implementation must:

- keep provider prompts separate from OCR content
- never allow OCR text to override authorization, scope, routing, or retention decisions
- validate structured extraction output against the expected schema before persisting it
- reject malformed JSON or schema violations instead of coercing them silently
- store raw OCR content only in scoped, access-controlled artifacts
- redact raw document text from normal debug logs and analytics

Any review or extraction prompt must reference the OCR content as data, not as instructions.

### 2) Source URL normalization

Before calling ADE:
- public URLs can be used directly
- private / local uploads should be resolved to a temporary public URL using the existing storage layer
- raw localhost / internal-only URLs must not be sent to ADE
- the temporary URL TTL must be long enough for the provider fetch window but short enough to minimize exposure
- temporary URLs should be generated only when the tenant policy allows outbound processing
- URL regeneration should be bounded so expired links do not loop indefinitely

If a temp URL expires, the system may mint a new URL only when the source file still exists and the retry remains within budget.

### 3) Routing policy

Update the upload pipeline so document-centric analysis profiles use ADE first:
- `document_ocr`
- finance receipts / slips / statements
- library document ingestion where the content is document-like

Keep current multimodal vision for:
- screenshots
- scene images
- UI / browser captures
- video frames

Use deterministic routing based on:
- analysis profile
- MIME type and magic bytes
- tenant policy
- explicit allowlists

Do not route unsupported, encrypted, or non-document media into ADE.
Do not infer document routing from filename, extension alone, or OCR confidence.

Document classes that must never call ADE:

- password-protected or encrypted PDFs
- archives and container formats
- HTML, SVG, or scriptable document types
- MIME / magic-byte mismatches
- oversized files above the configured cap

### 4) Persist parse lineage

Persist provider lineage so downstream consumers can audit what happened:
- source URL kind
- parse provider
- parse model / version
- markdown hash
- extracted text hash
- trace ID
- MIME type
- file hash
- parse status
- provider request ID when available
- warning and error codes

### 5) Downstream reuse

Reuse ADE output in:
- finance OCR to draft transactions
- library ingestion to build chunks / search text
- future document-centric RAG features

Downstream consumers should treat the ADE result as an immutable parse artifact and should not re-derive provider identity from raw URLs.

## Failure modes and fallback behavior

- If ADE is disallowed by tenant policy, use a local fallback only for supported file classes; otherwise fail closed.
- If ADE is unavailable or returns malformed output, retry within bounded limits and then surface a manual-review state.
- If a temporary URL expires before fetch, mint a new URL and retry only when the source file is still available.
- Non-document vision routes must remain isolated from any ADE outage or policy failure.
- fallback behavior must never broaden scope or change ownership context
- manual-review states must preserve the original source reference and the reason for fallback

## Affected files and modules

Likely touch points:
- `python-backend/app/api/internal_library.py`
- `python-backend/app/services/<new-ade-adapter>.py`
- `python-backend/app/services/r2_storage_service.py`
- `apps/web/server/services/libraryUploadPipeline.ts`
- `apps/web/server/services/financeDocumentExtractionService.ts`
- `apps/web/server/services/libraryService.ts`
- `apps/web/drizzle/schema.ts`
- related tests under `python-backend/tests` and `apps/web/server/services/__tests__`

## Risks and mitigations

- **Risk:** ADE is external and may not be allowed for all tenants.
  - **Mitigation:** add a policy gate and keep a fallback path for disallowed tenants.
- **Risk:** temp or localhost URLs still leak into the provider.
  - **Mitigation:** force public/temp URL resolution and log source URL kind.
- **Risk:** OCR content is treated like instructions or trusted JSON.
  - **Mitigation:** validate schema output, isolate prompts, and keep OCR text untrusted until it passes structural checks.
- **Risk:** temp URL expiry triggers repeated retries or dead loops.
  - **Mitigation:** bound retries, regenerate URLs only when the source object still exists, and fail to manual review after budget exhaustion.
- **Risk:** unsafe file classes reach ADE despite the allowlist.
  - **Mitigation:** reject encrypted, mismatched, oversized, and scriptable formats before any provider call.
- **Risk:** document parsing can be slow or large.
  - **Mitigation:** async job handling for large files and rate limits per tenant / owner.
- **Risk:** non-document workflows regress if routed incorrectly.
  - **Mitigation:** keep a strict analysis-profile allowlist.
- **Risk:** lineage metadata diverges across services.
  - **Mitigation:** make the Python adapter the source of truth and propagate the same contract into Node persistence.
- **Risk:** large PDFs slow down the ingestion path.
  - **Mitigation:** keep async job handling, caps, and clear manual-review states.

## Acceptance criteria

- Document uploads can be parsed through ADE in Python.
- Finance uploads can reuse ADE output for OCR drafting.
- Library ingestion can reuse the same parse result for indexing.
- Non-document vision flows still use the existing multimodal path.
- Private / local file paths are never passed to ADE directly.
- Audit and trace logs identify provider, model, and source URL kind.
- Unsupported inputs are rejected or routed to the documented fallback path.
- Provider outage, malformed output, and URL expiry cases have defined, testable behavior.
- OCR content is validated as untrusted input before persistence.
- The system never routes encrypted, oversized, or MIME-mismatched documents into ADE.
