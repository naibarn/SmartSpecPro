# Spec: Presentation AI Layout Intelligence

## Context

This spec extends the design-system work in [010-presentation-design-system-upgrade](/home/dev/projects/SmartSpecPro/specs/quick/010-presentation-design-system-upgrade/implementation-plan.md).

The current presentation system can:
- render richer built-in components
- save and reuse custom blocks
- let Draft with AI choose from more component recipes than the legacy template-only flow

The largest remaining quality gap is not component availability. It is layout intelligence:
- long Thai text is still too often routed into compact blocks
- slot binding still relies too heavily on truncation and line picking
- overflow handling is weak
- the AI system still does not reason deeply enough from markdown structure when selecting layout mode

## Goal

Make Draft with AI and relayout flows substantially more intelligent at:
- understanding markdown structure and text density
- choosing the right layout mode for the slide
- compacting copy appropriately for the chosen block
- falling back safely when a compact layout cannot fit
- supporting high-quality text-heavy, infographic, poster, and AI-generated full-slide visual modes

## Problem Statement

The current system upgrades visual variety faster than it upgrades semantic fitting. As a result:
- compact blocks are selected for slides that contain too many paragraphs or too much detail
- text is often truncated instead of rewritten to fit the selected layout
- Thai long-form content is especially vulnerable because paragraph and sentence compression is not layout-aware
- some slides should stay editable and structured, while others should be generated as full-slide visuals, but that routing decision is not formalized enough

## In Scope

- Add long-form block families that are intentionally designed for text-heavy slides
- Build a markdown-driven content profiler that measures structure and density before layout selection
- Add recipe-level slot budgets and deterministic fit scoring
- Add an LLM-assisted recipe-aware compaction pass
- Add overflow fallback rules: compact more, switch recipe, switch mode, or split slide
- Add an optional constrained LLM layout DSL mode for flexible layouts not covered by built-in blocks
- Add an optional full-slide media mode for infographic/poster/image-first slide generation
- Add quality gates and telemetry so the system can score whether a generated slide is acceptable

## Out of Scope

- Replacing the entire editor with free-form HTML/CSS authoring
- Making every slide full-image by default
- Removing structured/component-based slide authoring
- Solving all typography and asset-quality problems independently of layout intelligence

## User Requirements

1. The system must support long-form text layouts, not only compact cards/posters.
2. Markdown structure must influence layout selection.
3. LLM calls should receive slot and layout specs derived from text density and paragraph structure.
4. The system should support a constrained LLM-driven design mode for slides that do not fit known recipes.
5. The system should support generating entire infographic/poster-style slides as media when that is the best-quality option.
6. Output quality must stay high, deterministic where needed, and editable where appropriate.
7. Users must be able to understand or override the chosen mode when needed.

## Required Modes

The system must route each slide into one of these modes:

1. `structured_block`
   - Existing component recipes and compact editable blocks
   - Best for short to medium structured content

2. `long_form_block`
   - New text-heavy blocks designed for multi-section and paragraph-heavy slides
   - Best for article-style or report-style content

3. `llm_layout_dsl`
   - Constrained LLM-generated layout schema
   - Best for edge cases or highly custom informational slides that do not map cleanly to existing blocks

4. `full_slide_media`
   - Image-first slide generated as a complete visual artifact
   - Best for infographic, poster, title slide, or highly decorative one-shot visuals

## Functional Requirements

### Markdown Content Profiler

The system must derive a content profile per slide from markdown or reconstructed narrative, including:
- heading count
- subheading count
- paragraph count
- bullet count
- average and max paragraph length
- total visible text budget
- section count
- metric/quote/contact/timeline/process/profile signals
- long-form vs compact-content classification

### Slot Budget Model

Each recipe must declare slot budgets such as:
- max words
- max characters
- target line count
- slot priority
- overflow handling preference

The fit engine must use these budgets before committing to a block.

### LLM Recipe-Aware Compaction

For `structured_block` and `long_form_block`, the system must be able to call an LLM with:
- the chosen recipe or candidate recipes
- the content profile
- slot budgets
- Thai-language output requirement when needed
- desired compaction level (`compact`, `balanced`, `detailed`)

The LLM should return structured candidates such as:
- headline
- subhead
- section summaries
- bullets
- captions
- CTA
- overflow risk / fallback suggestion

### Overflow Fallback

If compaction still does not fit:
- compact again at a stronger compression level
- switch from compact recipe to long-form recipe
- split the slide
- or switch to `full_slide_media` when visual-first output is more appropriate

### Constrained LLM Layout DSL

The system must define a safe schema for LLM-generated layouts, for example:
- canvas
- background
- elements
- grouping
- element roles
- z-order
- content bindings
- style tokens

The DSL must be validated and normalized before rendering.

### Full-Slide Media Mode

The system must support generating a full-slide infographic/poster image when:
- the slide is visual-first
- structured readability is less important than design quality
- or the selected model/provider can reliably render the desired slide as a single asset

This mode must still:
- store generation metadata
- preserve source narrative/spec
- allow user visibility into why the mode was selected

### User Override and Mode Locking

The system must support:
- per-slide mode override by the user
- optional mode lock so relayout or regeneration does not silently switch the slide to another mode
- explanation of why the system selected a mode and why a fallback occurred

### Source Traceability

