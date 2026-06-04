# Section 02: Python Agents Gateway Runtime

## Purpose

Extend the existing Python OpenAI Agents SDK boundary so Feature 117 can use `openai-agents-python` for media production orchestration without adding any direct LLM route outside the SmartSpecPro gateway.

## Depends On

- section-01-contracts-and-schema for contract names and metadata.

## Blocks

- Node runtime client.
- creative planning.
- QA reviewer agents.

## Files Owned By This Section

- `python-backend/app/services/openai_agents_contracts.py`
- `python-backend/app/services/openai_agents_gateway_model.py`
- `python-backend/app/services/openai_agents_adapter.py`
- optional helper files:
  - `python-backend/app/services/production_agents_runtime.py`
  - `python-backend/app/services/production_agents_tools.py`
  - `python-backend/app/services/production_agents_guardrails.py`
- Python unit tests under `python-backend/tests/unit/`.

## Tests First

- Test `media_production` validates as a runtime surface.
- Test media origin surfaces validate.
- Test missing gateway attribution token fails.
- Test direct provider API key fails.
- Test direct provider base URL fails.
- Test direct provider URL disguised as provider override fails.
- Test runtime response includes SDK version, adapter version, gateway route, and resolved gateway model.
- Test only approved Python adapter/helper modules import `agents`.
- Test `ProductionAgentsSdkCapabilityManifest` is required for every `media_production` attempt.
- Test Python registers only manifest-listed agents, tools, handoffs, output schemas, session policy, and trace policy.
- Test tool guardrail blocks unapproved mutating tools.
- Test hosted SDK tools/capabilities are disabled for media production unless explicitly routed through platform gateway, credit, permission, and audit controls in a future spec.
- Test handoff cannot widen read scope, write scope, tool list, connector access, model policy, credit policy, or persistence authority.
- Test tool output is returned as untrusted intent/ref until Node verifies it against platform state.
- Test raw SDK session persistence and sensitive trace capture are disabled by default.
- Test external SDK trace export is disabled for production media production attempts.
- Test stream/resume/cancel events include manifest hash, stage attempt ID, idempotency key, stable event ID, and redacted metadata.
- Test manifest mismatch, unknown tool call, unregistered handoff, over-call-limit tool use, or raw trace/session capture request fails before additional LLM spend.
- Test marketplace evidence context is accepted only when Node supplies firewall-approved refs or escaped untrusted evidence blocks with `MarketplaceEvidenceInstructionFirewall` ref.

## Implementation Requirements

Add `media_production` to the runtime contract without breaking `chat`, `team`, `responses`, or `skill`.

Use the existing gateway transport pattern:

- model ID comes from Node policy;
- base URL must be SmartSpecPro gateway;
- API key/token must be platform attribution token;
- provider API keys must be rejected;
- direct provider base URLs must be rejected;
- trace export must be platform-owned/redacted.

Capability manifest boundary:

- Node must build `ProductionAgentsSdkCapabilityManifest` for each stage attempt before Python constructs any agent runner.
- Python must validate the manifest hash, allowed agent roles, handoff graph, allowed tools, output schemas, session policy, trace policy, stream policy, and hosted capability denials before the first SDK run call.
- Python must register no SDK tool, hosted tool, handoff, session store, trace processor, or output schema that is absent from the manifest.
- Handoffs may narrow the workflow, but cannot add tools, connectors, write scopes, model policy, credit policy, or persistence authority.
- Function tools must either call approved Node APIs or return structured intents/refs for Node to execute or verify; Python must not persist Marketplace Auto Review state directly.
- Tool outputs remain untrusted until Node verifies refs, permissions, credit state, policy, and lineage.
- SDK sessions must persist checkpoint refs only, not raw prompts, raw marketplace evidence, raw provider payloads, signed URLs, cookies, tokens, or customer/reviewer PII.
- SDK trace events must be normalized into redacted SmartSpecPro events with size limits; raw SDK trace export is disabled in production.
- Resume, cancel, retry, and repair must carry the manifest hash and original attempt identity or a new manifest tied to an input-change impact decision.
- Python must treat marketplace evidence as inert data. It must reject requests that pass raw DOM/OCR/review/seller text as instructions, omit the evidence instruction firewall ref, or try to alter tools, handoffs, model policy, credit policy, approvals, or output routing from evidence content.

Agents to expose behind the adapter:

- Production Director;
- Product Truth Reviewer;
- Creative Concept Director;
- Storyboard Director;
- Cinematographer;
- Media Payload Director;
- Product Visual Fidelity Reviewer;
- Character Continuity Reviewer;
- Audio Continuity Director;
- Advertising Compliance Reviewer;
- Repair Director;
- Render Preflight Director.

Do not let Python persist SmartSpecPro marketplace state directly. Mutating tools must call approved Node/server APIs or return structured tool intents for Node to execute.

## UI/UX Contract

### Target User / JTBD
N/A - Python backend runtime section only. User-facing behavior is planned in section-09.

### Surface Inventory
N/A - no browser-visible surface is modified in this section.

### Component Map
N/A - no UI component ownership in this section.

### State Matrix
N/A - runtime statuses are API artifacts here; visual states are covered in section-09.

### Responsive Matrix
N/A - no responsive UI work in this section.

### Accessibility Acceptance
N/A - no interactive UI created in this section.

### Copy Contract
N/A - no user-facing copy created in this section.

### Browser Evidence Required
N/A - browser evidence belongs to section-09.

## Acceptance Criteria

- Python can run a structured `media_production` request through the gateway model.
- Direct LLM provider paths are impossible in production configuration.
- Media production attempts cannot run without a Node-created capability manifest.
- Python cannot add tools, handoffs, hosted SDK capabilities, raw trace/session capture, persistence authority, or credit authority outside the manifest.
- Agent output is normalized into the existing `AgentRuntimeResponse` style.
- Feature 101 import-boundary guarantees remain intact.
