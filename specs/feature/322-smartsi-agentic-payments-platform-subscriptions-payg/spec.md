---
spec_id: 322
semantic_id: smartsi.agentic-payments-delegated-spending-platform-subscription-payg
revision: R1.5
status: PROPOSED_NOT_IMPLEMENTED
owner: SPEC-207 financial authority / SPEC-280 commerce policy / SPEC-322 interoperability contract
production_domain: smartsihub.com
date: 2026-11-02
---
# SPEC-322 — Agentic Payments, Platform Subscriptions, Credit Reservation and Class-Bounded PAYG

> **Current-revision note (R1.5, 2026-11-02):** Earlier proposal text is retained for provenance. If R0.x–R1.4 payment, ledger, runtime, or autonomous-execution assertions conflict with the final R1.5 section or current owner-decision register, R1.5 controls.

## 0. Owner decisions — normative
1. `smartsihub.com` is the confirmed NEW production domain; `aimarkethubs.com` is the Debian Modular Development environment; `smartaihub.app` remains legacy Debian during transition. Preserve one canonical PostgreSQL `smartspec` identity and ledger; do not convert old backend into new core.
2. A customer **must have a SmartSIHub platform user account** before purchasing, subscribing to, or invoking a Mini App. An Agent may act **on behalf of** a linked user/tenant/payer with an explicit spend delegation. A machine identity is NOT a blanket right to spend another user's credits.
3. Agents MUST be able to discover prices, obtain quotes, reserve an authorized budget, invoke a Skill/Job, receive actual usage, settle, view invoices/receipts and replenish or pay using supported methods **without opening the web UI** when applicable payment mandate/provider support and user authorization exist. Interactive PSP strong authentication may still require a user handoff; do not fake full autonomy.
4. Preserve two independent subscriptions: (a) **SmartSIHub Platform Subscription** with plan entitlements and a configurable credit grant per *verified paid* billing period; (b) **Mini App Subscription** per App, covering only newly developed App-exclusive Skills under SPEC-321. A platform account is prerequisite for all Mini Apps; the two subscription lifecycles, invoices, cancellation, expiry and benefits NEVER implicitly merge.
5. Three primary funding modes: PREPAID, AUTO_TOPUP (prepaid via delegated saved payment method), and PAYG_POSTPAID with strict user-class overdraft limits. Each paid invocation follows **estimate → quote → reserve worst-case authorized amount → execute → measure actual → settle actual → release unused reserve**. Insufficient authority/limits block only the affected charge, never the whole UI/platform development.
6. **Existing SPEC-207** owns funding selection, wallet, ledger, credit reserve/debit/refund, economic authorization, settlement and reconciliation; SPEC-280 owns pricing, usage and commercial policy; SPEC-303 owns verified recipient/ownership rights; SPEC-321 owns 10,000 credits/USD denomination, four-role credit earnings, Mini App exclusive subscriptions and referral rules; SPEC-318 owns canonical `worker_jobs` durable execution. SPEC-322 is an additive adapter and behavior contract, NOT an alternate ledger, job ledger, payment gateway or approval service.
7. Credit conversion is **USD 1 = 10,000 v2 credits**. During migration from historical 1,000 per USD, preserve economic value with unit-version snapshots, historical immutable rows and old/new writer compatibility. NEVER enable PAYG/agents with a mixed-unit financial writer.

## 1. Product model and distinct purchase rights

| Product / Funding | Scope | Financial effect | Agent capabilities |
|---|---|---|---|
| Platform user account | Canonical user identity | Required for any App | agent delegated to that user/tenant |
| SmartSIHub Platform Subscription | Core service tier and platform access | Paid recurring plan grants fixed monthly credits once for verified period; entitlement and quotas | agent may spend monthly credits within mandate |
| Mini App Subscription | Specific canonical `appId` | Fixed recurring purchase; only original App-exclusive included Skills avoid per-call debit | agent may invoke included Skills under App entitlement |
| Shared/Marketplace/External Skill | Each distinct invocation | Always individually charged in credits, including nested Skills | no subscription bypass |
| Prepaid / Manual Top-up | Canonical user wallet | PSP payment clears → grant purchased credits once | agent can initiate if authorized; human PSP step if required |
| Auto Top-up | Saved eligible payment method + mandate | On threshold, bounded charge clears → purchased credits | fully headless only where provider allows |
| PAYG Postpaid | Explicit class-based credit line and payment agreement | Reserve against wallet + credit-line headroom; settle actual, accumulate bounded receivable and collect on schedule/threshold | agent can autonomously spend within mandate and limits |