The system must preserve enough mapping from source markdown/narrative to generated slots or split slides so the user can understand:
- which paragraphs or sections fed which slide
- whether content was compacted, dropped, or deferred into later slides
- whether a full-slide media output still has an editable source narrative behind it

### Persistence and Compatibility Contract

The system must define where the following metadata lives in persisted slide content:
- selected mode
- candidate modes
- fit score
- compaction level
- source trace mapping
- mode lock / user override state
- full-slide media provenance

This metadata must remain compatible with:
- slides created before 014
- clients that only understand the earlier component-first model from 010
- export/render paths that do not execute the full routing pipeline

### Capability and Cost Guardrails

The system must explicitly account for:
- which model/provider combinations support each mode well enough
- expected latency and credit cost per mode
- when the router should avoid a mode because it is too slow, too expensive, or unreliable for Thai text rendering

### Mode Lock Conflict Resolution

The system must define what happens when a user-locked mode becomes invalid because of:
- missing provider capability
- missing media
- excessive cost/latency
- invalid or unsafe DSL output

The conflict policy must specify:
- when to block generation
- when to request confirmation
- when the system may downgrade automatically with explanation

### Deck-Level Consistency

The router must consider not only single-slide fit but also whole-deck coherence, such as:
- style consistency across slides
- avoiding overuse of `full_slide_media`
- keeping adjacent slides from oscillating between incompatible visual modes without reason

## Non-Functional Requirements

- Keep editor/play/export parity for structured and long-form modes
- Keep deterministic validation after every LLM output
- Maintain a clear explanation trail for why a slide chose a given mode or fallback
- Prefer editability by default; use full-slide media selectively
- Thai-language handling must be first-class in compaction and fit checks

## Architecture Direction

### Layer 1: Content Profiling

Turn markdown/narrative into a compact content-profile object that downstream routing can trust.

### Layer 2: Mode Router

Pick `structured_block`, `long_form_block`, `llm_layout_dsl`, or `full_slide_media` from:
- content density
- markdown structure
- available media
- style intent
- user/model preferences

### Layer 3: Recipe-Aware Compaction

Use LLM to rewrite content into slot-shaped structured copy.

### Layer 4: Deterministic Fit Engine

Validate:
- slot budgets
- estimated line counts
- Thai readability
- visual density
- overflow risk

### Layer 5: Fallback Orchestrator

Retry, change recipe, split slide, or switch mode.

### Layer 6: Quality Gate

Reject or warn when generated output is likely low-quality.

### Layer 7: User Control and Evaluation

The system must:
- expose mode choice and fallback reasons to the editor
- support per-slide override and lock behavior
- record enough telemetry and golden-sample evaluation to measure whether routing quality is actually improving

### Layer 8: Rollout and Compatibility Safety

The system must introduce these capabilities behind explicit rollout guards so that:
- the existing structured/component AI flow can remain the fallback
- DSL mode and full-slide media mode can be enabled gradually
- persisted slide metadata can degrade safely when unsupported

## Proposed New Block Families

At minimum the long-form family should include:
- `article-focus`
- `sectioned-explainer`
- `two-column-article`
- `faq-stack`
- `profile-board`
- `timeline-report`
- `text-heavy-image-footer`
- `case-study-board`

## Existing-Code Anchors

- [aiPresentationService.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationService.ts)
- [aiPresentationLayoutEngine.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationLayoutEngine.ts)
- [aiPresentationComponentRecipes.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationComponentRecipes.ts)
- [componentRecipeSlotBindings.ts](/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/componentRecipeSlotBindings.ts)
- [componentRecipes.ts](/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/componentRecipes.ts)
- [contracts.ts](/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/contracts.ts)

## Support Docs

- [Contracts Appendix](./contracts-appendix.md)
- [Kickoff Defaults](./kickoff-defaults.md)

## Locked v1 Execution Details

Before implementation begins, the plan assumes:
- persisted routing metadata stays under `slideContent.aiDesign`
- compaction, DSL, and full-slide-media all use explicit JSON contracts from [Contracts Appendix](./contracts-appendix.md)
- retry budgets, timeout ceilings, safety policy, and quality thresholds use the conservative defaults in [Kickoff Defaults](./kickoff-defaults.md)
- raw LLM responses are never persisted directly; only validated normalized outputs may be stored
- dense Thai informational slides remain biased toward editable structured or long-form modes unless the user explicitly overrides that choice

## Acceptance Criteria

- Long-form slides no longer get forced into compact block families when they obviously do not fit.
- Recipe selection uses markdown structure and text density, not only high-level semantic hints.
- Recipe-aware LLM compaction returns structured slot content instead of relying mainly on truncation.
- Overflow fallback is explicit and testable.
- At least one constrained LLM layout DSL path exists for layouts beyond built-in recipes.
- At least one full-slide media mode exists for infographic/poster-quality output.
- The system can explain which mode was chosen and why.
- Users can override or lock the selected mode per slide.
- The system records source-to-slide traceability for compaction, split, and mode-switch decisions.
- Mode routing is constrained by provider capability and cost/latency guardrails.
- The persisted slide schema for routing metadata and provenance is explicitly defined.
- The system defines how a locked mode is handled when it becomes invalid.
- Rollout/fallback behavior is documented for partial enablement of new modes.
