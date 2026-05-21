# Section 09: Media Studio Production Director

## Goal

Add a centralized Media Studio Production/Director workspace that lets users define the real creative objective before choosing individual image, video, audio, or provider execution details.

This section turns Media Studio from separated tabs into a goal-driven production workflow while preserving the existing Image, Video, and Audio tabs as standalone execution surfaces.

## Scope

Add a new Production or Director tab in Media Studio.

The tab should collect a `ProductionGoal` before any expensive provider generation:

- goal type: film, product review, ad, brand story, UGC, tutorial, customer journey, social short, or custom
- target audience and platform
- story premise or campaign objective
- product context when selected from Marketplace Capture or Feature 115
- brand voice, tone, CTA, and platform constraints
- desired duration, aspect ratio, language, and output count
- cinematic style: genre, camera language, lighting, pacing, color, transitions, and realism level
- character requirements and reusable character assets
- voice, narration, dialogue, sound, music, or silence strategy
- budget/credit guardrails and quality target
- constraints, avoid list, claims policy, and human approval requirements

Add a durable `ProductionRun` contract:

- `productionRunId`
- `goal`
- `productionBible`
- `assetPlanId`
- `storyboardRunId`
- `finalProviderPlan`
- `qualityGateSummary`
- `budgetSummary`
- `status`
- `attempts`
- `createdBy`
- `contractVersion`

The `ProductionBible` should become the shared creative source of truth:

- story or campaign objective
- audience and platform fit
- narrative arc
- characters/cast
- product truth and claim boundaries
- visual style and continuity rules
- voice/audio strategy
- scene timeline intent
- success criteria and quality bar

Add a required `Plan & Storyboard Approval Gate` before batch execution.

After `ProductionGoal` is saved, Media Studio should run `media-production-storyboard-planner` to create a reviewable plan package:

- production goal interpretation
- production bible draft
- creative strategy
- storyboard outline
- scene timeline
- shot plan
- asset requirements
- provider candidate plan
- batch execution plan
- credit/time estimate
- risks and assumptions
- approval checklist

The user must be able to inspect this package before any batch asset generation, provider generation, or final render starts.

After the planner creates or revises the package, Media Studio should run `media-production-plan-verifier`.

The verifier should produce a structured verdict:

- pass
- warning
- revise
- human_review
- block

If the verifier returns `revise`, the planner should receive targeted revision instructions and update only the relevant plan/storyboard parts where possible. Default maximum verifier-guided revisions: 2.

The gate should support these user actions:

- approve plan and start batch
- revise all
- revise selected scene
- revise selected shot
- revise dialogue/voiceover
- revise product claims
- revise asset requirements
- revise provider selection
- revise batch order
- lock approved scenes/assets and revise only selected targets

Batch execution can start only after the plan/storyboard approval status is `approved` or an authorized policy permits a documented manual override.

The normal user path must require both:

- plan verifier status is pass or warning accepted
- user approves the plan/storyboard package

Agency Swarm, LangGraph, and OpenAI Agents Python are optional runtime helpers, not required UI concepts. The Production tab should not expose these engine names to normal users.

## UX Requirements

The first screen in this tab should be a command center, not another raw provider form.

ProductionGoal should be presented as a visual goal canvas. It must be readable at a glance and editable by clicking focused cards, not by scanning a long configuration form.

Required panels:

- Goal Summary Card: a short plain-language description of the intended output.
- Output Type Cards: film, product review, ad, brand story, tutorial, UGC, customer journey, or custom.
- Audience and Platform Chips: audience, language, platform, aspect ratio, duration, delivery constraints.
- Product or Brand Card: product/shop/brand context, CTA, evidence readiness, claim risk.
- Characters and Cast Cards: characters, roles, identity requirements, reusable assets.
- Voice, Audio, and Sound Cards: narrator, dialogue, voiceover, music/sound strategy, silence.
- Visual Style Board: style cards, reference thumbnails, mood tags, camera/lens/lighting tags.
- Story/Campaign Mini Timeline: hook, setup, proof/demo/escalation, payoff, CTA.
- Production Constraints Chips: avoid list, policy limits, budget guardrails, quality target.
- Readiness, Cost, and Quality Strip: missing inputs, estimated complexity, likely providers, next action.

The visual canvas should keep normal-user text concise and scannable:

- use short labels instead of raw enum names
- use icons, badges, thumbnails, and chips where they reduce reading effort
- show only the most important fields by default
- move detailed settings into drawers or advanced sections
- avoid exposing provider payload keys in the goal canvas
- keep mobile layout card-based with no horizontal scrolling
- preserve keyboard and screen-reader access for every card action
- use graphics only when they improve comprehension or choice speed, not as decoration
- provide text labels and accessible names for every icon, thumbnail, badge, and timeline node

Recommended components:

