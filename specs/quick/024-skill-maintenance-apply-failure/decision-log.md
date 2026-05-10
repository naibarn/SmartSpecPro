# Decision Log

## Planning Depth

- Decision: `standard` quick-plan.
- Reason: The task is a concrete bugfix plan with multiple runtime surfaces, but does not require a full feature spec or DB migration.
- Scope guard: Keep changes focused on path hygiene, proposal contract alignment, apply-run state, and UI diagnostics/recovery.

## Route

- Use Orchestra with `quick-plan-chain`.
- No sub-agents required for the planning artifact.
- Implementation should be sectioned so `deep-implement` can run it safely.

## Key Technical Decisions

1. Canonicalize ISC execution before changing UI.
   - Reason: UI retry/normalize cannot fix a task that keeps launching copied nested ISC code.

2. Treat copied workspace `runs/workspaces` paths as invalid execution roots for registry/executor resolution.
   - Reason: Workspace copies are artifacts, not source-of-truth skill definitions.

3. Keep historical normalization separate from root-cause fix.
   - Reason: Data repair before runtime repair can hide recurrence.

4. Support JSON proposal payloads explicitly before relying on auto-apply.
   - Reason: ISC plan notes and CLI code show proposal storage has moved away from legacy unified diffs.

5. Do not delete existing workspace artifacts automatically.
   - Reason: They may be needed for audit/debug; cleanup is a later maintenance task with backup rules.

## Self-Review Rounds

- Round 1: Added path-root cause because the screenshot path is stronger evidence than generic no-change failure.
- Round 2: Added proposal-format drift after finding `.diff` handling in `skillStudioService.ts` and JSON handling in ISC CLI.
- Round 3: Added task metadata/state consistency because screenshot shows no task ID on the failed row.
- Round 4: Added historical-data separation to avoid masking recurrence.
- Round 5: Added security/path traversal guardrails around proposal application and workspace root filtering.
- Round 6: No new blocking gaps found.
- Round 7: No new blocking gaps found.