Platform subscription credit grants may be configured as `monthly_credits`, `grant_at` (confirmed initial/renewal period), `rollover_policy`, `expiry_policy`, `consumption_priority`, `carryover_limit`, `credit_unit_version`, `entitlements` and `plan_version`. Distinguish purchased, earned, grant/promo and debt by source on immutable ledger transactions. Credit grants do NOT themselves trigger Mini App / Skill creator revenue distributions. Platform subscription sales follow their defined platform-plan revenue owner; do NOT invent an App or Skill beneficiary.

A subscription's nominal credit grant is a **credit liability issuance** supported by recognized plan funding, NOT automatic realized Skill revenue. Block duplicate grants from webhook retry and failed/unpaid renewals; suspension/cancellation policy MUST state if previously funded credits remain spendable. Do not silently confiscate bought or already-earned credits on downgrade. Plan credit limits, rollover and burn-down rules are editable product policies, NOT magic constants in code.

## 2. Agent identity, payment delegation and mandate

`AgentSpendAuthority` is a bounded grant, tied to `payerUserId`, `agentId`, `tenantId` and optional `appId`/`canonicalProjectId`/`runId`; scopes include `quote.read`, `credit.balance.read`, `skill.invoke`, `credit.spend`, `subscription.purchase`, `topup.initiate`, and `external_payment.initiate` as independently granted privileges. Required fields: grant ID, issuer/principal, audience/agent, allowed economic entities/merchants/capability IDs, per-call max, daily/monthly totals, total mandate amount, expiry, payment method references (not credentials), delegation depth, user-class ceilings, credential policy epoch and revocation epoch, audit trace, and signed/integrity-protected evidence when the external protocol supports it.

Effective spend limit = minimum of user class/credit line, owner mandate, tenant/project budget, App policy, payment-method/PSP constraints and currently available funds. No agent escalation by changing model, Harness, WebMCP, domain, protocol or tool names. Revoke/expire stops new charges; previously consumed authorized work is reconciled. No long-lived card PAN, CVC, bank credentials, private keys or full PSP payment tokens in agent prompts, logs, tool replies or Queue payloads. Payments must be performed through secure PSP-vaulted/scope-bound tokens and existing secrets authority (SPEC-272).

No human approval is necessary **for each call** when delegated authority, risk scope and available funding already cover it. Actions outside the mandate may request reauthorization or return a specific payment action; never create a repeated blanket approval loop. Human interactive PSP challenges, mandates and legally necessary identity verification remain real requirements; the system must return a resumable status/URL to the Agent instead of claiming success.

## 3. Multi-vendor agent-commerce interoperability (adapters, no lock-in)

Implement an internal versioned `PaymentIntent/Quote/SpendMandate/PaymentReceipt` model, exposing adapters only where tested and permitted. Do not conflate protocols with PSPs or claim that the existence of a public spec means a provider account has access:

1. **Native SmartSIHub API / MCP**: PRIMARY headless integration for subscribed users, Mini Apps, Skills, reservations, execution, status and receipts. No browser dependency. WebMCP is an **optional browser** projection of the same actions, not a payment processor.
2. **OpenAI / Stripe Agentic Commerce Protocol (ACP)**: merchant-side checkout/delegated payment adapter when partner access and PSP support are actually available. Account linking and accepted payment proof MUST map to the canonical payer/user; ACP must not bypass SmartSIHub account prerequisite or offer authorization.
3. **Google / Shopify Universal Commerce Protocol (UCP)**: optional discovery/order/checkout/plan-purchase compatibility, with AP2 mandates where supported. Use protocol negotiation and receipt verification, not raw unchecked checkout payloads.
4. **Google Agent Payments Protocol (AP2)**: optional verifiable intent/checkout/payment mandates; validate signer, constraints, amount, payee, expiry and receipt. AP2 is an authorization/proof layer, not by itself a fiat PSP, user wallet or recurring debit authority.
5. **Coinbase/Cloudflare x402**: optional scoped, per-request machine-payment adapter where network/token/facilitator, legal jurisdiction, user funding source and provider account support exist. Do NOT require crypto for platform accounts, miniapp subscriptions or ordinary credit payments. x402 v2 supports fixed and `upto` schemes in documented Cloudflare gateway contexts but actual usage-based variable payment requires settlement evidence and adapter-specific support.
6. **Visa Trusted Agent / Mastercard Agent Pay, Stripe SPTs and other PSP token products**: provider-/network-specific authentication/verified agent identity and delegated credential paths. Availability is verified per PSP/merchant/location, not assumed enabled.
7. **Existing local PSPs**: retain existing Beam card/PromptPay channels and direct PromptPay flows. Manual QR/slip flows cannot be advertised as automatic headless payment; hand back a checkout/human-action task and resume once the verified payment webhook/settlement is accepted.

The adapter registry records `provider`, `protocol`, `version`, supported region/currency/payment methods, `headless`, `recurring`, `saved_token`, `preauth`, `metered`, `mandate`, `requires_human_step`, callback verification, maximum charge, account entitlement, actual connectivity and health. Unknown/unsupported capabilities yield honest structured `ACTION_REQUIRED` / `UNSUPPORTED`, not fake success. Transaction authority remains canonical even with external protocol webhooks or A2A/MCP carriers.

Canonical `PaymentReceipt` includes immutable payment/mandate IDs, payer, merchant, amount and currency, PSP confirmation reference, credits unit epoch and grant linkage; replay of webhook or payment receipt cannot produce second credit grant. Provider callbacks verify signatures, origin, freshness, event ID and currency/amount with reconciliation. An external `accepted` intent is not equal to settled funds.

## 4. Usage cost estimate, reservation, actual settlement

`Quote` must state `quoteId`, expected/min/max credits (when estimable), price version, underlying provider/rate snapshot, `estimatedUnits`, known uncertainty, expiry, payer, `appId`, `skillId`, usage scope and margin policy. Quote is best-effort; separate deterministic fixed-price Skills from open-ended LLM/token/video tasks. High uncertainty can require smaller bounded job slices or periodic reserve extension; no unbounded reservation.

**Accounting invariant**: if `postedBalance` includes prior settled debits, `activeHeld` sums active not-yet-settled reserves, and `creditLineLimit >= 0` is the approved negative-balance floor magnitude, then `availableHeadroom = postedBalance + creditLineLimit - activeHeld`. Use precise integer credits and transaction/row-level locking or equivalent atomic database constraint under SPEC-207; never double-subtract a reserve if the existing ledger already moved funds into escrow. `postedBalance >= -creditLineLimit` must hold after every settlement. Spend caps/mandates may impose lower limits.

Transactional flow:
1. Resolve effective payer, class, active Platform Subscription, Mini App entitlements, price and any nested shared Skill charges.
2. Produce quote; compute `reserveCredits = min(quotedMaxIfBounded, estimate + approvedBuffer)` under configured ceilings, never promise a guaranteed cap when there is none. Evaluate headroom plus mandate limits atomically.
3. Atomically **admit `worker_jobs` and create/reserve financial intent** with stable job/request/idempotency identity in canonical PostgreSQL; publish via existing transactional outbox. No Queue publication ahead of durable admission.
4. Executor reports metered units/checkpoints, and can request a **scoped incremental reserve extension** before additional billable work. If extension is denied, stop/pause next billable step and reconcile consumed work; do not let an Executor run into unapproved debt.
5. Final/partial terminal settlement uses provider-verified actual billable units and immutable pricing snapshot. Debit only actual credits, release unused hold, reconcile credit line usage, and apply SPEC-321 recipient credits only against funded/recognized revenue under SPEC-207. If actual exceeds old reserve, require an authorized extension or bounded documented overage rule; never silently overrun User Class limit.
6. Idempotent retry, queue redelivery and outcome-unknown provider response reconcile by `jobId`, `attemptId`, `invocationId`, `settlementKey`, provider idempotency key and actual usage receipt. A distinct actual nested/shared Skill call is billable; re-delivery of the SAME logical call is not.
7. Cancellation, partial completion, timeout, restart, refund and dispute settle only consumed/contractually billable work and release remaining reservation; isolate `OUTCOME_UNKNOWN` rather than charging twice or promising free service.

