# Strict Real-LLM Review — Round 1

## Findings from the user's follow-up evidence

The earlier plan still allowed two behaviors that violated the new requirement:

1. a labelled deterministic/fallback skeleton could be returned;
2. the shared orchestrator could silently resolve a missing skill or executor to
   a generic path, while the router could turn an execution error into a saved
   preview.

## Fixes applied

- Removed all production fallback expansion behavior. Failure returns only a
  typed error and sanitized diagnostics.
- Added strict exact-skill execution to the orchestrator contract.
- Added preflight checks for manifest, slug, `execution_mode: llm-only`, schema,
  provider/model, and runtime source.
- Added required real-run evidence: provider/model/request or trace ID, executor,
  token usage marker, success, and `mocked: false`.
- Added stable user-facing failure codes and Thai/English recovery actions.
- Replaced plain-text/partial-success behavior with invalid-output failure.
- Added a non-mocked integration smoke test as a release acceptance gate.
- Added credit rules: no charge for preflight/no-LLM failures and reservation/
  void/refund handling for failed real calls according to provider billing.

## Result

The revised plan is fail-closed and meets the explicit “run real skill, never
fallback/mock, explain the problem” requirement.