- `ProductionGoalCanvas`
- `GoalSummaryCard`
- `OutputTypeSelector`
- `AudiencePlatformChips`
- `ProductBrandContextCard`
- `CharacterVoiceCards`
- `VisualStyleBoard`
- `StoryArcMiniTimeline`
- `ConstraintsChips`
- `GoalReadinessStrip`
- `ProductionGoalTemplatePicker`
- `ProductionGoalRevisionDrawer`

Add starter templates for common goals:

- product review short
- TikTok Shop trend short
- Shopee product support video
- cinematic brand story
- UGC ad
- tutorial/demo
- customer journey campaign
- character dialogue scene

Applying a template should preview changed cards/fields and must not overwrite imported product evidence or selected assets without confirmation.

If the ProductionGoal is too vague, the UI should run a small AI clarification step before planner execution. It should ask only for missing decisions that materially change the plan, such as audience, product, duration, platform, voice strategy, CTA, or budget. The user can accept defaults where policy allows.

ProductionGoal edits should create a lightweight version trail so users and support can understand what changed:

- goal version
- changed cards/fields
- actor: user, AI planner, system, or admin
- timestamp
- optional reason/template
- affected scenes/assets after replanning

Existing Image, Video, and Audio tabs remain available. The Production tab can launch those tabs with prefilled context when a required asset needs to be created manually.

The user should clearly see the difference between:

- planning
- plan/storyboard approval
- asset preparation
- storyboard review
- final render
- post-generation QA

Planning must not reserve provider credits. Any credit reservation or provider submission must wait until the relevant quality gate passes or an authorized human override is recorded.

The UI should present the generated plan/storyboard as editable review content, not hidden JSON. Normal users should see scene cards, shot cards, asset requirements, cost estimates, assumptions, and risk badges. Advanced/debug views may show the raw structured planner output.

Plan verifier warnings should appear as concise badges or a review drawer. They should explain what might go wrong and what action fixes it, without exposing internal framework names such as Agency Swarm, LangGraph, or OpenAI Agents SDK.

## Existing System Fit

The Production tab should reuse existing Media Studio primitives where possible:

- existing prompt and Auto Prompt skill area
- existing upload/library pickers
- existing model selection cards
- existing task/result cards
- existing Storyboard Review workspace
- existing product/marketplace selectors
- existing credit estimate and generate button patterns

Provider-specific details such as `audio_ids`, `character_ids`, `video_list`, Gemini Omni reference units, or Seedance 2 model-specific constraints should be summarized in readiness panels, not exposed as normal user inputs.

## Files Likely Touched

- `apps/web/client/src/pages` or Media Studio route files
- Media Studio tab/navigation components
- Media Studio model/task state hooks
- shared production orchestration types
- production/director service or router
- i18n locale files
- UI tests near Media Studio

## Tests

- Production tab can create a valid `ProductionGoal` without selecting a final provider.
- ProductionGoal visual canvas renders a concise summary without showing raw technical/provider fields.
- Editing a visual card updates the underlying structured `ProductionGoal` without losing advanced data.
- Mobile visual canvas remains readable and usable without horizontal scrolling.
- Screen-reader labels describe cards, chips, readiness badges, and edit actions.
- Starter templates preview changed cards/fields and do not overwrite imported product evidence or selected assets without confirmation.
- AI clarification asks only material missing questions and can continue with defaults where allowed.
- Goal revision drawer shows goal version, changed fields, actor, timestamp, and affected plan/storyboard items.
- Graphics used by the goal canvas have text labels and accessible names.
- Production tab runs planner skill and displays a reviewable plan/storyboard before batch execution.
- Production tab runs plan verifier and blocks batch execution on revise, human_review, block, or unavailable verifier unless tenant policy permits audited internal/admin approval.
- User can request full revision or targeted revision of scene, shot, dialogue, product claim, asset requirement, provider plan, or batch order.
- Locked approved scenes/assets are preserved during targeted revision unless dependencies require unlocking.
- Batch execution cannot start while plan/storyboard approval status is draft, needs_revision, or rejected.
- Planning does not reserve credits or submit provider tasks.
- Selecting a marketplace product imports typed product context and evidence references.
- Existing Image, Video, and Audio tabs still work standalone.
- Production tab can open existing tabs with prefilled run context.
- Readiness panel blocks final generation when required product, character, audio, or reference assets are missing.
- Thai and English labels exist for new Production tab UI text.
- Mobile layout keeps command center panels usable without horizontal scrolling.

## Completion Criteria

- Users can define a production goal before choosing Gemini Omni, Seedance 2, or another final provider.
- Users can understand and edit the production goal from a visual canvas without needing to understand technical config fields.
- Users can start from templates, answer minimal AI clarifying questions, and inspect goal diffs without losing trust in what the system will do.
- Users can review and revise a generated plan/storyboard until satisfied before starting the remaining batch work.
- Media Studio has one clear command center for cinematic/storytelling work.
- Existing provider-specific workflows remain intact and are not hidden behind the Production tab.
- The system can persist and reopen a production run with its goal, production bible, status, and next action.
