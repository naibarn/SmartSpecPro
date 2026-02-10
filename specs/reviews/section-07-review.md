# Code Review - Section 07 (Media Studio and History UI)

## Scope Reviewed

- `apps/web/client/src/lib/libraryUi.ts`
- `apps/web/client/src/lib/libraryUi.test.ts`
- `apps/web/client/src/components/media/LibrarySearchPanel.tsx`
- `apps/web/client/src/components/media/LibrarySearchPanel.test.ts`
- `apps/web/client/src/pages/MediaStudio.tsx`
- `apps/web/client/src/pages/MediaHistory.tsx`

## Findings

1. `MEDIUM`: Repeated UI add actions could create noisy status feedback if state transitions are not normalized.
- Mitigation applied: shared helper maps mutation outputs into deterministic UI states.

2. `LOW`: Indexing visibility could remain stale after optimistic add.
- Mitigation applied: polling via `library.getItem` for tasks in `indexing` state.

3. `LOW`: Search panel regressions likely when UI dependencies rely on runtime context.
- Mitigation applied: isolated panel test with mocked UI primitives + utility-level callback tests.

## Test Coverage Added

- eligibility gating for Add-to-Library action
- success/error message and state mapping
- library status badge mapping (`indexing|ready|failed`)
- library search panel empty/result states and status rendering
- callback selection helper behavior

## Residual Risks

- Existing tasks already linked in library are shown as `Not Added` until user triggers add and receives item linkage.
- No full browser-level interaction test yet for Media Studio/Media History pages.
