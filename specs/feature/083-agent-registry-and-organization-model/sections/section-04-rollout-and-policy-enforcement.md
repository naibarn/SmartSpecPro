# Section 04 - Rollout And Policy Enforcement

## Objective

Enforce rollout posture, targeting rules, and policy-widening review gates. This section turns the registry from a data model into a governed control plane.

## Scope

- Implement rollout posture handling for `draft`, `shadow`, `canary`, `supervised`, `general`, and `frozen`.
- Implement tenant, team, queue, and workpack-family targeting.
- Enforce explicit review when tool scope, data scope, or budget widens.
- Preserve rollback-to-stable semantics.
- Make policy changes visible in audit and inspection flows.

## Files Likely Changed

- `apps/web/server/services/agentRegistryService.ts`
- `apps/web/server/services/agentRegistryPolicyService.ts` if policy logic is split out
- `apps/web/server/services/__tests__/agentRegistryService.test.ts`
- `apps/web/shared/agentRegistryContracts.ts`

## Implementation Notes

1. Do not let labels imply authority.
2. Treat rollout posture as a first-class eligibility filter.
3. Model widening changes as new immutable versions with review status, not as in-place edits.
4. Keep rollback simple: it should repoint to an already-approved stable version.
5. Prefer explicit enums and policy records over freeform booleans.

## TDD Stubs

- Test that each rollout state behaves as expected during eligibility checks.
- Test that a widened tool or budget scope requires review.
- Test that frozen versions cannot be promoted again without an explicit new version.
- Test that rollback preserves the previous stable version pointer.
- Test that targeting by tenant/team/queue/workpack-family is enforced independently of labels.

## Completion Check

This section is done when rollout posture and policy widening cannot be bypassed by the selection layer.
