# Implementation plan

## Objective

Ship extension version `0.1.146` with Meta.ai image-file dragging, focused
Storyboard Review navigation, and compact image/video prompt display.

## Work items

1. Extend the bridge target allowlists and manifest matches for HTTPS Meta.ai.
2. Add Meta.ai delivery to the bridge using the existing file preparation and
   short-lived service-worker record. Keep generic/provider paths unchanged.
3. Add `imagePrompt` to `buildStoryboardReviewClipView()` from bounded task and
   storyboard-context keys; update its focused tests.
4. Update Storyboard Review types and render state in `App.tsx`:
   - list-only before selection;
   - detail-only after selection;
   - Back and Refresh controls;
   - every clip's image/video prompt uses the shared compact prompt box with
     four-to-five preview rows and full Copy.
5. Adjust scoped CSS so the Storyboard detail uses the full panel width and
   prompt controls remain shrinkable without horizontal overflow.
6. Bump version metadata to `0.1.146`, Vite-build, package the generated dist
   into `apps/web/client/public/releases/`, and run the dashboard validator.

## Acceptance criteria

- Meta.ai host pages load the drag bridge from the built manifest.
- A prepared image drag carries a real `File` and Meta.ai's upload input receives
  it; fallback remains bounded when the DOM is not ready.
- All existing image card surfaces in the three tabs remain draggable.
- Storyboard Review never shows project list and clip detail side by side.
- Image prompt and video prompt are independently rendered; missing values stay
  empty rather than being substituted across types.
- Long prompts show only a compact preview while Copy returns the full string.
- Version and dashboard ZIP agree at `0.1.146`.

## Risks and mitigations

- Meta.ai DOM changes: use semantic upload selectors and generic input fallback;
  preserve diagnostic logs and manual browser proof as a release gate.
- Authenticated media fetch failure: retain existing proxy/auth fallback and
  ready/failed state; do not add unbounded retries.
- Dirty worktree contamination: review only explicit changed paths and do not
  stage or rewrite unrelated work.

