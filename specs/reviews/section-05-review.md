# Code Review - Section 05 (Hybrid Search API)

## Scope Reviewed

- `apps/web/server/services/libraryService.ts`
- `apps/web/server/services/librarySearchService.test.ts`
- `apps/web/server/routers/library.ts`
- `apps/web/server/routers/library.test.ts`

## Findings

1. `MEDIUM`: Private item leakage risk if ACL checks are applied after result shaping.
- Mitigation applied: ACL filtering occurs before scoring and response shaping.

2. `LOW`: Non-deterministic ranking can cause unstable UI result ordering.
- Mitigation applied: explicit deterministic tie-break chain added.

3. `LOW`: Filter drift risk when metadata shape varies.
- Mitigation applied: filter stage reuses normalized metadata and canonical tag processing.

## Test Coverage Added

- Contract and ranking behavior for keyword-only/vector-only/hybrid paths
- Tenant + ACL leakage prevention checks
- Multi-filter subset matching checks

## Residual Risks

- Vector candidate stage currently scores using indexed chunk text + `vector_ref_id` linkage, not direct vector similarity query from backend.
- End-to-end API integration tests with live DB/auth middleware are still pending.