Example **TEST ONLY**, not a production tariff: quoted 1,200 credits, authorized hold 1,500, verified actual 870 → debit exactly 870, release 630. If a user starts at 500 credits and approved limit is 2,000, with zero existing holds, headroom is 2,500; after a 1,500 hold, headroom is 1,000. If the job later charges 870, balance becomes −370 and must never fall below −2,000. If multiple jobs run at once, holds on all jobs count against the same class and mandate.

## 5. User classes, overdraft and collections

`UserCreditPolicy` is an **explicitly configured, versioned** account risk class, not inferred from protected personal attributes. Suggested conceptual classes: `FREE` (default credit line 0), `REGISTERED` (0), `PLATFORM_SUBSCRIBER` (configurable after verified recurring payment method), `VERIFIED_CREATOR` (configurable after business checks), `BUSINESS` / `ENTERPRISE` (contract-configured, currency/credit unit aware). These are examples, not approved numeric credit limits. Until an account has a verified payment agreement, capacity and recovery mechanism, **default `creditLineLimit = 0`** even on a paid plan. Membership alone is not automatic unlimited unsecured debt.

Scope and persist: `class`, version/epoch, `creditLineLimit`, maxPerJob/maxPerDay/maxPerMonth, `overdraftEnabled`, `requiredPaymentMethod`, settlement interval, collection threshold, billing grace period, max overdue days, credit hold rules, dispute/fraud suspension and administrator audited override. Display maximum allowed negative balance and current utilized exposure to user/agent; any admin override is time-scoped with audit.

On the billing threshold / period end, aggregate the actual settled credit deficit or eligible PAYG charges into a **canonical receivable/invoice**; collect with an authorized tokenized PSP channel, then apply one reconciled payment/credit to reduce negative balance. For card charges prefer configurable threshold or periodic batching to avoid a PSP fee on every micro Skill invocation. Payment failure leaves an explicit debt record, starts published grace/dunning policy and freezes **new spend on the affected payer only** when limits are exceeded; do not silently erase debt or block unrelated feature builds.

Do not distribute **spendable earned credits** from uncollected postpaid debt without funding/guarantee: book pending attribution/credit claims first and release the owner credit grants after collection or another approved funding source is irrevocably recognized; document basis and reversals. This preserves credit-first payouts and prevents unfunded credit issuance. Payment, financial reporting, taxation and local legal obligations must be reviewed for the exact payment jurisdictions, including whether postpaid credit or cash-like credits trigger regulated credit/e-money rules.

## 6. Subscription priority and lifecycle

Precedence at invocation time (not priority of billing buckets): (1) if active Mini App Subscription and canonical **App-exclusive** included Skill → no per-call payer debit; (2) every shared/nested Skill → metered charge; (3) wallet available funded credits and plan monthly credits per configurable expiring/nonexpiring bucket allocation policy; (4) if enabled and authorized, PAYG credit-line headroom; (5) if funded by authorized auto-topup and provider settles, credit grants become spendable; (6) if insufficient, return `PAYMENT_ACTION_REQUIRED` or `CREDIT_LIMIT_REACHED` for only that invocation.

