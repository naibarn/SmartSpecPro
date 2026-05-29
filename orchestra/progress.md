# Orchestra Progress

## Product Category Reference Storyboard Skills
- SocratiCode status checked: green.
- Scope: project; risk: low; route: direct-inline-standard-light.
- Dirty worktree note: many unrelated extension, web, Python, and orchestra files were already modified before this task; this wave only created new product reference storyboard skill packages, added one focused skill-contract test, and appended orchestra planning notes.
- Implemented 18 new skill packages copied from the furniture-reference-storyboard operating pattern and rewritten for category-specific fidelity:
  - household-product-reference-storyboard
  - computer-laptop-reference-storyboard
  - electrical-appliance-reference-storyboard
  - food-beverage-reference-storyboard
  - electronics-reference-storyboard
  - fashion-clothing-reference-storyboard
  - shoes-reference-storyboard
  - watch-eyewear-reference-storyboard
  - mobile-tablet-reference-storyboard
  - jewelry-reference-storyboard
  - mother-baby-reference-storyboard
  - pet-supplies-reference-storyboard
  - sports-equipment-reference-storyboard
  - camera-photography-reference-storyboard
  - gaming-accessories-reference-storyboard
  - automotive-reference-storyboard
  - stationery-reference-storyboard
  - books-reference-storyboard
- Each package includes `SKILL.md`, mirrored `skill.md`, input/ui/output schemas, references, scripts, README, model compatibility, and skill lock metadata.
- Verification:
  - Generated skill schema parse and mirror check: passed.
  - `git diff --check -- apps/web/skills apps/web/server/services/__tests__/productReferenceStoryboardSkills.test.ts orchestra/plan.md`: passed.
  - `npm run test --workspace=@smartspec/web -- server/services/__tests__/productReferenceStoryboardSkills.test.ts`: passed.
  - `npm run check --workspace=@smartspec/web`: passed.

## Media Studio Split Append And Storyboard Duration
- SocratiCode status checked: green.
- Classification: medium scope, low/medium UI workflow risk, direct-inline-standard-light.
- Dirty worktree note: extension files, package lock, prior Media Studio split changes, and orchestra files were already modified before this task; this wave will only edit Media Studio/Storyboard Review-related files and orchestra notes.
- Implemented:
  - Collapsed scissors button accepts dropped images, splits them with current grid/crop settings, and appends frames to existing split results with unique indexes.
  - Storyboard Review creation uses current ordered split frames and stores per-shot/total timing metadata.
  - Split tools show total storyboard duration below the send button.
  - Storyboard Review panel exposes per-shot duration choices: 4, 6, 8, 10, 12, 15 seconds.
  - Media Studio dialog and standalone Storyboard Review page both update task context duration so regeneration uses the selected shot length.
- Verification:
  - `git diff --check -- apps/web/client/src/pages/MediaStudio.tsx apps/web/client/src/pages/StoryboardReviewPage.tsx apps/web/client/src/components/media/StoryboardBatchReviewDialog.tsx apps/web/client/src/lib/storyboardReviewWorkspace.ts apps/web/client/src/lib/storyboardReviewWorkspace.test.ts orchestra/plan.md orchestra/progress.md`: passed.
  - `npm run test --workspace=@smartspec/web -- client/src/lib/storyboardReviewWorkspace.test.ts`: passed (15 tests).
  - `npm run check --workspace=@smartspec/web`: passed.

## Media Studio Split Result Reorder
- SocratiCode status checked: green.
- Scope: small frontend behavior change in `apps/web/client/src/pages/MediaStudio.tsx` plus split download helper.
- Planned change: preserve existing external image drag payloads, add internal thumbnail reorder drag/drop, and make Storyboard Review creation use the current visual order.
- Implemented mouse drag/drop reordering for split result thumbnails.
- Split result labels, single download filenames, add-to-reference names, add-to-video-reference names, and Storyboard Review frame names now follow the visible order.
- Verification:
  - `git diff --check -- apps/web/client/src/pages/MediaStudio.tsx apps/web/client/src/lib/imageGridSplitter.ts orchestra/plan.md orchestra/progress.md`: passed.
  - `npm run check --workspace=@smartspec/web`: passed.

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

## Shopee Affiliate Product Offer Capture
- SocratiCode status checked: green.
- Added `Shopee Affiliate` after `Shopee search` in Capture Review; it opens `https://affiliate.shopee.co.th/offer/product_offer`.
- Classified Shopee Affiliate product-offer pages as list/category pages for extension live detection.
- Added a read-only affiliate offer scanner that returns only cards with `EXTRACOMM` and normalized sales count greater than 100.
- Product List now shows commission text and a clickable affiliate URL when the card DOM exposes one through link/data/clipboard attributes or visible URL text.
- Verification:
  - `npm --prefix apps/extension run typecheck`: passed.
  - `npm --prefix apps/extension run build`: passed.
  - `git diff --check -- apps/extension/src/shared/types.ts apps/extension/src/content/adapters/shopee.ts apps/extension/src/content/capture/categoryScanner.ts apps/extension/src/panel/App.tsx apps/extension/src/panel/style.css`: passed.

