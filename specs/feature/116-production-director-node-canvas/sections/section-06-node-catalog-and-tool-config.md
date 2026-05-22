# Section 06: Node Catalog and Tool Configuration Handoff

## Goal

Define a complete practical node catalog and the exact UX contract for configuring each node through existing SmartSpecPro tools.

Production Director is the conductor. It owns the workflow graph, dependencies, approvals, and per-node snapshots. Existing Image, Video, Audio, Storyboard Review, and Video Edit screens remain the deep configuration surfaces.

## Canonical Node Groups

### Planning and LLM Nodes

- `goal_brief`
- `context_summary`
- `story_strategy`
- `script_generation`
- `script_revision`
- `storyboard_planning`
- `video_shot`
- `shot_breakdown`
- `prompt_packaging`

These nodes run skills or LLM calls inside Production. `video_shot` is a group/container node that opens Video Shot workspace. `script_generation` is the required node for writing narration, dialogue, captions, presenter copy, or product review script before voice/video work.

### Source and Context Nodes

- `character_reference`
- `product_reference`
- `scene_reference`
- `brand_reference`
- `audio_reference`
- `source_video_reference`

These nodes are usually created by dragging from the library/search panel or marketplace panel.

### Asset Creation Nodes

- `character_create`
- `voice_asset_create`
- `image_generate`
- `image_edit`
- `image_upscale_enhance`

`image_generate` opens the Image tab. `character_create` opens the character wizard. Every image or character node has its own config and outputs.

### Audio Nodes

- `text_to_speech`
- `music_generate`
- `sound_effect_generate`
- `voice_change`
- `speech_to_text`
- `caption_subtitle`
- `voice_isolate_cleanup`

All audio/text timing nodes open the Audio tab or caption/subtitle editor mode in the correct workflow. TTS, music, sound effect, voice change, speech-to-text, and captions/subtitles must be separate node types because they use different inputs, models, and readiness rules.

### Video Nodes

- `video_generate`
- `image_to_video`
- `video_to_video`
- `lip_sync_video`
- `multi_shot_video`

All video nodes open the Video tab with node-specific model, prompt, references, duration, resolution, and provider fields preloaded.

### QA and Control Nodes

- `product_truth_qa`
- `prompt_qa`
- `visual_consistency_qa`
- `audio_qa`
- `video_qa`
- `budget_credit_gate`
- `human_review`
- `revision_loop`
- `continuity_check`

QA/control nodes must block approval or batch execution when their verifier result is `revise`, `human_review`, `block`, or missing.

### Assembly and Handoff Nodes

- `storyboard_review_handoff`
- `video_edit_handoff`
- `timeline_assembly`
- `transition_edit`
- `final_render`
- `delivery_variant`
- `publish_export`

Storyboard Review and Video Edit nodes open the corresponding downstream project/task, not a generic media tab.

## Node To Surface Mapping

| Node type | Configuration surface | Required behavior |
| --- | --- | --- |
| `video_shot` | Video Shot tab | Configure one storyboard shot, cast, product involvement, action type, audio intent, visual intent, child node plan, and readiness. |
| `script_generation`, `script_revision`, `story_strategy`, `prompt_packaging` | Production skill drawer | Run selected skill/LLM with selected context assets and save text output to node. |
| `image_generate`, `image_edit`, `image_upscale_enhance` | Image tab | Load node prompt/model/refs/settings, save config and generated outputs back to node. |
| `video_generate`, `image_to_video`, `video_to_video`, `lip_sync_video`, `multi_shot_video` | Video tab | Load node prompt/model/refs/characters/audio/source video/settings, save config and generated outputs back to node. |
| `text_to_speech` | Audio tab TTS mode | Load script/voice/language/emotion/speed, save audio output back to node. |
| `music_generate` | Audio tab music mode | Load music brief/style/duration, save music output back to node. |
| `sound_effect_generate` | Audio tab sound effects mode | Load SFX prompt/timing/scene binding, save SFX output back to node. |
| `voice_change` | Audio tab voice changer mode | Load source audio and target voice settings, save converted audio back to node. |
| `speech_to_text` | Audio tab speech-to-text mode | Load source audio/video, save transcript/captions back to node. |
| `caption_subtitle` | Caption/subtitle editor or Audio tab STT/caption mode | Load transcript, language, style, timing, and export format; save SRT/VTT/burn-in metadata back to node. |
| `character_create` | Character wizard | Upload/select image, create provider character asset, save provider ID and public URL back to node. |
| `voice_asset_create` | Audio asset wizard | Create/select reusable voice/audio asset, save provider ID back to node. |
| `storyboard_review_handoff` | Storyboard Review | Open/create review project from approved storyboard/video nodes. |
| `video_edit_handoff` | Video Edit | Open/create edit project from approved clips/audio/captions. |
| `delivery_variant` | Production timeline | Create platform/aspect/language variant instructions inside Production; downstream editing opens through `video_edit_handoff`. |

## Configure From Node Flow

1. User selects a node.
2. Node drawer shows summary, inputs, outputs, readiness, estimate, and `Configure`.
3. `Configure` saves the Production Space draft.
4. App navigates to the correct surface with `productionRunId` and `nodeId`.
5. Target surface loads only that node's config snapshot.
6. Target surface shows a compact banner: `Configuring Production Node`.
7. User edits and clicks `Save to Node`.
8. App updates only that node's config snapshot.
9. App returns to Production and revalidates graph readiness.

`Generate` and `Save to Node` are separate actions. Saving config must not spend credits.

