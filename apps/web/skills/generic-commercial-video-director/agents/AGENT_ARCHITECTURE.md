# Agent Architecture v10 — Multi-shot & Temporal Extension

## 1. Authority model
SmartAIHub application code owns stage ordering, persistence, approvals, budgets, retries, idempotency and provider dispatch. Agents return bounded structured decisions.

## 2. New temporal hierarchy
Do not conflate:
`Sequence → Logical Shot → Generation Segment → Prompt Turn`.

A 15s logical shot may map to two generation segments. A 40s sequence may map to five extension turns.


## 2A. PromotionTargetResolverAgent

Runs immediately after early scene/reference semantics and before ProductIntelligence.

Purpose:
- determine what the commercial/narrative target actually is;
- prevent the workflow from forcing a physical-product branch;
- reinterpret an environment image as promoted-place evidence when the idea is about the place;
- decide how to proceed when the promoted target has no dedicated visual reference.

Outputs:
`schemas/stages/promotion-target.schema.json`.

Resolution branches:
- physical product;
- place/venue;
- service/business;
- digital product;
- event/experience;
- property/accommodation;
- food/beverage;
- brand narrative;
- narrative only;
- blocked.

The agent may recommend a branch, but application code validates the resulting stage state.

## 2B. TargetEvidenceAgent

Builds the evidence ledger for the resolved target.

For products:
- dedicated product reference;
- product visible inside Start/Scene images;
- verified text facts;
- generic/unbranded fallback;
- missing exact brand visual.

For places:
- scene/place reference images;
- visible areas/features;
- signage;
- supplied business facts;
- research-verified facts;
- unseen/unverified facilities.

Critical rule:
`verified factual identity` and `verified visual identity` are separate states.

## 2C. PlaceExperienceAgent

Runs instead of `ProductMechanismAgent` when branch=`place_experience`.

Outputs:
`schemas/stages/place-experience.schema.json`.

Plans:
- spatially truthful visitor journey;
- visible feature highlights;
- presenter/visitor blocking;
- service interactions;
- place proof moments;
- shot/camera opportunities;
- CTA.

It MUST NOT hallucinate unseen parts of a real venue as factual.


## 3. Target-specific reasoning roles

### ProductIntelligenceAgent — physical-product branch only
Combines context, family classification, behavior primitives and provisional mechanism. Unknown products fall back to primitive composition.

### ResearchAgent
Verifies named-product usage, features, safety, UI/mechanism and claims when required.

### ProductMechanismAgent — physical-product branch only
Builds the evidence-bound product state/mechanism model.

## 4. SequencePlannerAgent
Runs after breakdown and before detailed shot design.

Inputs:
- expanded intent;
- product mechanism;
- dialogue/VO;
- target total duration;
- allowed logical shot durations (e.g. 8/10/15);
- required proof beats.

Outputs `sequence-plan.schema.json`:
- number/order of shots;
- logical shot durations;
- narrative role per shot;
- global timeline;
- transitions;
- beat/proof coverage.

It plans editorial meaning, not provider chunks.

## 5. ShotPlanner / DemonstrationPlanner / VisualExplanationAgent
Each logical shot gets physical state transitions, product-use correctness, camera, dialogue mapping and VFX/UI plan.

## 6. GenerationStrategistAgent
Chooses provider/model using both creative and temporal constraints.

Critical rule: a model that can generate 10s directly is not automatically suitable for a 15s continuous logical shot unless verified extension or another duration strategy exists.

## 7. TemporalPlannerAgent
Maps approved logical shots to generation execution.

Strategies:
- direct single generation;
- provider-native multi-shot;
- independent generation + external assembly;
- extension chain;
- hybrid.

It reads `model-capability.schema.json.temporalPlanning`.

### Duration solver
Given base duration, target duration, extension min/max/allowed values and max cumulative duration, compute a legal partition.

Example Omni target 40s from 8s base:
- remainder = 32s;
- extension legal range = 3–10s;
- min turns = 4;
- balanced legal partition = `8,8,8,8`;
- chain = `8 + 8 + 8 + 8 + 8 = 40`.

If exact target is impossible, return nearest reachable duration and require policy/user decision.

## 8. PromptChainAgent
Produces `prompt-chain.schema.json`.

### Base segment prompt
Must contain:
- source/reference mapping;
- Start State;
- continuity contract;
- local timeline;
- beat/action/dialogue;
- end bridge state.

### Extension prompt
Must contain:
- continuation directive;
- current end state;
- no-repeat/no-reset directive;
- same-shot vs planned-cut topology;
- only new beats;
- extension-local timecodes;
- audio/dialogue continuation;
- next bridge state.

## 9. Omni Flash-specific temporal handling
The adapter profile records verified current constraints.

When extending a model-generated chain, prefer persisted provider interaction state (`previous_interaction_id`) for continuity and dialogue.

If extending an uploaded talking video, do not plan new spoken dialogue because current Omni limitations do not support that route.

