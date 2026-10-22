# Spec 280 — SmartAIHub Metered Capability Commerce & Creator Economy Runtime
## Skill-as-a-Service, Mini App Pay-per-Use, Multi-Tenant Revenue Allocation, BYO-LLM Economics & Build-to-Earn

**Status:** Proposed / Additive implementation-ready specification  
**Spec ID:** 280  
**Revision:** 1.4 — SPEC-207/280 executable contract, ownership and acceptance alignment
**Date:** 2026-10-19
**Target repository path:** `specs/feature/280-metered-capability-commerce-creator-economy-runtime/spec.md`  
**Primary owner:** SmartAIHub Capability Commerce / Marketplace Runtime
**Canonical development orchestrator:** Spec 224 (unchanged)  
**Canonical Skill/capability semantic resolver:** implemented Spec 256 (unchanged)  
**Canonical portable application/product contract:** Spec 261 SPAAS  
**Canonical assistant layer:** Spec 269  
**Canonical command ingress:** Spec 279  
**Canonical durable execution:** `worker_jobs` + Spec 278  
**Canonical authority:** SPEC-280 owns usage metering, pricing, task/service billing and revenue sharing; SPEC-207 owns payer/funding selection, wallet, budget reservation, spending authorization, payment attempts, ledger, settlement, refunds and reconciliation. This Spec MUST integrate rather than duplicate financial authority.
**Core business principle:** BYO-LLM + rent SmartAIHub capabilities + build/publish/earn  
**Implementation rule:** ADDITIVE ONLY. Existing implemented Spec 224/256 behavior MUST remain valid.

---

# 0. Executive Decision

SmartAIHub SHALL treat proprietary/premium Skills and other monetizable capabilities as **metered services**, not as files that users must permanently install into Claude, Codex, Hermes or another external harness.

The core commercial path is:

```text
User brings preferred LLM / Harness
        ↓
SmartAIHub orchestrates
        ↓
SmartAIHub paid capability is invoked
        ↓
SPEC-207 authorization / reservation (Credits or eligible PAYG)
        ↓
capability executes
        ↓
evidence/result
        ↓
SPEC-207 settlement (using legacy Credits primitives where selected)
        ↓
revenue allocated
```

A user MAY pay Claude/Codex/Hermes/provider costs separately because that is often economically advantageous.

SmartAIHub revenue is created by:

- premium Skill invocation;
- Mini App usage;
- Workflow usage;
- Agent-service usage;
- SmartAIHub-hosted execution;
- specialized APIs/data/capabilities;
- marketplace/platform fees;
- white-label / tenant participation.

The strategic product invariant is:

> **SmartAIHub SHALL amplify user-owned AI subscriptions rather than require replacing them. The economic value SmartAIHub sells is orchestration, continuously expanding premium capabilities, execution, verification, deployment, distribution and creator/tenant monetization.**

---

# 1. Build-to-Earn Product Loop

SmartAIHub SHALL support the complete loop:

```text
User goal
  ↓
Spec 224 builds Web App / Mini App / AI Product
  ↓
Spec 261 package/product contract
  ↓
Deploy on SmartAIHub
  ↓
Publish offering
  ↓
Users invoke product
  ↓
Metered credit charge
  ↓
Revenue allocation
  ↓
Creator / Tenant / Platform earn
```

A user is therefore not only a buyer of SmartAIHub capabilities.

They MAY become:

- Skill creator;
- Mini App owner;
- Workflow creator;
- public Agent/service owner;
- tenant/white-label operator;
- reseller/distribution partner.

---

# 2. Why Server-Authoritative Skills Are Required

A monetized SmartAIHub Skill MAY contain valuable:

- prompts/instructions;
- orchestration policy;
- specialized decision logic;
- evaluation rubrics;
- proprietary knowledge;
- scripts;
- sub-agent strategy;
- model/tool routing;
- verification methods;
- private datasets or capability bindings.

For `SMARTAIHUB_HOSTED` / monetized Skills, the implementation SHALL NOT require distributing the proprietary Skill implementation to an external harness.

External clients SHOULD receive only:

```text
skill id
version / public release
description
input schema
output schema
price/estimate
permissions
compatibility
public documentation
```

The protected implementation remains server-authoritative.

---

# 3. Capability Commercialization Classes

Every callable capability SHALL declare one commercial class:

```text
BUILT_IN_FREE
OPEN_LOCAL
SMARTAIHUB_HOSTED_METERED
TENANT_HOSTED_METERED
CREATOR_HOSTED_METERED
MINI_APP_METERED
WORKFLOW_METERED
AGENT_SERVICE_METERED
INCLUDED_IN_PLAN
SPONSORED
ENTERPRISE_CONTRACT
```

The class describes commerce behavior, not semantic capability identity.

Spec 256 remains responsible for semantic discovery/resolution.

---

# 4. Discovery vs Paid Execution

Discovery SHOULD be low-friction.

Recommended free operations:

```text
capability.search
skill.search
skill.describe
skill.compatibility
skill.price_estimate
offering.describe
```

Metering begins at a declared value-producing commercial boundary such as:

```text
skill.invoke
miniapp.run
workflow.run
agent_service.run
hosted_execution.start
```

Internal tool calls of one paid invocation SHALL NOT automatically become separate Skill fees.

---

# 5. Canonical Commercial Invocation

Every paid use SHALL create one `CapabilityInvocation`.

Illustrative contract:

```yaml
capability_invocation:
  invocation_id: inv_...
  idempotency_key: ...

  principal:
    user_id: ...
    tenant_id: ...
    organization_id: ...

  capability:
    capability_id: ...
    capability_type: skill | mini_app | workflow | agent_service | api | execution
    release_id: ...
    provider_owner_id: ...
    creator_owner_id: ...

  source:
    command_id: ...
    development_run_id: ...
    worker_job_id: ...
    external_harness_ref: ...

  commercial:
    offering_id: ...
    price_policy_version: ...
    revenue_policy_version: ...
    payer_policy_ref: ...
    budget_cap: ...

  execution:
    runtime_ref: ...
    execution_session_ref: ...
    lease_ref: ...

  settlement:
    state: PROPOSED | RESERVED | RUNNING | SUCCEEDED | FAILED | SETTLED | REFUNDED | DISPUTED
```

---

# 6. Skill Lease

Metered Skills SHOULD use an invocation-scoped `SkillLease`.

```yaml
skill_lease:
  lease_id: ...
  invocation_id: ...
  user_id: ...
  tenant_id: ...
  skill_id: ...
  skill_release_id: ...
  allowed_actions: [...]
  workspace_scope_ref: ...
  harness_scope_ref: ...
  budget_remaining: ...
  expires_at: ...
  policy_digest: ...
```

The lease authorizes one bounded service use.

It is not a transfer of ownership or source.

A restart/recovery of the same invocation MUST NOT create a second billable Skill invocation by itself.

---

# 7. Remote Skill Brain + Local Execution Hands

A paid Skill MAY execute centrally while controlling bounded primitives on the user's Runner.

Example:

```text
SmartAIHub hosted Skill logic
        │
        ├─ asks Runner to read selected files
        ├─ asks Runner to run tests
        ├─ delegates implementation to user Codex
        ├─ verifies evidence
        └─ returns result
```

The local machine MAY contain only:

- external harness;
- SmartAIHub Runner;
- SmartAIHub bootstrap MCP/client;
- generic execution adapters.

It need not contain the proprietary Skill implementation.

---

# 8. Harness Bootstrap

An external harness SHOULD need only a thin SmartAIHub bootstrap surface:

```text
capability.search
skill.search
skill.describe
skill.invoke
task.create
task.get
agent.delegate
artifact.get
```

This bootstrap MAY be free/open.

It is a gateway to paid capabilities; it is not itself a premium Skill.

---

# 9. Spec 224 Integration — Skill-Aware Development

Spec 224 SHALL remain unchanged as the canonical Development Orchestrator.

Spec 280 integrates additively through a capability-commerce contract.

At relevant stages Spec 224 MAY perform:

```text
stage objective
  ↓
Spec 256 resolve required capabilities
  ↓
compare:
  - harness built-in capability
  - free/local capability
  - SmartAIHub metered capability
  ↓
select minimum paid capability set that materially improves outcome
  ↓
if metered:
    estimate
    reserve
    invoke via Spec 280
  ↓
continue DevelopmentRun
```

