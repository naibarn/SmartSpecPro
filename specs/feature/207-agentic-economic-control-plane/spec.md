# Spec 207 — SmartAIHub Agentic Economic Control Plane
## Multi-Wallet Portfolio, Agentic Payments, Policy Routing, Financial Calendar, Settlement & Revenue Infrastructure

**Status:** Draft for implementation — Revision R4 plus 207–210 repository convergence audit completed 2026-09-19  
**Target:** Q4 2026 foundation → production maturity throughout 2027  
**Spec ID:** 207  
**Suggested path:** `specs/feature/207-agentic-economic-control-plane/spec.md`  
**Primary owner:** SmartAIHub Core / Economic Infrastructure  
**Implementation status:** Target architecture; current repository provides the existing Credits rail and partial control-plane building blocks, not the complete Spec 207 ledger.  
**Companion specifications:** Feature 195, Feature 196, Feature 197, Spec 199, Spec 200, Spec 206, Spec 208, Spec 209, Spec 210  
**Compatibility lineage:** Spec 186 remains relevant only where its contracts are still deployed; Feature 195 is the current execution authority.  
**Architecture principle:** SmartAIHub owns the canonical economic model. External wallets, payment protocols, providers, networks, and commerce standards are adapters—not the source of truth.

**R3 audit note:** Revision R2 completed the first 10-pass architecture audit. Revision R3 adds a second independent 10+ pass production-readiness audit covering multi-region consistency, provider-contract drift, credential lifecycle, account/offboarding lifecycle, disputes and reserves, provider quotas/circuit breakers, retention/legal hold/data residency, reconciliation deduplication, tax/documentation boundaries, separation of duties, calendar import deduplication, stale-balance safety, margin protection, postpaid credit risk, and wallet rebalancing. Sections 163 onward are normative.  

---

# 1. Executive Summary

SmartAIHub already has a working economic model centered on prepaid credits:

1. User funds the account through existing payment methods such as PromptPay, cards, or payment gateways.
2. Funds are converted into SmartAIHub Credits.
3. Skill / model / service usage deducts credits.
4. Revenue is distributed according to SmartAIHub revenue-sharing rules.

This model must remain fully supported.

Spec 207 extends the existing system into a general-purpose **Agentic Economic Control Plane** capable of supporting:

- human users,
- internal SmartAIHub agents,
- external agents,
- MCP clients,
- A2A agents,
- Skills,
- Workflows,
- partner services,
- third-party APIs,
- multiple wallets,
- multiple payment providers,
- multiple currencies,
- machine-to-machine payments,
- scheduled payments,
- subscriptions,
- project budgets,
- delegated spending,
- revenue sharing,
- settlement,
- reconciliation,
- cost optimization,
- and financial planning.

The system must allow one user, organization, tenant, project, or agent to have multiple connected funding sources and wallets. It must determine which source should be used for each economic event based on policy, cost, availability, balance, risk, currency, timing, and user preference.

Spec 207 must not assume that a single protocol, wallet provider, or payment network becomes dominant in 2027.

The core must therefore be **provider-neutral, protocol-neutral, wallet-neutral, currency-neutral, and transport-neutral**.

---

# 2. Problem Statement

The existing prepaid-credit system is excellent for high-frequency internal transactions, but it does not fully solve emerging agentic use cases.

Examples:

- An external agent wants to purchase a SmartAIHub capability without manually creating and funding a SmartAIHub account.
- A SmartAIHub agent needs to purchase an external capability during autonomous execution.
- A user wants to delegate a budget to an agent.
- A user has multiple wallets and wants SmartAIHub to choose the cheapest eligible wallet.
- A primary wallet does not have enough balance and a fallback wallet should be used.
- A transaction should not occur until a particular date.
- A future scheduled agent job will consume money and should appear in the financial forecast before execution.
- A user wants to see upcoming subscriptions, settlements, payouts, reserved budgets, and agent spend in a calendar.
- A tenant needs to restrict which wallets or payment rails its users may use.
- SmartAIHub needs to batch or net settlements to avoid excessive transaction fees.
- The same economic event may be paid through SmartAIHub Credits, a card-backed provider, a bank rail, a stablecoin rail, or a future wallet.
- A payment protocol may change without SmartAIHub changing its business model or ledger.

The existing payment system therefore must evolve from:

```text
Funding
  ↓
Credits
  ↓
Usage
```

into:

```text
Funding Sources / Wallet Portfolio
              ↓
      Economic Control Plane
              ↓
Policy → Quote → Route → Reserve
              ↓
            Usage
              ↓
Capture → Ledger → Revenue Split
              ↓
 Settlement / Reconciliation / Forecast
```

---

# 3. Goals

## 3.1 Primary goals

Spec 207 SHALL provide:

1. A canonical SmartAIHub economic model.
2. Backward-compatible support for the existing Credits system.
3. Multi-wallet and multi-provider support per user.
4. Multiple accounts per provider.
5. Wallet-specific policies.
6. User-defined wallet priority.
7. Cost-aware wallet and payment routing.
8. Safe fallback to alternate funding sources.
9. Delegated agent spending.
10. Budget envelopes per user / tenant / project / agent / job.
11. Quote, reserve, capture, release, refund, reversal, and dispute primitives.
12. Double-entry ledger accounting.
13. Multi-currency support.
14. Revenue sharing.
15. Settlement batching and netting.
16. Financial Calendar.
17. Cash-flow forecast.
18. Recurring obligations and subscription tracking.
19. Scheduled economic events.
20. Projected agent-job cost visibility.
21. Cost optimization recommendations.
22. Full auditability and explainable routing.
23. Reconciliation across providers.
24. Emergency spending controls.
25. Adapter support for emerging 2027 agentic payment, authorization, trust, wallet, and commerce standards.

## 3.2 Strategic goal

By the end of 2027, SmartAIHub should be able to act as:

- a buyer of external capabilities,
- a seller of internal capabilities,
- a marketplace,
- a payment orchestrator,
- a delegated-spending controller,
- a financial planning interface,
- and an economic interoperability layer for autonomous agents.

---

# 4. Non-Goals

Spec 207 SHALL NOT:

1. Replace all existing payment gateways immediately.
2. Require users to adopt crypto or stablecoins.
3. Require every tool call to trigger a real financial settlement.
4. Make Cloudflare Wallets, Stripe, PayPal, x402, MPP, AP2, ACP, UCP, or any other provider/protocol the canonical business model.
5. Store raw card data unless explicitly required and compliant.
6. Expose private keys, card numbers, bank credentials, or wallet seeds to agents.
7. Allow workers/runners to directly control financial credentials.
8. Duplicate approval, audit, job, or capability systems owned by companion specs.
9. Treat every failed payment as safe to retry through another wallet.
10. use floating-point numbers for monetary accounting.

---

# 5. Companion Spec Ownership

## 5.1 Feature 195 — Unified Async Job Control Plane

Owns:

- `worker_jobs`
- `worker_job_events`
- queue adapters
- lease / heartbeat
- retry / idempotency for job execution
- watchdog
- worker progress
- execution state

Spec 207 integrates economic authorization with jobs but does not replace job control.

Spec 186 is compatibility lineage for deployments that still expose its
contracts. It MUST NOT override Feature 195 or create a second Job authority.

### 5.1.1 Feature 196 — Universal Goal Orchestration

Feature 196 owns Goal/Plan semantics, capability requirements, route constraints,
user/tenant execution preferences and plan-level budget intent. Spec 207 owns
economic authorization and accounting; it MUST consume the approved economic
intent boundary rather than reimplement Goal/Plan persistence or planning.

### 5.1.2 Feature 197 — Runner Adaptive Execution Fabric

Feature 197 owns Runner identity, local capability reality, local execution
control, leases/fencing and Runner provenance. Spec 207 may authorize economic
effects associated with Runner work but MUST NOT send raw wallet credentials or
create a finance-owned Runner/device control path.

### 5.1.3 Spec 208 — Hybrid Computer Use

Spec 208 owns browser/desktop interaction semantics, route fallback/upgrade,
human takeover and UI-side verification. A Computer Use action may prepare an
economic interaction, but final authorization/finality remains Spec 207-owned.

### 5.1.4 Spec 209 — AI Workflow Studio

Spec 209 owns workflow definitions, workflow-version publication, Marketplace
entitlements and workflow-level economic presentation. It MUST emit immutable
economic facts and invoke Spec 207 for quote, reservation, authorization,
capture, refund, dispute and settlement semantics. Spec 207 MUST NOT create a
workflow-owned ledger or reinterpret workflow presentation as financial finality.

### 5.1.5 Spec 210 — Orca Runtime Adapter

Spec 210 owns the Orca/CLI runtime adapter under Spec 200 and the runtime
selection path under Spec 206. Orca execution MAY produce usage and cost facts,
but it MUST use Spec 207's economic authorization and settlement boundary. Spec
210 MUST NOT receive raw payment credentials or create a second economic ledger,
reservation store or settlement queue.

## 5.2 Spec 199 — External MCP Gateway

Owns:

- external MCP registration
- MCP discovery
- MCP tool invocation
- external MCP transport
- MCP-side capability exposure

Spec 207 provides pricing, authorization, payment, budget, and ledger services for paid MCP capabilities.

## 5.3 Spec 200 — External Agent Gateway

Owns:

- external agent registration
- agent invocation
- Runner-based external agent execution
- fallback mechanisms for agents that do not support A2A

Spec 207 governs spending and payment associated with these invocations.

## 5.4 Spec 206 — A2A Interoperability

Owns:

- A2A capability detection
- A2A task invocation
- A2A-compatible agent interoperability
- fallback to Spec 200 when A2A is unavailable

Spec 207 provides economic negotiation and payment independent of whether the interaction uses A2A or fallback execution.

## 5.5 Spec 207 — Economic Control Plane

Owns:

- Economic Intent
- Quotes
- Budgets
- Wallet portfolios
- Wallet connection registry
- delegated spending
- economic authorization
- payment routing
- reservations
- captures
- refunds
- ledger
- settlement
- revenue sharing
- financial calendar
- financial forecast
- reconciliation
- fee optimization
- payment/commerce/wallet protocol adapters

---

# 6. Core Architecture Principles

## 6.1 Canonical model first

SmartAIHub SHALL own canonical entities such as:

- EconomicIntent
- EconomicActor
- WalletConnection
- FundingSource
- Quote
- BudgetEnvelope
- SpendingMandate
- PaymentIntent
- FundingPlan
- PaymentAttempt
- Reservation
- Capture
- Refund
- Reversal
- EconomicEvent
- LedgerEntry
- Settlement
- RecurringObligation
- FinancialCalendarEvent
- RevenueSplit
- ReconciliationRecord

External provider models SHALL be mapped into these entities.

## 6.2 Protocols are adapters

Examples:

- x402
- MPP
- AP2-class delegated authorization
- UCP
- ACP
- Visa TAP-class trust
- future standards

The core SHALL NOT encode protocol-specific business assumptions.

## 6.3 Wallets are adapters

Examples:

- SmartAIHub Credits
- Cloudflare Wallet-compatible provider
- provider-backed wallet
- card credential wallet
- bank funding source
- stablecoin wallet
- tenant wallet
- corporate wallet
- future provider

## 6.4 Usage transaction ≠ real settlement

Every use of a paid capability may generate an `EconomicEvent`.

It SHALL NOT automatically imply one external financial transaction.

High-frequency economic events SHOULD be aggregated through the internal ledger and settled efficiently.

---

# 7. High-Level Architecture

```text
 HUMAN / INTERNAL AGENT / EXTERNAL AGENT / MCP / A2A / API
                              │
                              ▼
                     Capability Resolver
                              │
      ┌───────────────────────┼────────────────────────┐
      ▼                       ▼                        ▼
    Skill                   MCP Tool                 Agent
                           Spec 199              Spec 200/206
      │                       │                        │
      └───────────────────────┼────────────────────────┘
                              ▼
                       Economic Intent
                              │
                     ┌────────┴────────┐
                     ▼                 ▼
                 Quote Engine      Policy Engine
                     │                 │
                     │        Budget / Mandate / Trust
                     └────────┬────────┘
                              ▼
                        Route Optimizer
                              │
               ┌──────────────┼──────────────┐
               ▼              ▼              ▼
          Internal Rail      x402           MPP
               │              │              │
               └──────────────┼──────────────┘
                              ▼
                       Wallet Portfolio
                              │
       ┌──────────────────────┼─────────────────────┐
       ▼                      ▼                     ▼
 SmartAIHub Credits      Wallet Provider       Card / Bank
                              │
                              ▼
                         Reservation
                              │
                              ▼
                           Execute
                              │
                         worker_jobs
                              │
                              ▼
                     Capture / Release
                              │
                              ▼
                     Double-entry Ledger
                              │
          ┌───────────────────┼──────────────────┐
          ▼                   ▼                  ▼
        Cost               Revenue              Fees
                              │
                              ▼
                       Revenue Sharing
                              │
                              ▼
                     Settlement Engine
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
             Now             Batch            Net
                              │
                              ▼
                       Reconciliation
```

Financial planning runs in parallel:

```text
Scheduled Jobs ──────┐
Subscriptions ───────┤
Reserved Budgets ────┤
Invoices ────────────┤
Expected Revenue ────┤
Settlements ─────────┤
Payouts ─────────────┤
Planned Top-ups ─────┤
Predicted Agent Cost ┘
          │
          ▼
   Financial Calendar
          │
          ▼
   Cash-flow Forecast
          │
          ▼
 Liquidity / Risk Alerts
          │
          ▼
  Funding / Routing Advice
```

---

# 8. Economic Actors

The system SHALL normalize actors.

Supported actor types:

- USER
- TENANT
- ORGANIZATION
- PROJECT
- INTERNAL_AGENT
- EXTERNAL_AGENT
- MCP_CLIENT
- A2A_AGENT
- APPLICATION
- SERVICE
- SKILL_OWNER
- PLUGIN_OWNER
- PARTNER
- PLATFORM

Example:

```yaml
actor:
  type: INTERNAL_AGENT
  id: agent_video_producer_01
  principal_user_id: usr_123
  tenant_id: tenant_001
```

---

# 9. Economic Intent

Every paid or potentially paid execution SHOULD begin with an `EconomicIntent`.

Example:

```yaml
economic_intent:
  id: ei_123
  actor_id: agent_video_producer_01
  principal_id: usr_123

  capability:
    type: skill
    id: video.generate

  purpose:
    project_id: project_100
    job_id: null
    description: "Generate hero video"

  budget:
    preferred_currency: THB
    maximum_amount: 150.00

  constraints:
    deadline: "2026-09-20T18:00:00+07:00"
    required_quality: production
    allow_external_payment: true

  status: DRAFT
```

### 9.1 EconomicIntent states

- DRAFT
- QUOTING
- QUOTED
- POLICY_PENDING
- APPROVAL_REQUIRED
- AUTHORIZED
- RESERVED
- EXECUTING
- CAPTURE_PENDING
- COMPLETED
- CANCELLED
- FAILED
- EXPIRED

---

# 10. Wallet Portfolio

## 10.1 Core model

Each user SHALL be able to own or access multiple `WalletConnection` records.

Example:

```text
User
 └── Wallet Portfolio
      ├── SmartAIHub Credits
      ├── Company Wallet
      ├── Personal Wallet
      ├── Card-backed Provider
      ├── Bank / PromptPay Source
      ├── Stablecoin Wallet
      └── Future Provider
```

A user MAY connect multiple accounts from the same provider.

Example:

```text
Provider X
├── Personal Account
└── Company Account
```

## 10.2 WalletConnection fields

Minimum fields:

```yaml
wallet_connection:
  id: wc_001
  owner_type: USER
  owner_id: usr_123

  provider_id: provider_x
  provider_account_ref: external_ref
  display_name: "Company Wallet"

  wallet_type: PROVIDER_WALLET
  status: ACTIVE

  priority: 20

  supported_currencies:
    - THB
    - USD

  capabilities:
    realtime_balance: true
    reserve_capture: true
    refund: true
    recurring: true
    machine_payment: true

  policy_id: wp_001

  created_at: ...
  updated_at: ...
```

## 10.3 Wallet status

- ACTIVE
- DEGRADED
- REAUTH_REQUIRED
- FROZEN
- DISABLED
- CLOSED
- PROVIDER_DOWN

---

# 11. Wallet Capability Profile

Each wallet/provider SHALL expose a normalized capability profile.

```yaml
wallet_capability_profile:
  currencies:
    - USD
    - THB

  payment_types:
    - one_time
    - recurring
    - machine_payment

  supports:
    balance_query: true
    authorization: true
    reserve_capture: true
    partial_capture: true
    refund: true
    partial_refund: true

  limits:
    min_transaction: 0.01
    max_transaction: 5000
```

Routing SHALL use these capabilities before selecting a wallet.

---

# 12. Wallet Priority

Users SHALL be able to define a default ordered priority.

Example:

```text
1. SmartAIHub Credits
2. Company Wallet
3. External Wallet
4. Credit Card
5. Bank
```

Priority SHALL be stored independently from routing strategy.

The user MAY override priority:

- globally,
- by tenant,
- by project,
- by agent,
- by category,
- or for a one-time transaction.

---

# 13. Routing Strategies

Supported strategies SHALL include:

- PRIORITY_FIRST
- LOWEST_EFFECTIVE_COST
- HIGHEST_RELIABILITY
- FASTEST_SETTLEMENT
- PREFER_INTERNAL_CREDITS
- PREFER_FIAT
- PREFER_SPECIFIC_CURRENCY
- PRESERVE_CASH
- SMART_BALANCED
- CUSTOM_RULES

## 13.1 Smart Balanced

Default recommended strategy.

Example weighted score:

```text
route_score =
  cost_score       * W_cost
+ reliability      * W_reliability
+ liquidity_score  * W_liquidity
+ latency_score    * W_latency
+ policy_score     * W_policy
```

Weights SHALL be policy-configurable.

---

# 14. Effective Cost Calculation

Routing SHALL use effective cost, not only nominal price.

```text
Effective Cost =
Base Service Cost
+ Provider Fee
+ Network Fee
+ Wallet Fee
+ FX Cost
+ Settlement Fee
+ Applicable Tax
+ Expected Failure Cost
+ Optional Latency Penalty
+ Optional Liquidity Penalty
```

The system SHALL retain a breakdown for explainability.

Example:

```yaml
route_estimate:
  wallet_id: wc_001

  service_cost: 20.00
  provider_fee: 0.30
  network_fee: 0.02
  fx_cost: 0.10

  effective_cost: 20.42
```

---

# 15. Policy Hierarchy

Policies SHALL be layered.

```text
Platform
   ↓
Tenant
   ↓
Organization
   ↓
User
   ↓
Project
   ↓
Agent
   ↓
Wallet
   ↓
Transaction
```

Lower levels MAY become more restrictive.

Lower levels MUST NOT weaken mandatory restrictions imposed by higher levels.

Example:

Tenant policy:

```text
Stablecoin disabled
```

User policy cannot enable stablecoin.

---

# 16. Wallet Policy

Each wallet MAY define:

