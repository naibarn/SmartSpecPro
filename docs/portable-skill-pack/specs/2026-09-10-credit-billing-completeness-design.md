# Credit billing completeness for skill execution

## Goal

Every user-triggered skill that performs billable LLM work must create one
idempotent credit transaction for its logical run and remain visible in Credit
History. Internal helper calls and media child jobs must not create an
additional charge when the parent skill owns the billing boundary.

## Design

- Use `settleSkillRun` as the single fixed-price skill billing boundary.
- Use a stable run id for queued jobs and the current execution trace for
  synchronous calls; retries must return the original settlement.
- Settle Vertical Drama emotion planning after both planning and critique
  calls succeed, with model/provider/token metadata.
- Settle marketplace server insight and description enrichment after the LLM
  result succeeds, with a request-scoped run id.
- Make Team/Auto-team's real execution path use `creditMode: "deduct"` for
  the parent skill. Keep `calculate_only` only for preflight/estimation.
- Do not add billing inside `executeSkillLlmWithFallback`; callers that are
  internal helpers remain owned by their parent execution boundary.
- Preserve existing media-child suppression and failure-refund behavior.

## Failure and idempotency

- Failed LLM calls do not settle a skill run.
- A successful run whose persistence step is retried uses the same run id and
  cannot be charged twice.
- A failed media child remains governed by its existing fixed-skill refund
  reconciler.

## Verification

- Add focused tests for each previously uncovered billing boundary.
- Run the focused web test set and read-only database integrity queries.
- Do not run repository-wide TypeScript checking because the environment has
  insufficient RAM.
