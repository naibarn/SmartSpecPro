# TDD Plan

## Start with failing tests

### Python adapter tests

Add tests that prove:
- a public document URL is sent to ADE unchanged
- a local / private upload is rewritten to a temporary public URL before ADE
- parsed markdown and schema extraction are normalized into the expected response shape
- provider metadata is preserved in debug traces
- unsupported MIME types, encrypted PDFs, and oversized documents are rejected before provider calls
- schema violations from extraction are rejected rather than coerced
- OCR text remains untrusted until it passes validation

### Node routing tests

Add tests that prove:
- `document_ocr` routes to the ADE-backed path
- `real_world_vision` and video transcript flows do not change
- document uploads still carry trace IDs and capture intent
- deterministic routing uses analysis profile, MIME type, and tenant policy
- policy-disabled tenants never call ADE
- unsupported document classes stay on the non-ADE path

### Finance tests

Add tests that prove:
- finance OCR uses ADE output when available
- finance draft creation still works from extracted text
- scope / owner checks still fail closed
- fallback/manual-review states do not create confirmed transactions
- personal finance writes reject mismatched `owner_user_id`

### Library / RAG tests

Add tests that prove:
- parsed text is persisted and indexed
- `allowed_scopes` and `project_id` are preserved
- private documents do not leak across projects
- legacy ambiguous rows remain excluded from personal evidence
- parsed artifacts are redacted from normal logs

## Expected failing conditions before implementation

- current OCR pipeline still calls the existing multimodal fallback for document uploads
- private uploads still pass internal-only URLs directly
- parse metadata is not persisted in a provider-aware form
- unsupported and encrypted documents can still reach provider calls
- OCR content is not validated before persistence

## Regression checks

- screenshot / scene image vision still works
- video transcript still works
- finance document extraction still produces drafts
- library chunking and retrieval still honor tenant / project scope
- rate limits and audit logging still apply
- temp URL expiry, provider outage, and malformed output produce bounded, user-safe failures
- OCR content does not override routing, scope, or retention decisions