Because final input frames may be modified to blend the extension, the PromptChainAgent should avoid exact product UI/label/CTA and dialogue word boundaries at the seam where possible.

## 10. SeamQCAgent responsibility (logical role)
This may be implemented inside QCAgent. It compares adjacent segments and checks:
- duplicate/replayed action;
- product/cast state continuity;
- camera motion continuity;
- audio/music/room tone;
- dialogue progression;
- visual seam artifacts;
- tail rewrite damage.

## 11. Sequence QC
QCAgent also verifies:
- planned vs actual cumulative duration;
- required narrative/proof beat coverage;
- shot order;
- CTA/hero ending;
- no contradictory product mechanism or state.

## 12. RepairAgent temporal actions
May choose:
- regenerate one base segment;
- re-extend from last good provider interaction ID;
- replace one extension prompt;
- adjust extension duration;
- move a cut;
- route a shot to another model;
- split a shot;
- composite UI/label after the chain.

## 13. Execution profiles

### Fast
- ProductIntelligenceAgent
- Creative+Sequence Agent
- ShotDesign Agent
- Generation+Temporal+PromptChain Agent
- QC / Repair

### Balanced
Separate Product, Creative, Sequence, Shot, Generation/Temporal, QC.

### Production
Separate SequencePlanner, TemporalPlanner and PromptChainAgent when duration, spend, dialogue, product fidelity or extension chains are material.

## 14. State persistence additions
Persist:
- sequencePlanVersion;
- logical shot IDs and durations;
- generation chain IDs;
- prompt turn index;
- previous provider interaction ID;
- cumulative duration;
- segment Start/End State;
- completed narrative/action beat IDs;
- seam QC report;
- last good restart point.

## 15. Fail-closed rules
- Do not use extension if provider numerical extension limits are unknown.
- Do not force a 15s continuous shot into two cuts without explicit adaptation approval.
- Do not add dialogue on an extension route the provider does not support.
- Do not place global timecodes into extension prompts when provider semantics reset local time to 0.
- Do not assume native multi-shot is equivalent to externally controlled editorial shots.


# 16. MiniMax H3 specialist responsibilities

These are logical responsibilities; production mode may combine several into fewer LLM calls.

## H3ReferencePlannerAgent

Consumes:
- raw SmartAIHub image/video/audio assets;
- Start/End Frame authority;
- provider-use policy;
- product/cast/reference semantics.

Returns:
`schemas/providers/minimax-h3/reference-plan.schema.json`

Responsibilities:
- choose T2VA / I2VA / L2VA / FL2VA / Ref2VA;
- assign stable H3 reference labels;
- enforce H3 media limits;
- detect hard-frame vs Ref2VA conflict;
- choose derivation/prebake/split strategy;
- never silently discard `must_use_raw` references.

## H3PromptCompilerAgent

Compiles the canonical SmartAIHub shot state into H3's native prompt dialect.

Modes:
- base compiler for T2VA/I2VA/L2VA/FL2VA;
- full-reference compiler for Ref2VA.

It must preserve:
- exact dialogue;
- speaker identity;
- product claims;
- shot timing;
- reference semantics.

## H3ContextIRValidatorAgent

When official H3 Context-IR is enabled:
1. send the approved multimodal context;
2. receive enhanced structured prompt;
3. diff it against canonical state;
4. reject or repair unsupported changes.

Validation targets:
- dialogue;
- product facts/claims;
- reference IDs and relationships;
- Start/End intent;
- shots/cut timestamps;
- product/cast locks.

## H3AudioDirectorAgent

Plans:
- native H3 speech;
- diegetic sound;
- native music;
- reference audio;
- voice-timbre mapping;
- external fallback.

For variable-language dialogue such as Thai, set the 768P ASR/lip-sync QC gate before expensive 2K finalization.

## H3ContinuationPlannerAgent

H3 long-form continuation is a chain of standalone Ref2VA clips.

Persist:
- source segment;
- extracted tail asset;
- tail duration;
- prior end state;
- remaining beats;
- completed actions;
- audio/dialogue state;
- seam QC;
- assembly instructions.

Do not model H3 continuation as Omni-style native append.

## H3ResolutionFinalizerAgent

Runs only after content passes at 768P.

Responsibilities:
- choose direct 2K vs H3-Regenerate-2K;
- block H3-Max from 2K routing;
- compare 2K result against approved 768P content;
- hand off to label/UI/VFX compositor.

## Local H3 Worker

For local execution:
- select FL2VA checkpoint family for base/hard-frame modes;
- select Ref2VA checkpoint for raw multimodal reference mode;
- run through SGLang/vLLM/Diffusers/ComfyUI adapter;
- return normalized job/result metadata to SmartAIHub;
- optionally route approved 768P to hosted Regenerate-2K.

The agent does not get unrestricted filesystem, tenant or billing authority. Those remain SmartAIHub tool/runtime concerns.


# 17. Grok Imagine Video 1.5 specialist responsibilities

## GrokReferencePlannerAgent

