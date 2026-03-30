# Section 02 - Shared Contract and Execution Boundary

## Ownership
- `python-backend/app/services/agency_orchestrator.py`
- `python-backend/app/services/agency_service.py`
- `python-backend/app/services/agency_swarm_adapter.py`
- any new coordinator service module

## Outcome
Define a shared plan/brief contract and make workflow the only system that can commit final state.

## What this section does
- Create a staged collaboration plan format.
- Let swarm produce proposals, critique, and synthesis outputs.
- Let workflow validate, approve, persist, and publish the final result.

## Implementation notes
- Keep outputs structured.
- Avoid letting swarm mutate durable state directly.
- Support existing agency topology modes without breaking them.

## Tests
- Contract validation tests for staged plans.
- Backend tests that prove commit/rollback stays on the workflow side.

