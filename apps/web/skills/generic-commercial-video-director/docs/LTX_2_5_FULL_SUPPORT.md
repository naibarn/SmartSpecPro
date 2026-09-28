# LTX 2.5 Full Support — SmartAIHub Generic Commercial Video Director v10

Status: production integration specification  
Verified: 2026-09-01  
Cloud provider: LTX API  
Open-source provider: Lightricks / LTX-2.5

Cloud models:

```text
ltx-2-5-fast
ltx-2-5-pro
```

Local/open model:

```text
Lightricks/LTX-2.5
```

## 1. Why v10 separates Cloud and Local

LTX-2.5 has two materially different execution surfaces.

### Official LTX Cloud API

Current 2.5 cloud variants support:

```text
Text-to-Video
Image-to-Video
Audio-to-Video
First Frame
First + Last Frame
Native Audio
Native Multi-shot
Camera Motion
Automatic Duration
Sync API
Async API
```

But the current LTX-2.5 model matrix does **not** support its generic Retake, Extend or Reframe endpoints.
Those endpoints exist in the overall LTX API family for other supported model versions, so SmartAIHub must not merge family capabilities into the 2.5 profile.

### LTX-2.5 Open Source / Local

Official local execution supports:

```text
ComfyUI
Python / ltx-pipelines
T2V
I2V
First/Last Frame
Native Audio
Native Multi-shot
Prompt Enhancer
LoRA
IC-LoRA / advanced controls
```

Advanced raw reference, transformation and extension behaviors are **workflow-dependent** and require a verified local pipeline/IC-LoRA workflow.

---

# 2. Cloud model matrix

## ltx-2-5-fast

Designed for speed/cost and longer/high-resolution generation.

### 720p / 1080p at 24 or 25 fps

```text
6 / 8 / 10 / 12 / 14 / 16 / 18 / 20s
```

### 720p / 1080p at 48 or 50 fps

```text
6 / 8 / 10s
```

### 1440p / 4K at 24 / 25 / 48 / 50 fps

```text
6 / 8 / 10s
```

Resolutions:

```text
1280x720
720x1280
1920x1080
1080x1920
2560x1440
1440x2560
3840x2160
2160x3840
```

## ltx-2-5-pro

Higher-fidelity variant.

Resolutions:

```text
720p
1080p
```

FPS:

```text
24
25
50
```

Durations:

```text
6 / 8 / 10s
```

SmartAIHub auto-routing recommendation:

```text
quality + <=10s + <=1080p
→ Pro

>10s or 1440p/4K
→ Fast
```

---

# 3. Start Frame

LTX cloud I2V uses:

```text
image_uri
```

as the literal first frame.

SmartAIHub maps:

```text
role = start_frame
→ State #0
→ image_uri
```

Prompt rule:

```text
Continue directly from the supplied first frame.
Do not replay actions already completed in the image.
```

Lock:

- character identity;
- product state;
- hand/object occupancy;
- wardrobe;
- scene layout;
- lighting;
- camera framing.

---

# 4. First + Last Frame

Cloud Image-to-Video accepts:

```text
image_uri
last_frame_uri
```

and interpolates between them.

This is first-class in SmartAIHub:

```text
Start Frame
+
End Frame
↓
first_last_to_video
```

Important:

```text
last_frame_uri
requires
image_uri
```

and:

```text
last_frame_uri
+
automatic duration
= INVALID
```

A fixed final state requires known clip duration.

---

# 5. Automatic Duration

For Cloud T2V/I2V:

```json
{
  "duration": null
}
```

lets LTX choose the clip length from the prompt.

The result remains within the maximum legal duration for the chosen model/resolution/FPS.

Recommended use:

- exploratory creative shots;
- prose-style multi-shot ideas;
- actions where exact platform slot length is not required.

Avoid when:

- exact 8/10/15/20-second advertising slot is required;
- Last Frame is present;
- dialogue timing is externally locked;
- audio soundtrack determines duration.