- allowed categories
- denied categories
- allowed merchants
- denied merchants
- allowed capabilities
- transaction limit
- daily limit
- weekly limit
- monthly limit
- minimum reserve
- approval threshold
- allowed currencies
- allowed payment protocols
- allowed execution contexts
- external agent access
- auto-top-up eligibility
- fallback eligibility
- fallback priority
- expiry rules
- usage schedule

Example:

```yaml
wallet_policy:
  wallet_id: wc_company

  allow_categories:
    - AI_API
    - CLOUD
    - SMARTAIHUB_SKILL

  deny_categories:
    - SHOPPING
    - TRAVEL

  limits:
    max_transaction: 500
    daily: 3000
    monthly: 50000

  approval:
    require_above: 1000

  fallback:
    allowed: true
```

---

# 17. Delegated Spending and Agent Mandates

An agent MUST NOT receive unrestricted access to wallets.

SmartAIHub SHALL issue a scoped `SpendingMandate`.

```yaml
spending_mandate:
  id: mandate_001

  principal:
    type: USER
    id: usr_123

  delegate:
    type: INTERNAL_AGENT
    id: agent_video_01

  capabilities:
    - image.generate
    - video.generate
    - audio.generate

  categories:
    - AI_API
    - SMARTAIHUB_SKILL

  budget:
    max_per_transaction: 50
    max_per_job: 300
    max_per_day: 1000

  approval:
    require_above: 100

  validity:
    starts_at: ...
    expires_at: ...

  status: ACTIVE
```

## 17.1 Mandate requirements

- cryptographically bindable where supported,
- revocable,
- versioned,
- auditable,
- scope-limited,
- time-limited,
- budget-limited,
- capability-limited.

## 17.2 External authorization adapters

Future adapters MAY map a SmartAIHub mandate into:

- AP2-style mandates,
- verifiable intent formats,
- provider-specific delegated payment tokens,
- future authorization protocols.

SmartAIHubMandate remains canonical.

---

# 18. Budget Envelopes

Budget SHALL be independent from wallets.

Example:

```text
Marketing Campaign — 10,000 THB
├── Research     1,000
├── Images       2,000
├── Video        5,000
├── Voice          500
└── Editing      1,500
```

Supported dimensions:

- User
- Tenant
- Organization
- Project
- Agent
- Job
- Capability
- Category
- Time period

Budget states:

- PLANNED
- ACTIVE
- RESERVED
- EXHAUSTED
- CLOSED
- CANCELLED

---

# 19. Quote Engine

Paid capabilities SHALL support one or more pricing models:

- fixed
- per call
- per token
- per second
- per GPU second
- per image
- per audio minute
- per video minute
- per job
- subscription
- tiered
- dynamic quote
- outcome-based
- negotiated

Example quote:

```yaml
quote:
  id: quote_100

  economic_intent_id: ei_123

  min_amount: 38.00
  max_amount: 45.00
  currency: THB

  expires_at: ...
  provider_id: provider_x

  cost_breakdown:
    inference: 30.00
    platform_fee: 5.00
    estimated_network_fee: 1.00
    estimated_tax: 2.00
```

Quotes SHALL have expiration.

Before executing a delayed/scheduled job, stale quotes MUST be refreshed.

---

# 20. Reserve / Capture / Release

The preferred execution lifecycle:

```text
Quote
 ↓
Authorize
 ↓
Reserve
 ↓
Execute
 ↓
Capture
```

Failure:

```text
Reserve
 ↓
Execution failure
 ↓
Release
```

Partial usage:

```text
Reserve 100
 ↓
Actual = 62
 ↓
Capture 62
 ↓
Release 38
```

This lifecycle SHALL work for:

- internal Credits,
- provider wallets,
- external payments where supported,
- virtual budget reservations.

---

# 21. Funding Plan

A `FundingPlan` SHALL describe how an authorized economic intent will be funded.

Modes:

- SINGLE_SOURCE
- FALLBACK_SOURCE
- MULTI_SOURCE

Example:

```yaml
funding_plan:
  mode: FALLBACK_SOURCE

  routes:
    - wallet_id: credits_main
      rank: 1

    - wallet_id: company_wallet
      rank: 2

    - wallet_id: card_backup
      rank: 3
```

## 21.1 Split funding

MULTI_SOURCE MUST only be used when:

1. the destination supports split tender, or
2. SmartAIHub can pre-fund an internal reservation and settle the sources separately.

The router SHALL NOT assume external merchants accept split funding.

---

# 22. Safe Fallback Engine

Fallback SHALL only occur for eligible error classes.

Normalized failure taxonomy:

- INSUFFICIENT_FUNDS
- TEMPORARY_PROVIDER_FAILURE
- PROVIDER_UNAVAILABLE
- NETWORK_TIMEOUT
- RATE_LIMIT
- AUTHENTICATION_EXPIRED
- POLICY_DENIED
- HARD_DECLINE
- FRAUD_BLOCK
- DUPLICATE
- INVALID_REQUEST
- UNSUPPORTED_CURRENCY
- UNSUPPORTED_MERCHANT
- UNKNOWN_FINAL_STATE

Default fallback behavior:

| Failure | Auto fallback |
|---|---:|
| INSUFFICIENT_FUNDS | Yes |
| TEMPORARY_PROVIDER_FAILURE | Yes, policy dependent |
| PROVIDER_UNAVAILABLE | Yes |
| NETWORK_TIMEOUT | Only after reconciliation check |
| AUTHENTICATION_EXPIRED | No, unless another wallet explicitly allowed |
| POLICY_DENIED | No |
| HARD_DECLINE | No |
| FRAUD_BLOCK | No |
| DUPLICATE | No |
| UNKNOWN_FINAL_STATE | No until reconciled |

---

# 23. Idempotency and Payment Attempt Safety

Each transaction MUST have:

- economic_intent_id
- payment_intent_id
- payment_attempt_id
- idempotency_key
- provider_reference
- provider_status
- internal finality state

A provider timeout MUST NOT automatically trigger the next wallet.

Required flow:

```text
Attempt A
   ↓
Timeout / unknown
   ↓
Provider reconciliation
   ↓
Confirmed failed?
   ├─ No → wait / investigate
   └─ Yes → fallback permitted
```

This is required to prevent double charging.

---

# 24. Liquidity Manager

Each wallet SHALL expose or compute:

- Current Balance
- Available Balance
- Reserved Balance
- Pending Outflow
- Pending Inflow
- Minimum Reserve
- Spendable Balance
- Projected Balance

Formula:

```text
Spendable =
Available
- Reserved
- Minimum Reserve
- Protected Pending Obligations
```

Routing SHALL use Spendable Balance, not raw balance.

---

# 25. Emergency Reserve

Users MAY define a protected wallet reserve.

Example:

```text
Balance          50,000
Minimum Reserve  20,000

Spendable        30,000
```

Agent spending MUST NOT cross the reserve unless:

- user explicitly overrides,
- policy permits emergency reserve usage,
- approval has been granted.

---

# 26. Auto Top-Up

Wallets / Credits MAY support automatic top-up.

Example:

```text
If SmartAIHub Credits < 200 THB
→ Top up to 1,000 THB
→ From Company Wallet
```

Required safeguards:

- max top-up per event,
- max top-up per day,
- max top-up per month,
- source wallet policy,
- approval threshold,
- cooldown,
- idempotency.

Auto top-up itself SHALL create an EconomicIntent.

---

# 27. Protocol Adapter Architecture

## 27.1 PaymentProtocolAdapter

```text
PaymentProtocolAdapter
├── NativeCreditAdapter
├── X402Adapter
├── MPPAdapter
└── FutureProtocolAdapter
```

Protocol adapter responsibilities:

- parse payment request,
- negotiate protocol version,
- produce payment authorization,
- verify payment response,
- normalize receipt,
- return errors in canonical form.

## 27.2 Protocol negotiation

Example:

```text
Merchant supports:
- MPP
- x402

SmartAIHub supports:
- MPP
- x402

Policy:
- Prefer fiat
- Avoid stablecoin

Selected:
- MPP-compatible fiat route
```

Another service:

```text
Merchant:
- x402 only

Selected:
- x402
```

No supported machine-payment protocol:

```text
Fallback:
- provider account billing
- SmartAIHub Credits
- traditional payment
```

---

# 28. Authorization Adapter Architecture

```text
AuthorizationProvider
├── SmartAIHubMandate
├── AP2Adapter
├── VerifiableIntentAdapter
└── FutureAuthorizationAdapter
```

Authorization is separate from payment.

Question 1:

> Is the agent allowed to spend?

Question 2:

> How should the transaction be paid?

These MUST be separate systems.

---

# 29. Trust Provider Architecture

```text
AgentTrustProvider
├── SmartAIHubIdentity
├── A2AIdentity
├── TAPClassAdapter
└── FutureTrustAdapter
```

Trust provider SHALL normalize:

- agent identity,
- principal identity,
- proof method,
- verification status,
- expiry,
- trust metadata.

Trust SHALL NOT replace spending authorization.

---

# 30. Commerce Protocol Architecture

Commerce is broader than payment.

```text
CommerceProtocolAdapter
├── SmartAIHubNativeCommerce
├── UCPAdapter
├── ACPAdapter
└── FutureCommerceProtocol
```

Commerce adapter MAY handle:

- capability discovery,
- offer,
- quote,
- order,
- checkout,
- fulfillment,
- cancellation,
- refund.

Core Offer model remains SmartAIHub-owned.

---

# 31. Capability Offer Model

Every monetizable capability MAY publish an Offer.

```yaml
offer:
  id: offer_video_edit_pro

  capability:
    type: SKILL
    id: video.edit.pro

  pricing:
    type: DYNAMIC_QUOTE

  accepted_protocols:
    - internal
    - x402
    - mpp

  supported_currencies:
    - THB
    - USD

  sla:
    expected_duration_seconds: 600

  fulfillment:
    output_type: video/mp4
```

The same Offer MAY be exposed through:

- SmartAIHub web UI,
- API,
- MCP,
- A2A,
- UCP,
- ACP,
- future agent surfaces.

---

# 32. Wallet Provider Adapter

```text
WalletProvider
├── SmartAIHubCreditsProvider
├── ExistingPaymentProviderAdapter
├── CloudflareWalletAdapter
├── ProviderWalletAdapter
├── ExternalCryptoWalletAdapter
└── FutureWalletAdapter
```

Minimum provider interface:

```text
connect()
disconnect()
reauthenticate()

get_capabilities()
get_balances()
get_limits()
get_fee_estimate()

authorize()
reserve()
capture()
release()
refund()

get_transaction()
list_transactions()

get_recurring_obligations()
get_settlement_status()
```

Provider-specific methods MUST remain inside adapters.

---

# 33. Payment Methods, Protocols, Providers, and Rails Must Be Separate

Example normalized representation:

```yaml
payment:
  protocol: mpp
  provider: provider_x
  method: card
  rail: card_network

  quoted_currency: USD
  charged_currency: USD
  settlement_currency: THB
```

Another:

```yaml
payment:
  protocol: x402
  provider: wallet_y
  method: stablecoin
  rail: chain_z
```

Another:

```yaml
payment:
  protocol: internal
  provider: smartaihub
  method: credits
  rail: internal_ledger
```

---

# 34. Existing PromptPay / Card / Gateway Integration

Existing SmartAIHub payment methods SHALL remain supported as funding and/or settlement adapters.

Typical user flow remains valid:

```text
PromptPay / Card / Gateway
          ↓
       Top-up
          ↓
 SmartAIHub Credits
          ↓
          Use
```

Spec 207 adds alternative flows but SHALL NOT force migration.

## 34.1 Repository Compatibility Baseline — 2026-09-19

This section separates current repository evidence from the target economic
architecture. The repository currently has a prepaid-credit rail, not the
complete Spec 207 ledger.

| Existing contract | Current repository evidence | Spec 207 rule |
|---|---|---|
| Credit balance, deduction, refund and reservation | `apps/web/server/services/creditService.ts` (`deductCredits`, `addCredits`, `refundCredits`, `createCreditReservation`, `drawFromReservation`, `refundReservation`, `commitCreditReservation`) | Wrap through `SmartAIHubCreditsProvider`; do not bypass the existing idempotency, tenant/context and refund safeguards during migration. |
| Credit history | `apps/web/drizzle/schema.ts` `creditTransactions`: integer credit amount, `balanceAfter`, `idempotencyKey`, `traceId`, and nullable legacy `tenantId` | Treat this as a compatibility/event source. It is not itself the proposed double-entry journal and must not be described as one. |
| Credit reservation durability | Redis-backed reservation state with a bounded 600-second TTL, plus the documented hard-cutover recovery path | Quote/reserve/capture/release expansion must define expiry, recovery and unknown state; it must not assume Redis reservation state is the canonical financial ledger. |
| Durable execution correlation | `workerJobs`, `workerJobAttempts`, `workerJobEvents`, `workerJobDispatches`, `workerJobOutbox`, `workerJobSettlements` in `apps/web/drizzle/schema.ts`; internal gateway in `apps/web/server/routes/jobControlPlane.ts` | Link economic records to the canonical Job and attempt by reference. Do not create a finance-owned queue, job table or second outbox. |
| Tenant/actor authority | Current routes derive authorization from authenticated session/API/internal context and scope queries by server-derived tenant/user identity | A client-supplied `tenant_id`, wallet owner, runner or queue value is never financial authority. |

The logical snake_case payload names in this specification map to the current
Drizzle camelCase columns (for example `tenant_id` → `tenantId` and
`worker_job_id` → `workerJobId`). An implementation MUST publish one versioned
mapping contract instead of silently mixing names across SQL, tRPC, Python and
provider adapters.

The current repository does not prove that multi-wallet routing, the
double-entry ledger, external provider settlement, or the Financial Calendar
are implemented or production-enabled. Those remain target work and release
gates. No implementation may claim Spec 207 compliance from the existing
credit tables alone.

---

# 35. Internal Credits as First-Class Economic Rail

Credits SHOULD remain preferred for high-frequency internal usage because they:

- avoid repeated external transaction fees,
- support tiny economic events,
- support immediate revenue allocation,
- simplify batching,
- simplify agent spending,
- preserve compatibility with existing users.

Credits SHALL be represented through the same canonical ledger.

---

# 36. Double-Entry Ledger

The ledger SHALL use double-entry accounting principles.

Example:

```text
User Credit Liability       -40
Provider Payable            +25
Platform Revenue             +8
Tenant Revenue               +3
Skill Owner Revenue          +4
--------------------------------
                             0
```

Required capabilities:

- balanced journal entries,
- reversals,
- partial refund,
- correction entries,
- immutable posted entries,
- reference to source event,
- currency tracking,
- audit metadata.

No posted ledger entry SHALL be edited in place.

Corrections SHALL be posted as new entries.

---

# 37. Monetary Types

DO NOT use floating point.

Use:

- integer minor units, or
- exact decimal type.

Money object:

```yaml
money:
  amount_minor: 125000
  currency: THB
  scale: 2
```

Supported currencies MAY include:

- THB
- USD
- EUR
- SmartAIHub Credits
- stablecoins
- future currencies

The system SHALL distinguish:

- quoted currency,
- charged currency,
- settlement currency,
- reporting currency.

---

# 38. Economic Event

Every financially relevant event SHALL be normalized.

Example:

```yaml
economic_event:
  id: ev_001

  type: CAPABILITY_USAGE

  actor_id: agent_001
  principal_id: user_001
  tenant_id: tenant_001

  capability_id: video.generate
  job_id: worker_job_001

  amount:
    value: 45.00
    currency: THB

  status: POSTED
```

Example event types:

- FUNDING
- CAPABILITY_USAGE
- RESERVATION
- RELEASE
- CAPTURE
- REFUND
- REVERSAL
- REVENUE_ALLOCATION
- PROVIDER_COST
- SETTLEMENT
- PAYOUT
- TOP_UP
- SUBSCRIPTION
- ADJUSTMENT
- FEE
- TAX

---

# 39. Revenue Sharing

Revenue sharing SHALL be computed from ledgered economic events.

Canonical stages:

```text
Gross Revenue
     ↓
Provider / External Cost
     ↓
Payment / Network Fees
     ↓
Applicable Taxes
     ↓
Net Revenue
     ↓
Revenue Split
```

Supported recipients MAY include:

- Platform
- Tenant / Partner
- Skill Owner
- Plugin Owner
- Agent Owner
- External Partner
- Other configured party

Revenue policy SHALL be versioned.

Historical transactions SHALL retain the revenue-sharing rules active at execution time.

---

# 40. Settlement Engine

Settlement SHALL be decoupled from usage.

Supported settlement modes:

- IMMEDIATE
- BATCH
- NET
- DEFERRED
- MANUAL
- THRESHOLD_BASED

Examples:

```text
1000 usage events
→ internal ledger
→ one daily settlement
```

Netting example:

```text
SmartAIHub owes Partner A   3,000
Partner A owes SmartAIHub  -1,200
---------------------------------
Net settlement              1,800
```

---

# 41. Settlement Optimizer

The optimizer SHOULD decide among:

- pay now,
- batch,
- net,
- defer,
- internal balance,
- alternate rail.

Decision inputs:

- transaction amount,
- provider fee,
- network fee,
- FX,
- minimum settlement,
- settlement latency,
- user policy,
- provider limits,
- expected incoming funds,
- legal/compliance restrictions,
- settlement deadline.

---

# 42. Reconciliation Center

SmartAIHub SHALL reconcile:

```text
Internal Ledger
vs
Provider
vs
Wallet
vs
Bank
vs
Gateway
```

Mismatch types:

- MISSING_EXTERNAL_TRANSACTION
- MISSING_INTERNAL_ENTRY
- DUPLICATE
- AMOUNT_MISMATCH
- CURRENCY_MISMATCH
- FEE_MISMATCH
- SETTLEMENT_MISMATCH
- PENDING_TOO_LONG
- STATUS_MISMATCH

Statuses:

- AUTO_MATCHED
- NEEDS_REVIEW
- INVESTIGATING
- DISPUTED
- RESOLVED

Reconciliation jobs SHOULD use Spec 186 job infrastructure.

---

# 43. Recurring Obligations

The system SHALL normalize recurring financial commitments.

Examples:

- subscriptions,
- monthly SaaS,
- cloud commitments,
- scheduled partner payment,
- recurring top-up,
- installment,
- recurring agent service.

Entity:

```yaml
recurring_obligation:
  id: ro_001
  owner_id: usr_001

  description: "Cloud service"
  amount_estimate: 1500
  currency: THB

  frequency: MONTHLY
  next_due_at: ...

  wallet_policy_id: ...
  status: ACTIVE
```

---

# 44. Financial Calendar

Financial Calendar is a first-class feature.

It SHALL NOT be merely a transaction history calendar.

It SHALL combine:

- confirmed payments,
- planned payments,
- scheduled payments,
- recurring obligations,
- reserved budgets,
- future agent jobs,
- estimated agent spend,
- invoices due,
- expected settlements,
- expected payouts,
- expected revenue,
- wallet top-ups,
- subscription renewals,
- budget deadlines,
- authorization expiries.

## 44.1 Calendar event states

- ESTIMATED
- PLANNED
- AUTHORIZED
- RESERVED
- DUE
- PROCESSING
- PAID
- FAILED
- CANCELLED

