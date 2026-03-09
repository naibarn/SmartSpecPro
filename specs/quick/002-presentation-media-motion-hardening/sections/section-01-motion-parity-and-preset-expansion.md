# Section 01: Motion Parity And Preset Expansion

## Goal

ลด drift ระหว่าง preview/export โดยทำให้ motion semantics อยู่บน source of truth ที่ชัดเจนขึ้น พร้อมขยาย pan presets และ overscan behavior ในรอบเดียว

## Scope

- Extend shared motion preset contract with diagonal presets
- Add pan overscan semantics to shared helper
- Ensure shared canvas playback path can consume the same semantics for `PlayMode`
- Replace or constrain duplicated server runtime constants so they derive from shared metadata
- Update property panel preset list to match contract exactly

## Likely Files

- `apps/web/shared/presentation/contracts.ts`
- `apps/web/shared/presentation/contracts.test.ts`
- `apps/web/shared/presentation/mediaMotion.ts`
- `apps/web/shared/presentation/mediaMotion.test.ts`
- `apps/web/client/src/presentation-canvas/CanvasObjects.tsx`
- `apps/web/client/src/presentation-canvas/CanvasObjects.test.tsx`
- `apps/web/client/src/presentation-canvas/components/PropertyPanel.tsx`
- `apps/web/client/src/pages/PresentationPlayMode.tsx`
- `apps/web/client/src/pages/PresentationPlayMode.test.tsx`
- `apps/web/server/routes/slideRender.ts`
- `apps/web/server/routes/slideRender.test.ts`

## Implementation Notes

- Keep backward compatibility: existing presets remain unchanged
- Add diagonal presets without renaming existing ones
- Pan overscan should be deterministic and pure; do not read DOM/layout at helper level
- Prefer a serialized shared-config approach over freehand duplicated constants in route HTML
- If full code sharing into inline HTML is awkward, create an explicit parity adapter and test it
- If `PlayMode` keeps using `CanvasStage` / `CanvasObjects`, motion rendering should be implemented there instead of adding a third bespoke playback renderer

## Acceptance Checks

- All presets available in UI are accepted by schema
- Shared helper and route runtime both know diagonal presets
- Shared helper and PlayMode canvas renderer both know diagonal presets
- Pan presets include overscan scale contribution
- Existing zoom presets still produce previous visual behavior unless explicitly changed by overscan rules

## TDD Slice

1. Add schema tests for diagonal presets
2. Add helper tests for diagonal pan vector + overscan scale
3. Add route-runtime parity test or fixture assertions
4. Update UI option tests if preset labels are exposed there
