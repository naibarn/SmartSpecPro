# Decision Log

## Planning Mode

- Chosen planning depth: `standard`

## Why Not A Small Quick Fix

- The request changes product semantics, not just UI.
- It affects personas, chat, agencies, memory, brainstorm, and automation surfaces together.
- A unified spec is required before implementation slices are safe.

## Why Not A Full Deep-Plan Tree Yet

- The user explicitly asked for a new `spec.md` first.
- The immediate goal is to establish a coherent architecture and product direction.
- Detailed implementation decomposition can happen after the spec is reviewed.

## Main Architectural Decisions

- Preserve persona as the identity layer.
- Reuse agency/swarm as the execution substrate.
- Treat the user as a possible orchestrator role, not always the sole speaker.
- Introduce memory scopes beyond `projectId`.
- Replace standalone brainstorm with agent discussion patterns and presets.
- Treat automation surfaces as callable execution destinations for assistant teams.
- Keep the rule that one persona may belong to multiple teams.
- Model schedule-driven work as routines that wake the orchestrator/intake layer rather than directly bypassing review by assigning work to one producer.
- Represent external systems as connector-backed team members, not as fake personas.
- Require preset teams to include an explicit quality loop (producer, reviewer, approval path), not just a list of members.
- Use work items as the canonical operational layer between intake, delegation, review, approval, and delivery.
- Track follow-on hardening work in the dedicated delta plan at `planning/virtual-ai-office-orchestrator-hardening/` so implementation of callback security, revision concurrency, mixed-member contracts, and room redaction stays explicit rather than implicit.
