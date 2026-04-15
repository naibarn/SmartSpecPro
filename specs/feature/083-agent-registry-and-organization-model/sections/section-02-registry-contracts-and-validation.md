# Section 02 - Registry Contracts And Validation

## Objective

Define the shared TypeScript contracts that describe a valid governed agent manifest and a valid registry resolution result. These contracts should let the rest of the codebase validate inputs and reason about outputs without depending on ad hoc object shapes.

## Scope

- Add shared registry contract types and Zod schemas.
- Encode the required manifest fields from the spec:
  - purpose and supported work domains
  - tool classes and disallowed action classes
  - memory scope
  - budget policy
  - approval requirements
  - escalation triggers
  - rollout posture
  - owning team
  - model/prompt family compatibility
  - evaluation and comparison metadata
  - outcome-memory writeback hook
- Add schemas for registry creation, version creation, promotion review, resolution request, and resolution response.

## Files Likely Changed

- `apps/web/shared/agentRegistryContracts.ts`
- `apps/web/shared/__tests__/agentRegistryContracts.test.ts`
- `apps/web/shared/roleAgentContracts.ts` only if a compatibility bridge belongs there

## Implementation Notes

1. Keep registry contracts separate from role-agent contracts, but make them easy to adapt between each other.
2. Prefer compact, composable sub-schemas for policy, memory, rollout, and evaluation data.
3. Make the resolution result carry an explainable reason payload, not just a version ID.
4. Treat unsupported or unknown values as validation failures, not defaults.

## TDD Stubs

- Test that a valid registry manifest passes validation with all required fields present.
- Test that missing tool, memory, budget, or rollout fields fail validation.
- Test that unknown rollout states fail closed.
- Test that the resolution response includes selected identity, version, and reason data.
- Test that the registry contracts can round-trip a compatibility bridge for role-agent data.

## Completion Check

This section is done when other services can import the registry contract layer and rely on it as the canonical validation boundary.
