# Research: Production Director Node Canvas

## Research Decision

Codebase research: yes. This is an existing SmartSpecPro feature that spans shared contracts, Drizzle schema, tRPC routers, Media Studio UI, app skills, provider assets, Storyboard Review, and Video Edit.

Web research: yes, limited to Kie.ai Gemini Omni provider contracts because the plan depends on current provider payloads and quotas.

Testing research: yes. The web app uses npm scripts and Vitest for targeted unit/router tests, plus `tsc --noEmit` through `npm --prefix apps/web run check`.

SocratiCode status: active and green for `/home/dev/projects/SmartSpecPro`; indexed chunks were available and used before targeted shell reads.

## Existing Codebase Findings

### Shared Contracts

Primary file: `apps/web/shared/mediaProduction.ts`.

Current state:

- Defines interim `ProductionGoal`, `ProductionRunStatus`, `ProductionAssetPlan`, readiness helpers, quality gate types, transition validation, and stable output projection hashes.
- Does not yet define the Feature 116 contracts required by the node canvas: `ProductionSpace`, `ProductionBrief`, `ProductionShot`, `ProductionFlowCanvas`, `ProductionFlowNode`, `ProductionFlowEdge`, `ProductionNodeToolBinding`, `ProductionNodeConfigSnapshot`, downstream result records, or product storyboard evidence maps.

Planning implication:

- Feature 116 should extend this file as the shared source of truth before UI/router work.
- New validators and helpers should be unit-tested in `apps/web/shared/mediaProduction.test.ts`.

### Persistence And Routers

Primary files:

- `apps/web/drizzle/schema.ts`
- `apps/web/server/routers/mediaProduction.ts`
- `apps/web/server/routers.ts`

Current state:

- Existing tables include `mediaProductionRuns`, goal versions, plan versions, plan verifications, approvals, asset plans, output projections, Storyboard Review records, Video Editor projects, and provider assets.
- Existing `mediaProductionRouter` has `listRuns`, `getRun`, `saveRun`, `saveGoalVersion`, `savePlanVersion`, `savePlanVerification`, `approvePlan`, and `projectOutput`.
- `listRuns` already returns project thumbnails from generated media or plan clips.
- `projectOutput` currently creates Storyboard Review or Video Edit records directly, but Video Edit does not yet reuse the richer Storyboard Review to Video Editor conversion helper.

Planning implication:

- Add versioned `mediaProductionSpaces` or an equivalent versioned JSON storage layer for the full canvas.
- Preserve existing run/goal/plan records for backward compatibility.
- Add explicit expected-version mutation procedures for space, brief, shots, nodes, canvas layout, planner/verifier outputs, downstream handoff, and downstream result imports.
- Keep `listRuns` but prefer thumbnails in this order: approved shot thumbnail, first generated clip, product reference, first visual context asset.

### Media Studio UI

Primary file: `apps/web/client/src/pages/MediaStudio.tsx`.

Current state:

- Production Director interim state is embedded in the large Media Studio page.
- Production tab is not yet exclusive. After the Production panel, Image/Video/Audio prompt and generation UI can still render below it.
- A second Production Director panel appears in the Gemini Omni suite area, which makes the feature look provider-specific instead of project-level.
- Existing code can save a goal, run planner/verifier skills, approve a plan, apply a plan to prompt, and project output to Storyboard Review / Video Edit.

Planning implication:

- Extract Production-specific UI into `apps/web/client/src/features/media-production/` or `apps/web/client/src/components/media/production/`.
- `Production` must be a first-class tab before `Video Shot`, `Image`, `Video`, and `Audio`.
- `Production` must render only the planning workspace. It must not render prompt composer or provider generate controls.
- `Video Shot` must be a separate tab between Production and Image/Video/Audio.
- Image/Video/Audio tabs remain standalone, but can enter node configuration mode via route/query state.

### React Flow

React Flow is already available through `@xyflow/react`. Existing patterns live in:

- `apps/web/client/src/pages/WorkflowEditor.tsx`
- `apps/web/client/src/pages/AgencyBuilder.tsx`
- `apps/web/client/src/components/agency/*`
- `apps/web/client/src/components/library/KnowledgeCanvasPanel.tsx`

