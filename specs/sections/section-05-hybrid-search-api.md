# Section 05 - Hybrid Search API

## Objective

Expose a versioned, tenant-safe hybrid search API that merges keyword and vector retrieval for library assets.

## Implemented Scope

- Added `library.search` tRPC query in `libraryRouter` as search API entrypoint.
- Added `searchLibraryItems` domain method in `libraryService` that returns `library_search_v1` payload.
- Implemented filter support:
  - `itemType`, `model`, `ownerUserId`, `tags`, `status`, `fromDate`, `toDate`
- Implemented deterministic ranking merge with tie-break order:
  - `combined_score` desc
  - `keyword_score` desc
  - `vector_score` desc
  - `createdAt` desc
  - `id` asc
- Enforced tenant and ACL checks before returning search results.

## Primary Files Updated

- `apps/web/server/routers/library.ts`
- `apps/web/server/routers/library.test.ts`
- `apps/web/server/services/libraryService.ts`
- `apps/web/server/services/librarySearchService.test.ts`
- `specs/reviews/section-05-review.md`
- `specs/reviews/section-05-interview.md`

## Key Implementation Notes

1. `library_search_v1` contract:
- Response shape includes `version`, paging fields, and result scores:
  - `combined_score`
  - `keyword_score`
  - `vector_score`
- Result payload includes provenance (`provider_name`, `model_name`) and chat attach payload.

2. Hybrid merge behavior:
- Keyword score computed from token overlap against item fields + metadata text.
- Vector score computed from chunk content associated with indexed chunks (`vector_ref_id` present).
- Combined score uses weighted merge for stable ranking.

3. Security and tenancy:
- Base item set is tenant-scoped.
- `private` items require ownership/admin or explicit user grant in `library_permissions`.
- `team/public` remain visible within tenant scope.

4. Filter semantics:
- Filters are applied before ranking.
- Tag filter requires all requested tags to exist on item metadata tags.

## Tests Added (TDD)

- contract + deterministic ranking for keyword/vector/hybrid path
- tenant/ACL leakage prevention for private items
- filter-combination behavior across item metadata and lifecycle fields

Run command used:
- `npm run -w @smartspec/web test -- server/services/libraryService.test.ts server/services/librarySearchService.test.ts server/routers/library.test.ts`

Result:
- 13 passed

## Deviations from Initial Plan

1. Hybrid vector candidate scoring currently derives from indexed chunk text linked by `vector_ref_id` in relational storage, rather than direct ANN query from vector backend.
- Rationale: provides deterministic, testable hybrid behavior immediately while keeping contract stable for later backend retrieval upgrades.

## Remaining Follow-ups

- Replace vector candidate stage with direct vector backend retrieval path while preserving `library_search_v1` contract.
- Add integration tests through real DB fixtures + authenticated API caller flow.
