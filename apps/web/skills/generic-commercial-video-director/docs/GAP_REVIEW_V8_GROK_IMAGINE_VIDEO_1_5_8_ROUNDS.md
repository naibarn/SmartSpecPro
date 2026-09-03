# Gap Review v8 — Grok Imagine Video 1.5 — 8 Rounds

Date: 2026-09-01  
Scope: Generic Commercial Video Director v8  
Provider: xAI  
Primary model: `grok-imagine-video-1.5`

## Round 1 — Existing Skill coverage audit

### Finding

v7 had no Grok/xAI provider profile, adapter, schema or regression test.

A repository-wide search for:

```text
grok
imagine
xai
```

found no Grok implementation.

### Risk

The generic router could not safely know:
- whether Start Frame was supported;
- whether reference images were supported;
- duration/resolution limits;
- audio behavior;
- incompatible modes.

### Fix

Added first-class:
- provider profile;
- prompt profile;
- reference planner;
- API adapter;
- provider schemas;
- UI settings;
- tests;
- documentation.

---

## Round 2 — Start Frame vs Reference-to-Video mode audit

### Finding

xAI documents separate modes:

```text
Image-to-Video
Reference-to-Video
```

and a Start Frame image must not be mixed with Reference-to-Video inputs in one Grok 1.5 request.

### Risk

SmartAIHub commonly has:

```text
Start Frame
Character Reference
Product Reference
Venue Reference
```

A naive adapter would send all assets and receive a provider error or use the wrong mode.

### Fix

Added `GrokReferencePlanner` and:

```text
startReferenceConflictPolicy
```

with:
- prefer_start_frame;
- prefer_references;
- prebake_start_frame;
- split_generation;
- block.

`prebake_start_frame` is a true dependency. The video adapter refuses to submit until the new validated Start Frame exists.

---

## Round 3 — Reference budget and semantic-binding audit

### Finding

Reference-to-Video accepts up to seven image references.

### Risks

- too many assets;
- wrong character/product mapping;
- inconsistent numbering;
- optional inspiration displacing required identity references.

### Fix

Added:
- max-7 validation;
- quality-first ranking;
- source-of-truth and must-use-raw priority;
- overflow derivation or strict blocking;
- official Grok labels:

```text
<IMAGE_1> ... <IMAGE_7>
```

Reference semantics retain:
- character identity;
- product geometry/label;
- place identity/layout;
- environment/style.

---

## Round 4 — Audio / voice reference audit

### Finding

Grok 1.5 supports up to three preset voice references in Reference-to-Video:

```text
<AUDIO_0> ... <AUDIO_2>
```

User-supplied custom audio/voice references are available only under trusted-partner access.

### Risks

- pretending any uploaded SmartAIHub audio can be sent directly;
- inventing undocumented REST request shapes;
- combining Start Frame and reference voice mode;
- using a reference voice while requesting silent output.

### Fix

Added:
- preset voice mapping;
- `customVoicePolicy`;
- entitlement flag;
- fail-closed connector requirement for custom audio;
- external TTS/lip-sync fallback;
- rejection of reference voice + `generate_audio=false`;
- Start Frame + voice conflict handling.

---

## Round 5 — SmartAIHub video-reference audit

### Finding

SmartAIHub supports raw video reference assets, but Grok 1.5 Reference-to-Video is an image/voice reference workflow, not a raw motion-video reference workflow.

### Risk

A generic reference adapter could incorrectly map:

```text
motion_reference.mp4
```

to Grok reference inputs.

### Fix

Added:

```text
videoReferencePolicy
```

Modes:
- derive_to_prompt;
- fallback_provider;
- block.

Default:
- analyze motion;
- analyze camera;
- convert to structured prompt guidance.

`must_use_raw` is never silently discarded.

Source video editing/continuation routes to the companion xAI workflow when appropriate.

---

## Round 6 — Resolution / aspect / Start Frame integrity audit

### Findings

Grok 1.5:
- T2V / I2V can reach 1080p;
- Reference-to-Video is capped at 720p;
- Image-to-Video defaults to source aspect;
- forcing another aspect may stretch the source image.

### Risks

- requesting 1080p Reference-to-Video;
- damaging exact Start Frame composition by provider stretching;
- advertising the wrong capability to users.

### Fix

Added:
- per-mode resolution validation;
- auto resolution policy;
- `startFrameAspectPolicy`;
- production default `normalize_before_generation`;
- Start Frame aspect preflight UI;
- regression checks for 1080p I2V and 720p Ref2V.

---

## Round 7 — Edit / extension model-family audit

### Finding

Current xAI official edit/extension examples use:

```text
grok-imagine-video
```

rather than `grok-imagine-video-1.5`.

Extension source and output constraints also prevent treating it as an unlimited multi-turn chain.

### Risks

- incorrectly claiming Grok 1.5 has native extension;
- routing extension to the wrong model ID;
- using generic multi-turn extension planning beyond the source-duration limit.

### Fix

Added separate companion profile:

```text
grok-imagine-video
```

and adapter functions for:
- edit;
- extension.

Extension profile records:
- source 2–15s;
- add 2–10s;
- max one provider extension turn in the normal chain planner.

Added `plan_single_extension()` and `multi_turn_native_append_ready()` so SmartAIHub cannot confuse this with Omni-style multi-turn extension.

---

## Round 8 — End Frame / async / schema / regression audit

### Findings

Grok 1.5 does not document hard Last Frame / first+last interpolation.

Video generation is asynchronous.

### Risks

- treating End Frame as supported hard anchor;
- silently ignoring an End Frame;
- inconsistent request status handling;
- incomplete provider contracts.

### Fix

Added:
- hard End Frame unsupported handling;
- soft end-state derivation when optional;
- block/fallback when End Frame is `must_use_raw`;
- xAI request polling URL normalization;
- `done / failed / expired` response normalization;
- provider-specific reference/prompt/execution schemas;
- new input/UI provider options;
- Grok-specific QC;
- regression suite.

## Final result

v8 supports Grok Imagine Video 1.5 as a first-class provider for:

```text
Text-to-Video
Start Frame / Image-to-Video
Reference-to-Video
Reference image identity/product/place workflows
Preset voice reference
Native audio
1–15s direct generation
1080p T2V/I2V
720p reference mode
```

with correct conflict handling for:

```text
Start Frame + Reference Images
Start Frame + Reference Voice
Video Reference
Custom Voice Reference
End Frame
Reference Budget >7
Reference mode + 1080p
```

and separate, correctly named xAI family routing for edit/extend.
