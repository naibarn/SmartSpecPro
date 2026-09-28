# Self-Review Round 1 — claude-plan.md

Date: 2026-07-21
Reviewer: current model (Phase A checklist cross-reference + adversarial
senior-architect pass combined; review_mode=skip so no external LLM).

## Phase A — cross-reference findings (spec/interview/research → plan)

| # | Finding | Severity | Fix applied |
|---|---|---|---|
| A1 | `motionDirection` dual injection (spec §14.6: story plan AND every video prompt) was not stated anywhere in the plan | HIGH | WS-4 runner-contract bullet now mandates dual injection |
| A2 | Hard-failure `product_reference_model_conflict` (spec §23.1 item 12, acceptance #15) missing from the deterministic preflight list | HIGH | Added to WS-4 preflight blockers |
| A3 | `childSubjectPolicy` computed in WS-7 (Phase 3) but the skill needs it in Phase 2 to mark `depicts_minor` correctly | MEDIUM | Ordering note added: computation ships Phase 2 (WS-5), enforcement Phase 3 (WS-7) |

## Adversarial pass findings

| # | Finding | Severity | Fix applied |
|---|---|---|---|
| B1 | WS-1 left `resolveFrameStrategy` gating ambiguous ("flags argument or caller pre-checks") — implementer would guess; background advancement must not need flag reads | MEDIUM | Decided: resolver stays pure passthrough; flag enforcement ONLY at the two start entry points |
| B2 | WS-5 `evidencePreview` implied running the skill at plan time — cost/latency landmine on a hot query | HIGH | Design decision recorded: plan-time preview is deterministic text-only (no LLM/vision); visual conflicts surface in-run |
| B3 | WS-6 best-of-2 could tempt reuse of grid-specific `applyBestImageAttemptSelection` (:7085) | LOW | Explicit "do NOT reuse" note; per-unit winner via score breakdown |
| B4 | WS-8 regeneration scope ambiguous (full 3-round loop per shot would be slow/expensive) | MEDIUM | Decided: single-shot skill contract (VD `generateStartFrameShotPrompt` shape), no loop re-run |

## Scorecard (after fixes)

| Category | Verdict | Notes |
|---|---|---|
| Structural Integrity | PASS | 12 workstreams, dependency-ordered, milestone-mapped to spec phases |
| Completeness vs Spec | PASS | All claude-spec.md items 1–11 + hard invariants traced; Phase 6 correctly excluded (interview Q1); metrics land Phase 2 (Q2); pilot fixtures child+furniture (Q3) |
| Implementability | PASS | Every touch point carries a verified file:line anchor from claude-research.md; ambiguities from B1/B2/B4 resolved |
| Internal Consistency | PASS | Fix regression check done: A3/B1 changes cross-referenced against WS-5/WS-6/WS-12 mentions — no contradictions introduced; flag names, blocker ids, and constants consistent throughout |
| Edge Cases | PASS | Capacity=0 models, evidence-only references, mid-loop resume, per-unit resume, degraded fallback, `.strict()` schema traps, tsc baseline noise, concurrent-session risk all addressed |

Result: ALL PASS after 1 round (7 fixes). Proceeding to TDD planning.
