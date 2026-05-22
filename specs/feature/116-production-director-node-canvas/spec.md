# Production Director Node Canvas

## Status

Draft for implementation.

## Summary

Rework Media Studio Production Director into a true planning workspace, not a fourth media-generation form.

The Production tab is a goal-first production planning surface inspired by modern visual AI workspaces such as node-based "spaces" canvases. It lets users define the creative goal, drag in existing context assets, choose a planning skill, generate a production flow, edit that flow visually, then approve it before any expensive image, audio, video, or final-render generation begins.

This feature supersedes the current interim Production Director placement where the Production tab pushes the Image/Video/Audio prompt UI below it. In the final UX, Production is an exclusive planning workspace. Video Shot, Image, Video, and Audio remain separate execution/configuration workspaces and should not render underneath Production.

## Depends On

- Feature 112: Storyboard Studio skill QA loop concepts.
- Feature 114: Gemini Omni Suite media assets, production runs, planner/verifier skills, output projection to Storyboard Review and Video Edit.
- Feature 115: Marketplace capture/product evidence and storytelling handoff.
- Existing Media Studio library/history/marketplace side panels.
- Existing React Flow dependency already present in the application.
- Existing skill runtime and media-generation provider routing.

## Product Problem

The current Production Director UI still behaves like an extended form inside Media Studio. It can save goals and run planning skills, but it does not match the user's mental model for cinematic production planning:

- users want to describe the goal first, not fill provider-like fields;
- users want to bring in assets visually from the library, marketplace, characters, and audio;
- users want to see the resulting plan as a connected workflow;
- users want to revise or reconnect steps before spending credits;
- users should not see Image tab prompt UI underneath the Production tab;
- planning should coordinate Image, Video, Audio, Character, Storyboard Review, and Video Edit without being owned by any one media tab.

## Goals

1. Make Production Director a first-class planning canvas in Media Studio.
2. Keep the Production tab focused on `Goal -> Context Assets -> Planning Skill -> Editable Flow -> Approval`.
3. Let users drag assets from the right-side search/library panel into Production Director:
   - characters/cast,
   - product images and marketplace evidence,
   - scene/mood/background references,
   - existing generated images/videos,
   - voice/audio/music references,
   - product records from Feature 115.
4. Add character search to the right-side library/search panel.
5. Use selected planning skills to send a large structured context package to the selected LLM model.
6. Generate a React Flow production canvas that represents the work plan as editable nodes and edges.
7. Introduce a `Video Shot` / `Shot Builder` workspace for configuring one storyboard shot as a group of node steps.
8. Allow users to edit shots, edit nodes, reconnect edges, lock assets/scenes, request revisions, and re-run the planner before approval.
9. Preserve Image, Video, and Audio tabs as execution surfaces that can be launched from shot/node configuration with prefilled context.
10. Keep provider details such as Gemini Omni `character_ids`, `audio_ids`, and `video_list` out of normal Production UI.
11. Ensure no provider-generation credits are reserved until the plan passes verification and user approval.

## Non-Goals

- Replacing Image, Video, or Audio tabs.
- Replacing Storyboard Review or Video Edit.
- Implementing a generic infinite workflow automation engine for non-media tasks.
- Exposing LangGraph, Agency Swarm, OpenAI Agents SDK, or provider payload keys to normal users.
- Auto-running every node immediately after the planner returns a canvas.
- Making Magnific compatibility or cloning Magnific UI. The reference is the node-canvas interaction pattern, not a product clone.

## UX Architecture Decision

Production Director must become a dedicated `Production` workspace inside Media Studio, with a companion `Video Shot` workspace for configuring individual shots:

- Top-level Media Studio tabs: `Production`, `Video Shot`, `Image`, `Video`, `Audio`.
- When `Production` is active, only Production planning UI is rendered in the main content area.
- Prompt composer/generate controls from Image/Video/Audio must not appear below the Production panel.
- The Production workspace has its own project header, asset/context intake area, skill selector, and node canvas.
- The Video Shot workspace is the focused editor for one shot group. It appears before Image/Video because it configures shot-level intent before users configure lower-level media generation nodes.
- Image/Video/Audio execution tabs can be opened from plan nodes, but they remain separate tabs.

The required mental model is:

```text
Production Project
  -> Story / Campaign Goal
  -> Storyboard Sequence
  -> Video Shots
  -> Per-shot Nodes
  -> Existing tool configuration surfaces
```

## Primary User Flow

1. User opens Media Studio -> Production.
2. User creates or opens a Production Project.
3. User enters a concise goal:
   - project name,
   - what kind of output they want,
   - audience/platform,
   - story or campaign idea,
   - constraints or must-have notes.
4. User drags required context assets into the Production workspace:
   - character images or existing Gemini Omni Character assets,
   - product images or marketplace products,
   - mood/scene/background references,
   - audio or existing Gemini Omni Audio assets,
   - prior generated media or library files.
5. User selects a planning skill such as `media-production-storyboard-planner` or a future specialized planner skill.
6. User selects an LLM model or leaves model selection on Auto.
7. User clicks `Create Plan Canvas`.
8. The skill receives:
   - the goal brief,
   - selected assets with provenance,
   - product truth/evidence,
   - available SmartSpecPro tools/providers/capabilities,
   - budget/quality constraints,
   - desired downstream targets.
9. The skill returns:
   - production bible,
   - storyboard/shot plan,
   - ordered video shots,
   - asset plan,
   - generation/tool plan,
   - editable flow nodes,
   - flow edges,
   - risk/warning list,
   - cost/time estimate.
