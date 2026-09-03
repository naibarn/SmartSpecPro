# Implementation audit round 8 — shot projection and continuity

- Compared Spec 174 §6–7 with the object-link service and the persisted shot
  reference tables.
- Closed the gap where only the first object image was projected into a shot.
- Active canonical/detail/alternate assets now project deterministically (up to
  five), with an explicit per-shot selected asset supported and validated.
- Existing active shot links are reconciled after asset add/remove/restore,
  canonical change, and reorder.
- Fixed unlink cleanup to resolve projections by episode/shot/object lineage,
  instead of incorrectly treating the object-link id as a shot-reference id.

Result: PASS for catalog-to-prompt/media projection integrity.
