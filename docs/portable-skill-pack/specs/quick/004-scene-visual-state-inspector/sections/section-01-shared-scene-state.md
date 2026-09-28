# Section 01 — Shared Scene State

## Ownership

Own the shared scene-continuity contract, normalization, and prompt rendering.
Do not change router transactions or UI layout in this section.

## Target files

- `apps/web/shared/verticalDramaSeries/sceneContinuity.ts`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaSceneLockRow.tsx`
  (only shared view/patch type threading if needed)
- `apps/web/server/services/verticalDramaStartFrameGeneration.ts`
  (only if projection typing requires it)
- `apps/web/server/services/__tests__/verticalDramaStartFrameGeneration.sceneVisualStates.test.ts`
- `apps/web/shared/verticalDramaSeries/__tests__/sceneContinuity.test.ts`

## Work

- Add an optional structured `sleepSurface` value with the shape
  `{ type: "long_bed" | "single_bed" | "crib_bassinet" | "sofa" |
  "floor_mattress" | "other"; name: string; occupant?: string;
  placement: string }`, bounded text, and absent legacy compatibility.
- Normalize camelCase/snake_case input consistently with existing state fields.
- Render an explicit high-priority line in the continuity lock, including the
  user/script value and a rule that it overrides a contradictory location image.
- Keep rendering deterministic and do not add an LLM call.

## TDD and acceptance

- Legacy state parses byte-equivalent in all existing fields.
- Long bed and crib/bassinet normalize and render correctly.
- Invalid/oversized values are omitted or rejected according to existing parser
  conventions and never create unsafe prompt fragments.
- Existing state/upsert tests remain green.

## Risks

The state is persisted as JSON inside an episode plan. Keep the field optional
and do not require a database migration.

## UI/UX Contract

### Target User / JTBD

Scene author needs a shared, understandable fact that can be shown in the
Location Inspector and reused by every member shot.

### Surface Inventory

Location Inspector fields and the rendered per-shot continuity lock.

### Component Map

Shared parser, renderer, and the Inspector field type/patch view.

### State Matrix

Legacy/no sleep surface: render existing fields only. Valid sleep surface:
render the explicit constraint. Invalid input: omit/reject safely.

### Responsive Matrix

The shared contract has no layout; UI consumers use the existing stacked mobile
layout and compact desktop Location panel.

### Accessibility Acceptance

UI consumers must provide visible labels and helper copy for the structured
field; this section must not introduce icon-only controls.

### Copy Contract

Use the approved Thai example `เตียงนอนทรงยาวของภูมิ ไม่ใช่เปลเด็ก` with the
existing English fallback.

### Browser Evidence Required

Verify the structured value appears in the expanded Inspector and is reflected
in the next prompt preparation during the authenticated smoke test.
