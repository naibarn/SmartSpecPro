# Grok Imagine Video 1.5 — Full Support Specification

Status: production integration specification  
Verified: 2026-09-01  
Provider: xAI  
Primary model: `grok-imagine-video-1.5`  
Companion edit/extend model: `grok-imagine-video`

## 1. Why Grok 1.5 needs a dedicated adapter

Grok Imagine Video 1.5 is not a generic “image + references” video API.

It exposes three distinct generation modes:

1. **Text-to-Video**
2. **Image-to-Video** — the supplied image is the literal starting frame
3. **Reference-to-Video** — reference images and/or voices guide the generated scene but do not lock the first frame

A production adapter must resolve these modes before request construction.

The most important provider rule is:

```text
START FRAME / IMAGE-TO-VIDEO
            XOR
REFERENCE-TO-VIDEO
```

Do not send a Start Frame together with `reference_images` or reference voices in the same Grok 1.5 generation request.

## 2. Current official limits

### Duration

```text
1–15 seconds
```

The `duration` parameter is directly controllable.

### Aspect ratios

```text
1:1
16:9
9:16
4:3
3:4
3:2
2:3
```

### Resolution

Text-to-Video:

```text
480p
720p
1080p
```

Image-to-Video:

```text
480p
720p
1080p
```

Reference-to-Video:

```text
480p
720p
```

Reference mode must never be advertised or requested as 1080p.

## 3. Start Frame / Image-to-Video

A supplied Start Frame is mapped to the xAI `image` input.

It may be provided to xAI as:
- public URL;
- base64 data URI;
- `file_id`.

### Start State rule

The image is treated by SmartAIHub as `State #0`.

The Grok prompt should say conceptually:

```text
Continue directly from the supplied starting image as literal frame 0.
Preserve all visible identities, product geometry, wardrobe, object position,
environment layout, lighting direction, framing and hand/object state.
Do not repeat actions that have already happened in the image.
```

### Aspect-ratio warning

xAI documents that Image-to-Video defaults to the source image aspect ratio, while explicitly setting a different `aspect_ratio` can stretch the image.

Production default:

```text
Start Frame
↓
target aspect mismatch?
│
├─ NO → submit normally
└─ YES
    ↓
    SmartAIHub normalize/crop/pad first
    ↓
    validated new Start Frame
    ↓
    Grok Image-to-Video
```

Do not rely on provider stretching for an authoritative Start Frame.

## 4. Reference-to-Video

Reference-to-Video is designed for:
- recurring character identity;
- product identity;
- clothing;
- venue/place identity;
- style;
- product placement;
- preset voice identity.

References do not define the literal first frame.

### Image reference limit

```text
maximum 7 reference images
```

Stable SmartAIHub prompt labels:

```text
<IMAGE_1>
<IMAGE_2>
...
<IMAGE_7>
```

Example:

```text
<IMAGE_1> = presenter identity
<IMAGE_2> = product geometry and visible branding
<IMAGE_3> = store/venue identity
```

### Voice references

Publicly documented reference-audio workflow uses preset `voice_id`.

```text
maximum 3 voices
```

Prompt labels:

```text
<AUDIO_0>
<AUDIO_1>
<AUDIO_2>
```

Example:

```text
<IMAGE_1> = presenter
<IMAGE_2> = product
<AUDIO_0> = presenter voice

The presenter from <IMAGE_1> holds the product from <IMAGE_2>,
speaks with the voice from <AUDIO_0>, and says exactly:
“...”
```

User-supplied custom voice/audio references are documented as available only to trusted partners on request.

SmartAIHub must fail closed unless entitlement is explicitly verified.

## 5. Start Frame + Reference Images

This is the most important SmartAIHub conflict case.

Example:

```text
Start Frame
+
Character Ref
+
Product Ref
```

xAI cannot accept the Start Frame image and `reference_images` in one 1.5 generation request.

Resolve with one of:

### A. `prefer_start_frame`

Use Image-to-Video.

Best when:
- frame 0 must match exactly;
- the required character/product already appears correctly in the Start Frame;
- supplementary references can be converted to descriptive locks.

Extra references become:
- identity descriptions;
- product descriptions;
- place descriptions;
- post-production sources.

### B. `prefer_references`

Use Reference-to-Video.

The original Start Frame becomes a soft reference image or descriptive guide.

Trade-off:

```text
identity/reference fidelity ↑
literal frame-0 guarantee ↓
```

### C. `prebake_start_frame`

Recommended when:
- Start Frame must remain authoritative;
- character/product/place references contain important information not yet present correctly in the Start Frame.

Flow:

```text
Original Start Frame
+
Character/Product/Place refs
↓
SmartAIHub image compositor / image model
↓
validated prebaked Start Frame
↓
Grok Image-to-Video
```

The video adapter must not submit until the prebaked frame exists.

### D. `split_generation`

Use separate stages when exact Start Frame and raw reference-to-video behavior are both mandatory.

### E. `block`

Use for strict workflows where no compromise is allowed.

## 6. Start Frame + Voice Reference

Reference voice belongs to Reference-to-Video mode, while Start Frame belongs to Image-to-Video.

