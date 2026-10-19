# Agentic Commerce / Payment Interoperability Gap Review

**Review date:** 2026-10-19 (Asia/Bangkok)
**Review scope:** canonical registry, SPEC-207, SPEC-280, SPEC-224 interface boundary, and existing Agentic Commerce / Payment Interoperability documents.
**Change class:** documentation and canonical Spec Handoff only. No production payment flow, live payment route, schema, or data was changed.

## Registry and identity findings

- The configured canonical roots are `specs/feature`, `specs/quick`, `specs/project`, and `specs/security`; `docs/portable-skill-pack/specs` is an alternate/historical root.
- The canonical index identifies SPEC-207 (`specs/feature/207-agentic-economic-control-plane`) and SPEC-280 (`specs/feature/280-metered-capability-commerce-creator-economy-runtime-r1-0`). Their current registry authority/continuation assessments remain `UNRESOLVED` / `DORMANT_UNRESOLVED`; this review does not silently change those lifecycle decisions.
- SPEC-224 remains the development orchestrator. The contract added here is an optional typed economic interface only and adds no SPEC-224 work, acceptance, or runtime dependency.
- The registry's derived `next_safe_spec_ids` starts at 309, but repository search found no canonical SPEC-309 and no Agentic Commerce / Payment Interoperability SPEC-309 draft. The older PromptPay design is under the alternate portable-skill-pack root. No new SPEC number is needed: the normative ownership split fits SPEC-207 and SPEC-280.
- SPEC-206 is canonical A2A transport interoperability and already defines `billing-budget/v1`; it transports a budget envelope and is not a payment protocol, financial authorization, ledger, or settlement owner.

## Existing documents reviewed

- `specs/feature/207-agentic-economic-control-plane/spec.md` and its existing sections/hand-off artifacts: multi-wallet routing, budget envelopes, idempotency, provider adapters, internal Credits, ledger, settlement, reconciliation, postpaid accounts, expiry/orphan holds and acceptance criteria already form the financial foundation.
- `specs/feature/280-metered-capability-commerce-creator-economy-runtime-r1-0/spec.md`: metered capability commerce, price/revenue policy versions, immutable commercial snapshots, usage evidence, nested reservation, settlement saga, creator/tenant allocation and recovery/idempotency.
- `specs/feature/206-a2a-first-hybrid-external-agent-interoperability/spec.md`: A2A transport selection and the `billing-budget/v1` extension boundary.
- `specs/feature/239-External Personal Agent Interoperability/spec.md`: external agent calls already defer SmartAIHub credit reservation/settlement to SPEC-207 and retain foreign provider billing as estimated/out-of-band.
- `specs/quick/023-finance-payment-instruments/request.md` and its sections: private finance capture/instrument records; explicitly excludes payment processing and live bank reconciliation.
- SPEC-066 Beam adapter/webhook/payment-attempt section and SPEC-068 card method/consent section: existing provider-specific billing components remain adapters and require idempotent attempts, webhook verification and masked credentials.
- `docs/portable-skill-pack/specs/2026-08-18-promptpay-direct-payment-manual-slip-approval-design.md`: alternate-root design for a manual PromptPay credit top-up, not an agentic settlement authority.

## Gaps and ownership decisions

| Concern | Normative owner after update |
|---|---|
| Wallets, payer/funding-source selection, spending authorization, task reservation, overdraft exposure, payment attempts/protocol-provider-rail adapters, canonical ledger, capture/refund, settlement/payout accounting and reconciliation | SPEC-207 |
| Usage-meter definitions/receipts, capability/service pricing, billable usage decision, immutable commercial snapshot and marketplace/creator/tenant revenue-sharing policy and allocation calculation | SPEC-280 |
| A2A task transport and optional budget-envelope exchange | SPEC-206; no payment authority |
| Development run lifecycle, Runner execution and Live Acceptance | SPEC-224; unchanged |

Conflicts corrected: (1) SPEC-207's old generic claim to compute revenue splits now defers commercial calculation to SPEC-280 while retaining ledger postings and payout accounting; (2) SPEC-280's vague payment/ledger owner now explicitly points to SPEC-207; (3) SPEC-206's shared-platform billing label and budget extension now state their transport-only scope.

Newly explicit contract points include Credits compatibility alongside no-top-up fiat PAYG, provider-neutral adapters, task-scoped reserve/caps with concurrency fencing, bounded opt-in overdraft defaulting to zero, immutable/deduplicated usage settlement, checkpoint/resume without duplicate effects, unknown-outcome reconciliation before route fallback, idempotent partial refunds, additive migration/rollback gates, jurisdiction/provider compliance review, and explicit non-activation.

## Next development handoff

1. **SPEC-207 work unit:** reconcile the current implementation/schema/provider inventory to `CommercialPaymentRequest` / `CommercialPaymentReceipt`; design additive payment-attempt, reservation and usage-settlement references against existing Credits, billing and `worker_jobs`/outbox authorities. Do not write migrations or enable provider execution until the design and rollback plan are reviewed.
2. **SPEC-280 work unit:** map existing meter/usage evidence and immutable commercial snapshots to SPEC-207's request/receipt; define billability, cumulative task caps and creator/tenant allocation snapshots. Preserve the separate creator-earnings and usage-credit balances.
3. **Shared verification work unit:** prove idempotency and concurrent-cap invariants with non-production adapters and deterministic fixtures; exercise timeout/unknown outcome, checkpoint resume, partial failure/refund and reconciliation paths. Do not depend on SPEC-224 acceptance or alter its workstream.
4. **Activation remains a separate future decision:** jurisdiction/provider obligations, credentials, route limits, operational monitoring, rollback and any production authority must be established before live charging. This document grants no such authority.

## Verification performed

- Read canonical config/index/ID registry and checked exact canonical records for 207, 224 and 280.
- Targeted repository file/content searches covered `SPEC-309`, `agentic commerce`, `payment interoperability`, `agent-to-service`, `pay-as-you-go` and relevant payment/provider terms. No matching canonical SPEC-309 draft was found.
- Documentation self-review checked the ownership table, SPEC-224 non-expansion, existing Credits compatibility, and no-live-payment boundary.
- No runtime tests were run because this change is documentation-only; the canonical handoff/index validation is recorded after update.
