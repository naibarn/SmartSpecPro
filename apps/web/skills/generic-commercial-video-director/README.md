# Generic Commercial Video Director v11

v11 keeps the complete Product / Place / Service / Narrative workflow and the production-grade H3, Grok, Wan, FLUX and Seedance integrations from earlier versions, then adds **LTX-2.5 Cloud + Local/ComfyUI/Python** as a first-class provider family.

## Commercial target branches

- physical product
- place / venue / store
- service / business
- digital product
- event / experience
- property / accommodation
- food / beverage
- brand campaign
- narrative with no promotion target

## Reference system

SmartAIHub accepts:
- image
- video
- audio
- document
- public web reference
- Start Frame
- End Frame
- timed keyframes
- semantic reference roles

Each provider adapter translates those generic SmartAIHub assets into the provider's actual contract rather than assuming all “references” mean the same thing.

## First-class video provider families

### MiniMax H3
- T2VA / I2VA / L2VA / FL2VA / Ref2VA
- image/video/audio refs
- native audio
- native multi-shot
- 4–15s
- local H3-Base
- 2K regeneration

### Grok Imagine Video 1.5
- T2V
- Start Frame I2V
- up to 7 image refs
- up to 3 preset voices
- 1–15s
- 1080p I2V / 720p reference mode
- companion xAI edit/extend routing

### Wan 3.0
Models:
- `wan3.0-video`
- `wan3.0-video-prime`

Capabilities:
- 2–30s
- 480P / 720P / 1080P
- hard first frame
- hard first + last frame
- up to 10 image refs
- up to 5 video refs
- up to 5 audio refs
- file or public web context
- native audiovisual dialogue
- native timestamped multi-shot
- video edit / bounded extension

Critical contract:

```text
first_frame / last_frame
              XOR
reference_image / reference_video / reference_audio / file / link
```

When reference video is present:

```text
sum(input video duration) + output duration <= 30s
```

### FLUX 3 Video
Model:
- `flux-3-video`

Capabilities:
- T2V 5–20s
- I2V 5–20s
- V2V continuation 5–15s
- exact Start / End / timed keyframes
- up to 10 keyframes
- native audio and dialogue
- multiple scenes/camera angles
- draft → draft_enhance
- optional final video upscale

Critical semantic rule:

> Current public FLUX 3 I2V images are literal timeline keyframes, not generic soft identity/product/place references.

Generic character/product/place reference images should normally be prebaked into an approved shot keyframe, derived to prompt guidance, or routed to another provider.

### Seedance 2.0
Model:
- `dreamina-seedance-2-0-260128`

Capabilities:
- 4–15s
- 480p / 720p / 1080p / 4K
- first frame / first+last
- up to 9 image refs
- up to 3 video refs
- up to 3 audio refs
- native audio
- edit / extend

Important:
- audio-only reference is unsupported;
- 1080p is unavailable in reference-image scenarios;
- real-human BytePlus refs require approved LAS material-library assets.

### Seedance 2.5
Model:
- `dreamina-seedance-2-5-260628`

Capabilities:
- 4–30s
- 480p / 720p
- up to 30 image refs
- up to 10 video refs
- up to 10 audio refs
- audio-only refs
- enhanced motion/camera/creative refs
- clay/white-model production control
- timestamp editing
- native audiovisual dialogue
- multi-round extension

Current conservative SmartAIHub long-form policy:

```text
base <=30s
+ extension #1 <=30s
+ extension #2 <=30s
```


### LTX 2.5

Cloud models:
- `ltx-2-5-fast`
- `ltx-2-5-pro`

Local/open model:
- `Lightricks/LTX-2.5`

Cloud capabilities:
- T2V
- Start Frame I2V
- First + Last Frame
- A2V exact soundtrack-driven generation
- native synchronized audio
- native multi-shot
- camera motion
- automatic duration
- Fast up to 4K and 20s where the exact resolution/FPS matrix allows
- Pro up to 1080p and 10s
- sync v1 + async v2 APIs

Critical semantic rules:

```text
Audio-to-Video audio_uri
= actual soundtrack/timing driver
!= soft voice/style reference
```

and:

```text
Cloud generic Character/Product/Place/Motion refs
→ prebake / derive / verified local IC-LoRA / fallback / block
```

Current LTX-2.5 cloud support matrix does **not** support Retake, Extend or Reframe. Those family endpoints must not leak into the 2.5 model profile.

Local capabilities include official ComfyUI/Python T2V, I2V and First/Last templates plus advanced LoRA/IC-LoRA/custom reference workflows when explicitly verified.

## Provider-truth principle

The LLM does not invent provider capabilities.

Provider truth lives in:

```text
config/providers/
schemas/providers/
adapters/
```

The Agent may choose a strategy, but application code validates:
- model/version
- duration
- resolution
- reference budget
- hard-frame conflicts
- reference semantics
- continuation type
- real-human material authorization
- paid-job approval/idempotency

## Key v10 files

### Wan 3.0

```text
config/providers/wan3.0-video.json
config/providers/wan3.0-video-prime.json
config/prompt-profiles/wan3.0.json
adapters/wan3_reference_planner.py
adapters/wan3_prompt_compiler.py
adapters/wan3.py
schemas/providers/wan3.0/
docs/WAN3_FULL_SUPPORT.md
tests/test_wan3.py
```

### FLUX 3

```text
config/providers/flux-3-video.json
config/prompt-profiles/flux-3-video.json
adapters/flux3_reference_planner.py
adapters/flux3_prompt_compiler.py
adapters/flux3.py
schemas/providers/flux-3-video/
docs/FLUX3_FULL_SUPPORT.md
tests/test_flux3.py
```

### Seedance

```text
config/providers/seedance-2.0-byteplus.json
config/providers/seedance-2.5-byteplus.json
config/prompt-profiles/seedance-2.x.json
adapters/seedance_reference_planner.py
adapters/seedance_prompt_compiler.py
adapters/seedance.py
schemas/providers/seedance-2.x/
docs/SEEDANCE_2X_FULL_SUPPORT.md
tests/test_seedance_2x.py
```


### LTX 2.5 files

```text
config/providers/ltx-2.5-fast.json
config/providers/ltx-2.5-pro.json
config/providers/ltx-2.5-local.json
config/prompt-profiles/ltx-2.5.json
adapters/ltx25_reference_planner.py
adapters/ltx25_prompt_compiler.py
adapters/ltx25.py
schemas/providers/ltx-2.5/
docs/LTX_2_5_FULL_SUPPORT.md
tests/test_ltx25.py
```

### General

```text
SKILL.md
docs/USER_GUIDE_TH.md
docs/GAP_REVIEW_V9_WAN_FLUX_SEEDANCE_10_ROUNDS.md
schemas/input.schema.json
schemas/ui.schema.json
schemas/output.schema.json
agents/AGENT_ARCHITECTURE.md
agents/SDK_REFERENCE.md
```

## Validation

```bash
python tests/validate_package.py
python tests/test_minimax_h3.py
python tests/test_grok_imagine_video_1_5.py
python tests/test_wan3.py
python tests/test_flux3.py
python tests/test_seedance_2x.py
python tests/test_ltx25.py
```


## v11 OpenAI Agents SDK Runtime

The package now includes an executable reference runtime under `src/smartaihub_video_director/`. It uses OpenAI Agents SDK for bounded structured reasoning only. SmartAIHub Core remains authoritative for persistence, tenant/asset authorization, approvals, credits, idempotency, paid provider submission and publishing.

Install runtime dependencies:

```bash
pip install -r requirements.txt
```

Validate package/provider contracts without an OpenAI API key:

```bash
python tests/validate_package.py
python tests/test_minimax_h3.py
python tests/test_grok_imagine_video_1_5.py
python tests/test_wan3.py
python tests/test_flux3.py
python tests/test_seedance_2x.py
python tests/test_ltx25.py
python tests/test_agent_runtime_v11.py
```

Full Thai guide: `docs/USER_GUIDE_TH.md`.