Therefore the production controller must not assume both can be sent in one request.

Recommended options:
- Start Frame + native Grok speech without preset-voice lock;
- Start Frame + external TTS/lip-sync;
- Reference-to-Video + preset voice, accepting soft/non-literal frame 0;
- multi-stage workflow.

## 7. Video Reference

A SmartAIHub project may contain:

```text
motion reference video
camera reference video
source video
```

Grok 1.5 Reference-to-Video does **not** use these as `reference_images`.

Default SmartAIHub policy:

```text
reference video
↓
analyze motion / camera / rhythm
↓
derived prompt guidance
↓
Grok 1.5 generation
```

Alternative:
- route to another provider with raw video-reference capability;
- if the video is an edit/continuation source, use xAI companion `grok-imagine-video`.

Never silently discard a `must_use_raw` video reference.

## 8. Companion editing / extension model

Current official xAI edit/extend examples use:

```text
grok-imagine-video
```

not `grok-imagine-video-1.5`.

### Editing

- source video input;
- maximum input duration: 8.7s;
- no custom output duration/aspect/resolution;
- output follows source, capped at 720p.

### Extension

- source input: 2–15s;
- extension: 2–10s;
- aspect/resolution inherited from source;
- resolution capped at 720p;
- returned video includes source + appended continuation.

Do not call this “Grok 1.5 native extension”.

It is an xAI family handoff:

```text
grok-imagine-video-1.5
↓
generated source clip
↓
grok-imagine-video
↓
edit or extend
```

## 9. Long-form planning

For most advertisements longer than 15 seconds:

```text
independent 8/10/15s Grok 1.5 shots
↓
external edit
```

is preferred.

Benefits:
- individual repair;
- stronger product/place identity control;
- reference budget can change per shot;
- 1080p available in Start-Frame mode;
- easier UI/label compositing.

If continuity is more important:
- use the companion extension model only within its source-duration limits;
- otherwise create a new continuation shot from the last approved state/keyframe;
- perform Seam QC.

Do not assume unlimited native xAI extension chaining.

## 10. Audio

Generated Grok 1.5 videos include an audio track by default.

To request silence:

```json
{
  "generate_audio": false
}
```

For product commercials, default policy may keep native audio on when:
- dialogue is requested;
- environmental sound matters;
- sound-driven motion matters.

For silent demo, set it off explicitly.

## 11. Dialogue

No special dialogue markup is required by the public Grok video API.

SmartAIHub should compile explicit natural-language speaker instructions:

```text
The presenter from <IMAGE_1> uses the voice from <AUDIO_0>
and says exactly in Thai:
“...”
with precise visible lip sync.
```

Production QC:
- exact dialogue;
- speaker assignment;
- language intelligibility;
- lip sync;
- audio/video event sync.

If exact Thai dialogue fails:
- regenerate;
- external TTS/lip-sync;
- or voice-over fallback.

## 12. Reference ranking

When more than seven images exist, rank by shot-specific value.

Recommended order:

1. required on-screen character identity;
2. promoted product geometry/branding;
3. promoted place identity;
4. wardrobe/object identity;
5. required environment;
6. style;
7. optional inspiration.

Overflow references:
- derive to text;
- prebake into Start Frame;
- post-composite;
- move to another shot.

## 13. Product / Place use

### Product

Reference-to-Video is useful when:
- product must appear in a new scene;
- presenter and product both require image references.

Start-Frame mode is useful when:
- a pre-approved product composition already exists;
- exact beginning composition matters more than multiple raw references.

### Place

Venue/store reference images can map to:

```text
place_identity
venue_layout
visible_feature
place_atmosphere
signage
```

A Start Frame showing the venue remains an exact scene anchor.

If extra venue refs are necessary:
- prebake;
- switch to Reference-to-Video;
- or split shots.

## 14. Prompt strategy

### Start Frame prompt

Focus on:
- immediate continuation;
- current physical state;
- action chronology;
- camera evolution;
- dialogue;
- continuity.

Do not waste prompt budget restaging the still image.

### Reference-to-Video prompt

Explicitly bind references:

```text
Use <IMAGE_1> as the presenter identity.
Use <IMAGE_2> as the exact product geometry/visible branding reference.
Use <IMAGE_3> as the store identity and visible interior style.
```

Then describe the new composition/action.

## 15. QC

Grok-specific checks:
- Start Frame adherence;
- Start State continuity;
- reference-image identity retention;
- reference-to-subject binding correctness;
- product/place identity;
- hands and product interaction;
- native audio sync;
- exact dialogue;
- lip sync;
- reference resolution expectation;
- no provider-mode conflict;
- no stretched Start Frame.

## 16. Implementation files

```text
config/providers/grok-imagine-video-1.5.json
config/providers/grok-imagine-video.json
config/prompt-profiles/grok-imagine-video-1.5.json

adapters/grok_reference_planner.py
adapters/grok_prompt_compiler.py
adapters/grok_imagine_video_1_5.py

schemas/providers/grok-imagine-video-1.5/reference-plan.schema.json
schemas/providers/grok-imagine-video-1.5/prompt.schema.json
schemas/providers/grok-imagine-video-1.5/execution-plan.schema.json
```
