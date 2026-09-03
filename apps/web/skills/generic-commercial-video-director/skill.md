---
name: generic-commercial-video-director
description: Imported from shared skill bundle (generic-commercial-video-director.zip)
category: other
version: 11.0.0
icon: sparkles
tags:
  - shared-skill
  - imported
auto_trigger: false
trigger_patterns: []
enabled_by_default: false
credit_multiplier: 1
priority: 50
execution_mode: llm-only
strict_provider_pin: false
config:
  media_studio:
    auto_learning:
      enabled: false
      prompt_qa_after_auto_prompt: true
      image_qa_after_generation: true
      require_admin_approval: true
      min_prompt_score_to_pass: 85
      min_image_fidelity_score_to_pass: 80
      max_auto_patch_risk: medium
  orchestration:
    mode: local
    endpoint: null
    skillTargets: []
    parallel: false
    fallback: local
---
# Generic Commercial Video Director

Version: **11.0.0**  
Type: **Hybrid Agent Skill**  
Purpose: Production-grade commercial, tie-in, review, demonstration, place/venue tour, service/experience and narrative video planning/generation from sparse ideas, optional product/place references, Start Frames, cast references and dialogue.

## 1. Canonical package contract

Required public contracts:
- `schemas/input.schema.json`
- `schemas/ui.schema.json`
- `schemas/output.schema.json`

Required stage contracts now include:
- `expanded-intent.schema.json`
- `product-mechanism.schema.json`
- `sequence-plan.schema.json`
- `observed-start-state.schema.json`
- `visualization-plan.schema.json`
- `shot-plan.schema.json`
- `prompt-chain.schema.json`
- `qc-report.schema.json`
- `repair-plan.schema.json`

SmartAIHub code is the authoritative workflow controller. Agents provide bounded structured reasoning. Provider adapters perform API translation and temporal execution.

## 2. Temporal model retained from v5/v6

A production video has four different temporal units:

1. **Video / Sequence** — the complete review/tie-in, for example 40 seconds.
2. **Logical Shot** — an editorial/cinematic shot with a creative duration such as 8s, 10s or 15s.
3. **Generation Segment** — one provider generation call; its maximum duration is provider-specific.
4. **Prompt Turn** — base generation or an extension request.

These MUST NOT be treated as the same thing.

Example: a 15-second logical continuous shot on a provider that can directly generate only 10 seconds may be executed as `8s base + 7s extension`, while it remains one logical shot in the storyboard.

## 3. Revised v11 production workflow

```text
Intake & Asset Validation
↓
Early Start-Frame / Scene Semantic Analysis?
↓
Cast / Asset Resolution
↓
Promotion Target Resolution
│
├─ Physical Product
│    ↓
│    Product Reference Present?
│    ├─ YES → Product Visual Identity Lock
│    └─ NO
│         ├─ Product visible in Start/Scene asset → derive target reference
│         ├─ Generic/unbranded visual allowed → continue as generic product
│         ├─ Named product + facts researchable → verify facts, visual identity remains unverified
│         └─ Exact packaging/logo required → request/block until source-of-truth asset exists
│    ↓
│    Product Semantics / Mechanism / Demonstration Model
│
├─ Place / Venue / Store / Property
│    ↓
│    Reclassify relevant scene/environment image as promoted-place evidence
│    ↓
│    Visible-Area / Feature Analysis
│    ↓
│    Place / Visitor Experience Model
│
├─ Service / Digital / Event / Experience
│    ↓
│    Experience / Service Journey Model
│
└─ No Promotion Target
     ↓
     Narrative-Only Branch
↓
Research / Evidence Gate
↓
Idea Expansion using resolved target branch
↓
Claim / Spatial-Truth / Compliance Gate
↓
Concept
↓
Script / Dialogue Draft
↓
Breakdown
↓
Sequence Architecture
(Multi-shot narrative + target total duration)
↓
Shot Duration Allocation
(8 / 10 / 15 / custom / auto)
↓
Scene & Shot Planning
↓
Branch-specific Proof / Experience / Demonstration Planning
↓
Start-State Analysis / Design
↓
Action & Motion State Transitions
↓
Storyboard + Visual Design + Continuity Locks
↓
Final Storyboard Approval
↓
Provider / Model Routing
↓
Temporal Execution Planning
↓
Prompt Chain Engineering
↓
Generation / Continuation / Assembly
↓
VFX / UI / Label / Signage / Graphics Composite
↓
Shot + Seam + Sequence QC
↓
Minimal Repair Loop
↓
Human / Brand / Place QC
↓
Post / Publish / Analytics / Optimize
```

## 3.1 Promotion Target Resolver

The Skill MUST NOT assume that every project promotes a physical product.

Resolve one of:

- `physical_product`
- `place_venue`
- `service_business`
- `digital_product`
- `experience_event`
- `property_accommodation`
- `food_beverage`
- `brand_campaign`
- `narrative_no_promotion`
- `unknown`

Evidence comes from:
- idea/story text;
- Start Frame;
- environment/place image;
- explicit product or business fields;
- dialogue;
- uploaded references;
- verified research when allowed.

The resolved branch is written to `schemas/stages/promotion-target.schema.json`.

## 3.2 No product image: supported behavior

A missing `product_reference` is NOT automatically an error.

### Case A — product exists visibly in another supplied image
If the Start Frame, character-scene image or environment image visibly contains the promoted product, that region may become `visible_in_scene` target evidence.

The system may:
- analyze/crop a derived product reference;
- lock visible geometry/color/placement;
- preserve exact visual appearance where resolution permits.

