## Objective

Upgrade the presentation AI pipeline from “recipe variety with shallow fitting” into a multi-mode layout intelligence system that can route long-form markdown into the right layout strategy and produce materially higher-quality slides.

Sprint-1 execution defaults are recorded in [kickoff-defaults.md](/home/dev/projects/SmartSpecPro/specs/quick/014-presentation-ai-layout-intelligence/kickoff-defaults.md).
Initial contract shapes are recorded in [contracts-appendix.md](/home/dev/projects/SmartSpecPro/specs/quick/014-presentation-ai-layout-intelligence/contracts-appendix.md).
These two support docs are normative for v1 and should be treated as implementation inputs, not optional reference notes.

## Workstreams

### Workstream 0: Profiling and Routing Foundation

Introduce a content-profile layer that derives:
- heading/subheading counts
- paragraph counts and lengths
- bullet density
- section structure
- semantic signals such as process/profile/quote/metric/contact
- editable-vs-visual-first recommendation

This profile becomes the shared input for:
- recipe selection
- LLM compaction
- fallback routing
- telemetry
- source-to-slide traceability
- deck-level consistency heuristics

### Workstream 0.5: Persistence and Rollout Contract

Define:
- persisted slide metadata shape for mode selection and provenance
- compatibility rules with pre-014 slides
- downgrade behavior for older clients/renderers
- feature flags for long-form mode, DSL mode, and full-slide media mode

This workstream must complete before any new mode-specific persisted metadata is relied upon.
It must also lock:
- raw-vs-validated persistence rules
- retry/time-budget defaults
- safety and moderation enforcement points
- quality-gate thresholds used by fallback logic and UI

### Workstream 1: Long-Form Block Family

Add block families specifically for dense content, at minimum:
- article-focus
- sectioned-explainer
- two-column-article
- faq-stack
- profile-board
- timeline-report
- text-heavy-image-footer
- case-study-board

Each long-form recipe must declare:
- supported structure shape
- slot budgets
- visual density ceiling
- fallback relationships

### Workstream 2: Recipe Slot Budgets and Fit Scoring

Replace coarse “body count + char count” rules with per-recipe fit contracts:
- max chars
- max words
- estimated line count
- Thai-aware readability scoring
- section distribution expectations
- severity classes: fits, cramped, unsafe

This layer remains deterministic and is the final validator after any LLM output.

### Workstream 3: Recipe-Aware LLM Compaction

Add a dedicated compaction pass that receives:
- source narrative
- content profile
- chosen recipe or candidate recipe family
- slot budget spec
- target language rules
- allowed compaction level

The output must be structured, validated JSON rather than raw prose.

It must also emit source mapping and disposition metadata such as:
- source paragraph ids used
- content intentionally omitted
- content deferred to a later slide
- confidence / overflow warning

### Workstream 4: Mode Router and Overflow Fallback

Add a first-class router that can select:
- structured_block
- long_form_block
- llm_layout_dsl
- full_slide_media

The router must also define fallback order when fitting fails:
1. stronger compaction
2. alternate recipe in same family
3. long-form recipe
4. slide split
5. full-slide media mode

The router must also enforce:
- provider/model capability allowlists per mode
- latency and credit guardrails
- user override and mode lock semantics
- deck-level consistency heuristics
- lock-conflict resolution when the requested mode is no longer valid

### Workstream 5: Constrained LLM Layout DSL

Define a safe layout schema for custom informational slides that do not fit built-in recipes.

Requirements:
- strict schema validation
- token/style allowlists
- bounded element counts
- content binding support
- downgrade or repair path if output is invalid

This is not the default mode; it is an escalation path for edge cases.

### Workstream 6: Full-Slide Media Mode

Support AI-generated infographic/poster/cover slides as single visual artifacts when appropriate.

Requirements:
- explicit mode selection logic
- prompt contract derived from slide content profile
- source narrative retained for traceability
- metadata stored so users understand why the slide became image-first
- integration with existing media generation models/providers
- guardrails for Thai text rendering reliability and provider suitability

### Workstream 7: Explainability, Telemetry, and Quality Gates

Expose and record:
- selected mode
- candidate modes/recipes
- fit score
- compaction level used
- fallback path taken
- whether the slide was split or escalated to media mode
- whether the user overrode or locked the mode
- source-trace metadata for compaction and split behavior

Add a quality gate that can warn or reject low-confidence outputs.

### Workstream 8: Evaluation Harness and Golden Samples

Build a repeatable evaluation set for:
- Thai long-form article slides
- profile/resume slides
- process/timeline slides
- infographic/poster slides
- compact marketing slides

This harness should measure:
- fit success
- fallback frequency
- user override rate
- text density/readability score
- provider/mode quality differences
- deck consistency drift

## Proposed Delivery Phases

### Phase 1: Profiler + Long-Form Recipe Foundation

- persistence and rollout contract
- content profiler
- first long-form block family
- recipe budget schemas

### Phase 2: LLM Compaction + Deterministic Fit Engine

- compaction prompt contract
- fit scoring
- Thai-aware overflow detection

### Phase 3: Mode Router + Fallback Orchestrator

- structured vs long-form routing
- split-slide and downgrade behavior

### Phase 4: DSL and Full-Slide Media Escalations

- constrained layout DSL
- infographic/poster image-first mode

### Phase 5: Explainability and User Control

- mode explanation surfaces
- user override and lock
- source traceability surfaces

### Phase 6: Hardening

- telemetry
- quality thresholds
- golden-sample evaluation harness
- regression coverage

## Main Design Decisions

1. Keep structured editable mode as the default path.
2. Use LLM for semantic compression, not as the sole source of truth for fitting.
3. Add long-form recipes instead of forcing all dense slides into compact blocks.
4. Treat DSL and full-slide-media as escalation modes, not baseline behavior.
5. Keep deterministic validation after every LLM pass.
6. Preserve source mapping and user-visible reasoning instead of treating compaction as a black box.
7. Apply provider capability and cost guardrails before the router commits to expensive modes.
8. Introduce new routed modes behind explicit persistence and rollout guards.
9. Respect deck-level coherence, not only per-slide local optimum.

## Code Areas Likely Affected

- [aiPresentationService.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationService.ts)
- [aiPresentationLayoutEngine.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationLayoutEngine.ts)
- [aiPresentationComponentRecipes.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationComponentRecipes.ts)
- [componentRecipeSlotBindings.ts](/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/componentRecipeSlotBindings.ts)
- [componentRecipes.ts](/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/componentRecipes.ts)
- [aiTypes.ts](/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/aiTypes.ts)
- [contracts.ts](/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/contracts.ts)
- [PresentationEditor.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationEditor.tsx)
- media generation orchestration and provider capability logic in the AI/media services stack

## Acceptance Criteria

- Dense markdown slides are routed into long-form or alternate modes instead of being forced into compact blocks.
- Recipe-aware LLM compaction exists and returns structured slot candidates.
- Per-recipe fit scoring is explicit and testable.
- At least one long-form family is available end-to-end.
- At least one constrained DSL path exists behind routing logic.
- At least one full-slide media mode exists for visual-first infographic/poster slides.
- The editor can explain which mode and recipe were chosen.
- Users can override or lock the mode and the next regeneration respects that choice.
- The system records source-trace metadata across compaction and split behavior.
- Evaluation on a golden sample set demonstrates better fit quality than the pre-014 baseline.
- Metadata persistence, downgrade, and rollout behavior are defined before new modes ship.
- The router has explicit conflict behavior when a locked mode cannot run.
- Deck-level mode coherence is measured and bounded.
