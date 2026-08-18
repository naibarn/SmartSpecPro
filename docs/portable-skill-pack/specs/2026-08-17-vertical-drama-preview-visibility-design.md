# Vertical Drama preview and cover visibility

## Goal

Keep the episode cover and episode-preview controls discoverable before any video
clip has been uploaded or rendered. Cover generation must remain usable from
available episode images; preview rendering must continue to fail closed until
the selected two shots have completed video URLs.

## Root cause

`VerticalDramaEpisodePage.tsx` only mounts `VerticalDramaEpisodePreviewPanel`
when `previewShotOptions.some(option => option.ready)` is true. The ready set is
derived exclusively from `clip.videoTask.videoUrl`, so the entire panel,
including the independent cover-generation surface, disappears when an episode
has images but no video.

## Chosen approach

Always mount the existing episode preview panel once episode detail data is
available. Keep the existing `shotOptions` contract and server-side
`createEpisodePreview` precondition unchanged. This makes the cover controls
available without weakening the video requirement for two-shot Remotion
previews. Add a clear disabled-state explanation when fewer than two rendered
shots are available.

This is preferred over making two-shot previews render from still images because
that would change the Remotion input contract and backend assembly behavior beyond
the reported discoverability problem. It is also preferred over moving only the
cover card because the user asked to keep the preview function visible.

## Scope and data flow

1. `VerticalDramaEpisodePage` renders `VerticalDramaEpisodePreviewPanel` whenever
   `episodeDetailQuery.data` exists, regardless of video readiness.
2. `VerticalDramaEpisodePreviewPanel` continues to derive ready shot count from
   rendered video URLs and passes that state to the existing shot selectors.
3. Cover generation/upload remains available based on image-model availability
   and the existing cover mutation/upload contracts.
4. Preview render buttons remain disabled until two ready shots are selected and
   the cover is ready; the panel explains the missing-video condition.
5. No database, router, provider, credit, or storage contract changes.

## UI/UX Contract

### Target User / JTBD

- Role: Vertical Drama episode creator.
- Goal: Generate an episode cover as soon as episode images exist and understand
  when a teaser can be rendered.
- Entry point: Episode workspace, below the episode video-work controls.
- Success outcome: Cover controls are visible before video generation; preview
  controls are visible with accurate disabled guidance.

### Existing Pattern Reference

- Searched: `VerticalDramaEpisodePreviewPanel`,
  `VerticalDramaEpisodeCoverSurface`, `VerticalDramaSeriesTrailerPanel`, and
  `createEpisodePreview`/`generateTrailer`.
- Found: the existing cover surface already separates image generation/upload
  from video preview state; the series-level trailer backend already accepts
  episode images.
- Decision: reuse the existing panel, cover surface, and state patterns.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Episode workspace | `VerticalDramaEpisodePage.tsx` | Remove video-readiness mount gate |
| Episode preview panel | `VerticalDramaEpisodePreviewPanel.tsx` | Clarify no-video disabled state |
| Cover surface | `VerticalDramaEpisodeCoverSurface.tsx` | No behavior change |

### State Matrix

| State | Expected UI |
|---|---|
| Episode detail loading | Existing workspace loading behavior |
| No video, image/model available | Panel and cover action visible; preview buttons disabled with guidance |
| One rendered shot | Panel visible; one-shot selection possible, render disabled until two |
| Two or more rendered shots | Existing preview flow unchanged |
| Cover generating/uploading | Existing loading overlay and disabled cover action |
| Cover failed | Existing retry action |

### Responsive Matrix

| Viewport | Expected behavior |
|---|---|
| mobile 390x844 | Existing stacked panel layout remains usable |
| tablet 768x1024 | Existing responsive grid remains unchanged |
| desktop 1440x900 | Existing two-column cover/shot layout remains unchanged |

### Accessibility Acceptance

- Preserve existing button labels, checkbox labels, focus rings, and keyboard
  order.
- Disabled preview buttons must have nearby explanatory text; no information is
  communicated by disabled styling alone.
- Keep existing `data-testid` hooks for focused regression coverage.

### Copy Contract

- Thai remains the primary product copy in the existing panel.
- Add/adjust only the no-rendered-video hint; preserve existing cover and preview
  labels.

### Browser Evidence Required

- Manual or Playwright verification should confirm the panel is visible with zero
  rendered videos and that the cover action is present. If browser tooling is not
  available, report that as skipped rather than a pass.

## Verification

- Add a focused source/behavior regression for the page mount condition.
- Run the relevant Vertical Drama UI tests.
- Run a touched-file TypeScript check if practical; separate repository-wide
  baseline diagnostics from feature results.
- Run `git diff --check` on the focused diff.

## Explicit non-goals

- Do not make two-shot episode previews render from still images.
- Do not change the series-level trailer audio, provider, credit, or assembly
  pipeline.
- Do not clean or reformat unrelated dirty-worktree files.
