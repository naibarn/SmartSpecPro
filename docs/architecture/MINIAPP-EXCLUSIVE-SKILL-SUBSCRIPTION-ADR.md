# ADR — Mini App Subscription Covers Only Newly Authored App-Exclusive Skills (R0.7)

**Owner decision:** A monthly Mini App Subscription includes only Skills **newly written specifically for that Mini App**, restricted to that canonical `appId`, and not shared with other Apps/workflows/Skill Marketplace. Any shared Skill invocation remains separately metered and charged in credits **every time a distinct logical call is made**, regardless of Mini App Subscription. This overrides any broader R0.6 language about subscription coverage or a general subscription-funded Skill-owner pool.

## Classification

| Skill class | Qualifying provenance | Billing while subscribed |
|---|---|---|
| `APP_EXCLUSIVE_SKILL` | New implementation written for this `appId`, verified identity/version/binding, cannot be reused in another App/workflow | Included, 0 additional per-call subscriber credits |
| `SHARED_BILLABLE_SKILL` | Platform/Core/Marketplace/other-App/third-party or published for reuse, including renamed/wrapped clones | Quote/authorize/reserve/debit once per distinct accepted invocation |
| `UNVERIFIED_SKILL` | Cannot prove exclusive origination/binding | No automatic exemption: quote as metered or disable the unsafe affected action |

An App may sell the same App-exclusive Skill across deployments of **that App** under its own license. A different App identity cannot inherit exemption. Reuse of common libraries/SDKs is not equivalent to calling a shared billable Skill; actual action lineage and Skill Registry calls determine billing classification. The App owner bears the disclosed provider cost of its exclusive functions unless an approved contract says otherwise.

## Non-negotiable execution ordering

1. Resolve `appId`, `skillId`, `skillVersion`, provenance, effective Offer Policy, actor/tenant and subscription entitlement server-side.
2. For each shared invocation (including a nested invocation), obtain a stable logical invocation ID, price quote and payer authorization; reserve credits through existing SPEC-207 authority before side effects.
3. Admit/execute with durable `worker_jobs` lineage and link the exact billing decision; retry/lost ACK uses the original invocation ID and cannot debit twice.
4. Settle or refund per financial contract; attribute per-call Skill-owner and other recipients using SPEC-280/303, not from App subscription revenue.
5. For App-exclusive included invocation, meter internal compute/capacity but do not debit subscriber per call. Optional contracted App-exclusive Skill creator shares come from the subscription settlement, not per-call shared Skill pool.
6. If App-exclusive becomes shared, reclassify at an effective policy version and require clear quote/user consent before first newly billable call. Never silently charge a current subscriber.

## Human UAT and API test matrix

| Scenario | Expected |
|---|---|
| Subscriber runs newly written private App A Skill | No per-call credit deduction |
| Subscriber calls platform/Marketplace Skill from App A | Credit deduction at each distinct accepted invocation |
| App A Skill invokes two separate shared Skill actions | Two separate priced child invocation records and deductions |
| Same shared action Queue delivers twice (lost ACK) | Exactly one financial deduction for same invocation ID |
| App A uses an unchanged clone/alias of marketplace Skill | Not eligible for exemption; charged as shared |
| Shared Skill belongs to App B, invoked by App A | Charged separately |
| Exclusive Skill published for general reuse mid-subscription | Billing rule version changes and user sees new quote; no surprise auto-debit |
| External agent calls App A via MCP/headless | Identical rules as React/WebMCP |
| Shared call fails before execution | No wrongful debit; reservation released or refunded via SPEC-207 |
| Four economic roles map to fewer legal parties | Financial attribution preserved; actual payout consolidated |

No duplicate Job/Skill Registry/Credit Ledger may be introduced. Focus tests on affected paid actions; unrelated features may continue to deploy and undergo Human UAT independently.

## R0.8 credit-first recipient settlement

A subscribed Mini App's included exclusive Skill does not debit the subscriber per call. Verified monthly subscription revenue is allocated once per period to **existing user wallets** for eligible four-role recipients (and only contracted App-exclusive Skill ownership within the `SKILL_OWNER` slot). A shared Skill used inside that App performs its own payer debit and recipient-user credit additions once per distinct logical invocation. Referral rewards are one-time Platform-budgeted bonus credit grants outside both revenue pools. No monetary withdrawal functionality is part of this launch.