## Extension Release 0.1.62
- Bumped marketplace extension from `0.1.61` to `0.1.62`.
- Updated side-panel build label to `2026-05-29 06:35 +07`.
- Ran `npm --prefix apps/extension run package:web-dashboard`: passed.
- Created `apps/web/client/public/releases/smartaihub-marketplace-capture-extension-0.1.62.zip`.
- Verified the zip `manifest.json` reports version `0.1.62` and `0.1.62` sorts ahead of the existing dashboard release zips.

## Magnific Drag And Shopee Affiliate Link Diagnostics
- SocratiCode status checked: green.
- Hardened Magnific-only drag/drop delivery by setting the nearest file input first with a fresh `DataTransfer`, then falling back to synthetic drop. Other drag bridge hosts keep the existing behavior.
- Added local diagnostic logs under `smartaihubDiagnosticLogs` for Magnific delivery strategy, Shopee Affiliate scan counts, link-click resolution, and panel link requests.
- Added Config tab diagnostics controls to load or clear recent local logs.
- Reworked Shopee Affiliate product-offer scanning to find visible cards from the `เอา ลิงก์` button and card text, not only Shopee product anchors.
- Added per-product `เอา ลิงก์` action in Product List. The user chooses a row, then the content script clicks that row's Shopee button and updates only that product with the exposed URL when Shopee renders one.
- Bumped marketplace extension from `0.1.62` to `0.1.63`.
- Verification:
  - `npm --prefix apps/extension run typecheck`: passed.
  - `npm --prefix apps/extension run package:web-dashboard`: passed.
  - Created `apps/web/client/public/releases/smartaihub-marketplace-capture-extension-0.1.63.zip`.
  - Verified zip manifest is `0.1.63` and bundled markers include diagnostics, Magnific delivery, and affiliate link resolution.
  - `git diff --check`: passed.

## Product List Detection And Persistence Fix
- SocratiCode status checked: green.
- Root cause: the Product List tab could show only the empty state because scan actions were available in Capture Review, and live detection cleared the candidate list on URL changes even when the user navigated from a category list to a product or another page.
- Added Product List scan controls directly in the Product List tab and an auto-scan path when the tab is opened on a scannable category/search/shop page with no candidates.
- Changed live snapshot handling so existing candidates remain visible across page changes; list replacement now happens only when a scannable listing page returns a non-empty candidate signature.
- Manual scan returning zero candidates now keeps the existing Product List and records that in diagnostics.
- Loosened Shopee Affiliate card detection around the `EXTRACOMM`, price, commission, sold-count, image, and `เอา ลิงก์` signals, and added scanner diagnostics for raw cards and skip counts.
- Bumped marketplace extension from `0.1.63` to `0.1.64`.
- Verification:
  - `npm --prefix apps/extension run typecheck`: passed.
  - `npm --prefix apps/extension run package:web-dashboard`: passed.
  - Created `apps/web/client/public/releases/smartaihub-marketplace-capture-extension-0.1.64.zip`.
  - Verified zip manifest is `0.1.64` and bundled markers include Product List scan controls, keep-list messages, affiliate diagnostics, and affiliate link request handling.
  - `git diff --check`: passed.

## Shopee Affiliate DOM Diagnostics
- SocratiCode status checked: green.
- Added zero-result DOM diagnostics for Shopee Affiliate scans. When visible scan or scroll scan returns 0 candidates, the content script now stores a compact DOM summary under `smartaihubDiagnosticLogs`.
- Added a manual `Capture diagnostics` button in Product List. It captures the current tab's URL, viewport, signal counts, candidate-card summaries, link-button summaries, visible image summaries, and compact DOM snippets, then opens Config diagnostics.
- Expanded scanner diagnostics with `sampleCards`, `sampleLinkButtons`, `sampleImages`, raw card counts, seed counts, and skip reasons.
- Relaxed the affiliate-card ancestor matching so cards with split Shopee DOM wrappers are less likely to be rejected before sales/EXTRACOMM filtering.
- Bumped marketplace extension from `0.1.64` to `0.1.65`.
- Verification:
  - `npm --prefix apps/extension run typecheck`: passed.
  - `npm --prefix apps/extension run package:web-dashboard`: passed.
  - Created `apps/web/client/public/releases/smartaihub-marketplace-capture-extension-0.1.65.zip`.
  - Verified zip manifest is `0.1.65` and bundled markers include manual DOM diagnostics, zero-scan diagnostics, DOM samples, scanner samples, and Product List capture controls.
  - `git diff --check`: passed.

