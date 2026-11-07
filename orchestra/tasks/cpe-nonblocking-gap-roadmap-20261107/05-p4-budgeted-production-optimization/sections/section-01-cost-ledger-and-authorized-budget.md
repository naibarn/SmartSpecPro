# Section 01 — Cost Ledger and Authorized Budget

## Requirement IDs

CPE-15, NB-07

## Objective

Establish the authoritative forecast/reserve/settle/reconcile path using current credit and provider-task contracts, with no parallel balance or duplicate charge path.

## Owned paths

Existing pricing calculator and credit service, provider task reconciliation, canonical `worker_jobs`/outbox adapter, Feature 155 artifacts and focused accounting tests.

## Tasks

1. Reconcile Feature 155's canonical status and map every cost requirement to existing source, a source-backed gap or an explicitly unresolved owner decision.
2. Trace current estimate, reserve, debit, refund, provider task ID, idempotency key and ledger event ownership. Document which service is authoritative before adding fields or changing behavior.
3. Snapshot estimate inputs and ensure budget admission uses the existing explicit user/tenant limit and current configured provider/model.
4. Make reservation and settlement idempotent under concurrent calls, retries, webhook replay and worker restart.
5. Reconcile provider-accepted-but-locally-unknown operations before redispatch/refund; preserve cancellation and ownership semantics.
6. Keep cost/budget failures distinct from CPE quality warnings and prove no paid dispatch without valid authorization/reservation.

## Completion predicate

Focused tests show one authorized dispatch and one settlement per operation, no duplicate debit, no refund/retry before an unknown outcome is resolved, and explainable estimate/actual inputs.

## Prerequisites and fallback

Requires P0's hard-control taxonomy. If Feature 155's owner is ambiguous, stop only ledger-schema changes and record the exact registry/handoff evidence; continue read-only source mapping and non-mutating tests. Never fabricate applied migration history.

## Focused tests and evidence

Cover estimate snapshots, price drift, cap admission, concurrent reservations, duplicate request keys, duplicate webhooks, worker restart, provider-accepted/local-timeout ambiguity, cancellation, settlement and refund/reconciliation. Assert one authorized dispatch, one settlement, no duplicate debit, and no retry/refund before an unknown outcome is resolved.

## Unresolved assumptions

Confirm Feature 155's active canonical owner and the current source of truth for price version, reservation expiry, settlement, refund and provider-task identity. Schema or ledger changes wait for this reconciliation; ordinary generation keeps using existing billing controls meanwhile.