## 44.2 Calendar event types

- PAYMENT
- AGENT_JOB
- SUBSCRIPTION
- PAYOUT
- SETTLEMENT
- INVOICE
- TOP_UP
- REVENUE
- BUDGET_RESERVATION
- AUTHORIZATION_EXPIRY
- WALLET_REAUTH
- OTHER

---

# 45. Financial Calendar Views

Required views:

1. Month
2. Week
3. Day
4. Agenda
5. Cash-flow view
6. Wallet-specific calendar
7. Project-specific calendar
8. Agent-specific calendar
9. Tenant-specific calendar

Example Day View:

```text
Monday 28

08:00
Cloud subscription
-300 THB

10:30
Scheduled Video Agent
~400–600 THB

14:00
Tenant payout
-2,000 THB

17:00
Partner settlement
+3,800 THB
```

---

# 46. Calendar Planning and Rescheduling

Eligible future economic events MAY be rescheduled by drag-and-drop.

The system SHALL distinguish:

- flexible event,
- fixed event,
- provider-controlled event,
- deadline-bound event.

Before moving an event, the UI SHALL show:

- deadline impact,
- price impact,
- wallet availability,
- budget effect,
- forecast balance effect.

Example:

```text
Move Sep 20 → Sep 22

Estimated cost:
140 THB → 105 THB

Estimated saving:
35 THB
```

Events that cannot be rescheduled SHALL show a lock state.

---

# 47. Scheduled Agent Jobs

Future agent jobs MUST appear on the Financial Calendar before execution when cost can be estimated.

Example:

```text
Sep 25, 02:00
Generate 300 product images

Estimated:
800–1,200 THB
```

Recommended lifecycle:

```text
T-24h → refresh quote
T-1h  → reserve budget
T      → execute
```

If refreshed quote exceeds policy:

```text
Estimate 800
New max quote 1,500
Policy max 1,000

→ require approval
→ do not execute until resolved
```

---

# 48. Cash-Flow Forecast

Forecast SHALL support:

- 24 hours
- 7 days
- 30 days
- 90 days
- custom range

Example:

```text
Next 7 days

Expected income      +18,500
Committed expenses  -12,300
Estimated AI spend   -2,800
--------------------------------
Projected net         +3,400
```

Forecast confidence MAY distinguish:

- committed,
- highly probable,
- estimated,
- speculative.

---

# 49. Projected Wallet Balance

For each wallet:

```text
Current Balance
+ Expected Inflow
- Scheduled Outflow
- Reserved Amount
= Projected Balance
```

The system SHALL detect expected shortfall.

Example alert:

```text
Projected shortfall on Sep 27.

Expected available:
2,900 THB

Committed obligations:
6,000 THB
```

Possible actions:

- add funds,
- change wallet,
- move eligible payment,
- reduce budget,
- change routing policy.

---

# 50. Financial Scheduler

Users SHOULD be able to define payment planning rules.

Example:

> Pay when cheapest, but no later than Sep 25.

Scheduler inputs:

- earliest execution time,
- latest execution time,
- forecast balance,
- fees,
- FX,
- expected income,
- wallet availability,
- provider constraints,
- project deadline.

Scheduler output SHALL be explainable.

---

# 51. Wallet Expiry and Reauthentication Awareness

Financial planning MUST detect:

- token expiry,
- authorization expiry,
- wallet reauthentication requirement,
- provider credential expiry.

Example:

```text
Wallet credential expires Sep 22.
Payment scheduled Sep 25.

→ warning
→ request reauthentication
→ suggest fallback wallet
```

---

# 52. Wallet Health Model

Wallet health SHALL be based on:

- provider availability,
- balance availability,
- recent failures,
- latency,
- error rate,
- fee deviation,
- reauthentication state,
- provider incident state,
- currency compatibility.

Statuses:

- HEALTHY
- DEGRADED
- AT_RISK
- REAUTH_REQUIRED
- UNAVAILABLE
- FROZEN

Health SHOULD influence smart routing.

---

# 53. Policy Simulation

Before activating a new routing or wallet policy, users SHALL be able to simulate it against historical data.

Example:

```text
If this policy had been active in the last 30 days:

Transactions evaluated: 342

Estimated fees:
Old: 1,420 THB
New: 1,080 THB

Estimated saving:
340 THB

Payment failures:
Old: 4
New estimate: 5
```

Simulation results are advisory and MUST show that future results are not guaranteed.

---

# 54. Dry-Run Mode

Agent spending SHALL support:

- SIMULATION
- LIVE

Simulation mode runs:

- quote,
- policy,
- wallet selection,
- routing,
- budget reservation simulation,
- cost forecast,

without committing money.

Use cases:

- testing a new agent,
- testing a wallet,
- validating a policy,
- onboarding enterprise tenants.

---

# 55. Cost Advisor

The system SHOULD analyze historical usage and identify potential savings.

Example insight:

```text
74% of USD AI API transactions last month
could have been routed through Wallet B
at lower estimated effective cost.
```

The Cost Advisor SHALL NOT silently change routing unless policy permits automatic optimization.

---

# 56. Explainable Routing

Every routing decision MUST retain a decision trace.

Example:

```text
Selected Wallet B

Reasons:
- Wallet A: insufficient spendable balance
- Wallet B: effective fee 0.6%
- Wallet C: policy denied category AI_API
- Wallet D: credential expired
```

The user SHALL be able to inspect this trace.

---

# 57. Transaction Explorer

Transaction detail SHALL show the full economic chain:

```text
Economic Intent
     ↓
Quote
     ↓
Policy Evaluation
     ↓
Approval
     ↓
Routing Decision
     ↓
Funding Plan
     ↓
Reservation
     ↓
Execution / worker_job
     ↓
Capture
     ↓
Ledger
     ↓
Revenue Split
     ↓
Settlement
     ↓
Reconciliation
```

This replaces a simple payment-record-only view.

---

# 58. Audit Timeline

Each transaction SHALL expose a chronological timeline.

Example:

```text
10:01 Quote created
10:01 Policy evaluated
10:01 Wallet A skipped: insufficient funds
10:01 Wallet B selected
10:01 Reserved 50 THB
10:02 worker_job started
10:06 Job completed
10:06 Captured 46.82 THB
10:06 Released 3.18 THB
10:06 Revenue allocation posted
```

Audit events MUST be immutable.

---

# 59. UI/UX Information Architecture

Primary navigation:

```text
Finance
├── Overview
├── Wallets
├── Transactions
├── Calendar
├── Budgets
├── Policies
├── Routing
├── Subscriptions
├── Settlements
├── Revenue
├── Approvals
├── Reconciliation
└── Analytics
```

For users with limited permissions, only authorized sections SHALL appear.

---

# 60. Finance Overview

Dashboard SHOULD show:

- total available funds,
- total reserved,
- projected 7-day spend,
- projected 30-day spend,
- expected inflow,
- upcoming obligations,
- active budgets,
- agent spending today,
- provider incidents,
- wallet health,
- pending approvals,
- reconciliation issues,
- cost-saving opportunities.

Example:

```text
Available Funds      24,800 THB
Reserved              3,200 THB
Projected 7d Spend    8,450 THB
Expected 7d Income    6,200 THB

Wallets:
3 Healthy
1 Reauth Required

Alerts:
2 Upcoming shortfalls
1 Approval pending
```

---

# 61. Wallets UI

Wallet cards SHALL show:

```text
Company Wallet

Available:
12,450 THB

Reserved:
2,100 THB

Projected 7d:
8,300 THB

Priority:
#2

Health:
Healthy

This month spent:
6,800 THB

Fees:
145 THB
```

Actions:

- Add Funds
- Withdraw, if supported
- Set Policy
- Set Priority
- View Transactions
- View Calendar
- Reauthenticate
- Freeze
- Disable

---

# 62. Wallet Connection Flow

Generic UI:

1. Choose provider.
2. Show supported capabilities.
3. Authenticate/connect.
4. Select provider account.
5. Name the wallet.
6. Set priority.
7. Configure default policy.
8. Optionally enable auto top-up.
9. Run verification.
10. Save.

Provider-specific screens MAY be injected via adapter metadata but SHOULD preserve SmartAIHub UX consistency.

---

# 63. Wallet Priority UI

Drag-and-drop ordering:

```text
Payment Priority

☰ 1. SmartAIHub Credits
☰ 2. Company Wallet
☰ 3. Personal Wallet
☰ 4. Backup Card
```

The UI SHALL clarify whether current routing mode is:

- strict priority,
- smart optimization,
- custom rules.

---

# 64. Routing Studio

Simple mode:

```text
Routing Strategy

● Smart Optimize
○ Follow Priority
○ Lowest Cost
○ Highest Reliability
○ Prefer Credits
○ Custom
```

Advanced mode provides a visual rule builder.

Example:

```text
IF category = AI_API
AND amount < 10 USD
THEN prefer SmartAIHub Credits

ELSE IF currency = USD
THEN lowest effective cost

FALLBACK Company Wallet
```

Rules SHALL be versioned.

---

# 65. Budget UI

Required budget views:

- overall,
- per project,
- per agent,
- per category,
- per time period.

Example:

```text
Project: Product Launch

Total Budget: 10,000 THB

Research        650 / 1,000
Images        1,420 / 2,000
Video         2,900 / 5,000
Voice           220 /   500
Editing         480 / 1,500
```

Budget UI SHALL distinguish:

- actual,
- reserved,
- planned,
- remaining.

---

# 66. Policy UI

Policy configuration SHALL support:

- simple form,
- advanced rules,
- inheritance visualization.

Example:

```text
Tenant policy
  ↓
User policy
  ↓
Agent policy
  ↓
Wallet policy
```

When a lower-level setting is blocked by a parent policy, UI SHALL display why.

---

# 67. Financial Calendar UI

Required features:

- month/week/day/agenda views,
- income vs expense markers,
- estimated vs confirmed distinction,
- filtering by wallet,
- project,
- tenant,
- agent,
- category,
- event status,
- drag-and-drop for movable events,
- locked events,
- projected daily closing balance,
- shortfall alerts,
- approval-needed markers.

Selecting an event SHALL open:

- amount,
- range if estimated,
- source wallet,
- fallback wallets,
- related job,
- related subscription,
- policy,
- deadline,
- rescheduling options,
- transaction history.

---

# 68. Financial Day View

Example:

```text
Friday, Sep 25

08:00  Subscription renewal
        -300 THB
        Wallet: Company

10:30  Video Agent Job
        Estimated -400 to -600 THB
        Budget reserved: 600

14:00  Tenant payout
        -2,000 THB

17:00  Partner settlement
        +3,800 THB

Projected close:
8,420 THB
```

---

# 69. Transactions UI

Filters:

- user,
- tenant,
- wallet,
- provider,
- protocol,
- method,
- currency,
- agent,
- job,
- project,
- capability,
- status,
- date,
- amount,
- settlement status,
- reconciliation status.

Bulk export SHOULD be supported.

---

# 70. Subscription Manager

Normalize recurring commitments from supported providers.

UI SHALL show:

- provider,
- description,
- amount,
- currency,
- recurrence,
- next charge,
- assigned wallet,
- fallback,
- projected annual cost,
- status.

User MAY reassign the preferred wallet when technically supported.

---

# 71. Approvals UI

Approvals SHALL display:

- requestor agent,
- principal,
- purpose,
- amount,
- quote,
- capability,
- provider,
- wallet,
- alternatives,
- budget impact,
- projected balance impact,
- deadline.

Actions:

- approve once,
- approve and create rule,
- deny,
- change wallet,
- lower budget,
- request revised quote.

---

# 72. Emergency Controls

Required emergency controls:

```text
FREEZE AGENT SPENDING
```

Scope:

- single agent,
- project,
- wallet,
- user,
- tenant,
- entire platform, admin only.

Freeze SHALL stop new authorizations immediately.

In-flight transactions SHALL be handled according to finality and provider state.

---

# 73. Credential Vault

Financial credentials MUST be isolated from agents and workers.

Agents SHALL receive capability tokens, not raw credentials.

Example:

```yaml
payment_capability_token:
  scope:
    capability: video.generate

  max_amount: 100
  currency: THB

  expires_in: 3600
```

Credential Vault principles:

- no raw card storage unless required,
- prefer provider tokenization,
- secrets encrypted,
- scoped access,
- auditable retrieval,
- provider rotation support.

---

# 74. Worker / Runner Integration

Workers MUST NOT:

- choose arbitrary wallets,
- access payment secrets,
- perform direct payment authorization.

Worker receives:

```yaml
economic_context:
  economic_intent_id: ei_123
  authorized: true
  budget_reserved: true
  reservation_id: res_123
```

Worker reports execution result.

Economic Control Plane handles capture/release.

---

# 75. worker_jobs Integration

Economic records MUST link to the existing canonical Job rather than turning
`worker_jobs` into a finance table. The current repository already provides
child records for dispatch, outbox, provider reservation and settlement; an
implementation MUST reuse those contracts where they cover the need.

Logical link shape:

```text
worker_jobs
├── economic_intent_id
├── quote_id
├── reservation_id
└── economic_status
```

The fields above are references or a versioned projection contract, not a
request to add unplanned columns to the existing table. Exact implementation
may use an additive child/link table, provided it preserves tenant scope,
idempotency, attempt/fencing correlation and the Feature 195 ownership rule.
Do not duplicate full economic records inside `worker_jobs`.

Use references.

---

# 76. Capability Registry Integration

Capability metadata SHOULD include:

```yaml
economic:
  monetized: true

  pricing_model: dynamic_quote

  accepted_protocols:
    - internal
    - mpp
    - x402

  supported_currencies:
    - THB
    - USD

  quote_required: true
```

Capability Registry should not own transaction state.

---

# 77. MCP Integration — Spec 199

Paid MCP tool flow:

```text
External MCP Client
       ↓
Spec 199
       ↓
Capability Resolver
       ↓
Spec 207 Quote/Payment
       ↓
Authorized
       ↓
Tool Execution
       ↓
Ledger / Receipt
```

The MCP Gateway SHALL not implement an independent wallet system.

---

# 78. External Agent Integration — Spec 200

```text
External Agent
      ↓
Spec 200
      ↓
Economic Intent
      ↓
Policy / Payment
      ↓
Execution
```

If the external agent lacks modern payment support, SmartAIHub MAY use:

- prepaid credits,
- account billing,
- traditional payment,
- internal settlement.

---

# 79. A2A Integration — Spec 206

A2A tasks MAY include economic metadata.

Example:

```yaml
economic_requirements:
  quote_required: true
  max_budget: 20
  currency: USD
```

Spec 206 handles A2A communication.

Spec 207 handles economics.

If A2A is unsupported and Spec 200 fallback is used, economic behavior SHOULD remain equivalent.

---

# 80. Agentic Commerce Interoperability

SmartAIHub SHALL be able to operate as:

1. Buyer.
2. Seller.
3. Marketplace.
4. Intermediary.

Example seller flow:

```text
External Agent
    ↓
Discover SmartAIHub Offer
    ↓
Quote
    ↓
Authorize
    ↓
Pay
    ↓
Execute Skill
    ↓
Deliver Result
```

Example buyer flow:

```text
SmartAIHub Agent
    ↓
Discover External Capability
    ↓
Evaluate Cost / Policy
    ↓
Pay
    ↓
Use Capability
```

---

# 81. Cost-Aware Provider Selection

Provider selection MAY consider:

- provider price,
- model quality,
- latency,
- SLA,
- wallet fee,
- network fee,
- FX,
- historical success rate,
- rate limit,
- user preference,
- data residency,
- compliance,
- deadline.

This enables:

```text
Draft job
→ cheapest acceptable provider

Final job
→ highest quality within budget

Urgent job
→ fastest provider
```

---

# 82. Fee Modeling

Fees SHALL be separate line items.

Types:

- PROVIDER_FEE
- NETWORK_FEE
- PAYMENT_PROCESSING_FEE
- FX_FEE
- WALLET_FEE
- PLATFORM_FEE
- SETTLEMENT_FEE
- TAX
- OTHER

Users SHOULD be able to inspect fee composition.

---

# 83. FX Handling

Routing MAY optimize FX.

System SHALL store:

- source currency,
- target currency,
- quoted FX rate,
- provider FX markup,
- timestamp,
- final settled amount.

FX estimates MUST expire.

For scheduled events, FX SHOULD be refreshed close to execution.

---

# 84. Taxes

Tax engine integration SHALL be provider-neutral.

Economic records SHOULD support:

- tax jurisdiction,
- tax category,
- tax amount,
- tax included/excluded,
- external tax reference.

Spec 207 does not define all tax rules but SHALL preserve data needed for external tax services.

---

# 85. Receipts

Every completed paid operation SHOULD produce a canonical receipt.

```yaml
receipt:
  economic_intent_id: ei_123
  amount: 46.82
  currency: THB

  paid_via:
    wallet_id: wc_002
    provider_id: provider_x

  capability:
    id: video.generate

  job_id: worker_job_2292

  fees:
    total: 0.42

  completed_at: ...
```

Provider receipts MAY be attached.

---

# 86. Refunds

Support:

- full refund,
- partial refund,
- provider refund,
- internal credit refund,
- mixed-source refund.

Refund policy SHALL preserve original funding provenance.

A refund SHOULD generally return value to the original source unless policy/provider restrictions require otherwise.

---

# 87. Disputes and Chargebacks

Canonical dispute model SHOULD support:

- provider dispute id,
- reason,
- amount,
- currency,
- opened_at,
- evidence_deadline,
- status,
- resolution.

Chargebacks MUST generate ledger entries, not mutate history.

---

# 88. Policy Versioning

All policy objects SHALL be versioned.

Example:

```text
Policy v12
Effective Sep 18

Policy v13
Effective Oct 1
```

Future calendar events MUST resolve which policy version will apply at execution time.

Past transactions MUST retain the policy version used.

---

# 89. Configuration Versioning

Version:

- routing policy,
- budget policy,
- revenue split,
- wallet policy,
- fee model,
- capability offer,
- mandate.

Every transaction SHALL reference effective versions.

---

# 90. Observability

Metrics SHALL include:

- economic intents created,
- quote latency,
- policy evaluation latency,
- payment success rate,
- fallback rate,
- duplicate-prevention events,
- cost per provider,
- fee ratio,
- settlement latency,
- reconciliation mismatch rate,
- wallet health,
- forecast accuracy,
- agent budget overrun rate,
- approval rate,
- refund rate.

---

# 91. Logging

Sensitive fields MUST be redacted.

Logs SHOULD include:

- correlation id,
- economic_intent_id,
- payment_intent_id,
- wallet id,
- provider id,
- protocol,
- decision result,
- normalized failure,
- job id.

Never log:

- full card numbers,
- private keys,
- wallet seeds,
- unrestricted provider secrets.

---

# 92. Audit Requirements

Audit events MUST cover:

- wallet connection,
- wallet disconnection,
- policy change,
- priority change,
- mandate issuance,
- mandate revocation,
- approval,
- denial,
- quote,
- routing decision,
- fallback,
- reserve,
- capture,
- refund,
- freeze/unfreeze,
- settlement,
- reconciliation override.

---

# 93. Security Boundaries

## 93.1 Agent boundary

Agents may request spending.

