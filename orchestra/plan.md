# Orchestra Plan

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
