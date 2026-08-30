# Implementation plan

## Objective

แก้ reference semantics ของ Vertical Drama ให้ main portrait regeneration ไม่ใช้ primary เดิมโดยอัตโนมัติ แต่ยังรองรับ explicit user reference และรักษา look/variant auto reference พร้อมรักษา history และ DNA fixes เดิม

## Current-codebase fit

ใช้ `resolveReferencePortraitSource` เป็นจุดรวม reference resolution ต่อด้วย `pickCharacterRenderModelId` และ provider payload ใน router. ใช้ `buildLookRenderRequestFields` และ main prompt confirmation/direct generation ใน client เพื่อส่ง policy ตามบริบท. ใช้ stock service lifecycle ที่มีอยู่เพื่อ demote old primary โดยไม่ลบ

## Affected files

- `apps/web/server/routers/verticalDramaCharacters.ts`
  - เพิ่ม validated policy input หรือ shared resolver contract
  - resolve explicit asset first
  - `none` ห้าม primary/inherited lookup
  - set main/look/sheet caller defaults ตาม context
  - preserve DNA/setup changes already present
- `apps/web/server/services/verticalDramaCharacterStock.ts`
  - ตรวจ/ปรับ demotion ของ old primary และ generated replacement ให้ idempotent, history-preserving
  - ไม่ demote ก่อน provider success
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`
  - main portrait: no-reference default; explicit override only after intentional picker/attachment action
  - look portrait: auto default or exact selected asset
  - update direct and preview-confirm call paths consistently
- Existing/new focused tests under `apps/web/server/**/__tests__` and client component/helper tests as appropriate

## Implementation sequence

1. Add pure/shared reference policy types and resolver tests first.
2. Implement server resolution and input validation, including explicit ownership rejection before paid provider work.
3. Update main and look client payload builders/callers; keep display default separate from explicit selection state.
4. Verify stock linking/demotion and adjust only if generated replacement does not leave a single current primary while preserving old rows.
5. Add integration-style router/service assertions for provider payload and failure ordering.
6. Run focused tests, prettier on owned files, targeted typecheck if available, and inspect diff/status for unrelated changes.

## Security/data boundaries

- Use existing `getReferenceImageByAssetLinkId` owner `{tenantId,userId,seriesId}` check; never trust client URL.
- Validate policy/reference combination: explicit id is required for explicit mode; no-ref must not accept an implicit current primary.
- Do not expose or attach assets outside series scope.
- Do not mutate primary/history until the image generation/link result is successful.

## Acceptance criteria

- Main generation with an existing primary and no explicit ref sends no `referenceImageUrls`.
- Explicitly selected/attached asset is sent exactly and remains usable with main generation.
- Look generation without explicit ref still sends/resolves current primary; selected primary/look asset remains exact.
- Variant/twin inherited reference behavior remains intact.
- Old primary remains queryable in history and is not current after replacement success.
- Failed generation leaves old primary unchanged.
- DNA setup detection and preview fallback tests from the preceding fix remain green.

## Verification notes

Focused tests are required. Full repository typecheck currently has unrelated baseline failures recorded in the prior work; report those separately if still present. Browser/provider/live production verification is not claimed unless actually run.

## Completion notes

Implemented the policy, client routing, and history demotion. Focused policy/lifecycle tests pass. Full `apps/web` typecheck remains red on unrelated existing catalog/media/library/Vertical Drama modules; no diagnostics were reported for the changed policy lines. Browser and live-provider verification remain environment-dependent.