SmartAIHub MUST NOT call paid Skills merely to maximize revenue.

The governing principle is:

> **Use the minimum paid capability set that materially improves the requested outcome, reliability, verification or compliance beyond available built-in capabilities.**

---


# 9A. Dynamic Marketplace as Machine-Consumable Capability Supply

The SmartAIHub Marketplace SHALL be consumable by both humans and SmartAIHub runtimes.

A newly published/approved Skill SHOULD become discoverable through the existing Registry/Spec 256 retrieval path without requiring:

- a Spec 224 code change;
- a new SmartAIHub Desktop release;
- installation into every Claude/Codex/Hermes environment;
- manual registration inside each DevelopmentRun.

The intended loop is:

```text
Creator publishes Skill release
    ↓
Registry / certification / offering becomes active
    ↓
Spec 256 can retrieve it as a candidate
    ↓
Spec 224 sees the capability when a future stage needs it
    ↓
Spec 280 estimates/meters invocation
    ↓
usage + outcome evidence
    ↓
future quality/cost selection signals
```

Spec 224 SHALL request **capability requirements**, not hard-code an exhaustive list of commercial Skill IDs.

This permits SmartAIHub's usable capability supply to expand continuously while the core orchestration kernel remains stable.

## 9B. Capability Candidate Commercial Metadata

Spec 256 remains semantic authority, but a resolved candidate MAY carry non-authoritative commerce metadata from Spec 280 such as:

```text
commercial_class
offering_id
estimated_credit
pricing_model
tenant_availability
entitlement_state
creator_ref
quality/trust certification ref
```

Semantic relevance MUST be determined independently from platform margin.

Commerce metadata is used after relevance/compatibility filtering to determine feasibility, cost/value and authorization.

## 9C. Skill Freshness During Long Development Runs

A DevelopmentRun MAY discover a newer Skill release after the run has already started.

Rules:

- an already-started paid invocation remains pinned to its release/policy;
- a later stage MAY select a newer certified release if policy allows;
- a recovery/retry of the same invocation MUST NOT silently upgrade the Skill;
- a material Skill upgrade during a run SHOULD be recorded in evidence/provenance;
- reproducible verification MAY pin the same Skill release used by the stage being verified.


# 10. Development Capability Plan

Spec 224 SHOULD be able to consume an additive `DevelopmentCapabilityPlan` projection.

Example:

```yaml
development_run: dev_123

stage: verification

requirements:
  - web_security_review
  - browser_uat
  - accessibility_review

resolved:
  web_security_review:
    provider: smartaihub_skill
    offering_id: off_...
    estimated_credit: 4.0

  browser_uat:
    provider: smartaihub_capability
    estimated_credit: 2.2

  accessibility_review:
    provider: codex_builtin
    estimated_credit: 0
```

This projection SHALL NOT replace the internal plan/state machine of Spec 224.

---

# 11. User Cost Modes

Users SHOULD be able to select:

```text
ECONOMY
BALANCED
BEST_QUALITY
CUSTOM_BUDGET
```

These modes influence capability selection and spend policy but MUST NOT bypass mandatory security/safety gates.

A user MAY also define:

```text
always ask before paid Skill
allow up to X credits/run
allow recommended Skills
deny third-party paid Skills
tenant-sponsored usage
```

---

# 12. Pricing Models

An Offering MAY use:

```text
PER_INVOCATION
PER_SUCCESS
PER_ARTIFACT
USAGE_METERED
TIME_METERED
SUBSCRIPTION_INCLUDED
SPONSORED
ENTERPRISE
CUSTOM
```

Pricing MUST distinguish:

```text
underlying cost
customer price
revenue allocation
```

These are not the same number.

---

# 13. Multi-Tenant Economic Model

Multi-tenant economics are first-class.

A tenant may:

- operate its own branded SmartAIHub experience;
- use its own domain/subdomain;
- acquire customers;
- curate products;
- sponsor usage;
- publish tenant-specific Skills/Mini Apps;
- onboard creators;
- provide support/community/distribution.

Therefore the **Tenant Operator / Tenant Admin** MAY receive a revenue share from eligible transactions.

This is not a technical hosting fee; it is an economic role.

---

# 14. Revenue Waterfall

Spec 280 SHALL NOT hard-code a fixed "3-way" split.

It SHALL use a versioned **Revenue Allocation Graph**.

Default conceptual waterfall:

```text
Gross Customer Charge
        │
        ├─ refunds/tax/payment adjustments where applicable
        │
        ▼
Recoverable External / Infrastructure Cost
        │
        ▼
Net Distributable Revenue
        │
        ├─ SmartAIHub Platform/Admin Share
        ├─ Tenant Operator/Admin Share
        ├─ Product Creator Share
        ├─ Nested Skill/Capability Creator Share(s)
        └─ other contractually allowed beneficiaries
```

This supports both simple and composed products.

---

# 15. Default Economic Roles

The allocation graph SHALL recognize roles such as:

```text
INFRA_COST_RECOVERY
PLATFORM_OPERATOR
TENANT_OPERATOR
PRODUCT_CREATOR
SKILL_CREATOR
WORKFLOW_CREATOR
AGENT_SERVICE_CREATOR
AFFILIATE_OR_CHANNEL
SPONSOR
TAX_OR_WITHHOLDING
REFUND_RESERVE
```

Not every transaction uses every role.

---

# 16. Example — Direct SmartAIHub Mini App

```text
Customer charge          20 credits

External/infra cost       4
---------------------------
Net distributable        16

Platform                   5
Mini App creator           11
```

No tenant exists, so there is no tenant share.

---

# 17. Example — White-Label Tenant Mini App

```text
Customer charge          20 credits

External/infra cost       4
---------------------------
Net distributable        16

SmartAIHub platform        4
Tenant operator            4
Mini App creator           8
```

Percentages are illustrative only and SHALL be configuration/contract driven.

---

# 18. Example — Tenant Mini App Calling Third-Party Skill

```text
Customer charge          30 credits

Infra/provider cost       6
---------------------------
Net distributable        24

Platform                   5
Tenant operator            5
Mini App creator           9
Nested Skill creator       5
```

This is why the runtime requires N-party allocation rather than a fixed split.

---

# 19. Revenue Allocation Graph

Illustrative model:

```yaml
revenue_policy:
  policy_id: revpol_...
  version: 7

  waterfall:
    - role: INFRA_COST_RECOVERY
      basis: actual_or_capped_cost

    - role: PLATFORM_OPERATOR
      basis: percent_of_net
      value: ...

    - role: TENANT_OPERATOR
      basis: percent_of_net
      value: ...

    - role: PRODUCT_CREATOR
      basis: residual_or_percent

  nested_capabilities:
    policy: allocate_declared_child_share

  constraints:
    min_platform_margin: ...
    max_total_creator_share: ...
    tenant_share_required_if_tenant_originated: true
```

The actual canonical ledger MUST remain the existing SmartAIHub economic authority.

---

# 20. Tenant Share Resolution

Tenant economic context SHALL be resolved from the actual commercial transaction, not merely the user's current UI theme.

Possible sources:

```text
deployment tenant
offering owner tenant
custom-domain tenant
tenant-sponsored payer
tenant marketplace listing
tenant sales/referral channel
```

A transaction SHALL record the chosen tenant economic basis.

A user opening the same public Mini App from an unrelated tenant MUST NOT accidentally redirect revenue without a valid offering/channel relationship.

---

# 21. Identity Collisions

The same account MAY hold multiple roles:

```text
tenant operator = product creator
product creator = skill creator
```

The allocation engine SHALL combine attributable shares for the same beneficiary while preserving role-level accounting.

It SHALL NOT accidentally pay the same role twice because of duplicate identity references.

---

# 22. Nested Capability Accounting

A monetized Mini App MAY invoke:

- paid Skills;
- paid Workflows;
- paid Agents;
- paid external APIs;
- media providers;
- SmartAIHub execution.

Nested invocations SHALL carry:

```text
parent_invocation_id
root_invocation_id
commercial_dependency_role
declared_max_cost
```

The root payer MUST NOT receive an unlimited recursive bill.

Parent offering policy SHALL define:

```text
included child capability
pass-through cost
creator-funded child use
tenant-funded child use
user-confirmed add-on
```

---

# 23. Anti-Recursive-Billing Guard

The platform SHALL prevent:

```text
Mini App A
→ Skill B
→ Agent C
→ Mini App A
```