It must not invent unseen packaging sides or unreadable text.

### Case B — generic product, no brand-specific identity required
Example:
- “she uses a face cream”;
- “he drinks coffee”;
- “clean the floor with a spray cleaner”.

The Skill may continue with a generic/unbranded visual when policy permits.

Mark:
`visualIdentityStatus = generic_allowed`.

Do not fabricate a real trademark, packaging design or branded claim.

### Case C — named product, no visual reference
Facts/features may be researched if allowed.

However:

```text
Text/product facts verified
≠
Visual packaging identity verified
```

If exact package shape, logo, model color, screen UI or label is material, the Skill must obtain:
- a user reference;
- an already-visible source-of-truth image;
- or a verified external/official asset.

Otherwise use a non-exact representation only when the user/policy accepts it.

Default:
`allowGenerateApproximateNamedProduct = false`.

### Case D — exact branded product required but no visual evidence
Do not hallucinate it.

Return:
`continuationPolicy = request_more_reference`
or
`block_exact_identity`.

The rest of creative planning may continue as a draft, but the generation stage requiring exact branded imagery remains blocked.

## 3.3 Environment image may be the promoted subject

An image initially uploaded as `environment_reference` can be semantically reclassified.

Example idea:
> “พาชมร้านนี้ บรรยากาศอบอุ่น มีมุมให้นั่งทำงาน”

If the image depicts that shop, then it becomes:

```text
environment_reference
        ↓
Promotion Target Resolver
        ↓
place_venue
        ↓
source-of-truth place evidence
```

The image is no longer treated only as background scenery.

The resolver records the reclassification instead of mutating/losing the original asset role.

## 3.4 Place / shop / venue branch

For shops, cafes, restaurants, hotels, salons, clinics, showrooms, attractions, properties and similar targets, use `place-experience.schema.json`.

Model:
- what areas are actually visible;
- what features are actually visible;
- verified facts supplied by user/research;
- areas/facilities not visible;
- visitor journey;
- presenter movement;
- service interaction;
- proof/experience moments;
- camera opportunities;
- CTA.

Typical sequence:

```text
Establish location / atmosphere
↓
Presenter or visitor enters/orients
↓
Highlight visible feature #1
↓
Move naturally through the space
↓
Interaction / service / experience
↓
Detail insert
↓
Reaction / recommendation
↓
Venue hero / signage / CTA
```

## 3.5 Spatial truth boundary

A single venue image does NOT prove every part of the real location.

If only one interior view exists, the Skill may safely create:
- slow push/pull;
- pan/tilt;
- presenter blocking inside visible geometry;
- parallax;
- crop/detail inserts;
- counter/table interaction if visible;
- signage/detail close-ups if visible;
- virtual text/map callouts;
- multiple shots derived from the same verified space.

It must NOT present invented unseen:
- second floor;
- restroom;
- kitchen;
- parking;
- private room;
- garden;
- exterior;
- other branch/store area

as factual unless supported by another reference or verified source.

Policies:
- `visible_only` — production default;
- `research_verified`;
- `request_more_views`;
- `allow_clearly_stylized_reconstruction`.

## 3.6 Dialogue in place reviews

Dialogue may describe:
- visible atmosphere;
- supplied/verified facts;
- presenter reactions/opinions;
- services/features supported by evidence.

Do not convert visual inference into a factual business claim.

Example:

Safe:
> “มุมนี้ดูโปร่งและมีโต๊ะให้นั่งหลายแบบ”

when the image visibly supports it.

Needs evidence:
> “ร้านมีห้องประชุมส่วนตัว 4 ห้องและเปิด 24 ชั่วโมง”

unless supplied or researched.

## 3.7 No promotional target

If the user supplies:
- characters;
- scene;
- story idea;

but there is no product/place/service being promoted, select:

`narrative_no_promotion → narrative_only`.

Do not force:
- ProductMechanism;
- commercial proof;
- product hero;
- CTA.

The same shot, motion, dialogue, provider and QC pipeline still applies.

## 4. Physical-product branch coverage model

Product coverage is **open-ended**, not a fixed enumeration.

The resolver combines:
- product family;
- behavior primitives;
- mechanism domain;
- target surface/system;
- product state graph;
- verified usage/feature evidence;
- Start Frame evidence.

Behavior primitives include actions such as dispense, apply, wipe, rotate, spin, pump, filter, heat, cool, charge, display, detect, record, connect, wear, attach, assemble, cut, clean, cook and many others in `config/product-function-taxonomy.json`.

Common product families include personal care, cleaning, laundry, appliances, HVAC, kitchen, water/fluid systems, digital devices, audio/AV, smart home, power/charging, lighting, software/services, tools, furniture, fashion, jewelry, food, baby, pet, sports, garden, construction materials, automotive, office/stationery and industrial equipment.

If a product does not match a known family, compose it from behavior primitives.

## 5. Product truth boundary

Architecture breadth does not mean the LLM may invent how a named product works. Product-specific behavior must be bound to:
- user fact;
- source-of-truth asset;
- verified research;
- category convention only as a provisional fallback.

Regulated, safety-critical or hazardous categories require stronger evidence and may require human/compliance approval.

## 6. Multi-shot planning

### 6.1 Logical shot duration policy
User/UI may choose:
- automatic duration;
- fixed duration, e.g. every shot = 8 seconds;
- allowed values, e.g. `[8,10,15]`;
- custom duration per shot.

`SequencePlannerAgent` assigns narrative beats to logical shots while respecting action load, dialogue length, product proof and visual complexity.

