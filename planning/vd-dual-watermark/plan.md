# VD — ลายน้ำซีรีส์ 2 ชุด (series logo + channel logo)

Status: in progress · Started 2026-08-02 · Backend (CMD-2) done 2026-08-02, UI still pending

## Problem

A series can configure exactly ONE watermark today. The user needs TWO
independent ones on the same render:

- ชุดที่ 1 — โลโก้ชื่อเรื่อง (the series/title logo)
- ชุดที่ 2 — โลโก้ช่อง (the channel logo)

Each slot gets its own type/image/position/opacity/size/margin; the user
places them in different corners themselves. The settings UI must be the
SAME form, duplicated side-by-side (existing card on the left, the new slot
added as a second column on the right).

Both render engines must composite both slots. Remotion is the DEFAULT engine
(since 2026-07-31) so it is the one that must be correct for real renders;
the ffmpeg path is kept byte-consistent with it by a documented invariant.

## Affected files

| Layer | File | Change |
|---|---|---|
| Contract | `apps/web/shared/verticalDramaSeries/textOverlay.ts` | `vdSeriesWatermarkSlotSchema` + `secondary` on the config + `listEnabledWatermarkSlots()` |
| Resolution | `apps/web/server/services/verticalDramaTextOverlayResolution.ts` | emit an ARRAY of resolved watermarks (image slots) + one `watermark_text` overlay per text slot |
| Render (ffmpeg) | `apps/web/server/services/verticalDramaEpisodeVideoAssembly.ts`, `verticalDramaFinalRenderGraph.ts` | stage + overlay N watermark images |
| Render (Remotion) | `apps/web/server/services/verticalDramaRemotionRender.ts` | one image layer per slot, unique layer ids, asset manifest entry per slot |
| Routers | `verticalDramaEpisodes.ts` (single-episode), `verticalDramaSeries.ts` (season batch) | thread the array through `renderFeed` |
| UI | `apps/web/client/src/components/verticalDramaSeries/VerticalDramaSettingsTab.tsx` | second slot column, identical controls |

## Data shape (DONE)

No DB migration: `vertical_drama_series.watermark` is an untyped `jsonb`
column and the change is additive.

Slot 1 stays INLINE at the top level of the stored object and slot 2 lives
under `secondary`. Every row written before this change therefore parses
unchanged with `secondary === undefined` — no migration, no back-compat
branch downstream. `listEnabledWatermarkSlots()` is the single place that
knows this layout.

## Risks

- **Layer-id collision (Remotion).** The single watermark layer is hard-coded
  as `id: "series-watermark"`. Two slots need distinct ids or the template
  schema/worker dedupes or overwrites one. → id per `slotId`.
- **Layer budget.** `MAX_VD_REMOTION_LAYERS` is 40 and the error message
  enumerates contributors; a second watermark adds 1 and the message must
  count it, otherwise a budget failure misreports what filled the budget.
- **ffmpeg filter graph growth.** Each watermark is an extra overlay stage.
  Two is fine; the existing per-banner explosion warning still applies.
- **Corner auto-avoid.** `resolveWatermarkCornerAutoAvoid` currently nudges
  the (single) watermark away from the episode indicator. It stays applied to
  slot 1 only — the user explicitly places the two slots themselves, so slot 2
  is left exactly where they put it.
- **Positions are a 3x3 grid**, not 4 corners (`VD_WATERMARK_POSITIONS`), so
  "different corners" is the user's job, not something to validate away.

## Backend implementation notes (2026-08-02, CMD-2)

- `RunAssemblyJobWatermarkImageInput`/`ResolvedWatermarkImage` gained a
  required `slotId: VdSeriesWatermarkSlotId` field — needed by BOTH engines
  (distinct staged filenames + ffmpeg filter-label suffixes on the ffmpeg
  path; distinct Remotion layer ids `series-watermark-primary`/`-secondary`
  on the Remotion path). Not spelled out in the original "Data shape" section
  above but is a direct, unavoidable consequence of "distinct layer ids
  derived from slotId" in the brief.
- The deprecated singular `watermarkImage` field was NOT kept — it was fully
  replaced by `watermarkImages: RunAssemblyJobWatermarkImageInput[]`
  everywhere (resolution service, both render engines, both routers, and
  every test file that referenced it). An audit grep before starting showed
  every call site of `RunAssemblyJobWatermarkImageInput`/`.watermarkImage` in
  the repo was inside this brief's file set, so there was no unmigrated
  caller left to break.
- `resolveEpisodeTextOverlayRunInputs`'s single `watermarkText` param became
  `watermarkTexts: Array<{...}>` — each enabled TEXT slot becomes its own
  `watermark_text` overlay event (the overlays array already supported
  multiple events of the same kind; no new plumbing needed there).
- `FinalRenderManifestSection` gained `watermarkCount: number` alongside the
  existing `watermarkIncluded: boolean`.
- Corner auto-avoid vs. `episodeIndicator` applies to the PRIMARY slot only,
  exactly as planned — implemented as a per-slot loop in
  `resolveVdEpisodeTextOverlayEngineInputs` (`verticalDramaTextOverlayResolution.ts`),
  checking `slotId === "primary"`.

## Verification

- `listEnabledWatermarkSlots` unit cases: legacy single-slot row, both slots,
  slot 2 only, `enabled: false` on either.
- Resolution: two image slots → two resolved entries; text+image mix → one
  `watermark_text` overlay + one image entry.
- Remotion: two distinct full-timeline image layers with the right anchors.
- ffmpeg: two overlay stages, positions independent.
- UI: both columns save in ONE `updateSeriesWatermark` payload.
- Deploy: `npm run build:deploy` + `sudo systemctl restart smartspec-web.service`
  (server code changed).
