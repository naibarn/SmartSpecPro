# Section 03 - Registry Services And Resolution

## Objective

Implement the core service layer that creates registry records, publishes immutable versions, resolves eligible versions, and returns fail-closed explainability data.

## Scope

- Add a registry service module in `apps/web/server/services/`.
- Implement creation of registry identities and immutable version records.
- Implement selection logic that evaluates tenant, team, queue, workpack-family, rollout posture, and policy eligibility.
- Implement explainable rejection reasons when no version qualifies.
- Implement stable-pointer handling for the current approved version.

## Files Likely Changed

- `apps/web/server/services/agentRegistryService.ts`
- `apps/web/server/services/__tests__/agentRegistryService.test.ts`
- `apps/web/server/services/roleConfigurationService.ts` if compatibility helpers are needed
- `apps/web/server/services/workerDelegationService.ts` only if resolution output is consumed directly there

## Implementation Notes

1. Resolve registry identity first, then version selection.
2. Evaluate eligibility in a deterministic order so the same input always produces the same explanation.
3. Fail closed if the version set is empty, conflicting, or missing a required policy envelope.
4. Return enough metadata for admin inspection and audit logging, not just the final version ID.
5. Keep selection logic pure where possible so it is easy to test in isolation.
6. Wrap publish, freeze, and rollback in explicit transaction-safe transitions or equivalent concurrency guards.

## TDD Stubs

- Test registry creation writes the expected owner and scope fields.
- Test version publication creates a new immutable row and leaves the previous version intact.
- Test selection chooses the correct version when multiple eligible versions exist.
- Test selection fails closed when no version matches tenant or rollout criteria.
- Test selection explanation identifies the gate that blocked a candidate version.

## Completion Check

This section is done when the rest of the feature can ask for a registry version and receive a deterministic, explainable answer.
