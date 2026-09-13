# Vertical Drama Location Variant Picker UI

## Goal

Make the episode storyboard location control explain and expose reusable camera
views. A creator can keep the location's primary reference and select an
approved camera variant for one shot without generating a new image.

## Target User / JTBD

- Role: Vertical Drama creator/editor.
- Goal: Choose the clinic entrance close-up that was already generated for a
  specific shot.
- Entry point: Episode storyboard shot card, location chip.
- Success outcome: The selected shot shows the variant thumbnail/label after
  reload, while the primary location image remains unchanged.

## Existing Pattern Reference

- Found: `ShotLocationPickerDialog` and `setShotLocationVariant` already exist
  in `VerticalDramaStoryboardPanel.tsx` and `VerticalDramaEpisodePage.tsx`.
- Decision: reuse. Improve discoverability and helper copy; keep the existing
  durable per-shot `locationVariantId` contract and approved-asset checks.

## Surface and Component Map

| Surface | Change |
|---|---|
| Episode storyboard shot card | Add visible location/variant action and available-view hint. |
| `ShotLocationPickerDialog` | Clarify title/instructions and label primary versus reusable views. |
| Server/API | No change; reuse `episodeLocations.cameraVariants` and `setShotLocationVariant`. |

## State and Safety

- Loading/empty: preserve existing location/empty states.
- Available variants: show count and thumbnails in the picker.
- Selected variant: show its label and thumbnail on the shot chip.
- Primary: explicit option restores the primary reference (`null` variant).
- Error: existing mutation toast remains authoritative.
- Safety: only approved variants returned by the server can be selected; no
  provider call or new credit spend occurs when reusing a variant.

## Responsive and Accessibility Contract

- Use the existing compact chip/picker layout; allow wrapping on mobile and
  scrolling inside the picker.
- The action has visible text, an accessible label, focusable button semantics,
  and `aria-pressed` for the selected variant.
- Keep existing semantic colors/tokens and reduced-motion behavior.

## Copy Contract

- Thai is primary; English fallback is retained.
- Explain: “ภาพหลักเดิมยังคงอยู่” and “มุมย่อยเลือกใช้แยกในแต่ละช็อตได้”.

## Browser Evidence

- Manual/browser screenshot verification is recommended at mobile 390x844,
  tablet 768x1024, and desktop 1440x900. Automated component regression is
  required for variant visibility and selection callback behavior.
