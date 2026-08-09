# Section 04 completeness review

## Result

PASS.

## Coverage

- Added trusted server-only character prompt context to sync/async image
  requests.
- Media payload builders omit `negative_prompt` entirely for target context and
  preserve the legacy mapping otherwise; the guard is idempotent and applies
  before both Python submission paths.
- Router transport branches already receive normalized prompts; MCP/Hermes
  paths do not reconstruct or append negative data.
- Target media audit entries now contain bounded contract telemetry only
  (`model_id`, family, profile, cap, prompt length, retry count, omission flag,
  and contract version); prompt, negative, and reference content is excluded.
- The shared audit sanitizer redacts prompt/negative/reference keys as a
  defense-in-depth guard for any non-target caller that reaches the logger.
- Target omission additionally requires a complete family/cap/profile tuple,
  not only a marker/version string, before removing the provider field.
- Optional contract/profile metadata and legacy negative data remain
  backward-compatible in approved snapshots and candidate visual-bible JSON.
- Approved/candidate snapshots retain bounded `semanticRetryCount`, so delayed
  renders do not report a false zero-retry diagnostic.
- No migration or destructive cleanup was introduced.

## Verification

- Target sync/async property-absence tests pass when run by name.
- Target Hermes/MCP property-absence tests pass.
- Approved snapshot tests cover legacy negative readability and current
  contract/profile round-trip behavior.
- Candidate-preview retry payload tests prove the selected image model is
  preserved across the client retry path.
- The full pre-existing `mediaGenerationService.test.ts` has 46 passing tests;
  3 failures are unrelated dirty-worktree baseline assertions for KIE endpoint
  metadata and persisted reserved-credit filtering.
- Full web typecheck was attempted; it remains blocked by unrelated dirty-
  worktree diagnostics, with no diagnostic on the changed Section 04 lines.