10. UI renders the plan as a React Flow canvas.
11. User can:
    - open a shot in Video Shot workspace,
    - edit shot-level cast, product, action, script, camera, duration, and references,
    - edit node details,
    - drag/reposition nodes,
    - reconnect edges,
    - add/remove nodes,
    - lock approved nodes,
    - request targeted replanning,
    - approve the plan.
12. Approved plan can hand off to:
    - Storyboard Review for final storyboard review/render flow,
    - Video Edit for manual editing,
    - Image/Video/Audio tabs for manual asset creation,
    - provider-specific director skills such as Gemini Omni Video Director.

## Production Workspace Layout

### 1. Project Header

The header should show:

- selected project name,
- production run status,
- last saved time,
- save button,
- project search/open button,
- new project button,
- compact preview thumbnails when available.

Project search must show:

- title,
- short description,
- status,
- updated time,
- thumbnail from generated media, storyboard preview, product image, or first visual asset,
- platform/audience badges where available.

### 2. Goal Brief Panel

The goal panel should be intentionally short and readable:

- Project name.
- Goal / concept textarea.
- Audience and platform chips.
- Output type selector.
- Duration/aspect ratio/language.
- Brand/product truth notes.
- Cinematic or creative direction.
- Constraints / avoid list.

Do not duplicate the Image/Video/Audio prompt composer here.

The goal panel should support:

- templates,
- AI clarification for missing high-impact decisions,
- compact mode after plan generation,
- version history.

### 3. Context Asset Drop Zones

Production should have clear drop zones:

- `Cast / Characters`
- `Products / Claims`
- `Scene & Mood References`
- `Audio / Voice / Music`
- `Existing Generated Media`
- `Output Targets`

Users can drag from the right library/search panel or upload directly into a drop zone.

Each dropped asset card must show:

- thumbnail or media icon,
- display name,
- source: library, generated history, marketplace, Gemini Omni asset, upload,
- role selector,
- provenance/evidence badge when available,
- lock/remove controls,
- warning if the asset is missing public URL/provider ID required by a later node.

### 4. Planning Skill Selector

Production uses skill selection for planning only, not normal media prompt generation.

The selector should list skills tagged or configured as:

- `production_planning`,
- `storyboard_planning`,
- `campaign_planning`,
- `cinematic_planning`,
- `marketplace_storytelling_planning`,
- `provider_director_planning`.

The default can be `media-production-storyboard-planner`.

Each skill card should show:

- name,
- short purpose,
- supported asset types,
- output contract version,
- whether verifier is available,
- model compatibility if constrained.

### 5. Model Context Panel

Because modern LLMs can support very large context windows, the UI should let the planner consume rich context without forcing the user to micromanage fields.

The system should assemble a `ProductionPlanningContextPack`:

- normalized goal,
- selected asset manifests,
- product storyboard assets,
- product truth/evidence summaries,
- `ProductClaimEvidenceMap` with claim risk and approval state,
- marketplace capture insights,
- tool/provider capability registry,
- pricing/credit guardrails,
- existing production run history,
- selected skill schema,
- downstream target requirements.

The context pack should prefer structured summaries and selected evidence over raw noisy payloads. Raw OCR/DOM/marketplace capture data may be attached only when the selected model/context budget permits, provenance is preserved, and Feature 115 raw-capture/debug settings explicitly allow that data to leave the extension/local review boundary.

### 6. Plan Canvas

The lower workspace is a React Flow canvas. It should appear after the first plan is created, and it can remain empty with a friendly drop target before planning.

Required canvas behavior:

- pan/zoom,
- fit view,
- minimap or page overview when useful,
- selectable nodes,
- editable node drawer,
- reconnectable edges,
- add node from toolbar,
- delete node with undo,
- lock node,
- node status badges,
- validation warnings,
- save/load layout.

The canvas background should use a subtle grid/dots to communicate a workspace. Avoid rendering it as nested dashboard cards.

## Video Shot Workspace

Production Director should treat a shot as the main unit of storytelling, planning, and review. A shot is not the same as a final provider video request; it is a storyboard unit that can contain multiple internal steps.

A Production Project can contain many shots. Each shot can contain a different set of child nodes:

- a shot may need script + image + TTS + video + QA;
- a shot may need only video + QA;
- a product-review shot may need product reference + script + image/video + product truth QA;
- a lip-sync shot may need character + script + TTS/audio asset + video;
- a singing shot may need character + music/voice + video;
- a b-roll shot may need scene reference + video only.

### Shot Builder Tab

Add a `Video Shot` tab before Image/Video. It is a dedicated configuration surface for one selected shot.

When no shot is selected, it shows:

- ordered storyboard shot list,
- thumbnails/previews,
- status per shot,
- missing requirements,
- `Open Shot` actions.

When a shot is selected, it shows:

- shot title and purpose in the story,
- story beat: hook, setup, demo, proof, transition, payoff, CTA, b-roll, custom,
- shot type: presenter/talking head, dialogue, action, product review/demo, voiceover scene, lip sync, singing/music, b-roll/cinematic insert, transition, custom,
- characters/cast: how many people, which characters, roles, wardrobe/identity notes, and whether character asset creation is required,
- product involvement: no product, product shown, product used/demoed, product reviewed, product before/after, packshot/CTA,
- audio intent: no audio, voiceover, dialogue, lip-sync dialogue, singing, music bed, sound effects,
- camera/visual intent: framing, camera movement, lighting/mood, location/background, reference images, source/reference video, continuity notes,
- source video reference: optional single source video for video-to-video/edit workflows, with role (`motion`, `edit_source`, `style_pacing`, `continuity`), trim start/end seconds, provider payload key such as `video_list`, and provider warnings when the selected model does not support video references,
- duration and aspect ratio,
- required child nodes,
- child node mini-canvas or ordered step list,
- readiness/credit estimate for that shot,
- `Save Shot`,
- `Apply to Nodes`,
- `Open Image/Video/Audio Node`,
- `Back to Production Canvas`.

