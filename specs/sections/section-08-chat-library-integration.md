# Section 08 - Chat Library Integration

## Objective

Enable Chat to query library assets and attach selected items into conversation context safely.

## Scope

- Source picker option: Search from Library.
- Library search invocation from chat surface.
- Attach selected library item metadata into chat context payload.

## Primary Files

- `apps/web/client/src/pages/` (chat UI components)
- `apps/web/server/routers/` (chat/library integration endpoints)
- `apps/web/server/services/memoryService` integration points as needed

## Implementation Steps

1. Add source picker option and library search modal/panel in chat UI.
2. Consume `library_search_v1` endpoint and render attachable results.
3. Add attach action to embed selected library item reference into conversation context.
4. Ensure context payload includes only permission-safe fields.
5. Handle feature flag gating and fallback behavior.

## Test-First Checklist

- Test: source picker shows/hides library option based on feature flag.
- Test: selecting a library item attaches expected context payload.
- Test: unauthorized library items are never attachable.
- Test: chat flow remains stable when library search is unavailable.

## Verification

- Run chat integration tests with library attach scenarios.

## Exit Criteria

- Chat can reliably consume and attach library assets for downstream prompting.
