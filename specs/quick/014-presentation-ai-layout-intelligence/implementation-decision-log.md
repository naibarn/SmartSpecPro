## Implementation Decision Log

### Section 01 - Foundation Shape

- Options considered:
  - keep profiling and mode routing buried inside `aiPresentationService.ts`
  - introduce a shared deterministic profiling/routing module and keep AI service as the first consumer
- Decision taken:
  - introduce `apps/web/shared/presentation/contentProfile.ts` as the shared foundation
- Mode:
  - auto
- Rationale:
  - Section 01 explicitly calls for shared routing inputs that later editor explanation surfaces can reuse, so embedding the logic only in the service would create drift immediately

### Section 01 - Contract Rollout

- Options considered:
  - defer additive `aiDesign` fields until long-form rendering is implemented
  - add the additive schema fields now and keep most of them optional/metadata-first
- Decision taken:
  - add the v1 routing metadata fields now as optional additive contract
- Mode:
  - auto
- Rationale:
  - later sections depend on the persistence shape, and adding it now keeps Section 01 aligned with the already-approved contracts appendix

### Section 01 - Compact Recipe Suppression

- Options considered:
  - suppress compact component recipes whenever the router prefers `long_form_block`
  - suppress only when structured mode is explicitly `unsafe` and the copy shows real long-form text pressure
- Decision taken:
  - use targeted suppression only for `unsafe` structured fits with long-form text pressure
- Mode:
  - auto
- Rationale:
  - a broader rule incorrectly blocked valid compact recipes such as timeline/stat/poster cases, while the targeted rule still protects the dense Thai prose cases Section 01 is meant to catch

### Section 02 - First Long-Form Recipe

- Options considered:
  - ship several long-form families at once
  - ship one long-form family end-to-end and use it to prove the routing and block contract first
- Decision taken:
  - ship `sectioned-explainer` first as the initial long-form family
- Mode:
  - auto
- Rationale:
  - the section goal is to create a real dense-text destination quickly, and one complete recipe across shared/server/editor surfaces is lower-risk than half-implementing multiple families at once

### Section 02 - Slot Budget Placement

- Options considered:
  - store slot budgets only next to the new long-form recipe
  - add shared slot-budget metadata for all built-in recipes now
- Decision taken:
  - introduce shared slot-budget metadata for all built-in recipes now
- Mode:
  - auto
- Rationale:
  - Section 03 needs recipe-aware compaction inputs for both compact and long-form layouts, so centralizing the metadata early avoids immediate drift

### Section 02 - Compact Recipe Protection

- Options considered:
  - let the new long-form heuristic outrank all compact recipes whenever copy looks dense after normalization
  - add deterministic guardrails so timeline/stat/framework/process slides keep their compact recipes even when normalized sections inflate structure counts
- Decision taken:
  - add deterministic compact-recipe guardrails alongside softer scoring penalties for `sectioned-explainer`
- Mode:
  - auto
- Rationale:
  - normalization derives sections from body lines, which can make short metric or roadmap slides look artificially long-form; the extra guardrails keep Section 02 from regressing existing compact recipe coverage

### Section 03 - Compaction Scope

- Options considered:
  - enable recipe-aware compaction for every built-in recipe immediately
  - start with the first long-form recipe and prove the end-to-end slot-binding contract before widening coverage
- Decision taken:
  - enable recipe-aware compaction only for `sectioned-explainer` in v1
- Mode:
  - auto
- Rationale:
  - dense long-form prose is the biggest current quality problem, and constraining the first rollout to one recipe reduces prompt/fit drift while still proving the contract that later recipes will reuse

### Section 03 - Where Compacted Copy Lives

- Options considered:
  - persist only compacted metadata and let builders regenerate slot copy from the original narrative later
  - persist validated `componentSlotBindings` directly on the AI slide draft so the chosen compacted copy is the copy that actually renders
- Decision taken:
  - persist validated `componentSlotBindings` directly on the AI slide draft
- Mode:
  - auto
- Rationale:
  - the compaction result must survive through layout rendering and later explanation surfaces without recomputing, and slot bindings are already the first-class component contract inside the presentation system

### Section 03 - Failure Behavior

- Options considered:
  - silently accept the best compaction attempt even when fit stays cramped
  - fail soft, keep original narrative-derived copy, and record fallback reasons for later escalation
