# Section 04 — Planner, Optimizer, Policy and Approval

## Source coverage

Feature 196 sections 47–61, 124–146, 218–229, 248–254, 261–272 and 281–282.

## Deliverable

Compile explainable immutable plans, alternatives and cost/quality profiles; enforce policy, approval propagation, recursion/deadlock/budget limits, manual/hybrid handoff and live intervention semantics.

## Files

- Create/modify: orchestration planner/compiler/optimizer/policy services and LangGraph nodes
- Test: planner/policy/approval/nested delegation tests

## TDD steps

Test clarification, policy denial, unknown cost, quality evaluator unavailable, approval race, cycle/deadlock and executor switch before implementation; implement; rerun.

## Completion gate

OpenAI Agents reasoning cannot bypass hard policy or submit a Job outside Feature 195.

