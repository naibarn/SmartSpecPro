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
- Test tool guardrail blocks unapproved mutating tools.

## Implementation Requirements

Add `media_production` to the runtime contract without breaking `chat`, `team`, `responses`, or `skill`.

Use the existing gateway transport pattern:

- model ID comes from Node policy;
- base URL must be SmartSpecPro gateway;
- API key/token must be platform attribution token;
- provider API keys must be rejected;
- direct provider base URLs must be rejected;
- trace export must be platform-owned/redacted.

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
- Agent output is normalized into the existing `AgentRuntimeResponse` style.
- Feature 101 import-boundary guarantees remain intact.