---

# 6. Audio-to-Video is an exact soundtrack mode

This is a critical semantic distinction.

LTX cloud A2V accepts one:

```text
audio_uri
```

That audio is the **actual soundtrack and timing driver**.

It is not equivalent to:

```text
voice identity embedding
style reference
music inspiration reference
```

SmartAIHub therefore requires an explicit:

```text
audioDriverAssetId
```

or:

```text
providerHints.ltx.useAsAudioDriver = true
```

### A2V can also use

```text
optional image_uri
optional last_frame_uri
prompt
camera_motion
```

Last Frame still requires First Frame.

### Audio duration limits

`ltx-2-5-fast`:

```text
720p / 1080p → up to 20s
1440p / 4K  → up to 10s
```

`ltx-2-5-pro`:

```text
720p / 1080p → up to 10s
```

SmartAIHub requires input audio duration metadata before paid A2V submission.

---

# 7. Native Audio

T2V and I2V generate synchronized:

- dialogue;
- music;
- ambience;
- sound effects.

Cloud requests may use:

```json
{
  "generate_audio": false
}
```

for silent clips.

A2V is different: the supplied audio is already the soundtrack.

Production QC should still verify:

```text
Dialogue Exactness
ASR
Lip Sync
Audio Event Sync
Music Continuity
Cut Continuity
```

---

# 8. Camera Motion

Verified cloud values:

```text
dolly_in
dolly_out
dolly_left
dolly_right
jib_up
jib_down
static
focus_shift
```

SmartAIHub can keep camera direction in both:

- structured Visual Design;
- provider `camera_motion` when an exact supported primitive applies.

Do not force a provider enum when the creative camera move is more complex; describe it in the prompt instead.

---

# 9. Native Multi-shot

LTX-2.5 supports native connected multi-shot scenes while maintaining continuity across cuts.

Official prompting guidance is important:

> Write multi-shot scenes as chronological prose with explicit edit transitions.

Do **not** compile the final provider prompt as a screenplay-like numbered shot list.

SmartAIHub therefore converts an approved structured Shot Plan into prose such as:

```text
The presenter lifts the bottle and demonstrates the dispenser while the camera slowly pushes closer.
A hard cut transitions to a close view of her hand applying the product; the same music and room ambience continue across the cut.
A match cut connects to the same presenter in a medium beauty shot, with the product still in her right hand and the same wardrobe and lighting.
```

At every cut, preserve explicitly:

- recurring subject identity;
- product state;
- wardrobe;
- environment;
- lighting;
- voice;
- music/ambience continuity.

---

# 10. Generic character/product/place references — Cloud

LTX-2.5 Cloud does not currently expose an arbitrary multi-image soft-reference bundle analogous to Seedance/Wan reference arrays.

Therefore this is unsafe:

```text
Character Portrait
Product Packshot
Venue Reference
↓
pretend they are generic LTX cloud reference_images
```

SmartAIHub strategies:

```text
prebake_start_frame

derive_to_prompt

local_ic_lora

fallback_provider

block
```

Production default for visual identity references:

```text
Character/Product/Place refs
↓
Generate / composite approved Start Frame
↓
Identity + Product + Scene QC
↓
LTX I2V
```

This is particularly appropriate for product commercials because it converts multiple semantic references into one exact visual State #0.

---

# 11. Raw Video Reference — Cloud

Cloud LTX-2.5 has no generic raw motion/video-reference input.

For:

```text
motion_reference.mp4
camera_reference.mp4
```

use one of:

```text
analyze → motion/camera prompt guidance
verified Local IC-LoRA workflow
fallback provider (Wan / H3 / Seedance etc.)
block when must_use_raw
```

Never silently turn an arbitrary motion-reference video into another cloud field.

---

# 12. Reference Audio vs Audio Driver

If an attached audio is merely:

- speaker voice reference;
- music style reference;
- sound inspiration;

