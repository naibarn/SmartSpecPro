# Vertical Drama series thumbnail fallback design

## Objective

Make every Vertical Drama series/episode thumbnail use the first episode's
ready cover when available, then fall back to the first episode's approved
start-frame image. Keep the existing tenant/user boundary and make revisits
fast through the existing TanStack Query cache.

## Current contract and root cause

`verticalDramaSeries.list` calls `resolveSeriesThumbnailUrls`, which currently
looks only at `startFramePlan.frames[].approvedMediaAssetId` and may select a
later episode. The detail `get` response separately exposes `coverImage` and a
start-frame `thumbnailUrl`, but the fallback order is not shared.

## Chosen approach

- Keep the existing read-only resolver; do not add a schema or migration.
- Restrict the series-card resolver to `episodeNumber = 1`.
- Resolve episode-cover media assets first, preferring the active cover variant
  and then any variant with a persisted media asset id.
- Resolve the start-frame media asset only as the fallback.
- Resolve all candidate media assets in one owner-scoped query and prefer a
  managed storage key over stale provider URLs.
- Apply the same cover-first ordering to episode-row `thumbnailUrl` so the
  detail page and list page remain consistent.
- Increase list/detail query freshness; retain the previous list while filters
  refetch, but do not show a previous series while navigating to a different
  detail route. Stable managed URLs remain browser-cacheable.

## UI/UX Contract

### Target User / JTBD

- Role: Vertical Drama creator.
- Goal: identify a story quickly from its first episode artwork.
- Entry point: `/drama-series` or a series detail page.
- Success outcome: the correct episode-1 cover appears immediately when it
  exists, otherwise the episode-1 start frame appears.

### Existing Pattern Reference

- Searched: `thumbnailUrl`, `coverImage`, `VerticalDramaEpisodeCoverSurface`.
- Found: `VerticalDramaEpisodeCoverSurface` in
  `apps/web/client/src/components/verticalDramaSeries/VerticalDramaEpisodeCoverSurface.tsx`.
- Decision: reuse existing image/fallback surface and server DTO fields; no new
  visual component.

### Surface Inventory

| Surface       | File/route                                                     | Change                                                           |
| ------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| Series cards  | `VerticalDramaSeriesPage.tsx`, `/drama-series`                 | Consume corrected `thumbnailUrl`; retain cache while refetching. |
| Episode rows  | `VerticalDramaSeriesDetailPage.tsx`, `/drama-series/:seriesId` | Consume corrected cover-first `thumbnailUrl` fallback.           |
| Read resolver | `verticalDramaThumbnails.ts`                                   | Centralize precedence and owner-scoped asset lookup.             |

### Component Map

| Component          | File                                                  | Owns                                            | Consumes                                    |
| ------------------ | ----------------------------------------------------- | ----------------------------------------------- | ------------------------------------------- |
| Thumbnail resolver | `apps/web/server/services/verticalDramaThumbnails.ts` | Cover/start-frame precedence and URL projection | Episode JSONB + `media_assets`              |
| Series list        | `VerticalDramaSeriesPage.tsx`                         | Query cache and card rendering                  | `list.series[].thumbnailUrl`                |
| Series detail      | `VerticalDramaSeriesDetailPage.tsx`                   | Episode fallback rendering                      | `get.episodes[].coverImage`, `thumbnailUrl` |

### State Matrix

| State                       | Expected UI                                  | Verification                               |
| --------------------------- | -------------------------------------------- | ------------------------------------------ |
| loading                     | Existing skeleton remains                    | Existing page state test/manual inspection |
| empty                       | Existing clapperboard placeholder            | Existing page behavior                     |
| no cover, start frame ready | Episode-1 start frame                        | Resolver regression test                   |
| cover ready                 | Episode-1 cover                              | Resolver regression test                   |
| cover asset unavailable     | Start-frame fallback or placeholder          | Resolver regression test                   |
| refetch                     | Previous cards remain while new result loads | Query option inspection/test               |

### Responsive Matrix

The layout is unchanged; the existing grid applies at mobile 390x844, tablet
768x1024, and desktop 1440x900. No new overflow or breakpoint is introduced.

### Accessibility Acceptance

Existing empty alt text, semantic links, keyboard focus, and placeholder
behavior remain unchanged. Images may use asynchronous decoding/lazy loading
without changing accessible names.

### Visual Direction

Reuse current Card, image aspect ratio, border, and muted placeholder tokens.
No new colors, spacing, typography, radius, or motion are introduced.

### Copy Contract

No user-facing copy changes.

### Browser Evidence Required

Automated resolver/query tests are required. Browser screenshot evidence is
recommended but not available in this local-only change unless a running app
and browser harness are provided.

## Acceptance criteria

1. Episode 1 cover wins over episode 1 start frame.
2. If episode 1 has no usable cover, episode 1 start frame is used.
3. A later episode never supplies the series-card thumbnail.
4. Cross-tenant/user media assets are not resolved.
5. Existing managed-storage URL precedence remains intact.
6. Targeted tests pass and unrelated dirty files remain untouched.
