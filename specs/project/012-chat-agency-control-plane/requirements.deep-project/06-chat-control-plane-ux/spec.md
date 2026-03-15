# Spec: Chat Control Plane UX

## Goal

Design the Chat experience so users can understand, trust, and control the system as it routes work across capabilities and into Agency Swarm.

## In scope

- Explain chosen execution path in Chat
- Show “composing automation” or “escalating to Agency” states
- Confirm or edit generated automation when required
- Show downstream run artifacts, schedule summaries, and destination links
- Connect Browser Session and agency execution states back into a unified Chat narrative
- Treat the `Automation Program` as the primary user-visible thread rather than exposing raw subsystems independently
- Surface execution posture explicitly so users know whether the system will run immediately, create a draft, or wait for confirmation

## Existing anchors

- Chat page chrome and help surfaces
- Browser Session summary cards and return flows
- AgencyChat standalone UX

## Dependencies

- Requires `01-chat-intent-router`
- Requires `02-agency-handoff-contract`
- Should align with `05-recurring-execution-and-notifications`

## Provides to later splits

- User-facing control-plane surface
- Explainability and recovery UX
- Adoption path for unified entry into the platform

## Required output from deep plan

- A Chat-side status model derived from Automation Program state, not only raw agency/browser/media status
- UX rules for:
  - clarification requests
  - direct-run confirmation
  - draft review
  - recurring schedule review
  - failure recovery and rerun
- Navigation rules for when users stay in Chat versus when they deep-link into Presentation, Media, Browser Session, or Agency pages
- Explicit fallback UX for low-confidence or ambiguous routing

## Key decisions to make in deep plan

- When to show direct execution vs staged review
- How much UI should stay in Chat vs deep-link to downstream surfaces
- What level of automation explanation is necessary by default
- How to prevent the Chat surface from becoming overloaded while still being the universal front door

## Ambiguous routing UX

Deep plan should define the fallback path when routing confidence is low or multiple viable paths exist. At minimum it should cover:

- when Chat asks a clarifying question
- when Chat shows a small set of recommended execution options
- what the safe default path is if the user does not choose immediately
- how users manually override the chosen route without losing prior context
