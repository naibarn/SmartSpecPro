# Section 03: Python Runtime and Supervisor

## Goal

Extend the Python Agents runtime so it can load a subagent-aware bundle, resolve topology, run specialists as tools or handoffs, and checkpoint parent and child execution.

## Scope

This section covers:

- OpenAI Agents Python adapter integration
- runtime bundle loading and topology resolution
- phase-supervised execution and checkpointing
- lineage persistence for parent and child runs
- resume behavior for interrupted runs

## Files to touch

- `python-backend/app/services/openai_agents_adapter.py`
- `python-backend/app/services/openai_agents_skill_runtime.py`
- `python-backend/app/services/openai_agents_skill_supervisor.py`
- `python-backend/app/services/openai_agents_skill_persistence.py`
- `python-backend/app/services/openai_agents_subagent_contracts.py`

## Implementation notes

- Build the orchestrator from the bundle manifest and load only the specialist agents needed by the current run.
- Prefer `Agent.as_tool()` for bounded specialist work and use handoffs only when the manifest says ownership should transfer.
- Use sessions or resumable run state for durability instead of manually reconstructing history.
- Persist a normalized lineage record that includes parent and child run IDs, roles, status, checkpoint version, resume cursor, verification state, and artifact references.
- Keep secrets out of persisted context. Redact sensitive fields before state is written to disk or the database.
- Treat verification as a gate before finalize.
- Respect a bounded fanout budget so child agents cannot be spawned without limit.
- Enforce manifest integrity and security policy before any subagent code is invoked.

## Data model

- Extend the existing generic agent runtime archive with lineage and checkpoint metadata.
- Keep parent and child run history queryable from the same durable archive if possible.
- If the existing tables become too wide, add a compact lineage table rather than splitting trace and resume state into unrelated stores.
- Apply additive schema migrations first, then backfill lineage rows, then switch readers to the new fields, and only then remove legacy fallback paths.
- Version any new lineage schema explicitly so incompatible bundle or checkpoint data can be rejected early.

## Acceptance criteria

- The runtime can load a bundle and discover its subagents.
- The runtime can route work to a specialist as a tool or via handoff based on manifest policy.
- Parent and child runs checkpoint and resume safely.
- The runtime can reject invalid bundle/manifest combinations before execution.

## Test-first guidance

- Write runtime and persistence tests before wiring new UI or web-launch behavior.
- Cover lineage persistence, resume, secret redaction, and manifest mismatch rejection.