from creating an unbounded commercial cycle.

Required:

- commercial call graph;
- root budget;
- depth;
- cycle detection;
- maximum nested spend;
- idempotent child invocation;
- policy on self-invocation.

---

# 24. Credit Reservation & Settlement

**Authority clarification (Revision 1.4):** This section describes the
commercial sequence, not a second reservation or settlement implementation.
SPEC-280 emits the immutable price/billability/allocation snapshot and usage
receipts; SPEC-207 performs payer selection, spending authorization, task and
global budget reservation, provider attempts, ledger posting, settlement,
refund and reconciliation. The existing Credits debit/refund path remains the
compatibility rail until its migration is separately evidenced. Any older
reference in this document to a SPEC-280-owned “credit reservation” means a
request to the SPEC-207 authority and MUST NOT create SPEC-280-owned balance,
hold, payment-attempt or ledger state.

Canonical flow:

```text
Estimate
→ Reserve
→ Execute
→ Measure
→ Verify billable outcome
→ Settle
→ Allocate
```

Failure handling:

```text
pre-execution rejection
→ release reservation

non-billable infrastructure failure
→ release/refund according to policy

partial billable usage
→ settle declared partial policy

duplicate retry/recovery
→ no duplicate charge

user cancellation
→ settle only contractually billable consumed work
```

---

# 25. Recovery / Idempotency

The key billing invariant is:

> **Process/session restart is not a new commercial invocation.**

Correlate:

```text
root_invocation_id
invocation_id
worker_job_id
execution_session_id
session_generation
```

Spec 278 recovery MAY change `execution_session_id/session_generation` while retaining the same `invocation_id`.

---

# 26. Usage Wallet vs Creator Earnings

The product SHOULD separate:

```text
Usage Wallet / Credits
```

from:

```text
Creator Earnings
```

Creator earnings MAY have:

```text
pending
available
held
paid
reversed
```

states.

A future feature MAY allow creator earnings to convert to platform credits, but this MUST NOT blur accounting between purchased usage credits and earned value.

---

# 27. Creator / Tenant Dashboard

Creators and tenant operators SHOULD see:

```text
gross usage
infra/provider cost
net distributable revenue
platform share
tenant share
creator share
nested capability shares
refunds/reversals
pending earnings
available earnings
usage count
conversion / active users
top products
```

Tenant operators SHOULD additionally see aggregate ecosystem metrics across their branded tenant, subject to privacy boundaries.

---

# 28. Marketplace Ranking Independence

Paid capability selection by Spec 224/256 MUST NOT rank a Skill higher merely because it pays SmartAIHub more.

Capability ranking SHOULD be based on:

```text
task relevance
compatibility
quality
success evidence
cost/value
trust
freshness
policy
```

Sponsored discovery, if offered, MUST be clearly separated from autonomous capability selection.

---

# 29. Skill Creator IP Protection

Default monetized Skill distribution SHOULD be:

```text
SMARTAIHUB_HOSTED_METERED
```

The creator may optionally publish:

```text
OPEN_LOCAL
SOURCE_LICENSE
SELF_HOSTED_LICENSE
```

as separate offerings.

The marketplace SHALL distinguish licensing form from capability identity.

---

# 30. Mini App Commercialization

A Spec-261-governed Mini App MAY define:

```text
private
shared
tenant
unlisted
public
```

and an Offering such as:

```text
free
pay_per_run
usage_metered
subscription
sponsored
enterprise
```

Spec 280 executes the runtime commercial contract declared by the package/deployment/offering model; it does not redefine SPAAS.

---

# 31. Spec 224 Build-to-Publish Handoff

When a DevelopmentRun produces a Mini App / Web App / AI Product, Spec 224 SHOULD be able to hand off:

```text
verified package candidate
→ Spec 261 validation/release
→ deployment
→ optional marketplace offering
```

Commercialization MUST be optional.

A user building a private app SHALL NOT be forced through marketplace pricing.

When the user chooses public monetization, the platform SHOULD guide:

```text
price model
estimated infra cost
tenant context
creator identity
revenue policy
usage budget/rate limits
privacy/security readiness
```

---

# 32. Tenant Branding & Distribution Incentive

A tenant operator may invest in:

- brand;
- domain;
- marketing;
- support;
- creator acquisition;
- curated marketplace;
- localized content;
- sponsored credit;
- industry expertise.

Therefore tenant share is an intentional ecosystem-growth mechanism.

The system SHOULD support tenant-level defaults:

```text
default tenant revenue share
minimum creator share
platform floor
allowed pricing models
sponsored usage rules
creator onboarding rules
```

Per-offering override MAY be allowed within platform policy.

---

# 33. White-Label Economics

White-label does not imply isolation from SmartAIHub economic authority.

Possible mode:

```text
Customer sees tenant brand
        ↓
tenant deployment/domain
        ↓
SmartAIHub canonical metering/settlement
        ↓
platform + tenant + creator allocations
```

The exact branding visible to end users is independent from ledger truth.

---

# 34. Cross-Tenant Product Use

A product creator MAY choose:

```text
home_tenant_only
selected_tenants
global_marketplace
white_label_redistributable
```

Revenue policy SHALL define whether a consuming/distributing tenant receives a channel share.

This can create:

```text
creator builds once
→ multiple tenants distribute
→ creator + tenants + platform earn
```

subject to explicit offering rights.

---

# 35. Fraud / Abuse Controls

The platform SHOULD detect:

- self-invocation loops intended only to manufacture earnings;
- circular paid capability calls;
- tenant/creator collusion to abuse sponsored credits;
- artificial usage;
- duplicate settlement;
- refund abuse;
- compromised capability keys;
- unexpected price-policy changes.

Revenue MAY enter a pending/hold state pending normal anti-abuse checks.

---

# 36. Price / Revenue Policy Versioning

Every commercial invocation MUST record:

```text
offering_id
price_policy_version
revenue_policy_version
tenant_economic_context
```

A later price/share change MUST NOT rewrite historical settlement.

---

# 37. Transparent User UX

Before a material paid invocation, the system SHOULD expose according to user policy:

```text
what capability is being used
why it is useful
estimated credits
payer
whether it uses user-owned LLM separately
```

For autonomous Spec 224 runs, Task Control MAY summarize:

```text
Codex subscription       user-provided
SmartAIHub Skills        8.5 credits
Hosted browser/UAT       2.0 credits
Estimated total          10.5 credits
```

---

# 38. External Harness Economics

External harness usage SHALL NOT eliminate SmartAIHub revenue when SmartAIHub paid capabilities are used.

Example:

```text
Codex subscription paid by user
        ↓
Codex calls SmartAIHub premium Skill
        ↓
Spec 280 meters Skill invocation
        ↓
SmartAIHub revenue allocation occurs
```

Conversely, if the user only uses Codex built-ins and no paid SmartAIHub capability, SmartAIHub MUST NOT invent a Skill charge.

---

# 39. Creator Economics as Product Retention

The intended perception is:

```text
I used SmartAIHub Skills to build faster
        ↓
I deployed my product
        ↓
other users use it
        ↓
I receive creator revenue
```

The product SHOULD make this loop visible without promising profitability.

SmartAIHub is an enabling platform, not an earnings guarantee.

---

# 40. Database / Projection Contracts

This Spec MAY introduce additive projections such as:

```text
capability_invocations
capability_usage_events
commercial_invocation_edges
revenue_policy_versions
settlement_allocations
creator_earnings_projection
tenant_earnings_projection
```

BUT:

- canonical credit balance remains with the existing billing authority until
  its migration is evidenced; the target economic ledger authority is SPEC-207;
- canonical settlement MUST use SPEC-207 financial primitives (and existing
  credit primitives for the compatible legacy rail);
- projections SHALL NOT mutate balances independently.

---

# 41. Settlement Allocation Record

SPEC-280 calculates and snapshots the commercial allocation. SPEC-207 (or the
existing Credits authority for that compatibility rail) posts the financial
entries and returns canonical ledger/settlement references. This record is a
commercial allocation contract/projection, not a separate balance ledger.

Illustrative:

```yaml
settlement_allocation:
  settlement_id: ...
  invocation_id: ...
  gross_charge: ...
  currency_or_credit_unit: ...

  cost_components:
    - kind: provider
      amount: ...
    - kind: infrastructure
      amount: ...

  distributable_net: ...

  allocations:
    - role: PLATFORM_OPERATOR
      beneficiary_account_id: ...
      amount: ...
    - role: TENANT_OPERATOR
      beneficiary_account_id: ...
      amount: ...
    - role: PRODUCT_CREATOR
      beneficiary_account_id: ...
      amount: ...
    - role: SKILL_CREATOR
      beneficiary_account_id: ...
      amount: ...

  revenue_policy_version: ...
  ledger_refs: [...]
```

---

# 42. Payer Policies

Payer MAY be:

```text
END_USER
TENANT
DEPLOYMENT_OWNER
SPONSOR_POOL
ORGANIZATION
CREATOR
```

Fallback/priority rules MAY exist.

An invocation SHALL record the actual payer source.

---

# 43. Sponsored Use

A tenant or creator MAY sponsor usage.

Example:

```text
first 20 runs free to user
tenant sponsor wallet pays
```

Revenue allocation MAY still occur according to the offering contract, but sponsor-funded self-dealing MUST be subject to anti-abuse controls.

---

# 44. Admin / Tenant Configuration

Platform Admin SHOULD configure:

- global minimum/maximum economic constraints;
- supported offering types;
- payout eligibility policy;
- platform share floors;
- dispute/refund policy;
- abuse controls.

Tenant Admin SHOULD configure within allowed boundaries:

- tenant default creator split;
- tenant share;
- sponsored usage;
- tenant marketplace visibility;
- creator onboarding;
- per-product policy overrides;
- white-label commercial defaults.

Creators SHOULD configure within allowed boundaries:

- price;
- commercial model;
- permitted tenants;
- promotion/free tier where allowed.

---

# 45. Permissions

Economic roles do not imply operational privileges.

A `TENANT_OPERATOR` beneficiary MUST NOT automatically gain:

- access to creator source;
- user data;
- secret values;
- execution shell;
- arbitrary refund powers.

Commerce permissions remain separate from application/runtime permissions.

---

# 46. Privacy

Settlement telemetry SHOULD use IDs/aggregates rather than user content.

Tenant revenue dashboards MUST NOT leak cross-user private prompts/files merely because the tenant receives a revenue share.

---

# 47. Feature Flags

Recommended:

```text
capability_commerce.enabled
capability_commerce.skill_metering
capability_commerce.skill_lease
capability_commerce.external_harness_metering
capability_commerce.mini_app_metering
capability_commerce.nested_invocations
capability_commerce.multi_tenant_revenue
capability_commerce.creator_earnings
capability_commerce.tenant_earnings
capability_commerce.sponsored_usage
capability_commerce.revenue_allocation_graph
```

---

# 48. Rollout

## Phase 0 — Observe only

- create invocation projections;
- no new charging path;
- verify correlation with existing billing.

## Phase 1 — SmartAIHub Skill invocation

- hosted Skills;
- explicit pay-per-invocation;
- user credit reservation;
- platform + Skill creator allocation.

## Phase 2 — Spec 224 recommended Skills

- bounded automated paid capability selection;
- cost modes;
- Task Control cost explanation.

## Phase 3 — Mini App usage

- public pay-per-use;
- creator earnings;
- deploy/publish flow.

## Phase 4 — Multi-tenant revenue

- tenant operator beneficiary;
- white-label offering context;
- platform + tenant + creator;
- cross-tenant distribution.

## Phase 5 — Nested commerce

- Mini App → paid Skill;
- Workflow → Agent service;
- N-party settlement.

---

# 49. Acceptance Criteria

1. A user can invoke a premium SmartAIHub Skill from Codex without receiving the proprietary Skill source.
2. The same invocation survives Worker/Runner restart without a duplicate charge.
3. Spec 224 can choose a paid Skill through Spec 256 without changing Spec 224's canonical lifecycle.
4. Built-in harness capability can be selected with zero SmartAIHub Skill fee.
5. Price estimate and actual settlement are separately recorded.
6. Gross charge, infra/provider cost and distributable net are distinct.
7. Direct platform Mini App can allocate platform + creator revenue.
8. White-label tenant Mini App can allocate platform + tenant operator + creator revenue.
9. Nested paid Skill can receive an additional creator allocation.
10. Revenue allocation supports N beneficiaries and versioned policies.
11. Same beneficiary holding multiple roles is accounted correctly without accidental duplicate role payment.
12. Historical settlements do not change when pricing/revenue policy changes.
13. Tenant share is bound to valid offering/deployment/channel context, not merely UI branding.
14. A tenant admin cannot access creator/user private data solely because they receive revenue.
15. Cross-tenant distribution can explicitly grant a consuming tenant channel share.
16. Recursive paid invocation loops are bounded.
17. Duplicate retry/recovery is idempotent.
18. Sponsored usage cannot bypass anti-abuse controls.
19. Creator earnings are distinct from user usage credit balance.
20. Existing canonical ledger remains the only balance authority.
21. Public monetization is optional; private apps remain valid.
22. Spec 261 remains canonical for package/offering/deployment declarations.
23. Spec 256 remains canonical semantic capability authority.
24. External harness BYO-subscription is preserved.
25. Task Control can explain paid SmartAIHub capability usage without implying the user paid SmartAIHub for the external LLM subscription.

---

# 50. Ten-Pass Gap Audit

| Pass | Domain | Hardening incorporated |
|---|---|---|
| 1 | BYO-LLM economics | Separated provider subscription from SmartAIHub capability fee |
| 2 | Skill IP | Server-authoritative hosted Skill + lease |
| 3 | Spec 224 alignment | Additive capability-commerce projection only |
| 4 | Retry/recovery | Invocation id survives Spec 278 session generations |
| 5 | Cost vs price | Explicit cost/price/revenue separation |
| 6 | Multi-tenant | First-class Tenant Operator share |
| 7 | Composition | N-party allocation / nested creator shares |
| 8 | Marketplace trust | Ranking independent from platform margin |
| 9 | Creator retention | Usage wallet separated from creator earnings |
| 10 | Abuse/ledger safety | Idempotent settlement, loop controls, canonical ledger preserved |

All ten controls are normative in this revision.

---

# 51. Final Economic Architecture

```text
User-owned LLM / Harness
        │
        ▼
Spec 279 ingress
        │
        ▼
Spec 224 / Spec 269 / Workflow
        │
        ▼
Spec 256 resolve capability
        │
        ├─ built-in/free → execute
        │
        └─ paid SmartAIHub capability
                    │
                    ▼
                 Spec 280
              Metered Invocation
                    │
                  reserve
                    │
                 execute
                    │
                 settle
                    │
        ┌───────────┼─────────────┬──────────────┐
        ▼           ▼             ▼              ▼
     Infra      SmartAIHub    Tenant Admin    Creator(s)
   recovery       Platform      /Operator
```

and the creator loop:

```text
rent capabilities
→ build with Spec 224
→ package with Spec 261
→ deploy
→ publish
→ users invoke
→ multi-party revenue
→ creator/tenant reinvest
```

**SmartAIHub's economic loop is not "pay us to use AI." It is "bring your AI, rent capabilities to build faster, then publish products/capabilities so you can participate in the same ecosystem economy."**

---

# 52. Revision 1.1 Addendum — Settlement Correctness, Tenant Attribution & Commercial Safety

Revision 1.1 closes commerce/runtime gaps discovered during a second cross-spec review with Specs 278 and 279.

**Revision 1.4 ownership clarification:** The commercial state, usage, and
billability portions below belong to SPEC-280. Payer authorization, financial
reservation, charge/debit, refund, ledger posting, settlement finality and
reconciliation belong to SPEC-207 (or the existing Credit authority while
that compatibility rail remains in use). Legacy illustrative wording below
is subordinate to this boundary and sections 54/55.

## 52.1 Immutable Commercial Contract Snapshot

Before a paid invocation is admitted, Spec 280 SHALL create or reference an immutable snapshot containing the commercial facts that govern that invocation.

Illustrative:

```yaml
commercial_contract_snapshot:
  snapshot_id: ...
  invocation_id: ...
  offering_id: ...
  capability_release_id: ...
  capability_release_digest: ...

  pricing:
    price_policy_id: ...
    price_policy_version: ...
    estimate_basis: ...
    unit_definition: ...

  allocation:
    revenue_policy_id: ...
    revenue_policy_version: ...
    tenant_attribution_path_ref: ...

  amount_ceiling:
    currency_or_credit_unit: ...
    maximum_amount: ...

  rights:
    entitlement_ref: ...
    license/output_rights_ref: ...

  created_at: ...
  integrity_digest: ...
```

