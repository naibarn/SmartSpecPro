---
spec_id: 303
title: SmartAIHub Ecosystem Asset Registry, Ownership, Transfer, Distribution & Discover Contract
revision: R0.1
date: 2026-10-07
status: DESIGN_CONTRACT
scope: Platform-wide / multi-channel asset identity and rights
risk_class: HIGH
normative_language: RFC-style MUST / MUST NOT / SHOULD / SHOULD NOT / MAY
---

# SPEC-303 — SmartAIHub Ecosystem Asset Registry, Ownership, Transfer, Distribution & Discover Contract

## 0. Decision and boundaries

SmartAIHub is an ecosystem operator and MUST NOT be presumed to own every asset. Users, tenants, companies, creators, and partners may hold legally distinct asset, publication, operational, maintenance, and revenue rights. This Spec defines stable asset identity, rights, distribution, ownership history, and economic-party bindings. It does not create a credit ledger, wallet, payment rail, or settlement engine.

Authority remains separated: SPEC-303 owns asset identity/ownership/commercial-right identity; SPEC-280 owns capability commerce and revenue-attribution policy; SPEC-207 owns wallet/economic/settlement infrastructure; existing `credit_transactions` and `creditService` own current credit debit/refund; SPEC-166 owns charged-work lineage. Current code contains `skillRevenueBilling`; implementation evidence does not justify duplicating it.

## 1. Ecosystem and asset identity

Concepts are distinct:

- `Ecosystem`: shared platform/network boundary and policy root.
- `Channel`: distribution/brand/audience surface within an ecosystem.
- `Partner`: contracted organization or distributor; not necessarily a tenant or asset owner.
- `Tenant`: security, configuration, and data-isolation boundary.
- `Asset`: stable, versioned product identity and rights container.
- `Distribution`: a channel-specific listing/deployment offer referencing an asset.

An asset has stable opaque `assetId`, ecosystem, `assetType`, title, version lineage, creator/source provenance, lifecycle, visibility, policy references, timestamps, and retention. Canonical types include `APP`, `AGENT`, `PLUGIN`, `SKILL`, `UI_COMPONENT`, `RUNTIME_COMPONENT`, `WORKFLOW`, `TEMPLATE`, `KNOWLEDGE_PACK`, `CONNECTOR`, `HOSTED_CAPABILITY`, and `DATA_PRODUCT`. Every qualifying user-facing SmartAIHub App (including Chat, Finance, Vertical Drama, Video Studio, Workflow Studio, and future apps) has a stable App/Asset identity; listing absence does not erase identity.
A `WORKFLOW` asset is an identity/listing for a portable definition or approved-runtime adapter only; it MUST NOT restore the retired `/workflows` route or legacy custom workflow engine. Agent execution uses the OpenAI Agents API on the Python backend; long-running work uses `worker_jobs` plus outbox, and risky isolation uses the approved Cloudflare Container runtime.

Ownership and rights MUST bind to stable organization, legal-party, or principal identifiers, never email/login strings. `SmartAIHub Official` denotes certification/relationship and is not ownership.

## 2. Parties and rights

Roles are independently assigned, effective-dated bindings: `LEGAL_OWNER`, `PUBLISHER`, `COMMERCIAL_OPERATOR`, `MAINTAINER`, `REVENUE_BENEFICIARY`. One legal entity MAY fill multiple roles, but each role/account identity remains separate.

Rights are explicit, scoped, revocable, and auditable: `OWNERSHIP`, `SOURCE_ACCESS`, `PUBLISH`, `DEPLOY`, `MAINTAIN`, `PRICE_CONTROL`, `PROMOTION`, `REVENUE_RIGHT`, `LICENSE_GRANT`, `SUBLICENSE`, `TRANSFER`, `LEASE`, `CUSTOM_DOMAIN`, `USER_ANALYTICS`, and `DATA_ADMIN`. Each grant identifies asset/version/scope, grantor, grantee, policy, effective interval, constraints, and revocation state. Rights do not follow role names implicitly.

## 3. Transfer, clone, lease, and continuity

Sale, ownership transfer, publisher/operator/maintainer change, control change, settlement-account change, and lease are distinct events. Transfer MUST be authorized by the effective owner and applicable policy, identify transferred rights and exclusions, record an effective time, preserve immutable before/after history, and be idempotent. App ID, canonical route, aliases, reviews, installs, saved references, and user relationships do not change merely because ownership changes.

`App ownership transfer ≠ transfer of user memory.` `App clone/fork ≠ clone user private memory.` Asset dependencies retain their original ownership unless separately licensed/transferred. Shared/project data transfer requires its own policy and data-rights agreement, tenant/ACL checks, user notice where required, and a provenance record. A lease grants only enumerated temporary rights; it does not change legal ownership. Maintainer change does not imply ownership change.

## 4. Channels and distribution

