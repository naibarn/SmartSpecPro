# Decision Log - Feature 082 Work OS

## Plan Depth

- Chosen depth: `standard`
- Reason: the feature is cross-domain, but the codebase already has the core Work OS scaffold in place, so this phase is mostly hardening, completion, and regression coverage rather than greenfield design.

## Key Decisions

1. Keep `work_task` mapped to `team_work_items` for the first release.
2. Treat `work_request` and `work_case` as the canonical intake/case containers.
3. Keep the approval proxy path intact for now, but require Work OS linkage and local projection.
4. Treat desktop/offline work as attributed timeline evidence, not a second ownership store.
5. Preserve deterministic legacy projections even if a later physical backfill is added.
6. Treat external assistants and autonomous workers as callers of the same canonical boundary, with triage fallback when no safe target exists.
7. Keep `WorkRequest` and `MyRequests` as first-class Work OS surfaces for regular users, not separate one-off forms.

## Scope Boundaries

- In scope: plan and tests for the existing Work OS service boundary, operator projections, and guardrails.
- Out of scope: replacing workpacks, replacing role agents, or redesigning the whole UI.

## Open Risks

- The approval proxy still depends on the Python backend transport.
- Desktop/offline sync and artifact attribution need explicit implementation verification.
- Later backfill scripts should not alter the deterministic read projection contract.
