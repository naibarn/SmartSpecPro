# Orchestra Progress

[COMPLETE] wave-1-contract — Extended the read-only Production Director project detail API with per-shot 3x3 prompt, video prompt, and reference/start/stop frame URLs.
[COMPLETE] wave-2-extension-ui — Updated the Production tab to show separate prompt boxes and draggable media cards for every shot in the selected project.
[COMPLETE] wave-3-verification — Extension build, web TypeScript check, and extension dashboard packaging passed.

## Fresh Start Notes
- Existing worktree had many unrelated modified files before this task; they were not reverted.
- SocratiCode status checked: green.

## Verification
- `npm --prefix apps/extension run build`: passed.
- `npm --prefix apps/web run check`: passed.
- `npm --prefix apps/extension run package:web-dashboard`: passed.

## Extension Release 0.1.41
- Bumped marketplace extension from `0.1.40` to `0.1.41`.
- Updated side-panel build label to `2026-05-28 11:40 +07`.
- Ran `npm --prefix apps/extension run package:web-dashboard`: passed.
- Created `apps/web/client/public/releases/smartaihub-marketplace-capture-extension-0.1.41.zip`.
- Verified the zip `manifest.json` reports version `0.1.41`.

## Extension Release 0.1.42
- Added Copy buttons to Production tab prompt boxes.
- Bumped marketplace extension from `0.1.41` to `0.1.42`.
- Updated side-panel build label to `2026-05-28 11:44 +07`.
- Ran `npm --prefix apps/extension run package:web-dashboard`: passed.
- Created `apps/web/client/public/releases/smartaihub-marketplace-capture-extension-0.1.42.zip`.
- Verified the zip `manifest.json` reports version `0.1.42` and bundled panel code contains the Copy button.

## Extension Release 0.1.43
- Diagnosed Start/Stop frame upload issue: previous drag payload exposed URLs only, while the target site upload area expects `dataTransfer.files`.
- Added media prefetching for Production tab images and injects a real `File` into `dataTransfer.items` during drag when available.
- Kept URL drag payloads as fallback.
- Bumped marketplace extension from `0.1.42` to `0.1.43`.
- Ran `npm --prefix apps/extension run package:web-dashboard`: passed.
- Created `apps/web/client/public/releases/smartaihub-marketplace-capture-extension-0.1.43.zip`.
- Verified the zip `manifest.json` reports version `0.1.43` and bundled panel code contains file-drag support.

## Extension Release 0.1.44
- Fixed drag-to-upload regression where dropping a frame opened the image URL in a new tab.
- When a media file is ready, drag payload now contains the `File` item only and does not attach URL/text/html payloads.
- Production media cards and reference thumbnails are no longer anchor links; double-click/Enter still opens media in a new tab.
- Bumped marketplace extension from `0.1.43` to `0.1.44`.
- Ran `npm --prefix apps/extension run package:web-dashboard`: passed.
- Created `apps/web/client/public/releases/smartaihub-marketplace-capture-extension-0.1.44.zip`.
- Verified the zip `manifest.json` reports version `0.1.44` and bundled panel code contains the file-only drag marker.

## Extension Release 0.1.45
- Investigated broken Production tab slot images.
- Root cause: extension detail API did not expose `storyboardGridFrames`, so stale/broken per-slot URLs had no reliable fallback.
- Added `storyboardGridFrames` to the Production Director extension detail API.
- Added frame fallback selection in the extension: reference uses existing reference/first project reference/grid frame, start uses first grid frame, stop uses last grid frame.
- Bumped marketplace extension from `0.1.44` to `0.1.45`.
- Ran `npm --prefix apps/extension run build`: passed.
- Ran `npm --prefix apps/web run check`: passed.
- Ran `npm --prefix apps/extension run package:web-dashboard`: passed.
- Created `apps/web/client/public/releases/smartaihub-marketplace-capture-extension-0.1.45.zip`.

## Extension Release 0.1.46
- Clarified goal: Production tab images must render in the extension and drag into external sites as normal file uploads.
- Updated Production media loading to fetch image bytes and render cards from `blob:` object URLs, with extension auth fallback for protected `/api/storage/files/...` media.
- Reuses the fetched blob as a real `File` during drag so external upload zones can receive `dataTransfer.files`.
- Bumped marketplace extension from `0.1.45` to `0.1.46`.
- Ran `npm --prefix apps/extension run package:web-dashboard`: passed.
- Created `apps/web/client/public/releases/smartaihub-marketplace-capture-extension-0.1.46.zip`.
- Verified the zip `manifest.json` reports version `0.1.46` and bundled panel code includes object URL rendering and file-only drag support.

## Extension Release 0.1.48
- Added support for image payloads stored as JPG/PNG/WebP/GIF base64 strings rather than normal URLs.
- Server no longer truncates production media strings to 2048 characters; allows up to 2MB for slot/base64 media fields in the extension detail response.
- Extension normalizes raw base64 into `data:image/...;base64,...`, renders it, converts it to `Blob`/`File`, and keeps drag/drop as a real file upload payload.
- Bumped marketplace extension from `0.1.47` to `0.1.48`.
- Ran `npm --prefix apps/extension run build`: passed.
- Ran `npm --prefix apps/web run check`: passed.
- Ran `npm --prefix apps/extension run package:web-dashboard`: passed.
- Created `apps/web/client/public/releases/smartaihub-marketplace-capture-extension-0.1.48.zip`.

