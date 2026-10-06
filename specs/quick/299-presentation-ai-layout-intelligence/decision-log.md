## Decision Log

### Decision 01

- Step:
  - initial planning
- Options considered:
  - extend 010 in-place
  - create a new follow-up planning unit focused on layout intelligence
- Decision taken:
  - create a new follow-up planning unit so infrastructure work from 010 stays separate from AI fitting/routing work
- Mode:
  - auto
- Rationale:
  - the remaining problem is not component infrastructure; it is content-to-layout intelligence, which deserves a separate planning artifact

### Decision 02

- Step:
  - initial architecture framing
- Options considered:
  - choose one path only: blocks, DSL, or media generation
  - define a multi-mode pipeline with routing across structured, long-form, DSL, and full-slide media
- Decision taken:
  - plan a multi-mode pipeline
- Mode:
  - auto
- Rationale:
  - no single mode is good enough for every slide density and quality target

### Decision 03

- Step:
  - compaction strategy
- Options considered:
  - keep compaction mostly deterministic and local
  - let LLM fully own layout and fitting
  - use LLM for semantic compression plus deterministic fit validation
- Decision taken:
  - use hybrid compaction: LLM for semantic shaping, deterministic engine for final fit
- Mode:
  - auto
- Rationale:
  - this gives better Thai-language compression without sacrificing stability and testability

### Decision 04

- Step:
  - kickoff defaults
- Options considered:
  - start with many long-form recipes at once
  - start with a small v1 set that covers the highest-frequency dense-slide shapes
- Decision taken:
  - start v1 with `sectioned-explainer`, `article-focus`, and `profile-board`
- Mode:
  - auto
- Rationale:
  - these three cover the most common failures without spreading implementation effort too thin

### Decision 05

- Step:
  - kickoff defaults
- Options considered:
  - allow `full_slide_media` broadly from day one
  - restrict it to visual-first slides and keep dense informational slides on structured/long-form paths
- Decision taken:
  - restrict `full_slide_media` to selective poster/cover/infographic cases in v1 and keep it behind rollout gates
- Mode:
  - auto
- Rationale:
  - this preserves editability and avoids overusing text-in-image generation where Thai reliability is still risky

### Decision 06

- Step:
  - kickoff defaults
- Options considered:
  - place mode override controls directly on canvas
  - place them in the existing `AI Layout` card
- Decision taken:
  - use the `AI Layout` card for `Mode`, `Lock mode`, and routing explanation in v1
- Mode:
  - auto
- Rationale:
  - this gives the cleanest UX with the lowest implementation and rollout risk

### Decision 07

- Step:
  - kickoff defaults
- Options considered:
  - silently auto-downgrade locked modes when invalid
  - let user lock win and force explicit resolution on invalid modes
- Decision taken:
  - user lock wins in v1; the system may warn or block, but must not silently switch a locked mode
- Mode:
  - auto
- Rationale:
  - silent downgrade would destroy trust exactly in the cases where users try to assert control over layout mode

### Decision 08

- Step:
  - contract completion
- Options considered:
  - leave persisted metadata and prompt shapes implicit until implementation
  - lock initial schema and payload drafts before coding
- Decision taken:
  - add a contracts appendix with v1 shapes for persisted metadata, compaction IO, DSL IO, and full-slide-media metadata
- Mode:
  - auto
- Rationale:
  - this prevents incompatible interpretations across sections and makes Section 01-06 implementable without re-litigating payload shape

### Decision 09

- Step:
  - execution defaults
- Options considered:
  - keep retries/timeouts/thresholds unspecified until code is written
  - lock conservative v1 defaults up front
- Decision taken:
  - lock conservative v1 defaults for retry counts, timeouts, fit thresholds, readability thresholds, and safety policy in kickoff defaults
- Mode:
  - auto
- Rationale:
  - execution defaults affect routing and UX behavior enough that they should not be left implicit during initial implementation

### Decision 10

- Step:
  - persisted contract completion
- Options considered:
  - keep `slideContent.aiDesign` metadata loosely described
  - lock field semantics, fallback history, and source trace dispositions up front
- Decision taken:
  - lock additive v1 field semantics in `contracts-appendix.md` and treat that appendix as normative for implementation
- Mode:
  - auto
- Rationale:
  - the router, editor explanation UI, downgrade logic, and telemetry all depend on a shared interpretation of these fields

### Decision 11

- Step:
  - failure budgets and trust policy
- Options considered:
  - leave retry/timeout/safety behavior to implementation time
  - define conservative v1 defaults before coding starts
- Decision taken:
  - lock retry limits, timeout ceilings, rewrite trust policy, DSL fail-closed behavior, and full-slide-media Thai-risk blocking before implementation
- Mode:
  - auto
- Rationale:
  - these defaults shape visible product behavior and should not drift between server routing, UI explanation, and test expectations

### Decision 12

- Step:
  - quality gate initialization
- Options considered:
  - rely on qualitative review only
  - establish numeric v1 thresholds for auto-accept, warn, reject, and omission/oscillation warnings
- Decision taken:
  - establish numeric v1 thresholds in kickoff defaults and contracts appendix
- Mode:
  - auto
- Rationale:
  - implementation and evaluation need a shared baseline for what counts as fit, cramped, unsafe, and deck-incoherent
