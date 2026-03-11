# Section 02: Workflow And User Policy Model

## Goal

Introduce flexible user-level policy without breaking tenant safety boundaries.

## Scope

- preserve workflow entitlements as the workflow-specific safety layer
- add a dedicated user policy profile for narrow-only overrides
- define effective-policy merge rules

## Key Decisions

- workflow entitlements stay authoritative for workflow capability scope
- user policy may only narrow or personalize behavior
- security-relevant user policy should not live only in generic `userPreferences`

## Implementation Steps

1. Add `user_browser_policy_profiles`
2. Define supported user fields:
   - mode cap
   - allowed domain subset
   - blocked transfers
   - stricter approval preferences
   - preferred allowed model
   - notification config
3. Implement a shared effective-policy resolver:
   - platform x tenant x workflow x user
4. Reject any user write that widens the effective tenant/workflow policy
5. Expose the effective source of each restriction for audit and UI display

## Done When

- users can customize their own automation posture safely
- workflow owners still bound what a workflow may do
- effective policy is deterministic and explainable