Resolves:
- no media → T2V;
- Start Frame → I2V;
- reference images/voices → Reference-to-Video;
- Start + references → explicit conflict policy.

It also:
- caps image refs at 7;
- caps preset voices at 3;
- derives unsupported motion/video refs to prompt guidance or provider fallback;
- separates public preset voices from trusted-partner custom audio refs.

## GrokPromptCompilerAgent

Compiles:
- State #0 continuation prompt for Image-to-Video;
- explicit `<IMAGE_1>...` bindings for Reference-to-Video;
- `<AUDIO_0>...` voice bindings;
- exact dialogue;
- camera/action chronology;
- continuity locks.

## GrokAspectPreflightAgent

For Start Frame workflows:
- compares source and target aspect ratio;
- recommends crop/pad/resize;
- blocks accidental provider stretching for exact compositions.

## GrokFamilyRouterAgent

Distinguishes:
- `grok-imagine-video-1.5` for T2V / Start Frame / Reference-to-Video;
- `grok-imagine-video` for current xAI edit/extend workflow.

It must not merge the capabilities of these model IDs.

## GrokQCRepairAgent

Checks and repairs:
- start-frame adherence;
- reference retention;
- incorrect subject/reference binding;
- identity/product/place drift;
- audio/lipsync;
- stretched composition;
- invalid 1080p reference-mode request.


# 18. Wan / FLUX / Seedance specialist responsibilities

## WanReferencePlannerAgent

Resolves:
- hard first/last frame;
- image/video/audio/file/link references;
- hard-frame vs reference-family conflict;
- reference budget;
- input-video + output duration preflight.

Returns `schemas/providers/wan3.0/reference-plan.schema.json`.

## WanPromptCompilerAgent

Compiles:
- reference bindings;
- native time-ranged multi-shot structure;
- edit/extend task intent;
- exact dialogue;
- audiovisual continuity.

## FluxKeyframePlannerAgent

Separates:
- literal timeline keyframes;
- generic soft identity/product/place references;
- actual V2V continuation source;
- arbitrary motion/audio references.

It MUST NOT silently treat a portrait/product packshot as a FLUX keyframe.

## FluxDraftFinalizerAgent

Runs:
`draft → QC/selection → draft_enhance`.

It preserves the chosen take and then optionally routes final content to video upscale.

## SeedanceReferencePlannerAgent

Loads model-specific limits for:
- 2.0;
- 2.5.

It validates:
- hard-frame/reference conflict;
- image/video/audio budget;
- audio-only legality;
- material-library requirements for real-human refs;
- resolution legality.

## SeedanceLongFormPlannerAgent

For 2.5:
- plans up to 30s direct;
- preserves `return_last_frame`;
- allows at most two automatic extension turns under the current conservative contract;
- carries State Ledger, dialogue/audio state and remaining beats;
- runs Seam QC after every continuation.

## ProviderTruthRule

Wan, FLUX and Seedance capability truth MUST come from versioned provider profiles.

Agents may recommend an adaptation but may not:
- invent unsupported provider fields;
- merge capability from another model/version;
- bypass a provider-reference conflict;
- downgrade `must_use_raw` silently;
- bypass BytePlus real-human material-library authorization.


# 19. LTX 2.5 specialist responsibilities

## Ltx25RouteResolverAgent

Separates:
- LTX Cloud Fast/Pro;
- Local ComfyUI;
- Worker ComfyUI;
- Local Python pipelines.

It MUST NOT merge cloud and local capabilities.

## Ltx25ReferencePlannerAgent

Resolves:
- Start Frame;
- Last Frame;
- one exact A2V soundtrack driver;
- generic Character/Product/Place images;
- generic motion/video refs;
- generic voice/music refs.

Cloud generic references are routed through:

```text
prebake_start_frame
derive_to_prompt
local_ic_lora
fallback_provider
block
```

## Ltx25DurationPreflightAgent

Validates the exact:

```text
model
resolution
fps
duration
```

matrix before credit reservation/provider submission.

It also validates model/resolution-specific A2V audio length.

## Ltx25PromptCompilerAgent

Converts canonical SmartAIHub structured shots to LTX-native chronological prose.

At every cut it specifies:
- transition type;
- recurring subject identity;
- product/scene state;
- audio continuity.

It does not emit a final screenplay-like numbered shot list.

## Ltx25LocalWorkflowAgent

Routes official built-ins:

```text
video_ltx2_5_t2v
video_ltx2_5_i2v
video_ltx2_5_flf2v
```

Advanced `local_ic_lora` / `local_extension` require explicit workflow verification and Worker authorization.

## Provider truth rule

Application code MUST enforce:
- Cloud 2.5 Retake/Extend/Reframe = unsupported;
- Last Frame requires Start Frame;
- Auto duration incompatible with Last Frame;
- A2V audio is exact soundtrack semantics;
- local `8k+1` frame rule;
- local dimension divisibility;
- `must_use_raw` references are never silently downgraded.
