# Plan Review

Planning review should help implementation begin promptly, not require convergence to production-grade evidence.

## Plan check

Compare the intended features against `claude-plan.md`, `claude-plan-tdd.md`, and `sections/index.md`. Fix concrete missing behavior, broken dependencies, ambiguous ownership or conflicting interfaces. When implementation can proceed, finish the plan and hand off to Deep Implement.

## Section consistency

Check that each Section Manifest entry maps to a real section file and that shared APIs/components are named consistently. Run `scripts/checks/check-sections.py` to detect missing/malformed section files. Repair observable issues, not stylistic scores. Deep Implement may discover and correct further details in normal debugging.

Repeated mandatory self-reviews, clean-round quotas, exhaustive TDD RED/GREEN evidence, and browser proof are not planning completion conditions. Genuine unanswered product choices may be raised; ordinary design decisions should use existing project conventions.
