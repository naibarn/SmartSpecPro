# Interview: Production Director Node Canvas

## Interview Mode

No new interactive interview was run because the user repeatedly instructed the system to proceed without additional confirmation and to choose the best implementation direction.

This transcript records the product decisions already supplied by the user and the inferred implementation decisions used for deep-plan.

## Captured Stakeholder Decisions

### Production Director Placement

Question: Should Production Director live inside the Video tab or be a top-level workspace?

Answer: It must be a top-level Media Studio tab before Image/Video/Audio. It is larger than image/video/audio generation because it controls the whole production.

Decision: Implement tab order as `Production -> Video Shot -> Image -> Video -> Audio`.

### Production Tab Scope

Question: Should the Production tab show the Image/Video/Audio prompt forms below it?

Answer: No. Production is for goal-first planning. It must not push the Image tab UI downward or render media-generation controls under the planner.

Decision: Production renders only the planning workspace. Existing media tabs remain standalone execution/configuration surfaces.

### Goal Input

Question: What should the user enter first?

Answer: The user should provide a simple, readable Production Goal: what kind of film/video/story they want, audience, platform, product, characters, voice/lipsync/audio direction, cinematic direction, constraints, and duration.

Decision: Keep the brief readable and use progressive disclosure for advanced options.

### Assets And Library

Question: How should users add context assets?

Answer: They should drag or click assets from the library/search panel into Production Director: characters, scene/background images, product images, marketplace captures, existing audio, generated media, and provider assets.

Decision: Add typed context assets and drop zones, plus click-to-add fallback for accessibility/mobile.

### Character Search

Question: Should the right-side search/library panel include characters?

Answer: Yes. Add character search, including provider character assets and eligible character/person/reference images.

Decision: Include character as a first-class search filter/source.

### Planning Skill

Question: How is the plan created?

Answer: A selected planning skill and LLM should receive the goal, assets, product evidence, available tools/providers, and constraints. It should output a storyboard plan and a node canvas.

Decision: `media-production-storyboard-planner` and future planner skills must accept a full context pack and return typed shots, nodes, edges, tool bindings, and readiness outputs.

### Review Before Spending Credits

Question: Should the system generate immediately after the goal?

Answer: No. It should create a plan/storyboard first, let the user review or revise it, then approve before expensive provider generation.

Decision: Planning/verifier/config-only flows do not reserve provider-generation credits.

### Node Canvas

Question: What should the canvas represent?

Answer: It should represent the entire production flow, similar to modern node-based spaces: text/script nodes, image nodes, video nodes, audio nodes, character/audio asset creation nodes, QA nodes, Storyboard Review, and Video Edit.

Decision: Use React Flow with typed node/edge contracts and a structured list fallback.

### Video Shot Workspace

Question: Why add a Video Shot tab?

Answer: A project contains many shots; each shot can contain many child nodes. The user needs a shot-level workspace to configure one storyboard shot without losing the whole story view.

Decision: Add a Video Shot tab. Each `video_shot` group node opens one shot in this workspace.

### Node-To-Tool Configuration

Question: How should existing Image/Video/Audio tools be reused?

Answer: Clicking a node should open the correct existing tab with that node's config loaded. Saving must return the config to the same node. Multiple nodes of the same type must keep independent configs.

Decision: Add node configuration mode with `productionRunId`, `shotId`, `nodeId`, `nodeVersion`, `configSnapshotId`, `nodeMode=config`, and `returnTo` route/query state. Add `Save to Node` and `Back to Production`.

### Storyboard Review And Video Edit

Question: Where should output go?

Answer: Output goes to two places: Storyboard Review for final review/render flow, and Video Edit for manual editing.

Decision: Add typed handoff payloads and idempotent downstream project/task creation/opening. Add downstream result import back into ProductionSpace.

### Marketplace/Product Use

Question: How should product images from Shopee/TikTok/capture be handled?

Answer: Product images must preserve product identity, image correctness, claims, evidence, SKU/variant info, customer journey, and review/storytelling context. The system must not invent product facts or mismatch images and claims.

Decision: Feature 115 selected product images become first-class `ProductStoryboardAsset` records with claim/evidence maps and product QA gates.

### Provider Scope

Question: Is this only for Gemini Omni?

Answer: No. Production Director can use Gemini Omni, Seedance 2, and any suitable current/future media capability. It should not be tied to Gemini Omni even though Gemini Omni needs special asset/reference support.

Decision: Build provider capability registry and provider-neutral node contracts. Gemini Omni constraints become provider-specific validation metadata.

### Quality Loop

Question: Should the skill verify and improve itself?

Answer: Yes. It should support QA, subagent/LLM verification, repeated review loops, and learning records so users do not waste credits on poor generations.

Decision: Planner/verifier and node QA outputs must persist findings, approvals, revisions, and learning-safe summaries.

## Decisions For Ambiguities

- Audio ID count for Gemini Omni: fail safe at one audio ID until Kie contract is confirmed; allow admin override only with explicit provider-contract warning.
- Persistence: store full `ProductionSpace` as versioned JSON for MVP; add projections only when query volume requires them.
- Live execution: keep behind feature flags until operational gates, audit/metrics, kill switches, and stale output ref handling are implemented.
- UI extraction: avoid adding more large Production code directly into `MediaStudio.tsx`; use feature/components folders.
