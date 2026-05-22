# Section 07: Video Shot Workspace

## Goal

Add a shot-level workspace between Production planning and lower-level Image/Video/Audio execution.

A Video Shot is the storyboard unit for one shot in the final story. It groups the child nodes required to produce that shot.

## Why This Is Needed

Production Director needs to show the whole story without drowning the user in every image/audio/video sub-step. A single project can contain many shots, and each shot can contain a different set of child nodes.

The hierarchy is:

```text
Production Project
  -> Storyboard Sequence
  -> Video Shot
  -> Child Nodes
  -> Existing tool surfaces
```

## Tab Placement

Add `Video Shot` as a top-level Media Studio tab before Image/Video:

`Production -> Video Shot -> Image -> Video -> Audio`

Production is for the whole project. Video Shot is for one selected shot. Image/Video/Audio are deep configuration surfaces for individual child nodes.

## Empty and Standalone States

Users may click the `Video Shot` tab directly. The tab must not look like another video-generation form and must not show Image/Video/Audio generate controls.

When no Production project is selected:

- show an empty state: `Select or create a Production project`;
- actions: `Open Production`, `Create Project`, `Search Projects`;
- show no shot editor, no provider prompt composer, and no generation button.

When a Production project exists but no shot is selected:

- show the ordered shot list, thumbnails/previews, status/readiness, and missing requirements;
- allow opening, duplicating, splitting, merging, and reordering shots where permissions allow;
- show a clear `Back to Production Canvas` action.

When a stale `shotId` is opened:

- show a recoverable warning;
- offer `Reload latest project`, `Open shot list`, and `Back to Production`;
- never create a new shot implicitly from a stale URL.

## Shot Builder UI

When no shot is selected:

- show ordered shot list,
- show thumbnails/previews,
- show status/readiness per shot,
- show missing requirements,
- allow open, duplicate, split, merge, reorder.

When a shot is selected:

- shot title,
- shot purpose in the story,
- story beat,
- shot type,
- duration,
- aspect ratio,
- cast/characters,
- product involvement,
- audio intent,
- camera/visual intent,
- reference assets,
- source video reference with provider support status, one-video cap, trim controls, role/purpose, and `Apply to child video nodes`,
- child node mini-canvas or ordered child node list,
- readiness and credit estimate,
- save shot,
- apply to child nodes,
- open child node in Image/Video/Audio,
- back to Production canvas.

## Shot Types

Initial shot types:

- presenter/talking head,
- dialogue,
- action,
- product review/demo,
- voiceover scene,
- lip sync,
- singing/music,
- b-roll/cinematic insert,
- transition,
- packshot/CTA (`packshot_cta` in shared contract),
- custom.

## Character and Product Requirements

Shot Builder must support:

- number of characters,
- selecting exact characters,
- character roles,
- character continuity notes,
- whether character asset creation is needed,
- product shown/demoed/reviewed/not present,
- product claim/evidence requirements,
- product image/reference selection,
- customer journey stage for product shots,
- product visual accuracy requirement,
- image reference/start frame/stop frame/packshot strategy,
- product-specific must-show and must-avoid notes.

## Audio Requirements

Shot Builder must support:

- no audio,
- voiceover,
- dialogue,
- lip-sync dialogue,
- singing,
- music bed,
- sound effects,
- existing audio reference,
- new voice/audio asset required.

## Shot Child Nodes

A shot can contain any combination of child nodes:

- script generation,
- image generation,
- character create,
- voice asset create,
- text to speech,
- music generation,
- sound effect generation,
- video generation,
- prompt QA,
- product truth QA,
- visual consistency QA,
- audio QA,
- video QA,
- human review.

The planner may create these automatically, or the user may add/remove child nodes manually.

## Shot Group Node

In the Production canvas, every shot is represented by a `video_shot` group node.

Required behavior:

- collapsed mode shows shot order, title, thumbnail, status, duration, major assets, warnings;
- expanded mode shows child nodes;
- double-click opens Video Shot tab;
- reordering shot group nodes updates storyboard sequence;
- locking a shot protects child node configs during replanning unless user confirms overwrite.

## Storyboard Assembly

The final storyboard is the ordered list of shots. Storyboard Review and Video Edit handoff must receive:

- shot order,
- shot titles,
- shot metadata,
- generated clips,
- generated or selected audio,
- captions/scripts,
- thumbnails,
- QA status,
- missing/blocked warnings.

## Acceptance

- Production planner can output ordered shots.
- Each shot appears as a `video_shot` group node.
- Video Shot tab can open a shot and save shot-level configuration.
- Shot-level config can create/update child nodes without overwriting manually edited child node configs.
- A project can contain many shots, and every shot can have a different child node graph.
- Storyboard sequence can reorder shots without losing child node configs.
- Storyboard Review and Video Edit handoff preserve shot order and shot metadata.
- Product-related shots preserve selected product images, claim/evidence mapping, customer journey stage, and product QA state.

## Deterministic Shot Mutation Rules

### Reorder

- Update shot `order` values and sequence edges.
- Preserve every child node ID, config snapshot ID, output ref, QA result, and product evidence manifest.
- Increment the ProductionSpace version and sequence/layout version.
- Recompute cue sheet timings.
- Do not invalidate approvals for content unless timing-sensitive audio/caption/transition data changes.

### Duplicate

- Create a new shot ID.
- Clone child nodes into new node IDs.
- Create new config snapshot IDs for cloned nodes.
- Preserve prompts, references, product evidence refs, and tool bindings.
- Clear generated output refs by default.
- Store `sourceShotId` and `sourceNodeId` metadata for traceability.

### Split

- Create two shots from one source shot.
- Distribute duration, story beat, product use, and child nodes by explicit user choice or planner suggestion.
- Rewire sequence edges so upstream dependencies enter the first split shot and downstream dependencies leave the second split shot.
- Preserve locked outputs in the source shot until the user explicitly moves them.
- Mark cue sheet, captions, and transitions as needing review.

### Merge

- Merge into the first selected shot or a new replacement shot.
- Preserve source shot IDs in metadata.
- Merge child nodes in dependency order.
- Detect duplicate output roles such as two final video clips, two CTA packshots, or two narration outputs and ask for a primary/alternate decision.
- Recompute duration, cue sheet, product evidence manifest, and readiness.

### Lock/Unlock

- Locked shots and locked child nodes cannot be overwritten by replanning.
- Replanning can create pending patch suggestions for locked items.
- Unlocking a previously approved shot is a material change and may invalidate plan approval.

### Parent Status Derivation

Shot status derives from child nodes:

- `blocked` when any required child node or product evidence gate is blocked.
- `needs_config` when required nodes exist but lack required config snapshots.
- `ready` when required nodes are configured and upstream dependencies exist.
- `running` when any required child node is queued/running.
- `completed` when required generation and QA nodes pass or warning-pass.
- `approved` only after human/plan approval for the current shot version.

## UI/UX Contract

### Target User / JTBD

- Role: creator/operator refining one storyboard shot inside a larger Production project.
- Goal: understand what this shot needs, configure cast/product/action/audio/visual intent, adjust child nodes, and return to Production without losing edits.
- Entry point: `Video Shot` tab, double-clicking a `video_shot` group node, a shot row in list fallback, or a stale `shotId` route.
- Success outcome: the user can fix a shot-level blocker, save the shot, configure child nodes, and see parent readiness update.

### Surface Inventory