Agents do not receive unrestricted money credentials.

## 93.2 Worker boundary

Workers perform compute.

Workers do not own payment credentials.

## 93.3 Provider boundary

Provider-specific secrets are isolated by adapter and vault.

## 93.4 Tenant boundary

Tenant-level financial data MUST be isolated.

---

# 94. Permissions

Suggested permissions:

- finance.wallet.view
- finance.wallet.manage
- finance.policy.view
- finance.policy.manage
- finance.transaction.view
- finance.calendar.view
- finance.budget.manage
- finance.approval.act
- finance.settlement.view
- finance.reconciliation.manage
- finance.revenue.view
- finance.admin

RBAC SHALL integrate with SmartAIHub existing auth.

---

# 95. Privacy

Financial data MUST be minimized.

Agents should receive only the information needed for decision-making.

Example:

Agent may receive:

```text
Available budget: 100 THB
Route allowed: yes
```

Agent should not receive:

```text
Full bank balance
Full card number
Private wallet key
```

---

# 96. Compliance Readiness

The architecture SHALL make room for:

- KYC/KYB,
- AML controls,
- sanctions screening,
- transaction monitoring,
- provider-specific regulatory restrictions,
- geographic restrictions.

These may be implemented via adapters/services rather than core rules.

---

# 97. Database Design — Suggested Tables

Suggested logical tables:

```text
economic_actors
economic_intents
economic_events

wallet_providers
wallet_connections
wallet_capabilities
wallet_balances
wallet_policies
wallet_health_snapshots

routing_policies
routing_policy_versions
routing_decisions

budget_envelopes
budget_allocations
budget_reservations

spending_mandates
spending_mandate_versions

quotes
quote_line_items

payment_intents
payment_attempts
funding_plans
reservations
captures
refunds
reversals
disputes

ledger_accounts
ledger_journals
ledger_entries

revenue_policies
revenue_policy_versions
revenue_allocations

settlement_accounts
settlements
settlement_items

recurring_obligations
financial_calendar_events
cashflow_forecasts

provider_transactions
reconciliation_runs
reconciliation_items

economic_approval_links  # references Shared Approval Infrastructure
economic_audit_events
```

Existing payment/credit tables SHOULD be migrated or bridged carefully rather than duplicated without need.

`economic_approval_links` MUST store references/context only. The canonical approval request/state remains owned by Shared Approval Infrastructure; Spec 207 MUST NOT create an independent approval workflow database.

---

# 98. Ledger Accounts

Examples:

```text
ASSET:
- bank_cash
- provider_balance
- settlement_receivable

LIABILITY:
- user_credit_balance
- partner_payable
- tenant_payable

REVENUE:
- platform_revenue
- skill_revenue

EXPENSE:
- provider_cost
- payment_fee
- network_fee
- refund_expense
```

Account structure SHALL support tenant dimensions.

---

# 99. API Surface — High Level

Suggested endpoints:

```text
GET    /v1/finance/overview

GET    /v1/finance/wallets
POST   /v1/finance/wallets/connect
PATCH  /v1/finance/wallets/{id}
POST   /v1/finance/wallets/{id}/freeze
POST   /v1/finance/wallets/{id}/unfreeze

GET    /v1/finance/policies
POST   /v1/finance/policies
POST   /v1/finance/policies/{id}/simulate

POST   /v1/economic/intents
POST   /v1/economic/intents/{id}/quote
POST   /v1/economic/intents/{id}/authorize
POST   /v1/economic/intents/{id}/reserve
POST   /v1/economic/intents/{id}/capture
POST   /v1/economic/intents/{id}/cancel

GET    /v1/finance/transactions
GET    /v1/finance/transactions/{id}

GET    /v1/finance/calendar
GET    /v1/finance/forecast

GET    /v1/finance/budgets
POST   /v1/finance/budgets

GET    /v1/finance/subscriptions

GET    /v1/finance/settlements
GET    /v1/finance/reconciliation
```

Exact API style may be adapted to current backend conventions.

---

# 100. Events / Outbox

Economic state transitions SHOULD publish events through the existing reliable outbox/control-plane architecture.

Examples:

- economic.intent.created
- quote.created
- mandate.authorized
- budget.reserved
- wallet.route.selected
- payment.attempt.started
- payment.attempt.failed
- payment.captured
- ledger.posted
- settlement.created
- reconciliation.mismatch
- calendar.shortfall.detected

No financial side effect should depend on unreliable fire-and-forget messaging.

---

# 101. Concurrency

Financial operations MUST use appropriate transactional locking or optimistic concurrency.

Examples:

- budget reservation,
- wallet spendable balance,
- capture,
- refund,
- revenue allocation.

Prevent:

- double reservation,
- double capture,
- spending beyond a shared agent budget.

---

# 102. Provider Outage Handling

If provider outage occurs:

1. mark wallet/provider DEGRADED,
2. prevent new routing if policy dictates,
3. preserve existing finality checks,
4. allow fallback only where safe,
5. display status in UI,
6. update scheduled-event risk.

---

# 103. Webhook Handling

Provider webhooks MUST:

- verify signatures,
- be idempotent,
- retain raw provider event reference,
- map to canonical event,
- handle out-of-order delivery,
- support replay.

Webhook receipt does not directly mutate posted history without canonical transition validation.

---

# 104. Financial Calendar Consistency

Calendar entries may originate from:

- internal schedule,
- provider subscription,
- worker_job schedule,
- budget reservation,
- invoice,
- expected revenue,
- payout schedule.

A normalized `FinancialCalendarEvent` SHALL preserve:

```yaml
source_type:
source_id:
event_type:
scheduled_at:
amount_min:
amount_max:
currency:
confidence:
movable:
status:
wallet_id:
```

---

# 105. Forecast Engine

Forecast SHALL combine:

```text
Committed cash flows
+ Scheduled cash flows
+ Reserved budgets
+ Expected agent usage
+ Expected income
+ Recurring obligations
```

Forecast SHOULD include confidence and scenario modes:

- Conservative
- Expected
- Optimistic

---

# 106. Scenario Planning

Users SHOULD be able to simulate:

- disable a wallet,
- reduce a budget,
- increase agent workload,
- move a scheduled job,
- switch routing strategy.

Output:

- projected costs,
- shortfalls,
- fees,
- wallet usage,
- approval needs.

---

# 107. Alerts

Required alerts:

- low wallet balance,
- projected shortfall,
- high fee,
- unusual spending,
- subscription renewal,
- subscription price increase when detectable,
- failed payment,
- fallback used,
- wallet reauthentication,
- agent nearing budget,
- budget exhausted,
- major quote change,
- provider degradation,
- reconciliation mismatch,
- large upcoming payout,
- settlement delayed.

---

# 108. Notification Preferences

Users SHALL configure:

- in-app,
- email,
- push where available,
- severity,
- per event type,
- per wallet,
- per tenant.

Notification system MAY use existing SmartAIHub infrastructure.

---

# 109. Human Approval Levels

Policy MAY define:

```text
Auto approve
Policy review
Human approval
Dual approval
Admin approval
```

Enterprise mode MAY require dual approval for large payments.

---

# 110. Approval Timeout

Approvals may have expiry.

Example:

```text
Quote valid 10 min
Approval expires 8 min
```

If approval arrives after quote expiry, refresh quote before execution.

---

# 111. Human Override

Authorized users MAY:

- force a wallet,
- lower budget,
- choose alternate route,
- cancel intent,
- change execution time.

Override MUST be audited.

---

# 112. Freeze Semantics

Freeze types:

- AGENT_SPENDING
- PROJECT_SPENDING
- WALLET
- USER
- TENANT
- PLATFORM

Freeze SHALL prevent new authorization.

Already-captured transactions remain valid.

Pending unknown provider states require reconciliation.

---

# 113. Economic Risk Engine

Optional 2027 subsystem.

Risk signals:

- unusual amount,
- unusual merchant,
- high velocity,
- repeated fallback,
- new external agent,
- new provider,
- anomalous geography,
- budget deviation,
- transaction splitting.

Risk output MAY require additional approval.

---

# 114. Wallet Reputation / Provider Performance

Maintain operational statistics:

- payment success rate,
- average latency,
- fee accuracy,
- reconciliation accuracy,
- provider outage frequency.

These MAY influence routing.

---

# 115. Multi-Tenant Rules

Each tenant MAY configure:

- allowed wallet providers,
- allowed payment protocols,
- allowed currencies,
- allowed rails,
- maximum spend,
- settlement schedule,
- revenue sharing,
- approval rules.

Tenant restrictions override user preferences.

---

# 116. Corporate Wallets

Enterprise/tenant wallets MAY be shared.

Example:

```text
Tenant Wallet
├── Team A budget
├── Team B budget
└── Agent Pool
```

Use budget envelopes to avoid exposing full wallet balance to all teams.

---

# 117. Shared Wallet Concurrency

Shared wallet spending MUST coordinate concurrent reservations.

Available balance calculation MUST include active reservations from all agents/projects.

---

# 118. Project Wallet Preference

Projects MAY define:

```text
Preferred wallets:
1. Project Credits
2. Tenant Wallet
3. User Wallet

Do not use:
- Personal Card
```

Project preference remains subject to tenant/platform policy.

---

# 119. Agent-Specific Wallet Preference

Example:

```text
Video Agent
Preferred:
Production Wallet

Fallback:
SmartAIHub Credits

Forbidden:
Personal Wallet
```

---

# 120. Routing Decision Lifecycle

```text
1. Resolve economic intent
2. Resolve applicable policies
3. Resolve budget
4. Resolve candidate wallets
5. Remove ineligible wallets
6. Refresh balances
7. Estimate effective costs
8. Evaluate health/reliability
9. Score routes
10. Select route
11. Create FundingPlan
12. Reserve / authorize
13. Execute
14. Capture
15. Reconcile
```

Every step SHOULD be traceable.

---

# 121. Candidate Wallet Filtering

Before scoring, filter by:

- status,
- currency support,
- merchant/category policy,
- balance,
- minimum reserve,
- transaction limit,
- daily/monthly limit,
- protocol compatibility,
- geographic restriction,
- credential validity,
- provider availability.

---

# 122. Smart Routing Example

Transaction:

```text
Video generation
Cost: 180 THB
```

Candidate:

```text
Credits
Spendable: 120
Priority: #1

Company Wallet
Spendable: 10,000
Effective cost: 181.20

Personal Wallet
Spendable: 5,000
Effective cost: 186.00
Policy: fallback only
```

If single-source required:

```text
Credits skipped: insufficient
Company Wallet selected
```

If SmartAIHub internal split funding allowed:

```text
120 Credits + 60 external
```

depending on configured policy.

---

# 123. Routing Explanation UI

```text
Selected: Company Wallet

Why:
✓ sufficient funds
✓ allowed category
✓ lowest effective cost among eligible external wallets
✓ within daily limit

Not selected:
SmartAIHub Credits — insufficient for single-source funding
Personal Wallet — fallback-only policy
```

---

# 124. Financial Optimization Boundaries

Cost optimization SHALL NOT override:

- security policy,
- legal restrictions,
- user hard preference,
- tenant policy,
- merchant acceptance,
- deadline constraints,
- approved mandate scope.

---

# 125. Transaction Finality

Canonical finality states:

- CREATED
- AUTHORIZED
- RESERVED
- SUBMITTED
- PROVIDER_PENDING
- CAPTURED
- SETTLED
- FAILED
- CANCELLED
- REVERSED
- DISPUTED
- UNKNOWN

UNKNOWN MUST be treated as unsafe for automatic duplicate attempt.

---

# 126. Protocol Version Negotiation

Adapters SHOULD advertise:

- protocol name,
- versions,
- extensions,
- payment methods,
- currencies.

Example:

```yaml
protocol_support:
  mpp:
    versions: ["1.0"]
  x402:
    versions: ["2"]
```

Future upgrades SHOULD not require changing canonical tables.

---

# 127. Provider Adapter Certification

Before enabling a provider in production, tests MUST cover:

- authentication,
- balance,
- quote/fee estimate,
- authorize,
- capture,
- refund,
- timeout,
- duplicate request,
- webhook replay,
- provider outage,
- reconciliation.

---

# 128. Sandbox / Test Mode

Each provider SHOULD support environment:

- TEST
- LIVE

EconomicIntent SHALL record environment.

No LIVE credential may be exposed to TEST workloads.

---

# 129. Development Mock Provider

Build a `MockWalletProvider`.

It SHALL simulate:

- balance,
- fees,
- insufficient funds,
- temporary failure,
- timeout,
- unknown final state,
- partial capture,
- refund.

This is required for deterministic testing.

---

# 130. Migration from Existing Credits

Phase 1 SHALL wrap existing Credits in:

```text
SmartAIHubCreditsProvider
```

Do not rewrite all credit logic immediately.

Create translation layer from existing credit events into canonical EconomicEvent/Ledger.

Migration MUST preserve historical balances.

---

# 131. Backward Compatibility

Existing:

- PromptPay top-up,
- card top-up,
- gateway payments,
- credit deduction,
- existing revenue share,

MUST continue functioning during migration.

---

# 132. Data Migration Safety

Migration steps:

1. inventory current financial tables and the `creditService` call graph,
2. map current concepts to canonical models,
3. create read compatibility projections where needed,
4. use one authoritative writer for each economic event; any temporary dual-write must have an explicit event key, reconciliation job and removal date,
5. reconcile balances, revenue allocations and reversals,
6. switch reads only after the reconciliation gate passes,
7. stop old writes through a controlled flag/cutover,
8. archive legacy fields only after retention, export and rollback validation.

No destructive migration until financial reconciliation reaches zero unexplained delta.
Indefinite dual-write or two independently mutable balance sources is prohibited.

---

# 133. Rollout Phases

## Phase 0 — Audit

- inventory current credit/payment/revenue code,
- identify tables,
- identify provider integrations,
- identify existing job links,
- document current balance invariants.

## Phase 1 — Canonical economic foundation

Build:

- EconomicIntent
- EconomicEvent
- WalletConnection
- SmartAIHub Credits adapter
- double-entry ledger
- Quote
- reserve/capture/release
- budget
- base policy engine

No external agentic protocol required yet.

## Phase 2 — Multi-wallet

Build:

- wallet registry,
- multi-provider connections,
- wallet priority,
- wallet policy,
- liquidity manager,
- safe fallback,
- routing trace.

## Phase 3 — Smart routing

Build:

- effective-cost engine,
- fee model,
- health model,
- smart scoring,
- simulation,
- cost advisor.

## Phase 4 — Agent delegated spending

Build:

- mandates,
- agent budgets,
- approval flows,
- dry-run,
- capability tokens.

## Phase 5 — Machine payment

Build:

- x402 adapter,
- MPP adapter,
- protocol negotiation,
- MCP paid capability integration,
- A2A paid-task integration.

## Phase 6 — Financial planning

Build:

- recurring obligations,
- Financial Calendar,
- scheduled jobs,
- cash-flow forecast,
- projected balances,
- shortfall alerts,
- rescheduling.

## Phase 7 — Settlement maturity

Build:

- batching,
- netting,
- reconciliation,
- payout scheduling,
- provider settlement reporting.

## Phase 8 — 2027 interoperability

Add:

- AP2-class adapter,
- commerce adapters,
- trust adapters,
- Cloudflare Wallet adapter when production-ready,
- additional providers,
- stablecoin rails where appropriate.

---

# 134. Suggested 2027 Timeline

## Q4 2026

- canonical economic model,
- ledger,
- Credits adapter,
- quote/reserve/capture/refund,
- budget,
- wallet abstraction,
- initial Finance UI.

## Q1 2027

- multi-wallet production support,
- routing policy,
- cost-aware routing,
- x402,
- MPP,
- MCP/A2A paid capability support.

## Q2 2027

- delegated agent mandates,
- stronger approval,
- AP2-class adapter,
- scheduled agent-cost reservations,
- Financial Calendar v1.

## Q3 2027

- Financial Calendar v2,
- forecasting,
- subscriptions,
- settlement optimizer,
- reconciliation,
- commerce protocol adapters,
- trust adapters.

## Q4 2027

- mature wallet ecosystem,
- additional provider adapters,
- wallet provider auto-discovery where feasible,
- cross-provider optimization,
- enterprise finance controls,
- advanced scenario planning.

---

# 135. UI Rollout Order

Recommended UI order:

1. Finance Overview
2. Wallets
3. Wallet Priority
4. Transactions
5. Budgets
6. Policies
7. Routing Studio
8. Approvals
9. Calendar
10. Forecast
11. Subscriptions
12. Settlements
13. Reconciliation
14. Analytics

---

# 136. Acceptance Criteria — Foundation

Spec 207 foundation is accepted when:

1. Existing Credits run through canonical EconomicEvent/Ledger.
2. Ledger is balanced.
3. Quote/reserve/capture/release works.
4. EconomicIntent links to worker_jobs.
5. Revenue split can be computed from ledgered events.
6. Legacy users experience no regression.

---

# 137. Acceptance Criteria — Multi-Wallet

Accepted when:

1. User can connect at least 3 wallet/funding sources.
2. User can connect multiple accounts from one provider.
3. User can reorder priority.
4. Wallet policy can restrict usage.
5. Insufficient funds can safely fall back.
6. Fraud/policy denial does not auto-fallback.
7. Routing explanation is visible.

---

# 138. Acceptance Criteria — Smart Routing

Accepted when:

1. Effective cost is calculated.
2. Router can choose lowest effective cost.
3. Router respects user/tenant restrictions.
4. Router considers wallet health.
5. Simulation can compare policies.
6. Historical explanation is retained.

---

# 139. Acceptance Criteria — Agent Spending

Accepted when:

1. Agent cannot access raw credentials.
2. Agent spending requires mandate.
3. Agent budget is enforced.
4. Approval threshold works.
5. Mandate can be revoked immediately.
6. Dry-run produces no real charge.

---

# 140. Acceptance Criteria — Financial Calendar

Accepted when:

1. Future subscriptions appear.
2. Future scheduled agent jobs appear.
3. Expected settlements/payouts appear.
4. Estimated vs confirmed events are distinct.
5. Projected closing balance is shown.
6. Shortfall alerts work.
7. Movable events can be rescheduled.
8. Locked events cannot be moved.
9. Wallet expiry conflicts are detected.
10. Calendar links to transaction/job details.

---

# 141. Acceptance Criteria — Settlement

Accepted when:

1. usage events can batch,
2. partner balance can net,
3. settlement is posted to ledger,
4. reconciliation compares provider and internal records,
5. mismatch can be investigated,
6. correction is auditable.

---

# 142. Acceptance Criteria — Interoperability

Accepted when:

1. adding a new payment protocol does not require ledger redesign,
2. adding a wallet provider does not require changing business logic,
3. adding a new authorization standard does not replace SmartAIHub mandates,
4. paid MCP and A2A use the same economic core,
5. protocol version negotiation is supported.

---

# 143. Required Tests

## Unit

- money arithmetic,
- ledger balance,
- policy inheritance,
- wallet filtering,
- routing scoring,
- fallback taxonomy,
- budget reservation,
- mandate limits,
- fee calculation,
- FX handling.

## Integration