### 6.2 Native vs external multi-shot
`multiShotStrategy` may be:
- `independent_shots` — generate each shot separately, assemble in editor;
- `provider_native_multishot` — one provider generation intentionally contains planned cuts;
- `extension_chain` — use base + extend turns;
- `hybrid` — combine methods.

Default production preference: use independent shots when exact product fidelity and repairability matter; use native multi-shot/extension chains when continuity benefits outweigh regeneration risk.

## 7. Duration adaptation

A requested logical shot is never silently shortened because of provider limits.

If provider direct duration is insufficient, planner chooses one of:
1. verified extension chain;
2. route to a model supporting the duration;
3. split into multiple logical shots if a cut is editorially acceptable;
4. time-compress only when conceptually valid;
5. request/policy adjustment.

For a logical 15-second **single continuous shot**, splitting into two editorial shots is not equivalent; prefer extension or another provider.

## 8. Extension-chain planning

Extension is a first-class execution strategy.

Each chain stores:
- base segment;
- extension segments;
- global time range;
- local time range;
- current Start/End State;
- completed product actions;
- remaining narrative beats;
- cast/product/environment/audio locks;
- dialogue ownership;
- seam policy;
- provider interaction/source IDs.

### 8.1 Local vs global time
Prompts use **local timecode** because many providers interpret 0s as the beginning of the current generation/extension.
The project timeline uses **global timecode**.

Example:
```text
Global 16–24s = Extension Turn 2
Local 0–8s    = the same segment inside the provider prompt
```

Never put global `[16-24s]` in a provider prompt when the provider expects extension-local timestamps.

### 8.2 Base prompt
Base prompt establishes:
- Start Frame / references;
- continuity contract;
- local timeline for the opening segment;
- initial action/proof/dialogue;
- End Bridge State.

### 8.3 Extension prompt
Each extension must:
1. say continue from the exact current ending;
2. explicitly say **do not replay/reset completed actions**;
3. identify same shot vs planned cut/new shot;
4. state the current product/cast state;
5. include only the new beat(s);
6. use extension-local timecodes;
7. continue/change audio intentionally;
8. finish on a new Bridge State.

## 9. Gemini Omni 1.1 Flash extension profile

The current verified profile records:
- output video 3–10 seconds;
- extension appends a 3–10 second continuation;
- extension chain total up to 40 seconds;
- the model uses the last 10 seconds as continuation context;
- some final input frames may be rewritten for a seamless transition;
- extension-local timestamp 0s means the beginning of the extension;
- model-generated multi-turn extension can continue spoken dialogue; adding new dialogue when extending an uploaded talking video is not supported.

Therefore an 8-second opening can reach 40 seconds if the temporal solver chooses four legal 8-second extensions:
`8 + 8 + 8 + 8 + 8 = 40`.
This partition is computed from the capability profile and must not be hard-coded.

## 10. Extension seam safety

Some providers may alter tail frames to blend an extension. Treat the seam as a mutable region.

Avoid near a seam when possible:
- exact product label hero hold;
- exact phone/UI text;
- CTA typography;
- the middle of a spoken word/critical dialogue syllable;
- a critical before/after comparison frame.

Perform Seam QC after every extension. Prefer exact UI/label/CTA composites after temporal generation is complete.

## 11. Multi-shot prompt topology

Every generation segment declares one topology:
- `same_shot` — continuous camera/action;
- `planned_cut` — cut intentionally inside the new segment;
- `new_shot_same_scene`;
- `new_scene`;
- `montage_progression`.

If a provider tends to create cuts automatically but the approved storyboard is one continuous shot, PromptEngineer must explicitly request a single continuous/unbroken shot and no scene cuts.

## 12. Product review/tie-in sequence architecture

A long review should distribute content across beats rather than stretch one action:
1. hook/context;
2. product establishment;
3. correct use / feature demonstration;
4. mechanism explanation or UI feature proof;
5. result/use-case;
6. hero product / CTA.

The sequence may use 3, 4, 5+ logical shots depending total duration and complexity. The Sequence Planner must guarantee required narrative/proof beats are assigned, or mark a `NARRATIVE_COVERAGE_GAP`.

## 13. Dialogue across multi-shot and extensions

Dialogue remains structured by speaker ID and line ID.

Planner must check:
- speaking time fits segment duration;
- speaker is on-screen when required;
- lip sync capability exists;
- product choreography is not overloaded by dialogue;
- extension provider permits dialogue in the selected source mode.

If not, split the beat, use VO, route model, or move dialogue to a non-extension shot.

## 14. Product mechanism / VFX

Keep v4 rules:
- correct-use demonstration;
- mechanism truth classification;
- literal vs supported explanatory vs stylized illustrative graphics;
- clean base plate + post VFX for airflow, thermal, exact UI/labels, callouts and diagrams when more reliable.

## 15. QC hierarchy

QC runs at three scopes:

### Segment QC
Product/identity/action/audio correctness for one generated segment.

### Seam QC
Check continuity across base→extend or extend→extend:
- duplicated/reset action;
- product state jump;
- camera jump;
- identity drift;
- label/UI damage;
- audio/discourse discontinuity;
- tail rewrite damage.

### Sequence QC
Check:
- total duration;
- multi-shot continuity;
- narrative beat coverage;
- proof coverage;
- CTA and brand close;
- no contradictory product state.

## 16. Repair

