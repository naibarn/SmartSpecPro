# Enhanced Prompt Budget Compaction

## Evidence ledger

- Source: user screenshot plus deterministic bridge reproduction.
- Identifier: `ENHANCED_VIDEO_PROMPT_BUDGET_EXCEEDED`; shot-9-style 4-character payload, three Thai dialogue lines, two character identity descriptions, and observed pose/gaze/hand facts.
- Observed failure: `_terminal_prompt` raised `VIDEO_PROMPT_BUDGET_EXCEEDED: protected prompt requires 4428 characters but target allows 4096`.
- Data state: no production request/job identifier or worker log was present in the screenshot; runtime row was not checked.
- Confidence: high for the local budget-overflow mechanism; production event payload not available to verify the exact failed prompt length.
- Root cause: compact output repeated custom identity descriptions in the global lock, cast map, dialogue map, first-speaker lock, and each timed line.

## Scope

Compact only the duplicate custom-identity wording while preserving canonical speaker IDs, identity descriptions, viewer positions for non-overridden cast, exact dialogue, and silent-listener rules. Do not alter full authored prompts or provider budget limits.

## Completion evidence

- Regression case failed before the change at 4,428 characters; after compaction it fits within 4,096 without losing canonical dialogue or speaker identity anchors.
- Focused Python bridge suite: 21 tests passed. One unrelated existing assertion (`test_compacts_repeated_speaker_and_listener_rules_within_grok_budget`) also fails on clean `origin/main` because compact prompts intentionally drop unbound action prose.
- Python compile check and `git diff --check` passed.
- Production behavior remains unverified until the integrated change is deployed and a real Enhanced generation succeeds.
