# Synthesized specification

Build a hybrid forensic observability path for `special_tie_in_prompt`. It must
store a durable correlated lifecycle timeline and full redacted raw request/
response evidence for each special run, expose bounded admin-only lookup/detail,
retain rows for 30 days, and emit explicit retry/validation/persistence reasons.

The implementation must not alter normal episode-generation behavior or global
audit sanitization. It must use the existing Drizzle/Vitest patterns, include
tenant/user ownership checks, preserve hashes and lengths, and prove malformed
JSON, schema failure, semantic failure, fallback, success, persistence failure,
and forensic-write failure paths.
