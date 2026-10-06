## Section 03: LLM Recipe-Aware Compaction and Deterministic Fit Validation

### Goal

Use LLM for semantic rewriting while keeping deterministic acceptance checks.

### Scope

- prompt/spec contract for compaction
- compaction levels
- structured slot-shaped output
- deterministic fit scoring after LLM output

### Deliverables

- compaction schema
- compaction prompt contract
- fit score model
- rejection/retry behavior
- source mapping and omission/defer metadata
- example input/output payloads aligned with [Contracts Appendix](../contracts-appendix.md)

### Initial v1 Defaults

- retry attempts: `2`
- timeout per attempt: `20s`
- allowed compaction levels: `balanced`, `compact`, `aggressive`
- if all attempts fail: escalate to recipe switch or slide split, not silent truncation

### Key Decisions

- LLM may propose content but not bypass fit validation
- Thai compaction quality is a primary target
- compaction output must be inspectable enough to explain what source content was preserved, shortened, omitted, or deferred
- the request/response payload must follow [Contracts Appendix](../contracts-appendix.md#2-recipe-aware-compaction-prompt-contract)
- factual rewrite trust rules and acceptance thresholds inherit the defaults in [Kickoff Defaults](../kickoff-defaults.md)

### As-Built

- Status:
  - implemented
- Files changed:
  - `apps/web/shared/presentation/recipeCompaction.ts`
  - `apps/web/shared/presentation/layoutFit.test.ts`
  - `apps/web/shared/presentation/aiTypes.ts`
  - `apps/web/server/services/aiPresentationComponentRecipes.ts`
  - `apps/web/server/services/aiPresentationService.ts`
  - `apps/web/server/services/__tests__/aiPresentationLayoutEngine.test.ts`
  - `apps/web/server/services/__tests__/aiPresentationService.test.ts`
- What shipped:
  - added a shared recipe compaction contract plus deterministic fit scoring so long-form slot content can be scored as `fits`, `cramped`, or `unsafe` before and after LLM rewriting
  - introduced `componentSlotBindings` on `AIPresentationSlide` so validated compacted slot content can move through the Draft with AI pipeline without flattening back to the original narrative
  - made every built-in component recipe builder prefer explicit slot bindings when present, which lets compaction shape the final rendered block instead of only persisting metadata
  - wired a recipe-aware compaction pass into `generateAIDraft` for long-form recipes, starting with `sectioned-explainer`, and persisted `fitScore`, `compactionLevel`, `sourceTrace`, and `fallbackHistory` into `slideContent.aiDesign`
  - kept compaction fail-soft: when LLM compaction errors or still fails fit validation, the slide keeps its original copy and records deterministic fallback reasons for later sections to escalate
- Tests added or updated:
  - `apps/web/shared/presentation/layoutFit.test.ts`
  - `apps/web/server/services/__tests__/aiPresentationLayoutEngine.test.ts`
  - `apps/web/server/services/__tests__/aiPresentationService.test.ts`
- Deviations from plan:
  - v1 compaction is active only for the first long-form recipe (`sectioned-explainer`) instead of all recipe families
  - this section stops at compaction acceptance/rejection and metadata persistence; recipe switching and slide splitting remain owned by Section 04
- Follow-ups for later sections:
  - expand slot-aware compaction to more long-form and dense structured recipes once fallback routing exists
  - consume `fallbackHistory` to drive deterministic recipe switching and slide splitting when compaction does not achieve an acceptable fit
  - surface fit diagnostics and traceability directly in the editor explanation UI
