---
section: 08 — Media Insert Menu
reviewed: 2026-03-20
verdict: APPROVE_WITH_FIXES
---

# Section-08 Review: MediaInsertMenu

## Verdict: APPROVE_WITH_FIXES

---

## Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `uploadMedia.ts:55–64` | `readFileAsBase64` uses `FileReader.readAsDataURL()`, which returns a data URL with a `data:<mime>;base64,` prefix (e.g. `data:image/jpeg;base64,/9j/...`). The server's `uploadLibraryFileSchema` at line 105 of `library.ts` expects a raw base64 string validated by `z.string().min(1).max(68_000_000)`. Sending the full data URL string means the server stores and later decodes a corrupt payload. Other callers in the codebase that use the same mutation (`DocumentManagement.tsx:871`, `MediaStudio.tsx:1263`) also use `readAsDataURL()` but strip the prefix before calling `mutateAsync`. The claim in the existing review stub ("server accepts full data URLs — same as DocumentManagement.tsx") is wrong: those callers strip the prefix first. | In `readFileAsBase64`, strip the prefix before resolving: `resolve(result.split(",")[1] ?? result)`. |
| HIGH | `MediaInsertMenu.tsx:346` | `useMemo` dependency list is `[debouncedQuery.length, listData, searchData]`. If the query changes from `"ab"` to `"cd"` (both length 2), the memo does not recompute — stale `listData`/`searchData` results continue rendering even though the active query has changed. The correct dependency is the query value, not its length. | Change to `[debouncedQuery, listData, searchData]`. |
| MEDIUM | `MediaInsertMenu.test.tsx` | Plan stub "Library tab searches via `trpc.library.listDocuments`" is entirely absent. No test exercises the debounce-to-search transition (typing a query, waiting 300ms, then verifying `mockSearchResults` was called instead of `mockListResults`). This is the component's primary data-fetching path and is uncovered. | Add a test using `vi.useFakeTimers()`: type into `media-search-input`, advance timers by 300ms, assert `mockSearchResults` was called with `{ query: "...", filters: { itemType: "image" }, scope: "all", limit: 50, offset: 0 }` and `mockListResults` was not called with `enabled: true`. |
| MEDIUM | `MediaInsertMenu.test.tsx` | Plan stub "Upload tab handles file selection" is entirely absent. Zero test coverage for the upload flow: `validateMediaFile`, `readFileAsBase64`, `mutateAsync` call shape, and `onInsert` firing on success. The upload path is the most side-effect-heavy code in the component. | Add a test: switch to upload tab, simulate `change` on `data-testid="file-input"` with a `File` instance, mock `mockMutateAsync` to resolve with `{ id: 99, source_url: "https://cdn.example.com/file.jpg" }`, assert `mockOnInsert` called with `{ type: "image", src: "https://cdn.example.com/file.jpg", assetId: "99" }`. |
| MEDIUM | `MediaInsertMenu.test.tsx` | Plan stub "Search query resets when menu closes and reopens" is absent. The `useEffect` on `open` (lines 287–293) that clears `searchQuery` and `debouncedQuery` is never exercised. | Add a test: render `open=true`, simulate typing in search input, re-render with `open=false`, re-render with `open=true`, assert `data-testid="media-search-input"` value is `""`. |
| MEDIUM | `MediaInsertMenu.tsx:319–326` | `trpc.library.search` is called with `{ ...searchInput, query: debouncedQuery || undefined }`. `searchInput` carries `scope: "all"`, `filters`, `limit`, `offset`. The `search` procedure accepts `scope` in its schema but the underlying `searchLibraryItems` service function may not honour `scope` (it is not present in `listDocuments`' analogue). If `scope` is silently ignored server-side, library items from other scopes can appear in search results even when the user only has access to their own. Flag for integration verification. | Confirm `searchLibraryItems` applies the `scope` filter. If not, remove `scope` from the search call to avoid misleading callers. |
| LOW | `MediaInsertMenu.tsx:404` | `(result as any).source_url \|\| (result as any).url` — double `as any` cast to access upload mutation return shape. A server-side shape change (e.g. renaming `source_url`) would not be caught at compile time. | Derive or import the inferred return type from the tRPC router type (`RouterOutputs["library"]["uploadFile"]`) and use it directly. |
| LOW | `MediaInsertMenu.tsx` (no i18n) | All 14 user-facing strings are hardcoded English: `"Library"`, `"Upload"`, `"Search images..."`, `"No images found."`, `"Uploading..."`, `"Upload failed. Please try again."`, etc. The plan's i18n section defines `editor.mediaMenu.*` keys for both `en.ts` and `th.ts`. None are used. | Replace hardcoded strings with `t("editor.mediaMenu.libraryTab")` etc., and add all 14 keys to both locale files. |
| LOW | `MediaInsertMenu.tsx:461` | When `children` is absent the `PopoverTrigger` is not rendered. All three call sites (toolbar, slash command, overlay) control `open` externally, so this is safe today. But it is non-obvious and risks future misuse (e.g., caller forgets to pass `children` and wonders why clicking does nothing). | Add a JSDoc comment to the `children` prop: "Optional trigger element. If omitted, caller must set `open` externally." |

---

## Contract Compliance

| Contract | Status | Notes |
|---|---|---|
| `trpc.library.listDocuments` input shape | PASS | `{ query?, scope, limit, offset, filters: { itemType } }` matches server Zod schema exactly. `scope: "all"` is a valid `documentScopeSchema` value. |
| `trpc.library.search` input shape | PASS (caveat) | Fields match `searchFilterSchema`. `scope` accepted but see MEDIUM finding — server behaviour unconfirmed. |
| `trpc.library.uploadFile` input shape — `fileBase64` value | FAIL | `readFileAsBase64` returns a full `data:` URL. Server expects raw base64 only. Every upload call will store a corrupt payload. |
| `MediaInsertAttrs` union matches plan spec | PASS | All three variants (`image`, `video`, `audio`) match the plan's type definition exactly. `assetId` correctly stringified from numeric `item.id`. |
| Auth guard | PASS | All three procedures use `protectedProcedure`. Component is used only within authenticated surfaces. |
| Tenant isolation | PASS | Resolved server-side via `resolveLibraryTenantId` in all three procedures. No tenant context required on client. |
| File MIME + size validation | PASS | `validateMediaFile` checks both MIME allowlist and 50MB cap before any read or upload attempt. |
| No arbitrary URL input | PASS | Upload tab has no URL text field. All media sources are library items (server-controlled URLs) or locally validated files. |
| Plan test stubs — 10 specified | PARTIAL | 7 of 10 implemented. Missing: debounce-to-search, upload flow, state-reset-on-close. |
| i18n keys (`editor.mediaMenu.*`) | FAIL | 14 plan-specified keys defined but none used. All strings are hardcoded English. |
| `uploadMedia.ts` as plain async helper (not a hook) | PASS | No React imports. Correct non-hook pattern, safe to call from editor callbacks. |
| `anchorRef` prop from plan spec | NOTE | Plan spec lists `anchorRef?: React.RefObject<HTMLElement>` but implementation omits it. Radix Popover handles its own positioning; acceptable unless slash command integration requires explicit anchor override. |

---

## Summary

The component architecture is well-structured: the controlled-popover pattern, `enabled`-gated TanStack Query calls, `useCallback`/`useMemo` throughout, and the `MediaInsertAttrs` discriminated union all match the plan spec. Two issues block safe shipping. First, `readFileAsBase64` sends the full `data:<mime>;base64,...` string to the server — the server's `fileBase64` field expects a stripped base64 string, so every upload attempt will result in a corrupt stored file. The previous review stub claimed this was verified against `DocumentManagement.tsx`, but that caller does strip the prefix before sending. Second, the `useMemo` dependency list uses `debouncedQuery.length` instead of `debouncedQuery`, causing stale result lists whenever the query changes within the same character count. Three of the ten plan-required tests are absent, leaving the debounce transition, upload flow, and state-reset paths entirely uncovered. The two HIGH bugs must be fixed before merge; the three missing tests and i18n strings are mandatory before the feature ships to production.
