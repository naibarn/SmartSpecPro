# Deep Project Interview

## Scope confirmation

This project is not about adding one more button to Chat. It is about making `Chat` the universal control plane and making `Agency Swarm` the automation substrate that can orchestrate recurring and multi-step work across Browser Session, presentations, media generation, scheduling, alerts, and related surfaces.

## Synthesized interview notes

The user’s mental model, as expressed in the requirements:

- The user should not need to know internal product boundaries such as Chat, Media Studio, Presentation, Browser Session, or Agency Swarm before starting work.
- The system should infer the correct capability and surface from outcome-focused prompts.
- Agency Swarm should be used as the coordination layer for tasks that are recurring, high-volume, multi-step, or cross-surface.
- The system should decide the most suitable destination workspace for generated outputs.
- Scheduled recurring work and notifications are first-class requirements.
- Chat and Agency Swarm together form the human-to-system coordination boundary.

## Existing constraints from codebase analysis

- Chat already supports direct chat, skills, scheduling alerts, Browser Session entry, Memory, and media-oriented prompt shortcuts.
- Browser Session already integrates with Chat, Agency, and Workflow.
- Agency Swarm exists as a dedicated surface and already has some planner-aware escalation primitives.
- Direct Chat-to-Agency handoff is not yet implemented in the Chat UI or artifact model.

## Open product questions to resolve during downstream planning

- How explicit should the “I am turning this into an agency flow” UX be before execution starts?
- What is the canonical unit of destination ownership for generated outputs: project, workspace, run artifact, or source conversation?
- How much autonomy should the system have when choosing schedules and execution windows if the user leaves timing underspecified?
- Which classes of tasks may auto-escalate without confirmation, and which must ask first?