- Credits → capability → ledger,
- wallet A insufficient → wallet B,
- timeout → reconcile → fallback,
- reserve → worker job → capture,
- failed job → release,
- partial capture,
- refund,
- recurring obligation,
- financial calendar projection.

## Chaos

- provider outage,
- webhook duplication,
- network timeout,
- delayed webhook,
- worker crash after reserve,
- duplicate capture request,
- balance race condition.

## Security

- tenant isolation,
- credential leakage,
- unauthorized wallet access,
- revoked mandate,
- approval bypass,
- replay attack.

---

# 144. Key Invariants

The following invariants MUST always hold:

1. Posted ledger journals balance.
2. Agent cannot exceed mandate.
3. Agent cannot exceed applicable budget.
4. Wallet hard policy cannot be bypassed by lower-level policy.
5. Tenant hard restriction cannot be weakened by user.
6. Unknown payment state cannot automatically retry to another source.
7. Posted history cannot be silently edited.
8. Capture cannot exceed authorized/reserved amount unless explicit incremental authorization exists.
9. Revenue allocation references a valid economic event.
10. Worker execution cannot access raw payment credential.
11. Wallet frozen state prevents new authorization.
12. Financial Calendar event cannot imply payment finality unless confirmed.

---

# 145. Required Product Modes

## Personal

Simple:
- Credits
- wallet priority
- smart optimize
- transaction history
- calendar

## Power User

Adds:
- custom policies
- routing rules
- advanced budget
- agent mandates
- simulations

## Tenant / Enterprise

Adds:
- shared wallets
- role controls
- approval chains
- tenant policies
- settlement
- reconciliation
- revenue reports
- corporate calendars

---

# 146. Recommended Default Behavior

For normal users:

```text
Routing:
Smart Balanced

Preference:
1. SmartAIHub Credits
2. Lowest-cost allowed wallet
3. User fallback wallet

Safety:
Do not retry hard decline
Do not cross emergency reserve
Ask approval above user threshold
```

Advanced complexity SHOULD remain hidden until enabled.

---

# 147. Recommended Default for Agents

```text
Agent spend:
Disabled until mandate exists

Default mandate:
No external purchase

When enabled:
Per-job budget required
Transaction cap required
Expiry required
```

This avoids accidental autonomous spending.

---

# 148. Explainability Requirement

Whenever SmartAIHub autonomously:

- chooses a wallet,
- rejects a wallet,
- falls back,
- delays payment,
- requests approval,
- reschedules,
- changes provider,

the user MUST be able to see why.

---

# 149. Failure UX

Do not display only:

> Payment failed.

Show:

```text
Company Wallet could not be used:
Insufficient spendable balance.

Next available route:
SmartAIHub Credits — insufficient
Backup Card — available

Action:
Use Backup Card
Add Funds
Cancel
```

For automated agents, route according to mandate.

---

# 150. Financial Calendar as Planning Surface

The Calendar MUST become the place where users can answer:

- What will be paid today?
- What will be paid next week?
- Which agent jobs will consume money?
- Which wallet will be used?
- Where is the account likely to run short?
- What revenue is expected?
- What settlement is coming?
- Can an event be moved?
- Can another wallet reduce cost?
- Which authorization expires before a scheduled job?

This is a major product surface, not merely a reporting widget.

---

# 151. Universal Assistant Integration

SmartAIHub Universal Assistant SHOULD be able to answer finance questions through permissioned tools.

Examples:

- "สัปดาห์หน้าต้องเตรียมเงินเท่าไร"
- "wallet ไหนใช้ถูกที่สุดสำหรับงาน video"
- "ถ้าไม่เติม Wallet A งานไหนจะล้ม"
- "เดือนนี้ค่า video สูงขึ้นเพราะอะไร"
- "เลื่อนงานไหนแล้วประหยัดได้"

Assistant MUST respect Finance permissions.

---

# 152. Suggested Internal Services

Logical components:

```text
EconomicIntentService
QuoteService
BudgetService
MandateService
PolicyEngine
WalletRegistry
WalletHealthService
LiquidityService
RoutingEngine
PaymentOrchestrator
LedgerService
RevenueService
SettlementService
ReconciliationService
RecurringObligationService
FinancialCalendarService
ForecastService
ApprovalServiceAdapter
AuditServiceAdapter
```

These may initially be modules within the existing backend rather than separate microservices.

---

# 153. Avoid Premature Microservices

Initial implementation SHOULD remain modular but deployable within the current backend unless scale or compliance demands separation.

Separate later based on:

- throughput,
- blast radius,
- security isolation,
- compliance,
- team ownership.

---

# 154. Source of Truth Matrix

| Domain | Source of truth |
|---|---|
| Economic intent | Spec 207 DB |
| Wallet connections | Spec 207 DB |
| External provider balance | Provider, cached in Spec 207 |
| Internal Credits | SmartAIHub ledger |
| Ledger | SmartAIHub |
| Job execution | Spec 186 |
| MCP transport | Spec 199 |
| External agent transport | Spec 200 |
| A2A transport | Spec 206 |
| Approval policy | Shared Approval Infrastructure |
| Audit | Shared Audit + Spec 207 economic audit |
| Revenue split | SmartAIHub |
| Provider settlement | Provider + reconciled SmartAIHub record |
| Financial forecast | SmartAIHub derived model |

---

# 155. Decisions That Must Be Locked Early

1. Double-entry ledger.
2. Canonical EconomicIntent.
3. WalletConnection abstraction.
4. Protocol/provider/method/rail separation.
5. Money representation.
6. Policy hierarchy.
7. Safe fallback taxonomy.
8. Reserve/capture semantics.
9. Financial Calendar normalized event model.
10. Provider adapters cannot write business rules directly.

---

# 156. Decisions That Should Remain Flexible

1. Which wallet providers dominate.
2. Which machine-payment protocol dominates.
3. Which commerce protocol dominates.
4. Stablecoin adoption.
5. Provider fee models.
6. provider-specific wallet APIs.
7. exact UI visual design.
8. deployment topology.

---

# 157. Prohibited Architecture Patterns

Do NOT implement:

```text
if cloudflare_wallet:
  business_logic()
```

Do NOT create canonical tables such as:

```text
x402_payments
mpp_business_logic
cloudflare_wallet_balance_as_source_of_truth
```

Do NOT couple:

```text
worker execution
→ raw wallet credential
```

Do NOT map:

```text
every tool call
→ external financial settlement
```

Do NOT treat:

```text
provider success response
→ final ledger posting
```

without canonical validation/idempotency.

---

# 158. Recommended Naming

Product layer:

> SmartAIHub Finance

Architecture layer:

> Agentic Economic Control Plane

Subcomponents:

- Wallet Portfolio
- Smart Routing
- Financial Calendar
- Budget & Mandates
- Settlement Center
- Reconciliation Center
- Revenue Center

---

# 159. Minimum Viable 2027-Ready Core

Before broad external integration, SmartAIHub MUST have:

- canonical EconomicIntent,
- wallet portfolio,
- policy engine,
- budget/mandate,
- quote,
- routing,
- safe fallback,
- reserve/capture,
- Credits adapter,
- double-entry ledger,
- revenue split,
- Financial Calendar,
- settlement abstraction,
- reconciliation hooks.

This foundation is more important than implementing many providers quickly.

---

# 160. Final Architecture Principle

The final system must make the following questions runtime decisions rather than architecture assumptions:

```text
Which wallet should pay?
Which provider is cheapest?
Which route is allowed?
Does this agent have permission?
Is there enough spendable balance?
Should payment happen now?
Can it be batched?
Can it be netted?
Should another wallet be used?
Should a person approve?
Can execution be rescheduled?
Which protocol does the counterparty support?
```

The answer must be derived from:

```text
Intent
+ Policy
+ Budget
+ Mandate
+ Wallet Portfolio
+ Cost
+ Balance
+ Risk
+ Time
+ Provider Capability
+ Protocol Capability
```

---

# 161. End-State Vision

SmartAIHub should evolve from:

> A SaaS platform where users prepay credits and consume AI services.

into:

> A provider-neutral economic control plane where humans and autonomous agents can safely discover, purchase, sell, schedule, optimize, account for, and settle AI capabilities across SmartAIHub and external ecosystems.

The existing Credits system remains a core advantage:

- it is the high-frequency internal rail,
- it minimizes unnecessary external transaction fees,
- it integrates naturally with revenue sharing,
- it supports very small usage events,
- and it provides continuity for existing users.

The new architecture expands around it rather than replacing it.

By the end of 2027, users should be able to connect multiple wallets, define wallet-specific policies, reorder priority, let SmartAIHub automatically choose a cheaper eligible source, safely fall back when funds are insufficient, delegate controlled budgets to agents, inspect every economic decision, and plan future spending through a unified Financial Calendar.

No future wallet provider, payment protocol, commerce standard, or settlement rail should require SmartAIHub to redesign its core economic model.

---

# 162. Definition of Done

Spec 207 is considered fully implemented when:

1. Existing SmartAIHub Credits and payment funding work without regression.
2. Each user can maintain multiple wallet/provider accounts.
3. Wallets have independent policies and priority.
4. Smart routing can optimize cost while honoring policy.
5. Safe fallback handles insufficient balance and provider failures without duplicate charges.
6. Agents can spend only through explicit mandates and budgets.
7. x402/MPP-class machine payment adapters can be added without changing the core ledger.
8. Authorization standards can be added as adapters.
9. Commerce standards can be added as adapters.
10. Wallet providers can be added as adapters.
11. Every financial event is auditable.
12. Ledger is double-entry and reconciliable.
13. Revenue sharing runs from canonical economic events.
14. Usage can be aggregated before external settlement.
15. Settlement supports batch/net/defer.
16. Financial Calendar shows future expenses, revenue, jobs, subscriptions, settlements, payouts, and authorizations.
17. Projected wallet balances and shortfalls are visible.
18. Future agent jobs reserve/forecast cost before execution.
19. Users can simulate policies and routing before enabling them.
20. Users can freeze agent spending at multiple scopes.
21. Workers never receive raw payment credentials.
22. Provider outages and unknown finality states do not create duplicate charges.
23. Reconciliation identifies missing, duplicate, mismatched, and delayed transactions.
24. SmartAIHub remains independent from any single 2027 payment, wallet, or agentic commerce standard.

---

## Appendix A — Example End-to-End Flow

User request:

> Create a 30-second product ad. Budget not over 300 THB.

```text
User
 ↓
Agent
 ↓
EconomicIntent(max=300)
 ↓
Mandate Check
 ↓
Quote Plan
  Research      5
  Image        30
  Voice        10
  Video       180
  Editing      25
 ----------------
 Estimated    250
 ↓
Budget Reserve 300
 ↓
Route each economic event
 ↓
Internal events use Credits
External provider call uses best eligible wallet
 ↓
Execution
 ↓
Actual cost = 241
 ↓
Capture 241
Release 59
 ↓
Ledger
 ↓
Revenue Allocation
 ↓
Calendar/Forecast updated
```

---

## Appendix B — Example Fallback Flow

```text
Transaction = 200 THB

Wallet Priority:
1. Credits
2. Company Wallet
3. Backup Card

Credits:
Spendable 120
→ insufficient for single-source

Company Wallet:
Provider timeout
→ status unknown
→ reconcile first

Provider reconciliation:
confirmed failed

Backup Card:
available
→ authorize
→ capture
```

No duplicate charge occurs.

---

## Appendix C — Example Cost-Aware Flow

```text
Transaction: 1,000 THB

Wallet A:
fee 3.2%
effective = 1,032

Wallet B:
fee 1.0%
FX 0.5%
effective = 1,015

Wallet C:
fee 0.2%
but transaction category denied

Selected:
Wallet B
```

---

## Appendix D — Example Financial Calendar

```text
Sep 24
09:00 SaaS subscription       -450 THB
14:00 Partner payout        -2,000 THB

Sep 25
02:00 Image generation job  -800 to -1,200 THB
17:00 Tenant settlement     +3,800 THB

Sep 26
08:00 Auto top-up           -1,000 THB
```

Projected balances and shortfalls are recalculated whenever:

- event moves,
- wallet changes,
- quote changes,
- budget changes,
- income changes,
- provider status changes.

---

## Appendix E — Implementation Rule of Thumb

When adding a new financial technology, developers should ask:

> Is this a new business concept, or merely a new adapter for an existing canonical concept?

In most cases:

- new wallet → WalletProvider adapter,
- new machine-payment standard → PaymentProtocol adapter,
- new delegated authorization standard → AuthorizationProvider adapter,
- new commerce standard → CommerceProtocolAdapter,
- new trust standard → AgentTrustProvider adapter,
- new funding rail → Settlement/Payment Method adapter.

If implementing a new provider requires changes to the ledger schema, revenue-sharing model, or EconomicIntent model, the integration should be reviewed as a likely architectural violation.


---

# 163. Canonical Counterparty, Merchant, Beneficiary, and Destination Identity

A payment policy MUST NOT rely only on provider-specific merchant IDs, URLs, free-text names, or payment addresses.

SmartAIHub SHALL maintain a canonical `EconomicCounterparty` model so the same merchant/service can be recognized across multiple providers and protocols.

Suggested entities:

```text
EconomicCounterparty
├── counterparty_id
├── legal/display identity
├── counterparty_type
├── verification_state
├── risk_state
└── aliases / provider identifiers

CounterpartyEndpoint
├── provider
├── merchant/account id
├── wallet address / destination token
├── protocol endpoint
└── validity period
```

Supported counterparty types SHOULD include:

- SMARTAIHUB_PLATFORM
- TENANT
- SKILL_OWNER
- PLUGIN_OWNER
- EXTERNAL_SERVICE
- MERCHANT
- WALLET
- AGENT_OPERATOR
- PARTNER
- PAYOUT_RECIPIENT

Wallet allowlists/denylists and spending mandates SHOULD target `counterparty_id` or a verified category whenever possible rather than a mutable external string.

If an external provider changes its merchant identifier, SmartAIHub SHOULD be able to map the new identifier to the same canonical counterparty without rewriting existing policies.

## 163.1 Destination binding

A payment authorization SHOULD bind:

```text
Principal
+ Delegate
+ Counterparty
+ Capability / Purpose
+ Maximum Amount
+ Currency
+ Expiry
```

Changing the destination after authorization SHALL require policy re-evaluation and, when material, re-authorization.

## 163.2 Counterparty verification states

- UNVERIFIED
- DISCOVERED
- VERIFIED
- TRUSTED
- RESTRICTED
- BLOCKED

Routing MUST NOT silently route an authorization created for Counterparty A to Counterparty B merely because both provide a similar capability.

---

# 164. Accounting Precision, Rounding, Negative Balance, and Period Close

The monetary requirements in Sections 36–37 are extended by this section.

## 164.1 Deterministic rounding

Every currency or value unit SHALL define:

- storage precision,
- display precision,
- provider precision,
- rounding mode,
- minimum transferable unit.

Rounding MUST occur at explicit boundaries and MUST NOT be left to language/runtime defaults.

Suggested default for fiat calculations:

```text
Internal calculations → high-precision decimal
Provider request       → provider-required precision
Ledger posting         → currency/account precision
Display                → locale-specific display precision
```

Revenue splitting MUST define deterministic remainder allocation.

Example:

```text
10.00 THB split 33.33 / 33.33 / 33.34
```

The final minor-unit remainder MUST be assigned according to a versioned rule, not discarded.

## 164.2 Multi-currency journal rule

A ledger journal MUST balance per defined accounting treatment.

Currency conversion SHALL create explicit FX legs rather than pretending two currencies are the same value.

Store:

- source amount/currency,
- destination amount/currency,
- rate,
- rate source,
- timestamp,
- spread/markup,
- realized FX gain/loss when applicable.

## 164.3 Negative balance policy

Balances MUST declare whether negative values are allowed.

Default:

```text
User Credits         → negative NOT allowed
Agent Budget         → negative NOT allowed
Partner Payable      → may be negative only by accounting policy
Provider Receivable  → according to accounting rules
```

An economic workflow MUST NOT create an unintended user debt by allowing capture beyond funded/reserved balance.

## 164.4 Accounting periods

Enterprise/financial reporting SHOULD support period states:

- OPEN
- SOFT_CLOSED
- CLOSED
- REOPENED_WITH_AUDIT

Closing a period SHALL NOT prevent late provider events from being recorded. Late events MUST be posted according to accounting policy, with explicit references to the original transaction and affected period.

## 164.5 Posted versus provisional

The system SHALL distinguish:

- forecast,
- provisional,
- authorized,
- posted,
- settled,
- reversed.

Forecast or authorization data MUST NOT be included as finalized revenue merely because the UI has displayed it.

---

# 165. Routing Finality, Slippage, Attempt Budget, and Route Pinning

## 165.1 Route selection is not permanent until authorization

The system MAY recalculate a route before authorization if:

- fees changed,
- FX changed,
- balance changed,
- provider health changed,
- quote expired.

After a provider authorization/reservation succeeds, the route SHALL be pinned unless a controlled compensation/re-authorization flow occurs.

## 165.2 Slippage tolerance

EconomicIntent or policy MAY define:

```yaml
max_price_slippage_percent: 3
max_fee_slippage_minor: 100
max_fx_slippage_percent: 1
```

If final cost exceeds allowed slippage:

```text
Do not silently capture
→ refresh quote / require approval / cancel according to policy
```

## 165.3 Attempt budget

A PaymentIntent SHALL have safeguards against uncontrolled cascading:

- maximum payment attempts,
- maximum distinct wallet attempts,
- retry cooldown,
- maximum total external fees during retries,
- overall deadline.

Example:

```yaml
attempt_policy:
  max_attempts: 3
  max_wallets: 2
  max_retry_fees: 5.00
  currency: THB
```

## 165.4 Routing determinism

Given the same:

- policy versions,
- quote snapshot,
- wallet snapshot,
- provider health snapshot,
- routing engine version,

SmartAIHub SHOULD be able to reconstruct why a route was selected.

Store an immutable `routing_input_snapshot_hash` or equivalent evidence reference.

---

# 166. Delegation Chains, Sub-Agents, and No Privilege Amplification

Agentic workflows may create or call sub-agents. A mandate delegated to Agent A MUST NOT automatically become an unrestricted mandate for Agent B.

## 166.1 Delegation chain

Canonical chain:

```text
Human / Organization Principal
          ↓
     Agent A mandate
          ↓
    delegated subset
          ↓
       Agent B
```

Delegated scope MUST be equal to or narrower than the parent scope.

Rule:

```text
child_scope ⊆ parent_scope
child_budget ≤ parent_remaining_budget
child_expiry ≤ parent_expiry
```

## 166.2 Delegation depth

Policy SHALL support:

```text
max_delegation_depth
allow_subdelegation
allowed_delegate_types
```

Default for newly enabled agent spending SHOULD be `allow_subdelegation = false`.

## 166.3 Audience-bound authorization

Capability/payment tokens SHOULD be bound to:

- intended agent,
- intended service/counterparty,
- intended capability,
- expiry,
- nonce/idempotency context.

Tokens MUST NOT be portable to an unrelated merchant or capability.

## 166.4 Revocation propagation

Revoking a parent mandate SHALL invalidate or suspend all derived child mandates that depend on it.

