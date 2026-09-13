# Enhanced Provider Tool-Capability Design

## Problem

Enhanced authoring currently sends read-only function tools to the Agents SDK even
when the selected LLM mapping declares `supportsFunctionTools=false`. The provider
can reject the request at the transport boundary, while the UI only reports a
generic provider-boundary failure.

## Scope

- Carry the provider's function-tool capability into the Enhanced authoring input.
- Disable optional Agent function tools when the capability is explicitly false.
- Preserve the existing behavior when the capability is absent or true.
- Add focused regression coverage for capability propagation and tool selection.
- Keep Legacy prompting, dialogue content, start-frame assets, paid generation, and
  provider calls unchanged.

## Data flow

`model_provider_map.supportsFunctionTools` → `ProviderCandidate` →
`EnhancedModelFacts` → bridge payload → `AgentRuntimeConfig` → `AgentFactory`.

The bridge will treat an explicit false value as authoritative. The two existing
read-only tools (`get_asset_evidence` and `get_provider_capability_profile`) will
be disabled in that case; research remains disabled for the current Enhanced
`researchMode=off` path and paid-generation tools remain unavailable.

## Error handling

No raw provider response or credential data will be exposed. Existing generic
failure behavior remains as a fallback. This change focuses on preventing the
known unsupported-tool request; error-message refinement is limited to tests or
small compatible changes if the current boundary allows it.

## Verification

- Unit-test provider capability selection and bridge configuration.
- Run the focused Enhanced/prompt-routing Vitest suites with a local JWT secret.
- Run the Python bridge unit tests and syntax checks.
- Do not submit an AI request, retry a paid job, deduct credits, mutate episode
  creative data, or restart production services.

## Operational considerations

This is an additive runtime compatibility change with no database migration and
no new environment variables. Existing providers that support tools retain their
current behavior; providers that explicitly do not support tools receive a
tool-free structured authoring request.
