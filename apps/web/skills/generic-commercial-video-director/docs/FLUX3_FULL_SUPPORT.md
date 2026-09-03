# FLUX 3 Video Full Support — SmartAIHub Generic Commercial Video Director v9

Status: production integration specification  
Verified: 2026-09-01  
Provider: Black Forest Labs  
Model: `flux-3-video`

## 1. Critical semantic rule

The most important correction in v9:

> Current public FLUX 3 I2V images are **literal pinned frames of the generated clip**, not generic soft identity/style references.

This means:

```text
Character portrait
Product packshot
Venue photo
```

must NOT automatically be passed as ordinary FLUX I2V media unless the project actually wants those exact images to become frames in the timeline.

## 2. Current modes

```text
t2v
i2v
v2v
draft_enhance
```

### T2V
Prompt-only video.

### I2V
Uses `keyframes`.

### V2V
Uses `start_video` and continues its audiovisual state.

### Draft Enhance
Uses `draft_cache` from an approved draft to reproduce that chosen take at full quality.

## 3. Duration / resolution

T2V / I2V:

```text
5–20s
```

V2V continuation:

```text
5–15s output
```

Resolution:

```text
hd
fhd
```

24 fps, native audio.

FHD is finished through BFL's video upsampler.

## 4. Keyframes

One image:

```text
keyframes = image
```

means exact Start Frame.

Two timed images:

```text
[[0, first], [8, last]]
```

pin exact first and last moments.

Up to 10 keyframes may be used:

```text
0s
3s
6s
10s
...
```

These are not soft references. They are timeline states.

## 5. Character / product / place reference images

Current public FLUX 3 documentation says Omni Reference with images/videos is a future capability.

Therefore SmartAIHub default is:

```text
Character/Product/Place refs
↓
prebake_references_to_keyframes
↓
create approved shot keyframe
↓
FLUX i2v
```

Alternatives:

```text
derive_to_prompt
fallback_provider
block
```

A `must_use_raw` generic identity/product reference must not be silently downgraded.

## 6. Motion/video references

Current public V2V is a continuation path:

```text
existing clip
↓
start_video
↓
new continuation
```

It is not a generic arbitrary motion-reference bundle.

For a SmartAIHub `motion_reference`:
- derive motion/camera guidance; or
- route Wan/H3/Seedance; or
- use V2V only if the clip is genuinely the continuation source.

## 7. V2V context

Official launch documentation describes up to about four seconds of existing video/audio context.

SmartAIHub therefore extracts/uses a short approved continuity tail:

```text
previous segment
↓
last <=4s audiovisual tail
↓
FLUX v2v
↓
5–15s new continuation
↓
Seam QC
↓
external assembly
```

## 8. Native audio / dialogue

FLUX 3 generates:
- multilingual dialogue;
- effects;
- ambience;
- audio synchronized with the frames.

Dialogue remains exact-text constrained in SmartAIHub and must pass ASR/lip-sync QC.

## 9. Multi-shot

FLUX can generate multiple scenes and camera angles in one clip.

However the public contract does not expose H3-style timed `[Shot N] At ...` syntax.

SmartAIHub therefore:
- allows ordered native scene progression;
- does not claim precise provider-native cut timestamps;
- uses hard timed keyframes when exact visual moments matter.

## 10. Draft workflow

Recommended production route:

```text
draft=true
↓
fast/cheap preview
↓
QC / choose take
↓
download draft_cache
↓
draft_enhance
↓
same selected take at full quality
```

This is valuable for expensive commercial experimentation because a fresh full render may reinterpret the shot, while enhance preserves the chosen draft.

## 11. Exact text / typography

BFL states strong typography capability, but brand-critical:
- model name;
- legal text;
- price;
- CTA;
- UI

still requires SmartAIHub exact-text QC and may be post-composited.

## 12. Upscale

A separate FLUX Video Upscale tool can take final video toward 2K/4K.

Run:
- content QC;
- dialogue QC;
- keyframe QC

before expensive upscale.

## 13. Production recommendations

### Exact Start Frame
Use direct I2V keyframe at 0.

### Exact Start + End
Use two timed keyframes.

### Product packshot reference + presenter
Prebake an integrated presenter/product shot keyframe first.

### Motion-reference-heavy ad
Prefer Wan/H3/Seedance if raw motion reference is mandatory; otherwise derive the motion into FLUX prompt.

### Long sequence
Generate independent clips or FLUX V2V continuation segments with <=4s continuity context and external assembly.

## 14. Files

```text
config/providers/flux-3-video.json
config/prompt-profiles/flux-3-video.json
adapters/flux3_reference_planner.py
adapters/flux3_prompt_compiler.py
adapters/flux3.py
schemas/providers/flux-3-video/
tests/test_flux3.py
```
