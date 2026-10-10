# 091 - Shared Document OCR Backbone with LandingAI ADE Python

Version: 1.0  
Date: 2026-04-11  
Status: Proposed  
Depends-on: 075-unified-web-desktop-agent-platform, 078-private-personal-finance-ocr-rag, 267-smartaihub-cloudflare-production-migration-durable-execution-control-plane-v2, 229-unified-rag-retrieval-intelligence-cloudflare-ai-search-vectorize, 266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric
Audience: Product, Python Backend, Web Control Plane, Library/RAG, Finance, Security, QA

---

## Executive summary

SmartSpecPro should reuse one shared document OCR / parsing backbone for all document-centric workflows through the existing Python backend and provider integrations. LandingAI ADE remains a supported document parsing candidate; it is not the mandatory or universal primary provider.

The key idea is:

1. document uploads are parsed first
2. parsed markdown and extracted fields are reused downstream
3. finance, library ingestion, and future document workflows consume the same normalized output
4. non-document vision tasks continue using the existing multimodal path

This is a **document OCR and extraction** feature, not a general replacement for all image / vision / video processing.

---

## Problem statement

The platform currently has multiple OCR-adjacent paths:

- finance document extraction
- library upload enrichment
- generic multimodal vision
- file parsing for tabular or text files

Those paths work, but they are fragmented:

- they use different providers and fallback behavior
- they produce different metadata shapes
- they are harder to debug consistently
- they do not share a single parse lineage model

For document uploads such as receipts, invoices, slips, statements, and scanned PDFs, a dedicated document parsing engine is a better fit than a generic scene-vision prompt.

The goal is to make document OCR a reusable platform primitive rather than a feature-specific implementation detail.

---

## Goals

- Reuse one Python-based document parsing service across SmartSpecPro.
- Support PDF and image documents used in finance and library workflows.
- Preserve a parse-first / extract-second document workflow.
- Normalize extracted text, markdown, and structured fields into a shared shape.
- Preserve tenant / project / owner scoping and audit trails.
- Use public or temporary public URLs for document processing.

---

## Non-goals

- Do not replace the existing non-document vision pipeline.
- Do not replace video transcript extraction.
- Do not build a full DMS or accounting system.
- Do not remove the existing library or finance extraction stack in v1.
- Do not force all uploads, including screenshots and scene photos, through ADE.

---

## Why ADE is a fit

LandingAI ADE is designed around document parsing and extraction:

- parse a document into markdown and structural chunks
- extract fields from the parsed markdown using a schema
- support public URL or staged-file inputs
- support large / async document workflows

That makes it a supported candidate, subject to tenant policy and measured suitability, for:

- receipts
- bank slips
- bank statements
- invoices
- scanned PDFs
- document-style image uploads

For SmartSpecPro, that means one provider can serve multiple product surfaces:

- finance OCR draft creation
- library indexing / RAG
- future document workflows such as contracts or statements

---

## Repo fit

This repo already has the right foundations:

- Python backend for internal document services
- Node upload pipeline that already routes `document_ocr`
- storage abstraction that can expose temporary public URLs
- finance ingestion that consumes OCR text plus provenance metadata
- library tables that store parse and extraction lineage

Important existing modules:

- `python-backend/app/api/internal_library.py`
- `python-backend/app/services/r2_storage_service.py`
- `apps/web/server/services/libraryUploadPipeline.ts`
- `apps/web/server/services/financeDocumentExtractionService.ts`
- `apps/web/server/services/libraryService.ts`
- `apps/web/drizzle/schema.ts`

This feature should reuse those modules instead of inventing a second document subsystem.

---

## Locked product decisions

1. Provider choice is an adaptive policy decision. Typhoon OCR is the preferred OCR provider for Thai-language documents, preserving its existing integration and quality baseline. ADE and other validated providers remain available for compatible document classes; no provider migration is implied by this Spec.
2. Non-document vision stays on the existing multimodal provider path.
3. Private uploads must be converted to public or temporary public URLs before provider calls.
4. Tenant / project / owner boundaries are mandatory and fail closed.
5. Provider lineage must be stored for debugging and audit.
6. The system must keep a fallback policy for tenants that cannot send documents to an external provider.

### 6.1 Scope boundaries

- `document_ocr` and finance-style documents are in scope.
- scene photos, screenshots, and videos are out of scope for ADE routing.
- text-only files that are already parseable by native code can remain on the existing text extractor unless they are document-like and benefit from ADE.

