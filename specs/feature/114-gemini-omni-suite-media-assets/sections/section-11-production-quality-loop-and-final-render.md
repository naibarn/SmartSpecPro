# Section 11: Production Quality Loop And Final Render

## Goal

Add an end-to-end production loop that repeatedly plans, verifies, revises, and only then submits expensive final video generations.

The loop should protect user credits and raise output quality by checking story fit, asset readiness, product truth, provider fit, cinematic quality, and budget before final render.

## Scope

Add a `ProductionQualityGate` contract:

- `gateStatus`: pass, warning, revise, human_review, block
- `confidenceScore`
- `expectedQualityScore`
- `creditRiskScore`
- `providerFitScore`
- `storyAlignmentScore`
- `productTruthScore`
- `assetReadinessScore`
- `blockingIssues`
- `revisionInstructions`
- `reviewerVerdicts`
- `allowedNextActions`
- `attemptCount`
- `maxAttemptsReached`
- `contractVersion`

Add final provider selection:

- provider/model candidates
- capability match
- quality expectation
- reference support
- voice/audio support
- duration/aspect/resolution fit
- cost estimate
- provider availability/backoff state
- fallback plan

Gemini Omni Video and Seedance 2 should be treated as high-quality final provider candidates when their capabilities fit the production plan. Other existing video providers can remain eligible when they better match the user's goal, budget, or asset constraints.

## Required Loop

The production loop should follow this order:

1. User defines `ProductionGoal`.
2. `media-production-storyboard-planner` creates a reviewable plan/storyboard package.
3. `media-production-plan-verifier` reviews the package and returns pass/warning/revise/human_review/block.
4. If verifier returns revise, planner applies targeted revisions within loop limits.
5. User approves the verified plan or requests full/targeted revisions until satisfied.
6. Production Director creates or revises provider-ready `ProductionBible`, `ProductionAssetPlan`, and prompt packages from the approved plan.
7. Required assets are generated, selected, imported, or confirmed.
8. Deterministic validators check schema, provider capabilities, asset readiness, pricing, product truth, and storyboard feasibility.
9. Reviewer roles inspect story continuity, cinematic quality, character identity, voice/audio fit, product claims, customer journey, safety, and cost risk.
10. Quality gate aggregates pass/warning/revise/human review/block.
11. If revisable, the system applies targeted revisions to goal, bible, asset plan, prompt, scene, clip, voice line, or provider selection.
12. If passed, final provider preflight validates credits, budget, concurrency, provider health, and callback/polling readiness.
13. Final provider generation is submitted.
14. Post-generation QA checks output against the original production goal and generated asset plan.
15. Production output is exported into two downstream workspaces:
   - Storyboard Review for story timeline review, approval, revision requests, and final storyboard render.
   - Video Edit for user-controlled timeline editing, trimming, ordering, overlays, captions, audio mixing, and manual export.
16. If final QA fails and budget/policy allows, targeted revision loops again without regenerating unaffected approved work.

## Durable States

Production runs should support these states:

- `goal_draft`
- `goal_ready`
- `plan_generating`
- `plan_ready_for_review`
- `plan_verifying`
- `plan_verification_failed`
- `plan_needs_revision`
- `plan_approved`
- `production_bible_ready`
- `asset_plan_ready`
- `asset_generation_running`
- `asset_qa_failed`
- `asset_qa_passed`
- `storyboard_ready`
- `quality_gate_running`
- `quality_gate_passed`
- `quality_gate_needs_revision`
- `human_review_required`
- `final_provider_selected`
- `final_preflight_passed`
- `final_generating`
- `final_qa_failed`
- `final_qa_passed`
- `revision_running`
- `completed`
- `cancelled`
- `failed`

Invalid transitions must return stable reason codes and must not silently mutate task state.

## Credit Protection

Credit reservation and provider submission are blocked while:

- plan/storyboard approval is missing
- plan verifier status is revise, human_review, block, failed, or unavailable without an allowed audited override
- required production assets are missing
- provider capability match fails
- product evidence is insufficient
- product image fidelity fails
- storyboard feasibility fails
- quality gate status is revise, human_review, or block
- budget, balance, concurrency, or provider health checks fail

Authorized human override can allow specific warning/revision states only when policy permits it. It must be audited with actor, reason, risk score, affected assets/clips, estimated credits, and contract version. Overrides must not bypass hard policy blocks, Feature 115 hard blocks, budget limits, or tenant restrictions.

Approval override for skipping plan/storyboard review should be disabled by default. If enabled for internal/admin use, it must record actor, reason, risk score, estimated batch cost, and affected scenes/clips.

## Output Routing

Production output must support two first-class downstream routes. Both routes receive projections/copies of production output, while the Production run remains authoritative for provider submission, credit reservation, provider asset snapshots, QA, learning, and historical generation metadata.

### Storyboard Review Route

Storyboard Review remains the human review and storyboard render workspace.

The Storyboard Review route should send:

- production run ID
- story bible summary
- scene and clip order
- prompt and shot list
- selected asset snapshots
- product evidence and claim warnings
- provider plan and model
- generated media URLs
- quality gate summary
- post-generation QA summary
- revision options