Subsequent price/share changes SHALL NOT mutate this snapshot.

A retry/recovery of the same invocation reuses the same snapshot unless the original commercial invocation is explicitly replaced.

Payer, funding-source and reservation references are returned by SPEC-207 and
may be linked as opaque references. SPEC-280 MUST NOT choose the funding
source or record a spendable balance/reservation as its authority.

## 52.2 Commercial Invocation State Machine

Canonical commerce lifecycle SHOULD distinguish:

```text
PROPOSED
  ↓
ESTIMATED
  ↓
RESERVING
  ↓
RESERVED
  ↓
AUTHORIZED
  ↓
RUNNING
  ↓
USAGE_RECONCILING
  ↓
SETTLING
  ↓
SETTLED
```

Alternate terminal/exception states:

```text
REJECTED
CANCELLED
FAILED_NONBILLABLE
FAILED_PARTIAL_BILLABLE
REFUND_PENDING
REFUNDED
DISPUTED
REVERSED
MANUAL_RECONCILIATION
```

Execution state and commerce state SHALL remain separate.

## 52.3 Ledger Delivery Semantics

Spec 280 SHALL NOT promise distributed exactly-once settlement.

It SHALL use:

> **at-least-once event delivery + idempotent ledger operations + immutable transaction identities**

Every economic mutation SHALL have a stable idempotency/ledger operation key.

Repeated settlement requests MUST return/reconcile the existing canonical ledger transaction rather than create a second charge/allocation.

Projection tables are never balance authority.

## 52.4 Reserve → Execute → Reconcile → Settle Saga

A robust paid invocation SHALL follow:

```text
1. SPEC-280 calculates bounded commercial estimate and snapshot
2. SPEC-207 authorizes payer and reserves bounded exposure
3. SPEC-280 issues a bounded CommercialExecutionGrant if physical execution is required
4. canonical job authority executes
5. SPEC-280 receives and deduplicates UsageMeterReceipts
6. SPEC-280 classifies failure and calculates billable amount/allocation
7. SPEC-207 captures/posts the financial transaction and allocation snapshot
8. SPEC-207 releases unused reservation and returns canonical result
9. SPEC-280 updates commercial projections from that result
10. emit settlement receipt/reference
```

If step 9 succeeds but later projection/allocation UI update fails, the ledger transaction remains canonical and projections reconcile later.

## 52.5 Commercial Execution Grant

Spec 280 SHALL be able to issue a short-lived bounded commercial grant consumed by Spec 278 after SPEC-207 economic admission. The grant does not authorize a debit or replace the SPEC-207 reservation.

The grant MUST bind at least:

```text
commercial_binding_id
commercial_invocation_id
capability_release_digest
commercial_meter_epoch
worker_job/session scope where applicable
allowed_usage_classes
max_usage_envelope?
not_after
integrity proof
```

The grant:

- authorizes execution only inside its commercial envelope;
- does not reveal revenue split;
- does not contain creator payout information;
- does not replace normal job/approval authority;
- cannot be extended by the Runner.

## 52.6 Failure Attribution & Billability Matrix

Spec 280 SHALL maintain a versioned billability policy for outcome classes.

Minimum classes:

| Outcome origin | Default commercial treatment |
|---|---|
| Rejected before paid execution | non-billable / release reservation |
| SmartAIHub control-plane failure before material usage | normally non-billable |
| Runner/platform infrastructure failure | normally non-billable except explicitly consumed non-refundable provider cost |
| User-owned Harness auth failure | platform Skill fee normally not fully billable if value was not delivered; external user-provider cost is outside SmartAIHub |
| User-owned Harness quota failure | same principle; may be recoverable without a second Skill invocation |
| External provider failure | apply offering/provider cost policy; no fabricated successful charge |
| Capability/Skill logic failure | offering-specific; success-priced offerings are non-success |
| User cancellation before material use | release unused reservation |
| User cancellation after measured use | settle only declared consumed/billable portion |
| Successful verified result | normal settlement |
| Partial usable artifact | only if the offering declares partial-billable semantics |
| Duplicate retry/recovery | no duplicate commercial invocation |

The exact policy MAY vary by Offering but MUST be disclosed/versioned and applied consistently.

## 52.7 Usage Evidence Trust

Spec 280 SHALL consume metering evidence only from qualified sources.

Each meter source SHALL declare:

```text
source type
producer identity
driver/runtime trust level
meter schema/version
integrity mechanism
dedupe key
supported usage classes
```

Untrusted client-supplied numbers MUST NOT directly determine charges.

External provider usage data MAY be reconciled with provider receipts/API data where available.

## 52.8 Root Budget Envelope & Child Reservation Request

Nested paid calls SHALL declare bounded child exposure beneath a root budget
envelope. SPEC-280 owns the commercial parent/child relationship and requests
child amounts; SPEC-207 owns, reserves, fences and reconciles the financial
root budget. SPEC-280 MUST NOT maintain a competing spendable budget or
reservation balance.

Illustrative:

```text
root_budget = 100 credits

Mini App reserves       60
  ├─ Skill A reserves   15
  ├─ Agent B reserves   20
  └─ remaining child    25
```

A child reservation request MUST be accepted by SPEC-207 before effectful
child execution; SPEC-207 atomically reduces or encumbers available root
exposure.

Parallel children MUST NOT each observe the same unreserved balance.

Child release/settlement results from SPEC-207 SHALL reconcile back into the
root budget state held by SPEC-207. SPEC-280 retains commercial lineage and
projection references only.

## 52.9 Nested Settlement Ordering

Nested capability settlement SHOULD be represented as a commercial DAG, not arbitrary recursion.

Rules:

- every child has one root invocation;
- cycles are rejected before paid admission;
- child cost/earnings are reconciled before or as part of final root settlement;
- parent settlement MUST know whether child charges are included, pass-through or separately charged;
- child failure MUST NOT cause duplicate parent retries to create new child charges;
- compensation/reversal propagates according to versioned commercial policy.

## 52.10 Tenant Attribution Path

Tenant revenue SHALL use a versioned `TenantAttributionPath`, not UI appearance.

Example:

```yaml
tenant_attribution_path:
  attribution_id: ...
  source:
    deployment_tenant_id: ...
    listing_tenant_id: ...
    distribution_channel_tenant_id: ...
    sponsor_tenant_id: ...
  selected_beneficiaries:
    - role: TENANT_OPERATOR
      tenant_id: ...
      basis: WHITE_LABEL_DISTRIBUTOR
  rights_ref: ...
  policy_version: ...
  created_at: ...
```

The path MUST prove the tenant has an eligible commercial relationship.

A custom domain/theme alone is insufficient.

## 52.11 Multiple Tenant/Channel Roles

The system MAY support more than one distribution beneficiary, but SHALL avoid ambiguous duplicate `TENANT_OPERATOR` shares.

Recommended rule:

- one primary `TENANT_OPERATOR` allocation per commercial path by default;
- additional distributors/affiliates use distinct roles such as `AFFILIATE_OR_CHANNEL`;
- multiple tenant-operator layers require an explicit contract policy rather than accidental inheritance.

This preserves the user's requested tenant-admin incentive without allowing unlimited stacked tenant shares.

## 52.12 Tenant Lifecycle

Tenant suspension/termination SHALL NOT rewrite historical settlement.

For future invocations the platform SHALL re-evaluate:

- offering rights;
- tenant eligibility;
- payout eligibility;
- distribution/channel rights.

Pending earnings may remain held/reviewed according to normal platform policy.

## 52.13 Creator / Tenant Payout Eligibility

Creator earnings and tenant earnings are liabilities/projections, not automatically withdrawable cash.

A beneficiary MAY require:

```text
identity verification
payout account verification
jurisdiction/tax information where required
minimum payout threshold
fraud/risk clearance
refund/chargeback reserve
```

before funds become `available_for_payout`.

Spec 280 defines lifecycle hooks, not jurisdiction-specific tax advice.

## 52.14 Earnings State Machine

Beneficiary earnings SHOULD distinguish:

```text
ACCRUED_PENDING
HELD
AVAILABLE
PAYOUT_PENDING
PAID
REVERSED
FORFEITED_BY_POLICY
DISPUTED
```

A user-facing credit balance MUST NOT be presented as creator cash earnings.

## 52.15 Refund / Reversal / Chargeback

