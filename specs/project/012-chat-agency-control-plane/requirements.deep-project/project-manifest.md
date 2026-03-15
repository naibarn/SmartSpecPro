<!-- SPLIT_MANIFEST
01-chat-intent-router
02-agency-handoff-contract
03-destination-and-project-resolution
04-agency-flow-composer
05-recurring-execution-and-notifications
06-chat-control-plane-ux
07-observability-and-governance
END_MANIFEST -->

# Project Manifest

## Overview

This project should not be implemented as one monolithic feature. The main risk is coupling routing, orchestration, scheduling, destination ownership, and UI explanation into a single change set. The correct approach is to split the work into control-plane layers.

The central design rule for all splits is:

- `Chat` produces a structured control-plane request
- that request becomes an `Automation Program`
- the `Automation Program` can own handoff, destination, schedule, outputs, notifications, approvals, and return artifacts across surfaces

Without this shared root object, later splits would invent separate truths for agency runs, schedules, destinations, and user-visible status.

## Proposed splits

### 01-chat-intent-router

Teach Chat to classify user requests into a multi-axis intent envelope rather than a single mode:

- work kind
- orchestration mode
- execution surface
- destination hint
- recurrence intent
- approval posture

This split establishes the initial decision boundary and structured routing metadata.

### 02-agency-handoff-contract

Define the shared `Automation Program` contract and how Chat hands that program into Agency Swarm:

- automation-program identity and lifecycle
- handoff request schema
- source conversation linkage
- return artifact model
- status reporting back into Chat
- execution posture contract (`direct-run`, `draft-review`, `confirm-first`, `human-gated`)

This is the minimum control-plane seam between Chat and Agency execution.

### 03-destination-and-project-resolution

Decide where outputs belong:

- presentation library/editor
- media/video workspace
- chat artifact
- automation project / existing project container

This split prevents output sprawl and defines the user-visible landing/read model for generated outputs.

### 04-agency-flow-composer

Generate Agency Swarm flows automatically from high-level prompts:

- derive reusable flow templates
- map prompt intent into agents/nodes/tools
- consume execution posture from the shared contract instead of inventing it locally

This is the automation-composition core.

### 05-recurring-execution-and-notifications

Bind generated agency flows to schedules and delivery:

- recurring schedules
- per-item progress
- in-app alerts
- email notifications
- retry semantics and execution windows
- missed-run, catch-up, idempotency, and duplicate suppression policy

This split is required for the “daily presentations/videos” use cases.

### 06-chat-control-plane-ux

Design the Chat-side UX:

- explain what route was chosen
- show when the system is composing an agency flow
- let the user adjust, confirm, pause, or resume
- show downstream artifacts and run status
- reflect Automation Program lifecycle in Chat as the single narrative thread

This keeps the system understandable instead of magical and opaque.

### 07-observability-and-governance

Cross-cutting concerns:

- feature flags
- tenant and approval boundaries
- execution audit trail
- failure routing
- reporting and metrics
- budget, quota, concurrency, and runaway-job controls

This split should be planned after the main functional seams are defined, but must ship before broad rollout.

## Dependency order

1. `01-chat-intent-router`
2. `02-agency-handoff-contract`
3. `03-destination-and-project-resolution`
4. `04-agency-flow-composer`
5. `05-recurring-execution-and-notifications`
6. `06-chat-control-plane-ux`
7. `07-observability-and-governance`

## Why this order

- Chat cannot escalate correctly until routing metadata exists.
- Automatic agency flow creation is unsafe without a clear automation-program contract, execution posture, and destination model.
- Recurring execution should bind to a composed flow, not invent orchestration and scheduling simultaneously.
- UX should be built against stable control-plane semantics rather than driving the architecture by mock UI alone.
- Governance must consume the final cross-surface lifecycle rather than only individual subsystem runs.

## Existing codebase anchors

- Chat already has a task-oriented surface with skills, memory, scheduling, media, and Browser Session entrypoints.
- Planner-to-agency escalation primitives already exist in the backend.
- Agencies already exist as a dedicated runtime surface.
- Browser Session already proves that cross-surface run artifacts can return into Chat.

## Recommended next commands

1. `/deep-plan @specs/project/012-chat-agency-control-plane/requirements.deep-project/01-chat-intent-router/spec.md`
2. `/deep-plan @specs/project/012-chat-agency-control-plane/requirements.deep-project/02-agency-handoff-contract/spec.md`
