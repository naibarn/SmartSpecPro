# Section 03 — Regression Proof

## Ownership

Own focused regression coverage and verification only; do not broaden the
implementation beyond failures proven by these tests.

## Targets

- adjacent image safety tests
- adjacent episode-cover/router/service tests
- `git diff --check`

## Acceptance checks

- Safe, rewritten, blocked, unavailable, tampered-marker, and old-state cases
  are covered.
- Hermes/normal prompt parity is asserted.
- Existing non-VD safety tests remain green.
- Focused tests pass and full-workspace baseline noise is reported separately.

## Known limits

No live provider replay, browser proof, deployment, or production refusal-rate
measurement is part of local implementation verification.

## Result

Focused web coverage passed 43/43 tests; Python coverage passed 10/10 and Ruff
passed. `git diff --check` passed. The full web typecheck did not finish within
the local window, and transport/provider parity was reviewed in code but not
replayed against live Hermes or an external image provider.
