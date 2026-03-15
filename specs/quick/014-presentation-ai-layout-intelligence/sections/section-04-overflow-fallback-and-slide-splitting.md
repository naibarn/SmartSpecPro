## Section 04: Overflow Fallback and Slide Splitting

### Goal

Stop low-quality forced fits and make fallback behavior explicit.

### Scope

- retry compaction
- switch recipes
- route to long-form mode
- split slide
- final escalation rules

### Deliverables

- fallback graph
- split-slide strategy
- quality threshold rules
- lock-conflict resolution rules

### Key Decisions

- fallback order must be deterministic and inspectable
- split-slide should preserve narrative continuity and source traceability
- user-locked modes need an explicit invalidation policy rather than ad-hoc downgrade behavior

### As-Built

- Status:
  - implemented
- Files changed:
  - `apps/web/server/services/aiPresentationService.ts`
  - `apps/web/server/services/__tests__/aiPresentationService.test.ts`
- What shipped:
  - added a deterministic overflow fallback stage after recipe assignment and compaction so Draft with AI can switch dense compact slides into `sectioned-explainer` before rendering
  - introduced split-slide fallback for long-form slides whose compaction result remains `unsafe` or below the accept threshold after retries
  - persisted fallback decisions into `slideContent.aiDesign.fallbackHistory` and split traceability into `sourceTrace`, then merged them with compaction metadata before slide insertion
  - tightened long-form escalation guardrails so metric, timeline, infographic, and process recipes stay on their intended compact layouts instead of being swallowed by the new fallback path
  - hardened test setup by resetting core service mocks inside `setupHappyPath()` so queued one-shot mock values do not leak across AI draft regression cases
- Tests added or updated:
  - `apps/web/server/services/__tests__/aiPresentationService.test.ts`
- Deviations from plan:
  - v1 overflow fallback targets only `sectioned-explainer` as the long-form escape hatch; alternate same-family recipe switching remains deferred until more long-form families ship
  - mode-lock conflict handling is not yet active in the editor because user overrides and lock UX land in Section 07
- Follow-ups for later sections:
  - reuse the same fallback history trail when DSL mode or full-slide-media are introduced as later fallback families
  - add richer split title/narrative phrasing once more long-form recipe geometries exist
