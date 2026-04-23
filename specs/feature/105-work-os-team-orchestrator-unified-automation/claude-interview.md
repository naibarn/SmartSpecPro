# Claude Interview

## Interview Status

No new live interview was required for this resume pass. The user had already provided the domain decisions that shape Feature 105, and the canonical spec incorporates them.

## Captured User Decisions

### Work Request Must Stay Review-First

The system must not auto-run immediately when a Work Request is created. Some jobs are long-running and token-expensive, so users need time to review and edit the request before approving automation launch.

### Team Must Understand The Whole Product

The Team Orchestrator should not behave like a thin LLM prompt wrapper. It must understand and coordinate:

- project chat and brainstorming history
- memory summaries
- document management and knowledge-vault context
- Media Studio image/video/audio generation
- video editing
- Agent Skill marketplace
- intelligence skill creation and maintenance
- Agency Swarm / Google ADK style long-running work
- virtual workflow / LangGraph style deterministic execution
- workpack replay, readiness, and learning loops

### Chat-To-Request Should Preserve Thoughtful Scope

If a project discussion in chat has already clarified direction, boundaries, and expected outcome, the Work Request should be able to inherit that thinking as a linked source. The user should still review and edit the final request before launch.

### Document Management Is A Second Brain

Document management should participate as governed context. It can hold past work, internal policy, content, and domain details, but retrieval must remain explicit, permission-aware, and bounded.

### Skill Marketplace And Skill Maintenance Are Part Of Automation

The system should reuse existing skills, create new private/pending-review skills when needed, and improve owned skills over time. Publishing or widening visibility requires stronger governance than proposal creation.

### Agency And Workflow Should Be Planning Surfaces

Complex work may need Agency Swarm / ADK style autonomy or workflow / LangGraph style deterministic control. The orchestrator should plan when to use each, not merely call an LLM and hope the prompt is enough.

## Open Decisions Deferred To Implementation

- Exact UI density for the preflight preview.
- Exact persistence shape for approval source snapshots if schema migration timing conflicts with early backend services.
- Which feature flag system names should be used for each rollout gate.
- Which privileged surfaces can become auto-executable beyond v1.
