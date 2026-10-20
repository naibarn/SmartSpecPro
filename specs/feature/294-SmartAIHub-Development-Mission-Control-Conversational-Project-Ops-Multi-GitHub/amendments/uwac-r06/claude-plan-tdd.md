# Focused verification design

No new runtime tests were written or executed in this documentation phase. [acceptance.md](acceptance.md) contains Given/When/Then cases and required proof.

## 01 WP31 — work-profiles

Scope spoofed tenant/App/Project, missing Git, unrecognized version, retired type and duplicate correlation. One non-code report, one Skill, one authoring and one development-child fixture share canonical IDs without a second ledger.

Cases: `UW-02 UW-03 UW-09 UW-13 UW-28 UW-29 UW-32`. Start with pure fixtures where possible, then persisted authorized integration and rendered/target proof for actual behavior. Do not mirror implementation details or use static checks as production acceptance.

## 02 WP32 — event-projection

Out-of-order/duplicate events, source clock skew, missing history, expired token, unknown provider state and tenant revocation. Same token/scope yields same immutable claims; live mutable fields explicitly labelled.

Cases: `UW-09 UW-11 UW-12 UW-19 UW-20 UW-21 UW-23 UW-26 UW-27`. Start with pure fixtures where possible, then persisted authorized integration and rendered/target proof for actual behavior. Do not mirror implementation details or use static checks as production acceptance.

## 03 WP33 — unified-experience

Rendered functional checks at 390×844, 820×1180, 1440×900, keyboard and screen reader; output links, timeline expansion, disabled controls and stale/error recovery. Assert lens/device fact parity using token/scope, not screenshots alone.

Cases: `UW-01 UW-02 UW-13 UW-19 UW-20 UW-21 UW-22 UW-26 UW-27 UW-33`. Start with pure fixtures where possible, then persisted authorized integration and rendered/target proof for actual behavior. Do not mirror implementation details or use static checks as production acceptance.

## 04 WP34 — skill-invocation

Private/hidden/revoked/stale Skill offers, malformed input, unsupported provider, retired type, long-execution admission and duplicate invocation. Inspect canonical queue audit before invoking external tools.

Cases: `UW-05 UW-07 UW-10 UW-17 UW-18 UW-24 UW-28 UW-32`. Start with pure fixtures where possible, then persisted authorized integration and rendered/target proof for actual behavior. Do not mirror implementation details or use static checks as production acceptance.

## 05 WP35 — skill-authoring

No GitHub account fixture; unauthorized publish; failed eval; revoked version during wait; secret-bearing trace redaction; immutable release/repeatable eval and rollback.

Cases: `UW-06 UW-07 UW-08 UW-17 UW-18 UW-25 UW-32`. Start with pure fixtures where possible, then persisted authorized integration and rendered/target proof for actual behavior. Do not mirror implementation details or use static checks as production acceptance.

## 06 WP36 — delegation-controls

Three agents/two Skills with one failed child, duplicate/out-of-order returns, cycle/depth/budget escalation, cancelled parent, revoked route and provider disconnect. No silent paid fallback, double effect or double settlement.

Cases: `UW-09 UW-10 UW-11 UW-17 UW-18 UW-21 UW-22 UW-24 UW-29 UW-31 UW-32`. Start with pure fixtures where possible, then persisted authorized integration and rendered/target proof for actual behavior. Do not mirror implementation details or use static checks as production acceptance.

## 07 WP37 — artifact-evidence

Denied output dereference, expired link, changed external revision, attempted-but-unconfirmed send, missing QC and local-only artifact after device change. Read side never creates a retry/effect.

Cases: `UW-03 UW-04 UW-06 UW-12 UW-19 UW-23 UW-25 UW-26`. Start with pure fixtures where possible, then persisted authorized integration and rendered/target proof for actual behavior. Do not mirror implementation details or use static checks as production acceptance.

## 08 WP38 — development-source-release

Disposable repo tests for stale base, dirty sibling, ref drift, missing ancestor, unauthorized builder, mutable ref and digest mismatch. Inject CI/resource/build/health failure and verify bounded recovery/rollback receipts without deployment here.

Cases: `UW-14 UW-15 UW-16 UW-23 UW-29 UW-30 UW-34 UW-35 UW-36`. Start with pure fixtures where possible, then persisted authorized integration and rendered/target proof for actual behavior. Do not mirror implementation details or use static checks as production acceptance.

## 09 WP39 — cross-boundary-acceptance

Use representative fixtures and predeclared latency budgets; separate helper fixture results, persisted runtime, native/provider sessions, rendered UX, integration/build/deploy and production acceptance.

Cases: `UW-01 through UW-36`. Start with pure fixtures where possible, then persisted authorized integration and rendered/target proof for actual behavior. Do not mirror implementation details or use static checks as production acceptance.

Use quick/package/integration resource profiles and record revision, command/scope, time, capacity and outcome. No local npm run typecheck. Do not extend testing after scoped checks pass unless new changes/failures/remaining concerns justify it.
