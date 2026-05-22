# Specification: Production Director Node Canvas

## Objective

Build Production Director as a true goal-first production planning workspace inside Media Studio.

The user starts with a simple Production Goal, adds existing assets and product evidence, asks a planning skill/LLM to create a complete storyboard plan, reviews and edits the plan as a React Flow node canvas, configures each shot/node through existing Image/Video/Audio tools, and then sends the approved output to Storyboard Review and Video Edit.

This replaces the interim form-like Production Director that appears above Image/Video/Audio controls.

## Product Hierarchy

```text
Production Project
  -> Production Brief / Goal
  -> ProductionSpace
  -> Ordered Video Shots
  -> Shot Child Nodes
  -> Existing Tool Surfaces
  -> Storyboard Review / Video Edit
```

## Core Requirements

### Production Workspace

- Production is a top-level Media Studio tab before Video Shot, Image, Video, and Audio.
- Production renders only the planning workspace.
- Production must not render provider prompt composer or media generation controls underneath.
- Header shows selected project, status, last save, save action, project search/open, new project, and thumbnail/preview where available.
- Project search must show thumbnail, title, status, short description, platform/audience, and updated time.
- Goal brief must stay readable and include only high-value project-level inputs.

### Context Assets

Users can drag or click-to-add:

- character assets and character images,
- product images and marketplace products,
- scene/mood/background references,
- audio/voice/music assets,
- prior generated media,
- Storyboard Review or Video Edit outputs where applicable.

Each asset must preserve provenance, ownership, and source metadata. Product assets must preserve Feature 115 evidence, claim risk, SKU/variant, customer journey, and approval state.

### Planning Skill Context Pack

The planner receives:

- `production_brief`,
- `context_assets`,
- product storyboard assets and claim/evidence maps,
- available SmartSpecPro tools,
- provider capabilities,
- budget and quality policy,
- previous canvas if replanning,
- locked shots/nodes,
- revision request,
- downstream targets.

The planner returns:

- production bible,
- story beats,
- shot count estimate,
- ordered shots,
- shot child node plan,
- React Flow nodes/edges,
- node tool bindings,
- node config suggestions,
- product shot usage,
- product evidence manifests,
- risk/warning list,
- cost/time estimate,
- approval checklist,
- next actions.

### Video Shot Workspace

- Add `Video Shot` as a top-level tab after Production and before Image/Video/Audio.
- A Video Shot represents one storyboard shot.
- A shot owns cast, product use, audio intent, visual intent, duration, source references, child nodes, output refs, QA status, and readiness.
- Each `video_shot` group node opens the Video Shot workspace.
- Shot list supports open, duplicate, split, merge, reorder, lock/unlock, and stale-shot recovery.

### Node Canvas

- Use existing `@xyflow/react`.
- Canvas contains story-level nodes, shot group nodes, child execution nodes, context asset nodes, QA/gate nodes, and handoff nodes.
- Users can edit nodes, reconnect edges, add/remove nodes, lock nodes, save layout, request targeted replanning, and approve.
- Invalid graph state shows warnings and blocks approval, but does not destroy user edits.
- A structured list fallback is required for mobile, keyboard, and accessibility.

### Node-To-Tool Binding

Production owns node state. Existing tools are editor surfaces.

- Image nodes open the Image tab.
- Video nodes open the Video tab.
- MVP supports basic TTS node config handoff first. Music/SFX/voice/STT nodes remain part of the full node matrix, but stay disabled or preview-only until post-MVP adapter gates pass.
- Character nodes open Character wizard.
- Voice/audio asset nodes open Audio asset wizard.
- Storyboard Review and Video Edit nodes open downstream projects/tasks.

Every configurable node stores an isolated `ProductionNodeConfigSnapshot`. Save operations require matching `productionRunId`, `spaceVersion`, `nodeId`, `nodeVersion`, and `configSnapshotId`.

`Save to Node` stores settings without provider generation credits. `Generate This Node` is separate and only runs after readiness and credit confirmation.

### Provider Capabilities

Production Director is provider-neutral. It can plan for Gemini Omni, Seedance 2, and other suitable tools. Gemini Omni-specific rules are stored as provider capability metadata and validation issues.

Gemini Omni facts to enforce:

- Video uses `video_list: [{ url, start?, ends? }]` for source video.
- Max one source video.
- Source video counts 2 reference units.
- Image refs count 1 unit each.
- Character IDs count 1 unit each, max 3.
- Total reference units max 7.
- Pricing branch differs between with-video and without-video.
- User UI must show friendly labels, not raw provider keys.

