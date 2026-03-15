# Iteration 1 Review Summary

## Improvements

### High

- Shared copy and state mapping must be a first-class deliverable, not implicit
  - Affected area: Chat, Agency, Workflow, Automation
  - Recommended action: create a shared browser-session presentation contract
  - Impact: high-impact

- Navigation return behavior must be standardized
  - Affected area: Automation wrapper and all origin surfaces
  - Recommended action: treat origin metadata as part of every launch flow
  - Impact: high-impact

- Workflow backward compatibility needs explicit planning
  - Affected area: Python node registry, executor semantics, saved workflows
  - Recommended action: require additive semantics and legacy-path verification
  - Impact: high-impact

### Medium

- Chat and Agency need structured browser-session summaries
  - Affected area: thread/activity rendering
  - Recommended action: define a lightweight summary schema
  - Impact: low-impact

- Rollout order should prioritize shared foundation before surface-specific UI work
  - Affected area: implementation sequencing
  - Recommended action: lock section order around foundation -> Chat -> Agency -> Workflow
  - Impact: low-impact
