# Research Notes: Virtual AI Office Orchestrator

## Scope

This research pass combines:

- current SmartSpec codebase capabilities
- prior SmartSpec specs and memory documents
- current external multi-agent patterns

Research date: March 18, 2026

## Current SmartSpec Capabilities Relevant To The Spec

### Personas

- Persona editing, templates, nickname, gender style, and prompt shaping already exist.
- Persona currently behaves as an identity and response-style layer.
- Persona is not yet the full execution model for teams.

Relevant local files:

- `apps/web/client/src/components/settings/PersonasPanel.tsx`
- `apps/web/client/src/components/settings/personaTemplates.ts`
- `apps/web/server/services/personaService.ts`

### Agencies / Swarm

- SmartSpec already has multi-agent domain entities:
  - `agency_agents`
  - `agency_agent_tools`
  - `agency_communication_flows`
- There are already dedicated pages for agency browser, builder, templates, marketplace, and chat.
- Agency chat already supports choosing a recipient agent and streaming activity such as `agent_switch`, `tool_call`, and `handoff`.

Relevant local files:

- `apps/web/drizzle/schema.ts`
- `apps/web/client/src/pages/AgencyChat.tsx`
- `apps/web/client/src/hooks/useAgencyStream.ts`
- `apps/web/server/routers/agency.ts`

### Cross-Agency Communication And Guardrails

- A built-in agency call tool already exists.
- Cross-agency execution already enforces:
  - tenant isolation
  - RBAC
  - allowlist
  - depth limit
  - loop prevention
  - budget cap
  - concurrency cap

Relevant local files:

- `apps/web/server/routers/agency.ts`
- `python-backend/app/services/tools/agency_call_tool.py`

### Existing Brainstorm

- Brainstorm currently operates as a fixed multi-model debate between Model A and Model B plus a final summary.
- It is closer to a structured debate helper than a reusable multi-agent team runtime.
- It should be reinterpreted as a special case of agent discussion rather than remain a standalone concept.

Relevant local files:

- `apps/web/server/_core/llmRoutes.ts`

### Existing Memory Systems

- Web chat has `entity_memories`, but they are effectively user-owned memories inserted as a single `User Context` block.
- Python backend has richer semantic and episodic memory structures with user/project/session/workflow scopes.
- Existing long-term memory design documents are project-scoped, which is useful but not sufficient for team chat and agent-private memory.

Relevant local files:

- `apps/web/server/services/chatService.ts`
- `apps/web/drizzle/schema.ts`
- `python-backend/app/models/semantic_memory.py`
- `python-backend/app/models/episodic_memory.py`
- `python-backend/app/services/memory_service.py`
- `docs/long_term_memory_architecture.md`

## Key Product Gap

SmartSpec already has the beginnings of a multi-agent platform, but the current layers are not yet unified:

- persona = identity
- chat = user conversation
- agency = execution graph
- brainstorm = limited model-to-model debate
- memory = mostly user/project-oriented

The missing product model is:

- user as orchestrator
- assistants as named collaborators
- teams as durable working groups
- room/team/agent memory scopes
- autonomous intra-team conversations that produce inspectable artifacts

## External Research

### OpenClaw

Observed direction from docs reviewed on March 18, 2026:

- emphasizes multi-agent routing
- emphasizes isolated workspaces/sessions per agent
- provides a useful mental model for many specialized assistants

Inference:

- OpenClaw is helpful as inspiration for many named assistants and isolated execution contexts
- it does not remove the need for SmartSpec-specific concepts like team memory, artifact workflows, approval gates, and cross-surface automation

Sources:

- https://docs.openclaw.ai/
- https://docs.openclaw.ai/concepts/multi-agent

### Anthropic

Anthropic engineering guidance is highly relevant:

- multi-agent is strongest when work can decompose into parallel subtasks
- it is not automatically better for tightly coupled tasks
- orchestration must balance quality gains against latency and cost

This supports a design where SmartSpec offers:

- direct single-assistant mode
- team mode for decomposition-worthy work
- autonomous continuation only when justified

Source:

- https://www.anthropic.com/engineering/built-multi-agent-research-system

### OpenAI

OpenAI’s current agent guidance reinforces:

- handoffs
- agent-as-tool patterns
- traces
- evals
- approval boundaries
- workflow nodes rather than free-form agent spawning as the main production pattern

This maps well to SmartSpec’s existing agency graph model.

Sources:

- https://platform.openai.com/docs/guides/agents
- https://platform.openai.com/docs/guides/agent-builder
- https://cookbook.openai.com/examples/agents_sdk/multi-agent-portfolio-collaboration/multi_agent_portfolio_collaboration

## Design Implications

### 1. Do Not Replace Persona

Persona should remain the identity and behavioral layer, but move underneath:

- user profile
- assistant profile
- orchestrator profile

### 2. Agency Becomes The Runtime Substrate

Agency already matches the direction of:

- role agents
- flows
- tools
- activity traces

The product should elevate it to a more approachable “virtual office” concept.

### 3. Memory Must Be Multi-Scope

Project-only sharing is insufficient.

Needed scopes:

- user
- agent
- team
- room/conversation
- project
- task/run

### 4. Brainstorm Should Be Absorbed

Legacy brainstorm becomes:

- a special temporary team discussion pattern
- a preset with two analysts plus one synthesizer
- one mode of agent discussion, not a separate product primitive

### 5. Automation Must Be First-Class

Agent teams should be able to:

- create workflows
- trigger presentations
- create/edit video jobs
- delegate to agencies
- call tools and browser sessions
- schedule recurring work

## Planning Decision

This work is architecture-heavy but still bounded enough for a focused planning package.

Chosen depth: `standard`

Reason:

- it spans multiple subsystems
- but the immediate output requested is a spec and phased plan, not implementation