Temporal repair may:
- regenerate only one segment;
- re-extend from the last good turn;
- rewrite an extension prompt;
- move a planned cut;
- change segment duration;
- route a 15-second logical shot to another model;
- re-composite UI/VFX only;
- shorten/rebalance narrative beats;
- rebuild chain after a bad seam.

Never blindly regenerate the entire sequence when the failure scope is known.

## 17. Agent roles

Logical specialist roles now include:
- Intake / EarlyScene / Cast Resolution
- Product Intelligence / Research / Product Mechanism
- Idea Expansion / Creative / Script / Dialogue
- **SequencePlannerAgent**
- ShotPlanner / Demonstration / VisualExplanation / Motion / Continuity
- GenerationStrategistAgent
- **TemporalPlannerAgent**
- **PromptChainAgent**
- PromptEngineerAgent
- QC / Repair / Optimization

The names are responsibility boundaries, not mandatory separate LLM calls. Fast/balanced/production execution profiles may consolidate them while preserving the same schemas.

## 18. Provider adapter contract

Provider adapters must expose enough temporal information to decide:
- direct duration support;
- native multi-shot support;
- extension min/max/allowed duration;
- max cumulative duration;
- extension context length;
- dialogue restrictions;
- tail rewrite behavior;
- local timecode semantics.

If a critical temporal field is unknown, fail closed for extension planning and route/split instead of guessing.

## 19. Limits

The architecture can plan nearly any ordinary commercial product by composing behavior primitives, but production quality remains constrained by:
- missing/incorrect source product facts;
- regulated/safety-critical claims;
- generative text/UI/label fidelity;
- complex hand/object/liquid/cloth/reflection physics;
- long unbroken choreography;
- repeated extension drift;
- exact multi-speaker lip sync;
- exact hidden/internal geometry.

These are handled by research, human approval, shot splitting, provider routing, keyframes, post-compositing and QC—not by pretending the limitation does not exist.


# 20. MiniMax H3 — First-Class Full-Support Contract

MiniMax H3 MUST be treated as a dedicated multimodal provider family, not as a generic video model.

SmartAIHub can supply raw reference images, videos and audio. The H3 integration therefore preserves reference media semantics and uses the most suitable H3 task family rather than converting all references to text by default.

## 20.1 Supported H3 production modes

The H3 routing layer may select:

- `T2VA` — text → synchronized audio/video.
- `I2VA` — hard first-frame controlled generation.
- `L2VA` — hard last-frame controlled generation.
- `FL2VA` — hard first + last frame interpolation.
- `Ref2VA` — text + reference images/videos/audio.
- `video_edit` — transform an existing source video through Ref2VA semantics.
- `video_continuation` — generate a new continuation clip using a source/tail video reference.
- `H3-Context-IR` — optional official multimodal prompt interpretation.
- `H3-Regenerate-2K` — finalize approved H3 768P output at 2K.

## 20.2 Reference semantics are first-class

An asset MUST carry semantic purpose in addition to media type.

Examples:

```text
image:
  identity
  product_geometry
  product_label
  environment
  style
  first_frame
  last_frame
  ui_source

video:
  motion
  pose/expression progression
  camera_motion
  cut_rhythm
  temporal_structure
  source_video_edit
  source_video_continuation

audio:
  voice_timbre
  voice_delivery
  dialogue_content
  music_style
  audio_continuity
  sound_effect
```

One raw asset may have multiple purposes.

`providerUsePolicy` determines whether an asset:
- MUST reach H3 raw;
- should preferably reach H3 raw;
- may be derived into structured prompt guidance;
- is analysis-only;
- or is reserved for post-production.

No reference is silently discarded.

## 20.3 Critical hosted H3 constraint: hard frames XOR Ref2VA

For the current hosted H3 V2 API, the following raw request families are mutually exclusive:

```text
first_frame / last_frame
          XOR
reference_image / reference_video / reference_audio
```

Therefore SmartAIHub MUST run `H3ReferencePlanner` before prompt compilation.

When Start/End Frame and raw multimodal refs coexist, use one explicit policy:

### A. Prefer hard Start/End state
Use H3 I2VA/L2VA/FL2VA.
- exact Start State remains authoritative;
- product/person/style images are analyzed into locks/descriptions or prebaked;
- motion/camera video refs become structured motion/camera guidance;
- voice/audio refs move to external audio/lipsync or descriptive guidance if they cannot be sent raw.

### B. Prefer raw multimodal Ref2VA
Use all applicable raw image/video/audio references.
- Start/End images may become soft reference pictures;
- exact provider frame-0/frame-end matching is no longer guaranteed.

### C. Prebake then hard-frame
Use SmartAIHub image/compositing tools to create a validated Start/End keyframe containing the important product/person/style requirements, then send it as a hard H3 frame.

### D. Split generation
Use more than one stage when both exact hard state and raw voice/motion/reference media are mandatory.

Never construct an invalid mixed H3 request.

## 20.4 H3 reference-budget planning

Validate before submission:

- reference images: up to 9;
- reference videos: up to 3;
- each reference video: 2–15 seconds;
- total reference-video duration: ≤15 seconds;
- reference audio: up to 3;
- each audio reference: 2–15 seconds;
- total reference-audio duration: ≤15 seconds;
- provider request/file limits from the current capability profile.

If the project has more references than H3 can accept, `H3ReferencePlanner` ranks them by production value:

1. product/source-of-truth geometry;
2. required character identity;
3. required motion/camera reference;
4. required voice reference;
5. environment/style;
6. optional inspiration.

Then choose:
- trim reference video/audio;
- select the strongest refs;
- derive lower-priority refs into structured descriptions;
- prebake them into a keyframe;
- reserve exact UI/label assets for post;
- split generation.

