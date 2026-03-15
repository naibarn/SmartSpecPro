# Unified Chat + Agency Swarm Control Plane

## User goal

Make `Chat` the single front door to the full SmartSpecPro system.

The user should be able to stay in Chat and still reach all platform capabilities without manually switching to product-specific pages first. Chat and Agency Swarm together become the coordination layer between the user and every major subsystem.

## Core product direction

1. A user can stay on the Chat page and ask for outcomes, not tool-specific steps.
2. The system detects intent and decides whether the task should stay in direct chat, use Browser Session, generate media, create a presentation, schedule recurring work, or escalate into an Agency Swarm flow.
3. Agency Swarm becomes the system-wide automation substrate for complex, scheduled, or multi-step tasks.
4. The system must remain flexible enough to support many user intents without forcing them to know internal product boundaries.

## Example scenarios

### Recurring presentation generation

Example user prompt:

> Help me create presentations about marketing in 2026. Randomize the subtopics every day and generate 2 presentations each morning.

Expected system behavior:

- Chat understands this is not a one-shot answer.
- It identifies this as a recurring automation task.
- It decides whether the output belongs in the presentation workspace.
- It creates the appropriate Agency Swarm flow automatically.
- It sets a recurring schedule.
- Each morning, two new presentations are available when the user opens the presentation area.

### Recurring short-video generation

Example user prompt:

> Create 5 short videos every day, each 1-2 minutes long, about modern AI marketing.

Expected system behavior:

- Chat identifies the task as recurring content production.
- The system decides whether the primary destination is a presentation project, a video-editing project, or another project type.
- It creates the appropriate Agency Swarm flow automatically.
- It schedules the work, potentially staggering execution windows when five videos are required.
- When each daily video is completed, the user is notified via in-app alerts and email.

## Architectural intent

- Chat is the user-facing control plane.
- Agency Swarm is the execution and orchestration plane for complex automation.
- Browser Session is the live web execution plane when web actions are required.
- Presentation, Media Studio, scheduling, alerts, memory, and skills are connected capabilities behind the scenes.
- A single logical `Automation Program` should be able to represent one user request as it moves across routing, agency orchestration, scheduling, output materialization, and notifications.

## Product requirements

### Intent-first behavior

- Users should be able to describe desired outcomes in natural language.
- The system should infer whether the request is:
  - direct answer/chat work
  - media generation
  - presentation generation
  - Browser Session work
  - scheduled automation
  - Agency Swarm orchestration

### Destination resolution

- The system should decide where generated work belongs:
  - presentation project
  - media/video project
  - chat artifact
  - agency-owned run artifact
- The user should not need to know the correct internal destination beforehand.

### Automatic flow creation

- When a task is complex, recurring, or cross-surface, the system should build an Agency Swarm flow automatically.
- The created flow should be inspectable and editable after creation.
- The user should be informed that the system is composing automation on their behalf.

### Scheduling and notifications

- Recurring jobs must support schedules, timing, and output cadence.
- Completion should notify the user in-app and by email.
- The system should support partial completion updates for multi-item jobs.

### Explainability and control

- Chat should explain what execution path it chose and why.
- The user should be able to review, adjust, pause, or stop generated automation.
- Sensitive actions should still respect approval and human-in-the-loop boundaries.

## Constraints

- Current product surfaces already exist and should be reused where possible.
- Existing feature flags and tenancy boundaries must remain enforceable.
- The design should be incremental; not all capability routing needs to ship at once.