## Storyboard Review Voiceover Script Override
- SocratiCode context was already narrowed to Storyboard Review, Media Studio split/storyboard code, and the storyboard planner skill/server route.
- Added an editable combined voiceover script field to Storyboard Review next to concept/details and storyboard guide.
- Editing and saving the combined script automatically enables "use this script instead of concept/details"; the user can uncheck it.
- Persisted `voiceoverFullScript` and `useVoiceoverScriptAsConcept` in storyboard review drafts.
- Updated prompt planning payload and server prompt construction so edited narration can become the authoritative content source for all regenerated prompts.
- Tightened planner instructions so voiceover length fits the total storyboard duration from per-shot durations, defaulting missing slot duration to 8 seconds.
- Updated storyboard planner skill files to match the new voiceover override and duration rules.
- Verification:
  - `npm run test --workspace=@smartspec/web -- client/src/lib/storyboardReviewWorkspace.test.ts`: passed.
  - `npm run check --workspace=@smartspec/web`: passed.
  - `git diff --check -- ...storybook/storyboard-review changed files`: passed.

## Collapsed Split Scissors Drop Fallback
- SocratiCode status checked: green.
- Root cause: during browser `dragover`, custom drag data can be unreadable until `drop`, so the collapsed scissors target sometimes did not call `preventDefault()` and the browser showed a no-drop cursor.
- Hardened image drop detection with `dataTransfer.types`, production asset JSON fallback, and right-edge window-level drop handling while the split panel is collapsed.
- Added a no-drag fallback action in History image cards: when the split tool is open, a scissors button splits that image and appends its frames to the current split result set.
- Verification:
  - `npm run check --workspace=@smartspec/web`: passed.
  - `git diff --check -- apps/web/client/src/pages/MediaStudio.tsx`: passed.

## Split New Image Append Fix
- Fixed split tool behavior when selecting another image while an existing split result set is still open.
- `openSplitDialog` no longer clears existing split results when reopening in split mode for a new normal image.
- The main "Split" button now appends newly split frames to existing results unless the split is a Video Shot production writeback, where replacement behavior is still preserved.
- Verification:
  - `npm run check --workspace=@smartspec/web`: passed.
  - `git diff --check -- apps/web/client/src/pages/MediaStudio.tsx`: passed.

## Split Results Scroll Fix
- Removed the nested fixed-height scroll area around split result thumbnails so all frames participate in the main image tools panel scroll.
- Added bottom padding below the thumbnail grid so the last row can scroll fully into view.
- Verification:
  - `npm run check --workspace=@smartspec/web`: passed.
  - `git diff --check -- apps/web/client/src/pages/MediaStudio.tsx`: passed.

## Split Storyboard Button Text Fix
- Updated the split storyboard action buttons so long Thai labels no longer overflow or get clipped.
- The Storyboard Review and video-reference buttons now stack vertically, use full width, and allow wrapped button text with stable icon sizing.
- Verification:
  - `npm run check --workspace=@smartspec/web`: passed.
  - `git diff --check -- apps/web/client/src/pages/MediaStudio.tsx`: passed.

## Product Reference Storyboard Skills Admin Registration
- Confirmed the 18 new product reference storyboard skill folders existed under `apps/web/skills`, but none of their slugs existed in the `skills` database table, so Admin/Skills could not list them.
- Imported all 18 missing rows into `skills` using the folder manifests, with `folderPath=skills/<slug>`, `isEnabled=true`, `enabledByDefault=false`, `visibleByDefault=false`, `importSource=folder`, `createdBy=1`, cached skill content, content hashes, config, and execution policy.
- Restarted `smartspec-web.service` to clear the in-process skill registry cache.
- Verification:
  - SQL count for the 18 new slugs: `18`.
  - Registry check via `getAvailableSkillsAsync`: `foundCount=18`.
  - Web service health: root route returned HTTP `200` after restart.

## Media Studio Production Reference Storyboard Dropdown
- Replaced the Production tab reference storyboard dropdown source with metadata-driven options from the skill registry instead of only the original hardcoded two-skill list.
- Added `production-reference-storyboard` tags and `config.media_studio.production_reference_storyboard.enabled=true` to the 20 relevant skill manifests: furniture, cosmatic, and the 18 new product-category storyboard skills.
- Kept the original two-skill list as a legacy fallback while allowing any `*-reference-storyboard` saved selection to remain valid.
- Synced the 20 DB rows with updated tags/config/content hashes and restarted `smartspec-web.service`.
- Verification:
  - DB metadata count for tag/config: `20/20`.
  - `getUserVisibleSkills(1, { limit: 100 })` metadata filter returned `matchingCount=20`.
  - `npm run test --workspace=@smartspec/web -- server/services/__tests__/productReferenceStoryboardSkills.test.ts`: passed.
  - `npm run check --workspace=@smartspec/web`: passed.
  - Web service health: root route returned HTTP `200` after restart.