### Shot As Group Node

In the Production canvas, a shot should appear as a group/container node:

- `video_shot`: represents one storyboard shot and owns a child subgraph.

The `video_shot` node can be collapsed or expanded:

- collapsed: show shot number, title, thumbnail, status, duration, key assets, warnings;
- expanded: show child nodes such as script, image, TTS, video, QA;
- double-click or `Configure Shot` opens the Video Shot tab.

The planner can create `video_shot` nodes first, then create child nodes inside each shot based on what the shot needs.

### Storyboard Sequence

The final story is the ordered sequence of `video_shot` nodes. The system should support:

- reorder shots,
- duplicate shot,
- split shot,
- merge shots,
- lock approved shot,
- revise only one shot,
- regenerate child nodes for one shot without changing other shots,
- show continuity warnings across neighboring shots,
- export ordered shots to Storyboard Review and Video Edit.

Storyboard Review and Video Edit should receive shot order, shot metadata, clips, audio, captions, and readiness state.

## Node Types

The planner should return typed nodes. Node types are not just visual labels; each node defines what tool, skill, tab, configuration, inputs, outputs, and readiness rules are attached to that step.

The canvas should support multiple instances of the same execution type. A campaign may contain several image nodes, several video nodes, and several audio nodes, and every node must keep its own independent configuration snapshot.

### Planning and Reasoning Nodes

- `goal_brief`: creative objective, audience, platform, success criteria, constraints.
- `context_summary`: LLM-generated summary of selected assets, product truth, brand notes, and existing project context.
- `story_strategy`: narrative strategy, customer journey, creative angle, hook/payoff logic.
- `script_generation`: calls an LLM skill/model to write voiceover, dialogue, presenter lines, product review script, or captions.
- `script_revision`: targeted rewrite of a selected script, line, CTA, or scene narration.
- `storyboard_planning`: produces scene list, storyboard beats, shot count, timing, and dependencies.
- `video_shot`: group/container node representing one storyboard shot and its child subgraph.
- `shot_breakdown`: turns storyboard scenes into shot-level instructions for image/video/audio generation.
- `prompt_packaging`: converts approved story/shot data into model/tool-ready prompts while preserving product truth and asset references.

### Context and Source Asset Nodes

- `character_reference`: selected character/person reference, Gemini Omni Character asset, or image intended to become a character.
- `product_reference`: product image, marketplace product, product claim/evidence package, packshot, or SKU record.
- `scene_reference`: mood, location, background, lighting, composition, or cinematic style reference.
- `brand_reference`: brand guideline, tone, logo, color, style, claim policy, or CTA context.
- `audio_reference`: existing narration, voice sample, music, sound, or Gemini Omni Audio asset.
- `source_video_reference`: existing video clip used as source video, continuity reference, or video-to-video input.

### Asset Creation Nodes

- `character_create`: creates a reusable character asset, for example Gemini Omni Character. Opens the Character wizard and stores returned provider asset ID.
- `voice_asset_create`: creates a reusable voice/audio asset, for example Gemini Omni Audio. Opens the Audio asset wizard and stores returned provider asset ID.
- `image_generate`: creates one or more images. Opens the Image tab with this node's prompt, model, references, aspect ratio, style, and dynamic fields preloaded.
- `image_edit`: edits, expands, composites, or refines an existing image if supported by selected tools.
- `image_upscale_enhance`: enhances/upscales/restores an image if supported by selected tools.

### Audio Execution Nodes

- `text_to_speech`: creates narration/dialogue from script text. Opens the Audio tab in TTS mode with node-specific script, voice, speed, emotion, and language.
- `music_generate`: creates background music or music bed. Opens the Audio tab in music/sound workflow with prompt and duration.
- `sound_effect_generate`: creates sound effects or ambience. Opens the Audio tab in sound effects workflow.
- `voice_change`: changes an existing voice recording. Opens the Audio tab in voice changer workflow with source audio and target voice settings.
- `speech_to_text`: transcribes existing audio/video for script alignment, caption, or verification.
- `caption_subtitle`: creates captions, subtitles, burned-in text guidance, SRT/VTT export, or localized subtitle variants.
- `voice_isolate_cleanup`: isolates/cleans voice when supported by existing audio tools.

### Video Execution Nodes

- `video_generate`: creates video from prompt and references. Opens the Video tab with node-specific model, prompt, image/video refs, duration, aspect ratio, resolution, characters, audio refs, and provider fields preloaded.
- `image_to_video`: specialized video node where selected upstream image node outputs become required first-frame/reference inputs.
- `video_to_video`: specialized video node where a source video is required and provider quota/readiness is validated before execution.
- `lip_sync_video`: creates or modifies video with voice/dialogue alignment when a provider supports it.
- `multi_shot_video`: one node that owns several shots intended to become a single video output.

### QA, Review, and Control Nodes

- `product_truth_qa`: checks script, prompt, storyboard, and generated outputs against product evidence and claim limits.
- `prompt_qa`: checks prompts before expensive generation.
- `visual_consistency_qa`: checks character/product/style continuity across images and videos.
- `audio_qa`: checks voice, timing, clarity, emotion, and language fit.
- `video_qa`: checks motion, continuity, product fidelity, cinematic quality, and provider output quality.
- `budget_credit_gate`: blocks execution when estimate exceeds user/tenant guardrails.
- `human_review`: explicit approval/revision checkpoint.
- `revision_loop`: collects verifier/user feedback and routes selected nodes back to planner/script/prompt nodes.
- `continuity_check`: checks story, character, product, style, lighting, wardrobe, audio, and timeline continuity across neighboring shots.

### Assembly and Handoff Nodes

