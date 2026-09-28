# Gap Review v9 — Wan 3.0 / FLUX 3 / Seedance 2.0 & 2.5 — 10 Rounds

Date: 2026-09-01  
Scope: Generic Commercial Video Director v9

This review focuses on upgrading Wan 3.0, FLUX 3 Video and Seedance 2.x to first-class provider families without regressing MiniMax H3, Grok Imagine Video 1.5, Omni or the generic Product/Place/Service/Narrative workflow.

---

## Round 1 — Existing coverage audit

### Finding

v8 did not have:
- Wan 3.0 provider profiles or adapter;
- first-class Seedance 2.0;
- provider-specific Seedance adapters/schemas;
- correct current public FLUX 3 keyframe semantics.

The prior FLUX and Seedance entries were insufficient for production routing.

### Fix

Added versioned first-class contracts:

```text
Wan 3.0
├─ wan3.0-video
└─ wan3.0-video-prime

FLUX 3
└─ flux-3-video

Seedance
├─ dreamina-seedance-2-0-260128
└─ dreamina-seedance-2-5-260628
```

Each family now has:
- capability profile;
- prompt profile;
- provider-specific schema;
- planner/compiler;
- adapter;
- UI preflight;
- tests;
- documentation.

---

## Round 2 — Wan hard-frame versus multimodal-reference exclusivity

### Finding

Wan supports both:
- `first_frame` / `last_frame`;
- `reference_image` / `reference_video` / `reference_audio` / file / link.

But these are mutually-exclusive raw request families.

### Risk

SmartAIHub frequently receives:

```text
Start Frame
+
Character Reference
+
Product Reference
+
Motion Video
+
Voice Audio
```

A generic adapter could construct an illegal mixed request.

### Fix

Added `WanReferencePlanner` and explicit policies:

```text
prefer_hard_frames
prefer_references
prebake_hard_frame
split_generation
block
```

Production defaults:
- hard frame + visual refs only → prebake;
- hard frame + must-use raw video/audio/document/web → split;
- reference-only workflow → keep refs raw.

No `must_use_raw` reference is silently discarded.

---

## Round 3 — Wan reference budget, duration and multi-shot audit

### Findings

Wan 3.0 has several independent boundaries:
- max 10 reference images;
- max 5 reference videos;
- total reference-video duration <=15s;
- max 5 reference audios;
- total reference-audio duration <=15s;
- max one file or one link;
- file and link cannot coexist;
- max 20 multimodal materials;
- output 2–30s;
- video-input duration + output duration <=30s.

### Risks

A request may pass media-count validation but still fail due to temporal constraints.

### Fix

Added:
- semantic quality-first reference ranking;
- count limits;
- media-duration validation;
- mandatory video-duration metadata before paid submission;
- `input video + output <=30s` preflight;
- file/link exclusivity;
- smart-duration warning path;
- native timestamped multi-shot compiler.

Wan can now use a 20–30s one-pass commercial narrative without falsely applying an Omni-style unbounded extension model.

---

## Round 4 — FLUX 3 keyframe semantics correction

### Finding

The current public FLUX 3 API does **not** expose generic soft Omni Reference as the primary public reference contract.

Its I2V image inputs are **literal pinned frames in the video timeline**.

### Risk

A generic system might pass:
- portrait;
- product packshot;
- venue photo;

as FLUX `keyframes` merely because they are image references.

That would force those images to become literal timeline frames and corrupt shot composition.

### Fix

Added `FluxKeyframePlanner`.

It separates:

```text
literal timeline keyframe
vs
generic identity/product/place/style reference
```

Soft/generic references use:

```text
prebake_keyframe
derive_to_prompt
fallback_provider
block
```

Production default:
`prebake_keyframe`.

This is the most important FLUX 3 correction in v9.

---

## Round 5 — FLUX continuation, draft and upscale audit

### Findings

Current FLUX 3 supports:
- T2V;
- I2V with up to ten timed keyframes;
- V2V continuation;
- native synchronized audio;
- multiple scenes/camera angles;
- draft generation;
- `draft_enhance`;
- separate video upscale.

V2V is short-context continuation, not generic motion-reference transfer.

### Fix

Added:
- `start_video` continuation route;
- arbitrary motion/camera video → derive/fallback unless it is the actual continuation source;
- <=4s continuation-tail policy;
- external long-form assembly;
- Seam QC;
- `draft=true → choose → draft_cache → draft_enhance`;
- post-upscale preservation QC.

The Skill does not invent H3-style timestamp syntax for FLUX native multi-scene generation.

---

## Round 6 — Seedance 2.0 versus 2.5 capability split

### Finding

Treating Seedance 2.0 and 2.5 as one interchangeable capability profile is unsafe.

### Fix

Separated model truth.

Seedance 2.0:

```text
4–15s
480p / 720p / 1080p / 4K
9 image refs
3 video refs
3 audio refs
audio-only ref: NO
```

Seedance 2.5:

```text
4–30s
480p / 720p
30 image refs
10 video refs
10 audio refs
audio-only ref: YES
enhanced motion / clay / creative refs
multi-round extension
```

Routing now validates the actual selected model instead of inheriting a family-wide superset.

---