### 6.2 Adaptive document processing policy

- OCR extraction and LLM reasoning are separate capabilities. A reasoning model MUST NOT silently replace OCR transcription.
- Typhoon Hosted API remains the preferred Thai OCR route. An optional Typhoon self-host / Local Runner route may be offered only after compatibility, quality, security, and capacity validation; hosted processing remains available when no eligible Runner is present.
- Provider capability, supported MIME types, model/version, quota observations, and cost data are configuration or runtime observations, not hard-coded assumptions in this contract.
- Before OCR, inspect the document: use native text extraction for text-bearing PDFs; OCR scanned pages; route mixed PDFs at page granularity; use structure-aware parsing for complex layouts and tables. Avoid OCR when reliable native extraction already meets the requested purpose.
- Preserve the original document and bind each derived artifact to its source revision, page/source location, extraction version, provider, confidence or uncertainty, and warnings. Never invent text, table values, or amounts absent from the source.
- Provider fallback is permitted only when the candidate is enabled and validated for quality, quota, cost, latency, data residency / PDPA, tenant policy, and user intent. Unvalidated routes remain disabled.
- Long-running and batch work MUST use the existing SPEC-267 `worker_jobs` plus outbox/control-plane path, provider capacity admission, fairness, retry, checkpoint, cancellation, and recovery contracts. Do not add an OCR-specific queue or scheduler.
- OCR quality, retrieval usability, and action safety are separate outcomes. Partial or uncertain extraction may be retained for retrieval with explicit provenance; high-impact transactional decisions use appropriate field-level validation. Ordinary OCR does not require human approval by default.

---

## Proposed architecture

### 7.1 Shared ADE adapter

Add a Python adapter that:

- resolves document inputs to a provider-safe URL
- calls ADE parse
- optionally calls ADE extraction with a schema
- returns normalized markdown, OCR text, extraction JSON, and provider metadata

### 7.2 URL resolution

Before provider calls:

- public URLs stay public
- local / private URLs are uploaded or resolved to a temporary public URL
- provider calls never receive localhost or internal-only URLs directly

### 7.3 Shared output contract

The adapter should produce a stable output object with:

- `provider`
- `model_version`
- `source_url_kind`
- `source_url_public`
- `markdown`
- `ocr_text`
- `structured_json`
- `page_count`
- `warnings`
- `trace_id`

### 7.4 Downstream reuse

Consumers should be able to use the same output for:

- finance draft generation
- library chunking
- RAG indexing
- document previews

### 7.5 Routing matrix

Use the following routing rules as the product contract:

| Analysis profile / input class | Example inputs | Document parser route | Notes |
|---|---|---|---|
| `document_ocr` | receipts, invoices, slips, statements, scanned PDFs, document-style images | Policy-routed | Prefer Typhoon for Thai OCR; retain ADE and other validated paths only where enabled and suitable. |
| Finance document capture | finance uploads created from chat or library ingestion | Policy-routed | Reuse the configured, validated provider route and preserve source tenant/project/owner context. |
| Document-like library ingestion | multi-page or scan-like uploaded documents | Policy-routed | Reuse normalized output for downstream chunking and indexing; select by document class, language, and tenant policy. |
| `real_world_vision` | scene photos, screenshots, UI captures, browser captures, video frames | No | Keep the existing multimodal path. |
| Native text/table parsing | CSV, XLSX, TXT, other files already handled by code | No by default | Stay on native parsers unless product logic marks the file as document-like. |
| Unsupported or risky documents | password-protected PDFs, archives, HTML, SVG, scriptable files, MIME mismatch | No | Reject or send to manual review; do not call ADE. |

The routing decision must be deterministic and based on:

- analysis profile
- MIME type and magic bytes
- tenant policy
- ownership / scope context
- explicit allowlist rather than file-name heuristics

### 7.6 Failure and fallback policy

The system must behave as follows when ADE is unavailable or disallowed:

- if the tenant policy forbids external document processing, do not call any external OCR provider
- if a document has a supported local fallback parser, use that path only for the supported file classes
- if no local fallback exists, fail closed with a clear, user-safe error
- provider failures, 429/Retry-After, and transient responses follow SPEC-267's durable bounded retry and capacity policy; do not restart already completed pages
- partial or uncertain output remains attributable and resumable; manual review is reserved for policy-defined high-impact or unresolvable cases, not every OCR failure
- non-document vision flows must continue using the existing multimodal provider path regardless of ADE status

Fallback behavior must be logged with:

- selected provider
- fallback reason
- policy decision
- trace ID

### 7.7 Persisted lineage contract

Persist the provider lineage and parse provenance for every document parse attempt, successful or not.

At minimum, store:

- `tenant_id`
- `project_id`
- `owner_user_id`
- `library_item_id` or source document reference
- `analysis_profile`
- `provider`
- `model_version`
- `source_url_kind`
- `source_url_public` or redacted URL reference
- `mime_type`
- `file_hash`
- `markdown_hash`
- `ocr_text_hash`
- `page_count`
- `parse_status`
- `warning_codes`
- `error_codes`
- `trace_id`
- `provider_request_id` when available

The lineage record must be sufficient to answer:

- which provider handled the document
- which URL kind was used
- whether a fallback happened
- what artifact hashes were produced
- whether the result was eligible for downstream reuse

For page-aware extraction, lineage additionally binds page number, source coordinates or structural path when available, reading order, table structure, confidence/uncertainty, source-to-output mapping, and idempotency/checkpoint identity. Original bytes remain governed by the existing storage and retention owners.

---

## Security and privacy

This feature handles private documents, so it must:

- respect tenant / project / owner scoping
- avoid logging raw document content
- redact source hostnames in debug logs
- guard by policy for external processing
- support audit trails for provider, model, and source URL kind
- keep source URLs short-lived when they are temporary public URLs
- treat OCR text, extracted JSON, and markdown as sensitive content in logs and analytics
- ensure trace data never exposes raw local file paths or internal-only hostnames

For finance and personal data, the integration should prefer:

- temporary public URLs with short TTLs
- or an approved external document processing policy

If the tenant policy forbids external transfer, the system should fail closed or fall back to a locally allowed path.

---

## Acceptance criteria

- Finance document uploads can be parsed through the ADE adapter.
- Library ingestion can reuse ADE parse output.
- The UI / backend still preserve non-document vision behavior.
- Provider selection, URL kind, and trace IDs are visible in logs.
- Private documents do not leak internal URLs to the provider.
- Unsupported document types are rejected or routed to the documented fallback path.
- Policy-disabled tenants do not send documents to ADE.
- Security and scoping tests pass for personal and work projects.
- Thai documents prefer the existing Typhoon OCR route when policy and availability allow, without removing other configured routes.
- Native-text PDFs avoid unnecessary OCR; scanned and mixed PDFs can be processed at page granularity with resumable partial results.
- Downstream indexing reuses SPEC-229 retrieval contracts and SPEC-266 provenance/evidence semantics without creating a second index or lineage authority.

---

## Rollout

Suggested rollout strategy:

1. implement the shared Python adapter behind a feature flag
2. route finance document OCR first
3. route selected library document uploads next
4. keep legacy fallback paths for disallowed or unsupported inputs
5. expand only after audit and QA confirm provider behavior

Rollout guardrails:

- keep the feature flag off by default for existing tenants
- enable only for tenants with approved external document processing policy
- start with finance and selected library document classes before broadening the allowlist
- require a rollback path that restores the legacy OCR route without migration work
- monitor parse failure rate, fallback rate, and provider latency during the initial rollout

---

## Risks and mitigations

- **Risk:** ADE provider outages interrupt document parsing.
  - **Mitigation:** keep bounded retries, a legacy fallback where allowed, and manual review for failures.
- **Risk:** the route allowlist expands too far and captures screenshots or scene images.
  - **Mitigation:** route by deterministic analysis profile and MIME checks, not by loose document-like heuristics.
- **Risk:** temporary URLs expire before ADE fetches the file.
  - **Mitigation:** set temp URL TTLs to exceed the worst-case provider fetch window and retry with a fresh URL when safe.
- **Risk:** metadata gets split across Python and Node in incompatible shapes.
  - **Mitigation:** define one canonical lineage contract and make Node consume it without reshaping fields.
- **Risk:** sensitive document content leaks into logs or metrics.
  - **Mitigation:** redact hostnames, hash artifacts, and keep raw document content out of debug and analytics paths.

---

## Open questions

- Should library ingestion always prefer ADE for document-like uploads, or only for a stricter allowlist of file types at launch?
- What is the exact tenant policy source of truth for allowing outbound document processing?
- Which local fallback parsers are considered acceptable for tenants that block external processing?
- Do we need a separate retention window for raw OCR artifacts versus derived markdown and hashes?
- Should provider request IDs be stored on every attempt or only on successful parses?
