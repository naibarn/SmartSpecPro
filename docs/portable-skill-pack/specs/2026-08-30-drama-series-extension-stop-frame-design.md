# Drama Series Extension Stop Frame Pairing

## Goal

The Chrome extension's Drama Series tab must show each shot's approved Start
frame together with that same shot's approved Stop frame. Stop is optional: a
shot without a usable Stop asset must not render a Stop image or placeholder.

## Architecture and data flow

1. `apps/web/server/services/verticalDramaExtensionReadService.ts` reads the
   per-shot `startFramePlan.frames[]` records.
2. The server collects both `approvedMediaAssetId` and
   `approvedStopFrameAssetId`, resolves them through the existing tenant/user
   scoped `media_assets` lookup, and projects
   `stopFrameUrl`/`stopFrameThumbnailUrl` on the shot response.
3. A missing ID, missing scoped asset, or asset without either URL projects
   `null`; there is no cross-shot or reference-image fallback.
4. `apps/extension/src/panel/App.tsx` renders the existing Start image and the
   optional Stop image in the same asset strip. Existing protected preview,
   drag preparation, drag behavior, and open-in-tab behavior are reused.

The per-frame approved Stop asset is authoritative. `motionPromptPack` clip
end-frame data is intentionally not used for this read projection because one
clip can cover multiple shots and must not cause a Stop image to be repeated on
the wrong shot.

## UI/UX Contract

### Target User / JTBD

- Role: Drama Series creator/reviewer using the Chrome extension.
- Goal: Compare the opening and terminal visual for every shot before using the
  shot assets in a downstream video workflow.
- Entry point: Chrome extension > Drama Series > project > episode.
- Success outcome: each shot shows Start and, when approved/available, its own
  Stop frame side by side.

### Existing Pattern Reference

- Searched with targeted `rg` in `apps/extension/src/panel/App.tsx`.
- Found `productionMediaCard`, `production-reference-strip`,
  `authenticatedPreviewImage`, and equivalent Start/Stop rendering in the
  Production and Storyboard tabs.
- Decision: reuse the existing media-card/strip and protected preview patterns;
  diverge only in the Drama response projection because its server contract
  previously exposed only the main Start image.

### Surface Inventory

| Surface                | File/route                                       | Change                             |
| ---------------------- | ------------------------------------------------ | ---------------------------------- |
| Drama episode read API | `/api/marketplace-captures/drama-series/episode` | Add optional Stop URLs per shot    |
| Drama shot card        | `apps/extension/src/panel/App.tsx`               | Render Start plus conditional Stop |

### Component Map

| Component             | File                                   | Owns                                          | Consumes                                  |
| --------------------- | -------------------------------------- | --------------------------------------------- | ----------------------------------------- |
| Drama read projection | `verticalDramaExtensionReadService.ts` | Scoped asset resolution and response contract | `startFramePlan.frames[]`, `media_assets` |
| Drama shot card       | `App.tsx`                              | Pair layout and media interactions            | `mainImage*`, `stopFrame*`                |

### State Matrix

| State                      | Expected UI                                  | Verification                         |
| -------------------------- | -------------------------------------------- | ------------------------------------ |
| loading                    | Existing episode loading state               | Existing flow remains unchanged      |
| Start only                 | Start image only; no Stop card/placeholder   | Focused projection/UI assertion      |
| Start + Stop               | Both labeled images appear in order          | Focused projection/UI assertion      |
| missing/invalid Stop asset | Stop is omitted                              | Focused projection assertion         |
| error                      | Existing error/status handling               | Existing extension flow              |
| hover/focus/drag           | Existing protected preview and drag behavior | Reuse existing handlers; diff review |

### Responsive Matrix

| Viewport         | Expected behavior                                               | Evidence                                          |
| ---------------- | --------------------------------------------------------------- | ------------------------------------------------- |
| mobile 390x844   | Existing strip wraps/scrolls according to current extension CSS | Source/layout verification; browser not available |
| tablet 768x1024  | Start and Stop remain readable in the existing strip            | Source/layout verification                        |
| desktop 1440x900 | Start and Stop appear adjacent without changing card hierarchy  | Source/layout verification                        |

### Accessibility Acceptance

- Preserve the existing media-card labels and keyboard/open behavior.
- Use explicit `Start frame` and `Stop frame` labels/alt text.
- Do not add icon-only controls or new focus traps.
- Existing focus visibility and reduced-motion behavior remain unchanged.

### Copy Contract

- Labels: `Start frame`, `Stop frame`.
- No Stop-empty placeholder copy.
- Existing loading/error copy remains unchanged.

### Browser Evidence Required

Browser replay would be useful for visual confirmation at 390x844, 768x1024,
and 1440x900, but authenticated browser state is not available in this turn.
Local focused tests, extension typecheck/build, and diff checks are required;
browser evidence remains explicitly unverified.

## Error and security behavior

- Preserve existing 404 behavior for unowned series/episodes.
- Resolve Stop assets with the same `(tenantId, userId)` scope as Start assets.
- Never expose an asset URL from another tenant/user and never substitute a
  different shot's Stop frame.
- A missing Stop asset is a valid partial-success state, not an API failure.

## Verification

- Add focused server projection coverage for Start+Stop, Start-only, and
  missing scoped Stop asset cases.
- Run the relevant server test file(s), extension typecheck/build, and
  `git diff --check`.
- Do not claim authenticated browser, deployment, or production verification.

## Scope and rollout

No database migration, backfill, provider call, or deployment is required. The
change is backward-compatible because Stop fields are nullable and old episode
rows simply render Start only.
