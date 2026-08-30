# Character Reference Promotion and Regeneration

## Goal

ให้ผู้ใช้เลือกภาพอ้างอิงของตัวละครที่มีอยู่แล้วขึ้นเป็นภาพหลักได้ โดยภาพหลักเดิมยังคงอยู่เป็นภาพอ้างอิงสำรอง และให้สร้าง candidate ภาพใหม่จากบริเวณ Character references ได้เหมือนการ casting ครั้งแรก โดยเลือกจำนวน 1–5 ภาพ

## Existing pattern and reuse decision

- Existing pattern: `VerticalDramaCharacterStockPanel.tsx` already owns the `setPrimaryPortrait` mutation, the candidate count selector, the prompt preview, credit confirmation, candidate polling, and candidate selection flow.
- Existing server contract: `verticalDramaCharacters.setPrimaryPortrait`, `previewCharacterPrompt`, `generatePortraitCandidateBatch`, and `selectPortraitCandidate`.
- Decision: reuse these contracts and state flows. Only expose the missing controls in the Character references card and relax the candidate replacement guard so an existing primary portrait can be replaced safely.

## Data flow

1. The reference list marks the asset resolved by `resolveCharacterCardPortraitAsset` as `ภาพหลัก`.
2. Any attached own `primary_portrait` or completed portrait candidate gets `ตั้งเป็นภาพหลัก`.
3. `setPrimaryPortrait` demotes the previous approved primary by setting `approved=false` and `metadata.state=generated`; it does not delete or detach the row.
4. The reference-area generator calls the existing preview flow with `portraitCandidateCount` in the range 1–5.
5. Selecting a newly generated candidate uses `selectPortraitCandidate`, which updates Character DNA and demotes the old primary while retaining it as a reference.

## UI/UX contract

### Target user / JTBD

- Role: Vertical Drama creator.
- Goal: change the character's main identity image or create new alternatives without leaving the reference area.
- Entry point: Series → Characters → Character references.
- Success: one clear main-image badge, old image remains visible, and new 1–5 candidate generation follows the existing prompt/credit/review flow.

### State matrix

- Loading: existing mutation spinners/disabled controls.
- Empty: retain current no-reference message and show the generation controls when editable.
- Error: reuse existing mutation error toast.
- Success: refetch the manifest, show the new main badge, and keep the old row in the list.
- Disabled/focus: all buttons have text labels, disabled state, and visible focus rings.

### Responsive/accessibility

- Use the existing flex-wrapped reference rows and shadcn controls; no new layout system.
- Count choices are selectable cards with the existing keyboard/label semantics.
- Promotion buttons are text-labelled; the main image is conveyed by text, not color alone.
- Browser evidence is recommended for mobile 390x844, tablet 768x1024, and desktop 1440x900; local focused tests/typecheck remain the required automated proof.

## Failure handling

- Reject promotion when the asset has no durable media attachment or is not a portrait/candidate.
- Keep candidate DNA locking on `selectPortraitCandidate`; do not route candidates through the ordinary promotion path.
- Preserve tenant/user/series/character ownership checks in all existing mutations.
- No database migration or new dependency is expected.

## Verification

- Focused client tests for 1–5 candidate-count payloads and main-image resolver behavior.
- Focused router/service tests for candidate generation when a prior primary exists and replacement demotion.
- `npm --workspace apps/web run typecheck` and affected Vitest files, with unrelated baseline diagnostics reported separately.