`smartaihub.app` is the direct creator/user channel. A future `oneaihub.ai` or white-label/custom domain is an additional partner/B2B/B2B2C channel, not a second ecosystem database. An asset MAY distribute through many channels. Distribution context carries `ecosystemId`, `channelId`, optional `partnerId`, `tenantId`, `assetId`, `appId`, listing/release/deployment references, locale, policy versions, and effective interval. A channel alias or domain is mutable and never canonical identity.

Public Discover may expose only listings whose visibility and policy permit anonymous access. Search, ranking, featured promotion, certification, reviews, and referral are separate concepts and authorities. No private tenant metadata, analytics, or source access is implied by a public listing.

## 5. Economic-party and settlement binding

Target concepts: `EconomicParty`, `SettlementAccount`, `RecipientBinding`, `ControllerBinding`, and `PayoutProfile`. These connect business identity to existing settlement infrastructure; they do not hold balances or replace its ledger. Revenue allocation MUST NOT bind to email/login account. Allocation snapshots reference policy version, economic roles, recipient bindings, effective time, currency/amount semantics, lineage ID, and correction/reversal link.

Canonical roles include `INFRA_OPERATOR`, `PLATFORM_OPERATOR`, `CHANNEL_OPERATOR`, `TENANT_OPERATOR`, `APP_PUBLISHER`, `SKILL_PUBLISHER`, and `REFERRER`. SmartAIHub root tenant is not automatically the Platform role; infrastructure provider/operator is not automatically the Platform role. One company may fill multiple roles today while architecture preserves independent role/account identities.

## 6. Cost, subsidy, and referral policy

Economics distinguish `INFRA_VARIABLE_COST`, `INFRA_FIXED_COST_ALLOCATION`, `INFRA_COST_RECOVERY`, `INFRA_OPERATOR_MARGIN`, `INFRA_SUBSIDY`, and `PLATFORM_REVENUE`. Measured CPU/GPU time, memory time, storage, egress, queue/workflow, database, vector, and provider usage are cost evidence. Actual infrastructure cost is not a fixed percentage of each transaction.

Planned operating losses are allowed only with explicit subsidy source (`PLATFORM_GROWTH`, `TENANT`, `SPONSOR`, or `CAPITAL`) and policy/budget authorization. Infra shortfall MUST NOT silently reduce creator, App, or Skill revenue. Referral is one-time by default, triggered by `FIRST_QUALIFYING_REVENUE_EVENT`; no MLM/perpetual downstream commission, and no review/rating reward. Acquisition referral cost normally comes from Platform/Tenant acquisition budget, not infrastructure recovery.

## 7. Event and idempotency contract

Ownership, rights grant/revoke, listing, distribution, transfer, lease, settlement binding, payout profile, and policy changes are immutable versioned events or auditable state transitions. Retries use caller-stable idempotency keys plus source version/effective-time fencing. Reversal corrects an allocation with linked compensating records; prior history is never rewritten. Unauthorized or stale owner/policy epochs reject mutation. High-impact ownership, payout-recipient, and custom-domain transfers require step-up authorization and, where policy classifies risk as elevated, independent review or time-bounded hold. Dispute/fraud controls may freeze a transfer or settlement binding without silently changing legal ownership. Ranking, promotion, reviews, referral, and fraud scoring have separate policies; payment, rating, install, or referral rewards MUST NOT be used to manipulate reviews or rankings.

## 8. Authority integrations

- SPEC-280 consumes `assetId`, party/role bindings, channel/tenant context, and pricing/revenue policy versions; it remains capability-usage/revenue attribution authority.
- SPEC-207 consumes settlement-account/recipient bindings to route settlement; SPEC-303 neither calculates wallet balances nor posts settlement entries.
- SPEC-166 adds lineage dimensions for ecosystem/channel/partner/tenant/user/project/app/asset/skill/deployment/conversation/trace and policy-version IDs. A charged credit traces payer → tenant/channel → App/Asset → Skill/Capability → Runtime/Deployment → settlement allocation.
- `credit_transactions` remains current debit/refund authority. A refund/reversal must link to original charge and affected allocations without a second credit ledger.
- SPEC-304 owns stable App identity and routing; a sale or listing change never rekeys the asset.

## 9. Acceptance contract

Required scenarios: asset sale while installs/reviews persist; effective-date revenue split; App clone without private memory; dependency Skill retains owner; lease with limited rights; maintainer/controller change without ownership transfer; domain change; tenant/channel distribution of one asset; infra deficit with named subsidy and unchanged creator share; one-time referral; refund after allocation; payout recipient change; private tenant App hidden from public Discover; and transfer retry/replay.

## 10. Migration and rollout

Phase 0 inventories current app/skill identity, ownership fields, publisher/settlement references, and current credit/revenue services. Phase 1 adds read-only joins and stable-ID mapping. Phase 2 introduces versioned asset/party bindings alongside existing records. Phase 3 migrates one asset class with reconciliation and rollback. Existing IDs remain stable. No payout, ownership, or migration is executed by this Spec; production execution remains under SPEC-295 and relevant legal/policy controls.
