# Section 07 — Shared episode/storyboard operations

## Goal

Make special episodes look like normal episodes after creation while hiding only normal
story-driven actions and retaining shared prompt/media operations.

## Owned files

- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
- additive shared contract props/hooks and tests

## Implementation

- Branch on `episodeKind`/special view mode only after loading; keep normal branch
  behavior unchanged.
- For specials, hide/disable Story Bible/script/stage-generation/overview controls.
- Retain title/status, start-frame prompt/image, video prompt/clip, prompt editing,
  polling/resume, download, credit confirmation, and explicit rendering through shared
  components.
- Render exactly the skill-returned 1–5 shots and carry product/location/person locks and
  model snapshot through the existing storyboard contract.
- Ensure prompt generation is automatic at special creation but user edits and media
  rendering remain explicit and use normal gates.

## TDD

Test special visibility, one-to-five shot rendering/no nine placeholders, shared prompt
editing/render controls, polling/resume, status/error/partial success, and a broad normal
page regression fixture.

## Acceptance

Special and normal pages share the same component family and downstream operations; only
the intended special controls differ.

## UI/UX Contract

### Target User / JTBD
Creator reviewing prompt-ready special shots and explicitly rendering media; success is
the same familiar episode workspace with only normal story actions hidden.

### Existing Pattern Reference
Reuse `VerticalDramaEpisodePage.tsx` and `VerticalDramaStoryboardPanel.tsx` prompt,
media, polling, download, and credit controls. Diverge only in the episode-kind gate and
1–5 shot projection.

### Surface Inventory
Episode route, storyboard cards, prompt editor, start-frame/video controls, status and
download actions.

### Component Map
Page owns mode gating; shared storyboard owns shot cards; existing task/media components
own polling/rendering; special adapter supplies resolved shot contract.

### State Matrix
Loading, prompt-ready success, partial output, provider error, retry, disabled normal
actions, selected/focus/hover shot controls must be covered.

### Responsive Matrix
Mobile 390x844 single-column cards; tablet 768x1024 compact grid; laptop 1024x768
sidebar plus scroll; desktop 1440x900 full workspace; extended dense viewports checked
for no horizontal overflow.

### Accessibility Acceptance
Preserve existing labels and keyboard path for prompt edit/render/download; hidden normal
controls must not remain keyboard-focusable; status updates are announced and motion is
reduced when requested.

### Copy Contract
Reuse existing Thai/English prompt/render/status copy; add special labels only where
needed and distinguish prompt-ready from rendered.

### Browser Evidence Required
Capture required viewports and verify special vs normal route, shot count, hidden controls,
prompt editing, loading/error/disabled states, focus, and console.