it should not automatically become `audio_uri`.

Cloud A2V should be selected only when the audio is intended as:

> the exact soundtrack/timeline used in the generated result.

Otherwise:

```text
derive guidance
pre-compose final soundtrack
external TTS
local verified workflow
fallback provider
```

---

# 13. Cloud API lifecycle

## Production recommendation

Use async API:

```text
POST /v2/text-to-video
POST /v2/image-to-video
POST /v2/audio-to-video
```

Response:

```text
id
created_at
```

Poll:

```text
GET /v2/:endpoint/:id
```

State flow:

```text
pending
→ processing
→ completed
or failed
```

Recommended polling cadence from LTX documentation:

```text
5 seconds
```

Job status/output URLs are retained for a limited period; SmartAIHub should ingest completed video into Library/R2 promptly.

## Sync API

Available under v1 for short/simple workflows.

SmartAIHub default:

```text
cloudApiMode = async
```

---

# 13A. Cloud Asset Transport

LTX accepts `image_uri`, `audio_uri` and other media through three input methods:

```text
ltx:// cloud upload storage URI
public HTTPS URL
Data URI / base64
```

Recommended SmartAIHub policy:

```text
assetTransportPolicy = auto
```

Use public HTTPS signed URLs when they satisfy provider rules and are stable for generation fetch.
Use LTX `/v1/upload` when assets are private, large, or a provider-managed URI is safer.

Official transport boundaries include:

```text
LTX upload endpoint: up to 200 MB upload envelope
HTTPS: images 15 MB, video/audio 32 MB
Data URI encoded: images 7 MB, video/audio 15 MB
```

The upload flow is:

```text
POST /v1/upload
↓
upload_url + required_headers + storage_uri
↓
PUT file to signed upload_url
↓
use ltx://... storage_uri as image_uri/audio_uri
```

SmartAIHub should treat the returned upload URL as short-lived and the `storage_uri` as temporary provider input, not long-term Library storage.

---

# 14. LTX-2.5 Cloud does NOT support Retake / Extend / Reframe

This distinction is mandatory.

The overall LTX API contains endpoints named:

```text
retake
extend
reframe
```

but the current **LTX-2.5 Fast/Pro model support matrix** marks them unsupported.

Therefore SmartAIHub must not infer:

```text
LTX API has Extend
→ LTX-2.5 supports Extend
```

For LTX-2.5 cloud long-form continuation:

```text
independent generation
+
approved next Start Frame
+
external editing
```

or choose another provider with a verified continuation primitive.

---

# 15. Local / Open-source LTX-2.5

Official recommended paths:

```text
ComfyUI
ltx-pipelines / Python
```

Built-in ComfyUI templates:

```text
video_ltx2_5_t2v
video_ltx2_5_i2v
video_ltx2_5_flf2v
```

SmartAIHub Worker can call these as named workflows.

---

# 16. Local pipeline choices

SmartAIHub options:

```text
distilled_two_stage
distilled_single_stage
full_two_stage
first_last_single_stage
ic_lora_custom
extension_custom
```

Recommended iteration pattern:

```text
Distilled / lower-cost draft
↓
QC
↓
Full / two-stage final
```

Official LTX templates include separate video/audio VAEs and a Gemma 4 text encoder; two-stage generation uses a spatial upscaler.

---

# 17. Local dimensions / frames

Programmatic local pipelines require structural preflight.

When explicitly overriding frame count:

```text
num_frames = 8k + 1
```

Examples:

```text
41
49
81
121
```

One-stage dimensions must be divisible by 32.

Two-stage final dimensions must be divisible by 64.

SmartAIHub adapter validates these before Worker execution.

---

# 18. Local Prompt Enhancer

LTX-2.5 official local templates can use a dedicated Gemma 4 prompt enhancer.

SmartAIHub exposes:

```text
promptEnhanceLocal = true / false
```

Recommended approach:

- Idea Expansion remains SmartAIHub canonical intent;
- LTX Prompt Enhancer may improve cinematic detail;
- it must not be allowed to alter verified product claims, exact dialogue, entity identity or mandatory constraints.

If exact prompt fidelity matters, disable it.

---

# 19. Local IC-LoRA and advanced references

LTX open source supports LoRA and IC-LoRA customization for structural/video reference control.

However not every advanced adapter or older LTX-2.3 IC-LoRA is automatically validated on 2.5.

SmartAIHub therefore requires:

```text
localReferenceWorkflowVerified = true
localWorkflowId = <known workflow>
```

before raw generic references are sent through `local_ic_lora`.

Potential advanced use cases:

- motion control;
- structural control;
- restoration;
- image/video transforms;
- in/outpainting;
- custom reference conditioning.

Never treat these as zero-configuration base-model features.

---

# 20. Local Extension

The open-source training/pipeline system supports prefix/suffix-style conditioning and extension workflows, but this is distinct from LTX-2.5 cloud API support.

SmartAIHub exposes:

```text
local_extension
```

only when:

```text
localExtensionWorkflowVerified = true
```

and a specific workflow/pipeline is configured.

Otherwise:

```text
fallback provider
or
independent shot continuation
```

---

# 21. Provider Options

```json
{
  "providerOptions": {
    "ltx25": {
      "executionRoute": "auto",
      "model": "auto",
      "mode": "auto",
      "durationPolicy": "exact",
      "resolution": "1920x1080",
      "fps": 24,
      "cameraMotion": "auto",
      "generateAudio": "auto",
      "audioDriverAssetId": null,
      "referencePolicy": "auto",
      "cloudApiMode": "async",
      "localPipeline": "auto",
      "localWorkflowId": null,
      "localReferenceWorkflowVerified": false,
      "localExtensionWorkflowVerified": false,
      "promptEnhanceLocal": true,
      "localWidth": null,
      "localHeight": null,
      "localFps": null,
      "localNumFrames": null
    }
  }
}
```

---

# 22. Production presets

## Quality Cloud

```text
<=10s / <=1080p
→ ltx-2-5-pro
```

## Longer / 4K Cloud

```text
12–20s or >1080p
→ ltx-2-5-fast
```

## Reference-heavy visual ad

```text
references
→ prebake Start Frame
→ LTX I2V
```

## Exact soundtrack ad

```text
final audio mix
→ LTX A2V
→ optional Start/Last Frame
```

## Local custom-control ad

```text
Worker / ComfyUI
→ verified LTX IC-LoRA workflow
```

---

# 23. QC requirements

Provider-specific checks:

```text
LTX_START_FRAME_ADHERENCE
LTX_LAST_FRAME_ADHERENCE
LTX_START_STATE_CONTINUITY
LTX_MULTISHOT_CONTINUITY
LTX_CUT_AUDIO_CONTINUITY
LTX_DIALOGUE_EXACTNESS
LTX_LIPSYNC
LTX_NATIVE_AV_SYNC
LTX_AUDIO_DRIVER_SYNC
LTX_AUDIO_DRIVER_PRESERVATION
LTX_ICLORA_REFERENCE_RETENTION
LTX_PRODUCT_PLACE_IDENTITY
```

Exact label/UI/legal text remains a post-production/QC concern even when model typography quality is strong.

---

# 24. Implementation files

```text
config/providers/ltx-2.5-fast.json
config/providers/ltx-2.5-pro.json
config/providers/ltx-2.5-local.json
config/prompt-profiles/ltx-2.5.json

adapters/ltx25_reference_planner.py
adapters/ltx25_prompt_compiler.py
adapters/ltx25.py

schemas/providers/ltx-2.5/input-plan.schema.json
schemas/providers/ltx-2.5/prompt.schema.json
schemas/providers/ltx-2.5/execution-plan.schema.json

tests/test_ltx25.py
```
