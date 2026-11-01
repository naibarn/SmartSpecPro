# ADR — Agent-Native Payments, Independent Subscriptions, Prepaid + Bounded PAYG (R0.9)

**Decision (2026-11-01):** One required SmartSIHub platform account, one existing canonical SPEC-207 wallet/ledger, two independent subscription products, three funding modes plus multiple optional agent-commerce protocol adapters. Agents spend with prior scoped user delegation, never raw card/bank secrets. Production `smartsihub.com`, Dev `aimarkethubs.com`, existing database `smartspec`. Implement first and expose narrow user-test slices; financial correctness blocks only the unsafe transaction, not unrelated deployment.

## Account and subscriptions

```
SmartSIHub User Account (required, can be free)
├─ Platform Subscription (optional; recurring monthly credits + core tier)
├─ Mini App A Subscription (optional; only App A exclusive Skills included)
├─ Mini App B Subscription (optional; only App B exclusive Skills included)
├─ Single spendable wallet (purchased + period grants + earned; provenance retained)
└─ AgentSpendAuthority for linked Agents (per-capability, per-amount and time bounded)
```

Platform monthly credits are once-only for verified paid billing periods. Mini App recurring purchases are separate invoices and entitlements. Every shared Skill is metered, even inside a subscribed App. Do not create a second wallet, PSP, ledger or job state authority.

## Money mechanics

```
Human / Agent / Mini App / MCP / WebMCP
    -> Identity & delegated spending mandate
    -> Capability offer and pricing snapshot
    -> Quote (estimated units + buffer + max/extension policy)
    -> SPEC-207 atomic hold (wallet + class line - active holds)
    -> Worker_jobs admission + outbox
    -> Rust supervisor / Cloudflare Queue / Provider
    -> Verified actual usage and billing reconciliation
    -> Debit actual + release remainder + receivable if PAYG
    -> Credit revenue attribution: four roles, only against funded basis
```

Example only (not live tariff): estimated 1200, hold 1500, actual 870. Release 630. Two concurrent reservations see total active holds before either admits. No job may force balance past approved `-creditLineLimit`. An unknown provider outcome is reconciled before additional charge.

## Funding and payment adapters

**Prepaid:** PSP-verified top-up grants credits once. **Platform Subscription:** verified monthly period grants configured credits once. **Auto Top-up:** linked PSP payment method only under explicit bounded agent mandate; if provider requires human SCA, return handoff. **PAYG:** settle actual usage into wallet/debt, aggregate PSP collections by threshold/period and respect explicit User Class overdraft. No free borrowing because of registration or paid subscription alone. **Mini App Subscription:** plan covers original exclusive App Skills only and does not change wallet accounting for shared Skills.

Interop adapter families (all opt-in, capability verified): native HTTPS/MCP; OpenAI Agentic Commerce/Stripe Delegated Payments (merchant partner dependent); Google/Shopify UCP + AP2 verifiable mandates; optional Coinbase/Cloudflare x402 network payments; Visa Trusted Agent, Mastercard Agent Pay, Stripe SPT and supported local PSPs; existing Beam card/PromptPay + manual PromptPay. These are protocol/PSP capabilities at different layers, not one universal certified integration.

**Source references** (re-check live contracts before implementation):
- OpenAI ACP and merchant checkout: https://developers.openai.com/commerce/specs/checkout
- OpenAI delegated credentials: https://developers.openai.com/commerce/guides/key-concepts
- UCP: https://www.shopify.com/ucp and https://developers.googleblog.com/under-the-hood-universal-commerce-protocol-ucp/
- AP2: https://github.com/google-agentic-commerce/AP2
- Cloudflare x402: https://developers.cloudflare.com/agents/tools/payments/x402/ and https://developers.cloudflare.com/monetization-gateway/x402/
- Stripe PSP tokens: https://stripe.com/blog/supporting-additional-payment-methods-for-agentic-commerce
- Mastercard/Visa: https://www.mastercard.com/us/en/business/artificial-intelligence/mastercard-agent-pay.html and https://developer.visa.com/capabilities/trusted-agent-protocol

## Financial accounting nuance

Posting spendable four-role earnings before a PAYG payer pays the outstanding bill can mint unfunded value. Project pending accrual/role shares and release to verified recipient wallet on collection or explicitly approved guarantee. Credit top-up/Platform monthly grant is funding, not a four-role Skill revenue event. No cash withdrawal feature in this phase; preserve source and liability for future minimum-payout design. Versioned credit unit: 1 USD=10,000 v2, preserve all legacy 1,000 v1 value.

## Implementation choices and remaining verification

Prefer existing Beam/PromptPay payment orchestration first. Existing source includes `credit_reservation_snapshots`, `billingSubscriptions`, `payments`, `invoices`, `paymentAttempts` and `creditTransactions`, but this is **not confirmation of all deployed DB columns or live PSP support**. Verify actual catalog and provider grants. Use additive schema only for missing mandate, limit, grant-idempotency and receivable metadata. No duplicate wallet/risk/queue/PSP orchestrator. Platform paid plan limits and per-class overdraft values are not set in this draft; default credit line zero until explicit policy. Platform plan grant rollover policy and finance jurisdiction must be defined before charging customers, not before deploying unpaid UAT pages.