Storyboard Review can return:

- approval
- comment
- targeted revision request
- imported replacement marker
- composition preference

Storyboard Review must not directly edit provider submission payloads, credit ledger records, provider asset records, or historical task metadata.

Storyboard Review is responsible for review-driven final storyboard rendering when the user wants the approved story timeline rendered or compounded from reviewed clips. Its render/composition state must be stored as review/composition output, not as a rewrite of the original provider generation records.

### Video Edit Route

Video Edit is the user-controlled editing workspace for manual post-production.

The Video Edit route should create or update an editable project containing:

- production run ID and source surface
- scene and clip order
- generated clip media
- prompt and shot metadata
- selected asset snapshots
- voiceover/dialogue text
- audio/music/sound references where available
- captions/subtitle draft when available
- product evidence and claim warnings when relevant
- QA badges and known issues
- source provider/model metadata
- edit-safe provenance IDs

The route should reuse the existing Video Editor project contract and storyboard builder pattern (`VideoEditorProject` / `buildStoryboardVideoProject`) unless compatibility tests prove a gap. Gemini Omni and Production-specific data should be attached as project/asset metadata and provenance rather than introducing a second timeline schema.

If only prompts/placeholders exist, `Open in Video Edit` must either create explicit non-renderable placeholders that the editor can display safely or remain disabled until usable media exists. It must not create a renderable project with fake clip URLs.

Video Edit can return:

- edited project ID
- user timeline edits
- manual clip replacements
- trims/splits/reorders
- overlays/captions
- audio mix decisions
- exported media references

Video Edit edits must be treated as user edit-layer changes. They must not mutate provider submission payloads, original generated media metadata, provider asset snapshots, credit ledger records, or QA/learning evidence unless a dedicated "learn from edited output" action is later designed and explicitly approved.

Both output routes should share an idempotent projection mapping:

- `productionRunId`
- `storyboardRunId`
- downstream surface
- downstream record/project ID
- source output hash
- projection version
- sync status
- last synced timestamp

This prevents duplicate review records or edit projects and allows generated clip completion to update downstream projections without overwriting user edits.

### Dual-Output UX

After a production run has reviewable prompts or generated clips, Media Studio should show two distinct actions:

- `Review Storyboard`: opens Storyboard Review for narrative approval, QA, revisions, and final storyboard render.
- `Open in Video Edit`: opens Video Edit for manual timeline editing and user-controlled export.

The UI should make the difference clear:

- Storyboard Review is for approving and rendering the story plan.
- Video Edit is for hands-on editing after generation.

Users should be able to send the same production output to both places without duplicating provider generation or charging final provider credits again.

Storyboard Review render and Video Edit export may have separate render/export queue behavior and cost. Those costs must be labeled as render/export or composition cost, not as Gemini Omni/Seedance/provider generation credits.

## Tests

- Quality gate blocks final provider submission on revise, human_review, or block.
- Missing plan/storyboard approval blocks batch asset generation, provider submission, and final render.
- Plan verifier blocks batch execution on revise, human_review, block, failed, or unavailable unless an audited internal/admin override is allowed.
- Full and targeted plan revisions update the reviewable plan package before batch execution.
- Approved/locked scenes and assets survive targeted revisions unless dependency validation explicitly unlocks them.
- Final provider selection rejects providers that lack required asset/reference capability.
- Gemini Omni and Seedance 2 can both be represented as final provider candidates.
- Budget/concurrency/provider health preflight runs after quality pass and before provider submit.
- Targeted revision changes only affected story, scene, clip, voice line, asset, or provider nodes.
- Post-generation QA can route to revision without duplicating completed approved clips.
- Human override is audited and cannot bypass hard blocks or budget policy.
- Storyboard Review receives production-level story and QA metadata.
- Storyboard Review revision feedback maps back to a production run without mutating historical provider submission metadata.
- Video Edit project creation receives production clips, scene order, audio/dialogue metadata, asset snapshots, QA badges, and provenance IDs.
- Video Edit handoff reuses the existing `VideoEditorProject` contract and does not introduce a parallel timeline schema without failing compatibility tests.
- Video Edit placeholder behavior is explicit: safe non-renderable placeholders or disabled action until media exists.
- Sending output to Storyboard Review and Video Edit does not duplicate provider jobs or reserve additional final provider credits.
- Storyboard Review render and Video Edit export costs are tracked separately from provider generation credits.
- Video Edit timeline edits are stored as edit-layer changes and do not mutate original provider submission, credit ledger, provider asset snapshots, or historical generated media metadata.

## Completion Criteria

- Production-grade work has an explicit planning, asset, QA, final render, and review loop.
- Expensive final provider calls are protected by readiness, quality, and budget gates.
- The system can choose Gemini Omni, Seedance 2, or another provider based on fit instead of forcing one model.
- Users see clear next actions when quality is not ready instead of being pushed into credit-spending retries.
- Completed or reviewable production output can be routed to both Storyboard Review and Video Edit with clear user intent and safe data boundaries.
- Batch execution starts only after the user approves a generated plan/storyboard package or a documented internal override permits skipping approval.