## Round 7 — Seedance resolution, audio-only and real-human material audit

### Findings

Three production traps existed:

1. Seedance 2.0 does not support audio-only reference.
2. Seedance 2.0 1080p cannot be used in reference-image scenarios.
3. BytePlus real-human image/video references require approved LAS material-library handling.

### Fix

Added:
- audio-only legality check;
- model/mode-specific resolution validation;
- `providerHints.byteplus.containsRealHumanFace`;
- `materialLibraryAssetId`;
- `materialLibraryApproved`;
- provider preflight and UI warning;
- adapter conversion to `asset://<ASSET_ID>`.

A paid BytePlus job is blocked before submission when a required real-human material-library asset is missing.

---

## Round 8 — Seedance hard-frame + multimodal-reference ambiguity

### Finding

Current BytePlus documentation clearly exposes:
- first frame;
- first + last frame;
- multimodal image/video/audio reference;

but does not establish a universal direct-mix contract for hard frame roles plus arbitrary raw multimodal reference roles in every endpoint configuration.

### Risk

The Skill could overclaim support and submit an undocumented combination.

### Fix

Fail closed by default:

```text
directHardFrameReferenceMixVerified = false
```

Policies:

```text
prefer_hard_frames
prefer_references
prebake_hard_frame
split_generation
block
```

A connector verified against a compatible endpoint may explicitly set:

```text
provider_verified_mix
```

This keeps provider uncertainty in configuration rather than embedding assumptions in the Agent.

---

## Round 9 — Long-form and extension semantics audit

### Finding

Wan, FLUX and Seedance all have continuation/edit features, but they are not the same temporal primitive.

### Fix

The Skill now distinguishes:

### Wan 3.0

Bounded video edit/extension under:

```text
input video + output <=30s
```

No automatic unlimited chain.

### FLUX 3

New standalone V2V segments from short audiovisual continuation context.

```text
<=4s tail
→ new 5–15s segment
→ external assembly
```

### Seedance 2.0

Extension exists, but no unlimited deterministic chain is assumed.

### Seedance 2.5

Current conservative automatic contract:

```text
Base <=30s
+ Extension #1 <=30s
+ Extension #2 <=30s
```

The generic temporal planner gained:

`plan_bounded_reference_continuation_chain()`.

It can enforce:
- segment min/max;
- reference-tail min/max;
- maximum number of continuation segments;
- exact versus bounded target duration.

---

## Round 10 — Regression, schema and backward-compatibility audit

### Checked

- input/output/UI schema validity;
- existing product/place/service/narrative fixtures;
- H3 provider schemas/tests;
- Grok 1.5 schemas/tests;
- Wan provider schemas/tests;
- FLUX provider schemas/tests;
- Seedance provider schemas/tests;
- Python compilation;
- generic temporal planning;
- provider-specific reference legality;
- versioned provider capability profiles.

### Expected regression gates

```text
MiniMax H3 regression
Grok Imagine Video 1.5 regression
Wan 3.0 regression
FLUX 3 regression
Seedance 2.0/2.5 regression
```

### Final design rule

The Agent never owns provider truth.

Provider truth lives in:

```text
config/providers/
schemas/providers/
adapters/
```

The Agent may choose a strategy, but application code validates:
- model/version;
- duration;
- resolution;
- reference budget;
- reference semantics;
- hard-frame conflicts;
- extension primitive;
- material authorization;
- paid-job approval/idempotency.

---

# Final coverage after v9

## Wan 3.0

```text
✓ T2V
✓ Start Frame
✓ First + Last Frame
✓ Raw image refs
✓ Raw video/motion refs
✓ Raw audio/voice refs
✓ Document/web context
✓ Native audio/dialogue
✓ Native timestamped multi-shot
✓ Video edit
✓ Bounded extension
✓ 2–30s
✓ 480P / 720P / 1080P
```

## FLUX 3

```text
✓ T2V
✓ Literal Start Frame
✓ First + Last / timed keyframes
✓ Up to 10 keyframes
✓ V2V continuation
✓ Native audio/dialogue
✓ Multi-scene generation
✓ Draft → Enhance
✓ Optional upscale path
△ Generic soft identity/product/place refs → prebake/derive/fallback
△ Arbitrary motion video → derive/fallback unless actual start_video
✗ Current public arbitrary audio-reference input
```

## Seedance 2.0

```text
✓ T2V
✓ Start Frame
✓ First + Last
✓ Raw image/video/audio refs
✓ Native audio
✓ Edit/extend
✓ 4–15s
✓ up to 4K
✗ Audio-only reference
△ 1080p + image-reference mode
△ Hard frame + raw multimodal direct mix → fail-closed unless verified
```

## Seedance 2.5

```text
✓ T2V
✓ Start Frame
✓ First + Last
✓ up to 30 image refs
✓ up to 10 video refs
✓ up to 10 audio refs
✓ Audio-only reference
✓ Motion/camera/creative refs
✓ Clay/white-model control
✓ Timestamp editing
✓ Native audio/lipsync
✓ 4–30s
✓ multi-round extension
△ Current automatic chain capped conservatively at two extension turns
△ Hard frame + raw multimodal direct mix → fail-closed unless verified
```
