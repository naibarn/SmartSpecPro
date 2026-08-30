# Adversarial Self-Review — Round 1

## Attack 1: “The model still returns a generic story”

The plan now rejects copied/near-copied/generic-only output, checks story
minimums, and exposes partial/failure status. It does not promise that an LLM
will invent a good ending; it only promises that the UI will not call a weak
result a complete expansion. PASS.

## Attack 2: “The new treatment secretly becomes another Draft”

The plan prohibits scenes/dialogue/shot grids, keeps the architecture planner
out of preview, labels treatment versus Draft, and passes the approved object to
the existing Draft boundary once. PASS.

## Attack 3: “A stale or other-tenant treatment enters Draft”

The plan requires owner/tenant/run/status/hash/revision checks at apply and at
Draft handoff, with an atomic CAS and fail-closed stale behavior. PASS.

## Attack 4: “The parser catches malformed output by wrapping the original”

The plan explicitly removes this success path. A failed parse has a typed
failed/partial outcome; the original is retained only for recovery and is not
the generated treatment. PASS.

## Attack 5: “Non-story profiles are forced into romance fields”

The contract and quality gate are discriminated by profile, and section 01
defines separate minimums for review, documentary, news, and software review.
PASS.

## Attack 6: “Retry silently doubles credits”

The plan now requires one user-visible credit reservation/transaction for the
bounded preview operation and explicit tests for no extra deduction. PASS.

## Residual release-only risk

Live provider structured-output behavior, production credit ledger behavior,
database migration application, and authenticated browser behavior remain
release gates. They are not silently claimed by local tests.
