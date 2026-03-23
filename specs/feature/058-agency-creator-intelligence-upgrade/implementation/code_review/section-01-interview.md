# Section 01 — Code Review Interview

## Triage Summary

| Finding | Severity | Decision | Rationale |
|---------|----------|----------|-----------|
| computer_use ignores feature flag | HIGH | Auto-fix (comment) | `_validate_spec` is sync; async flag check deferred to caller. Unconditional strip is safer default. |
| agencyCreateSchema strips objective/sharedInstructions | HIGH | Let go | Section-07 scope, not section-01 |
| MAX_DISCOVER_CALLS not enforced | HIGH | Auto-fix | Added retry-on-parse-failure loop bounded by MAX_DISCOVER_CALLS |
| _self_review_spec budget tracking | MEDIUM | Let go | Design phase budget is out of section-01 scope |
| Sanity check bounds in _self_review_spec | MEDIUM | Let go | Out of section-01 scope |
| Test call_args unsafe access | MEDIUM | Auto-fix | Replaced with `assert_called_once()` + direct kwargs access |
| objective fallback copies description | LOW | Let go | Acceptable for MVP; improvement advisor can handle |
| Test doesn't verify supportsFunctionTools | LOW | Let go | Marginal value |
| In-place mutation contract | LOW | Let go | Standard Python pattern |

## Auto-fixes Applied

1. **MAX_DISCOVER_CALLS enforcement**: Added retry loop in `_llm_discover()` that retries on JSON parse failure up to `MAX_DISCOVER_CALLS` times. Two new behavioural tests: `test_discover_budget_cap_retries_on_parse_failure` and `test_discover_budget_cap_falls_back_after_max_retries`.

2. **computer_use guardrail comment**: Added explanatory comment that `_validate_spec` is sync so cannot call `check_agentic_flag`; caller can re-enable after async check.

3. **Test call_args fix**: Replaced unsafe multi-path `call_args` fallback with `mock_call.assert_called_once()` + `mock_call.call_args.kwargs["system_prompt"]`.
