# Request Brief

## Goal
Design a hybrid orchestration solution where the existing Virtual workflow side and Agencies swarm side can work together continuously, with a new command/button that can plan, delegate, and execute a collaborative flow end-to-end.

## What we want
- Assess which side is strongest for which kinds of work.
- Define how both systems should cooperate to get better output, speed, flexibility, and reliability.
- Add a command surface so the user can ask the system to design a joint flow instead of running each side separately.
- Keep the current architecture as the starting point instead of replacing it.

## Current codebase context
- There is already a workflow/orchestrator stack in Node.js for routing, scoring, approval, and execution.
- There is already a Python agency orchestration path with `agency-swarm` integration.
- Agencies already support multi-node topologies such as `handoff_chain`, `orchestrator_worker`, `hybrid`, and `custom`.
- Chat already has escalation behavior that can route complex tasks to agency-level collaboration.

## Constraints
- Do not make workflow execution nondeterministic.
- Do not let swarm agents commit state directly without a validation gate.
- Preserve existing routing, approval, credit, and audit behavior.
- Keep the design compatible with incremental implementation and TDD.

## Non-goals
- Rewriting the full orchestrator stack from scratch.
- Replacing agency-swarm.
- Introducing a brand-new parallel system that duplicates current routing logic.