## 20.5 H3 prompt dialect

Do NOT send the generic provider-neutral prompt unchanged.

### Base H3 family: T2VA / I2VA / L2VA / FL2VA

Compile:

```text
[keyframe alignment instruction if required]

integrated_multimodal_description:
[Shot 1] ...
[Shot 2] At 00:05.000, ...

overall_soundscape: ...

non_diegetic_music: ...
```

### Full-reference Ref2VA

Compile:

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

Reference labels are stable within the generation attempt and repair lineage:

```text
<Subject 1>
<Picture 1>
<Video 1>
<Audio 1>
```

Visible retention intent may use:
- fully_preserved
- partially_preserved
- attribute_transfer
- weak_reference

Audio relationships may use:
- fully_copy
- partially_copy
- reference
- weak_reference

## 20.6 H3 dialogue and native audio

H3 natively generates synchronized:
- dialogue;
- diegetic sound;
- music;
- stereo audio.

Speaker IDs MUST remain stable across the H3 prompt:

```text
(S1)
(S2)
```

Exact dialogue:

```text
(S1) says: <d>[Thai] ข้อความเดิมของผู้ใช้</d>
```

Do not paraphrase user-supplied exact dialogue.

For off-screen VO, compile the documented H3 voiceover relationship and explicitly keep the visible character's lips closed.

### Thai production policy

Thai is outside the currently documented stable-language set.

For production Thai:

```text
Generate 768P with native Thai
↓
ASR exact-text QC
↓
speaker correctness QC
↓
lip-sync QC
│
├─ PASS → continue
└─ FAIL → external Thai TTS/lip-sync or VO fallback
↓
Only after speech approval → 2K finalization
```

This avoids paying for 2K before dialogue is accepted.

## 20.7 Native multi-shot

H3 supports a deliberate multi-shot prompt inside one 4–15 second generation.

Example:

```text
[Shot 1] product hook ...
[Shot 2] At 00:04.500, demonstration ...
[Shot 3] At 00:10.000, hero product ...
```

Rules:
- Shot 1 has no timestamp.
- Later shot timestamps strictly increase.
- Timestamps must remain inside target generation duration.
- A cut should introduce meaningful new information.
- Prefer camera movement over a cut for a minor distance/angle change.
- For FL2VA, prefer one continuous shot unless cuts are explicitly part of the approved storyboard.

## 20.8 Exact H3 duration

`MiniMax-H3` accepts exact integer durations from 4–15 seconds.

Therefore requested logical shots of:
- 8s
- 10s
- 15s

can be generated directly without a duration workaround.

`MiniMax-H3-Max` has its own profile and must not inherit H3 capabilities blindly.

## 20.9 H3 long-form sequences >15 seconds

H3 continuation is NOT modeled as a native append-in-place API.

For ordinary product advertisements/reviews, prefer independent 4–15s clips because they provide:
- easier repair;
- stronger product control;
- easier exact UI/label compositing;
- lower continuity failure propagation.

For a continuous narrative, use a **Ref2VA reference-video continuation chain**:

```text
Generate Segment 0 (4–15s)
↓
Extract a 2–5s continuity tail
↓
Tail becomes reference_video for Segment 1
↓
Prompt task type includes [video continuation]
↓
Generate Segment 1 (4–15s)
↓
Segment QC + Seam QC
↓
External assembly
↓
Repeat when needed
```

The tail may be longer when needed, but all H3 reference-video limits still apply.

Example 40-second plan:

```text
Segment 0: 15s base
Segment 1: 15s continuation
Segment 2: 10s continuation
Total: 40s
```

Each continuation prompt receives:
- current end-state ledger;
- completed action/beat IDs;
- remaining beat IDs;
- current product state;
- cast identity/wardrobe state;
- camera direction/motion state;
- dialogue state;
- audio continuity target;
- explicit `do not repeat completed actions`.

The output clips are assembled externally and undergo seam QC.

## 20.10 H3 Context-IR

`H3-Context-IR` is an optional official preprocessing path for complex multimodal prompts.

Supported policy:
- `off`
- `official`
- `official_then_validate`

Production default: `official_then_validate`.

After Context-IR returns the enhanced prompt, SmartAIHub validates that it did NOT alter:
- exact user dialogue;
- product claims;
- reference relationships;
- product/cast IDs;
- Start/End state intent;
- shot timing;
- unsupported product features.

If Context-IR drifts, repair it or use SmartAIHub's native H3 compiler.

## 20.11 H3 768P → 2K workflow

Recommended production workflow:

```text
Plan / Storyboard approved
↓
Generate 768P candidate
↓
Product + identity + motion + audio QC
↓
Repair/regenerate at 768P
↓
Approve content
↓
H3-Regenerate-2K
↓
2K preservation QC
↓
Exact UI / label / CTA / explanatory VFX composite
↓
Master export
```

Do not 2K-finalize rejected drafts.

## 20.12 Local H3 via SmartAIHub Worker

H3-Base local execution may route through:
- SGLang;
- vLLM;
- Diffusers;
- ComfyUI.

Recommended checkpoint family:
- `fl2va` for T2VA/I2VA/L2VA/FL2VA;
- `ref2va` for raw image/video/audio reference generation.

The Worker returns:
- job ID/status/progress;
- output video asset;
- native audio presence;
- actual duration;
- model/checkpoint identity;
- prompt hash;
- resolution;
- runtime metrics;
- reproducibility metadata when available.

Hybrid production is allowed:

