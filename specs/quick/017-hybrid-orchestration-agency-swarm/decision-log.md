# Decision Log

## Depth choice
- Chosen depth: `standard`
- Reason: the request spans Node.js routing, Python agency execution, UI command surfaces, telemetry, approvals, and release behavior.
- Why not micro: this is not a single-file change and needs a clear collaboration contract.
- Why not full deep-plan: we already have enough codebase clarity to produce an implementation-safe plan without a full spec-first workflow.

## Architectural decision
- Treat Virtual workflow as the spine of execution.
- Treat Agencies swarm as an advisory/exploratory/parallel reasoning layer.
- Add a coordination layer rather than a second independent runtime.

## Implementation decision
- Start with an explicit hybrid orchestration command that produces a plan preview before execution.
- Keep final commit/approval in the workflow side.
- Let swarm produce structured proposals, critiques, and alternatives, not direct state writes.

## Why this is the right fit
- It matches the current codebase boundaries.
- It keeps deterministic execution deterministic.
- It preserves existing agency-swarm isolation.
- It creates a path to better user-facing collaboration without a full rewrite.

## Key risks to watch
- Budget growth from overusing swarm.
- Confusing UX if the system does not clearly show which phase is workflow vs swarm.
- Integration drift if shared contracts are not normalized early.

