# Vertical Drama Special Tie-in Forensic Logging Design

## Goal

Make a `special_tie_in_prompt` run diagnosable from one correlation identifier. An
admin must be able to determine what skill/version/input was used, what each LLM
provider call received and returned, why validation or retry happened, and whether
the final output was persisted. The change must not alter normal episode-generation
behavior.

## Evidence and current gap

Episode 247 demonstrated the gap: the database stayed `skillRun=running` with no
frames or clips while BullMQ had an active job. The provider returned HTTP 200, but
the model output was truncated or did not satisfy the 9-shot/product-reference
contract. Existing audit logging sanitizes prompt-like fields and caps entries at
32 KB, so it cannot reconstruct the real special-tie-in request, response, and
retry sequence.

## Chosen architecture

Use a hybrid design:

1. A dedicated durable forensic event table stores the searchable ownership and
   lifecycle index plus each logical/planning/physical attempt. Raw request and
   response bodies are stored as text after deterministic redaction. The table has
   an expiry timestamp and a tenant/user/episode/job lookup index.
2. Existing JSONL audit events remain the operational stream and receive the same
   correlation IDs and compact summaries. Existing unrelated audit payload
   sanitization remains unchanged.
3. A small service owns event writes, redaction, hashing, serialization, retention,
   and admin-safe reads. Event-write failure is best effort and must not turn a
   successful generation into a failed paid job; the database run state remains the
   source of truth for the job outcome.

This avoids changing the global audit contract while making the special flow
inspectable and queryable. Raw images are not copied; reference asset IDs and
redacted URL hashes are retained.

## Event contract

Every event carries `tenantId`, `userId`, `seriesId`, `episodeId`, `jobId`,
`traceId`, `createIntentId`, `inputVersion`, `skillSlug`, and an event sequence.
Attempt events additionally carry logical attempt, planning attempt, schema retry,
model fallback, provider call ID, provider/model, timestamps, token counts,
finish reason, status code, and duration.

Required lifecycle events:

- `job_queued`, `job_started`, `skill_loaded`, `input_captured`
- `llm_request_started`, `llm_response_received`
- `json_parse_failed`, `schema_validation_failed`, `semantic_validation_failed`
- `retry_decided` with machine-readable reason and next action
- `output_accepted`, `output_rejected`
- `persistence_started`, `persistence_succeeded`, `persistence_failed`
- `job_succeeded`, `job_failed`

The captured input includes the normalized special input, reference bindings,
selected character IDs, selected product/location IDs, contract version, and skill
hash/version. The request/response record includes the exact serialized body/text
used at that provider boundary after redaction, plus a SHA-256 hash and original
character count. No Authorization/API key/cookie/token or signed URL is stored.

## Retry and stuck-run behavior

The planner must emit a retry decision before every retry, including classification
(`json_parse`, `schema`, `semantic`, `transient`, `provider_fallback`), the exact
validation paths or bounded error, retry ordinal, model transition, and remaining
budget. The special worker must emit progress/heartbeat events at each planning
attempt and persist a terminal failed state when all bounded attempts are exhausted.
The event timeline must make clear whether the worker is queued, inside a provider
call, validating output, or persisting artifacts.

The existing normal episode pipeline keeps its current retry and persistence path;
only the special adapter opts into this telemetry.

## Admin access and retention

Expose an admin-only query by episode/job/trace/run correlation with bounded list
results and an explicit detail query for one event. Tenant and user ownership are
checked server-side before returning any data. Raw payloads are available only from
the detail query. A scheduled/best-effort cleanup deletes expired forensic rows at
30 days; cleanup failures are logged and do not affect generation.

## Security and operational constraints

- Redaction happens before persistence and before JSONL emission.
- Raw text is never included in normal user-facing tRPC responses.
- Payloads are stored as text rather than executable JSON and are never evaluated.
- Event writes use bounded error strings and do not log credentials.
- The table is additive and has no impact on existing episode rows or normal-flow
  queries unless the special adapter emits events.
- The design accepts increased storage proportional to special LLM calls; expiry,
  indexes, and per-run event limits prevent unbounded growth.

## Tests and acceptance criteria

- Unit tests prove deterministic redaction preserves normal prompt content while
  removing secrets and signed URLs, stable hashes, and full raw payload capture.
- Unit tests prove all lifecycle/retry event fields and correlation IDs are emitted.
- Tests prove malformed JSON, schema failure, semantic failure, provider fallback,
  success, and persistence failure each produce the expected event sequence.
- Tests prove audit/event write failure does not alter the generation result.
- Tests prove admin reads enforce tenant/user ownership and bounded limits.
- Tests prove normal episode generation does not opt into special forensic events.
- TypeScript/build and focused web tests pass after the final code change.