```text
Local H3-Base 768P
↓
SmartAIHub QC
↓
Hosted H3-Regenerate-2K
```

## 20.13 H3-Max is a separate model profile

Do not silently substitute `MiniMax-H3-Max` for `MiniMax-H3`.

Use H3-Max mainly for:
- fast T2VA;
- fast hard first/last-frame drafts;
- workflows that do not require raw Ref2VA;
- workflows that do not require 2K.

Do NOT use H3-Max when raw:
- image reference;
- video reference;
- audio reference;
- source video edit/continuation;
- 2K final

is mandatory.

## 20.14 H3-specific QC

In addition to generic QC, H3 QC checks:

1. first-frame adherence when hard I2VA/FL2VA is used;
2. last-frame landing when L2VA/FL2VA is used;
3. reference identity retention by label;
4. product geometry/label retention;
5. reference-motion transfer;
6. reference-camera transfer;
7. reference-voice similarity when used;
8. native audio-video synchronization;
9. exact dialogue preservation;
10. speaker-ID correctness;
11. multi-shot cut timing;
12. completed-action non-repetition;
13. continuation seam;
14. product/cast drift over continuation segments;
15. 2K regeneration preservation.

## 20.15 H3-specific repair

Minimal repair options include:
- change hard-frame vs Ref2VA strategy;
- reorder or reduce references;
- trim reference video/audio;
- strengthen subject definitions;
- strengthen retention analysis;
- move a motion/camera reference into structured prompt guidance;
- prebake a product/person keyframe;
- switch Thai speech to external TTS/lip-sync;
- reduce native shot count;
- regenerate one 4–15s segment only;
- restart a continuation from the last good tail;
- re-run 2K finalization only after 768P is approved;
- post-composite exact product label/UI/CTA.



# 21. Grok Imagine Video 1.5 — First-Class xAI Contract

`grok-imagine-video-1.5` MUST use a dedicated mode resolver.

Supported first-class modes:

```text
text_to_video
image_to_video
reference_to_video
```

## 21.1 Start Frame

A `start_frame` routes to Image-to-Video and is treated as literal State #0.

The prompt must continue from the existing state rather than replaying completed actions.

For an aspect-ratio mismatch, prefer SmartAIHub normalization/crop/pad before submission. Do not rely on xAI aspect override to stretch an authoritative Start Frame.

## 21.2 Reference-to-Video

Reference mode supports:
- up to 7 image references;
- up to 3 preset `voice_id` references;
- native generated audio;
- duration 1–15s;
- maximum 720p.

Use stable labels:

```text
<IMAGE_1> ... <IMAGE_7>
<AUDIO_0> ... <AUDIO_2>
```

Reference images guide identity/object/clothing/place/style and DO NOT lock literal frame 0.

## 21.3 Start Frame vs Reference conflict

Grok 1.5 request modes are mutually exclusive.

Never send:

```text
image
+
reference_images/reference_audios
```

as one SmartAIHub generation request.

Resolve through:

```text
prefer_start_frame
prefer_references
prebake_start_frame
split_generation
block
```

The preferred production solution when exact Start Frame and multiple character/product references are both important is often:

```text
references
↓
prebake / validate Start Frame
↓
Grok image_to_video
```

## 21.4 Video references

Grok 1.5 Reference-to-Video does not take raw reference videos.

A SmartAIHub motion/camera video reference must:
- be analyzed into motion/camera guidance;
- route to another provider;
- or route to the xAI edit/extend companion workflow when it is an actual source video.

Never silently discard `must_use_raw`.

## 21.5 Audio reference boundary

Preset xAI voice references are supported.

User-uploaded custom voice references require provider entitlement for trusted partners.

Fail closed unless entitlement and connector payload are verified.

Otherwise use:
- external TTS/lip-sync;
- VO;
- native Grok voice without exact reference lock.

## 21.6 Resolution

```text
T2V / I2V:
480p / 720p / 1080p

Reference-to-Video:
480p / 720p only
```

## 21.7 Duration

```text
1–15s exact duration parameter
```

Therefore 8s / 10s / 15s logical shots can be routed directly.

## 21.8 Multi-shot

There is no dedicated provider-native shot/timestamp contract in the current verified profile.

Production default:
`independent_shots`.

A single Grok prompt may describe scene evolution, but the Skill must not label that as verified native multi-shot control.

## 21.9 xAI companion edit/extend

Current official xAI video edit/extend workflows use:

```text
grok-imagine-video
```

Companion extension:
- source video 2–15s;
- add 2–10s;
- output inherits aspect/resolution up to 720p.

Companion edit:
- source video max 8.7s;
- duration/aspect/resolution inherited;
- output capped at 720p.

Do not misreport these capabilities as `grok-imagine-video-1.5` itself.

## 21.10 Grok-specific QC

Require:
- Start Frame adherence;
- State #0 continuity;
- reference retention;
- reference binding;
- product/place identity;
- dialogue exactness;
- lip sync;
- native audio sync;
- aspect integrity;
- provider-mode legality.


# 22. Wan 3.0 — First-Class Alibaba Model Studio Contract

Supported model IDs:

```text
wan3.0-video
wan3.0-video-prime
```

Treat both as the same capability family; Prime is the accelerated sibling.

## 22.1 Supported production routes

```text
Text-to-Video
Hard First Frame
Hard First + Last Frame
Multimodal Reference-to-Video
Document/Web grounded video
Video Edit
Video Extend
Native Audio
Native Multi-shot
```