- `storyboard_review_handoff`: opens or creates the related Storyboard Review project/task set from approved storyboard/video nodes.
- `video_edit_handoff`: opens or creates the related Video Edit project with clips, audio, captions, and storyboard order.
- `timeline_assembly`: compiles ordered shots, transitions, audio cues, caption timings, trims, and variant instructions.
- `transition_edit`: defines transitions between two shots or scene groups.
- `final_render`: coordinates final render/export after review/edit readiness is satisfied.
- `delivery_variant`: creates platform/aspect/language variants for downstream rendering or editing.
- `publish_export`: optional downstream export/publish package node for future social or commerce handoff.

Each node has:

- id,
- type,
- title,
- summary,
- status,
- position,
- parent shot id,
- child node ids,
- input handles,
- output handles,
- required assets,
- selected assets,
- provider candidates,
- estimated credits,
- readiness,
- locked flag,
- validation issues,
- provenance references,
- editable settings,
- tool binding,
- config snapshot,
- output asset references,
- downstream handoff references.

Shot group nodes also have:

- shot order,
- shot duration target,
- story beat,
- shot type,
- cast/character requirements,
- product involvement,
- audio intent,
- visual intent,
- child node subgraph,
- generated preview thumbnail,
- final clip reference.

## Node Configuration and Tool Handoff

Production Director coordinates the existing tools; it should not duplicate every Image, Video, Audio, Storyboard Review, or Video Edit configuration screen inside the canvas.

Each executable node has a `toolBinding` that says where configuration happens:

```ts
type ProductionSurface =
  | "production_workspace"
  | "production_skill"
  | "production_asset_drawer"
  | "production_qa"
  | "production_gate"
  | "production_review"
  | "production_timeline"
  | "video_shot"
  | "image"
  | "video"
  | "audio"
  | "character_wizard"
  | "audio_asset_wizard"
  | "caption_editor"
  | "storyboard_review"
  | "video_edit"
  | "render_surface"
  | "publish_export";

interface ProductionNodeToolBinding {
  surface: ProductionSurface;
  mode: string;
  adapterId: string;
  canConfigure: boolean;
  canGenerate: boolean;
  canSaveToNode: boolean;
  requiresApprovalBeforeGenerate: boolean;
  configSchemaVersion: string;
  outputSchemaVersion: string;
  capability?: string;
  provider?: string;
  skillId?: string;
  modelId?: string;
  route?: string;
  validationIssues?: Array<Record<string, unknown>>;
}
```

Section 13 is the canonical source for this contract. Older planner suggestions that only specify `action` must be normalized by the server into this explicit binding shape before saving.

Each executable node also stores an isolated `configSnapshot`:

```ts
interface ProductionNodeConfigSnapshot {
  nodeId: string;
  surface: ProductionSurface;
  selectedModel?: string;
  selectedSkillId?: string;
  prompt?: string;
  enhancedPrompt?: string;
  referenceAssetIds?: string[];
  referenceUrls?: string[];
  referenceInputs?: ProductionReferenceInput[];
  productEvidenceRefs?: Array<{
    productStoryboardAssetId: string;
    evidenceIds: string[];
    claimIds: string[];
    frameStrategy?: string;
    requiredVisualAccuracy?: string;
  }>;
  dynamicFormValues?: Record<string, unknown>;
  mediaStudioTabStatePatch?: Record<string, unknown>;
  providerPayloadPreview?: Record<string, unknown>;
  outputMapping?: Record<string, unknown>;
  updatedAt: string;
}

type ProductionReferenceInput =
  | {
      kind: "source_video";
      role: "motion" | "edit_source" | "style_pacing" | "continuity" | "other";
      url?: string;
      assetId?: string;
      outputRefId?: string;
      trim?: {
        startSeconds?: number;
        endSeconds?: number;
      };
      providerPayloadKey?: "video_list" | string;
      pricingBranch?: "with-video" | "without-video";
      referenceUnitWeight?: number;
    }
  | {
      kind: "reference_image" | "product_image" | "character_asset" | "audio_asset";
      url?: string;
      assetId?: string;
      outputRefId?: string;
      providerPayloadKey?: string;
      referenceUnitWeight?: number;
    };
```

Configuration flow:

1. User clicks a node in the canvas.
2. Node drawer shows summary, readiness, dependencies, outputs, and `Configure` action.
3. Clicking `Configure` saves the current Production Space draft.
4. App opens the correct surface:
   - Image nodes open the Image tab.
   - Video nodes open the Video tab.
   - MVP supports basic TTS node config handoff first. TTS/music/sound/voice full-matrix nodes open the Audio tab in the correct workflow only after post-MVP adapter gates pass.
   - Storyboard Review nodes open Storyboard Review.
   - Video Edit nodes open Video Edit.
   - Script/planner/QA nodes execute or configure skills inside Production.
5. The target surface loads only that node's `configSnapshot`, not a global shared tab state.
6. The target surface shows a compact banner such as `Configuring Production Node: Hero Product Image`.
7. User edits settings and clicks `Save to Node`.
8. App writes the updated config snapshot back to the same canvas node and returns to Production.
9. The node readiness, estimated credits, dependency warnings, and downstream edges are revalidated.

Generation can be separate from configuration:

- `Save to Node` stores settings without spending credits.
- `Generate This Node` can run after readiness checks.
- `Run Approved Batch` can execute multiple approved nodes in dependency order.
- If a user generates from Image/Video/Audio while configuring a node, the output must be attached back to that node as `outputAssetRefs`.

Important isolation rule:

- There may be many `image_generate` nodes. Each one has its own prompt, model, references, dynamic fields, generated outputs, and QA state.
- There may be many `video_generate` nodes. Each one has its own duration, resolution, reference plan, provider candidate, character/audio IDs, source video, and output.
- There may be many audio nodes. TTS, music, sound effect, and voice changer nodes must not overwrite each other.
- Existing Image/Video/Audio tab state may be used as an editor surface, but Production node snapshots are the source of truth for workflow execution.

## Edge Types

Edges represent dependency and data flow:

- `uses_asset`
- `requires_before`
- `generates_for`
- `qa_of`
- `approval_gate`
- `handoff_to`
- `fallback_to`

Edges must be editable by users. When a user reconnects an edge, the system should revalidate:

- missing required inputs,
- incompatible asset type,
- provider quota violations,
- circular dependencies,
- product truth evidence loss,
- unapproved generation after changed dependencies.

## Data Contracts

### ProductionSpace

```ts
interface ProductionSpace {
  productionRunId: string;
  title: string;
  brief: ProductionBrief;
  shots: ProductionShot[];
  contextAssets: ProductionContextAsset[];
  selectedPlanningSkillId: string;
  selectedModelId?: string;
  canvas: ProductionFlowCanvas;
  planPackage?: Record<string, unknown>;
  verification?: Record<string, unknown>;
  approval?: Record<string, unknown>;
  status: ProductionSpaceStatus;
  contractVersion: string;
}
```

### ProductionShot

```ts
interface ProductionShot {
  id: string;
  order: number;
  title: string;
  purpose?: string;
  storyBeat?: "hook" | "setup" | "demo" | "proof" | "transition" | "payoff" | "cta" | "b_roll" | "custom";
  shotType?: "presenter" | "dialogue" | "action" | "product_review" | "voiceover_scene" | "lip_sync" | "singing" | "b_roll" | "transition" | "packshot_cta" | "custom";
  durationSeconds?: number;
  aspectRatio?: string;
  cast?: Array<{
    characterAssetId?: string;
    role: string;
    notes?: string;
  }>;
  productUse?: "none" | "shown" | "demoed" | "reviewed" | "before_after" | "packshot_cta";
  audioIntent?: Array<"none" | "voiceover" | "dialogue" | "lip_sync_dialogue" | "singing" | "music_bed" | "sound_effects">;
  visualIntent?: Record<string, unknown>;
  childNodeIds: string[];
  thumbnailUrl?: string;
  finalClipRef?: ProductionNodeOutputRef;
  status: "draft" | "needs_config" | "ready" | "running" | "completed" | "blocked" | "approved";
  locked?: boolean;
  validationIssues?: Array<Record<string, unknown>>;
}
```

### ProductionContextAsset

```ts
interface ProductionContextAsset {
  id: string;
  kind: "character" | "product" | "scene_reference" | "image" | "video" | "audio" | "marketplace_product" | "generated_media";
  role: string;
  title: string;
  thumbnailUrl?: string;
  publicUrl?: string;
  providerAssetId?: string;
  source: "library" | "history" | "marketplace" | "provider_asset" | "upload";
  provenance?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  locked?: boolean;
}
```

### ProductStoryboardAsset

Product images used for storyboard planning must be normalized as product evidence, not generic image references.

```ts
type CustomerJourneyStage =
  | "awareness"
  | "problem_recognition"
  | "consideration"
  | "proof_review_demo"
  | "objection_handling"
  | "trust_building"
  | "conversion_cta"
  | "retention_brand_recall";

interface ProductStoryboardAsset {
  id: string;
  productId?: string;
  marketplaceProductId?: string;
  captureId?: string;
  platform?: "shopee" | "tiktok_shop" | "library" | "manual";
  source:
    | "feature_115_handoff"
    | "marketplace_capture"
    | "product_library"
    | "upload"
    | "generated_derivative";
  title: string;
  productIdentity: {
    name?: string;
    brand?: string;
    sku?: string;
    variant?: string;
    color?: string;
    packageSize?: string;
    seller?: string;
  };
  image: {
    assetId?: string;
    evidenceId?: string;
    publicUrl?: string;
    storageKey?: string;
    thumbnailUrl?: string;
  };
  provenance: {
    sourceUrl?: string;
    insightRefs?: {
      productBriefId?: string;
      reviewInsightId?: string;
      tiktokShopTrendBriefId?: string;
      videoBriefId?: string;
    };
    handoffSchemaVersion?: string;
  };
  role:
    | "hero"
    | "detail"
    | "use_case"
    | "review"
    | "comparison"
    | "background"
    | "packshot"
    | "label_closeup"
    | "texture_detail"
    | "before_after_reference"
    | "cta_end_card";
  evidenceIds: string[];
  linkedClaimIds: string[];
  fidelityRisk: "low" | "medium" | "high" | "unknown";
  approvalStatus: "unreviewed" | "approved" | "needs_review" | "blocked";
  usagePolicy: {
    canUseAsImageReference: boolean;
    canUseAsStartFrame: boolean;
    canUseAsStopFrame: boolean;
    canUseAsPackshot: boolean;
    canUseForLogoLabel: boolean;
    requiresUserApprovalBeforeGeneration: boolean;
  };
  warnings: string[];
}
```

### ProductClaimEvidence

Feature 115 claim safety metadata must be preserved as a typed map. `claimIds` are identifiers, not free-form claim text and not evidence IDs.

```ts
interface ProductClaimEvidence {
  id: string;
  claimText: string;
  claimType:
    | "selling_point"
    | "pain_point"
    | "review_theme"
    | "objection"
    | "trust_signal"
    | "cta"
    | "caption"
    | "on_screen_text";
  evidenceIds: string[];
  approvedByUser: boolean;
  risk:
    | "supported"
    | "needs_user_confirmation"
    | "unsupported"
    | "image_mismatch"
    | "policy_sensitive";
  source: "feature_115" | "manual_user_approval" | "production_review";
}

type ProductClaimEvidenceMap = Record<string, ProductClaimEvidence>;
```

