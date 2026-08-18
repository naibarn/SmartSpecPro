# Decision log

## Depth

`standard` quick-plan: the feature crosses schema, credit accounting,
registration, auth, background jobs, and Dashboard, but has one bounded policy
and no external API contract.

## Decisions

1. Store lifecycle timestamps on `users` rather than introducing a notification
   table. This makes the policy queryable and keeps daily notice idempotency
   cheap.
2. Track free grants explicitly through `addCredits`; do not infer ownership
   from current balance or descriptions.
3. Mark purchases as policy cancellation in the same transaction as the paid
   balance update.
4. Keep the existing job as a backstop and reuse one service for login and job
   enforcement.
5. Exclude `admin` and `system_agent` from automatic disablement.
6. Do not automatically reactivate disabled accounts after purchase.

## Self-review record

- Round 1: covered signup, invite, purchase, job, Dashboard, and stale-session
  paths; no auto-fix needed.
- Round 2: added explicit direct-email balance normalization and purchase
  transaction coupling.
- Round 3: added reset ledger/audit and deduction disabled guard.
- Round 4: added legacy backfill safety and no auto-reactivation constraint.
- Round 5: checked localization, daily UTC claim, and focused proof surfaces;
  no remaining plan gaps.
