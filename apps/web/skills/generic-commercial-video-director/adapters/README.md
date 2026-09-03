# Provider Adapter Contract

Adapters are runtime integration modules. Capability Profiles are data.

Do not encode volatile provider capabilities only inside agent prompts.

Every adapter should:
1. load its capability profile;
2. validate requested mode/limits before credit-consuming calls;
3. build provider-specific payloads;
4. normalize job status/output/error fields;
5. support idempotency where the provider/API layer allows it;
6. expose endpoint/version-specific overrides without editing the core Skill;
7. fail closed for capabilities marked `unknown` unless an operator explicitly enables them.

Provider IDs included:
- `seedance-2.5-byteplus`
- `veo-3.1-gemini`
- `kling-video-3.0`
- `hailuo-2.3`
- `minimax-h3`
- `flux-3-video`
- `gemini-omni-1.1-flash`


## Grok Imagine Video 1.5

Provider-specific implementation:

```text
grok_reference_planner.py
grok_prompt_compiler.py
grok_imagine_video_1_5.py
```

Key contract:
- Start Frame => image-to-video.
- Reference images/voices => reference-to-video.
- The two modes are mutually exclusive.
- Motion/video references are not raw Grok 1.5 reference inputs.
- Reference mode is capped at 720p.
- T2V/I2V can use 1080p.
- Current xAI edit/extend uses companion `grok-imagine-video`.


## Wan 3.0

```text
wan3_reference_planner.py
wan3_prompt_compiler.py
wan3.py
```

Key rule:
- hard first/last frames and raw multimodal refs are separate request families;
- video inputs require `input-video + output <=30s` preflight;
- raw motion/camera/audio refs are first-class.

## FLUX 3

```text
flux3_reference_planner.py
flux3_prompt_compiler.py
flux3.py
```

Key rule:
- current public I2V images are literal timed keyframes;
- generic soft references must be prebaked/derived/fallback;
- V2V uses an actual short continuation source;
- draft → draft_enhance is first-class.

## Seedance 2.x

```text
seedance_reference_planner.py
seedance_prompt_compiler.py
seedance.py
```

Key rule:
- model-specific 2.0 versus 2.5 limits;
- BytePlus real-human refs require approved LAS material-library assets;
- direct hard-frame + arbitrary multimodal mix fails closed unless connector verification enables it.

## LTX 2.5

```text
ltx25_reference_planner.py
ltx25_prompt_compiler.py
ltx25.py
```

Key contracts:
- Cloud Fast/Pro support T2V, I2V and A2V; current 2.5 model matrix does not support Retake/Extend/Reframe.
- Start Frame is `image_uri`; Last Frame is `last_frame_uri` and requires Start Frame.
- Auto duration is Cloud T2V/I2V only and cannot be combined with Last Frame.
- A2V `audio_uri` is the exact soundtrack/timing driver, not a soft voice-reference embedding.
- Generic visual refs use prebake/derive/local IC-LoRA/fallback rather than an invented cloud reference array.
- Raw local IC-LoRA/reference and extension behaviors require explicit workflow verification.
- Final native multi-shot prompts are chronological prose with explicit cut/audio continuity language.
