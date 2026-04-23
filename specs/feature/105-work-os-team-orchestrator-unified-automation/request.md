# Request

## Summary

Design a new end-to-end architecture for `Work OS + Team Orchestrator` that turns the existing product into a genuinely useful automation system without losing the explicit human review step before expensive runs begin.

The new design must analyze the current codebase, reuse the systems that already exist, and produce a complete feature-spec package under `specs/feature/`.

## User intent captured from the request

- Keep `Work Request` review-first. Creating a request must not immediately launch long-running automation.
- Treat chat conversations, project memory, and brainstorm history as first-class upstream inputs for work intake.
- Treat Document Management / Knowledge Vault as a second brain that should enrich planning and execution.
- Treat Media Studio, video editing, workflow execution, agency swarm, ADK, and reusable skills as capabilities the orchestrator should deliberately compose.
- Treat skill maintenance and skill creation as part of the system's learning loop rather than as isolated admin tooling.
- Avoid a design that only "calls an LLM and hopes it picks the right tool".

## Constraints

- Build on top of the current `Work OS`, `Team`, `Chat/Memory`, `Library/Knowledge Vault`, `Media Studio`, `Workflow`, `Agency`, `Skill`, and `Workpack` systems.
- Keep rollout incremental and compatible with the existing `Work Request -> Start automation` user flow.
- Preserve tenant, approval, and cost-control boundaries.
- Produce an implementation-oriented spec package rather than only a prose brainstorm.

## Assumptions

- The immediate goal is architecture and implementation planning, not shipping code in this turn.
- A new feature directory under `specs/feature/` is the desired output format.
- The spec should prefer current repo patterns over introducing a brand new platform stack.
