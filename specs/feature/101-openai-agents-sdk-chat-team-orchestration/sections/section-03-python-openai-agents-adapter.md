# Section 03: Python OpenAI Agents SDK Adapter

## Purpose

Create the only Chat/Team OpenAI Agents SDK import boundary in Python. The adapter converts SmartSpecPro runtime DTOs into SDK agents/tools/handoffs/runs and converts SDK outputs back into platform DTOs.

The adapter must route model execution through the SmartSpecPro gateway and must not use direct provider credentials for production runtime traffic.

## Depends On

- `section-01-shared-contracts-flags`

## Blocks

- Node runtime client
- Chat runtime integration
- Team runtime integration
- Rollout and replay gates

## Files Owned By This Section

- `python-backend/app/services/openai_agents_adapter.py`
- `python-backend/app/services/openai_agents_contracts.py`
- `python-backend/app/services/openai_agents_gateway_model.py`
- `python-backend/app/services/openai_agents_trace.py`
- `python-backend/app/services/openai_agents_version.py`
- `python-backend/requirements.txt` and the repo's relevant lock/constraints path
- `python-backend/tests/unit/test_openai_agents_adapter.py`
- `python-backend/tests/unit/test_openai_agents_contracts.py`
- `python-backend/tests/unit/test_openai_agents_gateway_model.py`
- `python-backend/tests/unit/test_openai_agents_trace_redaction.py`
- `python-backend/tests/unit/test_openai_agents_stream_resume.py`
- `python-backend/tests/unit/test_openai_agents_import_boundary.py`

Do not modify Chat/Team Node routing in this section.

## Dependency Policy

Add the SDK dependency in one Python dependency path only.

Rules:

- use exact pinning for `openai-agents`
- keep the `openai` Python dependency explicit and compatible
- do not add SDK dependencies to Node package manifests
- document which lock/constraints file must be regenerated for deployment
- tests must fail if the dependency is unpinned or duplicated in an unexpected place

Implementation note:

- `python-backend/requirements.txt` is the authoritative dependency path for this repo's Python runtime.
- `python-backend/pyproject.toml` remains tool-configuration only and must not declare `openai-agents`.
- `python-backend/uv.lock` may be regenerated during environment refresh, but it is not treated as the authoritative deployment manifest for this section.

## Adapter Contract

Adapter entry points:

- `run(request)`
- `run_streamed(request)`
- `resume(request)`
- `cancel(request)`
- `health()`

`health()` returns:

- adapter version
- SDK version
- gateway-model support enabled
- trace export mode
- production-safe tracing status

Adapter request validation:

- require tenant id
- require surface
- require request id
- require idempotency key
- require execution envelope
- require Node-resolved model config
- require allowed tools/skills lists, even if empty
- require trace context

Adapter response:

- status
- selected agent
- selected skill slug
- model/provider/gateway route metadata
- final output
- artifacts
- review verdict
- events
- trace metadata
- checkpoint if paused
- terminal reason if terminal
- SDK version
- adapter version

## Gateway Model Client

Create SDK model clients against the SmartSpecPro gateway.

Rules:

- `base_url` must be the gateway URL from Node config or environment-approved internal gateway base.
- API key/token must be the platform attribution token.
- model id must come from Node's `RuntimeModelConfig`.
- direct provider URLs are rejected for production runtime surfaces.
- provider API keys are never accepted in production runtime adapter request payloads.

Use the existing gateway-routed approach in `agency_swarm_adapter.py` as a pattern, but do not expand that adapter for product/runtime surfaces.

## Tools And Handoffs

Tools:

- create SDK tools only from envelope-allowed tools
- mutating tools require side-effect class and approval policy
- tools return normalized platform tool events
- tool output is untrusted evidence unless explicitly trusted by platform policy

Handoffs:

- register only envelope-allowed target agents
- handoff scope is source scope intersected with target scope
- handoff reason is captured in redacted metadata
- handoff cannot add connectors, write scopes, or tools

Guardrails:

- use SDK input/output/tool guardrails as workflow-local checks
- do not rely on one top-level guardrail to protect all tool/handoff flows
- structured guardrail blocks map to platform error codes

## Tracing

Production defaults:

- disable sensitive input/output capture
- disable external SDK trace export unless development-only config explicitly enables it
- use platform-owned trace processor/exporter
- emit only redacted platform events back to Node

Trace events must include:

- surface
- run id where available
- step id/key where available
- attempt id where available
- event id
- sequence
- event name
- source component
- idempotency key
- SDK version
- adapter version

## Streaming, Resume, And Cancel

Streaming:

- normalize every stream event into `AgentRuntimeEvent`
- include stable event id, sequence, step/attempt identity, and idempotency key
- duplicate stream event delivery must normalize to same identity

Resume:

- requires checkpoint id or resume cursor
- references original attempt/checkpoint
- returns a linked new attempt where appropriate

Cancel:

- returns structured cancelled status
- includes cancel reason and actor metadata if provided
- does not leak raw prompts or tokens

## TDD Tests To Write First

Dependency/import tests:

- Test `openai-agents` is exactly pinned.
- Test no Node package manifest includes SDK dependency.
- Test only `openai_agents_adapter.py` and the agency-only exception import `agents`.

Contracts:

- Test valid Chat request fixture validates.
- Test valid Team step request fixture validates.
- Test missing envelope fails.
- Test missing model config fails.
- Test unknown review status fails.
- Test validation errors are redacted.

Gateway model:

- Test gateway base URL is used.
- Test direct provider base URL is rejected for production runtime surfaces.
- Test platform attribution token is used.
- Test provider API key in request is rejected.

Tools/handoffs:

- Test only allowed tools are registered.
- Test mutating tool without approval requirement is rejected.
- Test handoff cannot widen scope.
- Test tool output is labeled untrusted.

Tracing:

- Test sensitive trace data disabled by default.
- Test external SDK trace export disabled by default.
- Test redaction removes tokens, signed URLs, cookies, and provider keys.
- Test trace event includes SDK and adapter versions.

Streaming/resume/cancel:

- Test stream events include sequence and idempotency key.
- Test duplicate stream event maps to same normalized event identity.
- Test resume references checkpoint.
- Test cancel returns structured status.

## Implementation Notes

- Keep the adapter boundary small.
- Prefer Pydantic validation before SDK invocation.
- Do not persist anything directly from Python unless existing backend conventions already do so; Node should normally persist platform state.
- Do not implement Chat/Team business logic in Python.

Implemented shape:

- `openai_agents_adapter.py` is the only new Chat/Team runtime import boundary that loads `agents`; helper modules do not import the SDK.
- Gateway transport setup is isolated in `openai_agents_gateway_model.py` and rejects direct provider URLs or provider API keys for production runtime surfaces.
- Runtime DTO validation is enforced with strict Pydantic models in `openai_agents_contracts.py`.
- Trace normalization and redaction are isolated in `openai_agents_trace.py`, with sensitive capture and external SDK export disabled by default.
- Runtime/SDK version reporting is centralized in `openai_agents_version.py`.

Test status:

- Implemented 26 targeted unit tests across contracts, gateway routing, trace redaction, stream/resume/cancel, adapter policy checks, and import-boundary enforcement.
- Verified with:
  - `DEBUG=false ENVIRONMENT=development uv run pytest --no-cov tests/unit/test_openai_agents_import_boundary.py tests/unit/test_openai_agents_contracts.py tests/unit/test_openai_agents_gateway_model.py tests/unit/test_openai_agents_trace_redaction.py tests/unit/test_openai_agents_stream_resume.py tests/unit/test_openai_agents_adapter.py`
- Current warnings during this targeted run are pre-existing Pydantic deprecation warnings outside this section's owned files.

## Acceptance Criteria

- SDK imports are isolated.
- Adapter can run against gateway model config.
- Adapter returns normalized, redacted, versioned runtime DTOs.
- Stream/resume/cancel normalization exists.
- Tests prove no direct provider execution path for production runtime surfaces.
