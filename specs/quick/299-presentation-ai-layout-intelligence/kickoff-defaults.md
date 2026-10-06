## Kickoff Defaults

These defaults are selected to optimize for quality, controllability, and low rollout risk in v1.

## 1. Initial Long-Form Recipe Set

Start with exactly these long-form recipes in v1:

1. `sectioned-explainer`
   - Primary default for Thai educational/article content with several short sections
   - Best first target because it solves the most common “too much text for compact cards” failure

2. `article-focus`
   - Single dominant heading plus long supporting narrative
   - Best fallback when section density is low but paragraph density is high

3. `profile-board`
   - For bio/resume/profile/contact/history slides like the provided examples
   - Chosen because profile-heavy slides are structurally distinct and compact recipes fit them poorly

Delay these to v1.1+:
- `two-column-article`
- `faq-stack`
- `timeline-report`
- `text-heavy-image-footer`
- `case-study-board`

Reason:
- three recipes are enough to prove routing, compaction, and overflow behavior without fragmenting the first implementation wave

## 2. Initial Provider and Mode Matrix

Use this routing matrix in v1:

- `structured_block`
  - default for all supported text models
  - preferred for most slides

- `long_form_block`
  - default upgrade path when density exceeds compact-fit budgets
  - same text model path as `structured_block`

- `llm_layout_dsl`
  - disabled by default behind a feature flag
  - enable only for internal/test tenants first
  - use only with the most reliable structured-output LLM path already in use for Draft with AI

- `full_slide_media`
  - allow only for opt-in slides that satisfy strong visual-first conditions
  - initial preferred image provider/model: use the existing strongest image-generation path already wired for Draft with AI image generation
  - treat Thai text inside generated images as high risk
  - do not auto-route dense informational Thai slides into `full_slide_media` unless the slide is explicitly poster/cover/infographic oriented

Default policy:
- `full_slide_media` is allowed for:
  - cover/title slides
  - poster/promo slides
  - infographic summary slides with low editability pressure
- `full_slide_media` is not allowed by default for:
  - profile boards
  - long educational/explainer slides
  - slides that must remain text-editable

## 3. Initial UX Placement for Override and Mode Lock

Place controls in the existing `AI Layout` card on `Presentation Edit`.

Add:
- `Mode` dropdown
- `Lock mode` toggle
- fallback reason / routing explanation block

Do not put v1 controls directly on the canvas.

Reason:
- lowest implementation risk
- consistent with current AI telemetry and rebuild controls
- easier to explain mode changes without overcrowding the main editor

## 4. Initial Deck-Level Consistency Heuristics

Use lightweight heuristics in v1:

1. Do not allow more than 1 `full_slide_media` slide in any 3-slide window unless the deck starts with a cover slide.
2. Prefer staying within the current family when adjacent slides are already `structured_block` or `long_form_block`, unless fit failure forces escalation.
3. Avoid alternating between `full_slide_media` and dense text slides back-to-back unless explicitly user-locked.
4. Treat `profile-board` and `sectioned-explainer` as compatible long-form neighbors.

Do not attempt a global style optimizer in v1.

Reason:
- enough to reduce deck incoherence
- small, testable, deterministic rule set

## 5. Initial Mode-Lock Conflict Policy

If the user locks a mode and that mode becomes invalid:

- if the reason is missing provider capability or unsafe DSL output:
  - block the regeneration
  - show explanation in `AI Layout`
  - require explicit unlock or mode change

- if the reason is missing media that the user can reasonably fix:
  - keep the lock
  - show missing prerequisite state

- if the reason is soft quality degradation only:
  - do not silently switch modes
  - warn, but allow user to continue

Default principle:
- user lock beats auto-routing
- system may warn or block
- system must not silently downgrade a locked mode in v1

## 6. Initial Persistence Contract

Persist new routing metadata inside `slideContent.aiDesign`.

