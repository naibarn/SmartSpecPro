# Section 05 - Hybrid Search API

## Objective

Expose a versioned, tenant-safe hybrid search API that merges keyword and vector retrieval for library assets.

## Scope

- `GET /api/library/search` backend implementation.
- Response contract `library_search_v1` for Media Studio and Chat clients.
- Filter support (`type`, `model`, `owner`, `tags`, date range, status).
- Ranking merge logic with deterministic tie-breaking.

## Primary Files

- `apps/web/server/routers/` (library search route)
- `python-backend/app/api/` or service endpoint for hybrid retrieval execution
- `python-backend/app/services/` (keyword/vector merge service)

## Implementation Steps

1. Define and document `library_search_v1` response schema.
2. Implement keyword candidate retrieval from relational fields/chunks.
3. Implement vector candidate retrieval from embedding store.
4. Merge candidates with stable ranking strategy and provenance fields.
5. Enforce tenant scope and ACL before returning payload.
6. Add pagination and sorting contract behavior.

## Test-First Checklist

- Test: response payload always conforms to `library_search_v1`.
- Test: keyword-only, vector-only, and hybrid paths all return deterministic ordering.
- Test: tenant/ACL filters prevent cross-tenant leakage.
- Test: filter combinations return expected subsets.

## Verification

- Run API integration tests covering search contract and security filters.

## Exit Criteria

- Hybrid search is available for downstream UI integration with stable contract behavior.
