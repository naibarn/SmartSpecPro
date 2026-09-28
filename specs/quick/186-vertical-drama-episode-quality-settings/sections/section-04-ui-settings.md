# Section 04 — Episode UI Settings

## Ownership

Accessible episode-level controls and localized copy.

## Target files

- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaEpisodeWorkspace.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx` only if the existing header owner requires it
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaWorkspaceCopy.ts`
- Thai/English locale resources if required
- focused component tests

## UI/UX Contract

### Target User / JTBD

- Role: Drama Series creator.
- Goal: set Image quality and LLM thinking independently for the current episode.
- Entry point: episode workspace settings near model selection.
- Success outcome: settings save without generation and are visible after reload.

### Existing Pattern Reference

- Reuse the current episode image/video model selectors, dynamic model input fields, Radix Select, Label, Tooltip, and toast patterns.
- Diverge only by presenting two clearly titled controls instead of one generic quality control.

### State Matrix

| State | UI |
|---|---|
| loading | disabled/select skeleton treatment |
| Auto | provider/model default label |
| supported | options filtered from capability metadata |
| unsupported | disabled with explanation |
| saving/error | existing optimistic/revert feedback |

### Responsive Matrix

| Viewport | Expected behavior |
|---|---|
| 390x844 | stack controls; no horizontal overflow |
| 768x1024 | compact two-column or wrapped layout |
| 1440x900 | align with existing settings row |

### Accessibility

- explicit labels and descriptions;
- keyboard-selectable controls with visible focus;
- disabled state announced with reason;
- no color-only status indication.

### Browser evidence

Use the existing episode route at mobile, tablet, and desktop sizes and report staging/browser evidence separately from build evidence.