Settlement SHALL support negative economic events.

A reversal MUST reference the original immutable settlement.

Rules:

- do not delete/rewrite historical transaction rows;
- create reversal/adjustment entries;
- creator/tenant pending balances may be reduced;
- already-paid amounts enter receivable/offset/manual policy as appropriate;
- platform and nested capability allocations SHALL reconcile according to the original revenue policy version.

## 52.16 Credits vs Monetary Value

If SmartAIHub credits can be purchased in fiat and creator earnings can be paid in fiat, the system SHALL keep distinct:

```text
usage credit unit
purchase valuation
settlement accounting unit
creator earning unit
payout currency
FX/valuation snapshot where applicable
```

A credit's user-facing purchase value MUST NOT be assumed to equal creator payout value.

Rounding rules and residual allocation SHALL be deterministic.

## 52.17 Precision / Rounding / Residual

Revenue allocation SHALL define:

```text
precision
rounding mode
minimum allocatable unit
residual beneficiary
```

so that:

```text
sum(cost recovery + allocations + reserves/adjustments)
= canonical gross/settlement amount
```

within declared accounting precision.

No "lost fractions" may accumulate invisibly.

## 52.18 Output / IP Rights

Paying to invoke a Skill does not automatically transfer Skill IP.

Each Offering SHOULD reference rights such as:

```text
USE_SERVICE_ONLY
OUTPUT_COMMERCIAL_USE
OUTPUT_PRIVATE_USE
SOURCE_NOT_INCLUDED
SOURCE_LICENSED
DERIVATIVE_ALLOWED
SELF_HOST_LICENSED
```

For development Skills, the rights of generated source/artifacts SHALL be explicit enough that a user can know whether the resulting Web App/Mini App may be commercially published.

Proprietary internal prompts/workflows remain protected unless separately licensed.

## 52.19 Local Action Plan Confidentiality

A hosted Skill MAY need a local Runner to perform actions.

The service SHOULD send the minimum actionable plan rather than the complete proprietary reasoning/prompt/workflow.

Adapters SHALL avoid:

- writing hidden Skill prompts into the repo;
- persisting full Skill implementation in terminal logs;
- packaging proprietary Skill internals into the user's final app;
- exposing unrelated creator secrets through debugging output.

## 52.20 Auto-Selection Trust Gate

A newly published Skill MAY become discoverable quickly, but **automatic paid selection** by Spec 224 requires a trust/qualification state.

Candidate states SHOULD distinguish:

```text
DISCOVERABLE
VERIFIED_PUBLISHER
TECHNICALLY_QUALIFIED
AUTO_SELECT_ELIGIBLE
SUSPENDED
REVOKED
```

A Skill may be searchable before it is eligible for unattended paid invocation.

Untrusted/new Skills MAY require explicit user selection/approval.

## 52.21 Capability Quality Evidence

Auto-selection MAY consider:

- task relevance;
- compatibility;
- successful completion evidence;
- failure rate;
- verification quality;
- latency;
- cost/value;
- freshness;
- publisher trust;
- dispute/refund rate.

Raw revenue margin SHALL NOT be a quality signal.

A new Skill without history SHOULD have a cold-start policy rather than fabricated quality.

## 52.22 Public Mini App Commercial Safety

A public metered Mini App SHALL have:

```text
rate limits
per-user/tenant quota
root spend cap
abuse/fraud controls
deployment budget
provider cost ceiling where possible
commercial circuit breaker
```

A sudden bot/abuse spike MUST NOT create unlimited creator/platform provider liability.

## 52.23 BYO Provider Cost Attribution

For a user-owned Claude/Codex/Hermes subscription/API key:

```text
SmartAIHub Skill fee
        ≠
external provider subscription cost
```

If external provider cost is directly paid by the user outside SmartAIHub, it MUST NOT be represented as SmartAIHub-collected revenue.

If SmartAIHub incurs a provider cost, that cost MAY participate in cost recovery according to policy.

## 52.24 Fallback Cost Consent

If a BYO provider fails, switching to a SmartAIHub-funded provider MAY change the economics.

The fallback SHALL occur only when:

- the payer policy pre-authorizes it within budget; or
- an approval is obtained.

The fallback event SHALL update cost estimate/reforecast evidence.

## 52.25 Commercial Policy Governance

Changes to:

- platform share;
- tenant share;
- creator share;
- nested Skill share;
- offering price;
- payout policy

SHALL be versioned and auditable.

A policy change SHOULD declare:

```text
effective_at
affected new invocations
existing subscription/contract treatment
who approved
reason/reference
```

It MUST NOT retroactively mutate completed settlement.

## 52.26 Commercial Circuit Breakers

Platform/Admin SHALL have scoped emergency controls to:

```text
stop new paid invocation
stop one offering
stop one publisher
stop one tenant commercial path
stop one provider-cost path
hold settlement/payout
```

A circuit breaker SHOULD avoid unnecessarily killing already-safe non-commercial work.

## 52.27 Ten-Pass Cross-Spec Gap Audit — R1.1

| Pass | Domain | Gap found | R1.1 correction |
|---|---|---|---|
| 1 | Contract immutability | Price/share/release facts could drift during one invocation | Added immutable CommercialContractSnapshot |
| 2 | Settlement correctness | Generic reserve/settle flow lacked a strict state machine and ledger delivery semantics | Added commerce state machine + idempotent ledger saga |
| 3 | Disconnected execution | Runner revalidation lacked a locally verifiable bounded commercial grant | Added CommercialExecutionGrant contract shared with Spec 278 |
| 4 | Failure billing | Provider/platform/user-Harness failures were insufficiently distinguishable | Added Failure Attribution & Billability Matrix |
| 5 | Nested commerce | Parallel child invocations could race the same root budget | Added atomic child reservations + nested settlement DAG |
| 6 | Multi-tenant attribution | branded UI/domain could be confused with legitimate tenant revenue entitlement | Added TenantAttributionPath + role constraints |
| 7 | Earnings/payout | creator/tenant earnings lacked payout/reversal/chargeback lifecycle | Added eligibility and earnings state machine |
| 8 | Accounting precision | credits, fiat, rounding and residual rules were underspecified | Added valuation/precision/residual contracts |
| 9 | Skill trust/IP | fast marketplace discovery could auto-select unqualified Skills or leak implementation | Added auto-selection qualification + output/IP/confidentiality rules |
| 10 | Cost abuse/fallback | public usage spikes and BYO→paid-provider fallback could create uncontrolled spend | Added circuit breakers, caps and explicit fallback consent |

## 52.28 Additional Acceptance Criteria

26. Every paid invocation freezes an immutable commercial snapshot.
27. Repeated settlement delivery cannot double-charge or double-allocate.
28. Commercial execution grant is bounded and cannot be extended by Runner.
29. Failure attribution selects a versioned billability policy rather than a generic "failed" rule.
30. Parallel child invocations cannot over-reserve the same root budget.
31. Commercial invocation graph is acyclic before paid child admission.
32. Tenant share requires an eligible TenantAttributionPath, not branding alone.
33. Multiple distribution parties use explicit roles rather than accidental duplicate tenant shares.
34. Tenant termination does not rewrite historical settlement.
35. Creator/tenant payout availability is separate from accrued earnings.
36. Refund/reversal creates adjustment entries referencing original settlement.
37. Usage credits and creator payout value are not conflated.
38. Revenue allocation rounds deterministically with explicit residual handling.
39. Metered Skill invocation does not transfer proprietary Skill source by default.
40. Development Skill output/source rights are discoverable before commercial publication.
41. Unqualified newly published Skill cannot be auto-selected for unattended paid execution.
42. Public Mini App has bounded provider/platform spend.
43. BYO provider expense is not misrepresented as SmartAIHub revenue.
44. Paid provider fallback requires preauthorization or approval.
45. Emergency commercial circuit breakers can stop new spend without creating a second job authority.

# 54. Revision 1.3 Addendum — Provider-Neutral Agentic Commerce Boundary

This addendum assigns commercial semantics to Spec 280 and financial authority
to Spec 207. It does not authorize a production payment rollout.

## 54.1 Ownership and boundary

