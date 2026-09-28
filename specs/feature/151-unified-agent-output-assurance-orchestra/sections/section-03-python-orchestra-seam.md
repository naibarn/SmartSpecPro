# Section 03 — Python Agents SDK Orchestra seam

## Objective

Wrap the existing OpenAI Agents adapter and native skill runtime with a bounded Orchestra entry point. Manager planning is separate from Runner execution; specialists are tools/handoffs; validators remain outside the model.

## Files

- Add `python-backend/app/services/openai_agents_orchestra.py`.
- Extend `python-backend/app/api/internal_openai_agents_runtime.py` only through additive request/response fields.
- Add focused Orchestra tests and retain adapter/stream/resume tests.

## Acceptance

The seam enforces allowed tools/skills/agents, max turns/tools/parallelism/depth, expiry, hash parity, Agency-origin rejection, and no side-effect execution. It returns lifecycle/result/finding/trace/checkpoint metadata and uses provider-result-unknown for uncertain external outcomes.

## Tests

Run Orchestra, adapter, stream/resume, import-boundary, and internal API focused tests with `--no-cov`.
