# Orchestra Plan

## Task Classification - Product Category Reference Storyboard Skills
- Scope: project
- Risk: low
- Affected domains: repo-backed Media Studio skills under `apps/web/skills`
- Estimated file count: 162 new files across 18 skill packages
- Chosen route: direct-inline-standard-light
- Dispatch preference: direct-standard-light
- Intent signals: user explicitly invoked Orchestra and requested end-to-end creation of 18 category-specific reference storyboard skills copied from the furniture reference storyboard pattern.
- SocratiCode preflight: status green; narrowed to `apps/web/skills/furniture-reference-storyboard`, skill schema loading docs, and existing `apps/web/skills/*-reviewer` categories.
- Planned implementation:
  - Create one `*-reference-storyboard` skill package per requested product group.
  - Preserve furniture-reference-storyboard operational conventions: `SKILL.md`, mirrored `skill.md`, JSON schemas, output contract, basic scripts, references, and lock metadata.
  - Replace furniture-specific logic with category-specific product fidelity rules covering exact shape, proportions, material, texture, markings, scale, and common wrong substitutions.
  - Keep shared storyboard rules: product reference dominance, reference role disambiguation, text rendering controls, equal grid layouts, plain prompt output, and QA rewrite gates.
  - Validate JSON schemas, mirrored skill files, and generated package structure.

## Current Task - Media Studio Split Append And Storyboard Duration
- Scope: medium
- Risk: low/medium UI workflow
- Affected domains: Media Studio split tools, Storyboard Review panel, storyboard review workspace helpers/tests
- Estimated file count: 4
- chosen_route: direct-inline-standard-light
- dispatch_preference: direct-standard-light
- SocratiCode status: green
- Planned changes:
  - Allow dropping an image onto the collapsed scissors button to split that new image and append its frames to the current split results.
  - Keep split result ordering user-controlled and send Storyboard Review tasks in the visible order.
  - Calculate storyboard total duration as `(frame count - 1) * seconds per shot`, falling back to 8 seconds per shot when unknown.
  - Show the total duration below the send-to-Storyboard button.
  - Add per-shot duration controls in Storyboard Review with options 4/6/8/10/12/15 seconds, default 8 seconds.
  - Make regenerated storyboard clips use their current per-shot duration.

## Current Task
Enable mouse drag-and-drop reordering for Media Studio split/crop result thumbnails in the image split tools panel.

## Task Classification
- Scope: small
- Risk: low
- Affected domains: Media Studio frontend image split tools
- Estimated file count: 2
- chosen_route: direct-edit-standard-light
- dispatch_preference: direct-standard-light

## Current Implementation Notes
- Add internal drag metadata to split result thumbnails while preserving existing image drag payloads for external drop targets.
- Reorder `splitResults` state when one thumbnail is dropped on another thumbnail.
- Use the visible thumbnail order for Storyboard Review frame upload and generated shot sequence.
- Keep original split metadata (`index`, `row`, `col`) intact for source provenance.

## Task
Fix the Chrome extension Production tab so the selected Production Director project exposes every shot's 3x3 image prompt, video prompt, reference image, start frame, and stop frame with drag-and-drop usable outside the extension.

## Classification
- scope: medium
- risk: medium
- affected_domains: Chrome extension side panel, marketplace capture read API
- estimated_file_count: 3
- chosen_route: direct-inline-standard-light
- task_summary: Extend the read-only Production Director extension contract and render draggable per-shot media/prompt cards.
- bug_route: production extension data usability bug
- parallel_default: false
- planned_agents: []
- dispatch_preference: direct-standard-light

## SocratiCode Preflight
- status: green
- narrowed files:
  - `/home/dev/projects/SmartSpecPro/apps/extension/src/panel/App.tsx`
  - `/home/dev/projects/SmartSpecPro/apps/extension/src/panel/style.css`
  - `/home/dev/projects/SmartSpecPro/apps/web/server/routes/marketplaceCapture.ts`
