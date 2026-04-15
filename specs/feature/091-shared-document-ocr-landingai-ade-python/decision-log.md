# Decision Log

## Decision 1: Use ADE for document-centric OCR only

We will treat LandingAI ADE as the shared backend for document OCR / parse / extract.

Why:
- it is designed for parsing documents to markdown before extraction
- it supports schema-driven extraction from parsed documents
- it fits the current Python backend architecture

Rejected alternative:
- replacing all existing vision paths with ADE

Reason rejected:
- ADE is not a generic scene-vision / screenshot / video engine
- non-document tasks still need the current multimodal path

## Decision 2: Keep a policy gate for external document processing

Document uploads may use ADE only when the tenant / project policy allows external processing.

Why:
- finance and private documents may be sensitive
- the product already has a privacy / tenant isolation model
- some deployments may require local-only processing

## Decision 3: Normalize private uploads through public or temp URLs

Documents sent to ADE must be represented as accessible URLs, not raw local file paths.

Why:
- ADE parse supports public URLs and staged files
- current storage infrastructure already can produce temp public URLs
- the OCR provider should not depend on localhost or internal-only links

## Decision 4: Preserve the current vision pipeline for non-document media

Screenshots, UI captures, scene photos, and video remain on the existing multimodal path.

Why:
- avoids forcing ADE into a workload it is not intended for
- reduces regression risk
- keeps the feature scope honest

## Decision 5: Use a deterministic routing allowlist

The system will route by analysis profile, MIME type, magic bytes, and tenant policy rather than by file name or loose heuristics.

Why:
- reduces false positives for screenshots and scene images
- keeps the contract testable
- makes policy enforcement predictable

## Decision 6: Define explicit fallback behavior

If ADE is unavailable or disallowed, the system will either use a documented local fallback for supported file classes or fail closed.

Why:
- prevents silent changes in document handling
- keeps policy-denied tenants from accidentally egressing data
- provides a clear operational path for outages

## Decision 7: Canonical lineage records live in the provider adapter contract

The Python adapter will emit the canonical parse lineage shape, and the Node side will persist those fields without inventing a second schema.

Why:
- avoids duplicated provider inference
- keeps hashes, trace IDs, and source URL kind aligned across services
- simplifies testing and debugging

## Risks

- vendor dependency and external service availability
- per-document cost and throughput limits
- privacy / data residency review
- migration work to store parse metadata cleanly