Direct output:
- 2–30 seconds;
- smart duration with provider `-1`;
- 480P / 720P / 1080P;
- native dialogue/BGM/SFX.

## 22.2 Hard-frame XOR reference family

Wan explicitly forbids raw mixing of:

```text
first_frame / last_frame
```

with:

```text
reference_image / reference_video / reference_audio / file / link
```

in one request.

`WanReferencePlanner` MUST resolve through:

```text
prefer_hard_frames
prefer_references
prebake_hard_frame
split_generation
block
```

Do not construct an invalid mixed request.

## 22.3 Reference limits

```text
images: max 10
videos: max 5, total <=15s
audio: max 5, total <=15s
file: max 1
link: max 1
all multimodal refs: max 20
```

`file` and `link` are mutually exclusive.

Stable prompt labels:

```text
Image 1
Video 1
Audio 1
File 1
Link 1
```

## 22.4 Video-input duration gate

When any reference video is present:

```text
sum(input video duration)
+
requested output duration
<= 30s
```

SmartAIHub MUST preflight video duration metadata before paid submission.

## 22.5 Native multi-shot

Wan supports 30-second multi-shot narratives.

The prompt compiler may use time ranges such as:

```text
(00:00 - 00:05) Hook
(00:05 - 00:10) Demo
(00:10 - 00:15) Proof
```

Typical provider guidance is 4–6 seconds per shot.

## 22.6 Video edit / extend

Both are implemented through `reference_video` plus explicit prompt intent.

Do not model Wan extension as an unlimited Omni-style chain because all video-input workflows remain bounded by the 30-second input+output constraint.

## 22.7 Wan QC

Require:
- hard Start/End adherence;
- multimodal reference retention;
- motion/camera transfer;
- audio/voice binding;
- multi-shot timing;
- exact dialogue/lipsync;
- edit preservation;
- extension continuity;
- input/output duration legality.


# 23. FLUX 3 Video — Literal-Keyframe Contract

Current public model:

```text
flux-3-video
```

## 23.1 Supported modes

```text
t2v
i2v
v2v
draft_enhance
```

T2V/I2V:
- 5–20s.

V2V:
- 5–15s new continuation.

Output:
- 24 fps;
- HD/FHD;
- native synchronized audio.

## 23.2 Critical rule: image inputs are clip keyframes

Current public FLUX 3 I2V images are literal timeline frames.

One image at 0s:
`exact Start Frame`.

Two timed images:
`exact Start + End`.

Up to ten:
`timed storyboard keyframes`.

Do NOT map generic character/product/place references directly into FLUX I2V unless they are intentionally meant to become literal video frames.

## 23.3 Soft reference handling

For:

```text
Character Reference
Product Packshot
Venue Reference
Style Reference
```

current production options are:

```text
prebake_keyframe
derive_to_prompt
fallback_provider
block
```

Default:
`prebake_keyframe`.

This preserves SmartAIHub's reference semantics without falsely claiming that current public FLUX exposes general Omni Reference.

## 23.4 V2V continuation

Use `start_video` only for an actual continuation source.

Do not misuse an arbitrary motion-reference clip as `start_video`.

For long sequences:

```text
approved previous clip
↓
extract <=4s audiovisual tail
↓
FLUX v2v
↓
new 5–15s segment
↓
Seam QC
↓
external assembly
```

## 23.5 Draft workflow

Production default may use:

```text
draft=true
↓
choose/QC draft
↓
draft_cache
↓
draft_enhance
```

This reproduces the selected take at full quality rather than asking for a fresh reinterpretation.

## 23.6 FLUX QC

Require:
- keyframe adherence;
- Start/End state;
- identity/product/place fidelity;
- dialogue/lipsync;
- native audio;
- continuation seam;
- draft-enhance preservation;
- FHD/upscale preservation.


# 24. Seedance 2.0 / 2.5 — Versioned Multimodal Contract

Do NOT treat Seedance 2.0 and 2.5 as identical profiles.

## 24.1 Seedance 2.0

Model:

```text
dreamina-seedance-2-0-260128
```

Capabilities:
- 4–15s;
- 480p / 720p / 1080p / 4K;
- first frame;
- first+last;
- up to 9 image refs;
- up to 3 video refs, total <=15s;
- up to 3 audio refs, total <=15s;
- edit / extend;
- native audio.

Important:
- audio-only reference is unsupported;
- 1080p is unsupported in reference-image scenarios;
- 4K is unique to the current enhanced Seedance 2.0 route.

## 24.2 Seedance 2.5

Model:

```text
dreamina-seedance-2-5-260628
```

Capabilities:
- 4–30s;
- 480p / 720p;
- first frame;
- first+last;
- up to 30 image refs;
- up to 10 video refs;
- up to 10 audio refs;
- audio-only reference;
- enhanced motion/camera/creative reference;
- clay/white-model reference;
- timestamp editing;
- native audiovisual dialogue;
- multi-round extension.

SmartAIHub's conservative current automatic chain cap:

```text
Base <=30s
+ Extension #1 <=30s
+ Extension #2 <=30s
```

Do not claim unbounded extension.

## 24.3 Hard frame + raw multimodal reference preflight

The current BytePlus documentation clearly lists both hard-frame and multimodal workflows but does not establish a universal direct-mix contract.

Default:

```text
directHardFrameReferenceMixVerified = false
```

Resolve through:

```text
prefer_hard_frames
prefer_references
prebake_hard_frame
split_generation
block
```

Only a verified endpoint may set `provider_verified_mix`.

## 24.4 Real-human references on BytePlus

Reference images/videos containing real human faces require approved LAS material-library handling.

