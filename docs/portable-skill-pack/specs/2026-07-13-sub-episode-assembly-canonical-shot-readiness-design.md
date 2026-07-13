# Sub-episode Assembly Canonical Shot Readiness

Date: 2026-07-13

## Problem

The Sub-episode assembly card currently derives both its denominator and its
disabled state from `motionPromptPack.clips.length`. Historical episodes may
still contain multiple legacy speaker-aware sub-shot records for one storyboard
shot (for example clip `301` and `302` for shot `3`). A canonical nine-shot
episode is therefore displayed as `9/10 clips ready`, and full assembly is
blocked even when every canonical shot has a rendered video.

New prompt generation already consolidates a speaker-switch shot back to one
persisted clip, but that repair only runs when the prompt is regenerated. It
does not repair already-persisted episode packs.

## Decision

Assembly readiness and full-assembly inputs will be resolved by canonical
storyboard shot rather than raw persisted clip-record count.

The canonical shot number for a clip is resolved in this order:

1. `parentShotNumber`
2. the first valid `sourceShotNumbers` entry
3. the normal unsplit `clipNumber`
4. the legacy encoded parent (`Math.floor(clipNumber / 100)`) only when the
   clip carries legacy sub-shot metadata or no better identity is available

The expected shot set comes from valid storyboard shot numbers. If storyboard
data is unavailable, start-frame shot numbers are used. If neither exists, the
unique canonical shot numbers derived from the motion-prompt pack are used as a
backward-compatible fallback.

## Readiness Rules

- A canonical shot is ready when at least one clip mapped to that shot has a
  non-empty rendered `videoUrl`.
- The displayed total is the number of unique expected canonical shots.
- The displayed ready count is the number of expected shots with a selected
  ready clip.
- Missing warnings list canonical shot numbers only.
- Extra or duplicate legacy records do not increase the denominator.
- An orphan clip outside the canonical storyboard set does not make a missing
  canonical shot ready.

## Assembly Selection

Full assembly receives exactly one selected ready clip per canonical shot, in
ascending storyboard-shot order. Selection is deterministic:

1. prefer a completed unsplit canonical clip (`clipNumber === shotNumber` and
   without legacy sub-shot identity);
2. otherwise prefer a completed clip with the lowest `subShotNumber`;
3. otherwise prefer the completed clip with the lowest `clipNumber`.

This preserves existing media, avoids mutating historical JSONB rows, and does
not delete alternative legacy clips. Partial assembly uses the same selection
rule but omits canonical shots without a completed clip.

The resolver will live in shared, pure TypeScript so the page readiness UI and
server assembly precondition consume the same behavior rather than maintaining
separate counting rules.

## UI Behavior

- A nine-shot episode with a rendered video for every canonical shot displays
  `9/9 clips ready` and enables full assembly.
- If canonical shot 3 is genuinely missing, it displays `8/9`, reports shot 3,
  disables full assembly, and retains the explicit partial-assembly action.
- Existing compiled-video pending, failed, completed, and reassemble states are
  unchanged.

## Server Behavior

`assembleEpisodeVideo` resolves the canonical shot set from the owned episode's
storyboard/start-frame/clip data, rejects a full request only when a canonical
shot has no completed selection, and submits the selected one-per-shot list to
the existing assembly job. It does not rewrite the persisted motion-prompt
pack.

## Verification

Regression coverage must prove:

1. nine canonical shots plus nine completed clips resolves to `9/9`;
2. ten persisted records containing a duplicated legacy parent still resolves
   to nine canonical shots and enables full assembly;
3. a genuinely missing canonical shot resolves to `8/9`, lists that shot, and
   blocks full assembly;
4. the selection priority is deterministic;
5. UI and server both consume the shared resolver;
6. variable shot counts continue to work without hardcoding `9`.

## Non-goals

- No destructive migration or deletion of legacy clip records.
- No change to video generation, billing, subtitles, dialogue-audio mixing, or
  the final ffmpeg job.
- No fixed `9` constant in readiness or assembly logic.
