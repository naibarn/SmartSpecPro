# Section 11: Timeline, Continuity, and Cue Sheet

## Goal

Make Production Director capable of planning one continuous story, not only a set of disconnected shots.

The system must preserve timing, continuity, audio, captions, transitions, and shot order from planning through Storyboard Review and Video Edit.

## Timeline Model

Each approved ProductionSpace should have a timeline/cue sheet derived from ordered shots:

```ts
interface ProductionTimeline {
  durationSeconds: number;
  frameRate?: number;
  aspectRatio: string;
  language?: string;
  shots: ProductionTimelineShot[];
  audioCues: ProductionAudioCue[];
  captionCues: ProductionCaptionCue[];
  transitions: ProductionTransitionCue[];
  continuityRules: ProductionContinuityRule[];
  variants?: ProductionDeliveryVariant[];
}
```

Each shot should have:

- shotId,
- order,
- startTimeSeconds,
- endTimeSeconds,
- durationSeconds,
- clip output refs,
- selected take,
- trim in/out,
- transition in/out,
- caption/script refs,
- audio refs,
- continuity notes.

## Cue Sheet Requirements

Cue sheet should include:

- voiceover/dialogue lines with target timings,
- subtitle/caption timing,
- music bed start/end,
- sound effect cues,
- product reveal moments,
- product evidence refs for reveal/demo/review/packshot/CTA moments,
- CTA/end-card timing,
- shot transition notes,
- variant-specific safe-area notes.

The cue sheet should be visible in Production as a timeline/list and should be included in Storyboard Review and Video Edit handoff.

## Continuity Rules

Continuity checks should cover:

- character identity and wardrobe,
- product packaging/label/color,
- scene/location consistency,
- lighting/mood/color grade,
- camera direction and motion continuity,
- audio loudness/voice consistency,
- script/caption continuity,
- product claim consistency,
- product image role and fidelity consistency across product shots,
- customer journey stage progression.

The verifier should produce per-shot and cross-shot continuity warnings.

## Timeline Nodes

Add or support:

- `timeline_assembly`: compiles shot order, timings, clips, audio, captions, transitions, and variants.
- `transition_edit`: defines transition intent between shots.
- `continuity_check`: validates continuity across selected shots or the whole story.

## Handoff Requirements

Storyboard Review handoff receives:

- ordered shot list,
- shot cue metadata,
- generated clip/task refs,
- per-shot product evidence manifest,
- review questions and missing warnings.

Video Edit handoff receives:

- timeline order,
- clip refs,
- trim suggestions,
- audio refs,
- caption refs,
- transition cues,
- delivery variant instructions,
- selected take metadata.
- product packshot, claim, and CTA refs.

## Downstream Result Sync

Storyboard Review and Video Edit can create result records that Production can import back into the canvas.

```ts
interface ProductionDownstreamResultRecord {
  id: string;
  productionRunId: string;
  sourceSurface: "storyboard_review" | "video_edit";
  downstreamProjectId: string;
  downstreamTaskId?: string;
  sourceProductionSpaceVersion: number;
  changedShots: Array<{
    shotId: string;
    selectedTakeId?: string;
    order?: number;
    trimInSeconds?: number;
    trimOutSeconds?: number;
    captionPatch?: Record<string, unknown>;
    productQaDelta?: Record<string, unknown>;
    warningResolutionIds?: string[];
  }>;
  timelinePatch?: Record<string, unknown>;
  conflictPolicy:
    | "reject_locked_changes"
    | "require_user_confirmation"
    | "save_as_new_version";
  importOutcome?: "pending" | "imported" | "conflict" | "rejected";
}
```

Result sync should support:

- changed shot order,
- selected take changes,
- trim in/out changes,
- caption/script edits,
- transition edits,
- manual product fidelity approval,
- product warning resolution,
- rejected clip/take decisions,
- final render or edit project references.

Sync rules:

- Production imports result records as a new ProductionSpace version.
- Locked shots/nodes are not overwritten without confirmation.
- Timeline, selected output refs, cue sheet, and QA status update from downstream decisions.
- Product evidence refs remain immutable; downstream review can add review decisions but not rewrite source evidence.
- If downstream caption, CTA, claim, or product timing changes affect product truth, related verifier results become stale.
- Result records whose `sourceProductionSpaceVersion` is stale must import as conflicts or save-as-new-version, not overwrite current locked shot/node configs.

## Acceptance

- Total shot durations reconcile with project duration target or show warnings.
- Reordering shots updates timeline start/end times.
- Captions/subtitles align with script/audio timing.
- Video Edit handoff can reconstruct the ordered timeline.
- Continuity warnings can target neighboring shots or the entire sequence.
- Production can import Storyboard Review and Video Edit result records without losing locked node configs.
- Result record import preserves source surface, downstream project/task IDs, changed shots, product QA deltas, conflict policy, and import outcome.
