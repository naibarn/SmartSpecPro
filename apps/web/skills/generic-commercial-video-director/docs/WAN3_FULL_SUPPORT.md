# Wan 3.0 Full Support — SmartAIHub Generic Commercial Video Director v9

Status: production integration specification  
Verified: 2026-09-01  
Provider: Alibaba Cloud Model Studio  
Models: `wan3.0-video`, `wan3.0-video-prime`

## 1. Position in SmartAIHub

Wan 3.0 is treated as an all-in-one audiovisual video provider rather than separate T2V/I2V/R2V models.

Supported SmartAIHub routes:

```text
Text-to-Video
Hard First Frame
Hard First + Last Frame
Multimodal Reference-to-Video
Document-to-Video
Public Web-to-Video
Video Edit
Video Extend
Native Audio
Native Multi-shot
```

`wan3.0-video-prime` is a faster sibling with the same SmartAIHub capability contract.

## 2. Direct generation

Duration:

```text
2–30s
```

or:

```text
duration = -1
```

for provider smart duration.

Resolution:

```text
480P
720P
1080P
```

Aspect:

```text
16:9
4:3
1:1
3:4
9:16
adaptive
```

Output is 30 fps MP4 with synchronized dialogue, BGM and sound effects by default.

## 3. Hard frame family

```text
first_frame
last_frame
```

Rules:
- max one first frame;
- max one last frame;
- last-frame is used together with first-frame for strict first+last interpolation.

SmartAIHub treats first frame as State #0 and forbids replay of pre-completed actions.

## 4. Multimodal reference family

Provider limits:

```text
Reference images: max 10
Reference videos: max 5, total <=15s
Reference audio: max 5, total <=15s
File: max 1
Web link: max 1
Total multimodal reference materials: max 20
```

Prompt labels:

```text
Image 1
Image 2
Video 1
Audio 1
File 1
Link 1
```

Image/video/audio numbering is independent by media type.

## 5. Critical conflict

Wan explicitly forbids mixing:

```text
first_frame / last_frame
```

with:

```text
reference_image
reference_video
reference_audio
file
link
```

in one request.

SmartAIHub resolution policies:

```text
prefer_hard_frames
prefer_references
prebake_hard_frame
split_generation
block
```

Production default:
- hard frame + visual refs only → prebake;
- hard frame + must-use raw motion/audio/document → split;
- no hard frame → raw multimodal reference route.

## 6. Video-reference duration preflight

Wan has a second duration constraint:

```text
input video duration
+
output video duration
<= 30s
```

Therefore SmartAIHub requires duration metadata for raw video references before a paid request.

Example:

```text
Reference video = 12s
Requested output = 20s
Total = 32s
→ BLOCK before API call
```

## 7. Native multi-shot

Wan is one of the strongest fits for native commercial storytelling because a single generation may run up to 30 seconds and the official guide supports timestamped multi-shot prompts.

Recommended shot cadence:

```text
4–6 seconds per shot
```

Example:

```text
(00:00 - 00:05) Hook
(00:05 - 00:10) Product demonstration
(00:10 - 00:15) Mechanism / proof
(00:15 - 00:21) Lifestyle result
(00:21 - 00:26) Product hero
(00:26 - 00:30) CTA
```

Use independent shots instead when exact repairability or per-shot product fidelity is more important.

## 8. Raw motion and camera reference

Unlike Grok 1.5 and current public FLUX 3, Wan can consume raw `reference_video`.

SmartAIHub can bind it as:
- body motion;
- camera movement;
- action rhythm;
- temporal structure;
- audiovisual style.

This makes Wan suitable for the existing SmartAIHub `motion_reference` and `camera_reference` asset types.

## 9. Voice and audio references

`reference_audio` can guide:
- voice;
- delivery;
- music;
- sound continuity.

For lip-sync workflows, prompts must explicitly bind the relevant audio and visible speaker.

## 10. Document / web reference

A single:
- document file; or
- public web link

can be used as generation context.

Do not mix `file` and `link` in the same request.

SmartAIHub should still run claim/research validation before allowing a document/web-derived statement to become a product/business claim.

## 11. Video edit / extend

Both use `reference_video` plus explicit prompt intent.

### Edit

State:
- exactly what changes;
- what must remain unchanged;
- target dialogue/style/environment/object.

### Extend

State:
- forward / backward / both;
- current State Ledger;
- completed actions;
- next beats;
- audio/dialogue continuity.

Because video input + output is bounded to 30s, SmartAIHub does not model Wan as an unlimited Omni-style extension chain.

## 12. API lifecycle

Create:
- async POST to workspace/region Model Studio endpoint;
- required `X-DashScope-Async: enable`.

Poll:
- `GET /api/v1/tasks/{task_id}`.

States:

```text
PENDING
RUNNING
SUCCEEDED
FAILED
CANCELED
UNKNOWN
```

Generated URLs are short-lived; SmartAIHub should ingest to its own Library/R2 immediately.

## 13. Production recommendation

For product ads:

```text
Idea
→ Product/Place Mechanism
→ 20–30s native multi-shot plan
→ refs/hard-frame preflight
→ Wan 720P/1080P
→ native audio/dialogue QC
→ exact logo/UI/CTA post
```

For a strict Start Frame + many refs:

```text
refs
→ prebake/validate Start Frame
→ Wan hard first-frame
```

For hard Start Frame + raw motion/voice that must stay raw:

```text
split workflow
```

## 14. Files

```text
config/providers/wan3.0-video.json
config/providers/wan3.0-video-prime.json
config/prompt-profiles/wan3.0.json
adapters/wan3_reference_planner.py
adapters/wan3_prompt_compiler.py
adapters/wan3.py
schemas/providers/wan3.0/
tests/test_wan3.py
```
