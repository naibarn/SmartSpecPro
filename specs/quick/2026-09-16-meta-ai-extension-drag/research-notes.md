# Research notes

## Current patterns

- `productionMediaCard()` and `draggableProductImage()` already make the
  extension's visible media cards draggable and prepare an authenticated File
  through the service-worker bridge.
- `dragBridge.ts` has provider-specific input delivery for Google Flow,
  Magnific, Higgsfield, Grok, Facebook, and TikTok, but no Meta.ai target.
- `manifest.json` has no `meta.ai` host permission or dragBridge content match.
- `serviceWorker.ts` rejects target tabs unless `isDragBridgeTargetUrl()` allows
  them.
- Drama Series already uses mutually exclusive project, episode, and shot
  states and compact prompt boxes with Copy.
- Storyboard Review currently renders the project list and selected detail side
  by side under `.production-layout.storyboard-layout`.
- `buildStoryboardReviewClipView()` preserves the task video prompt but currently
  does not expose the existing task image prompt.

## Security/boundary notes

- Meta.ai should be HTTPS-only and restricted to `meta.ai` and its subdomains.
- Existing extension-page sender checks and content-sender checks must remain.
- Bridge records are short-lived and should not be exposed to arbitrary pages.

## Verification notes

- `apps/extension` package build invokes a TypeScript no-emit check, which is
  prohibited by the repository instructions unless explicitly requested.
- Use Vite build plus focused tests and the existing dashboard package validator;
  inspect the generated ZIP without claiming a global typecheck.

