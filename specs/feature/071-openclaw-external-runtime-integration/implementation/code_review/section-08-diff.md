# Diff Notes: Section 08 - Rollout, Migration, and Regression Matrix

- Kept `openClawExternalRuntime` tenant gating in the scheduler path instead of only at registration time.
- Added an operator kill switch for new OpenClaw dispatch without removing visibility, diagnostics, or fleet controls.
- Added regression coverage around the new rollout gates and preserved legacy unresolved-connector compatibility.
