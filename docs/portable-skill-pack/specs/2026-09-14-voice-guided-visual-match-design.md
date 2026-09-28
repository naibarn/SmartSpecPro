# Voice-guided visual matching for Media Workspace

## Status

Design draft for review. No runtime or UI implementation is included in this document.

## Problem

Media Workspace can already create subtitle clips from a voice track, but the
transcript is not currently used as the timing and meaning source for image
clips. A sequence of still images can therefore remain on arbitrary durations
or show an image that does not match the sentence being spoken.

The desired workflow is:

1. Transcribe the voice with the existing HyperFrames transcription runtime.
2. Preserve reliable segment and word timestamps.
3. Ask the existing vision skill to describe each candidate image.
4. Match spoken content to images and derive image boundaries from the voice
   timeline.
5. Preview the proposed visual order and timing before changing the project.

When a high-confidence match requires a different image order, the system may
propose that reorder automatically. The user must approve it in Preview.

## Existing seams

- `AutoSubtitleModal` invokes `worker_app_transcribe_audio`.
- The Worker App normalizes HyperFrames/Whisper output to
  `audio-transcript.v1`, including `segments`, optional `words`,
  `startMs`/`endMs`, `timingOrigin`, and `wordTimingCoverage`.
- The current subtitle UI leaves `wordTimestamps` disabled by default and only
  writes subtitle clips to the T1 track.
- Images and videos are represented by `NleClip` values on `video_broll` or
  `video_main`; local clips use `sourcePath` and library clips use
  `sourceUrl`/library references.
- The server skill/vision path accepts image URLs or image data after the
  existing authorization and media-reference resolution checks. A local
  desktop path must never be sent to a provider as an untrusted raw path.
- The existing local Gemma image command is registered in the Tauri shell, not
  in the Worker App command surface. The Worker App must not assume that local
  adapter is already available; the server vision/skill adapter remains the
  current default until a Worker App adapter is explicitly added and tested.

## Goals

- Make the verified transcript the source of truth for spoken timing.
- Analyze each candidate image independently and cache the result by a stable
  asset fingerprint plus analyzer/model revision.
- Produce deterministic, inspectable visual matches with a confidence score and
  reasons.
- Keep voice/audio timing fixed while deriving image clip boundaries from the
  spoken timeline.
- Offer high-confidence reorder proposals in a Preview screen and require an
  explicit confirmation before applying them.
- Preserve the original project state so the operation is undoable and can be
  retried without re-transcribing or re-analyzing unchanged assets.
- Fail closed when timing, asset ownership, vision analysis, or match confidence
  is insufficient.

## Non-goals

- Do not replace HyperFrames or add a second transcription engine.
- Do not let an LLM directly mutate the NLE timeline or return authoritative
  timestamps.
- Do not change the voice track, remove dead air, or regenerate audio as part
  of visual matching.
- Do not silently reorder low-confidence images.
- Do not expose local filesystem paths, provider credentials, signed URLs, or
  unrestricted image payloads to a skill.
- Do not require every image to be uploaded to the cloud when a permitted local
  vision runtime is available.

## Recommended architecture

```text
voice track
   │
   ├─ HyperFrames/Whisper transcription (word timestamps required)
   │       └─ canonical transcript segments + words
   │
   ├─ image asset resolver
   │       └─ authorized local staging or managed media URL
   │
   ├─ one vision analysis per image
   │       └─ caption, subjects, actions, setting, objects, OCR, keywords
   │
   └─ deterministic visual matcher
           └─ ordered visual plan + confidence + review flags
                         │
                   Preview / Confirm
                         │
                guarded NLE project update
```

The matcher, not the vision model, owns timeline math. The model supplies
descriptive evidence only.

## Transcript contract

The visual workflow must request word timestamps even when the user is not
exporting word-highlight subtitles. It must reject or downgrade to manual
review when the normalized transcript reports incomplete timing coverage.

Each usable utterance contains:

```ts
type VisualUtterance = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  words: Array<{ word: string; startMs: number; endMs: number }>;
  speakerId?: string | null;
};
```

Segment boundaries remain the primary cut candidates. Word timings are used to
split an unusually long segment at sentence or clause boundaries and to avoid
cutting through a spoken phrase. All times are integer milliseconds, monotonic,
bounded by the voice source duration, and validated before matching.

### Voice source and time mapping

The workflow must identify the actual selected voice source before
transcription. If A1 is detached or assembled from trimmed clips, the source
resolver creates a time map from source-media time to project timeline time.
Transcribing the original video and copying timestamps directly into an edited
timeline is invalid when dead-air removal or clip trims changed the timeline.

The resolver records the source clip IDs, source fingerprints, trim ranges, and
timeline offsets in the transcript fingerprint. A transcript is reusable only
when that map and the source revision still match the current project.

## Image analysis contract

Each candidate image produces a bounded record:

```ts
type VisualAssetAnalysis = {
  assetId: string;
  sourceFingerprint: string;
  analyzer: "vision_skill" | "local_vision";
  modelRevision: string;
  shortCaption: string;
  detailedCaption: string;
  subjects: string[];
  actions: string[];
  setting: string[];
  objects: string[];
  ocrText?: string;
  keywords: string[];
  safetyStatus: "approved" | "review" | "blocked";
};
```

