# Implementation plan

## 1. Durable forensic event contract

Add a dedicated Drizzle table and migration for special tie-in forensic events.
The row should contain tenant/user/series/episode/job/trace/create-intent and
input-version ownership, sequence, event type/stage, skill identity, logical and
planning retry counters, provider/model identifiers, status/timing/token fields,
retry classification/reason, bounded metadata, hashes/lengths, parsed output and
schema issues, and full redacted request/response text. Include `expiresAt` and
indexes for episode/job/trace plus expiry cleanup. Use text for raw bodies and
JSONB only for structured bounded fields.

Implement a focused service that owns deterministic redaction, SHA-256 hashing,
serialization, best-effort insert, bounded list/detail queries, and expiry
cleanup. Redaction must remove authorization/API-key/token/cookie values and
signed URL query material while retaining safe reference IDs and prompt text.
The service also emits compact existing JSONL audit summaries with the same
correlation IDs; existing `auditLogger` sanitization is not changed.

## 2. Opt-in provider boundary telemetry

Extend the shared LLM request/retry interfaces with optional raw-payload and
retry-decision observers. At the provider boundary, observers receive the exact
serialized request body before fetch and the response body immediately after it
is read, including non-2xx and malformed-JSON responses when available. Include
provider call ID, model/provider, status, content type, timing and finish reason.
Observer failures are swallowed and logged through the existing safe logger.

Extend JSON planning retry callbacks with planning attempt number, classification,
retry ordinal, current/next model, remaining schema/transient/fallback budgets,
and bounded error/schema paths. Emit callbacks before schema, transient, and
model-fallback retries. Existing callers omit these callbacks and preserve their
current behavior.

## 3. Special run lifecycle instrumentation and bounded progress

Create a per-job forensic recorder in the special adapter. Emit queued/start,
skill-loaded, normalized-input-captured, request/response, validation, retry,
accepted/rejected, persistence, and terminal events. Record skill file hash and
contract/model snapshots so a future run can be compared with the exact input.

Pass recorder callbacks only from `generateSpecialSkillOutput` when invoked by
the special adapter. Record semantic validation failures separately from shared
schema failures. Record persistence errors before rethrowing. Ensure every
terminal worker outcome is represented, including stale input and forensic-write
failure.

Add heartbeat/progress metadata around each planning attempt and enforce a
special-only bounded planning budget so repeated invalid model output cannot leave
the browser in an apparently active state for an unbounded duration. Preserve
normal pipeline retry budgets. The special DB status must still be set to failed
by existing catch handling when the bounded budget is exhausted.

## 4. Admin retrieval and cleanup

Add admin-only tRPC procedures in the existing audit router: a bounded summary
timeline query by exact episode/job/trace and a detail query by event ID that
returns raw fields only for admins. Require at least one correlation filter,
enforce maximum limits, and apply tenant/user/episode ownership conditions from
the selected record. Return redaction metadata and hashes so an admin knows the
raw body was transformed.

Add a best-effort scheduled cleanup hook or service call that deletes expired
forensic rows in bounded batches. Cleanup failures produce an operational log but
do not affect generation. Do not add raw payloads to ordinary episode status
queries or user-facing responses.

## 5. Test-first verification

Write tests before implementation for redaction/hash stability, event row shape,
observer opt-in/isolation, retry decision categories and budgets, raw request /
response capture, special success/failure lifecycle, persistence failure, admin
limits/ownership, cleanup, and forensic-write failure. Add a regression assertion
that normal episode planning produces no special forensic records/callbacks.

Run focused Vitest suites, existing special tests, a TypeScript/esbuild check,
`git diff --check`, and an admin/security review of raw payload exposure. Run a
fresh build if the changed shared interfaces require it. Report any full-suite or
live-production checks that cannot run separately.