SmartSIHub Platform Subscription is an **independent** recurring plan. When a paid period is verified: emit `PLATFORM_PLAN_PERIOD_CONFIRMED` and a once-only `PLATFORM_MONTHLY_CREDIT_GRANT` to user's existing wallet; do not grant credits for pending/unpaid PSP renewals. Specify rollover/expiry and whether free monthly credits have no cash withdrawal eligibility. Mini App Subscriptions use their own invoice, period, App entitlement, App-exclusive Skill eligibility and revenue split under SPEC-321. Cancelling an App plan does not cancel or erase Platform monthly credits; cancelling Platform plan does not auto-cancel billed App subscriptions unless a separately disclosed account closure policy requires it. **Account identity is prerequisite to use App; paid Platform Subscription is not inherently required to buy App unless product tier expressly says so.**

## 7. Agent-native actions, response states and user UX

Versioned API/MCP tools SHOULD expose `get_account_entitlements`, `get_credit_balance_and_limits`, `quote_skill_run`, `reserve_skill_budget`, `start_skill_job`, `get_job_usage_and_receipt`, `list_payment_methods_and_capabilities`, `create_topup_checkout`, `enable_auto_topup` (mandate required), `get_platform_plans`, `subscribe_platform_plan`, `get_app_plans`, `subscribe_miniapp`, `get_agent_spend_mandates` and `revoke_agent_spend_mandate`. Map to already implemented API/Skill Registries before adding routes; tool presence does not establish spending permission. WebMCP is a browser-facing optional projection, never a headless payment prerequisite.

Action state machine for checkout: `QUOTED → AUTHORIZED → PSP_PENDING → VERIFIED_PAID → CREDITS_GRANTED` or `ACTION_REQUIRED / FAILED / EXPIRED / REFUNDED`. Usage: `QUOTED → RESERVED → RUNNING → EXTENSION_NEEDED? → SETTLED/RELEASED/OUTCOME_UNKNOWN`. Each response contains stable IDs, balance/reservation/debt/limits as entitled, ISO timestamps, next action, reason, idempotency identity, sanitized payment URL when human intervention required, and evidence references. No raw stored payment token in agent replies. Transparency: quote displays predicted maximum/possible overage; user account settings display class limit, debt, active holds, current platform plan and Mini App plans distinctly.

## 8. Reliability, security and human UAT (scoped, NOT blanket gates)

Targeted acceptance cases:
- Human and Agent share user account pricing/permissions and a single ledger; Agent cannot pay as another payer, cross-tenant, past revocation or above budgets.
- Browser closed: authenticated headless Agent can quote, reserve, run, inspect receipts and top-up via a provider supporting delegated payment; manual PromptPay returns pending human checkout honestly.
- Platform user first, App purchase after; Free user may use App if its separate entitlement permits; Platform paid plan grants monthly credits once per verified paid period; retry/renewal/failed payment no phantom grants; plan cancellation and App subscription independent.
- App-exclusive Skill in valid App subscription: zero per-call debit; shared/nested Skill charged each distinct invocation even if Platform plan has monthly credits; retry same nested invocation not charged twice.
- Quote estimate/buffer reserve, actual smaller → return remainder, actual larger → reserve extension or stop; concurrent jobs cannot collectively exceed posted balance plus class limit.
- Class `FREE` rejects negative balance, class verified explicit line permits up to exact maximum; class changes, expired funding source, overdue invoice and chargeback handled by versioned rules.
- Provider accepted payment but webhook arrives twice/delayed → at most one top-up; provider payment uncertain → no speculative credit; long-running job crash and Queue redelivery do not double debit or double grant.
- With a PAYG unsettled credit exposure, owner share is pending until funding recognized (or separately approved guarantee); negative balance collection brings exposure back within limit; no hidden cash withdrawal.
- ACP/UCP/AP2/x402/PSP adapters report exact real supported capabilities, unavailability and human handoffs; cannot be marked working solely by a mocked SDK or published spec.
- End-to-end `aimarkethubs.com` Debian tests, then a scoped user-authorized `smartsihub.com` Cloudflare Beta for the functional payment paths. Do not demand all third-party adapters go live before independent native prepaid/plan UI and Skill execution can be tested.

