# 0408 SPEC-207/280 commercial bridge rollback

This migration is additive. Rollback disables callers/adapters for the new contract and resumes using existing Credits and invoice/payment paths. Keep the new tables and all rows intact while recovery/reconciliation is required.

Do not drop these tables as an operational rollback: authorization, usage, settlement, refund, and audit evidence may be needed to reconcile an unknown provider result. Table removal is a separately reviewed data-retention operation after every row is proven terminal and exported under the applicable retention policy.

No backfill runs in 0408. Existing `credit_transactions`, reservations, invoices, payments, attempts, webhook events, provider usage, and skill revenue settlements are neither altered nor reinterpreted. Initial account limits must be provisioned explicitly by a later authorized policy integration; absence of a configured limit fails closed.

Activation remains disabled until a durable transactional repository, provider onboarding/compliance review, shadow reconciliation, and sandbox acceptance are complete. This migration does not trigger deployment or any payment.
