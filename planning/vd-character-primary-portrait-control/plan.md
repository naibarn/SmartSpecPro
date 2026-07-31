# VD character tab — no way to choose the main image; unpicked faces never go away

Date: 2026-07-31
Reporter: user (Thai) — "ภาพหลักระบบของตัวละคร เช่นในภาพตัวละคร คิริน ไม่รู้จะกดเปลี่ยน
ภาพหลักได้อย่างไร ... รูปแบบตัวละครที่สร้างมา 3-5 ภาพ พอเลือกตัวละครแล้ว ควรซ่อนภาพที่
ไม่ได้เลือก เพราะมันมักจะไปขึ้นในทุกจุดทำให้เกิดความสับสนว่าตอนนี้ใช้ตัวละครภาพไหนกันแน่"

## Problem statement

### P1 — the "main image" is decided implicitly and cannot be changed

Every image that ever becomes a character's portrait is written with
`role: "primary_portrait"`:

- generated portraits and dropped references, via the panel's `linkMutation`
  (`VerticalDramaCharacterStockPanel.tsx:3615, :7728`)
- a new variant/twin's inherited reference, via `bestEffortLinkPrimaryPortrait`
  (`verticalDramaCharacters.ts:321`)

Nothing demotes the previous one except `selectPortraitCandidate`, which only
accepts first-portrait BATCH candidates. So a character accumulates several rows
that all claim to be the portrait — the screenshot shows four sidebar tiles all
labelled "primary p…" — and which one actually wins is decided implicitly:

- `resolveCharacterCardPortraitAsset` → the `approved` one, else newest
  generated/imported
- `getPrimaryPortraitUrl` → `ORDER BY approved DESC, updatedAt DESC`

Both already agree that **`approved` is the tiebreaker**. There was simply no
control anywhere that let a user set it.

### P2 — a resolved candidate batch keeps showing its rejected faces

`selectedPortraitCandidateBatches` rebuilds every batch from durable assets and
renders all of them forever, so the 3-5 alternates keep appearing next to the
chosen face long after the choice was made. The panel stops answering the only
question that matters at a glance: which face is this character now.

## Design

### P1 — make the implicit tiebreaker an explicit action

No new column, no role churn, no new concept downstream: approve the chosen row,
un-approve its siblings. Every existing consumer already honors `approved`
first, so the card thumbnail and the identity-lock reference both follow
immediately.

| # | File | Change |
|---|---|---|
| S1 | `verticalDramaCharacterStock.ts` | `setPrimaryPortraitAsset()` — transactional promote-one / un-approve-siblings. REJECTS a batch candidate (`asset_wrong_role`) rather than silently skipping its DNA write |
| S2 | `verticalDramaCharacters.ts` | `setPrimaryPortrait` mutation — tries S1, and on `asset_wrong_role` falls through to `selectPortraitCandidate` so batch candidates still lock Character DNA. Returns `via: "direct" \| "candidate"` |
| C1 | panel | `setPrimaryPortraitMutation`; also repoints `referenceOverrideByCharacter` at the new main image, so the next generation conditions on it |
| C2 | panel | "ภาพอ้างอิงตัวตน" strip: a `ภาพหลัก` badge on the tile the card thumbnail actually resolves to, and a `ตั้งเป็นหลัก` action on this character's other own images |

The badge reads its answer from `resolveCharacterCardPortraitAsset` — the same
function the thumbnail uses — so it can never disagree with the picture on
screen.

### P2 — collapse a resolved batch to its winner

| # | File | Change |
|---|---|---|
| C3 | panel | `resolvePortraitCandidateVisibility({candidates, expanded})` — exported pure function; a batch with a `selected` candidate collapses to it, an undecided batch always shows everything |
| C4 | panel | per-batch `expandedCandidateBatchIds` (session-only, opt-in) + a "แสดงตัวเลือกที่ไม่ได้เลือก (N)" toggle |

The alternates are kept, not deleted — changing your mind is a real workflow.
They just stop being the default view.

## Risk assessment

- S1 only writes `approved` / `qcStatus` / `metadata.state`; `role` is unchanged
  for every row, so `getReferenceImageUrlByAssetLinkId`'s `role ===
  "primary_portrait"` guard and `verticalDramaExtensionReadService`'s
  role-ordering are untouched.
- Un-approving siblings is the same demotion `selectPortraitCandidate` already
  performs, so the two paths cannot leave the character in different shapes.
- The router's fall-through is narrowed to the exact `asset_wrong_role` reason;
  any other failure propagates instead of being retried down the wrong path
  (covered by a test).
- P2 is presentation-only. No asset is deleted or re-tagged.

## Verification

1. `resolvePortraitCandidateVisibility` unit tests (collapsed / expanded /
   undecided / empty).
2. Router tests: direct path, candidate fall-through, and that an unrelated
   error is NOT swallowed into the candidate path.
3. `tsc` on apps/web; targeted vitest runs; fail-set diff vs baseline.

## Progress

- [x] S1 + S2 server
- [x] C1–C4 client
- [x] tests
