# ADR — Credit-First Revenue, Four Recipient Roles, One-Time Referral (R0.8)

**Decision:** The first production version of the SmartSIHub creator economy settles ALL Mini App/Skill owner earnings as **canonical credits added to the recipient user's existing SmartSIHub wallet**, not as a bank or cash payout. The commercial revenue allocation has **four and only four roles**: Core Platform Infrastructure Owner, Tenant Infrastructure Owner, Mini App Owner, Skill Owner. Any role may refer to the same verified user; track distinct attribution, consolidate wallet balance. No percentage is assumed, and an absent role follows the versioned offer policy.

## Credit event flows

```text
PAY-PER-USE SKILL (unique invocation)
  payer reservation/debit -> recorded distributable credits
    -> +platform owner credits
    -> +tenant owner credits
    -> +Mini App owner credits
    -> +Skill owner credits
  sum allocated == policy-defined distributable credits

SUBSCRIPTION (unique verified paid period)
  verified subscription invoice/payment -> recognized credit-equivalent pool
    -> role-based owner credit grants once per period
  included App-exclusive Skill: no per-call subscriber debit
  actual Shared Skill call: separate PAY-PER-USE flow

REFERRAL (unique qualifying acquisition, once)
  approved Platform promotional budget -> +referrer user credits
  no deduction from Skill/Mini App/Tenant revenue
  no recurring referral commissions

CREDIT TOP-UP
  user pays to acquire credits -> payer wallet credit increase
  not yet a Skill/App revenue allocation event
```

## Single wallet, classified history

One existing user wallet, one existing SPEC-207 ledger writer; add source/role attribution not another balance authority. Distinguish `PURCHASED_CREDITS`, `EARNED_OWNER_REVENUE`, `PROMOTIONAL_REFERRAL_BONUS`, `ADJUSTMENT/REVERSAL` and `RESERVATION`. Keep internal credit-unit version and provenance across all old/new writers; historical transactions stay immutable. The wallet balance shown to users may be one total, with optional subtotals and pending/available presentation. No referral percentage is routed through the four-role allocation.

## Future withdrawal (outside this implementation)

No withdrawal button or bank transfer now. Record enough verifiable source data so a future rule can decide which earned credits qualify for withdrawal, minimum configurable amount, pending balances, chargeback windows, recipient verification, settlement currency, FX, fees, taxes, regulations and receipts. Referral and purchased credits are **not presumed withdrawable**. No cash redemption promise until that future specification is accepted and delivered.

## Reliability invariants

Exactly one charge/recipient allocation per logical settlement, and one bonus per qualifying referred user; dedupe payment webhooks, queues, callback retries. Provider compensation and taxes are costs, not fifth sellers. Refunds produce linked reversal transactions. Unfunded credit minting, use of guessed recipient accounts, new wallet systems, and affiliate commission trees are outside scope. When a financial path is unsafe, pause only that mutation; public UI and unrelated features can still deploy for human UAT.