The system SHALL support rapid revocation checks without requiring a full provider round-trip for every internal operation.

## 166.5 Agent identity rotation

If agent identity keys/credentials rotate, mandate continuity MUST require explicit validated mapping to the new identity.

A newly observed identity MUST NOT inherit spending privileges solely because it has the same display name.

---

# 167. Financial Calendar Time Semantics, Recurrence, Cutoffs, and Business Days

Financial scheduling MUST be timezone-safe.

## 167.1 Timezone model

Every scheduled economic event SHALL store:

- canonical instant when known,
- scheduling timezone,
- original local date/time,
- timezone database identifier,
- recurrence semantics when applicable.

Do not store only a naive local timestamp.

## 167.2 DST and timezone changes

Recurring events SHALL define whether recurrence follows:

- local wall-clock time, or
- fixed elapsed interval.

Example:

```text
"Every month at 09:00 Asia/Bangkok"
```

must remain a local-calendar recurrence, not become an arbitrary UTC interval.

## 167.3 Due date versus execution dates

Calendar model SHOULD distinguish:

- planned_at,
- authorize_at,
- reserve_at,
- execute_at,
- due_at,
- expected_settlement_at,
- actual_settlement_at.

One payment may therefore appear as one logical calendar item with several milestones rather than several unrelated transactions.

## 167.4 Provider and banking cutoffs

Scheduling/forecasting SHOULD account for provider-declared:

- cutoff times,
- business days,
- weekends,
- holidays where known,
- settlement delays.

If these are unknown, the UI MUST mark the date as estimated rather than guaranteed.

## 167.5 Recurrence

Recurring obligations SHALL support a normalized recurrence model and provider-specific recurrence metadata.

The scheduler SHALL safely handle:

- monthly dates that do not exist in every month,
- end-of-month semantics,
- leap years,
- paused subscriptions,
- provider-rescheduled billing dates.

---

# 168. Forecast Snapshots, Confidence, and Calendar Conflict Resolution

## 168.1 Forecast snapshots

Forecast results SHALL be versioned snapshots rather than only ephemeral calculations.

Store enough metadata to explain:

- inputs,
- model/rule version,
- generated_at,
- horizon,
- confidence assumptions.

This allows forecast accuracy to be measured later.

## 168.2 No double counting

A scheduled agent job that already created a reservation MUST NOT also be counted as a separate full estimated expense.

Calendar/forecast normalization SHALL reconcile lifecycle states:

```text
Estimated → Reserved → Captured → Settled
```

Only the correct economic exposure is counted at each stage.

## 168.3 Resource and cash conflicts

The planning engine SHOULD detect:

- multiple jobs competing for the same budget,
- multiple events consuming the same wallet balance,
- scheduled payment occurring before expected inflow,
- wallet credential expiring before execution,
- project deadline conflicting with cheapest execution window.

## 168.4 Forecast scenario comparison

Scenario planning SHOULD show delta between scenarios:

```text
Baseline
vs
Move job to Sep 22
vs
Use Wallet B
```

Outputs SHOULD include:

- total projected cost,
- fees,
- cash shortfall risk,
- affected deadlines,
- wallet utilization.

---

# 169. Settlement Cutoffs, Cross-Currency Netting, Late Adjustments, and Payout Eligibility

## 169.1 Settlement cutoff

Every settlement account/provider SHOULD support:

- timezone,
- cutoff time,
- settlement frequency,
- minimum payout,
- expected arrival window.

Financial Calendar SHALL show both settlement initiation and expected receipt when they differ materially.

## 169.2 Netting constraints

Net settlement MUST NOT mix currencies unless there is an explicit FX conversion step.

Example:

```text
+100 USD receivable
-3,000 THB payable
```

must not become a single arithmetic net amount without conversion policy and recorded FX evidence.

## 169.3 Late adjustments

Provider fees, disputes, or settlement corrections may arrive after initial settlement.

These SHALL create new adjustment events and ledger entries linked to the original settlement.

Do not mutate the original settlement total silently.

## 169.4 Payout eligibility

A recipient MAY be temporarily ineligible for payout because of:

- missing verification,
- provider restriction,
- dispute hold,
- minimum threshold,
- compliance review,
- destination failure.

Revenue may remain accrued/payable while payout is blocked.

Accounting entitlement and payout ability MUST be separate concepts.

## 169.5 Reserve/hold support

Revenue policy MAY define rolling reserves or temporary holds for categories with dispute/chargeback risk.

Holds MUST be visible and auditable.

---

# 170. Compliance Scope, Custody Boundary, Authentication, and Data Retention

This section defines architecture readiness, not jurisdiction-specific legal advice.

## 170.1 PCI and card-data scope minimization

SmartAIHub SHOULD minimize payment-card compliance scope by using provider-hosted/tokenized collection whenever practical.

Raw PAN/CVV SHOULD NOT enter SmartAIHub application logs, normal database tables, agent context, or worker payloads.

If future requirements introduce direct handling, the implementation MUST undergo a dedicated compliance/security design review before activation.

## 170.2 Strong customer authentication / step-up

Providers may require user presence or additional authentication for particular payments.

Canonical payment states SHALL support:

- ACTION_REQUIRED
- USER_AUTHENTICATION_REQUIRED
- PROVIDER_CHALLENGE

An agent MUST NOT treat a step-up requirement as a generic failure eligible for blind fallback.

## 170.3 Custody boundary

Each wallet/funding integration SHALL declare whether SmartAIHub:

- merely references an external source,
- controls a provider-issued delegated credential,
- holds an internal closed-loop credit liability,
- or would otherwise be considered to hold/custody user value.

Provider onboarding MUST include a legal/compliance classification before production enablement where material.

## 170.4 Credits semantics

The product and API MUST avoid representing internal Credits as universally redeemable cash unless SmartAIHub business/legal rules explicitly support that behavior.

Credit transferability, expiry, refundability, withdrawal, and tenant portability SHALL be explicit policies.

## 170.5 Data retention and deletion

Financial records may have retention requirements that conflict with ordinary user deletion requests.

The architecture SHALL separate:

- deletable profile/presentation data,
- retained legal/accounting records,
- tokenized provider references,
- immutable audit evidence.

PII SHALL be minimized or pseudonymized where feasible while preserving required accounting/audit integrity.

---

# 171. Distributed Transaction Saga and Crash-Consistency Rules

Payment + job execution is a distributed workflow and SHALL NOT rely on one database transaction spanning external providers and workers.

Use an explicit state machine / saga.

## 171.1 Canonical saga

```text
EconomicIntent
    ↓
Quote
    ↓
Policy/Approval
    ↓
Reserve/Authorize
    ↓
Persist reservation state
    ↓
Publish job via durable outbox
    ↓
worker_job executes
    ↓
Result committed
    ↓
Capture
    ↓
Ledger posting
    ↓
Settlement/Reconciliation
```

## 171.2 Required crash cases

Implementation tests MUST cover at least:

1. provider reserve succeeds, DB commit fails,
2. DB marks reserved, job publish fails,
3. job executes twice after retry,
4. job succeeds, capture request times out,
5. capture succeeds, webhook delayed,
6. capture succeeds, ledger posting temporarily fails,
7. refund succeeds externally, internal update fails,
8. settlement webhook is duplicated/out of order.

Each case MUST have a deterministic recovery path.

## 171.3 Outbox/inbox

Financial commands/events SHOULD use:

- transactional outbox for outbound side effects,
- idempotent inbox/event receipt for provider callbacks,
- replay-safe handlers.

## 171.4 Compensation

Compensation MUST be state-aware.

Example:

```text
Reserved + job not started → release reservation
Job succeeded + capture unknown → reconcile, do not rerun job
Capture confirmed + result delivery failed → retry delivery, not charge
```

---

# 172. Disaster Recovery, Backup, RPO/RTO, and Financial Restore Validation

## 172.1 Recovery objectives

Production deployment SHALL define explicit targets for:

- RPO (Recovery Point Objective),
- RTO (Recovery Time Objective),
- provider webhook replay window,
- idempotency-key retention window.

Exact values may vary by deployment tier but MUST be documented before production launch.

## 172.2 Backup requirements

Backups SHALL include or allow reconstruction of:

- ledger journals/entries,
- EconomicIntent state,
- payment attempts,
- reservations/captures/refunds,
- provider references,
- policy versions,
- wallet configuration,
- settlement/reconciliation evidence.

Secrets SHOULD be backed up according to the secret-management platform rather than copied into application backups.

## 172.3 Restore validation

A restore is not considered successful until:

1. ledger invariant checks pass,
2. provider transactions after the recovered checkpoint are reconciled,
3. unknown finality transactions are quarantined,
4. duplicate outgoing payment commands are prevented,
5. balances reconcile within documented tolerances.

## 172.4 Provider replay

Where providers support event replay/listing, disaster recovery SHOULD re-fetch events by provider cursor/time window rather than trusting only local webhook history.

---

# 173. Idempotency Retention, Event Ordering, and Clock Safety

## 173.1 Idempotency retention

Idempotency keys for financial commands SHALL be retained for at least the provider's effective retry/replay horizon and SmartAIHub's own job-retry horizon.

Do not expire keys so aggressively that a delayed retry can create a duplicate charge.

## 173.2 Event ordering

Provider callbacks may be duplicated or arrive out of order.

State transitions MUST validate current state and provider event version/timestamp/reference before applying updates.

Example:

```text
CAPTURED
then delayed AUTHORIZED event arrives
→ ignore as stale; retain audit record
```

## 173.3 Clock safety

Do not rely exclusively on local process clocks for finality ordering.

Store:

- received_at,
- provider_created_at when available,
- provider sequence/version when available.

Security-sensitive token expiry checks SHALL tolerate only narrowly defined clock skew.

---

# 174. UI/UX Completeness: Onboarding, Accessibility, Mobile, and Progressive Disclosure

## 174.1 Progressive disclosure

Normal users SHOULD see a simple finance experience.

Advanced concepts such as protocol selection, settlement rail, FX routing weights, or mandate delegation depth SHOULD remain behind Advanced settings unless directly relevant.

## 174.2 Wallet onboarding

Connection wizard SHALL display before activation:

- provider name,
- currencies,
- capabilities,
- whether balance is real-time or delayed,
- known fees/fee-estimate availability,
- supported fallback behavior,
- credential expiry/reauth behavior,
- test/live status.

A connection verification step MUST occur before the wallet is eligible for automatic routing.

## 174.3 Payment confirmation UX

When human confirmation is required, show:

- merchant/counterparty,
- purpose/capability,
- amount or maximum amount,
- currency,
- wallet,
- estimated total fees,
- whether recurring,
- whether the agent may repeat the action.

Avoid confirmation text that only says "Approve payment" without context.

## 174.4 Mobile and responsive behavior

Wallet list, approval flow, Transaction Explorer, and Financial Calendar SHALL have usable responsive layouts.

Calendar mobile mode MAY default to agenda/day view rather than compressing a desktop month grid.

## 174.5 Accessibility

Critical financial states MUST NOT rely on color alone.

UI SHOULD support:

- keyboard navigation,
- screen-reader labels,
- textual status indicators,
- accessible chart/table alternatives,
- locale-aware number/date formatting.

## 174.6 Localization

Presentation SHALL support locale-aware:

- currency formatting,
- date/time,
- decimal separators,
- timezone display.

Canonical stored data remains locale-independent.

---

# 175. Financial Operations Console and Support Evidence Package

Admin/support operations need a controlled interface separate from normal user finance UI.

## 175.1 Operations Console

Authorized operators SHOULD be able to:

- search by EconomicIntent/payment/provider/job reference,
- inspect finality state,
- inspect provider evidence,
- trigger safe reconciliation,
- retry non-financial delivery actions,
- freeze routes,
- mark provider degraded,
- attach investigation notes,
- initiate approved correction/refund workflows.

Operators MUST NOT be able to arbitrarily edit posted ledger entries.

## 175.2 Evidence package

For a disputed/failed transaction, system SHOULD generate an evidence bundle containing:

- intent,
- quote,
- mandate/approval,
- routing decision,
- provider references,
- relevant worker_job result,
- ledger journals,
- webhook/event timeline,
- settlement/reconciliation state.

Sensitive credentials MUST be excluded/redacted.

## 175.3 Manual corrections

Manual correction SHALL require:

- reason code,
- operator identity,
- optional second approval above configured threshold,
- compensating journal entry,
- audit event.

---

# 176. Provider Lifecycle, Adapter Compatibility, and Kill Switches

## 176.1 Provider lifecycle states

- DEVELOPMENT
- SANDBOX
- PILOT
- ACTIVE
- DEGRADED
- BLOCK_NEW_ROUTING
- DEPRECATED
- DISABLED

## 176.2 Capability discovery

Adapters SHALL expose capabilities dynamically where possible.

SmartAIHub SHOULD NOT assume a provider supports reserve/capture/refund merely because another account at the same provider does.

Capabilities MAY vary by:

- region,
- account,
- currency,
- product tier,
- protocol version.

## 176.3 Adapter contract versioning

Adapter interface versions SHALL be explicit.

Core upgrades MUST include compatibility tests for all ACTIVE adapters.

## 176.4 Provider kill switch

Admin SHALL be able to prevent new routing to a provider while allowing reconciliation/finality processing for existing transactions.

This is distinct from disabling all processing.

## 176.5 Deprecation

Provider/protocol deprecation SHALL include:

- warning period,
- affected wallet report,
- scheduled-payment impact report,
- migration path,
- removal date.

---

# 177. Performance, Capacity, SLOs, and Backpressure

Spec 207 is on the critical path of agent execution and MUST define production targets.

## 177.1 SLO categories

Set measurable targets for:

- policy evaluation latency,
- internal-credit authorization latency,
- quote latency excluding external provider delay,
- ledger posting latency,
- calendar read latency,
- reconciliation freshness,
- payment orchestration availability.

Exact numerical targets SHALL be finalized from expected deployment scale before production.

## 177.2 Backpressure

When providers or internal queues degrade:

- do not generate uncontrolled payment retries,
- throttle non-urgent quote refreshes,
- preserve critical finality/reconciliation work,
- prioritize capture/refund/finality events over analytics refresh.

## 177.3 High-volume ledger

Ledger/event tables SHOULD be designed for:

- append-heavy workloads,
- indexed tenant/time lookup,
- archival/partition strategy,
- reproducible reports.

Analytics queries SHOULD NOT lock or degrade payment-critical writes.

## 177.4 Load tests

Required load scenarios:

- burst of agent micro-events,
- concurrent shared-wallet reservations,
- provider outage causing fallback pressure,
- webhook storm/replay,
- calendar forecast refresh across many users.

---

# 178. Rollout Safety: Feature Flags, Shadow Routing, and Parallel Validation

## 178.1 Feature flags

New providers/protocols/routing strategies SHALL support controlled rollout by:

- environment,
- tenant,
- user cohort,
- percentage,
- provider account.

## 178.2 Shadow routing

Before Smart Routing is allowed to move real money, the system SHOULD support shadow mode:

```text
Actual route: existing production rule
Shadow route: new optimizer decision
```

Compare:

- cost,
- success estimate,
- wallet choice,
- policy result,

without issuing a second payment.

## 178.3 Ledger parallel validation

During migration from legacy credit accounting, dual-recording MAY be used temporarily.

A release gate SHALL compare legacy totals against canonical ledger totals.

No cutover while unexplained differences exceed the agreed tolerance.

## 178.4 Progressive autonomy

Recommended agent-spending rollout:

```text
Observe only
→ Simulation
→ User approval every purchase
→ Auto below small threshold
→ Policy-controlled autonomy
```

Do not jump directly from no autonomous spending to unrestricted agent purchasing.

---

# 179. Expanded Test Matrix and Release Gates

The tests in Section 143 are mandatory and are expanded as follows.

## 179.1 Accounting tests

- deterministic rounding,
- revenue split remainder,
- multi-currency journals,
- FX gain/loss,
- period close and late adjustment,
- negative-balance prevention.

## 179.2 Delegation tests

- child mandate cannot exceed parent,
- revoked parent invalidates child,
- token cannot be reused for another merchant,
- expired delegate identity rejected,
- delegation-depth enforcement.

## 179.3 Calendar tests

- timezone conversion,
- DST boundary where applicable,
- end-of-month recurrence,
- leap year,
- provider cutoff,
- no forecast double counting after reservation,
- reschedule changes forecast correctly.

## 179.4 Saga tests

For each crash point in Section 171, demonstrate recovery without:

- duplicate payment,
- duplicate job side effect,
- lost capture,
- orphan reservation,
- ledger imbalance.

## 179.5 Routing tests

- attempt budget,
- fee slippage,
- FX slippage,
- pinned route after reservation,
- provider kill switch,
- counterparty policy mapping.

## 179.6 Security/compliance tests

- raw credential never reaches worker,
- redaction checks,
- replay attack,
- expired token,
- tenant boundary,
- step-up authentication handling.

## 179.7 Release gates

A finance release MUST NOT go to full production unless:

1. ledger invariants pass,
2. provider contract tests pass,
3. reconciliation test passes,
4. rollback/kill-switch path is verified,
5. audit trail is complete,
6. migration delta is within approved tolerance,
7. critical chaos scenarios pass.

---

# 180. Ten-Pass Gap Audit Record — Revision R2

This section records the architecture dimensions reviewed before Revision R2 was finalized.

| Pass | Review dimension | Gap found | Normative fix |
|---|---|---|---|
| 1 | Architecture boundaries | No canonical merchant/beneficiary identity; provider IDs could leak into policy | Added Section 163 |
| 2 | Accounting correctness | Missing deterministic rounding, FX journal semantics, negative-balance rules, period close | Added Section 164 |
| 3 | Wallet/routing correctness | Missing route pinning, slippage limits, bounded cascade attempts | Added Section 165 |
| 4 | Agent authorization | Missing sub-agent delegation chain and privilege-amplification controls | Added Section 166 |
| 5 | Calendar/forecast | Missing timezone/DST/cutoff semantics and forecast deduplication | Added Sections 167–168 |
| 6 | Settlement/reconciliation | Missing cross-currency netting rule, late adjustments, payout eligibility/holds | Added Section 169 |
| 7 | Security/compliance | Missing PCI-scope minimization, step-up states, custody/credit semantics, retention separation | Added Section 170 |
| 8 | Failure recovery | Missing explicit payment/job saga, crash-point recovery and disaster restore validation | Added Sections 171–173 |
| 9 | UI/UX/operations | Missing progressive disclosure, accessibility/mobile requirements and finance operations evidence tooling | Added Sections 174–175 |
| 10 | Delivery/operations | Missing provider lifecycle, SLO/backpressure, shadow rollout and stronger release gates | Added Sections 176–179 |

## 180.1 R2 result

After these additions, the specification explicitly covers:

- provider-neutral economic architecture,
- financial accounting invariants,
- multi-wallet orchestration,
- bounded/safe fallback,
- delegated and sub-delegated agent spending,
- calendar-grade time semantics,
- forecast consistency,
- settlement and payout lifecycle,
- security/compliance boundaries,
- distributed failure recovery,
- operator support workflows,
- adapter lifecycle,
- performance/backpressure,
- safe migration and rollout.

