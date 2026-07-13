# Vertical Drama — Production-Grade Render Upgrade (gap analysis + phased plan)

## Critical correction to the request premise
The vertical-drama render path is **entirely FFmpeg, NOT Remotion**. `verticalDramaFinalRenderGraph.ts` is an ffmpeg `-filter_complex` builder. The real Remotion assets (`packages/remotion-render/`, `GenericTemplateComposition.tsx`, `remotionPostPassArgs.ts`) belong to a **separate, unwired "Video Intelligence Platform" (Feature 133)** and are NOT reachable from the episode page.

**Recommendation:** extend the existing FFmpeg graph (which already burns subtitles, overlays, banner, loudnorm, watermark). Rewiring VD to Remotion would be a massive rewrite for no functional gain — FFmpeg already does everything "production grade" needs. So "render via Remotion" is reinterpreted as "the enhanced FFmpeg production render" (vs the plain compound concat).

## Render backbone (today)
- One proc `assembleEpisodeVideo` (verticalDramaEpisodes.ts:13367) → `runAssemblyJob` picks:
  - `buildConcatFfmpegArgs` (no filters = "compound") when no enhancement inputs, OR
  - `buildFinalRenderFfmpegArgs` (concat + banner + `.ass` subtitle/overlay burn + dialogue mix + loudnorm + watermark) when any enhancement input present.
- Season batch: `assembleSeasonVideos` (verticalDramaSeries.ts:4435) → sequential, one ffmpeg at a time.
- Queue: **in-process fire-and-forget** (in-memory Map + `assemblyManifest.compiledVideo` state). NOT BullMQ. BullMQ exists only for the unwired Feature-133.

## Gap table
| Area | Requirement | Status | Note |
|---|---|---|---|
| 1 Subtitle | 10 presets | EXISTS | ASS styles in finalRenderGraph |
| 1 Subtitle | timing synced to spoken dialogue | EXISTS | shares dialogue-audio absolute timeline (plan-accurate, not waveform-probed) |
| 1 Subtitle | font-size control | **MISSING** (small) | hard-coded per preset |
| 2 Overlay | unlimited timed text, absolute-sec, any style | **PARTIAL** | capped 24, shot-anchored, 2 styles |
| 2 Overlay | banner text + image | PARTIAL | banner = AI image w/ baked-in text |
| 2 Overlay | credits roll | **MISSING** | no credits kind |
| 2 Overlay | logo overlay | EXISTS | watermark (corner image) |
| 2 Overlay | age-rating badge | **MISSING** (small) | `audienceAgeRating` data exists, never rendered |
| 3 Audio | full-episode BGM | **MISSING** | `audioBgmPlan`/`vdBgmLibrary` scaffolding exists but inert (not consumed by render) |
| 3 Audio | time-ranged music | MISSING | plan carries start/end, not rendered |
| 3 Audio | loop short track | MISSING | need ffmpeg aloop/apad |
| 3 Audio | ducking (sidechain) | **MISSING** | `duckClipAudioDb` is a NO-OP; only loudnorm exists |
| 4 Render | compound concat (no subs/overlay) | EXISTS | buildConcatFfmpegArgs |
| 4 Render | production render (subs/overlay/audio) | EXISTS (ffmpeg) | buildFinalRenderFfmpegArgs |
| 4 Render | season/multi-ep batch | EXISTS | assembleSeasonVideos (sequential) |
| 4 Render | queue-based worker-pulled | **MISSING** | in-process fire-and-forget |
| 4 Render | batch-of-10 for >10 eps | **MISSING** | processes all in one chain |
| 4 Render | "Production Episodes" published state | **MISSING** | runs are immutable artifacts, no published designation |

## Terminology model (USER CLARIFICATION 2026-07-13 — governs everything below)
- **Sub-Episode** = today's "ตอน"/EP N in the codebase = ~9 shots compounded into one short clip via `assembleEpisodeVideo`. The existing per-"ตอน" render IS a Sub-Episode render. (No risky global rename of the `verticalDramaEpisodes` table/routers — the underlying record stays "episode"; we relabel contextually in the new Production-Episode UI and add the layer on top.)
- **Production Episode** = a GROUP of **5 or 10** consecutive Sub-Episodes concatenated into ONE **4–10 min** video = the publishable unit for Public/social. Group size is **user-selectable (5 or 10)**.
- **Background sound / audio bed attaches at the PRODUCTION EPISODE level** (the 4–10 min grouped render), NOT per Sub-Episode. So Phase B's music+ducking must run in the Production-Episode assembly, not the per-Sub-Episode `assembleEpisodeVideo`.

## Phased plan (revised order)
- **Phase A — quick wins (IN PROGRESS):** subtitle font-size control; age-rating badge overlay (forward existing `audienceAgeRating` into a rendered ASS badge); assembly error-message polish (Thai + human shot number instead of raw clipNumber "301"). Applies at the Sub-Episode render.
- **Phase D′ — PRODUCTION EPISODES (user's next priority):** a new grouping/render layer. Select group size 5 or 10 → concatenate each consecutive group of Sub-Episodes into one 4–10 min Production Episode; queue the render (worker-pulled, off the in-process fire-and-forget); a published "Production Episode" state/artifact distinct from Sub-Episode drafts, for Public/social upload. This is where ">10 episodes → chunk" becomes "group by 5/10". UI must clearly name Sub-Episodes vs Production Episodes.
- **Phase B — audio bed + ducking (attached at Production Episode level):** music input to the Production-Episode assembly graph (full-episode-length track + time-ranged + loop via aloop/apad), sidechaincompress ducking under dialogue + native clip SFX; wire the inert `audioBgmPlan`/`vdBgmLibrary`; UI at the Production-Episode level. (Best done with or right after D′ since it renders at the same level.)
- **Phase C — overlays generalization + credits:** unlimited absolute-second overlays w/ any style; credits-roll overlay kind (ASS scroll); optional editable banner text layer. Credits especially make sense at the Production-Episode level.

Each phase: implement (delegate + conductor verify) → typecheck + tests → deploy → review checkpoint.