## Extension Release 0.1.49
- Added a new Chrome extension `Storyboard` tab for SmartAIHub Storyboard Review projects.
- Added read-only marketplace extension API routes for Storyboard Review project list/detail from `media_studio_storyboard_reviews`, limited to the authenticated user and 30 recent active projects.
- Storyboard tab supports project search, clip list, reference/start/stop/video media cards, file-backed drag/drop media payloads, and Copy Prompt buttons.
- Bumped marketplace extension from `0.1.48` to `0.1.49`.
- Ran `npm --prefix apps/extension run build`: passed.
- Ran `npm --prefix apps/web run check`: passed.
- Ran `npm --prefix apps/extension run package:web-dashboard`: passed.
- Created `apps/web/client/public/releases/smartaihub-marketplace-capture-extension-0.1.49.zip`.
- Verified the zip `manifest.json` reports version `0.1.49`.

## Extension Release 0.1.50
- Removed the duplicate per-clip reference image strip from the new `Storyboard` tab.
- Storyboard clips now show media only once in the main Reference image / Start frame / Stop frame / Shot video cards.
- Kept the Production tab shot reference strip unchanged because it can include additional shot reference assets.
- Bumped marketplace extension from `0.1.49` to `0.1.50`.
- Ran `npm --prefix apps/extension run build`: passed.
- Ran `npm --prefix apps/extension run package:web-dashboard`: passed.
- Created `apps/web/client/public/releases/smartaihub-marketplace-capture-extension-0.1.50.zip`.
- Verified the zip `manifest.json` reports version `0.1.50`.

## Extension Release 0.1.51
- Fixed external drag/drop from Production and Storyboard media cards so ready media sends only a `File` payload.
- Removed the custom filename string drag payload and URL fallback payloads that could be inserted into prompt text boxes as plain text.
- Disabled dragging until a media card has a prepared `File`, avoiding accidental text/URL drops while still preparing files on hover/pointer down.
- Bumped marketplace extension from `0.1.50` to `0.1.51`.
- Ran `npm --prefix apps/extension run build`: passed.
- Ran `npm --prefix apps/extension run package:web-dashboard`: passed.
- Created `apps/web/client/public/releases/smartaihub-marketplace-capture-extension-0.1.51.zip`.
- Verified the zip `manifest.json` reports version `0.1.51`, and bundled panel code no longer contains `application/x-smartaihub-media-file` or `DownloadURL` drag payload markers.

## Extension Release 0.1.52
- Unified image drag behavior across Product List, product review images, Production, and Storyboard media cards.
- Added a content-script drag bridge for Google Flow/Labs and Magnific targets: extension media is preloaded as a real File, stored briefly in the background service worker, and replayed into target-page drop/file-input handlers via a custom drag id.
- Added content-script and host permissions for Google Flow/Labs and Magnific target domains.
- Removed Shot video cards/preload from the Storyboard tab; Storyboard now shows only reference/start/stop images and prompts.
- Fixed Storyboard project-list thumbnail selection so video URLs are not used as `<img>` thumbnails.
- Bumped marketplace extension from `0.1.51` to `0.1.52`.
- Ran `npm --prefix apps/extension run build`: passed.
- Ran `npm --prefix apps/web run check`: passed.
- Ran `npm --prefix apps/extension run package:web-dashboard`: passed.
- Created `apps/web/client/public/releases/smartaihub-marketplace-capture-extension-0.1.52.zip`.
- Verified the zip `manifest.json` reports version `0.1.52`, target matches include Google/Magnific, the content bundle contains the drag bridge MIME marker, and the panel bundle no longer contains `Shot video`.

## Media Studio Floating Preview Manual Selection Fix
- SocratiCode status checked: green.
- Root cause: the floating preview kept rendering the multi-task generation grid when old `generationTasks` still held multiple completed tasks, so manual thumbnail clicks updated `previewUrl` but the selected media was hidden behind the stale 8/9 grid.
- Added explicit floating preview display mode:
  - `tasks` for generation/progressive-preview sessions.
  - `media` for manual right-panel history/library/marketplace selections.
- Verification:
  - `npm run test --workspace=@smartspec/web -- client/src/lib/mediaStudioFloatingPreview.test.ts`: passed.
  - `npm run check --workspace=@smartspec/web`: passed.
  - `git diff --check -- apps/web/client/src/pages/MediaStudio.tsx apps/web/client/src/lib/mediaStudioFloatingPreview.ts apps/web/client/src/lib/mediaStudioFloatingPreview.test.ts`: passed.
  - `npm run build --workspace=@smartspec/web`: passed.
  - `./run-services.sh restart web`: passed, web health OK.

## Video Shot Slot Drag Replace Fix
- SocratiCode status checked: green.
- Root cause: Video Shot slots already had drop handlers, but rendered older node outputs before the manually assigned storyboard prompt-card URLs, so dropped replacement media could be saved while the UI still showed the previous reference/start/stop/video.
- Changed slot rendering to prefer prompt-card URLs when they contain an assigned URL, then fall back to generated node outputs.
- Hardened drag payload parsing so dropped assets with `source_video`, `reference_image`, `product_image`, `marketplace_product`, or `text/x-smartspec-media-type` are classified correctly even when the URL has no extension.
- Verification:
  - `npm run test --workspace=@smartspec/web -- client/src/features/media-production/production-director.e2e.test.tsx`: passed.
  - `npm run check --workspace=@smartspec/web`: passed.
  - `git diff --check -- apps/web/client/src/features/media-production/components/VideoShotWorkspace.tsx apps/web/client/src/features/media-production/production-director.e2e.test.tsx`: passed.
  - `npm run build --workspace=@smartspec/web`: passed.
  - `./run-services.sh restart web`: passed, web health OK.
