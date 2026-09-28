# TDD plan

## 1. Durable forensic event contract

- Test secret, token, Authorization, cookie, and signed URL redaction.
- Test preservation of prompt text, reference IDs, hashes, and original lengths.
- Test best-effort insert behavior and bounded error normalization.
- Test expiry cleanup uses bounded deletion and does not leak raw payloads in summaries.

## 2. Opt-in provider boundary telemetry

- Test raw observers receive request and response bodies only when supplied.
- Test non-2xx, malformed JSON, and successful responses emit the correct raw event.
- Test observer exceptions do not change provider result behavior.
- Test retry observers receive schema/transient/fallback categories and remaining budgets.
- Test callers without observers retain existing behavior.

## 3. Special run lifecycle instrumentation and bounded progress

- Test correlation IDs and sequence are present on every special event.
- Test skill hash/input/reference capture and lifecycle ordering.
- Test parse, schema, semantic, fallback, success, and persistence failure events.
- Test bounded special retry budget reaches terminal failure and does not remain running.
- Test normal episode pipeline does not emit special events.

## 4. Admin retrieval and cleanup

- Test exact episode/job/trace filters and maximum limit validation.
- Test detail returns raw fields only through admin procedure and redacted values remain redacted.
- Test cross-tenant/cross-user records cannot be selected by mismatched ownership filters.
- Test cleanup removes expired rows and leaves unexpired rows.

## 5. Test-first verification

- Run all new focused tests red before implementation, then green after each layer.
- Run existing special tie-in and interactive job suites after integration.
- Run type/build and diff checks after the final implementation.