Rules:

- `ProductionShotProductUse.claimIds[]` must reference keys from `ProductClaimEvidenceMap`.
- Evidence IDs must stay in evidence fields, never inside `claimIds`.
- Claims with `needs_user_confirmation` require explicit approval before generation.
- Claims with `unsupported`, `image_mismatch`, or `policy_sensitive` block generation until resolved or removed.

### ProductionShotProductUse

```ts
interface ProductionShotProductUse {
  shotId: string;
  productStoryboardAssetIds: string[];
  presence: "not_present" | "shown" | "demoed" | "reviewed" | "proof" | "comparison" | "packshot" | "cta";
  customerJourneyStage?: CustomerJourneyStage;
  claimIds: string[];
  unsupportedClaimTexts: string[];
  requiredVisualAccuracy: "loose_style_reference" | "product_likeness" | "packaging_exact" | "label_logo_exact";
  frameStrategy: "image_reference" | "start_frame" | "stop_frame" | "start_and_stop_frame" | "packshot_insert" | "not_required";
  mustShow: string[];
  mustAvoid: string[];
  qaRequirements: string[];
}
```

### ProductionProductEvidenceManifest

Storyboard Review and Video Edit receive a versioned, safe product evidence manifest.

```ts
interface ProductionProductEvidenceManifest {
  schemaVersion: "1.0";
  productionRunId: string;
  productionSpaceVersion: number;
  sourceHandoffRef?: {
    schemaVersion: string;
    platform: "shopee" | "tiktok_shop";
    captureId?: string;
    marketplaceProductId?: string;
    sourceUrl?: string;
    insightRefs?: Record<string, string | undefined>;
  };
  shotManifests: Array<{
    shotId: string;
    productStoryboardAssetIds: string[];
    claimIds: string[];
    evidenceIds: string[];
    customerJourneyStage?: CustomerJourneyStage;
    frameStrategy: ProductionShotProductUse["frameStrategy"];
    requiredVisualAccuracy: ProductionShotProductUse["requiredVisualAccuracy"];
    qaStatus: "not_checked" | "passed" | "warning" | "blocked";
    warnings: string[];
    unresolvedBlockers: string[];
  }>;
}
```

### ProductionDownstreamResultRecord

Storyboard Review and Video Edit must return changes as explicit result records so Production can import them without overwriting locked shots or node configs.

```ts
interface ProductionDownstreamResultRecord {
  id: string;
  productionRunId: string;
  sourceSurface: "storyboard_review" | "video_edit";
  downstreamProjectId: string;
  downstreamTaskId?: string;
  sourceProductionSpaceVersion: number;
  changedShots: Array<{
    shotId: string;
    selectedTakeId?: string;
    order?: number;
    trimInSeconds?: number;
    trimOutSeconds?: number;
    captionPatch?: Record<string, unknown>;
    productQaDelta?: Record<string, unknown>;
    warningResolutionIds?: string[];
  }>;
  timelinePatch?: Record<string, unknown>;
  conflictPolicy: "reject_locked_changes" | "require_user_confirmation" | "save_as_new_version";
  importOutcome?: "pending" | "imported" | "conflict" | "rejected";
}
```

### ProductionFlowCanvas

```ts
interface ProductionFlowCanvas {
  nodes: ProductionFlowNode[];
  edges: ProductionFlowEdge[];
  viewport?: { x: number; y: number; zoom: number };
  layoutVersion: number;
}
```

### ProductionFlowNode

```ts
interface ProductionFlowNode {
  id: string;
  type: ProductionFlowNodeType;
  title: string;
  summary?: string;
  status: "draft" | "needs_config" | "ready" | "running" | "completed" | "failed" | "blocked" | "approved";
  position: { x: number; y: number };
  parentShotId?: string;
  childNodeIds?: string[];
  requiredAssetIds?: string[];
  selectedAssetIds?: string[];
  toolBinding?: ProductionNodeToolBinding;
  configSnapshot?: ProductionNodeConfigSnapshot;
  outputAssetRefs?: ProductionNodeOutputRef[];
  estimatedCredits?: number;
  readiness?: Record<string, unknown>;
  validationIssues?: Array<Record<string, unknown>>;
  locked?: boolean;
  metadata?: Record<string, unknown>;
}
```

### ProductionNodeOutputRef

```ts
interface ProductionNodeOutputRef {
  id: string;
  kind: "image" | "video" | "audio" | "text" | "character" | "project" | "task";
  title?: string;
  url?: string;
  providerAssetId?: string;
  libraryItemId?: string;
  taskId?: string;
  surface?: "image" | "video" | "audio" | "storyboard_review" | "video_edit";
  metadata?: Record<string, unknown>;
}
```

The existing `ProductionGoal` can continue to exist, but this feature should introduce or extend contracts so the saved run can restore the full canvas, not only text fields and tab snapshots.

## Skill Contract Changes

`media-production-storyboard-planner` should accept:

- `production_brief`,
- `context_assets`,
- `available_tool_capabilities`,
- `provider_capabilities`,
- `downstream_targets`,
- `previous_canvas`,
- `revision_request`,
- `locked_nodes`,
- `budget_policy`.

The output schema should include:

- `production_bible`,
- `storyboard_outline`,
- `asset_requirements`,
- `shots`,
- `shot_sequence`,
- `shot_child_node_plan`,
- `canvas_nodes`,
- `canvas_edges`,
- `node_tool_bindings`,
- `node_config_suggestions`,
- `node_validation`,
- `credit_and_time_estimate`,
- `approval_checklist`,
- `next_actions`.

`media-production-plan-verifier` should verify the full canvas, not only text plan JSON:

- edge validity,
- required inputs,
- tool/provider feasibility,
- story continuity,
- product truth fidelity,
- credit risk,
- downstream handoff readiness,
- missing human approvals.

## Right Sidebar Library/Search Updates

The existing right panel should add searchable character support.

Required sources:

- provider assets where capability is Gemini Omni Character or future character-capable providers,
- library images tagged as character/person/reference,
- generated image history that can be used as character seed,
- marketplace/persona assets if later supported.

Search filters:

- All,
- Images,
- Videos,
- Audio,
- Characters,
- Products,
- Marketplace,
- Generated,
- Provider Assets.

Drag payloads must be typed so Production can route them into the correct drop zone and node kind.

## Runtime Behavior

Planning sequence:

1. Save draft ProductionSpace.
2. Build context pack.
3. Execute selected planning skill.
4. Validate skill output schema.
5. Render flow canvas.
6. Run verifier skill.
7. Show warnings/errors on nodes and edges.
8. Wait for user approval or revision.

No Image/Video/Audio provider generation should start in steps 1-8.

Execution sequence after approval:

1. User chooses `Send to Storyboard Review`, `Send to Video Edit`, or `Run Approved Batch`.
2. System projects the approved canvas into the target surface.
3. If a node requires manual execution in Image/Video/Audio, open that tab with prefilled context.
4. If a shot requires shot-level configuration, open the Video Shot tab with that shot preloaded.
5. If a node can run as a batch task, queue it only after budget/readiness checks pass.
6. Generated outputs update the canvas node, parent shot status, thumbnails, and storyboard sequence.

Manual configuration sequence:

1. User clicks an executable node and chooses `Configure`.
2. The matching surface opens with `productionRunId` and `nodeId`.
3. That surface loads the node config snapshot and displays a `Save to Node` action.
4. Saving returns to the canvas and updates only that node.
5. Generated outputs, if any, attach to the node and become available to downstream edges.

Shot configuration sequence:

1. User clicks a `video_shot` group node or a shot row.
2. App opens the `Video Shot` tab with `productionRunId` and `shotId`.
3. User configures shot cast, product use, action type, audio intent, visual intent, duration, and child node plan.
4. User saves the shot.
5. The shot updates its `ProductionShot` record and its `video_shot` group node.
6. Child nodes are created/updated as needed, preserving user-edited node configs unless the user confirms overwrite.

## Migration From Current Interim Implementation

Replace the current interim behavior:

- Do not render Image prompt/generate UI below Production.
- Move Production project search/header inside the Production workspace or keep it as a slim workspace header only when Production is active.
- Keep Save Project, project search, project thumbnails, and run restore behavior.
- Keep existing production run APIs but extend saved data with `ProductionSpace`/canvas state.
- Keep planner/verifier skills, but adapt inputs/outputs to include nodes and edges.
- Add Video Shot workspace and route `video_shot` nodes there instead of forcing all shot decisions into the canvas drawer.
- Keep Storyboard Review / Video Edit projection.
- Keep Gemini Omni and Seedance 2 as provider candidates, not hard-coded assumptions.

## Accessibility and UX Requirements

- All node actions must be keyboard reachable.
- Canvas must have a non-canvas outline/list mode for screen readers and mobile fallback.
- Drop zones must also support click-to-add, not drag-only.
- Node labels must be concise and human-readable.
- Technical provider keys must be hidden in normal mode.
- Warnings should explain user action, not internal error codes.
- Mobile should show stacked Goal, Assets, Plan List, and Preview tabs instead of forcing a large canvas.
- Save state should be explicit and visible.
- Production must show a compact journey stepper or checklist for Goal, Assets, Plan, Fix blockers, Approve, Configure/Generate, Review/Edit, and Export/Archive.
- React Flow must not be the only editable path: reconnecting edges, opening shots/nodes, configuring nodes, and approving must have keyboard/list equivalents.
- Node drawer, product preview, handoff preview, execution confirmation, export, archive/restore/delete, and conflict dialogs must trap focus and return focus to the invoking control.
- Icon-only controls must have tooltips and accessible names.
- UI must be checked at 390x844, 768x1024, 1280x800, and 1440x900.
- Dark/light readability, reduced motion, contrast, and text overflow must be part of release evidence.

Canonical plain-language labels:

| Internal term | User-facing label intent |
| --- | --- |
| `video_shot` | Shot / ช็อต |
| `image_generate` | Create image / สร้างภาพ |
| `video_generate` | Create video / สร้างวิดีโอ |
| `text_to_speech` | Voiceover / เสียงบรรยาย |
| `product_truth_qa` | Product truth check / ตรวจความจริงสินค้า |
| `budget_credit_gate` | Credit check / ตรวจเครดิต |
| `storyboard_review_handoff` | Send to Storyboard Review / ส่งไปตรวจ Storyboard |
| `video_edit_handoff` | Send to Video Edit / ส่งไปตัดต่อ |
| `needs_user_review` | Needs review / ต้องตรวจสอบก่อน |
| `insufficient_evidence` | Not enough evidence / หลักฐานยังไม่พอ |

Normal-mode UI must not expose provider payload keys, raw enum-only labels, private storage keys, raw Feature 115 debug terms, or internal adapter IDs.

Required recovery copy states:

| Situation | Required user understanding |
| --- | --- |
| Live handoff disabled | User can preview the package but cannot mutate Storyboard Review/Video Edit until the project and flags are ready. |
| Provider generation disabled | User sees that generation starts only after plan approval, readiness, and credit confirmation. |
| Planner failed/partial/schema-invalid | User sees that the draft is safe, what failed, and how to retry or revise. |
| Product evidence blocked | User sees the missing image/claim/evidence problem and the next allowed recovery action. |
| Invalid edge | User sees why the graph cannot run in that order and how to choose a valid connection. |
| Stale version conflict | User sees reload/latest and save-as-new options without silent overwrite. |
| Permission denied | User sees read-only state and request-access/switch-project paths. |
| Export success | User sees that secrets, private signed URLs, raw provider payloads, and raw marketplace/OCR/review/comment text were excluded. |