## Multi-Node Isolation

- Every node instance has its own config snapshot.
- A project may contain many image nodes, many video nodes, and many audio nodes.
- Editing one image node must not overwrite another image node or the global Image tab state.
- Cloning a node duplicates config into a new node ID and clears generated output refs unless the user explicitly clones outputs too.
- Deleting a node must warn if downstream nodes depend on its outputs.

## Readiness Rules

Each executable node should validate:

- required upstream assets exist,
- referenced generated outputs are available,
- selected model/tool supports requested media type,
- provider quota is not exceeded,
- pricing can be estimated,
- product truth evidence is preserved,
- product image fidelity, claim evidence, and SKU/variant readiness are resolved for product shots,
- user approval gates are satisfied,
- node config snapshot exists before execution.

## Acceptance

- Script node can call LLM and save script output.
- Image node opens Image tab with node config and saves back to the same node.
- Video node opens Video tab with node config and saves back to the same node.
- MVP Audio handoff covers basic TTS first. Music/SFX/voice changer/STT nodes remain in the full node matrix but open the correct Audio workflow and save back to the same node only after post-MVP adapter gates pass.
- Storyboard Review node opens the related Storyboard Review project.
- Video Edit node opens the related Video Edit project.
- Multiple nodes of the same type preserve independent configs and outputs.
- Batch execution uses node dependency order, not tab-global state.

## UI/UX Contract: Node Drawer and Node Config Mode

### Target User / JTBD

- Role: creator/operator configuring one executable node without losing the surrounding Production plan.
- Goal: inspect node readiness, configure the correct Image/Video/basic TTS surface, save config back to only that node, and understand disabled/full-matrix states.
- Entry point: selected canvas node, list fallback node row, Shot Child Node List, or direct route with `productionRunId`, `shotId`, `nodeId`, and version params.
- Success outcome: user can configure a node and return to Production or Video Shot with no cross-save into another node or standalone tab state.

### Surface Inventory

| Surface | File/route | Change |
| --- | --- | --- |
| Node drawer | `ProductionNodeDrawer.tsx` | Summary, inputs, outputs, readiness, estimate, blockers, configure, disabled reason, and permitted debug preview. |
| Configure banner | `NodeConfigureBanner.tsx` | Shows active Production node, return target, snapshot/version, unsaved/conflict state. |
| Tool handoff hook | `useProductionToolHandoff.ts` | Builds route/query state and validates target surface/mode. |
| Node config hook | `useProductionNodeConfig.ts` | Loads/saves only the target node snapshot and handles stale versions. |
| Image/Video/basic TTS adapters | `features/media-production/adapters/*` | MVP config mapping and Save to Node behavior. |

### Component Map

| Component | Owns | Consumes | Must expose |
| --- | --- | --- | --- |
| `ProductionNodeDrawer` | node action state and drawer focus | node, tool binding, readiness, flags | one clear primary action, accessible blockers, no raw provider keys. |
| `NodeConfigureBanner` | in-tool config mode awareness | production route params and node summary | Save to Node, Back to Production, stale/conflict warning. |
| `useProductionToolHandoff` | navigation and return contract | node binding, surface adapter registry | safe URL params and fallback to standalone mode on missing params. |
| `useProductionNodeConfig` | snapshot load/save/attach output | router/service node config APIs | expected version, previous snapshot ID, conflict handling. |

### State Matrix

| State | Expected UI | Verification |
| --- | --- | --- |
| valid config mode | Target tool shows compact `Configuring Production Node` banner and `Save to Node`. | Image/Video/TTS roundtrip tests. |
| standalone mode | Missing params hide `Save to Node` and preserve normal Image/Video/Audio behavior. | UI test. |
| loading snapshot | Tool fields are disabled or skeletonized; no stale config is editable as active. | UI test. |
| stale version | Save is blocked with reload/latest or save-as-new path where safe. | Conflict test. |
| disabled adapter | Music/SFX/voice changer/STT/caption/delivery nodes show preview-only or disabled copy in MVP. | MVP boundary test. |
| generated output | Output attaches only to active node and current snapshot lineage. | Router/UI output attachment test. |
| permission denied | Read-only banner and no Save to Node. | Security/UI test. |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
| --- | --- | --- |
| 390x844 | Node drawer/config banner becomes compact and sticky-safe. Save to Node remains reachable without covering form fields. | Mobile screenshot. |
| 768x1024 | Drawer can be full-height side panel or modal; tool form remains readable. | Tablet screenshot. |
| 1280x800 | Tool surface plus configure banner fit without hiding provider controls needed for MVP adapters. | Laptop screenshot. |
| 1440x900 | Node context, tool form, and output preview can be visible together where existing surface supports it. | Desktop screenshot. |

### Accessibility Acceptance

- Keyboard path must cover opening the drawer, reading blockers, activating Configure, editing fields in the target tool, Save to Node, resolving stale conflict, and returning focus to the original node/row.
- Drawer and conflict dialogs trap focus and return focus to the trigger on close.
- `Save to Node`, `Back to Production`, and disabled adapter buttons must have accessible names and disabled reasons.
- Generated-output attachment status must announce success/failure politely.
- Provider keys and raw payloads may appear only in debug/provider payload preview with permission, never in normal labels.

### Browser Evidence Required

- Evidence must cover Image, Video, and basic TTS MVP node config roundtrips, missing-route standalone behavior, stale save conflict, disabled post-MVP node, output attachment to active node only, and zero provider-credit reservation for Save to Node.