Additive fields for v1:
- `mode`
- `candidateModes`
- `modeLocked`
- `fitScore`
- `compactionLevel`
- `sourceTrace`
- `fallbackHistory`
- `mediaModeMetadata`

Compatibility default:
- if these fields are missing, treat the slide as pre-014 and route through legacy-compatible structured behavior

## 6.1 Schema Version Default

Use:
- `slideContent.aiDesign.schemaVersion = "presentation_ai_layout_v1"`
- `llm layout DSL schemaVersion = "presentation_layout_dsl_v1"`

Do not introduce more than one version in v1.

## 6.2 Persistence Default

Persist:
- routing metadata in `slideContent.aiDesign`
- normalized DSL output as regular supported slide content
- full-slide-media provenance inside `slideContent.aiDesign.mediaModeMetadata`

Do not persist raw unvalidated DSL responses.

## 7. Initial Golden-Sample Evaluation Set

Build the first benchmark set from 12 slides:

- 3 Thai long-form article/explainer slides
- 2 Thai profile/resume slides
- 2 process/timeline slides
- 2 compact marketing slides
- 2 infographic/poster candidate slides
- 1 deliberately hard overflow slide

Track at minimum:
- fit success
- fallback count
- mode chosen
- manual override needed
- readability pass/fail

## 7.1 Initial Quality Thresholds

Use these v1 defaults:

- `fitScore.status = "unsafe"` if overflow risk >= 0.7
- readability fail if:
  - any body slot exceeds target lines by 2 or more
  - more than 15% of source text is silently omitted without fallback/defer metadata
- deck consistency warning if:
  - more than 2 adjacent slides switch across incompatible mode families without explicit reason

## 7.2 Initial Retry / Timeout Defaults

- compaction retry max: `2`
- DSL repair retry max: `1`
- full-slide-media generation retry max: `1`
- compaction timeout per attempt: `20s`
- DSL generation timeout per attempt: `25s`
- full-slide-media routing timeout before fallback decision: `45s`

Fallback default:
- if compaction exhausts retries -> switch recipe or split slide
- if DSL exhausts retries -> fallback to structured/long-form mode
- if full-slide-media times out -> fallback to structured/long-form mode

Additional v1 rule:
- do not retry indefinitely across mode families in a single generation pass; once fallback reaches slide split or blocked safety state, surface explanation instead of continuing hidden retries

## 8. Initial Rollout Gates

Feature flags:
- `presentation_ai_long_form_mode`
- `presentation_ai_layout_dsl_mode`
- `presentation_ai_full_slide_media_mode`

Rollout order:
1. long-form mode
2. recipe-aware compaction and fallback
3. DSL mode for internal/test tenants
4. full-slide media mode for controlled tenants

This is the safest quality-first rollout path for v1.

## 9. Initial Safety Policy for Full-Slide Media

v1 policy:
- allow text-in-image only for short title/cover/poster style slides
- avoid full-slide-media for dense Thai informational slides where textual accuracy matters
- always keep editable source narrative metadata when full-slide-media is used
- if Thai text rendering risk is marked `high`, do not auto-route to full-slide-media

## 9.1 Initial Safety Policy for DSL

- reject outputs that use primitives outside the allowlist
- reject outputs that exceed element or grouping budgets
- allow at most one repair attempt
- if repair still fails, fallback to structured/long-form mode with explicit explanation

## 9.2 Initial Trust Policy for LLM Rewrites

- compaction may shorten or merge text, but must not invent facts, credentials, metrics, dates, or contact details
- if the model cannot preserve factual meaning within budget, the router should fallback instead of forcing a low-trust rewrite
- omitted and deferred content must be reflected in `sourceTrace`

## 10. Initial Acceptance Thresholds

- auto-accept only when `fitScore.overall >= 0.78`
- treat `0.62 - 0.77` as warn/cramped and surface routing explanation
- treat `< 0.62` as reject/unsafe and force fallback
- warn when omitted mapped source text exceeds `15%`
- block auto-accept when body slots exceed target lines by `2+`
