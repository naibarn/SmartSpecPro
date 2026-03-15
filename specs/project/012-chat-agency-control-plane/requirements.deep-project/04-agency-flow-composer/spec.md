# Spec: Agency Flow Composer

## Goal

Generate or adapt Agency Swarm flows automatically from high-level user requests originating in Chat.

## In scope

- Convert high-level prompts into executable agency workflows
- Reuse templates when possible
- Compose tasks, agents, tools, Browser Session, and content-generation steps
- Consume execution posture from `02-agency-handoff-contract` rather than deciding review policy ad hoc
- Support editable draft flows for higher-risk jobs where the posture requires it

## Existing anchors

- Existing agency execution surface
- Planner-aware escalation metadata
- Skill-draft and browser-skill composition patterns from Browser Session

## Dependencies

- Requires `01-chat-intent-router`
- Requires `02-agency-handoff-contract`
- Requires `03-destination-and-project-resolution`

## Provides to later splits

- Executable agency flow definitions
- Draft-vs-direct execution strategy
- Structured execution graph for scheduling

## Required output from deep plan

- Flow-composition inputs that include intent envelope, destination resolution, and execution posture
- Rules for template reuse vs new-flow synthesis
- Boundaries for what may be auto-composed safely without human review
- Interfaces for exposing a draft flow to Chat or Agency UI before execution
- A composition pipeline that is decomposed into phases, not a single opaque service
- A reviewable intermediate representation that is diffable, editable, and traceable before runtime flow compilation

## Key decisions to make in deep plan

- Template-first vs free-form composition
- How to expose editable agency drafts to users
- Which classes of tasks can be auto-composed with no manual review
- How the composer emits flow definitions that stay traceable back to the originating Automation Program

## Composition phases

Deep plan should evaluate a phased pipeline such as:

1. plan synthesis from prompt and intent envelope
2. template matching or structural workflow assembly
3. tool, agent, and execution-surface binding

This is required so composition remains traceable, testable, and debuggable instead of collapsing into one oversized orchestration service.

## Intermediate representation

Deep plan should define an intermediate representation between “user request understood” and “agency flow ready to run”. That representation should be:

- reviewable by users or operators
- diffable across revisions
- editable before execution when posture requires review
- traceable back to source prompt, intent envelope, and destination decision
