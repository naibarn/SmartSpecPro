# Seedance 2.0 / 2.5 Full Support — SmartAIHub Generic Commercial Video Director v9

Status: production integration specification  
Verified: 2026-09-01  
Provider route: BytePlus LAS Enhanced Video Generation

Models:

```text
dreamina-seedance-2-0-260128
dreamina-seedance-2-5-260628
```

## 1. Do not collapse 2.0 and 2.5 into one capability profile

They share the same adapter family but have materially different limits.

| Capability | Seedance 2.0 | Seedance 2.5 |
|---|---:|---:|
| Direct duration | 4–15s | 4–30s |
| Output | 480p/720p/1080p/4K | 480p/720p |
| Ref images | up to 9 | up to 30 |
| Ref videos | up to 3 | up to 10 |
| Ref audio | up to 3 | up to 10 |
| Audio-only reference | No | Yes |
| Multi-round extension | conservative single workflow | current profile: up to 2 extension turns |
| Motion/clay/creative refs | general multimodal | significantly enhanced |

## 2. Common routes

Both support:

```text
Text-to-Video
First Frame
First + Last Frame
Multimodal image reference
Multimodal video reference
Multimodal audio reference
Video editing
Video extension
Native audio
```

## 3. Seedance 2.0

Best when:
- 4–15 second commercial shots;
- high-resolution master is important;
- 1080p/4K route is needed;
- reference set is moderate.

Important:

```text
reference image scenario + 1080p
→ unsupported on current BytePlus endpoint
```

4K is currently specific to enhanced Seedance 2.0.

Audio-only reference is not allowed; audio must be accompanied by reference image or video.

## 4. Seedance 2.5

Best when:
- one-pass 20–30s commercial story;
- many characters/products/places;
- many motion/camera/audio refs;
- long-form extension;
- timestamp-targeted edits;
- clay/white-model blocking;
- green-screen/reference editing.

Official model/launch materials support:

```text
up to 30 images
up to 10 video clips
up to 10 audio clips
```

and 30 seconds per generation.

The current conservative SmartAIHub profile permits:
- base generation;
- up to two automatic extension turns;
- maximum planned sequence ~90s when using full 30s segments.

Longer work should be broken into editorial sequences rather than assuming unbounded provider extension.

## 5. Reference labels

Prompt compiler uses:

```text
@Image 1
@Image 2
@Video 1
@Audio 1
```

Bind each reference to its exact job:

```text
@Image 1 → presenter identity
@Image 2 → product geometry
@Video 1 → hand/body motion and camera language
@Audio 1 → presenter voice
```

## 6. Hard Start/End + arbitrary multimodal refs

BytePlus documents:
- first frame;
- first+last frame;
- multimodal reference;

but current public docs do not clearly establish a direct raw request that mixes the hard-frame family with arbitrary reference media.

Therefore SmartAIHub fails closed by default.

Strategies:

```text
prefer_hard_frames
prefer_references
prebake_hard_frame
split_generation
block
```

There is also:

```text
directHardFrameReferenceMixVerified = false
```

Only a connector/endpoint verified to support that mix may set it true.

## 7. Recommended Start Frame + references workflow

For:

```text
Start Frame
Character Ref
Product Ref
```

use:

```text
prebake_hard_frame
↓
validated Start Frame
↓
Seedance I2V
```

For:

```text
Start Frame
must-use raw Motion Video
must-use raw Voice
```

prefer:

```text
split_generation
```

unless the actual provider endpoint contract has been verified for direct mixing.

## 8. Real-human references on BytePlus

Current BytePlus LAS documentation says real-human reference images/videos cannot simply be uploaded directly.

Production route:

```text
authorized human reference
↓
LAS material library
↓
approved asset ID
↓
asset://<ASSET_ID>
↓
Seedance request
```

SmartAIHub input supports:

```text
providerHints.byteplus.containsRealHumanFace
providerHints.byteplus.materialLibraryAssetId
providerHints.byteplus.materialLibraryApproved
```

The Adapter blocks raw provider submission if the required material-library approval is missing.

## 9. Native audio and dialogue

Both models jointly generate audio/video.

Use:
- exact dialogue;
- speaker mapping;
- voice reference where supported;
- ASR/lip-sync QC.

Seedance 2.5 is especially suited to multi-character audiovisual scenes because of its larger multimodal reference budget.

## 10. Motion and camera reference

Raw reference video is first-class for Seedance.

This maps cleanly from SmartAIHub:

```text
motion_reference
camera_reference
temporal_structure
service_flow
visitor_flow
```

Seedance 2.5 further improves creative reference interpretation and clay/white-model control.

## 11. Timestamp planning

For 2.5, use explicit time ranges for 30-second stories and targeted edit operations:

```text
00:00–00:06 Hook
00:06–00:12 Product setup
00:12–00:20 Demonstration
00:20–00:26 Result
00:26–00:30 Hero / CTA
```

## 12. Extension

### Seedance 2.0
Video extension exists, but SmartAIHub does not claim an unlimited deterministic chain.

### Seedance 2.5
Current conservative policy:

```text
Base <=30s
↓
Extension 1 <=30s
↓
Extension 2 <=30s
```

Persist:
- state ledger;
- last frame;
- current voice/audio;
- completed beats;
- remaining beats;
- seam QC.

`return_last_frame=true` is recommended to support controlled continuation/stitching.

## 13. Resolution routing

### 2.0

```text
480p / 720p / 1080p / 4K
```

but 1080p is rejected when reference-image mode is active.

### 2.5

```text
480p / 720p
```

Do not silently route 2.5 to 1080p/4K.

## 14. Files

```text
config/providers/seedance-2.0-byteplus.json
config/providers/seedance-2.5-byteplus.json
config/prompt-profiles/seedance-2.x.json
adapters/seedance_reference_planner.py
adapters/seedance_prompt_compiler.py
adapters/seedance.py
schemas/providers/seedance-2.x/
tests/test_seedance_2x.py
```
