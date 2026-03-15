# Iteration 2 Self Review

## Findings

### High

1. Agency runtime execution had to be elevated from a code-review finding into a dedicated implementation section. Without that, the `browser_session` node would remain product-visible but operationally inert.
2. Browser stream rendering needed to be explicit in the plan. The previous documents described Browser Session as a shared capability, but not yet as a rendered remote viewport suitable for login or checkout tasks.
3. Human barrier semantics needed to distinguish captcha and commitment gates from generic user-input pauses. This is a safety boundary, not just a copy issue.

### Medium

1. Chat and Agency required a conversation-native launch model in addition to toolbar and reopen affordances.
2. Research and booking-style comparison output needed a normalized contract so browse-heavy tasks do not collapse back into free-text summaries.
3. The advanced automation slice needed separate rollout and scenario validation to avoid coupling risky behavior to the already-stable cross-surface baseline.

## Recommendations

- Add runtime execution and run-context persistence for Agency `browser_session`
- Add a stream renderer section before claiming support for browser-visible login or booking scenarios
- Add explicit barrier types for login, captcha, payment review, and booking confirmation
- Add structured comparison contracts for browse-and-compare tasks
- Add advanced rollout scenario validation as a dedicated terminal section
