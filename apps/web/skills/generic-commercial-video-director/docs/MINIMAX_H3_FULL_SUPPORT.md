# MiniMax H3 Full Support — SmartAIHub Product Video Director v6

Status: Production integration specification  
Verified: 2026-09-01

## 1. Meaning of full H3 support

SmartAIHub can supply image, video and audio references, so H3 integration exposes the model's actual multimodal workflows instead of treating references as image-only inputs.

| Workflow | MiniMax H3 | SmartAIHub implementation |
|---|---|---|
| T2VA | Supported | text → native AV |
| First-frame I2VA | Supported | hard Start Frame |
| Last-frame L2VA | Supported | hard End Frame |
| First+last FL2VA | Supported | hard interpolation |
| Reference image | Supported | Ref2VA |
| Reference video | Supported | Ref2VA |
| Reference audio | Supported | Ref2VA |
| Mixed image+video+audio | Supported | Ref2VA |
| Native dialogue/audio | Supported | H3 prompt dialect + QC |
| Native multi-shot | Supported | `[Shot N]` + timestamps |
| Video editing | Supported | Ref2VA relationship |
| Video continuation | Supported | new Ref2VA continuation clips + external assembly |
| Exact 4–15s duration | Supported | temporal planner |
| 2K | Supported | direct H3 or Regenerate-2K |
| Local H3-Base | Supported | Worker via SGLang/vLLM/Diffusers/ComfyUI |
| H3-Context-IR | Supported | optional preprocessing |
| H3-Max | Separate/limited | fast base/hard-frame only; no Ref2VA/2K |

## 2. Reference semantic layer

References are not classified only by MIME type.

### Image may represent
- character identity;
- product geometry;
- product label;
- environment;
- style;
- first/last/keyframe;
- UI/source artwork.

### Video may represent
- physical motion;
- body mechanics;
- camera movement;
- cut rhythm;
- temporal structure;
- edit source;
- continuation source;
- audiovisual style.

### Audio may represent
- voice timbre;
- delivery;
- dialogue source;
- music style;
- ambience;
- sound effects;
- audio continuity.

One asset can carry several semantic purposes.

## 3. Hard-frame / full-reference routing

The hosted H3 V2 API has a critical request-mode restriction: hard `first_frame` / `last_frame` and raw Ref2VA image/video/audio references do not belong in the same request.

SmartAIHub therefore resolves the conflict before prompt creation.

### Route A — Hard frame wins
Best when exact t=0 state or end state is mandatory.

Raw references are not discarded:
- visual refs → visual locks/descriptions or prebaked keyframe;
- video refs → motion/camera descriptors;
- audio refs → audio/voice descriptors or external speech stage.

### Route B — Full multimodal Ref2VA wins
Best when raw motion/camera/voice/identity reference combination matters more than an exact hard first frame.

Start/end images can be included as soft picture references but are not provider-level hard anchors.

### Route C — Prebake then hard-frame
SmartAIHub creates a validated Start/End keyframe that already incorporates product/character/style requirements, then H3 uses it as a hard anchor.

### Route D — Split
Use multiple generation/post stages when both exact hard state and exact raw voice/motion reference are mandatory.

## 4. Reference budget

H3 Reference Planner validates the current official limits:
- up to 9 reference images;
- up to 3 reference videos;
- 2–15s each; total video reference duration <=15s;
- up to 3 audio references;
- 2–15s each; total audio reference duration <=15s.

When over budget, rank by production importance and derive, trim, prebake or split.

## 5. H3 prompt compiler

### Base family

```text
integrated_multimodal_description:
[Shot 1] ...
[Shot 2] At 00:05.000, ...

overall_soundscape: ...

non_diegetic_music: ...
```

I2VA / L2VA / FL2VA also carry the appropriate keyframe-alignment instruction.

### Ref2VA

```text
subject_definitions:
...

summary:
[reference generation + video continuation + audio reference] ...

retention_analysis:
...

detailed_description:
[Shot 1] ...
[Shot 2] At 00:05.000, ...

overall_soundscape:
...

non_diegetic_music:
...
```

Reference labels remain stable:
- `<Subject N>`
- `<Picture N>`
- `<Video N>`
- `<Audio N>`

## 6. Product tie-in example with all reference types

Inputs:
- product image;
- presenter image;
- motion/camera reference video;
- voice reference audio;
- dialogue;
- optional Start Frame.

