# Section 01 — Contract Tests

Ownership: router custom-instruction tests and Character Visual Bible skill-content tests.

Write failing tests that inspect the final provider prompt, preview prompt, helper idempotence, changed-brief replacement, absent-input compatibility, and skill wording. Do not change production behavior in this section.

Acceptance: failures demonstrate the current flow-through-only gap rather than mock/setup errors.

Risk: existing mocks return a fixed portrait prompt; assertions must target provider submission rather than planner arguments alone.

## Implementation evidence

- RED: the first focused run failed 4 assertions: preview omission, direct-provider omission, approved-prompt omission, and stale owned-block replacement.
- Added pure builder coverage for idempotence, marker-like input encoding, and byte-for-byte no-brief compatibility.
- Added provider-payload assertions for the fallback and approved-prompt branches using the production Thai brief.
- GREEN: the focused custom-instruction suite passes 16/16 tests; the Character Visual Bible skill-content suite passes 51/51 tests.