Planning implication:

- Feature 116 should reuse React Flow rather than adding a dependency.
- Tests can mock `@xyflow/react` as existing Workflow/Agency tests already do.
- A list/keyboard fallback is required for accessibility and mobile.

### Provider Assets And Gemini Omni

Primary files:

- `apps/web/server/routers/mediaProviderAssets.ts`
- `apps/web/server/services/mediaProviderAssetService.ts`
- `apps/web/shared/geminiOmni.ts`
- `apps/web/server/services/mediaGenerationService.ts`
- `python-backend/app/llm_proxy/providers/kie_ai_provider.py`

Current state:

- Provider asset persistence and router exist for Gemini Omni Character and Audio.
- Shared Gemini Omni validation supports image references, one source video via `video_list`, character IDs, audio IDs, reference unit limits, source video trim, and provider payload building.
- Node direct provider asset service currently matches Kie docs more closely than the Python provider asset helper for Character/Audio.

Planning implication:

- Production Director must use provider capability metadata and hide raw provider keys from normal users.
- Node config snapshots may store a provider payload preview for audit/debug, but user-facing UI should show labels such as Reference Images, Source Video, Character, and Voice/Audio.
- Provider asset creation should remain a wizard, not a raw JSON field.

### Skills

Relevant app skills exist under `apps/web/skills/`:

- `media-production-storyboard-planner`
- `media-production-plan-verifier`
- `gemini-omni-video-director`
- `gemini-omni-prompt-qa`
- `gemini-omni-video-quality-qa`

Current state:

- Planner/verifier schemas are still broad and do not yet require full `ProductionSpace`, canvas nodes, node bindings, product evidence manifests, or provider capability validation.

Planning implication:

- Upgrade planner and verifier schemas before the UI assumes typed canvas output.
- Start with deterministic fixtures before enabling live planner/verifier calls.
- Planner/verifier LLM calls do not reserve provider-generation credits.

### Storyboard Review And Video Edit

Primary files:

- `apps/web/client/src/lib/storyboardVideoProject.ts`
- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
- `apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx`
- `apps/web/server/routers/videoEditorProjects.ts`
- `apps/web/server/routers/__tests__/videoEditorProjects.storyboardReview.test.ts`

Current state:

- Storyboard Review to Video Edit already has a stronger project conversion path through `buildStoryboardVideoProject`.
- Video Editor can open a project by query parameter.

Planning implication:

- Production Director handoff should produce typed versioned payloads for both Storyboard Review and Video Edit.
- Repeated handoff should be idempotent and open the existing downstream project/task.
- Downstream result imports should return conflict/save-as-new-version when the ProductionSpace source version is stale.
- Use a shared pure TypeScript handoff builder for server and client preview. Do not import React/client-only `storyboardVideoProject.ts` code into server routers; extract pure mapping first if needed.
- Video Edit live handoff must create server-safe `videoEditorProjects` payloads compatible with existing fixtures and must never use provider task IDs as media URLs.

### Media Generation, Credits, And Task Lifecycle

Primary files:

- `apps/web/server/services/mediaGenerationService.ts`
- `apps/web/server/routers/media.ts`
- `apps/web/server/services/creditService.ts`

Current state:

- Existing media routes calculate credits, check available credits, call media generation services, store reserved-credit metadata for async tasks, refund on submission failure, and reconcile unused credits after task completion.
- Existing task status includes pending/processing/completed/failed/cancelled behavior.
- Cancellation/status behavior already belongs to media task infrastructure.

Planning implication:

- Feature 116 `scheduleProductionExecution` should coordinate existing media generation paths and attach Production metadata to tasks.
- It should not create a second provider-submission, polling, or credit ledger stack.
- Run-one-node and run-one-shot must test readiness, user confirmation, credit deduction/refund/reconciliation, scoped cancellation, retry, and output attachment back to the correct node.

## Kie.ai Gemini Omni Provider Findings

Sources:

- Gemini Omni Video: https://docs.kie.ai/market/gemini-omni-video
- Gemini Omni Character: https://docs.kie.ai/market/gemini-omni-character
- Gemini Omni Audio: https://docs.kie.ai/market/gemini-omni-audio
- Common task details: https://docs.kie.ai/market/common/get-task-detail

Provider facts for planning:

- Gemini Omni Video is an async job through `POST /api/v1/jobs/createTask`, model `gemini-omni-video`, returning a `taskId`.
- Video reference inputs use `input.video_list`, max one source video per generation.
- `video_list` item shape is `{ url, start?, ends? }`; the provider key is `ends`, not `end`.
- Reference unit rules: image references count 1 unit each, source video counts 2 units, character IDs count 1 unit each, total max is 7 units. Character IDs max is 3 per request.
- Gemini Omni Character uses `POST /api/v1/omni/character/create` and returns `characterId`.
- Gemini Omni Character payload uses top-level fields such as `character_name`, `description`, `image_urls`, and `audio_ids`.
- Gemini Omni Audio uses `POST /api/v1/omni/audio/create` and returns `kieAudioId`.
- Gemini Omni Audio payload uses top-level fields such as `audio_id`, `name`, `voice_description`, and `example_dialogue`.
- `audio_ids` max is not fully clear from official docs. Until the contract is confirmed, the plan should fail safe: default to one audio ID for Gemini Omni Video/Character, allow admin-config override only with a provider-contract warning.
- Pricing used in the repository matches the user-provided matrix: no source video uses duration/resolution matrix; source video branch uses 240 credits for 720p/1080p and 360 credits for 4K regardless of duration.

Planning implication:

- Provider fixture tests must assert exact payload shapes for Video, Character, and Audio.
- Feature 116 node schemas must carry capability metadata, reference unit counts, pricing branch, and validation issues, not just prompt text.

## Subagent Review Findings Incorporated

The planning audit identified these gaps to close before implementation:

- Existing sections were not yet self-contained enough for `deep-implement`.
- UX flow needed a concrete state matrix for Production, Video Shot, node configuration mode, planner/verifier states, conflicts, and disabled feature states.
- Video Shot needed deterministic mutation rules for reorder, split, merge, duplicate, lock/unlock, child node ownership, and edge rewiring.
- `ProductionNodeToolBinding` had inconsistent shapes between spec and section 13; Section 13 must become canonical.
- Storyboard Review and Video Edit handoff needed typed payloads, schema version, idempotency, conflict behavior, disabled-target behavior, and downstream result import.
- Phase ordering needed a correction: live handoff and execution cannot be enabled before operational gates, audit/metrics, kill switches, and stale-ref handling.
- Provider capability fields were missing from production node/asset schema.
- Planner/verifier schemas must receive and validate `available_tool_capabilities` and `provider_capabilities`.
- Follow-up audit found additional blockers now incorporated: execution scheduler integration with existing media/credit/task infrastructure, server-safe handoff builder architecture, Feature 116 flag truth table, mutating router authorization/TDD coverage, MVP/full-matrix adapter boundary, migration/backfill/rollback/schema-version tests, and explicit planner failed/partial/schema-invalid UX states.

## Testing Context

Test framework and commands:

- Web unit/router tests: Vitest through `npm --prefix apps/web test -- <paths>`.
- Web typecheck: `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check`.
- Skill schema tests: per-skill verify scripts under `apps/web/skills/*/scripts/verify.sh` where available.
- Existing tests to extend:
  - `apps/web/shared/mediaProduction.test.ts`
  - `apps/web/shared/geminiOmni.test.ts`
  - `apps/web/client/src/lib/__tests__/storyboardVideoProject.test.ts`
  - `apps/web/server/routers/__tests__/videoEditorProjects.storyboardReview.test.ts`
  - `apps/web/server/routers/__tests__/media.db-first.contract.test.ts`
  - existing React Flow mocks in Workflow/Agency tests.

Quality gates:

- Shared contract changes require targeted unit tests and full web typecheck.
- Router and DB changes require router/service tests plus typecheck.
- UI tab/workflow changes require component tests where practical and at least manual route inspection if no browser harness exists.
- Skill schema changes require schema/fixture verification.
- Gemini Omni provider changes require payload fixture tests.
