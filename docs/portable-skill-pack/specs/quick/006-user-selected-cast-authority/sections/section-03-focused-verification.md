# Section 03 — Focused Verification

## Ownership

Own the final focused tests, diff review, and evidence report. Do not perform a
paid retry or production deployment.

## Checks

- Run the selected Vitest suites for shared cast, Start Frame, Legacy, Enhanced,
  and prompt-job wiring.
- Run the existing Python Enhanced bridge unit tests without live provider
  credentials.
- Run `git diff --check` and inspect only owned diffs plus test output.
- Confirm no episode JSON or media asset rows changed.

## Acceptance

- Mention-only characters cannot enter image/video visual cast.
- User-selected cast and explicit caller behavior are stable.
- Legacy and Enhanced agree on cast input.
- Extra narrative character refs do not block generation preparation.
- No credits/provider calls/production mutation are claimed.

## Browser evidence

No browser or paid-provider proof is required in this wave. If a later explicit
retry is requested, capture the resulting prompt/job evidence separately.
