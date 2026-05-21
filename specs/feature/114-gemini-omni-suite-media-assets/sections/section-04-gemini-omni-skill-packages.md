# Section 04: Gemini Omni Skill Packages

## Goal

Add skill packages that understand Gemini Omni’s asset-aware video planning and QA requirements.

## What This Section Must Change

Create:

- `apps/web/skills/media-production-storyboard-planner`
- `apps/web/skills/media-production-plan-verifier`
- `apps/web/skills/gemini-omni-video-director`
- `apps/web/skills/gemini-omni-prompt-qa`
- `apps/web/skills/gemini-omni-video-quality-qa`

Each package must include:

- `SKILL.md`
- `skill.md`
- `schemas/input.schema.json`
- `schemas/output.schema.json`
- `schemas/ui.schema.json`
- `references`
- fixtures/examples
- `scripts/verify.sh`
- registration/sync metadata compatible with the existing app skill catalog
- versioned contract fixtures and snapshot tests for required output fields
- fallback behavior for unavailable, disabled, or invalid-output skills
- `tests/tests.json` or equivalent structured assertions used by skill verification
- optional `skill.lock.json` or registry lock metadata when existing skill catalog tooling expects it
- no live Kie/provider calls in verification scripts
- optional Python/JavaScript helper scripts for deterministic contract, quota, story, and fixture validation

## Production Storyboard Planner Contract

`media-production-storyboard-planner` is the first skill in Production Director mode. It runs after the user defines `ProductionGoal` and before asset generation, provider submission, or batch execution.

The planner must produce a reviewable plan package:

- `skill_name`
- `skill_version`
- `contract_version`
- `production_goal_summary`
- `production_bible`
- `creative_strategy`
- `storyboard_outline`
- `scene_timeline`
- `shot_plan`
- `asset_requirements`
- `provider_candidate_plan`
- `batch_execution_plan`
- `credit_and_time_estimate`
- `risk_and_assumption_list`
- `approval_checklist`
- `revision_targets`
- `next_actions`

The storyboard outline should be human-reviewable before any expensive work starts. It should include scene order, narrative purpose, customer journey stage when relevant, expected visual, intended audio/dialogue/voiceover, required references/assets, estimated duration, and provider feasibility notes.

The batch execution plan should split work into ordered phases:

1. required asset creation/import/confirmation
2. optional enhancement assets
3. per-scene or per-clip generation
4. QA checkpoints
5. Storyboard Review projection
6. Video Edit projection
7. final render/export handoff

The skill must support revision commands:

- revise all
- revise goal interpretation
- revise story bible
- revise scene
- revise shot
- revise dialogue/voiceover
- revise product claim
- revise asset requirement
- revise provider plan
- revise batch order
- lock approved scenes/assets while revising only selected targets

Planner output is not provider-ready generation output by itself. After user approval, Gemini Omni Director or another provider-specific director converts the approved storyboard/asset plan into provider-ready prompts and payloads.

## Production Plan Verifier Contract

`media-production-plan-verifier` runs after the planner creates or revises a plan and before the user is asked to approve batch execution.

It should be an LLM-based verifier with bounded loops, not an unbounded autonomous agent.

The verifier must check:

- goal alignment
- story completeness
- audience/platform fit
- asset requirement completeness
- provider feasibility
- product truth and Feature 115 evidence coverage when relevant
- budget/credit risk
- batch order correctness
- missing approval decisions
- downstream readiness for Storyboard Review and Video Edit

Required output:

- `skill_name`
- `skill_version`
- `contract_version`
- `verdict`: `pass`, `warning`, `revise`, `human_review`, or `block`
- `score`
- `blocking_issues`
- `warning_issues`
- `missing_decisions`
- `recommended_revisions`
- `targeted_revision_map`
- `credit_risk_summary`
- `approval_readiness`
- `reviewer_notes`

Default loop:

1. Planner emits a plan/storyboard package.
2. Plan Verifier reviews it.
3. If verifier returns `revise`, planner receives targeted revision instructions.
4. Loop up to 2 verifier-guided revisions by default.
5. Stop at pass, warning, block, human review, or max attempts.

The verifier is required for Production Director mode. If unavailable, normal users cannot start batch execution unless tenant policy explicitly allows manual approval without LLM verification.

Agency Swarm may be used as an optional high-risk review backend for this verifier, but it should not be the default planner runtime in MVP.

## Planner And Verifier Security