Browser evidence must be recorded in:

```text
specs/feature/116-production-director-node-canvas/implementation/ui-browser-evidence.md
```

The artifact must include commands, screenshots/traces or manual notes, required viewport matrix, console result, keyboard path, overflow/overlap result, state coverage, dark/light readability, accessible names, focus trap/restore, skipped checks, and residual risk. Skipped evidence is not a pass.

## Testing Requirements

- Production tab renders only Production workspace content, not Image/Video/Audio prompt UI.
- Project search opens saved ProductionSpace with canvas nodes, edges, dropped assets, and brief restored.
- ProductionSpace restores ordered shots and their child nodes.
- Video Shot tab opens the selected shot and can save shot-level settings without changing other shots.
- Character search appears in library panel and returns provider character assets.
- Dragging a character asset into Production creates a character/context asset card.
- Dragging product, scene image, and audio assets routes to correct drop zones.
- Feature 115 `selectedProductImages` import as product storyboard assets with role, fidelity risk, evidence IDs, and approval state.
- Feature 115 readiness and allowed next actions map to Production gates and handoff buttons.
- Feature 115 `needs_user_review` and `insufficient_evidence` block product-related generation and downstream handoff.
- Feature 115 `ready_with_warnings` requires authorized warning acceptance before generation or handoff.
- Feature 115 `EvidenceBackedClaim.risk` and `approvedByUser` map to `ProductClaimEvidenceMap` and verifier gates.
- Evidence IDs cannot be saved into `ProductionShotProductUse.claimIds`.
- Planning skill receives goal, assets, tool capabilities, product evidence, and selected model.
- Planner maps product images, claims, and customer journey stages to each product-related shot.
- Planner output renders React Flow nodes and edges.
- Planner output includes ordered `video_shot` groups and child node plans.
- User can edit a node and save the canvas.
- User can configure a shot's cast, product involvement, action type, audio intent, visual style, duration, and child nodes.
- Script node can call the selected LLM/skill and save a reusable script output.
- Image node opens the Image tab with that node's config and saves back to that node.
- Video node opens the Video tab with that node's config and saves back to that node.
- Basic TTS nodes open the correct Audio workflow and save back to that node for MVP. Music, sound effects, voice changer, and speech-to-text nodes remain disabled or preview-only until post-MVP full-matrix adapter gates pass.
- Multiple image/video/audio nodes keep independent config snapshots and outputs.
- Multiple shots keep independent child node graphs and can be reordered without losing node configs.
- User can reconnect an edge and see validation warnings for invalid connections.
- Verifier blocks approval when required character/audio/product evidence is missing.
- Verifier blocks product shots when selected product image fidelity risk, claim evidence, or SKU/variant identity is unresolved.
- Image and Video node config snapshots preserve structured product refs and frame strategy, not only prompt text.
- Storyboard Review / Video Edit result sync can update selected takes, timeline, captions, and product QA state without overwriting locked node configs.
- Storyboard Review / Video Edit result records include source surface, downstream project/task IDs, source ProductionSpace version, changed shots, product QA deltas, conflict policy, and import outcome.
- No provider-generation credit reservation occurs during planning/verifier steps.
- Approved canvas can project to Storyboard Review.
- Approved canvas can project to Video Edit.
- Image/Video/Audio tabs still work standalone.
- Mobile fallback list mode is usable.
- Responsive evidence covers 390x844, 768x1024, 1280x800, and 1440x900 without incoherent overlap, text clipping, or horizontal overflow in the primary flow.
- Keyboard-only path can create/open a project, add assets, create a fixture plan, edit/reconnect through list fallback, open Video Shot, configure Image/Video/basic TTS nodes, Save to Node, approve, preview handoff, and export/archive.
- Accessibility checks cover focus trap/restore, accessible icon names/tooltips, live status announcements, contrast, dark/light readability, and reduced motion.
- Canonical browser/E2E proof verifies zero provider-generation credit reservation or deduction before explicit generation confirmation.
- Thai and English labels exist for new Production Space UI.
- Project archive, restore, export, and delete actions preserve permissions and safe audit records.
- Stale or missing generated output refs show repair/relink warnings instead of crashing the canvas.
- Planner, verifier, node config, execution, credit, and handoff events produce audit/metrics signals.

## Acceptance Criteria

- Production Director feels like a planning workspace, not a provider-generation form.
- Users can build a project by dragging existing assets into a visual workspace.
- Users can ask an LLM planning skill to design a complete production workflow using the tools SmartSpecPro actually supports.
- Users can inspect and modify the generated workflow as nodes and edges before spending generation credits.
- Users can inspect the whole story as an ordered shot sequence and inspect each shot as a group of child nodes.
- Clicking a node opens the proper existing tool surface for deep configuration and returns changes to the same node.
- Each image, video, audio, script, review, and handoff node owns its own configuration and output history.
- Saved projects restore brief, assets, canvas layout, plan, verification, and thumbnails.
- The workflow can hand off to Storyboard Review and Video Edit.
- The implementation remains compatible with Feature 114 Gemini Omni assets and Feature 115 marketplace product truth.
- Production projects can be safely archived, restored, exported, and operated with feature flags/kill switches.
- Product-image storyboard flows preserve product identity, image roles, claim evidence, fidelity QA, and per-shot evidence manifests from planning through Storyboard Review and Video Edit.