Financial integrity assertions protect **only** affected charge/credit issuance/overdraft feature from unsafe activation; they are not an excuse to block publishing unrelated UI/marketplace/core functionality. Every release must report real tests, which paid paths are live, limits by class and external provider verification. No undelegated live payment, massive financial DB mutation or raw credential export is authorized by this design draft.

## 9. Implementation work packages
- `FIN-A`: Read-only catalog of existing SPEC-207/280/303 implementations, `creditService`, reservations, invoices, subscriptions, Beam/PromptPay, existing provider tokens/mandates; real schema and current conversion epoch; do this alongside coding.
- `FIN-B`: Implement/extend canonical Platform Subscription monthly credit grant with once-only invoice-paid period key, versioned plan entitlements and separate App plan references; expose UI/MCP via same API.
- `FIN-C`: Implement agent delegation/mandate/budget, quote and top-up flow using existing financial authority, with human handoff where needed.
- `FIN-D`: Implement atomic bounded PAYG reservation, incremental extension, actual settlement, class exposure and dunning, safe credit distribution pending funding.
- `FIN-E`: Provider adapters in priority order: existing Beam/PromptPay + native headless account-bound payment; Stripe/ACP or UCP/AP2 etc only where available; x402 optional jurisdiction-qualified. Do not force extra PSPs as prereqs for native beta.
- `FIN-F`: Link to Rust job supervisor/`worker_jobs`, Queue duplicate/recovery tests, operator/user receipts and Playwright/Agent headless UAT. Release independently to Debian then accepted Cloudflare target.

## 10. Direct companion SPEC alignments
- SPEC-313: new greenfield SaaS Core finances facade + two separate subscriptions, required platform user identity, shared ledger adapter; no old Express/tRPC conversion.
- SPEC-318: persisted quote/reserve/usage/settlement tied to `worker_jobs`, lease and per-skill nested invocation identities; no money state in ephemeral Queue messages.
- SPEC-319: UI, headless APIs/MCP and optional browser WebMCP call same canonical financial actions; no requirement to open website.
- SPEC-320: product UI separately lists Platform Subscription, Mini App Subscription, prepaid, auto top-up, PAYG and current class/available spend; no fake all-inclusive subscription claims.
- SPEC-321: provenance/redenomination and owner share remain authoritative. Add the new platform recurring credit grant as **non-Mini-App** benefit, pending owner credit grants for uncollected PAYG and class-limited payg behavior.
- Legacy SPEC-207/280/303: additive compatibility notes, never edit frozen history in place. Non-public PSP partner eligibility must be actually verified prior to claiming enabled.

## R1.0 — Agent payments follow App identity across hosting accounts
An Agent acting for a verified SmartSIHub user can purchase/invoke a Mini App on main domain, custom domain, another Cloudflare account or user server by the same scoped Core API/MCP mandate and canonical payer ledger. BYOC/self-hosted App servers are clients of Core economic APIs and may store their own business records; they cannot access payment credentials, credit ledger DB or arbitrarily settle amounts. Provider/payment source does not determine App business DB. Canonical receipts bind appId/deployment/tenant/payer/user and skill lineage.


## R1.1 — Owner-directed autonomous bootstrap and priority order (2026-11-01)

**Normative owner directive:** ALL development of the new SmartSIHub platform SHALL be initiated, orchestrated, observed and accepted through the *currently running* `https://smartaihub.app` Autonomous Implements / Autonomous Mini App Creator facilities, using their existing SPEC-224 Job/Run, Runner, Workspace, Harness and deployment authorities. `smartaihub.app` is the **temporary development control plane**, not the new SaaS Core implementation or the new production domain. This rule applies to source changes, builds, tests, release requests, UAT and repair work; executors may run CLI internally as delegated tools. An emergency out-of-band repair is permitted ONLY when the old UI/control path is nonfunctional; reconcile its exact SHA/Run/receipts back into the canonical record as soon as recovery permits. Never claim that a task was executed through the UI unless actual Run evidence confirms it.