- Decision taken:
  - fail soft and record deterministic `fallbackHistory`
- Mode:
  - auto
- Rationale:
  - Section 03 is responsible for compaction plus fit validation, not for mode-switching policy; preserving the original slide with explicit fallback metadata avoids hidden low-quality rewrites and sets up Section 04 cleanly

### Section 04 - First Overflow Escape Hatch

- Options considered:
  - introduce several overflow fallback families at once
  - use the already-implemented `sectioned-explainer` as the only long-form fallback target in v1
- Decision taken:
  - use `sectioned-explainer` as the first overflow escape hatch
- Mode:
  - auto
- Rationale:
  - Section 04 needs a deterministic, shippable fallback path immediately, and using the only implemented long-form family keeps the rollout consistent with Section 02/03 instead of inventing partial recipe families

### Section 04 - Split Strategy

- Options considered:
  - split slides by raw character count only
  - split by semantic sections/body groups and record explicit source trace for each resulting slide
- Decision taken:
  - split by semantic sections/body groups and persist split trace metadata
- Mode:
  - auto
- Rationale:
  - preserving narrative continuity and explainability matters more than perfectly even character counts, and the trace metadata is required for later explanation UI anyway

### Section 04 - Compact Recipe Guardrails

- Options considered:
  - allow long-form fallback to override any structured recipe once recommended mode is `long_form_block`
  - protect compact metric/timeline/process recipes and only escalate recipes that clearly do not fit dense prose
- Decision taken:
  - protect compact metric/timeline/process recipes with explicit recipe-level guardrails
- Mode:
  - auto
- Rationale:
  - without these guardrails the overflow stage regressed existing `stat-cards`, `timeline-flow`, and similar cases that should stay compact even when the router sees some long-form pressure

### Section 05 - DSL Rollout Gate

- Options considered:
  - introduce a new tenant feature flag before shipping any DSL code path
  - gate the first rollout behind an env flag while the mode remains experimental
- Decision taken:
  - gate DSL behind `PRESENTATION_AI_LAYOUT_DSL_ENABLED`
- Mode:
  - auto
- Rationale:
  - the mode is still exploratory and not yet ready for tenant-admin exposure, so an env gate keeps rollout simple while preserving a real end-to-end code path

### Section 05 - DSL Primitive Scope

- Options considered:
  - allow every existing slide primitive immediately
  - start with bounded text/shape/svg primitives plus groups and expand later
- Decision taken:
  - start with bounded text/shape/svg primitives plus groups
- Mode:
  - auto
- Rationale:
  - Section 05 is about safe escape-hatch layouts, and simpler primitives make validation and normalization much more reliable in the first rollout

### Section 06 - Media Rollout Gate

- Options considered:
  - introduce tenant-facing media mode flags immediately
  - keep the first rollout behind an env flag until safety and quality are better understood
- Decision taken:
  - gate full-slide-media behind `PRESENTATION_AI_FULL_SLIDE_MEDIA_ENABLED`
- Mode:
  - auto
- Rationale:
  - poster/image-first generation is higher-risk than structured blocks, and an env gate is enough for the initial rollout without growing the tenant flag surface prematurely

### Section 06 - Full-Slide Media Compilation Path

- Options considered:
  - create a separate media-generation pipeline just for full-slide visuals
  - reuse the existing image/video generation lane and compile the result into a single full-canvas slide
- Decision taken:
  - reuse the existing media-generation lane and compile into a full-canvas slide
- Mode:
  - auto
- Rationale:
  - this keeps the first implementation small, compatible with current billing/media plumbing, and still delivers a real image-first slide mode

### Section 07 - Explanation Surface Placement

- Options considered:
  - build a separate explanation inspector just for AI routing metadata
  - extend the existing `AI Layout` card so mode explanation, fit metrics, and fallback history live next to recipe override controls
- Decision taken:
  - extend the existing `AI Layout` card
- Mode:
  - auto
- Rationale:
  - the recipe preview/override workflow already lives there, so co-locating mode explanation avoids a second discovery surface and keeps the first rollout legible for users

### Section 07 - Relayout Override Semantics

- Options considered:
  - treat editor mode override and lock as UI-only metadata until a later relayout rewrite
  - preserve the metadata immediately and honor the structured vs long-form boundary in synchronous relayout now