| Surface | File/route | Change |
| --- | --- | --- |
| Video Shot workspace shell | `VideoShotWorkspace.tsx` | Owns no-project, no-shot, stale-shot, selected-shot, locked-shot states. |
| Shot list | `ShotListPanel.tsx` | Ordered shots, status, warnings, thumbnails, reorder/duplicate/split/merge/lock actions. |
| Shot builder | `ShotBuilderPanel.tsx` | Story beat, duration, cast, product use, audio intent, camera/visual intent, references, readiness, save. |
| Shot child nodes | `ShotChildNodeList.tsx` | Child node list/mini-canvas, configure child node, apply shot values, preserve manual edits. |
| Product usage panel | `VideoShotProductUsagePanel.tsx` | Per-shot product images, claims, frame strategy, visual accuracy, QA requirements. |

### Component Map

| Component | Owns | Consumes | Must expose |
| --- | --- | --- | --- |
| `VideoShotWorkspace` | route state, selected shot state, stale/no-project recovery | `ProductionSpace`, `shotId`, feature flags | clear primary action and no provider generate controls in empty states. |
| `ShotListPanel` | shot ordering and selection | ordered `ProductionShot[]`, readiness summaries | keyboard reorder and accessible status labels. |
| `ShotBuilderPanel` | shot-level form and save | selected `ProductionShot`, product/audio/cast refs | dirty state, version conflict recovery, focus-safe validation. |
| `ShotChildNodeList` | child node display and configure actions | child nodes and tool bindings | configure child action, disabled preview-only labels. |
| `VideoShotProductUsagePanel` | shot-level product usage only | project-level `ProductStoryboardAsset[]`, claim map | no mutation of project-level evidence without explicit apply action. |

### State Matrix

| State | Expected UI | Verification |
| --- | --- | --- |
| no project | Empty state with `Open Production`, `Create Project`, `Search Projects`; no shot editor or generate button. | UI test and mobile screenshot. |
| no shot | Ordered shot list, missing requirements, Back to Production Canvas. | UI test. |
| stale shot | Recoverable warning with `Reload latest project`, `Open shot list`, `Back to Production`; no implicit shot creation. | Route negative test. |
| selected shot | Builder, product/audio/cast/reference panels, child node list, readiness, save/apply actions. | E2E journey screenshot. |
| locked shot | Read-only material fields, unlock/replan-with-confirmation path, visible lock reason. | UI test. |
| product blocked | Product Usage panel highlights missing image/claim/evidence with relink/approve/request-evidence action. | Product evidence E2E. |
| save conflict | Local/remote summary and reload/save-as-new where safe. | Router/UI conflict test. |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
| --- | --- | --- |
| 390x844 | Shot list and builder become stacked tabs or accordion sections. Sticky save/back bar never covers validation text. | Mobile screenshot. |
| 768x1024 | Shot list can collapse to a rail; builder remains readable; Product Usage panel can collapse. | Tablet screenshot. |
| 1280x800 | Shot list, builder, and readiness/product rail fit without overlap. | Laptop screenshot and overflow check. |
| 1440x900 | Full shot workspace shows list, builder, child nodes, and readiness rail. | Desktop screenshot and dark/light check. |

### Accessibility Acceptance

- Keyboard path must cover: open Video Shot tab, select shot, reorder shot, duplicate/split/merge with confirmation, open child node, save shot, return to Production, and resolve stale state.
- Reorder controls must work without drag/drop and announce the new order.
- Confirmation dialogs for delete/merge/unlock must trap focus and return focus to the initiating shot row.
- Product Usage panel fields must have labels that explain claim IDs, evidence IDs, fidelity risk, and frame strategy in normal language.
- Validation messages must be associated with fields or panels and must not rely on color alone.
- Reduced motion disables auto-scroll/reorder animations and shot list transition effects.

### Browser Evidence Required

- Evidence file must include no-project, no-shot, stale-shot, selected-shot, locked-shot, product-blocked, and conflict screenshots across required viewports.
- The canonical E2E journey must prove a shot opens from the canvas/list, a shot-level product blocker is understandable, a save writes only that shot, and `Back to Production` returns focus to the originating node or row.