The priority order is fixed for planning: **P0 legacy autonomous-system repair/proof → P1 fresh lightweight Core/Shell → P2 Chat → P3 Autonomous Mini App Creator → P4 new Autonomous Implements → P5 selective autonomy handover → P6 Public Portfolio/Marketplace → P7 other modules**. Thin dependencies (login, job contracts, SDK, billing read-only, public designs) MAY be built in parallel; this is an execution priority, not a global blocking gate. No new Core/Mini App is allowed to write business data into canonical `smartspec` other than the existing narrowly registered Legacy module data exception under SPEC-323.

The development loop SHALL be: **Goal entered on old website → durable Run and owned Debian workspace → implement/test/build → real `aimarkethubs.com` UAT → scoped `smartsihub.com` Cloudflare beta when appropriate → user feedback → automatic child repair/continue**. A defect in the existing control plane becomes an **in-scope bootstrap repair task** for the affected operation, not a reason to abandon the migration or create another approval system. Preserve task identity, source SHA, logs and work artifacts through restart/disconnect; no silent success claims. The new autonomous implementer becomes the primary authority only after it has completed real development tasks and recovery/rollback tests; user-visible traffic switches selectively, with the old tool retained as fallback until stable. See SPEC-324 and [roadmap](../../../docs/smartsihub-r1.4/ROADMAP-AUTONOMOUS-IMPLEMENTATION.md).

Autonomous development under P0–P4 is a delegated Goal with explicit payer, budget, provider and credit ceilings via the existing authority; do not require a new approval per child step. Agents may invoke headless quote/reserve/pay/settle under valid owner grants. Automated self-build work must expose its actual cost and stop only an unsafe or out-of-budget operation, not freeze unrelated module tasks.

---

## R1.4 — Cross-SPEC owner reconciliation and execution contract (2026-11-01)

> **Historical R1.4 provenance:** retained as the 2026-11-01 proposal record. For conflicting current requirements, R1.5 controls; see [R1.5 owner-decision precedence](../../../docs/architecture/R1.5-OWNER-DECISION-PRECEDENCE.md).

> **Historical R1.4 cross-spec review (2026-11-01):** This was the controlling addendum for the R1.4 proposal. It remains historical provenance; current conflicts follow R1.5 and the [R1.5 owner-decision register](../../../docs/architecture/R1.5-OWNER-DECISION-PRECEDENCE.md). Earlier sections remain for context and are not deployment or implementation evidence.


### R1.4 shared invariants (normative)

