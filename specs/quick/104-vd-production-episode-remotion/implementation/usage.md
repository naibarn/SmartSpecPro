# Usage Guide

## Quick Start

Open a Vertical Drama series and use the Production Episodes panel. Select:

- start and end Sub-Episode numbers;
- at least 3 Sub-Episodes per Production Episode;
- source mode: auto, compiled-only, or shot-assembly-only;
- EP number, series title, and enabled Settings watermarks.

When the range leaves a short final group, choose whether to create or skip it. The server persists one pending Production Episode state per group and queues a `remotion_render_video` job with one Remotion segment per Sub-Episode.

## API Reference

The existing `verticalDramaSeries.assembleProductionEpisodes` mutation accepts the new Remotion fields:

```ts
{
  seriesId: string,
  renderEngine: "remotion",
  startSubEpisode: number,
  endSubEpisode: number,
  subEpisodesPerProductionEpisode: number, // 3..50
  remainderPolicy: "create" | "skip",
  sourceMode: "auto" | "compiled_only" | "shot_assembly",
  showEpisodeIndicator: boolean,
  showSeriesTitle: boolean,
  useSeriesWatermarks: boolean,
}
```

Completed groups are returned through `verticalDramaSeries.get` as `productionEpisodesManifest.episodes[]`, with `videoUrl`, status, automatic `productionEpisodeNumber`, selected range, source mode, and render job metadata. The existing UI player provides play, fullscreen, and download actions.
