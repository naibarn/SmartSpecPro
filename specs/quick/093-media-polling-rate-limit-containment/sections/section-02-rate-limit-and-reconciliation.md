# Section 02 — Rate Limit and Reconciliation

## Ownership

- `python-backend/app/core/middleware.py`
- focused Python middleware tests
- timeout-only hunk in `apps/web/server/services/mcpMediaAdapter.ts`
- `apps/web/server/services/__tests__/mcpMediaAdapter.reconciler.test.ts`

## TDD

Add claim-identity and media-type timeout tests first. Verified JWT claims are
the only authenticated identity source.

## Acceptance

- `sub`, `user_id`, and digested `openId` isolate authenticated buckets.
- Missing or invalid identity uses IP.
- Raw identifiers are not logged.
- Stale image tasks fail earlier than video tasks.

## Risks

This changes shared auth-adjacent middleware. Run focused security review and
ensure anonymous protection and signature verification remain intact.

## Implemented

- Added verified JWT identity normalization for numeric `sub`, legacy
  `user_id`, and digested `openId`.
- Added image/audio 2-hour hard timeouts while preserving the 24-hour video
  timeout.
- Verification: 5 Python identity/dispatch tests and 10 MCP reconciler tests
  pass. Inline security review found no auth bypass, IDOR, raw identifier, or
  secret exposure.
