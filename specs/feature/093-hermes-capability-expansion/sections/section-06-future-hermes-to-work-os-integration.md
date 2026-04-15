# Section 06 - Future Hermes To Work OS Integration

This is a follow-on integration slice for the case where Feature 082 is available and the product team wants Hermes to participate directly in Work OS intake, progression, and status updates.

## Purpose

Define how Hermes can act as a front-end assistant for Work OS without creating a parallel work model.

## Scope

- create canonical work requests from Hermes-assisted user intent
- update existing work cases and tasks through the Work OS boundary
- surface queue, approval, exception, and outcome state back to the Hermes UI in plain language
- preserve tenant isolation, audit attribution, and fail-closed routing

## Dependency Map

| Layer | Dependency |
|---|---|
| Feature 081 | Hermes external runtime and bridge |
| Feature 082 | Canonical Work OS model and APIs |
| Feature 093 sections 01-05 | Hermes UX, channel, memory, task-mode, and visibility layers |

## Required Guarantees

- Hermes must use Feature 082 APIs as the only source of truth for requests, cases, tasks, approvals, exceptions, outcomes, and queue state.
- Hermes must never maintain a separate work ledger, queue, or case tracker.
- If Hermes cannot safely determine the work target, it must route to triage instead of guessing.
- Any write must carry tenant scope and actor attribution.

## Suggested Acceptance Criteria

1. A Hermes-assisted request can create a canonical `work_request` and `work_case` through the Work OS API.
2. Hermes can update a `work_task` or `work_assignment` and the change appears in the canonical Work OS timeline.
3. Hermes can show the current work state in plain language without inventing separate status fields.
4. Unsafe or ambiguous targets are routed to triage.
5. No parallel queue, case, or approval storage is introduced by the Hermes integration.

