# Section 13: Node Tool Binding and Config Integrity

## Goal

Guarantee that every executable node opens the correct existing tool surface, loads the correct per-node configuration, and saves changes back to the same node without corrupting other nodes or global Media Studio tab state.

This section is mandatory for implementation because Production Director can contain many nodes of the same type with different prompts, references, models, and outputs.

## Core Rule

The node is the source of truth.

Existing tabs and tools are editor surfaces:

- Image tab edits an image node.
- Video tab edits a video node.
- Audio tab edits an audio node.
- Video Shot tab edits a shot group node.
- Storyboard Review and Video Edit open downstream projects.
- Production skill drawer edits/plans script, strategy, QA, and timeline nodes.

No editor surface may save into a node unless `productionRunId`, `nodeId`, `nodeVersion`, and `configSnapshotId` match the current ProductionSpace state.

## Node Tool Binding Contract

Each executable node must have a complete binding:

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
  route?: string;
  skillId?: string;
  modelId?: string;
  adapterId: string;
  canConfigure: boolean;
  canGenerate: boolean;
  canSaveToNode: boolean;
  requiresApprovalBeforeGenerate: boolean;
  configSchemaVersion: string;
  outputSchemaVersion: string;
}
```

The planner can suggest tool bindings, but the server must normalize and validate them against the capability registry before saving.

## Config Snapshot Contract

Every configurable node stores a versioned config snapshot:

```ts
interface ProductionNodeConfigSnapshot {
  id: string;
  nodeId: string;
  nodeVersion: number;
  surface: ProductionSurface;
  mode: string;
  selectedModel?: string;
  selectedSkillId?: string;
  prompt?: string;
  enhancedPrompt?: string;
  negativePrompt?: string;
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
  sourceOutputNodeIds?: string[];
  dynamicFormValues?: Record<string, unknown>;
  mediaStudioTabStatePatch?: Record<string, unknown>;
  providerPayloadPreview?: Record<string, unknown>;
  outputMapping?: Record<string, unknown>;
  configHash: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
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

Snapshot requirements:

- `configHash` must change when meaningful generation settings change.
- layout-only canvas changes must not change node config hashes.
- generated outputs must reference the config hash that produced them.
- video-to-video/source-video nodes must preserve `referenceInputs` so reopening the Video tab can restore the exact source video, trim range, provider payload key, and with-video pricing branch.
- product-related nodes must preserve structured `productEvidenceRefs` alongside prompt text and reference URLs.
- saving a stale config version must fail with a conflict.
- cloning a node creates a new snapshot ID and clears outputs unless the user explicitly clones outputs.

## Surface Adapter Interface

Each existing tool surface needs a Production adapter:

```ts
interface ProductionSurfaceAdapter {
  adapterId: string;
  surface: ProductionSurface;
  mode: string;
  canHandleNodeType(nodeType: string): boolean;
  buildInitialState(snapshot: ProductionNodeConfigSnapshot, context: ProductionSpace): Record<string, unknown>;
  extractSnapshot(surfaceState: Record<string, unknown>, previousSnapshot: ProductionNodeConfigSnapshot): ProductionNodeConfigSnapshot;
  validateSnapshot(snapshot: ProductionNodeConfigSnapshot, context: ProductionSpace): Array<Record<string, unknown>>;
  mapOutputsToNode(outputs: unknown[], snapshot: ProductionNodeConfigSnapshot): ProductionNodeOutputRef[];
}
```

Adapter behavior:

- load only the selected node snapshot;
- show a clear `Configuring Production Node` banner;
- disable unrelated global autosave into normal tab state while in node config mode;
- save only through `Save to Node`;
- attach outputs only to the active node;
- return to Production or Video Shot after save/cancel.

## Routing Parameters

Tool surfaces opened from nodes must receive:

- `productionRunId`,
- `spaceVersion`,
- `shotId` when applicable,
- `nodeId`,
- `nodeVersion`,
- `configSnapshotId`,
- `nodeMode=config`,
- `returnTo=production` or `returnTo=video_shot`.

If any required parameter is missing, the target surface must open in normal standalone mode and must not write to a node.

## Versioned Mutation Contract

Node configuration saves must use explicit expected versions:

```ts
interface SaveNodeConfigInput {
  productionRunId: string;
  expectedSpaceVersion: number;
  nodeId: string;
  expectedNodeVersion: number;
  previousConfigSnapshotId: string;
  configSnapshot: ProductionNodeConfigSnapshot;
  outputRefs?: ProductionNodeOutputRef[];
}
```

The server must reject the save when the space version, node version, or previous snapshot ID is stale. The conflict response should include current safe metadata: current versions, changed fields, current snapshot ID, and whether the user may reload latest or save as a new version.

## Node-To-Tool Matrix

| Node type | Surface | Mode | Save target |
| --- | --- | --- | --- |
| `goal_brief` | `production_workspace` | brief | ProductionSpace brief |
| `context_summary` | `production_skill` | context_summary | same node snapshot/output text |
| `story_strategy` | `production_skill` | story_strategy | same node snapshot/output text |
| `script_generation` | `production_skill` | script_generation | same node output text/script |
| `script_revision` | `production_skill` | script_revision | same node output text/script |
| `storyboard_planning` | `production_skill` | storyboard_planning | shots + canvas draft |
| `video_shot` | `video_shot` | shot_builder | `ProductionShot` + `video_shot` node |
| `shot_breakdown` | `production_skill` | shot_breakdown | child node plan |
| `prompt_packaging` | `production_skill` | prompt_packaging | child node prompt snapshots |
| `character_reference` | `production_asset_drawer` | reference | context asset binding |
| `product_reference` | `production_asset_drawer` | product_reference | context asset binding |
| `scene_reference` | `production_asset_drawer` | scene_reference | context asset binding |
| `brand_reference` | `production_asset_drawer` | brand_reference | context asset binding |
| `audio_reference` | `production_asset_drawer` | audio_reference | context asset binding |
| `source_video_reference` | `production_asset_drawer` | source_video_reference | context asset binding |
| `character_create` | `character_wizard` | create_character | same node provider asset output |
| `voice_asset_create` | `audio_asset_wizard` | create_voice_asset | same node provider asset output |
| `image_generate` | `image` | generate | same node config/output refs |
| `image_edit` | `image` | edit | same node config/output refs |
| `image_upscale_enhance` | `image` | enhance | same node config/output refs |
| `text_to_speech` | `audio` | tts | same node config/audio output refs |
| `music_generate` | `audio` | music | same node config/audio output refs |
| `sound_effect_generate` | `audio` | sound_effects | same node config/audio output refs |
| `voice_change` | `audio` | voice_changer | same node config/audio output refs |
| `speech_to_text` | `audio` | speech_to_text | same node transcript/caption output refs |
| `caption_subtitle` | `caption_editor` | captions | same node SRT/VTT/burn-in metadata refs |
| `voice_isolate_cleanup` | `audio` | voice_isolator | same node audio output refs |
| `video_generate` | `video` | generate | same node config/video output refs |
| `image_to_video` | `video` | image_to_video | same node config/video output refs |
| `video_to_video` | `video` | video_to_video | same node config/video output refs |
| `lip_sync_video` | `video` | lip_sync | same node config/video output refs |
| `multi_shot_video` | `video` | multi_shot | same node config/video output refs |
| `product_truth_qa` | `production_qa` | product_truth | same node QA result |
| `prompt_qa` | `production_qa` | prompt | same node QA result |
| `visual_consistency_qa` | `production_qa` | visual_consistency | same node QA result |
| `audio_qa` | `production_qa` | audio | same node QA result |
| `video_qa` | `production_qa` | video | same node QA result |
| `continuity_check` | `production_qa` | continuity | sequence/shot QA result |
| `budget_credit_gate` | `production_gate` | budget | gate result |
| `human_review` | `production_review` | approval | review decision |
| `revision_loop` | `production_skill` | revision | targeted plan update |
| `timeline_assembly` | `production_timeline` | timeline | cue sheet/timeline |
| `transition_edit` | `production_timeline` | transition | transition cue |
| `storyboard_review_handoff` | `storyboard_review` | handoff | downstream project ref |
| `video_edit_handoff` | `video_edit` | handoff | downstream project ref |
| `final_render` | `render_surface` | final_render | render task refs |
| `delivery_variant` | `production_timeline` | delivery_variant | variant config/output refs; downstream edit opens through `video_edit_handoff` |
| `publish_export` | `publish_export` | publish_export | export package refs |

## Save To Node Lifecycle

1. Production opens a tool with node route params.
2. Tool calls `getNodeConfig(productionRunId, nodeId, configSnapshotId)`.
3. Tool adapter converts snapshot into local surface state.
4. User edits settings.
5. User clicks `Save to Node`.
6. Tool adapter extracts a new snapshot from local surface state.
7. Client sends `saveNodeConfig` with expected node version and previous config snapshot ID.
8. Server validates:
   - tenant/user access,
   - node exists,
   - node type matches adapter,
   - expected version matches,
   - config schema passes,
   - referenced assets are accessible,
   - provider capability supports requested settings.
9. Server saves new snapshot, increments node version, updates readiness, and invalidates approval if material.
10. UI returns to the originating Production or Video Shot view.

## Output Attachment Lifecycle

If generation happens while configuring a node:

1. provider task result is mapped by the active adapter,
2. output refs are attached to the same node,
3. parent shot preview/status updates,
4. downstream nodes are revalidated,
5. previous outputs remain in attempt history unless user deletes them.

Generated outputs must not be attached to a different node even if the same media tab was used immediately before.

## Required Tests

MVP tests must cover the adapters required for the first release:

- Image node adapter roundtrip;
- Video node adapter roundtrip;
- basic TTS adapter roundtrip;
- node config mode opens and saves with route params;
- missing route params open normal standalone mode.

Full matrix tests are required before enabling all node categories, but they should not block the MVP fixture-planner release. Add full tests for:

- every node type in the node-to-tool matrix has a valid adapter;
- every node matrix surface is one of the canonical `ProductionSurface` values;
- opening a node loads exactly that node snapshot;
- saving an image node does not change another image node;
- saving a video node does not change another video node;
- saving a TTS node does not change music/SFX/voice nodes;
- stale `nodeVersion` save returns conflict;
- missing route params open normal standalone tab mode;
- generated outputs attach to the active node only;
- product-related node config round-trips `productEvidenceRefs` without falling back to prompt-only text;
- evidence IDs cannot be saved into `claimIds` through product-related node configs;
- cloned node gets a new config snapshot ID;
- approval invalidates after material config changes but not layout-only changes.