The existing server vision/skill path is the default analysis adapter for
managed or authorized URLs. Local files are staged through an approved upload
or local vision adapter; their raw path is never placed in a skill prompt.
Analysis is idempotent by `(assetId, sourceFingerprint, analyzer, modelRevision)`.

## Matching algorithm

The initial matcher is deterministic and explainable:

1. Normalize Thai/English text, remove punctuation, and preserve named entities
   and meaningful numerals.
2. Build a text representation for each utterance and each image from captions,
   subjects, actions, setting, objects, OCR, and keywords.
3. Calculate a bounded score from semantic similarity, keyword/entity overlap,
   action compatibility, and optional OCR overlap. If a compatible embedding
   service is unavailable, fall back to the deterministic lexical score and
   lower the confidence rather than inventing a semantic score.
4. Apply sequence constraints. The default path preserves the existing image
   order and chooses the best compatible contiguous assignment.
5. Evaluate an alternate order only when it improves the global score by a
   configured margin and every moved image meets the high-confidence threshold.
6. Reject reuse of an image unless the project explicitly allows repetition.
7. Convert the selected utterance ranges into contiguous image windows. A
   boundary may move only to a validated segment/clause boundary and must obey
   minimum and maximum still-image durations.
8. Produce a plan containing each match, score components, chosen order,
   proposed start/end times, and unresolved review items.

The plan never changes the audio timeline. If speech contains a gap with no
usable utterance, the policy is configurable: hold the preceding image, use a
neutral fallback image, or mark the gap for manual review. The default is to
hold the preceding approved image and show a review note when the gap exceeds
the configured threshold.

## Reorder policy

- Existing order is the default and is always available as a fallback.
- A reorder proposal is shown only if the global score improves by the
  high-confidence margin and no candidate falls below the minimum confidence.
- The Preview shows before/after order, affected time windows, score/reason,
  and any image that was reused or left unmatched.
- The user must explicitly choose **Apply reordered plan**. Closing Preview,
  choosing the original order, or rejecting the plan leaves the project
  unchanged.
- Low-confidence or ambiguous matches remain in their original order and are
  marked for manual placement.

## Project update and undo

Applying a plan creates a new project revision in memory and records:

- transcript fingerprint and normalizer revision;
- analysis fingerprints and model revisions;
- matcher revision and policy settings;
- original clip order/timing for affected clips;
- selected order, match scores, and review decisions.

Only eligible image clips on the selected visual track are updated. Voice and
subtitle clips are not rewritten by the visual apply operation. The update must
be reversible through the existing project undo/revision mechanism or a saved
pre-apply snapshot. Re-running with the same fingerprints and matcher revision
must produce the same plan.

## Preview experience

The Preview needs to show:

- transcript utterance with start/end time;
- selected image and its caption;
- confidence score and score reasons;
- old versus proposed image order;
- old versus proposed image start/end time;
- warnings for low confidence, missing analysis, unsafe asset, long silence, or
  a boundary that could not be placed cleanly.

The primary actions are **Apply original order**, **Apply reordered plan** when
available, and **Cancel**. No provider call or credit-consuming action occurs
during Preview or apply.

If the plan starts with a gap and no preceding approved image exists, the gap
is marked for manual placement instead of extending an arbitrary clip.

## Failure and safety behavior

- Missing or invalid transcript timing: stop before changing the project.
- Partial vision analysis: show unresolved images and allow manual-only apply;
  never invent a caption.
- Vision provider unavailable: retain the canonical transcript and leave the
  project unchanged.
- Unsafe/blocked image: exclude it from automatic matching and require manual
  handling according to existing media safety policy.
- Ambiguous score or conflicting order: choose the original order, mark review,
  and do not silently move the image.
- Source file changed after analysis: invalidate that analysis by fingerprint
  and require re-analysis.
- Apply failure: keep the original project revision and report a bounded error.

## Verification plan

Focused tests must cover:

- HyperFrames results with complete, partial, missing, and out-of-range word
  timestamps;
- deterministic normalization and transcript fingerprinting;
- image-analysis cache hits, source changes, blocked assets, and provider
  failures;
- score calculation, ordered matching, high-confidence reorder thresholds,
  duplicate-image policy, and tie handling;
- exact coverage of the voice span without gaps or overlaps in the generated
  image windows;
- preview apply/cancel, original-order fallback, undo/revision preservation,
  and idempotent re-run;
- local-path redaction and authorized media-reference handling;
- regression coverage proving the audio track and existing subtitle clips are
  unchanged by visual-plan apply.

## Rollout

Ship behind a Worker App feature flag. First enable transcript-only validation
and analysis/plan preview without applying changes. Then enable apply for a
small canary of image-only B-roll projects. Keep the original-order fallback
and the pre-apply snapshot for rollback. Production readiness requires real
vision-provider/local-runtime evidence, not only mocked skill responses.