Any implementation plan derived from Spec 207 MUST treat Sections 163–179 as part of the main specification, not optional appendices.

A post-audit consistency review additionally identified payment-timing and rail-finality gaps; these are closed normatively by Sections 181–182.

---

# 181. Payment Timing, Fulfillment Protection, and Delivery Acceptance

Not every payment method supports reserve-then-capture. The canonical model SHALL support multiple payment timing models.

Supported timing classes:

- PREPAID — value transfers before execution,
- AUTHORIZE_CAPTURE — authorize/reserve before execution and capture after success,
- POSTPAID — usage is recorded first and settled afterward,
- METERED_BATCH — many usage events accumulate before settlement,
- ESCROW_LIKE — value is committed but released according to fulfillment conditions where a provider supports such semantics,
- INVOICE — obligation is created and paid later.

A capability Offer or provider capability profile SHALL declare supported timing semantics.

## 181.1 Fulfillment linkage

Payment state and capability fulfillment state MUST be distinct but linked.

Suggested fulfillment states:

- NOT_STARTED
- IN_PROGRESS
- DELIVERED
- VALIDATING
- ACCEPTED
- PARTIALLY_ACCEPTED
- REJECTED
- FAILED

Example:

```text
PREPAID external service
      ↓
payment confirmed
      ↓
execution fails
      ↓
refund/credit/claim path
```

must not be treated the same as:

```text
AUTHORIZE_CAPTURE service
      ↓
reserve
      ↓
execution fails
      ↓
release
```

## 181.2 Delivery validation

For high-value agent jobs, policy MAY require output validation before final capture or acceptance where the payment rail supports delayed capture.

Validation MAY include:

- job status,
- output existence,
- checksum/content reference,
- minimum output duration/format,
- provider receipt,
- human approval for high-value work.

## 181.3 Partial fulfillment

If a job produces partial value, SmartAIHub SHALL NOT invent a partial charge unless:

- pricing terms define partial fulfillment,
- provider supports it,
- policy allows it.

Partial fulfillment terms SHOULD be included in the Offer/Quote.

## 181.4 Expensive irreversible prepayment

For irreversible or difficult-to-refund payment methods, router policy SHOULD apply stronger controls such as:

- lower automatic-spend threshold,
- trusted counterparty requirement,
- fresh quote requirement,
- stronger mandate/approval,
- no speculative provider switching after payment finality.

---

# 182. Settlement Rail Safety Profile and Finality Semantics

Payment rails differ materially. SmartAIHub SHALL normalize rail risk/capability metadata instead of assuming card, bank, internal credit, and digital-asset rails behave identically.

Suggested `RailSafetyProfile` fields:

```yaml
rail_safety_profile:
  rail_id: rail_x
  reversibility: REVERSIBLE | LIMITED | IRREVERSIBLE
  chargeback_possible: true
  refund_supported: true
  finality_model: PROVIDER_FINAL | DELAYED | CONFIRMATION_BASED
  settlement_delay_class: INSTANT | SAME_DAY | MULTI_DAY | VARIABLE
  recipient_validation: SUPPORTED | LIMITED | NONE
  memo/reference_support: true
  fee_predictability: HIGH | MEDIUM | LOW
```

## 182.1 Finality-aware routing

Routing MAY consider rail finality and reversibility in addition to cost.

Example:

```text
Low-value trusted machine API
→ low-cost irreversible rail may be acceptable

High-value first-time counterparty
→ prefer reversible/controlled authorization route
```

subject to user and tenant policy.

## 182.2 Confirmation-based rails

For rails that require confirmation/finality progression, canonical transaction state SHOULD support:

- SUBMITTED
- SEEN
- CONFIRMING
- FINAL
- REORGED_OR_REVERSED where applicable

Execution policy MUST define whether fulfillment may begin before full finality.

## 182.3 Stable-value asset risk

If a wallet uses an asset intended to track another currency, the system SHALL still treat:

- asset identity,
- issuer/provider,
- network,
- conversion rate,
- liquidity,
- depeg/price deviation policy

as separate from the reporting currency.

Do not assume `1 asset unit = 1 USD` for accounting without an explicit valuation rule.

## 182.4 Destination safety

For irreversible destination-address payments, policy SHOULD support:

- verified destination allowlists,
- address/account fingerprint display,
- first-use approval,
- destination change re-approval,
- optional small-value verification where appropriate.

Agents MUST NOT be allowed to substitute a new destination after authorization without re-evaluation.

## 182.5 Rail-specific adapter ownership

Rail-specific confirmation, refund, chargeback, or finality logic belongs in the relevant provider/rail adapter. The core consumes normalized capabilities and states.
---

# 183. Multi-Region Consistency, Ledger Authority, and Split-Brain Prevention

Spec 207 may eventually be deployed across multiple regions, but financial correctness MUST take precedence over low-latency active-active writes.

## 183.1 Logical write authority

For every mutable financial aggregate, the system SHALL have one logical write authority at a time.

Examples:

- ledger account,
- WalletConnection state,
- BudgetEnvelope,
- SpendingMandate,
- PaymentIntent,
- Reservation,
- Settlement,
- payout instruction.

The physical implementation MAY use distributed databases, but application semantics MUST prevent two regions from independently authorizing contradictory spend against the same balance.

## 183.2 Ledger write model

Recommended default:

```text
Global reads / regional read replicas
              │
              ▼
     Single logical ledger writer
      per shard / tenant / account
```

Alternative implementations MAY use strongly consistent distributed transactions if their correctness properties are documented and tested.

Eventually consistent replication MUST NOT be used as the only control preventing overspend.

## 183.3 Failover fencing

Regional failover SHALL use a fencing mechanism such as:

- monotonically increasing epoch,
- lease generation,
- consensus-backed ownership,
- equivalent safe fencing token.

A stale region MUST NOT continue posting ledger entries after authority moved elsewhere.

Every authoritative financial command SHOULD record:

```yaml
write_authority:
  region: region_a
  epoch: 42
```

## 183.4 Global idempotency

Idempotency keys for financial side effects MUST be globally unique within the relevant SmartAIHub environment, not merely unique per region.

Failover MUST preserve idempotency history.

## 183.5 Regional isolation mode

If cross-region coordination is unavailable, the system SHALL prefer:

```text
temporarily reject or queue new spend
```

over:

```text
accept spend independently in multiple regions
```

for balances that cannot be safely partitioned.

## 183.6 Region-scoped spend partitions

Where business requirements justify offline/regional autonomy, a parent balance MAY explicitly allocate independent regional spending envelopes.

Example:

```text
Global corporate budget: 100,000 THB

Region A envelope: 30,000
Region B envelope: 30,000
Unallocated reserve: 40,000
```

Each region may spend only from its allocated envelope until central coordination resumes.

## 183.7 Data residency

Financial objects SHALL carry residency/classification metadata where tenant or provider requirements require regional storage restrictions.

Routing an API request through another region MUST NOT silently move restricted financial or identity data across a prohibited boundary.

---

# 184. Provider Contract Drift, Schema Evolution, and Compatibility Verification

External providers can change APIs, webhook payloads, fee behavior, authentication requirements, capability availability, or protocol versions without changing SmartAIHub's canonical model.

## 184.1 Versioned adapter contracts

Every provider adapter SHALL declare:

```yaml
adapter_contract:
  adapter_name: provider_x
  adapter_version: 3
  provider_api_versions:
    - "2026-08"
  normalized_contract_version: 2
```

The core SHALL depend on the normalized adapter contract, not directly on external JSON shapes.

## 184.2 Parser tolerance

Webhook/API parsers SHOULD:

- tolerate unknown additive fields,
- reject invalid required semantics,
- preserve raw signed evidence where allowed,
- map unknown enum values to a safe UNKNOWN state,
- avoid crashing the whole ingestion pipeline because of one new field.

Unknown financial states MUST be quarantined rather than guessed.

## 184.3 Capability drift

Provider capabilities MAY change by:

- API version,
- country,
- merchant account,
- wallet account,
- currency,
- product tier.

Capability snapshots SHALL include:

```text
observed_at
source
adapter_version
provider_api_version
```

A cached capability MUST expire or refresh according to provider volatility.

## 184.4 Fee and behavior drift

SmartAIHub SHOULD detect material drift between:

```text
estimated fee
vs
actual fee
```

and between:

```text
declared capability
vs
observed behavior
```

Repeated drift SHOULD lower route confidence and may mark the provider DEGRADED.

## 184.5 Contract tests

Every ACTIVE provider adapter MUST have automated contract tests covering:

- authentication,
- balance retrieval,
- payment creation,
- idempotency,
- webhook verification,
- status retrieval,
- refund where supported,
- fee parsing,
- currency precision,
- error mapping.

## 184.6 Canary verification

Provider API upgrades SHOULD be tested in:

```text
sandbox
→ canary tenant/account
→ limited production cohort
→ general availability
```

before becoming default.

## 184.7 Unknown provider state

If a provider introduces a status SmartAIHub does not understand:

```text
Do not infer success/failure.
→ map to UNKNOWN_PROVIDER_STATE
→ stop unsafe fallback
→ reconcile
→ alert operations
```

---

# 185. Wallet Credential Lifecycle, OAuth Consent, Scope Rotation, and Reauthentication

Connecting a wallet/provider is a lifecycle, not a one-time token save.

## 185.1 Credential classes

A WalletConnection SHALL record credential class:

- OAuth authorization,
- API key,
- delegated payment token,
- provider service account,
- session credential,
- hardware/external signer reference,
- no-secret/internal credits.

## 185.2 Least-privilege scopes

Provider connection flow SHALL request the minimum scopes necessary.

Examples:

```text
balance.read
transactions.read
payment.authorize
payment.capture
refund.create
```

If the user only wants monitoring, SmartAIHub SHOULD NOT request payment-write scope.

## 185.3 Consent snapshot

Store a normalized consent snapshot:

```yaml
consent:
  scopes: [...]
  granted_at: ...
  granted_by: ...
  provider_account: ...
  expires_at: ...
  consent_version: ...
```

## 185.4 Refresh lifecycle

Adapters SHALL handle:

- access-token expiry,
- refresh-token rotation,
- revoked refresh token,
- user-revoked consent,
- provider-forced reauthentication,
- scope downgrade.

Refresh failures MUST NOT be treated as ordinary payment declines.

## 185.5 Reauthentication UX

When reauthentication is required:

- wallet status becomes REAUTH_REQUIRED,
- future affected calendar events are flagged,
- router excludes the wallet unless a provider allows safe continued use,
- user gets a direct reconnect action.

## 185.6 Secret rotation

Provider secrets and webhook signing secrets SHALL support rotation without downtime where provider capabilities allow overlapping keys.

Store key/secret versions, not only one mutable secret value.

## 185.7 Credential compromise response

Admin or user SHALL be able to:

1. freeze the WalletConnection,
2. revoke local credential use,
3. rotate provider credential,
4. identify affected transactions,
5. invalidate derived capability tokens,
6. preserve audit evidence.

## 185.8 Agent isolation

Agents MUST never receive refresh tokens, API keys, signer secrets, or equivalent unrestricted credentials.

---

# 186. User, Tenant, Membership, Wallet Ownership, and Offboarding Lifecycle

Financial access MUST respond safely when a user leaves a tenant, changes role, loses access, or an account closes.

## 186.1 Wallet ownership models

A WalletConnection SHALL declare ownership:

- PERSONAL
- TENANT
- ORGANIZATION
- SHARED_TEAM
- PROJECT_SCOPED
- PLATFORM

Access role and economic ownership MUST NOT be conflated.

A user may operate a tenant wallet without owning its funds.

## 186.2 Membership removal

When a member is removed from a tenant:

- revoke future wallet-management access,
- revoke mandates issued to that user's agents where policy requires,
- invalidate derived capability tokens,
- retain immutable financial history,
- preserve scheduled tenant obligations under a valid replacement owner.

## 186.3 Role downgrade

If a user loses `finance.wallet.manage` or approval rights, the change SHALL take effect for new actions immediately.

Existing payment finality is not reversed merely because the user's role changed later.

## 186.4 Orphan prevention

Before deleting/suspending the last administrator responsible for a tenant wallet, the system SHALL require:

- successor administrator, or
- explicit wallet freeze/closure workflow.

Scheduled obligations MUST NOT silently become ownerless.

## 186.5 Account suspension

Account suspension policy SHALL define separately:

- new spending,
- refunds,
- inbound settlements,
- payout claims,
- dispute response,
- reconciliation.

A suspended account may still need refunds, settlements, or dispute processing.

## 186.6 Account closure

Closing an account SHALL check:

- pending captures,
- unsettled provider transactions,
- active disputes,
- refundable balance,
- scheduled obligations,
- outstanding invoices,
- partner payables/receivables.

Financial records required for accounting/audit SHALL be retained or pseudonymized according to retention policy.

## 186.7 Ownership transfer

Transfer of a shared/corporate wallet SHALL require explicit authorization and audit.

Historical transactions retain their historical owner/principal references.

---

# 187. Disputes, Chargebacks, Seller Reserves, and Revenue Finality

Revenue may be captured before it is economically final.

Spec 207 SHALL model this explicitly.

## 187.1 Revenue finality classes

Revenue allocation SHALL distinguish:

- PROVISIONAL
- AVAILABLE
- PAYOUT_ELIGIBLE
- PAID_OUT
- DISPUTED
- REVERSED

A successful card capture or equivalent does not always mean funds are permanently final.

## 187.2 Seller reserve / holdback

Marketplace or tenant policy MAY maintain:

- fixed reserve,
- rolling reserve,
- percentage holdback,
- time-based payout delay.

Example:

```text
Gross creator revenue: 10,000
Rolling reserve 10%:    1,000
Available for payout:   9,000
```

Reserve accounting MUST use ledger accounts, not hidden mutable balance adjustments.

## 187.3 Chargeback waterfall

A dispute loss policy SHALL define the order in which losses are absorbed.

Example configurable waterfall:

```text
transaction reserve
→ seller payable
→ seller future revenue
→ tenant reserve
→ platform loss account
```

The rule MUST be versioned and auditable.

## 187.4 Dispute evidence

Evidence MAY include:

- mandate/approval,
- capability request,
- delivery proof,
- job output metadata,
- user acceptance,
- provider receipt,
- IP/device/security evidence where legally permitted,
- communication timeline.

Evidence retention MUST follow privacy and legal policy.

## 187.5 Payout gating

Payout eligibility SHOULD consider:

- dispute window,
- seller reserve,
- fraud/risk state,
- negative payable,
- unresolved reconciliation mismatch,
- compliance hold.

## 187.6 Refund versus chargeback

Refund and chargeback MUST remain distinct event types because fee/revenue/accounting consequences may differ.

## 187.7 Dispute deadline calendar

Evidence due dates and dispute response deadlines SHOULD appear in Finance operations calendars with high-severity alerts.

---

# 188. Provider Quotas, Rate Limits, Circuit Breakers, and Retry Budgets

Payment safety can fail even when money is sufficient if a provider API is overloaded or quota-limited.

## 188.1 Provider quota registry

Adapters SHOULD expose known limits where available:

- request rate,
- payment-create rate,
- balance-read rate,
- webhook/event replay limits,
- refund limits,
- account-level concurrency,
- daily transaction volume caps.

## 188.2 Circuit breaker

Provider operations SHOULD use operation-specific circuit breakers.

Example:

```text
payment.create breaker
balance.read breaker
refund.create breaker
```

A failure in analytics/balance polling MUST NOT automatically block capture/refund finality processing.

## 188.3 Priority under throttling

When provider capacity is constrained, prioritize:

1. finality/status reconciliation,
2. capture/release deadlines,
3. refunds/disputes,
4. approved due payments,
5. new quotes,
6. background analytics.

## 188.4 Retry budget

Retries SHALL be bounded by:

- attempt count,
- elapsed time,
- external fee risk,
- provider quota,
- transaction deadline.

Retry budgets are distinct from wallet fallback budgets.

## 188.5 Rate-limit-aware routing

Smart Routing MAY avoid a provider that is near quota exhaustion if another eligible route exists.

The reason SHALL be shown in routing evidence.

## 188.6 Calendar capacity planning

Large scheduled agent workloads SHOULD validate provider/payment capacity before execution.

Example:

```text
02:00 scheduled batch
10,000 micro-purchases
provider quota only supports 1,000/minute
```

Scheduler SHOULD stagger work or batch settlement where possible.

## 188.7 Thundering-herd prevention

After provider recovery, queued financial requests SHALL use controlled ramp-up rather than retrying all pending work simultaneously.

---

# 189. Retention Classes, Legal Hold, Privacy Export, and Data Residency

Section 170 establishes high-level retention requirements. This section makes them operational.

## 189.1 Retention classification

Each financial data class SHALL have a retention class.

Examples:

- LEDGER_CORE
- PROVIDER_EVIDENCE
- AUTHORIZATION_EVIDENCE
- USER_PRESENTATION_DATA
- SECURITY_LOG
- FORECAST_SNAPSHOT
- TRANSIENT_CACHE

Retention rules SHALL be configurable by jurisdiction/tenant where required.

## 189.2 Legal hold

Authorized compliance/legal operations MAY place a legal hold on specific records.

A held record MUST NOT be deleted by normal retention jobs until hold release.

Legal hold actions SHALL be audited.

## 189.3 Pseudonymization after account deletion

When personal profile data may be deleted but financial records must remain, the system SHOULD replace direct identifiers with stable pseudonymous references where allowed.

Accounting linkage MUST remain intact without retaining unnecessary profile data.

## 189.4 User data export

Where product/legal requirements apply, user export SHOULD distinguish:

- transaction history,
- wallet connection metadata,
- budget/policy history,
- approvals,
- provider references.

Secrets and third-party restricted data MUST not be exported.

## 189.5 Data residency policy

Storage, backup, analytics, and support tooling SHALL honor declared residency restrictions.

A backup copied to another geography is still a data transfer and MUST be considered in residency architecture.

## 189.6 Derived data

Deletion/retention workflows MUST account for derived artifacts such as:

- analytics aggregates,
- forecast snapshots,
- search indexes,
- caches,
- exported support evidence.

---

# 190. Provider Event Deduplication, Transaction Fingerprinting, and Import Watermarks

The same external transaction may be observed through webhook, polling API, statement import, settlement file, or manual reconciliation.

It MUST appear once economically.

## 190.1 Provider transaction identity

Preferred external identity:

```text
provider
+ provider_account
+ provider_transaction_id
```

If a provider lacks a stable ID, create a conservative fingerprint using available immutable attributes.

Fingerprinting MUST NOT merge two legitimate transactions merely because amount/time are similar.

## 190.2 Observation versus economic event

Store provider observations separately from canonical economic events.

Example:

```text
ProviderObservation A: webhook
ProviderObservation B: API poll
ProviderObservation C: settlement statement
              │
              └──── all map to one ProviderTransaction
```

## 190.3 Import watermark

Every polling/import connector SHALL maintain a durable cursor/watermark with overlap.

Use overlap because provider records may appear late.

Deduplication makes overlap safe.

## 190.4 Statement import

Manual or automated statement imports MUST support:

- file checksum,
- row identity,
- duplicate-file detection,
- partial reprocessing,
- parser version,
- source period.

