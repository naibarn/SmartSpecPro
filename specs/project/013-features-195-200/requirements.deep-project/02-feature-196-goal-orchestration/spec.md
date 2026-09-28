# Feature 196 — Goal Orchestration Planning Spec

## Goal

Plan and implement a provider-independent Goal/Plan/Capability/Command layer that converts user outcomes into authorized, explainable and executable plans while delegating durable work to Feature 195.

## Scope

In scope: command normalization, cross-channel identity, Goal/Plan/Offer/Capability contracts, capability registry/resolution, planner/compiler, solution optimizer, approvals, cost/quality policy, external-agent abstraction and universal command gateway. Out of scope: durable Job truth, local Runner control, Chat presentation details and external MCP upstream lifecycle.

## User-Facing Behavior

Users can state desired outcomes through Chat or another authorized channel, receive a plan preview with capabilities/cost/risks, answer ambiguity questions, approve or pin a plan, and observe a durable execution handle. Unauthorized or unavailable capabilities are explained and never silently substituted.

## Technical Constraints

Use existing Web/Python orchestration patterns, LangGraph for governed state flow and OpenAI Agents SDK only as a cognitive executor behind explicit policy. Server derives tenant/actor scope. Reuse Feature 195 Job APIs; use Feature 197 for local resolution; exclude retired Agency/work requests/workpacks/`/workflows`/OpenSandbox/Docker dispatch.

## Dependencies

Input: Feature 195 admission, lifecycle and execution handles; current capability catalog and LangGraph/OpenAI Agents runtime. Downstream: Feature 197 consumes capability requirements, Feature 198 consumes plan/approval/result contracts, Features 199/200 register execution capabilities.

## Outputs

Produces normalized Command, Goal, Plan, Capability, Offer, approval and explainability contracts; resolver/planner/compiler services; policy/cost/quality gates; command gateway APIs and focused tests.

## Edge Cases

1. A request is ambiguous but a safe read-only plan can be previewed without executing.
2. A capability snapshot changes between plan approval and execution; the plan is revalidated or safely fenced.
3. Cost is unknown or exceeds the user/tenant ceiling; the system asks for explicit approval or stops.
4. A channel identity is valid for conversation but lacks authorization for the requested tenant resource.

## Error Handling

Return typed clarification, policy-denied, capability-unavailable, budget-exceeded, stale-plan and execution-admission errors. Preserve the original Goal and immutable plan revision; never mutate an approved plan in place or retry an unsafe side effect without idempotency.

## Testing Expectations

Test normalization, identity/tenant scope, deterministic capability filtering, plan revisions, approval gates, cost/quality limits, recursive invocation limits, Job handoff, route schemas and Chat/assistant integration contracts. Use focused Web/Python tests and avoid whole-repository typecheck.