Planner and verifier skills must treat user briefs, marketplace text, Feature 115 handoffs, filenames, captions, comments, OCR/DOM snippets, prior AI output, and reference metadata as untrusted evidence.

Required protections:

- Keep untrusted evidence in labeled evidence blocks, not system instructions.
- Use normalized product/insight records and evidence IDs where possible instead of raw marketplace HTML or long review text.
- Cap and summarize evidence before LLM calls.
- Strip prompt-control text, scripts, hidden page text, signed URL queries, account/contact/header noise, and oversized raw payloads.
- Do not allow evidence to change permissions, budget, approval status, provider credentials, tool permissions, output routing, or policy gates.
- Validate planner/verifier JSON outputs against schema before any state transition.
- Store redacted prompts/summaries/hashes/IDs by default, not raw private media or unbounded transcripts.
- Track planner/verifier token and credit cost separately from provider generation credits unless tenant policy marks planning included.

## Director Contract

Must support:

- single-shot one video
- multi-shot prompt for one generated video
- storyboard multi-video plan
- cinematic storyboard production plan
- per-clip shot lists
- asset usage plan
- quota-aware reference summary
- machine-readable Media Studio handoff with duration, resolution, prompt per clip, and retry/QA hints
- story bible with premise, narrative arc, visual language, continuity rules, and CTA
- cast map linking characters to Gemini Omni Character assets
- voice/audio map linking narration, dialogue, and sound intent to Gemini Omni Audio assets
- scene timeline with emotional beats, duration, transitions, and continuity dependencies
- provider-safe lipsync/audio-guided performance metadata
- marketplace product storytelling plans using confirmed Shopee/TikTok Shop product data, selected marketplace images, and Feature 115 insights when available
- customer journey map for product review, sales/demo, brand awareness, trust building, objection handling, conversion, and retention/brand recall stages
- evidence-backed claims map for product features, benefits, review themes, objections, trust signals, captions, CTA, and on-screen text

Top-level Director output must be structured JSON and include:

- `skill_name`
- `skill_version`
- `contract_version`
- `delivery_mode`
- `generation_readiness`
- `story_bible`
- `narrative_arc`
- `cast_map`
- `voice_map`
- `audio_map`
- `scene_timeline`
- `continuity_graph`
- `prompt_sequence`
- `reference_plan`
- `provider_plan`
- `pricing_hint`
- `qa_handoff`
- `marketplace_product_context`
- `product_claims_map`
- `customer_journey_map`
- `warnings`
- `learning_context`

Single-shot and non-cinematic flows may return minimal story structures, but fields must still exist so Media Studio consumes one stable contract shape.

## QA Contract

Prompt QA should evaluate:

- provider compatibility
- shot completeness
- asset references
- quota risk
- continuity
- prompt clarity
- story arc coherence
- character/voice assignment consistency
- cinematic feasibility and provider-safe wording for audio-guided dialogue/lipsync intent
- product data fidelity against confirmed marketplace product fields and selected product images
- evidence support for every product claim, CTA, caption, selling point, and review statement
- customer journey alignment for product storytelling or ad formats
- Shopee/TikTok Shop platform fit and marketplace policy-safe wording

Video QA should evaluate:

- generated result vs prompt package
- asset fidelity
- continuity
- audio/voice use
- regenerate or revise recommendation
- narrative continuity across clips
- character consistency
- cinematic framing, camera motion, lighting, color, pacing, and transition continuity
- voiceover/dialogue alignment and audio-guided performance/lipsync intent when applicable
- product image fidelity and whether generated visuals still represent the selected product
- whether voiceover/captions/on-screen text stay within evidence-backed product facts
- whether the generated clip supports the intended product customer journey stage

Prompt QA and Video QA outputs must include:

- `skill_name`
- `skill_version`
- `contract_version`
- `passed`
- `score`
- `threshold`
- stable issue categories
- severity
- target level: `story`, `scene`, `clip`, `shot`, `voice_line`, `asset`, `provider_quota`, `pricing`, or `policy`
- revisability
- recommended action
- revision instructions
- learning signal candidates

## Production Verification And Subagent Roles

The skill suite must include a production-grade pre-generation verification loop. This loop runs before credit reservation and provider submission.

Reviewer roles:

- Story Continuity Reviewer
- Gemini Omni Provider Constraint Reviewer
- Cinematic Direction Reviewer
- Character & Identity Reviewer
- Voice & Audio Reviewer
- Cost & Risk Reviewer
- Safety/Policy Reviewer
- Product Truth Reviewer
- Marketplace Image Fidelity Reviewer
- Customer Journey Reviewer

These may be implemented as internal skill calls, subagent-like orchestration roles, deterministic scripts, or hybrid checks. Their outputs must be aggregated into one Prompt QA result for Media Studio.

Required quality gate fields:

- `gate_status`: `pass`, `warning`, `revise`, `human_review`, or `block`
- `confidence_score`
- `credit_risk_score`
- `expected_quality_score`
- `blocking_issues`
- `revision_instructions`
- `reviewer_verdicts`
- `max_attempts_reached`
- `allowed_next_actions`

Default pre-generation loop:

1. Production Storyboard Planner emits a reviewable plan/storyboard package.
2. User reviews and approves, or requests full/targeted revisions.
3. After approval, Director emits provider-ready structured prompts and asset usage plan.
4. Scripts validate schema, provider quota, pricing branch, asset references, and fixture contracts.
5. Reviewer roles inspect specialized quality dimensions.
6. Prompt QA aggregates verdicts.
7. Director revises when the result is revisable.
8. Stop at pass, block, human review, max attempts, or budget guard.

Loop limits:

- max Director revision attempts before generation: 3
- max total pre-generation loop attempts: 4
- human review when high-risk reviewer verdicts conflict
- no provider credit reservation while gate status is `revise`, `human_review`, or `block`

## Tests

- JSON schemas validate representative fixtures
- Production Storyboard Planner schemas validate goal-to-plan, storyboard, batch execution, approval checklist, and targeted revision fixtures
- planner/verifier prompt-injection fixtures cannot override schema, permissions, budget, approval, provider choice, or output routing
- planner/verifier evidence minimization strips or summarizes raw marketplace/DOM/OCR content before LLM calls
- planner/verifier cost accounting is separate from provider generation credits or explicitly included by tenant policy
- verification scripts pass
- skill metadata is loadable by existing skill system
- skills can be discovered/selected by stable slug/ID in Media Studio
- issue taxonomy is stable enough for learning recommendations
- cinematic/story issue taxonomy separates story-level, scene-level, clip-level, voice-line, asset-mismatch, quota, and continuity failures
- contract snapshot fails if learning edits remove required Director/QA handoff fields
- invalid Director output is rejected before provider submission
- approved planner output is required before batch asset generation or provider submission in Production Director mode
- targeted planner revisions preserve locked approved scenes/assets unless the dependency graph requires unlocking related items
- Prompt QA and Video QA unavailable states follow tenant policy
- fixture matrix covers production goal planning, full storyboard revision, targeted scene revision, locked approved scene preservation, single-shot, image refs, source-video pricing branch, character/audio refs, over-quota failure, missing assets, multi-shot single video, storyboard multi-video, cinematic voiceover, cinematic audio-guided character dialogue, metadata-only video QA, visual-inspection placeholder QA, learning recommendation candidate, and invalid-output failures
- marketplace fixture matrix covers Shopee product review, Shopee sales/demo, Shopee brand story, TikTok Shop trend-style short, product image mismatch, unsupported product claim, review claim without evidence, customer journey mismatch, missing Feature 115 insights fallback, and synced ProductBrief/ReviewInsight/TikTokShopTrendBrief/VideoBrief import
- `scripts/verify.sh` validates schemas, fixtures, contract snapshots, and skill metadata without network/provider calls
- helper scripts emit machine-readable pass/warning/revise/block results
- verifier catches a plan that would waste credits because assets, quota, pricing branch, continuity, or voice/audio intent are inconsistent
- verifier catches unsupported marketplace claims and product-image mismatch before provider submission
- reviewer aggregation can revise through the Director and stops at max attempts

## Completion Criteria

- Media Studio can select/use these skills without relying on the generic video prompt skill.
- Skill outputs are structured enough that Media Studio does not need to parse free-form prose.
- Skill package failure modes are deterministic and do not accidentally submit provider jobs.
- Production Director mode cannot start batch execution until the reviewable plan/storyboard package is approved.
- Expensive Gemini Omni provider calls are blocked until the production verification loop passes or an authorized human override accepts the risk.
- Marketplace product campaigns are blocked or revised before generation when claims, images, customer journey, or Feature 115 insight references are inconsistent with product evidence.