## 190.5 Conflicting observations

If sources disagree:

```text
webhook says CAPTURED
statement says REVERSED
```

do not overwrite blindly.

Apply source precedence/finality rules and create reconciliation work when ambiguity remains.

## 190.6 Import audit

Every imported observation SHALL retain source and ingestion timestamp.

---

# 191. Tax Documents, Invoices, Receipts, Withholding, and Document Integrity

Tax and invoice rules vary by jurisdiction. Spec 207 SHALL provide canonical hooks without hard-coding one country's law into the economic core.

## 191.1 Financial document model

Suggested canonical documents:

- RECEIPT
- TAX_INVOICE
- INVOICE
- CREDIT_NOTE
- DEBIT_NOTE
- WITHHOLDING_CERTIFICATE_REFERENCE
- PAYOUT_STATEMENT
- SETTLEMENT_STATEMENT

## 191.2 Document identity

Issued documents SHALL have immutable identifiers.

Where jurisdiction requires sequence rules, numbering SHALL be provided by a jurisdiction-aware document service/adapter.

Deleting and reusing issued numbers SHALL NOT be allowed.

## 191.3 Source linkage

Each document SHOULD reference:

- economic events,
- ledger journals,
- buyer/seller identity snapshot,
- tax calculation snapshot,
- currency,
- exchange rate where relevant.

## 191.4 Corrections

Correct an issued document through an allowed correction document/workflow, not by silently modifying historical issued content.

## 191.5 Withholding

Revenue/payout architecture SHALL support withholding as an explicit ledger component when applicable.

Example:

```text
Gross payable
- withholding
- fees
= net payout
```

## 191.6 Tax timing

The system SHALL NOT assume that payment time, invoice time, service-delivery time, and tax-recognition time are always identical.

Jurisdiction adapter owns these rules.

---

# 192. Separation of Duties, Maker-Checker Controls, and Break-Glass Access

High-impact financial operations require stronger controls than ordinary product settings.

## 192.1 Sensitive operation classes

Examples:

- change payout beneficiary,
- add high-limit wallet,
- increase agent budget materially,
- approve large payment,
- modify revenue-sharing policy,
- release seller reserve,
- manual ledger correction,
- force-settle reconciliation,
- change provider production credentials.

## 192.2 Maker-checker

Tenant/platform policy MAY require:

```text
Maker proposes
       ↓
Independent checker approves
       ↓
Action executes
```

The same identity MUST NOT satisfy both roles when dual control is required.

## 192.3 Separation-of-duties rules

Examples:

- payout beneficiary editor cannot approve first payout,
- ledger correction maker cannot be sole approver,
- revenue recipient cannot unilaterally change own split,
- support operator cannot reveal secrets.

## 192.4 Break-glass access

Emergency privileged access SHALL require:

- explicit reason,
- short expiry,
- high-severity audit event,
- optional second approval,
- post-event review.

## 192.5 Privileged session

High-risk changes SHOULD require recent step-up authentication.

## 192.6 Bulk actions

Bulk payouts, bulk freezes, bulk policy changes, and mass wallet migration require preview + affected-object count + confirmation.

---

# 193. Financial Calendar Source Deduplication and Obligation Lifecycle

Financial Calendar integrates many sources and MUST avoid representing one obligation several times.

## 193.1 Canonical obligation

A recurring or scheduled obligation SHALL have one canonical identity where possible.

Example:

```text
Provider subscription
      │
      ├── provider recurring API
      ├── upcoming invoice
      └── scheduled payment event
```

These may be different observations of the same obligation.

## 193.2 Source precedence

Define source precedence for:

- provider-confirmed due amount,
- SmartAIHub estimate,
- imported invoice,
- manual plan.

Example:

```text
provider-confirmed invoice
> provider recurring estimate
> SmartAIHub estimate
```

while retaining all source evidence.

## 193.3 Lifecycle

Canonical obligation states SHOULD include:

- DISCOVERED
- PLANNED
- CONFIRMED
- DUE
- PAID
- SKIPPED
- CANCELLED
- SUPERSEDED

## 193.4 Cancellation drift

If user cancels a subscription externally, SmartAIHub SHOULD detect that the future obligation disappeared or became cancelled.

Do not continue forecasting indefinitely from stale recurrence metadata.

## 193.5 Amount changes

When provider-confirmed amount changes:

- preserve prior forecast,
- update future event,
- recalculate projected balance,
- alert when change exceeds user threshold.

## 193.6 Manual event merging

Finance UI SHOULD allow an authorized user to mark two calendar entries as the same obligation if automatic matching cannot prove it safely.

This action is audited.

---

# 194. Balance Freshness, Confidence, and Stale-Data Routing Safety

An external wallet balance is an observation, not guaranteed real-time truth.

## 194.1 Balance snapshot

Every external balance snapshot SHALL include:

```yaml
balance_snapshot:
  observed_at: ...
  provider_effective_at: ...
  available_amount: ...
  pending_amount: ...
  freshness_class: LIVE | FRESH | STALE | UNKNOWN
```

## 194.2 Freshness thresholds

Wallet provider configuration SHALL define thresholds by operation risk.

Example:

```text
Display balance:
snapshot ≤ 15 min acceptable

Auto-pay 10 THB:
snapshot ≤ 5 min acceptable

Auto-pay 100,000 THB:
force live validation
```

## 194.3 Stale balance routing

A stale balance MUST NOT be interpreted as guaranteed spendable funds.

Router MAY:

- refresh balance,
- lower route score,
- require authorization attempt,
- use another wallet,
- request user action.

## 194.4 Internal reservations

SmartAIHub's own reservation against an external wallet is advisory unless provider authorization actually reserves funds.

The UI MUST distinguish:

```text
SmartAIHub-planned reserve
vs
provider-backed reserve
```

## 194.5 Confidence

Projected balance MAY expose confidence based on:

- balance freshness,
- provider pending transactions,
- imported obligations,
- expected external inflows.

---

# 195. Unit Economics, Margin Guardrails, and Negative-Margin Prevention

Cost-aware routing must protect both user cost and SmartAIHub business economics.

## 195.1 Cost basis

Every monetized capability SHOULD track:

- external provider cost,
- compute cost where measurable,
- payment fee,
- FX,
- network fee,
- tenant share,
- creator/skill share,
- taxes where applicable,
- platform margin.

## 195.2 Quote margin check

Before issuing a fixed or capped quote, compute expected contribution margin.

Example:

```text
Customer price:       100
Provider cost:         70
Payment/FX fees:        5
Revenue shares:        15
-------------------------
Expected margin:       10
```

## 195.3 Margin guardrail

Policy SHALL support:

```yaml
margin_policy:
  minimum_margin_minor: ...
  minimum_margin_percent: ...
  action_if_below:
    - REQUOTE
    - REQUIRE_APPROVAL
    - CHANGE_PROVIDER
    - REJECT
```

## 195.4 Cost overrun during execution

For variable-cost jobs, the system SHOULD compare:

```text
actual accrued cost
vs
quote
vs
customer maximum
vs
platform margin floor
```

If continuing would violate a hard budget or margin guardrail, execution policy SHALL decide whether to:

- stop safely,
- downgrade provider/quality if permitted,
- request approval,
- absorb loss according to business rule.

## 195.5 Subsidies

Promotions or deliberate subsidies MUST be represented explicitly.

Do not make a negative-margin transaction look profitable by omitting promotional expense.

## 195.6 Marketplace economics

Revenue sharing SHALL define whether percentage splits apply to:

- gross customer price,
- net of provider cost,
- net of payment fees,
- another explicitly versioned base.

Ambiguity is prohibited.

---

# 196. Postpaid Accounts, Credit Limits, Accounts Receivable, Dunning, and Collections State

Section 181 allows POSTPAID timing. This requires a credit-risk model.

## 196.1 Postpaid account

A tenant MAY be approved for postpaid billing.

Canonical fields:

```yaml
postpaid_account:
  tenant_id: tenant_001
  credit_limit: 100000
  currency: THB
  billing_cycle: MONTHLY
  payment_terms_days: 30
  status: ACTIVE
```

## 196.2 Available credit

```text
Available Credit =
Credit Limit
- Posted Unpaid Receivables
- Authorized/Reserved Postpaid Spend
- Risk Hold
```

Agents MUST NOT exceed available postpaid credit.

## 196.3 Invoice lifecycle

- DRAFT
- ISSUED
- PARTIALLY_PAID
- PAID
- OVERDUE
- DISPUTED
- WRITTEN_OFF
- CANCELLED

## 196.4 Dunning

Configurable dunning MAY include:

- reminder,
- grace period,
- reduced spending,
- block new external spend,
- suspend postpaid,
- collections/escalation state.

Do not automatically block access to receipts/refunds/dispute tools when account is overdue.

## 196.5 Credit-limit changes

Increasing credit limit is a privileged financial action and MAY require maker-checker approval.

## 196.6 Aging

Accounts receivable reporting SHOULD include aging buckets.

Example:

```text
Current
1–30 days
31–60
61–90
90+
```

## 196.7 Bad debt

Write-off SHALL create explicit ledger events and MUST NOT delete original invoice history.

---

# 197. Wallet Rebalancing, Treasury Rules, and Cross-Wallet Funding

Multiple wallets create a future need to move or pre-position funds.

This must be distinct from ordinary payment routing.

## 197.1 Treasury intent

Moving value between wallets SHALL create its own `EconomicIntent`.

An agent MAY recommend rebalancing but MUST NOT move unrestricted funds without explicit treasury mandate.

## 197.2 Rebalancing policy

Example:

```yaml
rebalance_policy:
  wallet: production_wallet
  target_min: 5000
  target_max: 20000
  currency: THB

  source_priority:
    - company_bank
    - company_wallet

  max_daily_transfer: 10000
```

## 197.3 Cost-aware rebalancing

Consider:

- transfer fees,
- FX,
- settlement delay,
- withdrawal lock,
- minimum balance,
- expected upcoming obligations.

## 197.4 Scheduled rebalancing

Rebalancing events SHALL appear in Financial Calendar and cash-flow forecasts.

## 197.5 No hidden sweep

Smart Routing MUST NOT silently transfer funds between user-owned wallets merely to make a payment possible unless a pre-authorized rebalancing/auto-funding policy explicitly allows it.

## 197.6 Funding loops

Prevent circular auto-top-up/rebalancing loops.

Example:

```text
Wallet A tops up B
B tops up A
```

Graph validation SHALL detect cycles or enforce bounded execution.

## 197.7 Provider transfer finality

Cross-wallet transfer may settle later than payment creation.

Destination balance SHALL not be treated as available until appropriate finality is reached.

---

# 198. Economic Policy Conflict Resolution and Deterministic Precedence

With many policy layers, conflicting rules are inevitable.

## 198.1 Policy outcome classes

Normalize rule outcomes:

- ALLOW
- DENY
- REQUIRE_APPROVAL
- REQUIRE_STEP_UP
- LIMIT
- PREFER
- AVOID
- REQUIRE_ROUTE
- REQUIRE_CURRENCY
- REQUIRE_TIME_WINDOW

## 198.2 Hard versus soft rules

Every rule SHALL be classified:

- HARD — cannot be overridden downstream except authorized emergency mechanism,
- SOFT — affects scoring/preference,
- DEFAULT — used when no more specific rule exists.

## 198.3 Conflict precedence

Recommended precedence:

```text
Safety / legal hard deny
> Platform hard policy
> Tenant hard policy
> Principal hard mandate
> Project/Agent hard policy
> Wallet hard policy
> Transaction-specific approved constraint
> Soft preferences
> Optimization score
```

The exact precedence MUST be explicit, versioned, and testable.

## 198.4 Unsatisfiable policy

If constraints cannot all be satisfied:

```text
Do not guess.
→ return POLICY_UNSATISFIABLE
→ show conflicting rules
→ request authorized change
```

## 198.5 Policy explanation

Decision trace SHALL cite rule IDs and versions.

Example:

```text
Wallet C denied by tenant policy T-18 v4.
Wallet B preferred by user policy U-7 v2.
```

---

# 199. Second 10+ Pass Gap Audit Record — Revision R3

Revision R3 performs an independent production-readiness audit after the Revision R2 audit.

| Pass | Review dimension | Gap identified | Normative fix |
|---|---|---|---|
| 1 | Distributed architecture | No explicit multi-region financial authority / split-brain prevention | Section 183 |
| 2 | Provider integration longevity | Missing provider API/schema/behavior drift model | Section 184 |
| 3 | Credential lifecycle | Missing OAuth consent, refresh, rotation, compromise lifecycle | Section 185 |
| 4 | Identity/account lifecycle | Missing tenant offboarding, role downgrade, orphan wallet rules | Section 186 |
| 5 | Marketplace financial risk | Missing revenue finality, chargeback reserves and payout gating | Section 187 |
| 6 | Operational capacity | Missing provider quotas, circuit breakers and retry budgets | Section 188 |
| 7 | Privacy/compliance operations | Missing legal hold, retention classes, export/residency controls | Section 189 |
| 8 | Reconciliation ingestion | Missing cross-channel provider observation deduplication | Section 190 |
| 9 | Financial documents | Missing invoice/tax-document/correction abstraction | Section 191 |
| 10 | Privileged operations | Missing maker-checker / separation-of-duties requirements | Section 192 |
| 11 | Calendar correctness | Missing dedup of invoice/subscription/scheduled-payment observations | Section 193 |
| 12 | Wallet data quality | Missing stale-balance/freshness semantics | Section 194 |
| 13 | Business economics | Missing margin floor and negative-margin protection | Section 195 |
| 14 | Enterprise billing | POSTPAID existed without AR/credit-limit/dunning model | Section 196 |
| 15 | Multi-wallet treasury | Missing controlled cross-wallet rebalancing | Section 197 |
| 16 | Policy determinism | Missing explicit conflict-resolution precedence | Section 198 |

## 199.1 R3 audit conclusion

After Revision R3, implementation planning MUST treat the following as production-critical rather than optional future polish:

- financial write authority,
- provider API drift handling,
- credential lifecycle,
- membership/offboarding semantics,
- dispute reserves,
- provider capacity control,
- retention/legal-hold mechanics,
- external transaction deduplication,
- document integrity,
- privileged-action separation,
- calendar source deduplication,
- balance freshness,
- margin protection,
- enterprise credit risk,
- treasury/rebalancing,
- deterministic policy conflict resolution,
- authorization/reservation expiry and orphan-hold cleanup.

A post-R3 consistency check additionally found the authorization-expiry/orphan-hold gap; Section 201 closes it normatively.

---

# 200. Revision R3 Production Acceptance Extensions

In addition to prior acceptance criteria, production readiness requires:

1. Multi-region failover cannot produce concurrent spend from stale authorities.
2. Provider adapter unknown states are quarantined rather than guessed.
3. Revoked or expired wallet credentials are excluded from autonomous routing.
4. Removing a user from a tenant revokes relevant future financial authority.
5. Seller payouts cannot ignore active reserve/dispute policy.
6. Provider quota exhaustion cannot create uncontrolled retry storms.
7. Retention jobs honor legal holds and residency restrictions.
8. Webhook/API/statement observations of one provider transaction do not create duplicate economic events.
9. Issued financial documents cannot be silently rewritten.
10. High-risk privileged actions can enforce independent approval.
11. Calendar does not double-count the same obligation across multiple sources.
12. Router accounts for external balance freshness and uncertainty.
13. A capability cannot silently execute below configured platform margin floor.
14. Postpaid agents cannot exceed tenant available credit.
15. Auto-funding/rebalancing cannot enter cyclic transfer loops.
16. Policy conflicts resolve deterministically or fail explicitly.
17. Expired or orphaned authorizations/reservations are detected and safely reconciled/released.

## 200.1 Required R3 test additions

Add automated tests for:

- region fencing and stale-writer rejection,
- idempotency after region failover,
- unknown provider enum/status,
- revoked OAuth refresh token,
- user removal with active mandates,
- dispute reserve accounting,
- provider circuit breaker recovery,
- legal-hold retention job,
- duplicate provider event through three ingestion channels,
- financial document correction,
- maker-checker conflict,
- calendar obligation merge,
- stale-balance routing,
- negative-margin quote,
- postpaid credit exhaustion,
- rebalancing cycle detection,
- contradictory policy hierarchy,
- authorization expiry and orphan-hold cleanup.

## 200.2 Migration requirement

Revision R3 features MAY roll out incrementally, but core schemas SHALL reserve stable extension points for:

- provider observations,
- financial documents,
- postpaid account state,
- treasury/rebalancing intents,
- policy rule identity/version,
- regional write authority metadata.

Do not postpone these extension points until provider-specific implementations have already hardened incompatible schemas.
---

# 201. Authorization and Reservation Expiry, Renewal, and Orphan-Hold Cleanup

Authorization and reservation lifecycle MUST be explicit because provider holds can expire, be automatically released, or remain pending independently of SmartAIHub job state.

## 201.1 Expiry metadata

Every authorization/reservation SHOULD record where available:

```yaml
authorization:
  authorized_at: ...
  expires_at: ...
  provider_expiry_semantics: HARD | ESTIMATED | UNKNOWN
  renewal_supported: true
```

The system SHALL NOT assume an authorization remains capturable indefinitely.

## 201.2 Execution-window validation

Before starting a queued or scheduled job that depends on a provider-backed authorization:

```text
remaining authorization lifetime
vs
estimated job duration
+ capture safety margin
```

MUST be validated.

If insufficient:

- renew/re-authorize when supported and policy permits,
- select a new route before work begins,
- request approval when materially changed,
- or delay/cancel execution.

## 201.3 Renewal

Renewal is a new financially relevant operation and MUST be:

- idempotent,
- audited,
- subject to updated balance/fee/policy checks,
- linked to the original authorization.

Renewal MUST NOT silently increase the user's authorized maximum.

## 201.4 Expired authorization during execution

If authorization expires after irreversible work has started:

1. do not rerun the job merely because capture failed,
2. attempt permitted re-authorization,
3. preserve delivery/output state,
4. enter a recoverable economic exception if payment cannot be completed,
5. alert operations/user according to value and policy.

## 201.5 Orphan-hold detector

A scheduled control-plane job SHALL detect reservations/authorizations that are:

- past expected expiry,
- no longer attached to an executable job,
- attached to cancelled jobs,
- never captured after terminal job state,
- externally released but internally still reserved,
- internally released but externally still pending.

## 201.6 Cleanup actions

Cleanup MAY:

- confirm provider state,
- release internal reservation,
- issue provider void/release where supported,
- reconcile unknown state,
- create operations case.

It MUST NOT fabricate a successful release if provider finality is unknown.

## 201.7 Calendar visibility

Material long-lived holds SHOULD appear in Financial Calendar or Finance Overview when they reduce spendable balance.

Example:

```text
Reservation hold
2,000 THB
Expires approximately Sep 28 14:00
Related job: video_batch_221
```

## 201.8 Acceptance criteria

Production tests MUST cover:

- authorization expires while job is queued,
- authorization expires during long-running job,
- renewal succeeds,
- renewal changes provider reference,
- provider auto-releases hold,
- cancelled job leaves external hold,
- orphan detector is replay-safe,
- cleanup does not double-release or double-capture.
