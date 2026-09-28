# Feature 171: Special Tie-in forensic observability

## Objective

Make special tie-in prompt generation fully diagnosable from one run correlation
ID. Admins must be able to reconstruct the selected skill/version/input, the raw
LLM request and response after approved redaction, every retry decision and
validation failure, provider/model timing, and final persistence outcome.

## User-approved data policy

Store raw prompt/request and raw output/response for debugging, limited to
admin-only detail reads and retained for 30 days. Redact Authorization/API keys,
cookies, tokens, and signed URLs before persistence. Preserve hashes and original
lengths. Do not copy binary reference images; retain asset IDs and reference
metadata.

## Scope and isolation

Apply the new telemetry to the `special_tie_in_prompt` interactive job and its
special tie-in skill adapter only. Do not change normal episode generation,
normal script/storyboard retries, media-provider generation, or existing global
audit sanitization behavior.

## Required behavior

1. Create a durable, tenant/user/series/episode/job-indexed forensic event record
   for the special run and each lifecycle/LLM/retry/persistence event.
2. Carry `tenantId`, `userId`, `seriesId`, `episodeId`, `jobId`, `traceId`,
   `createIntentId`, `inputVersion`, `skillSlug`, and sequence on every event.
3. Capture normalized special input, reference bindings, selected characters and
   product/location assets, skill hash/version, and contract version.
4. Capture exact serialized request and response bodies after redaction, with
   SHA-256 and character counts. Capture parsed output where available and
   structured schema issues where validation fails.
5. Emit events for queued, started, skill loaded, input captured, request started,
   response received, JSON parse failure, schema failure, semantic failure, retry
   decision, accepted/rejected output, persistence started/succeeded/failed, and
   terminal success/failure.
6. Before each retry, record machine-readable category (`json_parse`, `schema`,
   `semantic`, `transient`, or `provider_fallback`), reason, ordinal, model
   transition, and remaining budget. Emit a heartbeat/progress event at each
   planning attempt so a provider wait is distinguishable from a silent hang.
7. Add admin-only bounded query/detail access by episode, job, or trace. Raw data
   is returned only by detail access and remains tenant/user scoped.
8. Add best-effort 30-day cleanup with bounded batch work and operational logging.
9. Event-write failures must not change generation success/failure or billing
   semantics.

## Acceptance tests

- Redaction removes secrets and signed URLs but preserves prompt text and stable
  hashes/lengths.
- Special run events share correlation IDs and preserve ordering/sequence.
- Raw input, raw request, raw response, parsed response, finish reason, token
  counts, provider call metadata, and schema paths are persisted.
- JSON parse, schema, semantic, transient, fallback, success, and persistence
  failure paths emit expected events and retry decisions.
- Forensic write failure is best-effort and does not fail the special operation.
- Admin query enforces tenant/user ownership and limit bounds; normal users do not
  receive raw payloads.
- Normal episode generation does not emit or query special forensic events.
- Focused unit/integration tests, TypeScript/build checks, and security review pass.
