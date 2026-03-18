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
