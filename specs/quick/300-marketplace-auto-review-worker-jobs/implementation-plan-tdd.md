# TDD Guidance

1. Test canonical admission for QC and repair: a canonical worker job is created with bounded input, stable idempotency, long execution class, tenant/requester binding and no direct QC invocation in the request path.
2. Test executor routing for each operation and run ownership validation; use the existing worker executor registry mocks and lease reporter seams.
3. Test staged story redraft/prompt authoring return a queued operation before LLM execution, then persist results only when the worker completes. Verify stale state and duplicate idempotency cases.
4. Test the legacy queue migration bridge with pending, terminal, duplicate and missing-run rows. Prove no new work is executed by the legacy loop.
5. Test the UI status projection for queued/running/failed/passed QC and keep story approval disabled until required QC passes.
6. Run only targeted Vitest suites for touched files plus a focused web build/syntax check if needed; no local repository-wide TypeScript check.
