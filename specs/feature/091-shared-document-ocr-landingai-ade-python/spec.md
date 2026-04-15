# 091 - Shared Document OCR Backbone with LandingAI ADE Python

Version: 1.0  
Date: 2026-04-11  
Status: Proposed  
Depends-on: 075-unified-web-desktop-agent-platform, 078-private-personal-finance-ocr-rag  
Audience: Product, Python Backend, Web Control Plane, Library/RAG, Finance, Security, QA

---

## Executive summary

SmartSpecPro should reuse one shared document OCR / parsing backbone for all document-centric workflows by integrating LandingAI ADE Python into the existing Python backend.

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

That makes it a strong candidate for:

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

1. ADE is the primary provider for document-centric OCR / parse / extract flows.
2. Non-document vision stays on the existing multimodal provider path.
3. Private uploads must be converted to public or temporary public URLs before provider calls.
4. Tenant / project / owner boundaries are mandatory and fail closed.
5. Provider lineage must be stored for debugging and audit.
6. The system must keep a fallback policy for tenants that cannot send documents to an external provider.

### 6.1 Scope boundaries

- `document_ocr` and finance-style documents are in scope.
- scene photos, screenshots, and videos are out of scope for ADE routing.
- text-only files that are already parseable by native code can remain on the existing text extractor unless they are document-like and benefit from ADE.

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

| Analysis profile / input class | Example inputs | ADE route | Notes |
|---|---|---|---|
| `document_ocr` | receipts, invoices, slips, statements, scanned PDFs, document-style images | Yes | Primary path when tenant policy allows external processing. |
| Finance document capture | finance uploads created from chat or library ingestion | Yes | Must preserve source tenant/project/owner context. |
| Document-like library ingestion | multi-page or scan-like uploaded documents | Yes | Use ADE output for downstream chunking and indexing. |
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

- if the tenant policy forbids external document processing, do not call ADE
- if a document has a supported local fallback parser, use that path only for the supported file classes
- if no local fallback exists, fail closed with a clear, user-safe error
- if ADE times out or returns malformed output, retry only within bounded limits and then fall back to manual review
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
