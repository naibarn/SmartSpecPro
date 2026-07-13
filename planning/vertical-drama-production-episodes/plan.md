# Vertical Drama — Production Episodes (Phase D′)

## Model (from user, see memory project_vd_episode_terminology)
- **Sub-Episode** = today's "ตอน" (verticalDramaEpisodes row) = ~9 shots → one short compiled video via `assembleEpisodeVideo` → persisted at `assemblyManifest.compiledVideo.videoUrl`.
- **Production Episode** = a GROUP of **5 or 10** consecutive Sub-Episodes' *compiled videos* concatenated into ONE 4–10 min video = the publishable unit. Group size user-selectable (5/10).
- Audio bed (Phase B, later) attaches at THIS level.

## Key finding
- `assembleSeasonVideos` (verticalDramaSeries.ts:4435) renders each Sub-Episode individually (batch of per-sub-ep renders) — it does NOT group-concat. So Production Episodes needs a NEW concat operation at the compiled-video level.
- `buildConcatFfmpegArgs` / `runAssemblyJob` (verticalDramaEpisodeVideoAssembly.ts) already download remote clip videos + FFmpeg-concat + upload the result + persist state. Reuse that machinery, but feed it Sub-Episode compiled-video URLs instead of shot-clip URLs.

## Data model (MVP — additive, NO migration)
Store Production Episodes as JSON on the series row, mirroring `assemblyManifest`/`bible` (jsonb): `series.productionEpisodes` (or a dedicated jsonb column `productionEpisodesManifest`) — an array of:
`{ index, groupSize, subEpisodeNumbers: number[], status: "pending"|"completed"|"failed", videoUrl?, durationSeconds?, assembledAt?, pendingJobId?, published?: boolean }`.
(A dedicated `verticalDramaProductionEpisodes` TABLE is the "proper" long-term home, but JSON-on-series is the low-risk MVP that avoids a migration; formalize later if needed.)

## Render-options LEVEL (user correction 2026-07-13) — IMPORTANT
The public deliverable is the Production Episode, so the render STYLING options (subtitle preset + font size, age badge, banner, watermark, loudness, include-dialogue-audio) belong at the **Production Episode** render config — NOT the per-Sub-Episode workspace. The Phase-A options currently on the Sub-Episode page (`VerticalDramaEpisodeWorkspace`) become an internal PREVIEW render only; the AUTHORITATIVE public styling is set once on the Production Episode panel.

Mechanics: the Production Episode assembly ACCEPTS these render options and applies them uniformly across the whole grouped episode. Simplest reuse-correct MVP: for each Sub-Episode in the group, render its compiled video WITH the Production-level options (reuse the existing `assembleEpisodeVideo` render path), then concat those into the 4–10 min Production Episode. So the options thread: Production Episode panel → `assembleProductionEpisodes` input → per-Sub-Episode render → concat. (Sub-Episodes are NOT required to be pre-compiled; the Production assembly renders them with the chosen styling.)

Follow-up cleanup: relocate/simplify the Phase-A subtitle/badge controls on the Sub-Episode page (keep a minimal preview default; the real controls live on the Production Episode panel).

## Phase D′-1 (core group-concat + persist + trigger UI) — THIS INCREMENT
1. **Service** `verticalDramaProductionEpisodeAssembly.ts`:
   - `chunkSubEpisodesIntoGroups(subEpisodes, groupSize)` — pure; consecutive chunks of 5/10 by episodeNumber (last group may be short).
   - `assembleProductionEpisode(group)` — gather each Sub-Episode's `assemblyManifest.compiledVideo.videoUrl` (in order); require all present unless `allowPartial`; reuse the existing download+concat+upload path (`runAssemblyJob`/`buildConcatFfmpegArgs` machinery) to concat the compiled mp4s; return `{ videoUrl, durationSeconds }`.
   - Persist result into `series.productionEpisodes[index]` via a jsonb read-modify-write (mirror `persistCompiledVideoState`). In-process fire-and-forget for the MVP (same as Sub-Episode assembly today); queue/worker is a later increment.
2. **Router** (verticalDramaSeries.ts): `assembleProductionEpisodes` mutation `{ seriesId, groupSize: z.union([z.literal(5), z.literal(10)]), allowPartial? }` → chunk → assemble each group → persist. Plus expose `productionEpisodes` in `get`'s series DTO (like `deepDraftSummary`).
3. **Frontend**: a "Production Episodes" panel (series detail — new tab OR a section under the episodes tab) with: group-size selector (5/10), "สร้าง Production Episodes" button, and a list of Production Episodes each with status + play/download (reuse the compiled-video player pattern from req 4). Clearly labels "Sub-Episode" vs "Production Episode".
4. Tests: `chunkSubEpisodesIntoGroups` (5/10, short last group, ordering); router happy-path + missing-compiled-video precondition.

## Later increments (D′-2+)
- Queue/worker (BullMQ) instead of in-process; batch-of-10/5 progress.
- Published "Production Episode" state + a proper table if JSON outgrows.
- Phase B audio bed + ducking attached here.

## Verify
Typecheck + targeted tests + manual (series with ≥1 compiled sub-episode → assemble a group → play the 4-10 min result) → deploy (server build + restart).
