# Request

## Summary

Analyze the impact and propose an architecture for turning persona teams into autonomous daily workers.

The target operating model is:

- each persona behaves like a real employee
- personas can belong to multiple teams
- one team member can act as an orchestrator and coordinate other members
- the system can start work automatically on schedule
- the orchestrator can review pending work, yesterday's outcomes, failures, unread alerts, and routine obligations
- team members can discuss among themselves, create new work, and send outputs for AI or human approval
- all events should remain inspectable from chat history and room summaries

## Constraints

- Keep the current rule: one persona may be reused across multiple teams.
- Prefer extending existing SmartSpec team/orchestrator/runtime concepts instead of introducing a parallel system.
- The answer should consider current codebase capabilities before proposing changes.
- Research OpenClaw as an external reference model, but adapt recommendations to SmartSpec's product model.

## Assumptions

- Persona should remain an identity/expertise layer, not the whole runtime.
- Team-member role and automation policy likely belong at the team/profile/runtime layers.
- Daily routine work includes content production, news monitoring, presentation generation, pending-approval review, and alert follow-up.

## Non-goals

- Immediate implementation of the autonomous orchestrator loop.
- Replacing current chat, teams, or agency subsystems wholesale.