1. **Identity and domains.** `smartsihub.com` is the confirmed Cloudflare **production** hostname; `aimarkethubs.com` is the Debian-first new-platform development + real-human UAT; `smartaihub.app` is the still-running legacy system AND the sole initial user-facing development-command center, to be retired as a controller only after proven selective handover. Hostname, `NODE_ENV`, public link or site labels MUST NOT be used as substitute for verified runtime target, role or payment authority.
2. **No parallel financial or job authority.** PostgreSQL `smartspec` continues to own canonical identity, tenancy, wallet/credits, subscriptions, marketplace/app IDs, and `worker_jobs`; registered **legacy-migrated data** may stay there. New stateful Mini App business data MUST use an app-specific store outside Core; stateless Apps need none. Rust, TypeScript, Mini App, Browser and external Agent MUST access central financial/job effects through the versioned authorized contracts, not invent private settlement or job ledgers.
3. **Technical baseline.** Fresh minimal **TypeScript/Hono Core Workers**, **React/TypeScript fixed shell + optional OpenUI interactive renderers**, **Astro public marketplace** built from scratch, **Rust-native long-running supervisor** and TypeScript Queue transports. Never convert/copy the legacy server wholesale or require Rust/Wasm in every Core API. Optimize JS/asset/bundle size and queries using measurements, without blocking unrelated UAT on advisory targets.
4. **User-centric autonomy.** P0 repairs and exercises existing `smartaihub.app` Autonomous Implements / Creator; P1 new Core; P2 Chat; P3 Mini App Creator; P4 new Autonomous Implements; P5 selected authority handover; P6 portfolio/public marketplace; P7 remaining modules. Priorities allow parallel safe preparation, never global step-by-step approval loops. Scope only actual unauthorized data/finance, wrong-target deployments, unsafe effects or unavailable nondelegable authority.
5. **Chat-first, always-on when truly hosted.** Human Chat is the front door; direct HTTPS/MCP enables Agent use without UI. Dynamic inline diagrams/interactive forms/OpenUI and artifact/browser side-panels render one canonical action/run identity. `worker_jobs` persists independently of user browser sessions, but **do not claim cloud 24/7 persistence** for a job whose only authorized executor is an offline user device.
6. **Browser and Computer Use.** SPEC-208 remains authoritative: deterministic eligible-route policy then optional Clef bounded decision; direct API/MCP first, Chromium/Playwright dependable pilot, **Moli explicitly unqualified for production pending isolation/security evidence**, Kitesurf only supported beta profiles, Windows/Linux desktop via approved Runner. Browser snapshots/session state are not durable Job authority. WebMCP browser tools are optional early-preview projections, not a headless server API or permission escalator.
7. **Economic and commercial identity.** 1 USD = 10,000 **new** credits; preserve old purchased/earned value by atomic denomination-versioned x10 migration for old units, avoid historical ledger rewrite and mixed unit writers. Only four revenue roles (Platform, Tenant Infra, Mini App, Skill) credit verified owner user wallets. One-time referral bonus is Platform-funded, not a fifth share. SmartSIHub **platform** subscription (monthly credits) is distinct from Mini App subscription (only new **exclusive** in-app Skills included); all shared/external Skills charged per distinct invocation. Pay-as-you-go reserve/actual settle/unused release and per-class overdraft default **zero** unless authorized. Users must have a SmartSIHub account; paid platform subscription is not universally mandatory.
8. **Cross-provider portability and idempotency.** Core remains PostgreSQL; independent new Mini Apps use app-owned **D1** / independent PostgreSQL or self-hosted storage under **BYOC** or managed deployment. **Idempotency** is required for job admission, shared Skill usage, credit reservation/settlement, subscription grants, referral bonuses and replayed webhooks; this is a business-effect invariant rather than a new global approval gate.
9. **Visual product contract.** Include Light, Dark, and Balance theme tokens and three **reference** mockups. Public Website link appears when available; Admin/Back Office is capability-gated and hidden for ordinary users. These concept pictures are non-executable, illustrative screens: never fake percentages, status or receipts as real run telemetry. No generated UI may invent a valid payment, deploy, DB or browser action without typed server-side registration and authorization.

### SPEC-322 targeted closure

**Payment/credit risk:** Before each agent spend, bind actor, mandate, tenant/app/skill, amount, timeframe, effect class and idempotency key to a signed server-side authorization. Quote estimated credits + buffer, atomically reserve against `balance+authorizedCreditLimit-activeHolds`, settle actual once, release unused. Preserve `-limit` across concurrent jobs. If actual cost exceeds hold or external payment outcome is uncertain, stop just the affected spend and reconcile; do not exceed class policy or fabricate funds. Paid platform monthly credit grants are idempotent per billing period and distinct from Mini App subscription; third-party checkout adapters may require human challenge.

---

## R1.5 — Agent spend mandates and independently verified effects (2026-11-02)

Distinguish Agent compute/model quota or subscription from a user’s spendable wallet and from a Mini App subscription. A spend mandate binds the verified payer and tenant to permitted merchants/providers, action classes, Mini App/Skill, maximum amount and currency, time window, aggregate goal budget, expiry, policy epoch and revocation state. An Agent cannot create, increase, renew or transfer its own mandate.

Ordinary in-scope autonomous work runs under one bounded Goal grant without repeated approval for each safe step. Step-up/confirmation applies to impact-based high-risk actions such as materially exceeding a mandate, an external purchase/payment, credential scope expansion, destructive data change or public publication when the grant excludes it. The server independently verifies the effect digest, destination, amount and current policy before dispatch and reconciles the receipt afterward. Idempotency and ledger settlement prevent duplicates across queue retries or device reconnect. Do not introduce a duplicate wallet, ledger, entitlement or job authority. See SPEC-325.
