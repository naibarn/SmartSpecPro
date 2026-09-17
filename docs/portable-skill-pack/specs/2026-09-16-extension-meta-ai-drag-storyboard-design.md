# SmartAIHub Extension: Meta.ai Image Drag and Compact Storyboard Review

## Goal

Allow every image rendered in the Chrome extension's Drama Series, Storyboard
Review, and Product Reviews tabs to be dragged from the side panel into Meta.ai
as a real image file. Make Storyboard Review use the same focused project-to-shot
navigation pattern as Drama Series, and show both image and video prompts with a
short preview while preserving full-copy behavior.

## Scope and non-goals

In scope:

- Add Meta.ai (`meta.ai` and subdomains) to the extension's drag-bridge target
  allowlist, host permissions, and content-script matches.
- Deliver the prepared `File` through a Meta.ai-specific upload path that tries
  the page's file input/native change contract before synthetic drop fallback.
- Keep all existing image card renderers and their file-preparation behavior;
  verify every image surface in the three requested tabs remains draggable.
- Change Storyboard Review to show either the project list or one selected
  project's clips, with a `← Projects` back action.
- Expose the existing storyboard image prompt from the persisted task payload,
  without a schema or database migration, and render it beside the video prompt.
- Use compact read-only prompt previews (four to five visible lines) with Copy
  buttons that copy the complete stored string.
- Bump the extension from `0.1.145` to `0.1.146` and package the dashboard ZIP.

Out of scope:

- Meta.ai API integration, account automation, or changes to SmartAIHub media
  storage/authentication.
- Database schema changes or rewriting existing storyboard data.
- Changes to other providers' drag behavior unless a regression is directly
  caused by the shared target-allowlist helper.

## Architecture and data flow

1. A panel image card prepares a managed/authenticated image as a `File`, stores
   a short-lived bridge record in the extension service worker, and places the
   bridge id plus the real file in `DataTransfer`.
2. The Meta.ai content script receives the drag event, resolves the short-lived
   file record, finds the upload drop zone/input, and delivers the same file.
3. Delivery first uses the page's file input with the native `files` setter and
   `input`/`change` events. Dragenter/dragover events are emitted so Meta.ai's
   drop surface can activate. If no suitable input is present, synthetic drop is
   retained as a bounded fallback.
4. On successful or attempted delivery, the bridge completes/clears the active
   short-lived record using the existing TTL and sender checks.
5. Storyboard Review receives `imagePrompt` from the server projection's
   existing task prompt fields. The panel renders the project list and selected
   detail as mutually exclusive states, and uses the shared prompt box for both
   prompt types.

## Failure handling and safety

- Missing/expired bridge records remain a no-op with no page-side exception.
- Unfetchable managed media remains visibly `preparing`/failed and keeps the
  existing open/download fallback; no unbounded retry is added.
- Meta.ai matching is HTTPS-only and limited to the declared Meta.ai host
  patterns. Service-worker delivery continues to require a sender from an
  allowed drag-bridge tab.
- Prompt projection uses bounded strings and never treats an image prompt as a
  video prompt. Missing prompts render the existing empty copy.
- The project list/detail state is keyboard reachable and must not retain a
  stale selected project after an explicit back action.

## UI/UX contract

### Target User / JTBD

- Role: SmartAIHub creator using the Chrome side panel.
- Goal: choose a project/shot, reuse any visible image in Meta.ai, and copy full
  prompts without giving up panel space.
- Entry point: Chrome extension Drama Series, Storyboard Review, or Product
  Reviews tab.
- Success outcome: the selected image is accepted by Meta.ai's upload surface;
  Storyboard shows the selected project and both prompt types compactly.

### Existing Pattern Reference

- Found pattern: `apps/extension/src/panel/App.tsx` Drama Series uses mutually
  exclusive project/episode/shot states and the shared `productionPromptBox()`;
  `productionMediaCard()` is the shared draggable media surface.
- Decision: reuse the state shape, prompt box, media card, labels, and back
  action; diverge only by adding the missing Storyboard image prompt and a
  Meta.ai delivery adapter.

### Surface inventory

| Surface | File/route | Change |
|---|---|---|
| Extension manifest | `apps/extension/public/manifest.json` | Meta.ai host and content match |
| Drag bridge | `apps/extension/src/content/dragBridge.ts` | Meta.ai target detection/delivery |
| Service worker | `apps/extension/src/background/serviceWorker.ts` | Meta.ai sender target allowlist |
| Storyboard projection | `apps/web/server/routes/marketplaceCapture.ts` | bounded `imagePrompt` field |
| Storyboard panel | `apps/extension/src/panel/App.tsx` | focused project detail, prompts, version |
| Panel styling | `apps/extension/src/panel/style.css` | single-column detail and prompt preview |
| Dashboard release | `apps/web/client/public/releases/` | versioned ZIP `0.1.146` |

### State and responsive acceptance

- Loading: project/clip loading copy remains visible.
- Empty: no projects and no clips remain explicit.
- Detail: only selected project detail is visible; `← Projects` returns to list.
- Prompt: image and video previews are read-only, capped to four/five lines, and
  Copy uses the full value.
- Responsive: mobile/tablet/desktop use one column for project list/detail; no
  horizontal overflow. Desktop detail uses the available panel width.
- Accessibility: project cards, image cards, Copy, and Back have keyboard focus;
  prompt fields retain accessible labels; focus remains visible.

## Verification and release

- Add/update focused projection and panel-contract tests.
- Add pure drag-target/delivery tests where the current extension test setup
  permits; otherwise verify built manifest and bridge output plus a manual
  Meta.ai drag flow.
- Run extension Vite build without the repository-prohibited standalone
  typecheck, extension focused tests, dashboard package verification, ZIP
  inspection, and `git diff --check`.
- Browser proof should cover Meta.ai upload acceptance and Storyboard list/detail
  at mobile `390x844`, tablet `768x1024`, and desktop `1440x900` when a browser
  session is available. If Meta.ai authentication/browser access is unavailable,
  report that as residual external proof rather than claiming it.

