# Implementation Plan — Unified Workspace UX R03

## Scope and source of truth
Task brief in `spec.md`; SPEC-277 (Task Control Experience) and SPEC-294 sections 61–65; existing Platform React chat shell, MissionControlPrototype page and canonical demo DTO fixtures. Platform source currently `c58886fb7d8f0275dd14e8415331b6118cf97e6c`; SmartSpecPro canonical baseline `4b8238bfdf4d5076bae191ffa2a190334fea0768`. Keep all unrelated SmartSpecPro changes intact.

## Requirement ledger
- UXR03-01 shared shell: unsatisfied in current prototype; current separate mock page, no persistent shell parity.
- UXR03-02 deep Task workbench: unsatisfied; current task view reuses mission execution list and summary.
- UXR03-03 fleet Mission view: partial; synthetic rows exist, but no proper grouping/session tabs/fleet hierarchy.
- UXR03-04 reusable evidence: partial DTOs, missing evidence depth.
- UXR03-05 explicit routing: unsatisfied; `/chat?view=...` is intercepted.
- UXR03-06 responsive/resizable/accessibility: partial drawers only; insufficient evidence.
- UXR03-07 workflows: unsatisfied.
- UXR03-08 deliverables: unsatisfied.

## Implementation order
1. Shared DEV shell, explicit routing and Chat non-interception regression.
2. Task Control project-first workbench and evidence dock/components.
3. Mission Control fleet model, grouping, session tabs and preserved inspector selection.
4. Focused test/build, viewport screenshots, requirement map/gap matrix/integration plan, durable handoff; deploy modular DEV if candidate and target proof pass.

## Safety
No backend writes, worker dispatch, task scheduler, Chat runtime changes, production release, database mutation, fabricated live state, or secrets. Use the designated modular DEV target only. Any blocked deployment remains distinct from source implementation.
