# SPEC-207/280 Commercial Payment Normative Alignment

**Baseline:** `fafef70469dcf91c050cbfce1cab5d0bedf8a038` (`origin/main` at start)
**Scope:** SPEC-207 R6 section 202 and SPEC-280 revision 1.4 sections 24,
40, 41, 52, 53, 54, and 55.
**Mode:** Documentation only. No application code, provider credentials, live
payment, production data, or production migration was changed or exercised.

## Decisions and ownership

- SPEC-207 owns payer/funding selection, authorization, task and aggregate
  reservations, overdraft exposure, provider attempts, ledger postings,
  settlement, refund/reversal and reconciliation.
- SPEC-280 owns meter definitions and evidence, billability, pricing, immutable
  commercial snapshots and beneficiary allocation calculation. SPEC-207
  consumes and posts that exact versioned allocation; it does not recalculate
  the split.
- Existing prepaid Credits, top-up, `credit_transactions` and `creditService`
  remain a compatibility rail. PAYG does not require credit preloading and
  historical credit rows are not reinterpreted as a double-entry ledger.
- Fiat, x402, MPP, wallets/providers and settlement rails remain provider-neutral
  adapter capabilities. This documentation does not activate any route.
- SPEC-224 receives an optional typed economic admission interface only. Its
  scope, acceptance and Live Acceptance are unchanged. SPEC-014 was not edited.
- Canonical registry search found no existing payment-interoperability SPEC
  requiring a new ID. No new SPEC was proposed or numbered.

## Contract and acceptance coverage added

SPEC-207 section 202 defines the immutable commercial snapshot, payment request,
authorization, usage receipt and settlement fields; canonical state machine;
idempotency/hash conflict behavior; concurrency fencing and payer/tenant/task/
period caps; default-deny controlled overdraft; unknown outcomes and failover
protection; checkpoint/resume; refund and reconciliation; legacy-safe additive
migration and rollback constraints; security/compliance boundaries; and
deterministic mock/PostgreSQL end-to-end acceptance with balanced-ledger
invariants.

SPEC-280 revision 1.4 makes the producer-side snapshot, usage evidence,
billability decision, allocation, resume and settlement handoff concrete. The
older section 24 shorthand, section 40 ledger claims, section 52 reservation/
saga/root-budget wording, and section 53 diagram were corrected so they no
longer imply that SPEC-280 owns financial reservations or settlement.

## Verification

- Canonical source was checked at `fafef70469dcf91c050cbfce1cab5d0bedf8a038`
  before editing; development used a registered isolated task worktree.
- `python3 -m tools.spec_handoff reconcile --spec-dir ... --write` regenerated
  both requirement ledgers, manifests, histories and generated STATUS files
  against the new normative digests.
- `python3 -m tools.spec_handoff validate --all` reports no drift for these
  changes, but reports pre-existing SPEC-014 evidence SHA errors. SPEC-014 is
  outside this task and was not modified.
- `git diff --check` passed. No implementation or payment-flow tests were run
  because this checkpoint changes normative documentation only.

## Remaining implementation work

This update completes the normative contract clarification, not SPEC
implementation acceptance. Existing handoffs remain `PARTIAL_INTEGRATED`,
`VALIDATION_PENDING`, with `DORMANT_UNRESOLVED` registry disposition. The next
work is durable PostgreSQL persistence, source mapping from canonical SPEC-280
usage to the contract, disposable-PostgreSQL migration/rollback validation,
and process-restart deterministic mock acceptance including ledger invariants.
