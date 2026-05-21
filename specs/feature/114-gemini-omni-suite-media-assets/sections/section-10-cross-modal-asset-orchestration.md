# Section 10: Cross-Modal Asset Orchestration

## Goal

Plan, prepare, and verify all required production assets before final video generation.

The system should use every suitable Media Studio capability, not only Gemini Omni, to create production inputs: product images, keyframes, reference videos, character assets, voice/audio assets, narration, sound direction, and storyboard-ready clip plans.

## Scope

Add a `ProductionAssetPlan` contract:

- `assetPlanId`
- `productionRunId`
- `nodes`
- `dependencies`
- `providerCandidates`
- `qualityRequirements`
- `costEstimate`
- `status`
- `contractVersion`

Each asset node should include:

- asset kind: image, product_image, keyframe, reference_video, character, voice, audio, tts, sound, music, storyboard_scene, video_clip, final_render
- intended role in the story
- source: uploaded, library, marketplace capture, Feature 115 handoff, generated, provider asset, or manual
- candidate providers/models
- selected provider/model when decided
- dependencies
- expected output format
- required quality checks
- retry/revision policy
- estimated credits/cost
- provenance and evidence IDs where applicable

The orchestration layer should be model-capability aware:

- image models can create keyframes, product-scene references, mood frames, thumbnails, and visual concepts
- Gemini Omni Character can create reusable character assets when its contract fits the goal
- Gemini Omni Audio can create reusable voice/audio assets when needed by Gemini Omni Video or Character
- existing TTS/audio systems can prepare narration or voiceover assets when they are a better fit
- existing video models can create draft clips, style references, or final clips when suitable
- Gemini Omni Video, Seedance 2, or another qualified video model can be selected as the final render provider

Do not hard-code Gemini Omni as the only final path. The orchestration should choose based on provider capability, quality fit, reference needs, duration/aspect support, cost, availability, and policy.

## Asset Readiness Rules

Before final generation, the asset plan must know:

- which assets already exist
- which assets must be generated
- which assets require user confirmation
- which assets are blocked by missing evidence, policy, budget, or provider capability
- which assets can be replaced by a fallback provider
- which assets are optional quality enhancers

For marketplace product videos, the asset plan must preserve product truth:

- selected product images must match the product, variant, package, and use case
- product claims must reference Feature 115 or user-approved evidence
- generated lifestyle/keyframe images must not invent unsupported product features
- customer journey stage must remain attached to scene intent

## UX Requirements

The Production tab should show an Asset Plan timeline or checklist:

- required assets
- optional enhancement assets
- current readiness
- owner/provider
- estimated cost
- quality status
- next action

Users should be able to:

- approve or reject generated planning assets before final render
- replace an asset with a library/uploaded asset
- send a specific missing asset to the appropriate Image, Video, Audio, or Gemini Omni asset workflow
- see why an asset is required
- see when a cheaper or safer fallback provider is chosen

## Files Likely Touched

- shared production asset plan types
- Media Studio production orchestration service
- asset readiness validators
- provider capability registry or selector
- Feature 115 handoff adapter
- Media Studio Production tab UI
- tests for plan generation, dependency resolution, and readiness

## Tests

- Asset plan creates dependency graph for single-shot, multi-shot single video, and storyboard productions.
- Missing required character, audio, keyframe, product image, or narration assets block final render until resolved.
- Optional enhancement assets can be skipped without blocking final render.
- Provider selection chooses a provider that satisfies required capability constraints.
- Product evidence and Feature 115 IDs are preserved in product asset nodes.
- Unsupported claims, wrong-product images, and customer-journey drift block or revise the affected nodes.
- Asset plan can route required asset creation to existing Image, Video, Audio, Gemini Omni Character, or Gemini Omni Audio workflows.
- Cost estimate includes asset preparation and final render separately.
- Planning retries do not submit final provider jobs.

## Completion Criteria

- Production runs have a structured asset dependency graph before final render.
- The user can understand what needs to be created and why.
- Final render is blocked when required assets or evidence are missing.
- Gemini Omni and non-Gemini providers can both participate in the same production run.

