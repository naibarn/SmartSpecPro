# Section 03 — storyboard viewport and tests

## Ownership

Own the start-frame image viewport in
`VerticalDramaStoryboardPanel.tsx` and focused page/panel/media tests. Do not
rewrite the shared media component or unrelated storyboard surfaces.

## UI/UX Contract

### Target user and job

Vertical-drama creator needs to know whether prompt creation, image provider
work, media linking, or browser display is the failing boundary and choose the
next action without guessing.

### Surface and component map

- Shot card start-frame viewport: image, status overlay, retry/help actions.
- Existing prompt and generation buttons remain available where applicable.
- Existing lightbox/download controls remain for ready assets.

### State matrix

| State | Trigger | User copy/action |
| --- | --- | --- |
| generating | pending task/local poll | prompt ready + image progress |
| provider/admission failed | terminal failed | reason + create image with saved prompt |
| sync failed | result URL not linked | generated-but-not-linked + retry sync/history |
| asset loading | asset URL not loaded | loading overlay |
| asset load failed | browser error | load error + retry/open original |
| ready | image `onLoad` | image/lightbox/download |
| no image | no prompt/task/asset | existing no-image guidance |

### Responsive and accessibility

- Overlay stays inside the aspect-ratio viewport at narrow/mobile widths.
- Status text remains readable over any image using an opaque/semi-opaque panel.
- Loading/failure states expose `role="status"` or `role="alert"`, and
  `aria-busy` is true while loading/generating.
- Every action has an accessible Thai/English label and stable test id.
- Do not rely on color alone; include text and icon/status semantics.

### Browser evidence

Automated jsdom tests cover callbacks and state precedence. An authenticated
browser screenshot/manual check is desirable after implementation but is
reported separately if no valid session/provider task is available.

## TDD expectations

Test every state and precedence rule, including reset when the asset URL
changes. Preserve ready-state lightbox/download and existing stale/no-image
copy.

## Acceptance checks

- No blank viewport is presented as an unexplained successful state.
- Only `onLoad` produces ready display status.
- Error action labels tell the user whether to retry image, retry sync/history,
  or regenerate prompt.