- impact: route change is read-only and extends the project detail response; no auth, tenant filtering, or write behavior changed.

## Implementation Notes
- Added shot fields for `storyboardGridPrompt`, `videoPrompt`, `referenceImageUrl`, `startFrameUrl`, and `stopFrameUrl`.
- Kept legacy `storyboardPrompt` for backward compatibility.
- Added standard drag payloads for media cards: `text/uri-list`, `text/plain`, `DownloadURL`, and image `text/html`.
- Packaged the extension dashboard zip for version `0.1.40`.

## Task Classification - Shopee Affiliate Product Offer
- Scope: medium
- Risk: low
- Affected domains: Chrome extension content scanner, side panel Product List UI
- Estimated file count: 5
- Chosen route: direct-inline-standard-light
- Dispatch preference: direct-standard-light
- Intent signals: user requested a concrete end-to-end extension behavior change across capture review navigation and product-list extraction.
- SocratiCode preflight: status green; narrowed to `apps/extension/src/content/adapters/shopee.ts`, `apps/extension/src/content/capture/categoryScanner.ts`, `apps/extension/src/panel/App.tsx`, `apps/extension/src/panel/style.css`, and `apps/extension/src/shared/types.ts`.

## Task Classification - Extension Release 0.1.62
- Scope: small
- Risk: low
- Affected domains: Chrome extension release packaging, dashboard public release asset
- Estimated file count: 4 plus generated zip
- Chosen route: direct-edit
- Dispatch preference: direct-standard-light
- Intent signals: user requested a concrete extension version bump and dashboard package build.
- SocratiCode preflight: status green; dashboard latest release path is `apps/web/client/public/releases` via `/api/desktop-releases/marketplace-extension/latest`.

## Task Classification - Magnific Drag And Shopee Affiliate Link Diagnostics
- Scope: medium
- Risk: low
- Affected domains: Chrome extension content drag bridge, Shopee Affiliate scanner, side panel Product List and Config diagnostics
- Estimated file count: 7 plus generated zip
- Chosen route: direct-inline-standard-light
- Dispatch preference: direct-standard-light
- Intent signals: user requested targeted implementation for a cross-surface extension bug and scanner workflow, plus future diagnostic logging.
- SocratiCode preflight: status green; impact checks for `apps/extension/src/content/index.ts`, `apps/extension/src/content/capture/categoryScanner.ts`, and `apps/extension/src/background/serviceWorker.ts` showed no indexed callers.

## Task Classification - Product List Detection And Persistence Fix
- Scope: medium
- Risk: low
- Affected domains: Chrome extension content scanner, side panel Product List state, dashboard release packaging
- Estimated file count: 5 plus generated zip
- Chosen route: direct-inline-standard-light
- Dispatch preference: direct-standard-light
- Intent signals: user reported Product List showing 0 items on Shopee Affiliate and requested the list remain visible while navigating to other pages.
- SocratiCode preflight: status green; narrowed to `apps/extension/src/content/capture/categoryScanner.ts`, `apps/extension/src/content/index.ts`, and `apps/extension/src/panel/App.tsx`; impact checks for the extension entry files showed no indexed callers.

## Task Classification - Shopee Affiliate DOM Diagnostics
- Scope: medium
- Risk: low
- Affected domains: Chrome extension content scanner diagnostics, side panel diagnostics UI, dashboard release packaging
- Estimated file count: 4 plus generated zip
- Chosen route: direct-inline-standard-light
- Dispatch preference: direct-standard-light
- Intent signals: user reported scan still returns 0 despite visible Shopee Affiliate cards and requested DOM/page details for the next debugging pass.
- SocratiCode preflight: status green; narrowed to `apps/extension/src/content/capture/categoryScanner.ts`, `apps/extension/src/content/index.ts`, and `apps/extension/src/panel/App.tsx`; impact checks for the extension entry files showed no indexed callers.
