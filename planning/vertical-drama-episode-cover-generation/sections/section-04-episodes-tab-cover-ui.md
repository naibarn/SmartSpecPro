# Section 04: Episodes Tab Cover UI

## Depends on

Sections 01, 02, and 03.

## Owns

- `apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx`
- optional focused page/component test only if the existing harness supports it

## User/job

The user is working in one series' Episodes tab and wants to generate or replace one episode cover without opening the episode editor. The job may outlive the current page session, so the card must reflect durable server status.

## UI/UX Contract

### Target User / JTBD

Series owner selects one image model once, generates a cover for any episode, monitors slow async work, and can inspect, download, or replace the final cover.

### Surface Inventory

Episodes-tab toolbar model picker; per-episode cover surface; generate/retry action; generating status; fullscreen/download actions; drag/drop and keyboard file input; upload progress/error; read-only card state.

### Component Map

`EpisodeCoverModelPicker` owns catalog loading and per-series preference. `EpisodeCoverCardSurface` owns display/actions and remains outside the episode navigation link. `EpisodeCoverUploadDropZone` owns file selection/drop/progress. `ImageLightbox` owns fullscreen/download presentation.

### State Matrix

No cover: fallback thumbnail plus generate/upload. Generating: spinner/status and no duplicate click. Ready: cover plus fullscreen/download/replace. Failed: retained previous visual plus retry. Read-only: display-only. Catalog/upload errors never erase the current visual.

### Responsive Matrix

At small widths, the existing two-column episode grid becomes one column; toolbar controls and card actions wrap. At medium/large widths, preserve the existing two-column card grid and keep the model picker readable without horizontal overflow.

### Accessibility Acceptance

Images have localized episode-specific alt text; icon-only buttons have accessible labels; file input is keyboard reachable; drag/drop is optional; busy/status text is announced; controls are not nested inside links/buttons; reduced-motion behavior is respected.

### Copy Contract

Use `สร้างหน้าปก`, `กำลังสร้างหน้าปก…`, `ลองอีกครั้ง`, `ดูเต็มจอ`, and `ดาวน์โหลด` for Thai states/actions with matching existing English copy. The provider prompt remains exactly the approved story-only template and is never displayed as an added visual instruction.

### Browser Evidence Required

Exercise no-cover, model memory, generating/reload, ready/lightbox/download, failure/retry, drag-over/file picker, read-only, and narrow viewport states when the existing browser harness is available; otherwise record the limitation in section 05.

## Component and interaction contract

- Add an Episodes-tab toolbar model picker using `mediaModels.list({ type: "image", verticalDramaReady: true })`.
- Store the chosen id under `smartspec_vd_series_${seriesId}_cover_model` through `safeLocalStorage`; validate it against the live catalog and clear stale ids.
- Keep the episode navigation `Link` separate from all cover buttons/input/drop handlers. No nested interactive elements.
- Use the card's cover surface for generate/retry, full-screen preview, download, and replacement.
- Reuse `ImageLightbox` and `WebAssetResolver`; do not add dependencies or a new upload protocol.

## State matrix

| State | Render | Available actions |
|---|---|---|
| No cover | Existing Start Frame thumbnail/placeholder | Generate, drop, file picker |
| Generating | Previous image or placeholder with spinner/model/status | Status only; disable duplicate generation |
| Ready | Generated/uploaded cover | Fullscreen, download, replace, open episode |
| Failed | Previous image/thumbnail plus bounded error | Retry, replace, open episode |
| Read-only | Cover/thumbnail | Fullscreen, download, open episode |
| Catalog/upload error | Existing visual unchanged | Retry or dismiss; never erase current cover |

## Async behavior

On initial series data, poll only episodes with pending cover tasks. Use a cancellable/bounded interval, stop on unmount/id change/terminal state, and invalidate the series query after reconciliation. Different episodes must remain independently actionable. A new user retry creates a fresh idempotency key.

## Upload behavior

Provide both drag/drop and a keyboard-accessible file input. Accept only supported image types. Show drag-over and progress/error states. Upload through `WebAssetResolver`, call the authenticated asset-attachment mutation, and preserve the existing cover if any step fails. Manual upload visibly wins over a stale generation task.

## Accessibility and responsive UX

- Use episode-specific Thai/English alt text.
- Label every icon-only action; expose busy/status text and a concise live-region update.
- Do not make drag/drop the only route.
- Keep the existing responsive two-column grid at medium widths and one column on small screens; controls wrap without horizontal overflow.
- Respect reduced-motion behavior already used by the page.

## Tests/evidence first

Cover model memory, state matrix, polling cleanup, lightbox/download URL, file picker fallback, upload failure preservation, and link/action separation should be covered by a focused component/page test when possible. If the harness cannot mount the page, cover pure model-memory helpers and document the missing browser evidence in section 05.

## Completion proof

- TypeScript and focused UI tests pass.
- Manual browser pass, when available, shows no-cover, generating, ready/lightbox, failed/retry, drop, and narrow-layout states.
- Existing card navigation/delete behavior remains reachable and unchanged.
