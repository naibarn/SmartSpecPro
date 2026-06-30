# Section 07: Storyboard Source Trim And Disabled Middle Ranges

## Goal

Document the implemented Storyboard Review source-trim workflow that lets a reviewer trim the head/tail of an uploaded shot video and mark middle ranges that must be excluded from Capture Preview and Final Composite rendering.

This section is an implementation addendum to Feature 122 because it extends Storyboard Review per-shot segment state and prepares the render pipeline for future segment-level video editing.

## Status

- Status: implemented in worktree
- Date captured: 2026-06-29
- Primary surface: `/storyboard-review`
- Primary users: tablet and desktop Storyboard Review editors

## Implemented Scope

### 1. Source Trim Contract

Storyboard Review tasks can now carry source trim data in task extra params:

```ts
type StoryboardSourceTrimRange = {
  inSec: number;
  outSec: number;
  sourceDurationSec?: number;
  disabledRanges?: Array<{
    startSec: number;
    endSec: number;
  }>;
};
```

When a backend/worker has already prepared a physical trimmed clip, the task can also carry:

```ts
type StoryboardSourceTrimDerived = {
  status: "ready" | "pending" | "failed" | "stale";
  url?: string;
  durationSeconds?: number;
  sourceUrl?: string;
};
```

Behavior:

- `inSec` and `outSec` define the active source boundary.
- `disabledRanges` define middle portions inside the active boundary that must be skipped.
- `sourceTrimDerived.status === "ready"` with a URL is preferred by Video Editor handoff and HyperFrames Final Composite planning.
- If the user edits trim/mark values, stale derived metadata is cleared before saving the new trim.
- Ranges are normalized to one decimal place.
- Disabled ranges are clamped to the active boundary.
- Overlapping or near-adjacent disabled ranges are merged.
- The implementation limits disabled ranges to 5 per shot.
- At least 1 second of usable media must remain after disabled ranges are applied.

### 2. Storyboard Review UI

The Storyboard Review task card exposes a trim panel for completed video shots.

The panel supports:

- video preview for the selected shot;
- active head/tail boundary controls;
- current playhead tracking;
- a single visual timeline that shows:
  - blue: kept/active portion;
  - solid rose: already disabled middle ranges;
  - translucent rose: draft middle range being marked;
  - dark playhead line: current video position;
- playback that skips disabled middle ranges;
- saving or clearing the trim without changing the original media file.

Tablet UX requirement:

- users should not need to drag media between distant panels;
- users should not need to mentally reconcile two independent numeric timelines;
- the reviewer can play the shot and mark the start/end of a middle cut from the current frame.

Implemented interaction:

1. Open the trim panel on a video shot.
2. Play or scrub the preview to the point where the unwanted middle range starts.
3. Click `ตั้งจุดเริ่มตัดจากเฟรมนี้` / `Mark cut start here`.
4. Continue to the point where the unwanted range ends.
5. Click `ตั้งจุดจบตัดจากเฟรมนี้` / `Mark cut end here`.
6. Fine-tune numeric values if needed.
7. Click `เพิ่มช่วงตัดออก` / `Add disabled range`.
8. Click `บันทึกช่วง` / `Save trim`.

### 3. Preview Playback Semantics

Preview playback uses the normalized trim state:

- playback starts at `inSec`;
- playback pauses/resets after `outSec`;
- if playback enters a disabled middle range, it seeks to that range's `endSec`;
- the playhead value follows the actual preview time so mark buttons use the frame the user is viewing.

This keeps tablet use natural: the user plays, stops, and marks from the video itself instead of manipulating separate sliders.

### 4. Persistence

Saving a trim updates the Storyboard Review draft task:

- `generationExtraParams.sourceTrim` stores the normalized range;
- clearing a full-range trim removes `sourceTrim`;
- saving marks render-related outputs stale by clearing the current project/render linkage in draft state;
- existing task metadata and storyboard context are preserved.

### 5. Render And Capture Contract

The source trim state must be consumed by both:

- Capture Preview;
- Final Composite render.

The render planner must treat a trimmed shot as a source clip plan:

- if `sourceTrimDerived` is ready, the planner uses that derived MP4 as the natural source clip with `mediaStartSec = 0`;
- the derived MP4 path is preferred because it matches what the user sees and keeps later setting screens simple;
- if no ready derived MP4 exists, the planner falls back to virtual source trim expansion;
- a simple head/tail trim produces one source segment;
- disabled middle ranges split the usable media into multiple contiguous render segments;
- disabled middle ranges must not appear in generated MP4 output;
- disabled middle ranges must not appear in capture preview frames;
- generated metadata should preserve the original task/shot lineage.

### 6. Subtitle And Transcription Implications

If disabled middle ranges are removed, existing subtitles and voiceover timing can become invalid.

Required behavior for production completion:

- if a rendered shot is built from trimmed source media, subtitle cues must be generated or remapped against the kept media timeline;
- for highest correctness, each resulting kept segment should be rendered/transcribed as a new derived shot clip before final assembly;
- subtitle generation should run on the derived media, not the untrimmed original, when middle ranges were disabled;
- if transcription is not available, UI must warn that subtitles may need manual review after trim.

This keeps the Phase 2 middle-cut workflow compatible with later Phase 3 audio/silence tooling.

## Files Implemented Or Extended

- `apps/web/client/src/components/media/StoryboardBatchReviewDialog.tsx`
  - trim panel UI;
  - `StoryboardSourceTrimRange` parsing/normalization;
  - disabled range draft controls;
  - playhead tracking and mark-from-current-frame actions.
  - status badge for whether a trimmed shot is using a prepared derived clip or still waiting for preparation.
- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
  - stores `sourceTrim` into task extra params;
  - clears stale `sourceTrimDerived` metadata when trim values change;
  - invalidates current render/project linkage after trim changes;
  - feeds source trim data into HyperFrames final source clip planning;
  - prefers ready `sourceTrimDerived` clips as natural sources before 30-second split planning.
- `apps/web/client/src/lib/storyboardVideoProject.ts`
  - source clip planning for trimmed shots and disabled ranges;
  - prefers ready `sourceTrimDerived` clips for Video Editor handoff;
  - generated prompt/metadata behavior for source-trimmed clips.
- `apps/web/client/src/pages/StoryboardReviewPage.hyperframesText.test.ts`
  - regression coverage for HyperFrames final text/source-trim behavior.
- `apps/web/client/src/lib/__tests__/storyboardVideoProject.test.ts`
  - source trim and middle disabled range planning coverage.
- `apps/web/client/src/lib/storyboardReviewWorkspace.test.ts`
  - workspace compatibility coverage.

## Acceptance Criteria

- A video shot can be trimmed head/tail without modifying the original media URL.
- A user can define up to 5 disabled middle ranges.
- Disabled ranges are shown on the same timeline as the active kept range.
- A user can mark disabled range start/end from the current preview frame.
- Preview playback skips disabled ranges.
- Saving the trim persists normalized `sourceTrim` metadata.
- Saving a new trim clears stale `sourceTrimDerived` metadata.
- Full-range/no-disabled trim clears `sourceTrim`.
- Capture Preview and Final Composite use the kept source segments only.
- If a ready derived trimmed MP4 exists, Video Editor and Final Composite setting use the derived MP4 as the source and start at `mediaStartSec = 0`.
- If middle ranges are disabled, final source planning expands the shot into multiple contiguous kept segments.
- Existing per-shot Storyboard Review behavior remains unchanged for tasks with no `sourceTrim`.
- Tablet UX does not require dragging video or images across distant panels to define trims.

## Verification Captured

The implementation was verified with:

```text
npm --prefix apps/web test -- client/src/pages/StoryboardReviewPage.hyperframesText.test.ts client/src/lib/__tests__/storyboardVideoProject.test.ts client/src/lib/storyboardReviewWorkspace.test.ts --reporter=dot
```

Result:

```text
3 test files passed
57 tests passed
```

Additional checks:

```text
git diff --check -- apps/web/client/src/components/media/StoryboardBatchReviewDialog.tsx
```

Result: passed.

Known repository-wide verification caveats at capture time:

- `npm --prefix apps/web run typecheck` fails on pre-existing `server/test_db.ts(1,23): Cannot find module './db/index.js'`.
- `git diff --check` for the whole repository reports a pre-existing trailing blank line in `orchestra/plan.md`.

## Future Phase Hooks

### Phase 2 Completion Hardening

- Add browser evidence for tablet and desktop trim flows.
- Add component-level UI tests for mark-from-current-frame behavior if the project test harness supports reliable media element simulation.
- Add a clear subtitle warning when source trim invalidates existing cues.

### Phase 3: Silence-Based Auto Cuts

The same `disabledRanges` contract can support automatic silence removal:

- analyze audio waveform or RMS energy per window;
- expose an adjustable silence threshold;
- expose minimum silence length and noise tolerance;
- generate draft disabled ranges from detected silence;
- require user review before saving ranges.

The silence tool must write to the same `disabledRanges` array so render/capture behavior stays consistent.

### Phase 4: Derived Per-Shot Rendering

For safest subtitle and audio correctness, a future renderer may materialize each trimmed/disabled shot as a derived per-shot media file before final composition.

The derived render should:

- use original media as input;
- apply head/tail trim and middle disabled ranges;
- produce a new durable clip URL;
- run transcription on that derived clip;
- use the derived clip as the canonical source for final assembly.

## Non-Goals

- This section does not replace the Feature 122 segment planner.
- This section does not introduce adaptive multi-shot generation.
- This section does not define final audio silence detection implementation details beyond the future hook.
- This section does not require destructive edits to original uploaded media.
