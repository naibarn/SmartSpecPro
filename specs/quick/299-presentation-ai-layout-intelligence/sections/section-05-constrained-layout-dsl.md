## Section 05: Constrained LLM Layout DSL Mode

### Goal

Add a safe escape hatch for slides that do not fit known recipes.

### Scope

- DSL schema
- validation and normalization
- repair or rejection rules
- routing entry conditions

### Deliverables

- shared DSL schema
- validation layer
- bounded renderer integration
- example request/response payloads aligned with [Contracts Appendix](../contracts-appendix.md)

### Initial v1 Defaults

- disabled behind feature flag by default
- max elements: `18`
- repair retry max: `1`
- timeout per attempt: `25s`
- on invalid output after repair: fallback to structured/long-form mode

### Key Decisions

- DSL mode is not the default path
- element counts and allowed primitives must be tightly bounded
- request/response payloads must follow [Contracts Appendix](../contracts-appendix.md#3-constrained-layout-dsl-draft)
- invalid DSL should fail closed after one repair attempt, not silently degrade in-place

### As-Built

- Status:
  - implemented
- Files changed:
  - `apps/web/shared/presentation/layoutDsl.ts`
  - `apps/web/shared/presentation/layoutDsl.test.ts`
  - `apps/web/shared/presentation/contentProfile.ts`
  - `apps/web/server/services/aiPresentationService.ts`
  - `apps/web/server/services/__tests__/aiPresentationService.test.ts`
- What shipped:
  - added a shared bounded DSL contract plus normalizer that flattens groups into existing slide primitives and rejects element/group overflows
  - enabled `llm_layout_dsl` routing behind the `PRESENTATION_AI_LAYOUT_DSL_ENABLED` env gate and reused the existing mode-candidate machinery so the mode stays dormant by default
  - wired a live DSL draft pass into `generateAIDraft` that calls `callLLMStructured`, validates the response against the bounded DSL schema, normalizes it into `PresentationSlideContent`, and falls back to structured mode when validation fails
  - skipped media generation automatically for DSL slides whose normalized content has no image/video primitives, avoiding wasted image calls for text-only board layouts
- Tests added or updated:
  - `apps/web/shared/presentation/layoutDsl.test.ts`
  - `apps/web/server/services/__tests__/aiPresentationService.test.ts`
- Deviations from plan:
  - v1 DSL normalizer supports `text`, `rect`, `line`, `svg`, and grouped variants; arbitrary image/video placement is still intentionally conservative
  - rollout remains env-gated rather than tenant-flagged while the mode is still experimental
- Follow-ups for later sections:
  - expose DSL-mode explanations and fallback reasons in the editor
  - widen DSL primitive coverage only after telemetry shows bounded layouts are stable in real drafts