Audio ID max remains contract-uncertain; MVP should fail safe at one audio ID for Gemini Omni Video/Character unless admin metadata explicitly enables a higher count.

### Persistence

Feature 116 adds versioned `ProductionSpace` persistence while preserving existing media production runs.

The saved space must restore:

- brief,
- selected assets,
- product evidence,
- ordered shots,
- canvas nodes/edges/layout,
- node config snapshots,
- output refs,
- planner/verifier outputs,
- approval state,
- downstream handoff/result records.

Every mutating procedure uses expected-version checks and returns typed conflicts rather than overwriting stale data.

### Handoff

Approved plans can hand off to:

- Storyboard Review for final storyboard review/render flow,
- Video Edit for manual editing.

Handoff payloads must include ordered shots, metadata, generated clips, audio refs, captions/subtitles, cue sheet, QA summaries, product evidence manifests, and source idempotency key.

Repeated handoff opens the existing downstream project/task when possible.

Downstream result records can sync selected takes, trims, captions, product warning resolution, and manual fidelity approvals back into ProductionSpace as a new version or a conflict.

### Operational Safeguards

- Feature flags for Production Space UI, Video Shot tab, live planner/verifier, node config mode, execution scopes, and downstream handoff.
- Optimistic locking and typed conflicts.
- Idempotency keys for planner/verifier/generation/handoff actions.
- Audit events and metrics for planner, verifier, config saves, credits, execution, archive/delete/export, handoff, and downstream imports.
- Archive, restore, soft delete, safe export, and stale output ref repair.
- Approval invalidation after material changes.
- No provider-generation credits during planning, verification, layout, shot editing, or Save to Node.

### UI/UX and Browser Evidence

- Every major surface must have a completed UI/UX contract: Production Workspace, React Flow Canvas, Video Shot Workspace, Node Drawer/Node Config Mode, Product Evidence Tray, and Handoff/Execution/Export.
- Production must guide the user through Goal, Assets, Plan, Fix blockers, Approve, Configure/Generate, Review/Edit, and Export/Archive.
- Browser evidence must cover 390x844, 768x1024, 1280x800, and 1440x900 viewports.
- Accessibility acceptance must include keyboard-only journey, focus order, focus trap/restore, accessible names for icon-only controls, contrast, dark/light readability, reduced motion, and axe/WCAG or documented equivalent.
- The canonical E2E proof must show goal creation, asset/product evidence add, fixture plan render, canvas/list edit and reconnect, Image/Video/basic TTS node config, Save to Node, approval, handoff preview, and zero provider-generation credit spend before explicit generation confirmation.
- Normal UI copy must be Thai/English friendly and recovery-oriented. It must not expose raw provider keys, private storage keys, raw schema stack traces, raw Feature 115 debug terms, or internal adapter IDs.
- Visual design must reuse existing Media Studio/shadcn/dashboard tokens, semantic colors, button hierarchy, focus rings, and compact operational density.

## Non-Goals For MVP

- Real-time collaborative canvas editing.
- Full automated batch execution for all providers.
- Social platform publishing.
- Advanced caption editor if Video Edit covers MVP caption work.
- Indexed product evidence projections unless query volume demands them.

## Acceptance Criteria

- Production tab is exclusive and no media generation form appears below it.
- Video Shot tab exists and can open an ordered shot.
- Project search/open/save restores the full ProductionSpace.
- Planner fixture output renders nodes, edges, ordered shots, and child node plans.
- Node drawer can open Image, Video, and basic TTS surfaces in node config mode.
- `Save to Node` updates only the active node snapshot.
- Multiple same-type nodes keep distinct configs and outputs.
- Storyboard Review and Video Edit handoff payloads preserve shot order and product evidence manifests.
- Product-related generation is blocked when Feature 115 evidence is missing, unapproved, mismatched, or unsupported.
- Gemini Omni node readiness blocks invalid reference unit combinations before credit reservation.
- UI/UX browser evidence artifact exists and covers the required viewports, keyboard path, accessibility checks, responsive layout, dark/light readability, and canonical journey.
- User-facing disabled/error/recovery copy is present for live handoff disabled, provider generation disabled, planner failed/partial/schema-invalid, product evidence blocked, invalid edge, stale conflict, permission denied, and export success.
- Typecheck and targeted tests pass.