Without hard Start Frame:
- route to Ref2VA;
- product + presenter are raw `reference_image`;
- motion clip is raw `reference_video`;
- voice is raw `reference_audio`;
- prompt binds retention relationships.

With authoritative hard Start Frame:
- direct raw mix is not allowed by hosted H3 V2;
- policy chooses hard-frame + derived motion/audio, Ref2VA soft Start, prebake, or split.

## 7. Multi-shot

A 15-second H3 clip can contain planned cuts:

```text
[Shot 1] Hook
[Shot 2] At 00:04.500, demonstration
[Shot 3] At 00:10.000, product result / hero
```

Use native multi-shot when audiovisual continuity is valuable.

Use independent shot generation when:
- product fidelity is fragile;
- exact UI/label differs per shot;
- regeneration cost should be isolated;
- shot-specific repairability is more important.

## 8. Long video >15 seconds

### Preferred for ordinary ads/reviews
Generate multiple independent 4–15 second H3 clips and edit externally.

### Continuous narrative
Use reference-video continuation.

Example 40 seconds:

```text
15s base
+ 15s Ref2VA continuation
+ 10s Ref2VA continuation
= 40s
```

For continuation turn N:
1. extract a 2–5 second tail from turn N-1;
2. pass it as `reference_video`;
3. identify the task as video continuation;
4. inject the current state ledger;
5. generate a new 4–15 second clip;
6. perform segment QC and seam QC;
7. assemble externally.

This is different from a provider-native append/extend API.

## 9. Dialogue and audio

H3 generates audiovisual output natively.

The prompt maintains:
- speaker IDs `(S1)`, `(S2)`, etc.;
- exact user dialogue;
- scene-local sound events;
- music;
- reference voice/audio relationships.

For off-screen VO, keep on-screen lips explicitly closed.

## 10. Thai speech production policy

Thai is treated as variable-quality rather than stable-language.

Default production workflow:
1. generate at 768P;
2. run ASR against expected Thai text;
3. verify correct speaker;
4. score lip sync;
5. if pass → finalization;
6. if fail → external Thai TTS/lip-sync or VO fallback;
7. run 2K only after content/audio approval.

## 11. H3-Context-IR

Use `official_then_validate` for complex multimodal requests.

The returned enhanced prompt is validated against canonical SmartAIHub data:
- dialogue unchanged;
- product claim unchanged;
- correct reference relationships;
- correct Start/End state;
- legal shot timing;
- no hallucinated feature.

Context-IR is a compiler optimization, not the system of record.

## 12. Production 2K

Recommended:

```text
Generate 768P
→ QC
→ repair at 768P
→ approve
→ H3-Regenerate-2K
→ preservation QC
→ exact UI/label/CTA/VFX composite
→ master
```

## 13. Local H3

SmartAIHub Worker may run H3-Base with:
- SGLang;
- vLLM;
- Diffusers;
- ComfyUI.

Use:
- FL2VA checkpoint family for base/hard-frame workflows;
- Ref2VA checkpoint for mixed image/video/audio reference workflows.

Hybrid:
`local 768P → SmartAIHub QC → hosted Regenerate-2K`.

## 14. H3-Max

Do not treat H3-Max as a faster drop-in replacement for every H3 workflow.

H3-Max should not be selected when the job requires:
- raw Ref2VA image/video/audio;
- source video editing/continuation;
- 2K;
- middle-frame reference workflow.

## 15. H3 QC

Minimum H3-specific checks:
- Start hard-anchor fidelity;
- End hard-anchor fidelity;
- reference retention;
- product integrity;
- character identity;
- action chronology;
- motion/camera-reference transfer;
- voice-reference similarity when applicable;
- exact dialogue;
- speaker mapping;
- lip sync;
- native sound timing;
- native cut timing;
- continuation non-repeat;
- seam continuity;
- 2K preservation.

## 16. Files

- `config/providers/minimax-h3.json`
- `config/providers/minimax-h3-max.json`
- `config/prompt-profiles/minimax-h3.json`
- `adapters/h3_reference_planner.py`
- `adapters/minimax_h3_prompt_compiler.py`
- `adapters/minimax_h3.py`
- `schemas/providers/minimax-h3/reference-plan.schema.json`
- `schemas/providers/minimax-h3/prompt.schema.json`
- `schemas/providers/minimax-h3/execution-plan.schema.json`
- `schemas/providers/minimax-h3/continuation-chain.schema.json`
