<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-ledger-runtime
section-02-completion-and-audit-policy
section-03-ledger-dashboard
section-04-regression-tests
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-ledger-runtime | - | section-02-completion-and-audit-policy, section-03-ledger-dashboard, section-04-regression-tests | No |
| section-02-completion-and-audit-policy | section-01-ledger-runtime | section-03-ledger-dashboard, section-04-regression-tests | No |
| section-03-ledger-dashboard | section-01-ledger-runtime, section-02-completion-and-audit-policy | section-04-regression-tests | No |
| section-04-regression-tests | section-01-ledger-runtime, section-02-completion-and-audit-policy, section-03-ledger-dashboard | - | No |

## Execution Order

1. section-01-ledger-runtime
2. section-02-completion-and-audit-policy
3. section-03-ledger-dashboard
4. section-04-regression-tests

## Section Summaries

### section-01-ledger-runtime
Normalize the Team workflow into durable plan, step, attempt, review, and audit event data. The runtime must start from a strict LLM-generated plan that receives the room objective and active member/persona context, assigns an owner and reviewer for every step, and never silently synthesizes a fallback plan when planning fails.

### section-02-completion-and-audit-policy
Define the completion-gate matrix, attempt audit payload rules, room-message linking rules, strict pass/fail/no-fallback behavior, and authorization or retention boundaries so the runtime and UI share the same correctness rules.

### section-03-ledger-dashboard
Rebuild the Team page around a structured orchestration dashboard. Render the objective, the plan-and-responsibilities ledger, current step, review feedback, audit timeline, and secondary conversation feed in a way that is legible and drill-down friendly.

### section-04-regression-tests
Add regression coverage for the auto-start path, strict LLM planning, no-fallback review gates, review/rework loop, audit reconstruction, and terminal stop reasons. Confirm the new dashboard data can be rendered and that `auto_team` continues until the terminal gate is reached or pauses with an explicit diagnostic failure.
