# Request

Add a new feature spec under `specs/feature/` for reusing LandingAI ADE Python as a shared document OCR / parsing backbone across SmartSpecPro.

The intent is to determine whether it is worth integrating ADE once and reusing it for all document-centric OCR needs in the system, then document the integration in a feature spec that can be handed off to `deep-implement`.

## What this feature should cover

- Shared OCR / document parsing for PDFs, scans, receipts, bank slips, invoices, statements, and similar document uploads.
- Reuse across finance, library ingestion, and any future document-centric pipelines.
- Keep the current multimodal / scene-vision pipelines for non-document use cases.

## Assumptions from the repository

- SmartSpecPro already has a Python backend, a Node web app, internal upload pipelines, and a finance OCR path.
- The repo already stores documents in R2 / storage abstractions and already has project / tenant / owner scoping primitives.
- The current OCR path is being used for finance uploads and library enrichment.

## Non-goals

- Do not replace general vision tasks such as screenshots, scene images, or video transcript flows.
- Do not introduce a full accounting or DMS product.
- Do not commit to a vendor lock-in without a fallback policy.

