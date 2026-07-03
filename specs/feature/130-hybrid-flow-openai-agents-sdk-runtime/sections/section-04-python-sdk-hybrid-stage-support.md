# Section 04: Python OpenAI Agents SDK Hybrid Stage Support

## Purpose

Extend the existing Feature 101 Python OpenAI Agents SDK adapter for Hybrid stage execution.

Do not create a second SDK bridge.

## Depends On

- `section-01-contracts-flags-routing-fixtures`

## Blocks

- Node stage runner integration
- SDK-backed explore/validate stages
- release gates

## Files Owned By This Section

- `python-backend/requirements.txt`
- lock/constraints file if used by this repo
- `python-backend/app/services/openai_agents_adapter.py`
- `python-backend/app/services/openai_agents_contracts.py`
- `python-backend/app/services/openai_agents_version.py`
- `python-backend/tests/unit/test_openai_agents_adapter.py`
- `python-backend/tests/unit/test_openai_agents_contracts.py`
- new focused Hybrid adapter tests under existing Python test conventions

## Dependency Upgrade

Before implementation:

- re-check latest stable `openai-agents`
- pin exact version
- read release notes
- ensure SmartSpecPro sets explicit model/runtime config
- keep `openai` Python dependency explicit
- do not add SDK dependencies to Node

## Adapter Requirements

The adapter must:

- accept `surface = "hybrid"`
- validate Hybrid stage request metadata
- validate tool, skill, and handoff allowlists
- build a fixed role graph for explorer, critic, synthesizer, validator
- use gateway-provided model configuration
- normalize SDK output into `HybridStageResult`
- expose SDK version and supported Hybrid stage types through health
- reject unsupported contract versions with structured errors

## Role Templates

Role prompts should be versioned server-owned templates:

- explorer: alternatives and rationale
- critic: risks and missing constraints
- synthesizer: recommendation and execution-ready plan
- validator: schema/policy/budget verdict

## TDD Expectations

Write tests first for:

- dependency is exactly pinned
- SDK version is exposed
- Hybrid request validates
- unsupported contract version fails closed
- tool/handoff scope widening is rejected
- gateway model config is used instead of SDK default
- role graph output normalizes into expected envelope
- trace redaction excludes secrets and hidden prompts

## Acceptance Checks

- Adapter runs Hybrid stage requests through existing SDK boundary.
- No `agency-swarm` import or invocation is used for new Chat-origin Hybrid.
- Feature 101 Chat/Team/shared skill contracts remain compatible.

## UI/UX Contract

### Target User / JTBD

N/A for direct UI implementation. This section provides backend SDK execution results consumed by Node and later UI projections.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Hybrid workspace | `/hybrid/:executionId` | no UI change here; adapter result source only |

### Component Map

N/A. No React component is owned by this section.

### State Matrix

N/A. Adapter statuses are mapped to UI states in later sections.

### Responsive Matrix

N/A. No browser layout.

### Accessibility Acceptance

N/A. No direct UI.

### Copy Contract

N/A. Adapter returns structured codes; UI copy is localized later.

### Browser Evidence Required

N/A. Verify through Python unit tests and later workspace browser evidence.
