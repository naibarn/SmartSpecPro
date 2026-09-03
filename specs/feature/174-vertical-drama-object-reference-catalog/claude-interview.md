# Feature 174 Interview Record

## Interview status

No blocking stakeholder question remains. The user requirements and the
existing Feature 174 specification already define the intended behavior. The
implementation should proceed autonomously and keep unresolved runtime proof
items as release gates rather than interrupting the normal creator workflow.

## Confirmed decisions

1. The visible name is `วัตถุประกอบฉาก / Object Reference`; `Product Tie-in`
   remains an internal compatibility/commercial mode.
2. Normal story objects and commercial products share one catalog and one wide
   workspace, with explicit semantic modes and no duplicate editor.
3. Marketplace Capture remains the source of commercial product identity and
   Special Tie-in remains the episode-creation entry point.
4. Objects are optional. Detection, missing images, stale links, provider
   failures, and continuity uncertainty must never block storyboard creation,
   episode continuation, or ordinary prompt/media generation.
5. The detector must use synopsis/story context and continuation signals. Same
   place/time or travel continuation favors continuity; a different place or
   day does not require the previous object/wardrobe state.
6. Automatic detection may suggest or link with evidence, but the creator can
   accept, reject, reset, add, remove, replace, and lock shot usage manually.
7. Dragging from hard disk, Library, or History must converge on managed media
   IDs. A creator may also create an object image through an explicit,
   credit-aware action.
8. Commercial disclosure, claim, footage-first, nine-shot, credit, approval,
   and policy rules remain unchanged for `commercial_tie_in` objects.
9. Existing `productTieIn` data must remain readable during migration and must
   not be silently deleted or rewritten by a failed backfill.
10. Completion requires implementation evidence, not merely a visible tab or a
    focused unit test; browser/runtime/provider/migration gates must be stated
    separately.

## Auto-resolved implementation choices

- Default a minimal object to `objectType=other` and `source=manual` so an
  image-optional create remains usable.
- Use soft archive/removal and explicit history queries; never delete managed
  media when removing a catalog attachment.
- Use revision plus idempotency key on retryable writes and typed domain errors
  at the tRPC boundary.
- Use a deduplicated advisory job/outbox or explicit mutation for detection;
  episode detail reads remain pure and immediate.
- Preserve unclassified legacy `prop_object` references unless a projection
  ledger proves that a catalog-owned row can be safely reconciled.
- Treat provider caps and missing optional media as warning/skip outcomes, not
  hard errors on creator actions.
