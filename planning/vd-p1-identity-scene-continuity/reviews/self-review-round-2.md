# Deep-plan self-review — Round 2 (2026-08-01 refresh)

Scope: refreshed specification, plan, TDD companion, section index and binding
section overrides against Features 137–139.

## Phase A scorecard

| Category | Result | Notes |
|---|---|---|
| Structural integrity | PASS | Wave producer/consumer boundaries and execution order are explicit. |
| Completeness vs spec | PASS | Look, motion, scene, concurrency, UI and staged rollout are covered. |
| Implementability | PASS | Flags, data, APIs, errors, tests and gates are concrete. |
| Internal consistency | PASS after fixes | Removed obsolete prerequisite; moved 139 before 138; separated P1b. |
| Edge cases | PASS | Flag leakage, malformed output, stale JSONB and invalid anchor are covered. |

## Adversarial findings fixed

1. Scene planner could contradict series style: Feature 139 is now a dependency and
   effective look is an input.
2. Direct look readers/double append: source-aware resolver plus one final assembler.
3. Missing motion output could become false low risk: explicit status, absent risk.
4. Blanket fail-open could spend on an unlocked scene: multi-shot stops before paid
   render; explicit single-shot degrades with a warning.
5. Neighbor scheduling increased P1 rollout risk: separate child-flag P1b canary.
6. UI lacked repo contract detail: Astryx, states, responsive, accessibility and
   browser evidence are now explicit.

## Phase C cross-consistency

- Interface alignment: PASS after binding overrides.
- Coverage gaps: PASS.
- Overlaps: controlled by serialized shared-builder ownership and final assembler.
- Dependency order: PASS in `sections/index.md`; section numbers are historical ids.
- Self-containment: PASS when binding override blocks supersede stale detail.

Historical test counts remain in detailed packets for audit context only. Section 01
must recapture current counts/fail sets before implementation.