The adapter MUST validate:

```text
containsRealHumanFace
materialLibraryApproved
materialLibraryAssetId
```

and send:

```text
asset://<ASSET_ID>
```

when applicable.

Do not submit direct unapproved real-human media.

## 24.5 Seedance reference labels

```text
@Image 1
@Video 1
@Audio 1
```

Bind each to explicit:
- identity;
- product;
- place;
- motion;
- camera;
- voice;
- music;
- style;
- blocking.

## 24.6 Seedance QC

Require:
- hard-frame adherence;
- reference retention;
- raw motion/camera transfer;
- voice/audio continuity;
- exact dialogue/lipsync;
- model-specific resolution legality;
- reference-budget legality;
- material-library authorization;
- timestamp/extension continuity.


# 25. LTX 2.5 — Cloud + Local First-Class Contract

LTX-2.5 MUST be modeled as two execution surfaces with separate capability truth.

Cloud:

```text
ltx-2-5-fast
ltx-2-5-pro
```

Local/open source:

```text
Lightricks/LTX-2.5
```

## 25.1 Cloud routes

Verified LTX-2.5 Cloud modes:

```text
text_to_video
image_to_video
first_last_to_video
audio_to_video
```

Cloud 2.5 MUST NOT inherit family endpoints that the current model matrix marks unsupported:

```text
retake
extend
reframe
```

## 25.2 Fast versus Pro

`ltx-2-5-fast`:
- up to 4K;
- up to 20 seconds only for legal resolution/FPS combinations;
- use exact provider matrix preflight.

`ltx-2-5-pro`:
- 720p / 1080p;
- 6 / 8 / 10 seconds;
- 24 / 25 / 50 fps;
- preferred for quality-first short clips.

Do not use one family-wide duration/resolution limit.

## 25.3 Start / Last Frame

Cloud:

```text
start_frame → image_uri
end_frame   → last_frame_uri
```

Rules:
- Last Frame requires Start Frame.
- Start Frame is literal State #0.
- `duration=null` automatic duration cannot be combined with Last Frame.

## 25.4 Audio-to-Video semantics

LTX A2V accepts one exact soundtrack driver:

```text
audioDriverAssetId
```

or:

```text
providerHints.ltx.useAsAudioDriver = true
```

Do not reinterpret arbitrary `voice_reference`, `music_reference` or `audio_reference` as `audio_uri` unless the user/workflow intends that file to become the actual soundtrack and timing source.

A2V duration is driven by input audio and must pass model/resolution maximum-duration preflight.

## 25.5 Generic image/video/audio references

Cloud LTX-2.5 does not expose a generic soft multi-reference bundle.

For Character/Product/Place refs use:

```text
prebake_start_frame
derive_to_prompt
local_ic_lora
fallback_provider
block
```

Production default for visual identity refs:

```text
refs
→ approved Start Frame
→ LTX I2V
```

Raw arbitrary motion/reference video is not a cloud 2.5 input. `must_use_raw` MUST route to a verified local workflow/fallback or block.

## 25.6 Native multi-shot prompt contract

LTX-2.5 supports native connected multi-shot.

SmartAIHub retains structured Shot Plans internally but the final LTX prompt MUST be compiled into chronological prose with explicit transitions such as:

```text
A hard cut transitions to...
A match cut connects to...
The view dissolves into...
```

At every cut, re-state recurring subjects and explicitly carry:
- product/character identity;
- wardrobe;
- environment/lighting;
- voice;
- music/ambience continuity.

Do not output the final provider prompt as a numbered screenplay shot list.

## 25.7 Camera motion

Verified Cloud enum values:

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

Use the enum only when it matches the creative move; otherwise keep the richer camera instruction in prompt prose.

## 25.8 Local / Worker / ComfyUI

Official built-in LTX-2.5 ComfyUI templates:

```text
video_ltx2_5_t2v
video_ltx2_5_i2v
video_ltx2_5_flf2v
```

Supported execution routes:

```text
local_comfyui
worker_comfyui
local_python
```

Local advanced modes:

```text
local_ic_lora
local_extension
```

are CONDITIONAL and require explicit workflow verification.

Do not assume an LTX-2.3 IC-LoRA/control adapter is automatically valid on LTX-2.5.

## 25.9 Local structural preflight

When explicit local parameters are supplied:

```text
width / height divisible by 32
2-stage final width / height divisible by 64
num_frames = 8k + 1
```

Prompt enhancer is optional and MUST NOT change verified claims, exact dialogue or mandatory constraints.

## 25.10 LTX-specific QC

Require:

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


# 25. OpenAI Agents SDK Runtime Contract

Skill v11 is a Hybrid Agent Skill. SmartAIHub Core is authoritative for workflow order, DB state, tenant isolation, assets, approvals, credits, idempotency, provider submission and publishing. OpenAI Agents SDK is the bounded reasoning runtime for specialist stages only.

Mandatory runtime invariants:
- structured `StageOutputEnvelope`;
- canonical JSON-Schema validation before persist;
- no paid/irreversible Agent tools;
- durable Core checkpoint is canonical, Session is optional history;
- asset authorization before input and after output reference;
- bounded turns, contract retries and token budgets;
- cross-shot continuity ledger;
- provider capability truth from profiles/adapters;
- provider-neutral Prompt Intent before provider-specific compilation;
- Storyboard / High-cost / Publish approval gates owned by Core.

Reference implementation: `src/smartaihub_video_director/`.
Full guide: `docs/USER_GUIDE_TH.md`, section 37.
