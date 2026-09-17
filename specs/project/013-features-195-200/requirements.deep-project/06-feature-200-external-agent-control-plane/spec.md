# Feature 200 — External Agent Control Plane Planning Spec

## Goal

Plan and implement a provider-independent External Agent Task control plane for Codex, Claude, Antigravity, DeepSeek and future harnesses, with one durable Job truth, shared Runner control, context/assets/skills gateways, normalized events and verified results.

## Scope

In scope: Agent Task manifest, provider adapters, Agent Runtime Core, sessions/turns/events, Runner/cloud execution, workspace isolation, context/RAG access, Skill/Capability and Asset gateways, result verification, Chat integration and Agent Panel/live task UI. Out of scope: arbitrary direct MCP upstream connections, a second Job/Runner/RAG/approval/asset system and global replacement of the OpenAI Agents SDK.

## User-Facing Behavior

Users can start an approved Agent Task from Chat/Assistant, choose or review provider/runtime/workspace/context scope, observe live events and approvals, inspect verified diffs/artifacts, cancel or recover after disconnect, and receive truthful success/failure with provenance.

## Technical Constraints

Reuse Feature 195 `worker_jobs`, Feature 196 Goal/Capability contracts, Feature 197 Runner, Feature 198 Chat and Feature 199 MCP gateway. Extend current OpenAI Agents/LangGraph/Web/Python and Tauri foundations. Provider credentials stay inside adapters/Runner; tenant authority is server-derived; no whole-repository typecheck.

## Dependencies

Inputs: Job admission/events from 195, plan/capability/approval from 196, Runner identity/control from 197, Chat/context/assets from 198 and governed MCP capabilities from 199. Outputs feed normalized Agent Task state/results back to Chat and Job projections.

## Outputs

Produces Agent Task/session/turn/event/result contracts, provider adapter interface, runtime discovery/eligibility, workspace/context/asset/skill gateway integrations, verification/reconciliation services, APIs/UI and focused tests.

## Edge Cases

1. Provider emits duplicate/out-of-order events or disconnects during a turn; normalized sequence and replay converge safely.
2. Workspace verification finds changes outside the authorized scope; result is blocked or requires explicit review.
3. Agent requests a capability absent from its snapshot or revoked mid-run; the request is denied and the session remains auditable.
4. A provider returns HTTP success with empty or malformed output; it is not marked as successful or billable.

## Error Handling

Classify provider, transport, policy, context, workspace, verification, cancellation and reconciliation errors. Persist normalized events and unknown states durably, fence stale results, provide bounded resume/cancel behavior and preserve provider-native evidence separately from normalized projections.

## Testing Expectations

Test adapter contracts for each initial provider, manifest validation, Job handoff, event ordering/dedupe, reconnect/replay, Runner control, workspace confinement/verification, context/asset/skill ACL, MCP gateway mediation, cancellation, empty output and Chat UI state matrices. Run focused Web/Python/Rust tests and formatting checks only.

