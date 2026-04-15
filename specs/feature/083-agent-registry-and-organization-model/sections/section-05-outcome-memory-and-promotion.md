# Section 05 - Outcome Memory And Promotion

## Objective

Add the learning loop for the registry: capture summarized outcome memory, create promotion review records, and use recent evidence to guide future selection when policy permits.

## Scope

- Implement outcome-memory persistence for completed runs.
- Capture workload class, selected version, selected model family, success outcome, failure mode, operator overrides, and next-step improvement notes.
- Implement promotion review records that compare a new version to the previous stable version.
- Implement the evidence-guided preference logic used only after eligibility and policy checks pass.

## Files Likely Changed

- `apps/web/server/services/agentRegistryService.ts`
- `apps/web/server/services/agentRegistryMemoryService.ts` if memory handling is split out
- `apps/web/server/services/__tests__/agentRegistryService.test.ts`
- `apps/web/server/services/__tests__/agentRegistryMemoryService.test.ts`

## Implementation Notes

1. Outcome memory is summarized evidence, not raw trace storage.
2. Keep memory tenant-scoped and registry-scoped.
3. Use the same workload-class vocabulary consistently in promotion, selection, and inspection APIs.
4. Preference based on evidence must never override a failing policy or rollout gate.
5. Promotion records should preserve the baseline used for comparison.
6. Treat memory redaction and retention as part of the write path, not an optional post-process.

## TDD Stubs

- Test that a completed run writes summarized outcome memory with the required fields.
- Test that outcome memory remains tenant-scoped and cannot bleed across registries.
- Test that a promotion record captures the baseline and comparison outcome.
- Test that evidence-guided preference only activates when policy allows it.
- Test that evidence never overrides a rollout or policy failure.

## Completion Check

This section is done when the registry can learn from outcomes without turning telemetry into an uncontrolled routing signal.
