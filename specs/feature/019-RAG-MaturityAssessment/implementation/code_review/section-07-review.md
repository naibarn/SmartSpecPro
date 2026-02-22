# Section 07 Code Review: RAG Executor Integration

## HIGH Severity

- **H1**: Raw exception string leaked via `_failed_response(error=str(exc))` — exposes DB DSNs, file paths
- **H2**: Missing enterprise tenant default for `rag_failure_mode` — plan says enterprise → strict
- **H3**: Unused `import time` — dead import

## MEDIUM Severity

- **M1**: `citations` variable from `get_context_with_citations()` assigned but never included in response
- **M2**: Guardrails instantiated outside `async with` session block — latent risk
- **M3**: No query length validation — could OOM on huge queries
- **M4**: No chunk loading limit — could OOM on large tenants
- **M5**: Fragile test mock routing via `str(stmt)` inspection
- **M6**: Unrelated scope_engine.py change in diff (false positive — not in our staged files)

## LOW Severity

- **L1**: No test for `library_item_id` config filter
- **L2**: No test for invalid `SearchMode` fallback
- **L3-L6**: Diff noise, unused imports in tests
