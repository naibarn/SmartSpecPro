# SPEC-310 Planning Brief — G0 and G1

## Objective

Plan a first-party Native Harness that internally manages a pinned Pi runtime for Native model/tool turns, with every Native LLM call routed through SmartAIHub Gateway. SmartAIHub Chat is the first-class entry point for general work, including non-Git workspaces. Native execution must remain disabled until actual Gateway, credit settlement, execution authority and acceptance proofs exist.

## Normative boundaries

- Treat `spec.md` as the R1.3 cumulative design input. SPEC-310 is the requested replacement identity for a separate local SPEC-309 assignment; never edit or claim ownership of that assignment.
- Preserve SPEC-269 (general-work team intent), SPEC-224 (development lifecycle and priority E2E), SPEC-205/277 (Runner/Companion/Auth/Chat/Projection), SPEC-279 (command ingress), SPEC-292 (Work Context), SPEC-278 (durable Runner sessions), SPEC-207/280 (economic admission/settlement), and SPEC-271 (independent acceptance).
- The OpenAI Agents API on Python remains the canonical agent-runtime authority per repository policy. Managed Pi is an internal Native Harness runtime implementation, not a second top-level orchestrator, scheduler, task database, approval engine or ledger.
- Do not make Orca a dependency. Any SPEC-210 mandatory-Orca language requires a separate explicit owner-approved amendment.
- Keep desktop-user, Runner-device and per-run/per-attempt execution credentials distinct. `llm:chat` is never execution permission.
- Wait for a stable owner-approved Runner/Chat integration contract before implementing Chat-to-Native dispatch. Existing `chat.runOnRunner` is read-only.
- Git/GitHub are optional. `NONE`, local, managed-cloud, connected-source and Git workspace presentation kinds must map to existing authorities; they are not assumed to be deployed enums.
- Do not change protected main, WP1–WP2C2 branches, Desktop Auth, Companion Chat, Task Control, production flags or canonical owner stores during G0/G1.

## G0 state

See `g0-discovery.md` for the refreshed registry, PR, branch/worktree, owner and source evidence. The original R1.3 block below preserves its initial observation; at the refreshed `5cb2d07f91fd5da7fd486c317760be199cf03336` source, SPEC-310 is canonically occupied and 311 is next-safe. The separate local SPEC-309 assignment remains unpublished and unreserved in canonical registry. Preserve it and repeat checks before any identity-changing merge.

## G1 deliverables

1. Versioned contracts for Native runtime manifest, Gateway invocation, canonical job/attempt binding, Workspace/Work Context reference, capability grant and evidence/artifact references.
2. Credential and authority matrix with explicit negative cases for desktop user, Runner device and per-attempt execution grants.
3. Consumer contract proposal for Chat→Native that describes the required ingress semantics without implementing a bridge or claiming approval from the producer.
4. Compatibility/owner matrix and explicit `CROSS_SPEC_CHANGE_REQUEST` for SPEC-210 Orca wording if its owner confirms a normative conflict.
5. Acceptance matrix separating contract fixtures, isolated spikes, real non-production proof and production rollout. Keep every production flag disabled.

## Outcome states

G0 discovery is recorded. G1 contracts are proposed until their owning producers acknowledge them. Chat-to-Native bridge is `WAITING_STABLE_APPROVED_RUNNER_CHAT_CONTRACT`. Native live acceptance is `NOT_PROVEN`. Production Native execution is `DISABLED`.
