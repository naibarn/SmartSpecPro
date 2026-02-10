# Code Review - Section 08 (Chat Library Integration)

## Scope Reviewed

- `apps/web/client/src/components/chat/ChatView.tsx`
- `apps/web/client/src/lib/chatLibrary.ts`
- `apps/web/client/src/lib/chatLibrary.test.ts`

## Findings

1. `MEDIUM`: Chat payload could accidentally include non-safe library fields if raw search results are forwarded directly.
- Mitigation applied: explicit safe-payload normalization to `item_id`, `item_type`, `title`, `source`.

2. `LOW`: Source picker errors could block core chat send path.
- Mitigation applied: source picker is optional and send flow remains available when search fails.

3. `LOW`: In-progress/failed library items could pollute chat context quality.
- Mitigation applied: only `ready` library items are attachable in picker.

## Test Coverage Added

- feature-flag gate for source picker visibility
- safe attach payload context block construction
- non-ready and malformed search items excluded from attach set
- fallback behavior when search results are unavailable
- selection toggle behavior

## Residual Risks

- Context is currently attached as structured text block, not a dedicated backend message field.
- No browser-level integration test yet for picker click-through in real DOM.