Spec 280 owns usage-meter definitions and receipts, price books and quote
calculation for metered services, billable-task/service decisions, commercial
contract snapshots, revenue-sharing policy and beneficiary/allocation
calculation. Spec 207 owns payer/funding-source selection, spending
authorization, task budget reservation, payment attempts, overdraft/credit
exposure, canonical ledger postings, capture/refund/reversal, settlement and
reconciliation. Spec 207 MUST post the immutable allocation supplied by Spec
280 without recomputing its pricing or revenue split. A Spec 280 projection or
dashboard MUST NOT become a balance or payment-finality authority.

Spec 206's `billing-budget/v1` may carry a negotiated task budget envelope and
payment capability metadata. It does not authorize/capture funds, implement a
payment protocol or own a financial ledger. A2A transport and payment protocol
are independently negotiated.

## 54.2 Provider-neutral payment interface

Every paid invocation MAY use prepaid SmartAIHub Credits, direct fiat
pay-as-you-go, an approved postpaid account, or a supported agentic payment
protocol. Credit top-up remains available and behaviorally compatible; it is
not a prerequisite for PAYG. Protocol names, PSPs, acquiring banks, wallet
vendors, currencies and settlement rails are adapter configuration and MUST
NOT be embedded in capability identity, price policy or revenue policy.

The integration contract is a versioned `CommercialPaymentRequest` and
`CommercialPaymentReceipt` exchanged with Spec 207. It carries stable
invocation/task identifiers, payer and tenant references derived by the server,
the immutable commercial snapshot and policy versions, maximum amount/currency,
funding mode, budget/reservation reference, usage receipt references,
idempotency scope, expiry and normalized outcome/finality. Credentials are
opaque server-side references and never enter a Skill, agent prompt, Runner,
worker payload or client-visible receipt.

Payment adapters are separated into: (a) payment-protocol adapters that
negotiate/verify an agent-to-service payment exchange; (b) fiat
funding/payment-provider adapters for card, bank or local payment methods; and
(c) settlement-rail adapters. They normalize quote, authorization/reservation,
capture, release, refund, status lookup and provider observations into Spec
207's versioned contract. Unsupported or unknown provider states fail closed
into reconciliation; the service does not assume protocol equivalence or
provider finality.

## 54.3 Task reservation, usage settlement and controlled overdraft

Before effectful execution, Spec 280 supplies the immutable price version and
bounded maximum exposure for the task. Spec 207 atomically reserves that amount
against the applicable payer, task, tenant and period caps before execution is
admitted. Concurrent reservations use a tenant/payer-scoped serializable
transaction or compare-and-swap/version fence so their combined exposure
cannot exceed the authorized balance/limit. Reusing an idempotency key with a
different immutable request hash is rejected.

Usage is reported as append-only, deduplicated meter receipts with unit,
quantity, source job/attempt, sequence, event time and evidence reference.
Settlement uses the price snapshot captured at admission, charges only
contractually billable usage, releases unused reserve and posts corrections as
new adjustments. It MUST NOT rewrite prior usage or settlement facts.

At a task checkpoint, the existing durable job authority records the
checkpoint and Spec 207 reconciles usage/reserve. Resume reuses the same
invocation, commercial snapshot and idempotency scope; before further effects,
the system obtains any required incremental reserve. If reserve cannot be
extended, the job pauses at a safe checkpoint or terminates under its existing
job policy. It MUST NOT replay completed billable effects or silently exceed
the cap.

Controlled overdraft is an explicitly approved, bounded postpaid facility, not
an implicit negative balance. Its default is disabled and limit zero. The
authority records payer/tenant, currency, limit, effective period, expiry,
eligible capabilities, per-task cap, aggregate outstanding exposure, risk
hold and approval/audit reference. Available exposure subtracts unpaid
receivables, active reservations and risk holds under concurrency control.
Admission fails closed when any limit is reached or the facility is expired,
suspended or disputed. Spec 207's postpaid account/receivable rules remain
authoritative; Spec 280 only supplies commercial amount and eligible usage.

## 54.4 Failure, refund and reconciliation behavior

A provider timeout after possible authorization or capture produces an unknown
outcome. The system queries/reconciles the original provider reference and MUST
NOT retry the charge through another provider/route until failure is
established. Safe retries reuse the same idempotency key and request hash. Only
confirmed unused authorization is released. Refunds are new idempotent
operations linked to the original settlement; partial refunds reverse the
corresponding allocation under the captured policy version. Disputes and
chargebacks remain distinct from refunds. Webhook, polling and statement
observations are deduplicated before financial posting.

## 54.5 Compatibility, migration and compliance constraints

The existing Credit Wallet and top-up/payment methods remain an enabled
compatibility rail. PAYG is additive and cannot change historical credit
transaction meaning or balances. Implementation MUST first map existing
credit reservations, invoices/payment attempts, provider references, usage
records and job settlement references to the versioned contract; it MUST NOT
pretend the current credit transaction table is a complete double-entry
ledger. Schema work requires an additive migration, explicit backfill and
reconciliation plan, dual-read/shadow validation, bounded canary and rollback
that leaves existing Credits usable. This documentation revision authorizes no
schema or data migration.

Provider onboarding MUST determine applicable licensing, consumer disclosure,
KYC/AML/sanctions, tax, privacy/data residency, chargeback, PCI scope and
record-retention requirements for each jurisdiction and payment method. Use
tokenized/opaque provider references; never store raw card credentials, private
keys or wallet seeds in SmartAIHub application records. Unknown legal or
provider obligations block activation of that route, not the existing Credits
rail.

## 54.6 Acceptance criteria

1. A paid task can select Credits, eligible fiat PAYG or an explicitly
   supported agentic protocol through the same versioned Spec 207 boundary.
2. PAYG works without preloading SmartAIHub Credits; the existing top-up path
   remains selectable and unchanged for existing accounts.
3. Concurrent tasks cannot reserve beyond balance, per-task cap, tenant cap,
   period cap or approved overdraft limit.
4. Price, revenue allocation, payer authorization and ledger posting each have
   one explicit owner and immutable version/reference.
5. Duplicate meter receipts, settlement requests, webhooks and retries create
   no duplicate usage charge, allocation or refund.
6. Unknown provider outcomes are reconciled before another provider is tried;
   checkpoint resume reuses the same invocation without duplicate billable
   effects.
7. Partial failure charges only the captured policy's billable usage and
   releases unused reserve; refunds/chargebacks remain separately auditable.
8. Spec 224 consumes only an optional typed economic interface; no lifecycle,
   Live Acceptance, Runner, verification or scheduling requirement is added to
   Spec 224.
9. Migration and compliance gates above are evidenced before route activation.
   Documentation-only changes do not enable live payment.

---

# 53. Revised Cross-Spec Economic Boundary

```text
279
  principal / ingress / delegation / inherited budget
        ↓
224 / 269 / canonical runtime
        ↓
256 semantic capability resolution
        ↓
280
  immutable commercial snapshot
  billability and allocation policy
  usage receipts
        ↓
207
  quote / authorize
  global + task reservation
  provider-neutral payment attempts
        ↓
worker_jobs
        ↓
278
  durable execution
  usage/failure evidence
        ↓
280
  dedupe
  billability policy
  final billable amount + allocation snapshot
  revenue allocation
        ↓
207 canonical ledger and settlement/reconciliation
        ↓
creator / tenant / platform projections & payout lifecycle
```

The commercial runtime SHALL make SmartAIHub monetizable without forcing users to buy their LLM from SmartAIHub and without weakening the existing orchestration/job authority boundaries.

# 55. Revision 1.4 Addendum — Contract Conformance and Operational Acceptance

This section makes Revision 1.3's payment boundary directly implementable.
SPEC-207 section 202 defines the financial state machine and contract
authority; this section defines the SPEC-280 producer obligations. The typed
contract is shared and versioned, not implemented as duplicate SPEC-local
payment models.

## 55.1 Commercial snapshot producer contract

Before a paid task is admitted, SPEC-280 MUST resolve the active capability
release, pricing version, billability rules, revenue policy version and
beneficiary bindings, then create an immutable snapshot containing:

- stable invocation, task, capability and release references;
- meter/pricing facts, amount ceiling and currency;
- pricing and revenue policy version identifiers and effective time;
- complete beneficiary allocation rows, rounding method and residual owner;
- tenant/channel/asset/creator attribution references where applicable;
- digest over canonical serialization and creation timestamp.

