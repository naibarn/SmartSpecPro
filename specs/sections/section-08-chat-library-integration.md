# Section 08 - Chat Library Integration

## Objective

Enable Chat to query library assets and attach selected items into conversation context safely.

## Implemented Scope

- Added chat library source-picker feature-flag path:
  - flag: `VITE_LIBRARY_CHAT_SOURCE_PICKER_ENABLED`
  - hidden by default when flag is not enabled
- Added library source picker UI in Chat input controls:
  - opens searchable dialog
  - calls `trpc.library.search` and renders attachable ready items
  - toggles selected source items for outgoing message context
- Added safe attach payload integration:
  - only uses permission-safe fields (`item_id`, `item_type`, `title`, `source`)
  - appends selected source metadata into outgoing user-message context block
- Added failure-safe fallback behavior:
  - when library search is unavailable, chat send flow still works without interruption

## Actual Files Added

- `apps/web/client/src/lib/chatLibrary.ts`
- `apps/web/client/src/lib/chatLibrary.test.ts`
- `specs/reviews/section-08-review.md`
- `specs/reviews/section-08-interview.md`

## Actual Files Modified

- `apps/web/client/src/components/chat/ChatView.tsx`

## Tests Added (TDD)

- `chatLibrary` helper tests:
  - source picker flag gate show/hide behavior
  - selected item payload attachment formatting
  - non-ready/unsafe results excluded from attach list
  - graceful fallback behavior with unavailable search data
  - source selection toggle behavior

Run command used:
- `npm run -w @smartspec/web test -- client/src/lib/chatLibrary.test.ts client/src/lib/libraryUi.test.ts client/src/components/media/LibrarySearchPanel.test.ts server/services/libraryService.test.ts server/services/librarySearchService.test.ts server/services/mediaLibraryService.test.ts server/routers/library.test.ts server/routers/media.addToLibrary.test.ts`

Result:
- `32 passed`

## Verification

- `npm run -w @smartspec/web build` passed.

## Deviations from Initial Plan

1. Reused existing `library.search` endpoint directly from chat UI instead of introducing a dedicated chat-library server endpoint.
- Rationale: current `library_search_v1` contract already enforces tenant/ACL filtering and returns safe attach payload.

2. Attached selected library items as explicit context text block in the outgoing user message instead of adding a new server message schema field.
- Rationale: preserves existing chat transport contract and avoids broad backend migration in this section.