- Decision taken:
  - preserve the metadata immediately and honor `long_form_block` overrides in synchronous relayout
- Mode:
  - auto
- Rationale:
  - users need their chosen mode intent to survive auto-relayout immediately, and the structured-vs-long-form boundary is the highest-impact part that the current synchronous relayout path can honor without a larger async rewrite

### Section 07 - Analytics Scope

- Options considered:
  - keep telemetry limited to recipe overrides only
  - add explicit events for mode override and mode lock interactions
- Decision taken:
  - add explicit events for mode override and mode lock interactions
- Mode:
  - auto
- Rationale:
  - Section 07 is specifically about explainability and quality hardening, so recipe-only telemetry would miss whether users are correcting the router at the mode level

### Section 03 - Compaction Breadth Rollout

- Options considered:
  - keep compaction exclusive to `sectioned-explainer`
  - widen compaction to a bounded recipe subset that covers both long-form and the compact layouts still failing on dense Thai copy
- Decision taken:
  - widen compaction to `article-focus`, `profile-board`, `profile-summary`, `poster-spotlight`, and `framed-image-story` in addition to `sectioned-explainer`
- Mode:
  - auto
- Rationale:
  - these recipes already have stable slot budgets and slot-binding builders, so widening there gives real quality gain without opening the whole recipe catalog to prompt/fit drift at once

### Section 03 - Force-Compaction Policy

- Options considered:
  - skip compaction whenever the first-pass slot bindings technically pass fit validation
  - still force compaction for dense narratives even when the raw slot bindings barely fit
- Decision taken:
  - force compaction for dense narratives based on profile thresholds, not just first-pass fit
- Mode:
  - auto
- Rationale:
  - the shared slot-binding builders clamp aggressively enough that some dense slides would falsely look safe and bypass compaction unless the pipeline also looks at source density

### Section 07 - Advanced Relayout Wrapper

- Options considered:
  - leave relayout entirely synchronous and keep advanced modes metadata-only
  - add an async wrapper that honors locked `llm_layout_dsl` and `full_slide_media` when possible while keeping the existing sync relayout as the deterministic fallback
- Decision taken:
  - add an async relayout wrapper and route the presentation mutation through it
- Mode:
  - auto
- Rationale:
  - this closes the biggest mismatch between editor mode-lock UI and actual relayout behavior without forcing a full rewrite of the sync relayout path in one step

### Section 07 - Quality Telemetry Sink

- Options considered:
  - compute quality/deck-consistency only in memory and discard the result after saving slides
  - emit the structured events through the existing audit logger with the existing `rollout_gate` event type
- Decision taken:
  - emit structured mode-selection, quality-gate, and deck-consistency events through `auditLogger`
- Mode:
  - auto
- Rationale:
  - the audit logger already exists and keeps rollout plumbing small, while the structured event payloads still make the telemetry queryable later

### Section 02 - FAQ Stack Long-Form Family

- Options considered:
  - keep `sectioned-explainer` as the only multi-section text-heavy fallback for FAQ-like slides
  - add a dedicated `faq-stack` long-form family for question-heavy educational/support copy
- Decision taken:
  - add `faq-stack` as a first-class long-form family across shared metadata, AI routing, layout rendering, and editor catalog
- Mode:
  - auto
- Rationale:
  - FAQ-style slides are structurally different from generic explainers, and routing them into a dedicated question-and-answer stack improves readability without requiring the full DSL path

### Section 06 - Full-Slide Media Relayout Refresh

- Options considered:
  - keep full-slide-media relayout limited to reusing an existing image/video already on the slide
  - let async relayout generate a fresh full-slide image when a media token is available, while keeping existing-visual reuse as a fallback
- Decision taken:
  - generate a fresh full-slide image during async relayout when possible, then fall back to the reusable hero visual path
- Mode:
  - auto
- Rationale:
  - locked `full_slide_media` mode needs a real refresh path to be credible after content changes; generation-first with reuse fallback improves quality without breaking deterministic recovery when generation is unavailable

### Section 02 - Timeline Report Long-Form Family

- Options considered:
  - keep timeline-heavy dense slides on `timeline-flow` plus overflow fallback
  - add a dedicated long-form timeline family for milestone/report copy that needs more than compact cards
