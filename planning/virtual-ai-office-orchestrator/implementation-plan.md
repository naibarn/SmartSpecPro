# Implementation Plan

## Objective

Turn the current SmartSpec persona + agency + brainstorm + memory foundations into a coherent virtual office product where the user can orchestrate teams of virtual assistants.

## Current-Codebase Fit

The plan intentionally builds on:

- current persona infrastructure for identity and response style
- current agency schema/runtime for multi-agent execution
- current agency chat for participant and activity streaming
- current brainstorm runtime as a migration source
- current memory work as the base for scoped retrieval

## Main Workstreams

### 1. Identity And Team Model

- formalize user persona
- formalize assistant profile
- formalize team profile
- relate assistant profiles to agency agents

### 2. Memory Scopes

- add agent memory
- add team memory
- add room memory
- define retrieval order and promotion rules

### 3. Room Runtime

- support team rooms
- support automatic team rooms
- support sender/recipient/visibility semantics
- support milestone and summary views

### 4. Brainstorm Migration

- preserve current brainstorm entry points
- route them to team discussion presets
- deprecate brainstorm-specific hard-coding over time

### 5. Automation Integration

- standardize agent-triggered handoff contracts for workflow, presentation, video, browser, and agency execution

## Risks And Mitigations

### Memory Sprawl

Risk:

- too many memory scopes create noisy retrieval

Mitigation:

- strict retrieval ordering
- visibility boundaries
- TTL and promotion rules

### UX Complexity

Risk:

- users may feel overwhelmed by too many assistants

Mitigation:

- keep single-assistant chat simple
- use team presets
- default to summary view for automatic sessions

### Safety And Cost

Risk:

- autonomous teams can loop or overrun budget

Mitigation:

- reuse cross-agency guardrails
- add stop policies
- require approvals for risky actions

## Acceptance Summary

- team creation works
- team rooms exist
- assistant-private and shared memory are distinct
- brainstorm migrates to team discussion
- automation handoffs are inspectable

## Recommended Delivery Order

1. team domain model
2. memory scopes
3. room runtime
4. brainstorm migration
5. automation contracts
6. autonomous sessions
