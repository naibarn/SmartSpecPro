# Feature 198 — Intelligent Chat Planning Spec

## Goal

Plan and implement Chat and Universal Assistant as the primary intelligent control surface that turns requests into governed orchestration, exposes truthful plans/approvals/tasks/results and feeds safe evaluation/evolution signals back into the platform.

## Scope

In scope: Chat request lifecycle, LangGraph state integration, Retrieval/Operational/Capability brokers, lazy tool hydration, OpenAI Agents cognitive boundary, Job/Runner/MCP/Agent composition, plan/approval/live-task/result UI, connections/capability/flow/trace/evaluation surfaces and learning safeguards. Out of scope: owning Job truth, Runner control, MCP upstream lifecycle or External Agent provider sessions.

## User-Facing Behavior

Users can ask in `/chat` or the Assistant Side Panel, see source/capability chips, plan previews, clarifying questions, approvals, live task state, results and failure explanations. Connected apps and capabilities are discoverable without exposing credentials or raw internal execution details.

## Technical Constraints

Follow existing React/router/trpc and Python LangGraph/OpenAI Agents conventions. Use Feature 196 for Goal/Plan semantics, Feature 195 for durable work and Feature 197 for Runner state. Retrieval must preserve tenant ACL/provenance. Evolution never overrides hard policy or silently changes providers/vector sources.

## Dependencies

Inputs: Feature 195 Job status/events, Feature 196 plan/capability contracts, Feature 197 Runner status, Feature 194 vector-provider cutover contracts and existing Chat/MCP/runtime components. Downstream: Features 199/200 expose governed capabilities and task results through Chat.

## Outputs

Produces Chat state contracts, broker adapters, plan/approval/task/result UI states, connection/capability navigation, trace/evaluation/evolution services and focused browser/server tests.

## Edge Cases

1. Retrieval is unavailable while a safe operational answer can still be produced; provenance and degraded state remain explicit.
2. A long result exceeds UI limits; the user receives a bounded preview with an authorized durable artifact link.
3. Browser reconnects while a Job continues; the UI rehydrates from canonical Job events without duplicate submission.
4. Learned routing conflicts with an explicit user pin or hard policy; policy/pin wins and the conflict is explainable.

## Error Handling

Represent clarification, retrieval-degraded, capability-denied, approval-expired, Job-failed, Runner-disconnected and provider-empty states distinctly. Never show a spinner as proof of execution and never bill a failed/empty result as success.

## Testing Expectations

Use jsdom/React tests for state matrices, focused router/service tests for request lifecycle and ACL, Python LangGraph/agent contract tests, retrieval provenance tests, reconnect/idempotency tests and browser-level smoke evidence for `/chat` and Assistant flows. Do not run whole-repository typecheck.

