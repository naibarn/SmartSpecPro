# Virtual AI Office Orchestrator

## Original Request

Create a new `spec.md` that extends the current persona and agency direction into a full multi-assistant system where:

- the user can become an orchestrator instead of the only active participant
- the user still has a persona/profile of their own
- each virtual assistant has its own name, identity, persona, responsibilities, tools, and memories
- multiple assistants can work together as a team
- the system supports new team chat rooms
- assistants can talk to one another automatically, while the orchestrator can inspect the full discussion or only the final summary
- the old brainstorm mode is upgraded or replaced by agent-to-agent discussion
- assistants can trigger workflows, presentations, video editing, agency jobs, and other automation surfaces
- the platform can later evolve toward assistants that continue work autonomously

## Task Summary

Design the next-step product and system architecture that unifies:

- personas
- team agents
- orchestrator UX
- scoped memories
- team chat and autonomous chat
- automation handoffs across SmartSpec surfaces

## Repository-Fit Assumptions

- Existing persona work remains valid as the identity layer for a single assistant.
- Existing agency/swarm work remains the main execution substrate for multi-agent collaboration.
- Existing brainstorm behavior should be treated as a legacy precursor, not a long-term destination.
- Existing memory systems should be extended, not replaced wholesale.
- Existing chat should remain the primary front door, but agency chat/team chat may become the richer orchestration surface.

## Constraints

- The design must preserve tenancy, RBAC, approval boundaries, and cost controls.
- The design should support incremental rollout rather than a big-bang rewrite.
- The design should reuse current SmartSpec entities where possible.
- The design should leave room for future autonomous execution without forcing unsafe autonomy now.

## Explicit Non-Goals For This Spec Pass

- No production migration plan with exact SQL yet
- No complete UI wireframes
- No final API payload definitions for every endpoint
- No direct code implementation in this pass
