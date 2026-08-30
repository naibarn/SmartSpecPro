# Section 04 — verification and gap closure

## Ownership

Focused tests, diagnostics, migration safety, and five explicit review rounds.

## Review rounds

1. Functional path coverage: prompt → plan → deep draft → dialogue repair → QC → script repair.
2. Billing correctness: every real call, exact slug/model, idempotency, no hidden reservation-only charge.
3. Persistence/reload: canonical bible, draft ledger, QC history, job checkpoint, and credit rows.
4. Failure safety: network/provider loss, schema-invalid response, insufficient credits, bounded repair exhaustion, and no fallback.
5. Regression/scope: model pin policy, tenant ownership, existing tests, UI labels, and unrelated dirty files.

## Acceptance checks

No unresolved must-fix gap remains after two consecutive review rounds without a meaningful auto-fix.