Every allocation row MUST use integer minor units for fiat amounts. Allocation
rows plus platform amount MUST equal the authorized maximum or define a
versioned deterministic rule for usage-dependent allocation whose total is
checked at settlement. Missing beneficiary identity, currency mismatch,
non-finite price, invalid policy version or an allocation that exceeds the
snapshot ceiling blocks paid admission. SPEC-280 MUST NOT select payment
providers, authorize spending, reserve a balance or claim payment finality.

## 55.2 Usage receipt and billability contract

Each usage receipt MUST bind to the invocation, task, worker job/attempt,
capability release, meter version and current fencing generation. It records a
unique receipt ID, idempotency scope, sequence, quantity/unit, event time,
trusted evidence reference and producer identity. Client-provided quantity or
price is untrusted until validated against server-side execution evidence.

SPEC-280 determines `BILLABLE`, `NON_BILLABLE`, `PARTIALLY_BILLABLE` or
`PENDING_EVIDENCE` under the snapshot's policy. The decision records reason
code, evidence digest, accepted receipt IDs and the exact price version. A
duplicate receipt with the same identity and digest returns the original
decision; conflicting content is rejected and audited. Receipts are append-only
and late evidence creates a new adjustment candidate. A SPEC-280 decision is
not a debit or settlement; SPEC-207 must authorize and post the resulting
financial effect.

## 55.3 PAYG, Credits and payment interoperability

The payer may select the existing prepaid Credits rail or eligible fiat PAYG
without preloading Credits. Agentic protocol options (including x402 or MPP)
are capabilities negotiated by provider-neutral SPEC-207 adapters and are not
hard-coded into capability IDs, pricing, revenue policy or this commercial
snapshot. No live provider integration or real-money mode is required for this
contract to be implemented or mock-tested. Provider/rail availability does
not change whether a task's usage is billable.

SPEC-280 MUST pass the same snapshot and accepted usage receipts to SPEC-207
regardless of funding mode. It MUST NOT change historical Credits
transactions, combine creator earnings with spendable usage balance, or
reinterpret an external harness/provider's own subscription expense as
SmartAIHub revenue.

## 55.4 Failure, resume and settlement handoff

At each durable task checkpoint, SPEC-280 emits all accepted receipts and the
current billability watermark to the financial contract. On resume it reuses
the same invocation and commercial snapshot; it may append receipts for new
work but MUST NOT issue a new commercial invocation solely because the worker
process/session restarted. It MUST honor SPEC-207's reservation result before
allowing further paid effects. A denied incremental reserve pauses or terminates
according to the durable job policy.

After the task reaches a settlement boundary, SPEC-280 sends the accepted
receipt set, billable amount, allocation snapshot and policy versions exactly
once by idempotent operation. SPEC-207 returns the canonical settlement ID and
ledger reference or a reconciliation-required result. SPEC-280 projections
may display pending/settled/refunded state from those references but MUST NOT
infer finality from a callback, task success, queued outbox event or local
projection.

## 55.5 Conformance and acceptance matrix

The implementation is accepted only when the following producer-to-finance
flow is proven with deterministic mock adapters and the SPEC-207 ledger
invariants:

| Case | Required observable result |
| --- | --- |
| Credits payer | Existing compatible debit/refund semantics remain intact; same typed request/receipt lineage is preserved. |
| PAYG payer with zero Credits | Task is admitted only after SPEC-207 authorizes and reserves the external exposure; no top-up is required. |
| Parallel paid tasks | SPEC-207 global/task caps bound combined reservations; SPEC-280 creates no shadow budget. |
| Duplicate/conflicting usage receipt | Identical retry is idempotent; identity collision with changed content is rejected and audited. |
| Partial/non-billable failure | Only policy-approved usage is passed for settlement; unused reservation is released by SPEC-207. |
| Checkpoint and resume | Same invocation/snapshot; completed billable effects are not replayed; incremental reserve is required before more paid work. |
| Unknown payment result | SPEC-280 shows pending/reconciliation state; it does not trigger provider failover or claim settlement. |
| Refund/reversal | SPEC-207 returns a new adjustment linked to original settlement/allocation version; SPEC-280 updates projections from canonical references. |
| Multi-party allocation | Snapshot totals and residual rounding are deterministic; ledger allocation equals captured amount. |
| Tenant isolation | Cross-tenant snapshot/receipt/settlement lookup is denied and audited. |

Database acceptance requires additive migration evidence, legacy Credits and
payment record preservation, rollback proof, unique/idempotency constraints,
transaction/concurrency proof and process-restart recovery against disposable
PostgreSQL. End-to-end mock acceptance must assert balanced ledger entries and
reservation reconciliation. Unit tests alone are insufficient. Sandbox
evidence records the exact source SHA and must keep real provider credentials,
live charging and production routes disabled.

## 55.6 SPEC-224 interface boundary

SPEC-224 may consume an optional versioned economic admission interface that
returns an opaque invocation reference, admission decision, bounded budget
reference and stable reason code. It does not receive provider credentials or
payment protocol details and does not own reservation, charge, settlement or
ledger state. No SPEC-224 scope, acceptance, lifecycle, verification, Live
Acceptance or schedule change is introduced by this addendum.

## R1.2 Additive asset, party, infrastructure-cost, and referral boundary — 2026-10-07

SPEC-303 owns stable Asset identity, ownership and commercial-right bindings, transfer history, and channel distribution context. SPEC-280 remains the capability-usage, pricing, and revenue-attribution policy authority; it MUST consume asset/economic-party bindings rather than create a competing asset registry or settlement ledger. Settlement and wallet execution remain in SPEC-207, charge/debit/refund remains with existing `credit_transactions`/`creditService`, and charged-work lineage remains in SPEC-166.

Revenue policy distinguishes `INFRA_VARIABLE_COST`, `INFRA_FIXED_COST_ALLOCATION`, `INFRA_COST_RECOVERY`, `INFRA_OPERATOR_MARGIN`, `INFRA_SUBSIDY`, and `PLATFORM_REVENUE`. Metered actual CPU/GPU, memory, storage, egress, queues/workflows, database, vector, and provider use is cost evidence; infrastructure cost MUST NOT be represented as a fixed transaction percentage. A planned deficit requires an explicit authorized subsidy source (`PLATFORM_GROWTH`, `TENANT`, `SPONSOR`, or `CAPITAL`) and MUST NOT silently reduce creator/App/Skill allocation. Referral is one-time by default on `FIRST_QUALIFYING_REVENUE_EVENT`; no downstream perpetual/MLM or review/rating reward is allowed. Referral acquisition cost normally uses a Platform/Tenant acquisition budget, not infra recovery. Effective-time policy snapshots and linked reversals preserve allocations after transfer/refund.

# Revision 1.5 — Cloudflare and Database Provider Usage Attribution (2026-10-22)

SPEC-280 owns the semantic definition, billability decision, rate-card
snapshot, creator/service allocation and usage evidence for Mini App compute
and database consumption. Provider resource ownership and deployment
placement remain in SPEC-219/273/288; credit reservation, economic policy,
ledger and settlement remain in SPEC-207. This amendment MUST NOT introduce a
second wallet, cost ledger, provisioner or resource owner registry.

Usage sources MAY include Cloudflare WfP request/CPU/script metrics, D1 rows
read/written and storage, provider database usage/invoice evidence, and
Queue/Workflow/Container/R2/KV/Vectorize usage where the existing commercial
contract declares it billable. Every observation MUST carry provider,
account/resource, App/deployment, tenant, metric/unit, source identity,
observation time, source watermark, confidence/finality, price snapshot,
provider bill-payer and customer-credit-payer references. Duplicate
observations are idempotent by source identity and content digest; corrected
or late provider reports produce linked adjustment evidence.

When the customer directly pays the provider, provider usage MUST be marked
non-chargeable as SmartAIHub provider pass-through. The customer may still be
charged an independently contracted SmartAIHub service, Skill, AI or managed
service rate. When SmartAIHub pays the provider, usage evidence MUST be
reconcilable to SPEC-207 reservation and final settlement, but delayed
provider reporting means SPEC-280 MUST NOT claim guaranteed zero loss or exact
real-time final cost. A gateway is required when a customer-owned runtime
could otherwise bypass metering for a platform-paid database.

Acceptance MUST cover both billing owners, no-double-billing, missing/stale
usage watermarks, duplicate and corrected usage, invoice variance, provider
API failure, price snapshot changes, tenant isolation and a metering bypass
attempt. Unavailable provider measurement remains UNKNOWN and blocks any
claim of exact billability; it does not authorize fabricated usage.
