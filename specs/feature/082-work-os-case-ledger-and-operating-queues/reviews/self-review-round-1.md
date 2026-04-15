# Self Review Round 1 - Feature 082 Work OS

## Findings

1. The first draft of the plan was clear on the additive storage model, but it did not explicitly state how pre-existing `team_work_items` would appear in the new Work OS timeline before a full backfill.
2. The first draft did not call out the existing approval proxy path strongly enough, which could have let the approval transport drift away from the canonical work record.
3. The TDD plan needed explicit tests for deterministic legacy projection and approval linkage so implementation would not leave those behaviors ambiguous.

## Fixes applied

- Added a deterministic legacy read-projection path for `team_work_items` in the canonical work model section.
- Added explicit approval linkage through the existing approval transport path.
- Updated the TDD plan and affected section files to require tests for projection determinism and approval-scoped linkage.

## Residual risk

- The rollout still depends on the exact schema details of the new tables and any compatibility backfill scripts, which will need to be validated during implementation.
- Desktop/offline sync, role-routine timeline joins, and external-agent triage fallback are now specified more explicitly, but they still need implementation-level verification to make sure the attributed timeline stays authoritative.
- The approval integration path will need close attention during implementation because the current router still proxies to the Python backend.