- Decision taken:
  - add `timeline-report` as a first-class long-form family across shared metadata, AI routing, compaction, layout rendering, and editor catalog
- Mode:
  - auto
- Rationale:
  - roadmap and milestone slides often carry date markers plus explanatory prose, and compact `timeline-flow` cards were still too cramped for those cases even after compaction

### Section 03 - Explicit LLM Recipe Precedence

- Options considered:
  - let heuristics override `componentRecipeId` whenever a stronger deterministic signal appears later in routing
  - honor an explicit LLM-selected `componentRecipeId` before heuristic timeline/profile/article promotion logic
- Decision taken:
  - honor explicit `componentRecipeId` from the LLM before downstream heuristic promotion
- Mode:
  - auto
- Rationale:
  - compaction and relayout should not silently replace an intentional recipe choice from the drafting model unless validation rejects it; this keeps structured poster/profile choices stable while heuristics remain a fallback for slides with no explicit recipe

### Section 06 - Video-First Full-Slide Relayout

- Options considered:
  - keep async `full_slide_media` relayout image-first even for slides that are already video-led
  - prefer fresh video generation when the slide is video-led and only fall back to image generation/reuse when video generation is unavailable
- Decision taken:
  - make async `full_slide_media` relayout prefer video generation for video-led slides
- Mode:
  - auto
- Rationale:
  - a locked full-slide media mode should preserve the media character of the slide after relayout, and downgrading video-led slides to static imagery by default would make the mode feel inconsistent

### Section 07 - Rollout Telemetry Summary Surface

- Options considered:
  - keep rollout telemetry only as raw `rollout_gate` audit events
  - add a lightweight summary surface that aggregates selected modes, recipes, fallback steps, and quality verdicts in the admin audit UI
- Decision taken:
  - add a summary view for rollout telemetry inside `AdminAuditLogs`
- Mode:
  - auto
- Rationale:
  - the audit stream already contained enough structured data to show practical rollout health, and surfacing a summary immediately makes the new telemetry useful without waiting for a separate dashboard project

### Section 02 - Two-Column Article Long-Form Family

- Options considered:
  - keep dense two-section article/report slides split between `article-focus` and `sectioned-explainer`
  - add a dedicated long-form family that preserves two balanced sections plus a takeaway strip
- Decision taken:
  - add `two-column-article` as a first-class long-form family across shared metadata, AI routing, layout rendering, and editor catalog
- Mode:
  - auto
- Rationale:
  - dense two-section narratives were too structured for `article-focus` and too loose for `sectioned-explainer`; a dedicated mirrored layout improves readability without forcing a custom DSL board

### Section 03 - Compact Recipe Compaction Expansion

- Options considered:
  - stop compaction expansion after poster/profile/story long-form coverage
  - widen compaction into the compact recipes that still overflow visually under dense Thai copy
- Decision taken:
  - expand compaction coverage to `feature-highlights`, `infographic-grid`, `stat-cards`, `timeline-flow`, and `process-steps`, plus `two-column-article`
- Mode:
  - auto
- Rationale:
  - these recipes already expose stable slot budgets, so widening compaction there improves real fit quality without inventing a new validation model

### Section 05 - DSL Preference Over Rigid Balanced Blocks

- Options considered:
  - always prefer the top structured recipe once it clears the activation threshold, even when DSL is recommended
  - keep a bounded escape hatch where `llm_layout_dsl` wins for balanced four-section boards that do not map cleanly to existing recipes
- Decision taken:
  - let `llm_layout_dsl` override structured recipe promotion when the router explicitly recommends DSL for mixed multi-section boards
- Mode:
  - auto
- Rationale:
  - otherwise `infographic-grid` would absorb every four-section slide and the DSL mode would lose its highest-value use case: bounded boards that are balanced but not card-like

### Section 07 - Routing Quality Snapshot

- Options considered:
  - keep only raw counts in the admin rollout summary
  - add lightweight derived rates and a top-recipe snapshot on top of the raw counts
- Decision taken:
  - extend `AdminAuditLogs` with fallback-rate, quality-risk-rate, and top-recipe summary cards
- Mode:
  - auto
- Rationale:
  - rates and dominant-recipe signals make the telemetry actionable for rollout review without requiring a separate analytics dashboard immediately
