## Section 07: Explainability, Telemetry, and Quality Hardening

### Goal

Make routing decisions visible and measurable.

### Scope

- mode/recipe explanation
- fallback reason surfaces
- fit score telemetry
- quality thresholds and regression gates
- user override / mode lock semantics
- golden-sample evaluation and baseline comparison
- rollout/compatibility gating
- deck-level consistency metrics

### Deliverables

- telemetry schema
- editor explanation surface requirements
- hardening checklist
- evaluation harness definition
- rollout and downgrade checklist
- numeric threshold defaults for fit, readability, and deck consistency

### Initial v1 Threshold Defaults

- `fitScore.status = unsafe` at overflow risk `>= 0.7`
- readability fail when a body slot exceeds target lines by `2+`
- warning when silent omission exceeds `15%` of mapped source text
- deck consistency warning when more than `2` adjacent slides oscillate across incompatible mode families without explicit reason

### Key Decisions

- quality is not just “did render”; it includes fit, readability, and fallback confidence
- hardening must include measurable before/after quality evaluation, not only ad-hoc visual inspection
- hardening must also cover partial rollout and compatibility with pre-014 slide data
- warn/reject thresholds must match the defaults in [Contracts Appendix](../contracts-appendix.md#7-quality-gate-defaults) and [Kickoff Defaults](../kickoff-defaults.md)

---

### As-Built (2026-03-14)

#### Files Created

| File | Purpose |
|------|---------|
| `shared/presentation/qualityGate.ts` | Slide-level quality gate: evaluates fit score against accept/warn/reject thresholds, overflow risk, readability line overflow, and source omission |
| `shared/presentation/qualityGate.test.ts` | 10 tests: accept/warn/reject/boundary for fit score, overflow, source trace omission |
| `shared/presentation/deckConsistency.ts` | Deck-level consistency: full_slide_media density (3-slide window), mode oscillation detection, compatible long-form recipe awareness |
| `shared/presentation/deckConsistency.test.ts` | 8 tests: empty/single/uniform decks, media density, oscillation, compatible recipes, score degradation |
| `shared/presentation/layoutTelemetry.ts` | 6 telemetry event types (mode_selected, fallback_triggered, quality_gate_result, deck_consistency_evaluated, compaction_attempted, slide_split) with builder functions |
| `shared/presentation/layoutTelemetry.test.ts` | 4 tests: event builders produce correct shapes and computed fields |

#### Files Modified

| File | Changes |
|------|---------|
| `server/services/aiPresentationService.ts` | Phase 6b: deck consistency evaluation after slide compilation, surfaced as warnings + audit telemetry. Per-slide quality gate already wired via `evaluateSlideQualityGate`. |

#### Quality Gate Thresholds (constants)

```typescript
QUALITY_GATE_THRESHOLDS = {
  fitAccept: 0.78,          // auto-accept
  fitWarn: 0.62,            // cramped band 0.62–0.77
  overflowUnsafe: 0.70,     // reject above this
  readabilityExceedLines: 2, // body slot line overflow
  sourceOmissionWarnPct: 0.15, // >15% omitted = warn
  deckConsistencyMaxOscillations: 2,
};
```

#### Deck Consistency Heuristics

1. **Media density**: Max 1 `full_slide_media` per 3-slide window (exception: cover slide at index 0)
2. **Mode oscillation**: Penalizes >2 family switches; `full_slide_media ↔ text` is worst-case
3. **Compatible recipes**: `sectioned-explainer`, `article-focus`, `profile-board` are non-oscillating when adjacent

#### Deviations from Plan

- Golden-sample evaluation harness and rollout/downgrade checklist deferred — require production slide corpus and operational runbook infrastructure not available in current branch
- Editor explanation surface requirements (UI surfacing of quality gate verdicts to users) deferred to a follow-up spec
