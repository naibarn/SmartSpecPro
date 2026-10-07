# SPEC-299 --- SmartAIHub Unified Analytics & Business Intelligence Fabric

**Status:** Proposed / Additive / Implementation-Ready\
**Version:** R1.1-10PASS\
**Date:** 2026-10-06\
**Canonical intent:** Provide a provider-neutral, agent-native analytics
and business-intelligence capability for SmartAIHub without replacing or
mutating existing authorities.

**QA:** 10-pass architecture/product/security/operations review completed; identified gaps are incorporated in this revision.

------------------------------------------------------------------------

## 1. Executive Summary

SPEC-299 defines the **Unified Analytics & Business Intelligence Fabric
(UABIF)** for SmartAIHub.

The platform shall turn governed data and evidence into reusable
business semantics, metrics, KPIs, analytical queries, reports,
visualizations, dashboards, alerts, explanations, and machine-consumable
analytical results.

SPEC-299 is **not** a Superset clone and does **not** require Apache
Superset. SmartAIHub Native Analytics is the default execution path.
Apache Superset, Cube, dbt Semantic Layer, Metabase, Power BI, Looker,
or future systems may be integrated through provider adapters when
useful.

The key architectural progression is:

`SPEC-266 Data/Evidence → SPEC-299 Analytics/BI → SPEC-265 Decision Intelligence → Agent/Workflow Action → Verification/Task Control`

SPEC-266 is treated as an implemented upstream authority. SPEC-299 must
consume its existing contracts through additive adapters and must not
redefine SPEC-266 semantics.

------------------------------------------------------------------------

## 2. Problem Statement

SmartAIHub already has or plans capabilities for data/evidence,
generated UI, portable applications, decision intelligence, assistants,
design artifacts, workflows, and task control. What is missing is a
shared analytical layer that answers:

-   What is a business metric and how is it calculated?
-   Which metric definition is canonical?
-   Which dimensions and filters are permitted?
-   How can agents query analytics without generating arbitrary SQL?
-   How can Mini Apps, dashboards, reports, alerts, and agents consume
    the same KPI definition?
-   How are tenant scope, authorization, provenance, freshness, and PII
    rules preserved through analytical computation?
-   How can analytical output become evidence for a decision or an
    action without creating a second workflow/finality system?
-   How can external BI systems be attached without making them
    mandatory runtime dependencies?

Without this layer, metrics risk being reimplemented independently in
dashboards, agents, Mini Apps, SQL queries, and decision applications.

------------------------------------------------------------------------

## 3. Goals

SPEC-299 SHALL provide:

1.  Canonical semantic metrics and KPIs.
2.  Governed dimensions, measures, calculated fields, and analytical
    datasets/views.
3.  A provider-neutral Semantic Query Contract.
4.  Safe query planning and governed execution.
5.  Headless analytics for Agent, MCP, API, Mini App, scheduled and
    background consumers.
6.  Native visualization-data contracts.
7.  Dashboard and report definitions that remain portable and
    provider-neutral where practical.
8.  Analytical alerts and anomaly signals.
9.  Provenance, freshness, confidence, policy and permission metadata.
10. Tenant-safe analytics.
11. Natural-language-to-semantic-query integration.
12. Analytical result handoff to Decision Intelligence.
13. Optional adapters for full BI platforms.
14. Export and portability contracts.
15. Observability, cost controls and evidence receipts.
16. Correct analytical grain, additivity, join-cardinality and fan-out semantics.
17. Timezone, calendar, currency, unit and localization semantics.
18. Self-service BI exploration without bypassing governance.
19. Targets/goals, variance, cohort, funnel, retention and period-comparison analytics.
20. Reproducible snapshots and point-in-time analytical results.
21. Semantic lineage, data-quality status and impact analysis.
22. Governed content sharing, subscriptions, annotations and certification.
23. Environment promotion and semantic-definition CI/CD.

------------------------------------------------------------------------

## 4. Non-Goals

SPEC-299 SHALL NOT:

-   replace SPEC-266 data/evidence authority;
-   create a new canonical source registry;
-   create a second job/finality ledger;
-   create a second approval system;
-   create a second billing/credit authority;
-   replace SPEC-224 orchestration authority;
-   replace SPEC-240 generated-UI authority;
-   replace SPEC-261 package/portability authority;
-   replace SPEC-265 Decision Intelligence;
-   replace SPEC-269 assistant/work-context authority;
-   replace SPEC-270 design artifact authority;
-   replace SPEC-277 Task Control/finality projection;
-   require Apache Superset;
-   implement a full SQL IDE as a core requirement;
-   recreate hundreds of BI-specific chart editors;
-   allow LLM-generated SQL to bypass authorization or semantic
    governance.

------------------------------------------------------------------------

## 5. Authority Boundaries

  -----------------------------------------------------------------------
  Concern                             Authority
  ----------------------------------- -----------------------------------
  Source/evidence/data fabric         SPEC-266

  Analytics semantics, KPI, semantic  SPEC-299
  query

  Generated interactive UI            SPEC-240

  Portable package/application        SPEC-261
  contract

  Decision analysis / recommendation  SPEC-265

  Assistant/work context/handoff      SPEC-269

  Design artifact/catalog/runtime     SPEC-270

  Task/progress/evidence presentation SPEC-277

  Durable job execution/finality      Existing `worker_jobs` /
                                      orchestration authority

  Approval                            Existing platform approval
                                      authority

  Billing/credits                     Existing economic authority
  -----------------------------------------------------------------------

No SPEC-299 component may silently become authoritative for a concern
owned elsewhere.

------------------------------------------------------------------------

## 6. Core Architecture

``` text
Governed Data / Evidence (SPEC-266)
               |
               v
+---------------------------------------+
| SPEC-299 Unified Analytics & BI Fabric|
|---------------------------------------|
| Semantic Catalog                      |
| Metric / KPI Registry                 |
| Dimension / Measure Registry          |
| Analytical Dataset / View Contract    |
| Semantic Query API                    |
| Query Planner & Policy Gate           |
| Native Analytics Runtime              |
| Result / Evidence Contract            |
| Visualization Data Contract           |
| Dashboard / Report Definitions        |
| Alert / Anomaly Contract              |
| Provider Adapter Layer                |
+---------------------------------------+
      |          |          |
      v          v          v
 Generated UI  Agent/MCP   Mini Apps
 SPEC-240                  SPEC-261
      \          |          /
       \         v         /
        +---- SPEC-265 ----+
          Decision Intelligence
                 |
                 v
          Action / Workflow
                 |
                 v
          Verification / 277
```

------------------------------------------------------------------------

## 7. Semantic Catalog

The Semantic Catalog SHALL register analytical concepts independently of
physical database schemas.

Minimum entities:

-   `AnalyticalDataset`
-   `Metric`
-   `KPI`
-   `Measure`
-   `Dimension`
-   `Hierarchy`
-   `CalculatedField`
-   `TimeGrain`
-   `FilterPolicy`
-   `SemanticRelationship`
-   `MetricVersion`
-   `Certification`
-   `Owner`
-   `DataClassification`

Example:

``` yaml
metric:
  id: commerce.revenue
  version: 3
  displayName: Revenue
  expression:
    type: aggregate
    operation: sum
    field: order_total
  dataset: commerce.orders
  allowedDimensions:
    - date
    - province
    - product
    - tenant
  governance:
    tenantScoped: true
    pii: false
  certification:
    status: certified
  provenance:
    owner: commerce
```

A metric ID plus version SHALL resolve deterministically to its
definition.

------------------------------------------------------------------------

## 8. Metric and KPI Lifecycle

Lifecycle:

`draft → validated → certified → active → deprecated → retired`

Requirements:

-   immutable version identity after certification;
-   explicit owner;
-   backward-compatible alias policy;
-   dependency graph for derived metrics;
-   cycle detection;
-   validation against upstream datasets;
-   deprecation notice;
-   impact analysis before incompatible changes;
-   no silent metric redefinition;
-   historical reports retain the metric version used at execution time.

------------------------------------------------------------------------

## 9. Semantic Query Contract

Consumers SHALL prefer semantic queries over arbitrary SQL.

Example:

``` json
{
  "dataset": "commerce.orders",
  "metrics": ["commerce.revenue", "commerce.order_count"],
  "dimensions": ["province"],
  "timeRange": {"preset": "last_30_days"},
  "filters": [{"field": "status", "op": "eq", "value": "completed"}],
  "orderBy": [{"field": "commerce.revenue", "direction": "desc"}],
  "limit": 20
}
```

The query contract SHALL support:

-   metrics;
-   dimensions;
-   filters;
-   time range;
-   time grain;
-   grouping;
-   sorting;
-   top/bottom N;
-   comparison periods;
-   percent change;
-   window calculations where governed;
-   pagination;
-   bounded drill-down;
-   provenance request;
-   freshness requirement;
-   confidence/evidence requirement;
-   result-size and cost constraints;
-   explicit analytical grain;
-   null/unknown handling;
-   currency/unit normalization policy;
-   timezone/calendar context;
-   target/budget/benchmark comparison;
-   cohort, funnel and retention primitives where declared;
-   point-in-time/as-of execution when supported by the upstream source;
-   deterministic semantic-query canonicalization.

------------------------------------------------------------------------

## 10. Query Planning and Execution

Pipeline:

`Request → Identity/Authority → Semantic Resolution → Policy → Cost Guard → Plan → Execute → Validate → Receipt`

The planner SHALL:

-   resolve semantic IDs;
-   verify tenant and user authority;
-   enforce row/column/data-classification policies;
-   select an allowed execution provider;
-   push down filters where safe;
-   enforce bounded execution;
-   reject unsupported or ambiguous semantics;
-   record metric versions;
-   record source/evidence references;
-   produce a normalized analytical receipt.

LLMs SHALL NOT directly bypass this pipeline.

------------------------------------------------------------------------

## 11. Native Analytics Runtime

SmartAIHub SHALL have a minimal native runtime sufficient for core
analytics without external BI software.

Minimum capability:

-   aggregation;
-   grouping;
-   filtering;
-   time bucketing;
-   comparison periods;
-   ranking;
-   basic window operations;
-   calculated governed metrics;
-   bounded joins through declared semantic relationships;
-   result shaping;
-   cache-aware execution;
-   export to structured formats;
-   pivot/crosstab result shaping;
-   subtotal/grand-total semantics;
-   safe drill-down and drill-through;
-   target/actual/variance calculations;
-   cohort, funnel and retention calculations;
-   distinct-count and semi-additive metric handling;
-   timezone/calendar-aware aggregation;
-   unit/currency conversion only through governed conversion definitions.

Advanced capabilities may be delegated to provider adapters.

------------------------------------------------------------------------

## 12. Natural-Language Analytics

Agents may transform user intent into semantic queries.

Example:

> "จังหวัดไหนยอดขายลดลงมากที่สุดเทียบกับ 30 วันก่อน?"

Flow:

`NL intent → metric/dimension discovery → semantic query proposal → policy validation → execution → explanation`

Requirements:

-   ambiguity must be surfaced or safely resolved using certified
    defaults;
-   generated SQL is never the authorization boundary;
-   metric definitions must be shown/recoverable when material;
-   explanations must distinguish measured facts from model inference;
-   source freshness and analytical time window must be available to the
    consumer.

------------------------------------------------------------------------

## 13. Visualization Data Contract

SPEC-299 owns the analytical result contract, not generated-UI rendering
authority.

Normalized result may contain:

-   schema;
-   rows/series;
-   metric metadata;
-   units;
-   formatting hints;
-   dimensional roles;
-   recommended visualization classes;
-   confidence;
-   provenance;
-   freshness;
-   warnings;
-   drill capabilities.

SPEC-240/270 or native UI consumers decide how the result is rendered.

------------------------------------------------------------------------

## 14. Dashboards

SPEC-299 SHALL support provider-neutral dashboard definitions sufficient
for SmartAIHub native experiences.

A dashboard may define:

-   semantic widgets;
-   KPI cards;
-   chart references;
-   tables;
-   filters;
-   cross-filter relationships;
-   time controls;
-   drill actions;
-   refresh policy;
-   tenant/user visibility;
-   alert bindings;
-   explanatory AI surface;
-   action entry points.

Dashboard definitions SHALL reference semantic IDs rather than
hard-coded database SQL wherever possible.

------------------------------------------------------------------------

## 15. Reports

Reports SHALL support:

-   interactive reports;
-   snapshot reports;
-   scheduled reports;
-   parameterized reports;
-   exportable reports;
-   machine-readable report results.

Delivery itself SHALL reuse existing notification/channel infrastructure
rather than invent a new messaging system.

A report snapshot SHALL record metric versions, query parameters, time
range, source freshness and execution receipt.

------------------------------------------------------------------------

## 16. Alerts, Monitoring and Anomaly Signals

SPEC-299 SHALL define analytical conditions such as:

-   threshold crossing;
-   percentage change;
-   missing/stale data;
-   anomaly score;
-   trend break;
-   target deviation.

Alert evaluation SHALL use durable scheduling/job infrastructure owned
elsewhere.

An alert signal may trigger:

-   notification;
-   assistant follow-up;
-   Decision Intelligence analysis;
-   approval request;
-   governed workflow.

SPEC-299 does not own action finality.

------------------------------------------------------------------------

## 17. Analytics → Decision → Action

Analytical output SHALL be consumable by SPEC-265 as governed evidence.

Example:

`Revenue ↓18% → anomaly → supporting metrics → evidence → decision analysis → recommendation → approval → workflow → verification`

An analytics result alone SHALL NOT be treated as an authorized action.

------------------------------------------------------------------------

## 18. Headless / Agent-Native BI

Every material analytical capability SHALL be available without
requiring a human UI.

Supported entry surfaces SHOULD include:

-   internal API;
-   MCP;
-   agent capability/tool contract;
-   Mini App API;
-   workflow invocation;
-   scheduled/background invocation.

Example capabilities:

-   `analytics.metric.describe`
-   `analytics.metric.query`
-   `analytics.dataset.describe`
-   `analytics.dashboard.get`
-   `analytics.report.run`
-   `analytics.alert.evaluate`
-   `analytics.explain`
-   `analytics.export`

Capability exposure SHALL use the existing capability/permission
architecture rather than an independent tool registry.

------------------------------------------------------------------------

## 19. Mini App Integration

Mini Apps SHALL be able to consume SPEC-299 without owning their own
analytics engine.

Modes:

1.  Native semantic query.
2.  Embedded native SmartAIHub analytics component.
3.  Packaged analytical definition through SPEC-261.
4.  External provider-backed visualization where policy permits.
5.  Portable fallback when deployed outside SmartAIHub.

A Mini App package SHALL declare required analytics capabilities and
semantic dependencies.

------------------------------------------------------------------------

## 20. Multi-Tenant Requirements

All analytical execution SHALL carry effective tenant context.

Requirements:

-   tenant isolation;
-   permission ceiling propagation;
-   row-level enforcement;
-   column/data-classification enforcement;
-   no cross-tenant cache leakage;
-   tenant-aware metric overrides only when explicitly supported;
-   audit of actor, tenant, metric versions and query;
-   provider credentials scoped by tenant/deployment policy.

Tenant administrators may configure allowed analytical capabilities but
cannot exceed platform policy ceilings.

------------------------------------------------------------------------

## 21. Governance and Security

Required controls:

-   RBAC/ABAC integration;
-   permission ceiling propagation;
-   RLS-equivalent enforcement where applicable;
-   PII classification;
-   secret isolation;
-   safe query limits;
-   timeout;
-   row/byte/cardinality limits;
-   export policy;
-   audit trail;
-   provenance;
-   source freshness;
-   injection-resistant query construction;
-   denial of raw database access unless separately authorized.

No client-provided tenant ID is sufficient authorization by itself.

------------------------------------------------------------------------

## 22. Provenance and Analytical Evidence Receipt

Every material execution SHOULD produce a normalized receipt containing:

-   query ID;
-   actor/agent identity;
-   tenant;
-   semantic query digest;
-   metric IDs and versions;
-   dataset IDs/versions where available;
-   source/evidence references;
-   policy decision;
-   execution provider;
-   execution timestamps;
-   freshness;
-   row count;
-   result digest;
-   warnings;
-   cost/usage metadata;
-   trace/correlation ID.

This receipt can be projected into SPEC-277 but SPEC-277 remains
non-authoritative for finality.

------------------------------------------------------------------------

## 23. Provider Adapter Architecture

External BI/semantic systems are optional.

``` text
SPEC-299 Provider Interface
  ├─ Native SmartAIHub
  ├─ Apache Superset (optional)
  ├─ Cube (optional)
  ├─ dbt Semantic Layer (optional)
  ├─ Metabase (optional)
  ├─ Power BI (optional)
  ├─ Looker (optional)
  └─ future providers
```

Provider interface SHOULD cover:

-   capability discovery;
-   semantic model discovery where permitted;
-   query execution;
-   dashboard/report references;
-   embedding;
-   export;
-   health;
-   limits;
-   auth mode;
-   tenant scope.

Provider-specific features must not leak into the canonical contract
unless promoted through an explicit extension.

------------------------------------------------------------------------

## 24. Apache Superset Adapter

Superset is OPTIONAL.

Possible adapter functions:

-   discover permitted datasets;
-   map certified metrics where semantics are compatible;
-   execute governed queries;
-   reference or embed approved dashboards;
-   obtain guest/embedded access through server-side policy;
-   synchronize selected metadata;
-   expose provider health.

Prohibited:

-   making Superset the canonical SmartAIHub metric registry;
-   making Superset authentication the platform authorization source;
-   bypassing SmartAIHub tenant policy;
-   requiring Superset for core analytics;
-   treating embedded dashboard access as proof of action authority.

------------------------------------------------------------------------

## 25. Caching and Freshness

Cache keys SHALL include all security-relevant and semantic dimensions
required to prevent leakage, including tenant and policy context where
applicable.

Cache metadata SHALL include:

-   metric versions;
-   semantic query digest;
-   upstream freshness;
-   provider;
-   expiration;
-   tenant/policy scope.

Stale-while-revalidate may be used only when the consumer is informed of
freshness and policy permits it.

------------------------------------------------------------------------

## 26. Cost and Resource Governance

Analytics can create expensive queries. SPEC-299 SHALL support:

-   query complexity estimation;
-   provider cost hints;
-   maximum scanned data;
-   result cardinality bounds;
-   timeouts;
-   concurrency limits;
-   per-tenant quotas;
-   rate limits;
-   cache reuse;
-   budget/credit gating through existing economic authority;
-   cancellation;
-   progressive/async execution for long-running analytics.

Long-running work SHALL use existing durable job/control-plane
infrastructure.

------------------------------------------------------------------------

## 27. Reliability

Requirements:

-   idempotent execution where applicable;
-   deterministic query digest;
-   retry classification;
-   provider fallback only when semantic equivalence is guaranteed;
-   cancellation;
-   timeout;
-   circuit breaking;
-   partial-result labeling;
-   stale-data labeling;
-   no false DONE state;
-   recoverable execution handles for asynchronous work.

------------------------------------------------------------------------

## 28. Observability

Minimum telemetry:

-   query count;
-   latency;
-   failure rate;
-   cache hit rate;
-   provider utilization;
-   rejected policy requests;
-   metric usage;
-   stale-data incidence;
-   result size;
-   execution cost;
-   tenant-level usage within privacy policy;
-   semantic resolution failures.

All traces SHOULD propagate platform correlation IDs.

------------------------------------------------------------------------

## 29. Search and Discovery

Agents and users SHALL be able to discover:

-   available datasets;
-   metrics/KPIs;
-   dimensions;
-   owners;
-   certification status;
-   descriptions;
-   tags;
-   business domains;
-   examples;
-   compatible visualizations;
-   lineage/dependencies;
-   freshness.

Discovery SHOULD integrate with existing capability/catalog/search
infrastructure instead of creating a disconnected search stack.

------------------------------------------------------------------------

## 30. Explainability

The platform SHOULD answer:

-   What does this KPI mean?
-   How is it calculated?
-   Which metric version was used?
-   Which data/evidence contributed?
-   What filters/time range were applied?
-   How fresh is the data?
-   Which parts are measured vs inferred?
-   Why was a query denied?
-   Why was a provider selected?

------------------------------------------------------------------------

## 31. Export and Interoperability

Supported export classes SHOULD include:

-   JSON;
-   CSV;
-   table-oriented formats;
-   report artifact;
-   visualization snapshot where available;
-   provider-neutral semantic definition export where safe.

Exports SHALL obey tenant, PII and data-exfiltration policies.

------------------------------------------------------------------------

## 32. Compatibility with Existing Specs

### SPEC-266

Implemented upstream authority. Consume only. No semantic rewrite
required.

### SPEC-240

Consumes analytical result/visualization contracts to generate safe
interactive surfaces.

### SPEC-261

Packages portable analytical dependencies and Mini App declarations.
SPEC-299 does not become package authority.

### SPEC-265

Consumes governed analytical results as evidence for Decision
Intelligence.

### SPEC-269

Assistant may discover and invoke analytical capabilities while
preserving work context and authority ceilings.

### SPEC-270

May assist design/rendering integration. It does not own metric/query
semantics.

### SPEC-277

May project analytics jobs, evidence receipts, alerts and progress. It
does not become analytics or finality authority.

### SPEC-224 / worker execution

Long-running execution and lifecycle reuse existing orchestration/job
authority.

------------------------------------------------------------------------

## 33. Migration Strategy

Because SPEC-266 is already implemented:

1.  Do not modify its canonical semantics to fit SPEC-299.
2.  Build a read/adapter boundary from existing 266 contracts.
3.  Inventory existing metrics embedded in code, SQL, dashboards and
    Mini Apps.
4.  Register them as draft semantic metrics.
5.  Compare outputs against legacy calculations.
6.  Certify only after equivalence/owner review.
7.  Move new consumers to semantic IDs gradually.
8.  Keep compatibility adapters during migration.
9.  Deprecate duplicate metric logic only after verified cutover.
10. Roll back by routing consumers to prior implementations; do not
    mutate historical metric versions.

------------------------------------------------------------------------

## 34. Implementation Phases

### Phase A --- Contract and Registry

-   authority boundary;
-   schemas;
-   semantic catalog;
-   metric/dimension registry;
-   versioning;
-   policy contract;
-   receipts.

### Phase B --- Native Query Runtime

-   semantic query;
-   planner;
-   governed execution;
-   caching;
-   basic analytics;
-   tests.

### Phase C --- Agent / MCP / API

-   capability exposure;
-   NL intent mapping;
-   explainability;
-   permission propagation.

### Phase D --- Visualization / Dashboard / Report

-   normalized visualization data;
-   dashboard definition;
-   reports;
-   exports;
-   generated-UI integration.

### Phase E --- Alerts / Decision Handoff

-   analytical conditions;
-   anomaly signals;
-   SPEC-265 handoff;
-   durable execution integration.

### Phase F --- Provider Adapters

-   adapter SDK/contract;
-   Superset optional adapter;
-   later Cube/dbt/others based on demand.

### Phase G --- Production Certification

-   security;
-   tenant isolation;
-   load;
-   migration;
-   failure/recovery;
-   cost;
-   rollback;
-   operational runbooks.

------------------------------------------------------------------------

## 35. Testing Strategy

At minimum:

-   unit tests for semantic resolution;
-   metric versioning tests;
-   dimension/filter validation;
-   policy/RBAC/RLS tests;
-   cross-tenant isolation tests;
-   PII tests;
-   cache isolation tests;
-   query-limit tests;
-   SQL/query injection tests;
-   provider adapter conformance;
-   result equivalence tests;
-   provenance/receipt tests;
-   stale/freshness tests;
-   async cancellation/retry tests;
-   migration compatibility tests;
-   dashboard/report contract tests;
-   agent permission-ceiling tests;
-   negative tests for bypass attempts;
-   rollback tests;
-   metric grain/additivity tests;
-   join fan-out/cardinality tests;
-   timezone/fiscal-calendar boundary tests;
-   currency/unit conversion tests;
-   target/variance tests;
-   cohort/funnel/retention semantic tests;
-   pivot/subtotal/grand-total tests;
-   drill authorization tests;
-   snapshot/replay tests;
-   data-quality propagation tests;
-   lineage impact tests;
-   semantic promotion/CI tests;
-   embed-token escalation tests;
-   export/DLP tests;
-   alert deduplication/storm tests;
-   accessibility/localization contract tests;
-   workload-isolation and materialization invalidation tests.

Production certification SHALL include repeated QA loops and adversarial
tenant/security cases.

------------------------------------------------------------------------

## 36. Acceptance Criteria

SPEC-299 is not complete until:

1.  Core analytics works without Superset or another external BI
    platform.
2.  At least one certified metric is queried consistently from API and
    agent surfaces.
3.  The same metric definition is reusable by dashboard/report/Mini App
    consumers.
4.  Tenant isolation is proven by negative tests.
5.  Permission ceiling propagation is proven.
6.  Provenance and metric versions are recoverable from results.
7.  Long-running execution uses existing durable job authority.
8.  SPEC-265 can consume a normalized analytical evidence result.
9.  SPEC-240/UI consumer can render normalized visualization data
    without owning analytics semantics.
10. No duplicate approval, billing, finality, source registry or job
    authority is introduced.
11. External provider outage does not disable Native SmartAIHub
    Analytics.
12. Superset remains optional.
13. Migration from legacy metric logic is reversible.
14. Security, load, recovery and rollback gates pass.
15. Documentation clearly separates measured facts, derived metrics and
    AI inference.

------------------------------------------------------------------------

## 37. Definition of Done

The feature is DONE only when implementation evidence exists on the
canonical integrated SHA and includes:

-   source code;
-   migrations if required;
-   automated tests;
-   provider-conformance tests where applicable;
-   security tests;
-   tenant-isolation proof;
-   API/MCP/agent contract tests;
-   observability;
-   operational runbook;
-   migration/rollback plan;
-   production-readiness evidence.

A spec, local worktree, static UI, dashboard screenshot, migration file,
or scoped test suite alone is not proof of production completion.

------------------------------------------------------------------------


## 38. Ten-Pass Gap Audit and Required Closures

This revision was reviewed through ten distinct lenses. A PASS means the identified gap has a normative closure in this specification; it does not claim implementation completion.

| Pass | Lens | Gap found | Closure in R1.1 |
|---|---|---|---|
| 1 | Authority / architecture | Risk of duplicating 266, job, approval or UI authority | Explicit authority matrix, additive-only integration and conformance gates |
| 2 | Semantic correctness | Grain, additivity and fan-out rules were underspecified | Metric grain, additive behavior, join graph and fan-out protection made mandatory |
| 3 | Business semantics | Timezone, fiscal calendar, currency, units, targets were weak | Governed temporal/unit/currency/target semantics added |
| 4 | BI completeness | Self-service Explore, pivot, drill, sharing and subscriptions were incomplete | Governed BI workspace/content lifecycle added |
| 5 | Advanced analysis | Cohort/funnel/retention/variance and point-in-time semantics missing | Analytical primitive contracts added |
| 6 | Agent/MCP safety | NL query could be semantically valid yet business-ambiguous | Intent plan, ambiguity, explain/confirm, authority and receipt requirements strengthened |
| 7 | Security / tenancy | Embedding, export, cache and delegated identity needed stronger rules | Effective-principal, signed embed, export/DLP and cache partition requirements added |
| 8 | Scale / reliability | Pre-aggregation, materialization, real-time and workload isolation incomplete | Acceleration, workload classes, async execution and freshness contracts added |
| 9 | Lifecycle / operations | Dev→stage→prod promotion, GitOps, lineage and quality gates missing | Semantic CI/CD, promotion bundles, lineage and quality contracts added |
| 10 | Product / production | Accessibility, localization, mobile, recovery and SLO gates incomplete | UX/accessibility/i18n and production certification matrix added |

No pass authorizes implementation to modify an authority owned by another canonical spec.

---

## 39. Semantic Correctness: Grain, Additivity and Join Safety

Every metric SHALL declare sufficient semantics to prevent numerically plausible but business-invalid results.

A certified metric SHALL declare, where applicable:

- base grain;
- entity/key grain;
- aggregation behavior: additive, semi-additive or non-additive;
- valid time dimensions;
- valid dimensional cuts;
- distinct-count semantics;
- null/unknown semantics;
- denominator semantics for ratios;
- weighting semantics;
- allowed filters;
- forbidden combinations;
- join path requirements;
- fan-out sensitivity;
- default currency/unit;
- rounding/display precision separately from calculation precision.

Semantic relationships SHALL declare cardinality (`1:1`, `1:N`, `N:1`, governed `N:N`), join keys, temporal validity and optional bridge semantics.

The planner SHALL reject or rewrite a plan when a join can multiply facts and change a metric result unless the semantic model explicitly defines a safe aggregation strategy.

Certification tests SHALL include fan-out traps, duplicate facts, missing dimensions, late-arriving facts and non-additive metrics.

---

## 40. Time, Calendar, Currency and Unit Semantics

Time is part of business meaning and SHALL NOT be inferred only from database timestamps.

The semantic model SHALL support:

- source timezone;
- reporting timezone;
- user/tenant timezone;
- business-day boundary;
- Gregorian and declared fiscal calendars;
- fiscal year/quarter/period;
- week-start policy;
- holiday/business calendar reference;
- event time versus ingestion time;
- as-of/point-in-time semantics where the upstream source supports them;
- late-arriving-data policy.

Currency and units SHALL support governed conversion definitions containing source, target, rate/version, effective time, provenance and rounding policy.

An agent SHALL NOT silently convert currency or units using an ungoverned model assumption.

---

## 41. Targets, Plans, Benchmarks and Variance

BI requires comparison against intended outcomes, not only historical aggregation.

SPEC-299 SHALL support governed analytical references for:

- target;
- budget;
- forecast;
- plan;
- baseline;
- benchmark;
- SLA/SLO objective.

Common calculations SHALL include actual, target, absolute variance, percentage variance, attainment and trend-to-target.

Ownership of planning/budget source data remains with its upstream authority; SPEC-299 owns only the analytical semantic mapping.

---

## 42. Advanced Analytical Primitives

The canonical query model SHOULD support provider-neutral primitives for:

- cohort analysis;
- funnel analysis;
- retention;
- churn;
- period-over-period;
- year-over-year;
- rolling/window periods;
- cumulative metrics;
- contribution/share-of-total;
- ranking;
- Pareto/top-N;
- distribution/percentile where supported;
- segmentation;
- governed anomaly score;
- forecast result consumption.

Forecasting or ML model authority is not implicitly created by this section. Model-produced results must retain their own model/version/provenance.

---

## 43. Governed Self-Service BI Workspace

SPEC-299 SHALL provide a contract for self-service analysis without requiring raw SQL.

A governed Explore experience SHOULD allow an authorized user to:

- discover certified datasets/metrics;
- choose dimensions/measures;
- filter and group;
- pivot/crosstab;
- compare periods;
- sort/rank;
- drill down;
- drill through to permitted detail;
- change visualization;
- save an analysis;
- promote analysis into dashboard/report content;
- ask an agent to explain or modify the analysis.

Raw SQL/advanced query mode MAY exist for separately authorized roles but SHALL remain outside the semantic authorization boundary and SHALL enforce source, tenant, cost and export policy.

---

## 44. BI Content Lifecycle, Sharing and Collaboration

Analytical content SHALL have explicit identity, owner, version and visibility.

Content classes include:

- saved analysis;
- chart/visualization definition;
- dashboard;
- report;
- alert;
- annotation;
- narrative insight.

Visibility MAY include private, team, tenant and explicitly public-safe content.

Requirements:

- no accidental public sharing;
- permission re-evaluation at read/run time;
- content certification;
- favorite/pin/discovery metadata;
- comments/annotations only through an existing collaboration authority when one exists;
- scheduled subscription through existing scheduling/notification infrastructure;
- share links must not become bearer-token bypasses;
- cloned/forked content retains lineage.

Public analytics, when allowed, SHALL use an explicitly public-safe dataset/metric policy rather than weakening authenticated tenant policy.

---

## 45. Dashboard Interaction Contract

Native dashboards SHOULD support:

- global and local filters;
- cross-filtering;
- linked selections;
- drill-down;
- drill-through;
- parameter controls;
- bookmarks/views;
- comparison periods;
- refresh status;
- stale-data indicators;
- loading/partial/error states;
- provenance/details panel;
- metric-definition inspection;
- responsive layouts;
- print/export-safe rendering where applicable.

Dashboard UI SHALL never imply that a recommendation/action has been executed merely because an analytical state changed.

---

## 46. Reproducibility and Point-in-Time Snapshots

A report, evidence-bearing analytical result or decision input SHALL be reproducible to the practical limit of its upstream sources.

A reproducibility envelope SHOULD capture:

- semantic query canonical form/digest;
- metric versions;
- semantic-model version;
- policy version or decision reference;
- source snapshot/as-of identifiers where available;
- provider/runtime version;
- timezone/calendar context;
- currency/unit conversion versions;
- execution time;
- freshness watermark;
- result digest.

If exact replay is impossible because an upstream source is mutable and non-versioned, the receipt SHALL state that limitation.

---

## 47. Data Quality and Semantic Health

Certified analytics SHALL expose data-quality and semantic-health signals.

Minimum checks SHOULD include:

- freshness;
- completeness;
- schema compatibility;
- null-rate threshold;
- uniqueness/key integrity where relevant;
- referential integrity where relevant;
- metric sanity bounds;
- source availability;
- semantic dependency health.

A failed critical quality gate MAY block certification, report publication, alert execution or Decision Intelligence handoff according to policy.

The platform SHALL distinguish `no data`, `zero`, `unknown`, `stale`, `partial`, and `error`.

---

## 48. Lineage and Impact Analysis

Lineage SHALL be recoverable across:

`source/evidence → analytical dataset → semantic field → metric/KPI → saved analysis → dashboard/report/alert → decision evidence`

Before changing or retiring a certified semantic object, the system SHOULD identify affected downstream consumers.

Provider adapters SHALL map external lineage only when trustworthy; missing lineage must be labeled rather than inferred as fact.

---

## 49. Acceleration, Materialization and Workload Management

To support large-scale BI without coupling semantics to one database, SPEC-299 SHALL define provider-neutral acceleration hints.

Possible strategies:

- result cache;
- semantic cache;
- pre-aggregation;
- materialized view;
- incremental aggregate;
- rollup;
- provider-native acceleration.

Acceleration artifacts SHALL be invalidated or version-keyed by semantic definition, policy scope and relevant source freshness.

Workload classes SHOULD distinguish interactive, dashboard refresh, scheduled report, alert, agent/background and bulk export workloads.

Interactive workloads SHOULD be protected from unbounded background scans.

---

## 50. Streaming and Near-Real-Time Analytics

SPEC-299 MAY consume streaming/near-real-time sources exposed by upstream authorities.

Every result SHALL communicate its freshness/watermark semantics.

Real-time mode SHALL NOT mean unlimited continuous re-query. Implementations SHOULD use event-driven invalidation, bounded refresh, incremental state or provider-native streaming where suitable.

Historical and streaming results must preserve compatible metric semantics before they are merged.

---

## 51. Embedded Analytics Security

Embedded analytics for Mini Apps or external surfaces SHALL use server-authorized, short-lived, audience-scoped access.

An embed grant SHOULD bind:

- effective principal;
- tenant;
- permitted content;
- permitted metrics/datasets;
- row/column policy;
- expiration;
- audience/origin where applicable;
- export permission;
- drill permission.

Guest/embed tokens from external BI providers are transport mechanisms, not SmartAIHub authorization authorities.

---

## 52. Agent and MCP Analytical Safety Contract

Agent-facing analytics SHALL expose structured tools rather than encourage arbitrary query generation.

An agent execution SHOULD produce an `AnalyticsIntentPlan` containing:

- user question;
- resolved business concepts;
- candidate metrics/dimensions;
- assumptions;
- ambiguity status;
- requested time/calendar context;
- proposed semantic query;
- expected result shape;
- authority/cost class.

For material ambiguity, the agent SHALL clarify, present alternatives, or use an explicitly certified default and disclose it.

High-cost, sensitive or export-capable operations SHALL obey existing approval/policy gates.

Tool output SHOULD use compact previews plus recoverable result handles for large analytical results.

---

## 53. Export, Download and Data-Loss Prevention

Export is a distinct security capability.

Policy SHALL be able to restrict:

- row count;
- columns;
- PII/sensitive fields;
- file format;
- aggregation level;
- tenant;
- destination/channel;
- expiration;
- public sharing;
- agent-initiated export.

Large exports SHALL use durable jobs and auditable artifacts.

An on-screen permission to view aggregated data does not automatically grant permission to export row-level data.

---

## 54. Semantic Definition CI/CD and Environment Promotion

Semantic definitions SHALL be promotable across development, staging and production without manual re-creation.

Promotion artifacts SHOULD include:

- semantic definitions;
- versions/digests;
- dependency graph;
- validation results;
- compatibility report;
- policy references;
- migration plan;
- rollback target.

CI gates SHOULD test:

- schema compatibility;
- metric equivalence;
- fan-out safety;
- tenant policy;
- provider conformance;
- performance budget;
- backward compatibility.

Production promotion SHALL not silently overwrite a certified semantic version.

---

## 55. Provider Capability Negotiation and Conformance

Every provider adapter SHALL publish a capability manifest covering supported:

- aggregations;
- time grains;
- window functions;
- cohort/funnel primitives;
- drill;
- embedding;
- export;
- RLS/policy pushdown;
- async execution;
- cancellation;
- lineage;
- freshness;
- acceleration;
- limits.

The planner SHALL not route a query to a provider that cannot preserve required semantics or security.

A provider conformance suite SHALL validate canonical queries against expected normalized results.

Fallback is allowed only when semantic equivalence and policy equivalence are proven.

---

## 56. UX, Accessibility, Localization and Mobile

Native BI surfaces SHALL be usable on desktop, tablet and mobile.

Requirements SHOULD include:

- responsive layouts;
- keyboard navigation;
- accessible labels and focus order;
- non-color-only status communication;
- screen-reader-compatible tabular alternatives where practical;
- locale-aware number/date formatting;
- timezone visibility;
- currency/unit visibility;
- translated display labels without changing canonical IDs;
- graceful handling of dense tables on small screens.

Generated UI consumers remain governed by their own rendering authority, but SPEC-299 must provide sufficient metadata to meet these requirements.

---

## 57. SLOs and Production Operating Envelope

Before production certification, the implementation SHALL declare measurable SLOs/limits for at least:

- interactive query latency by workload class;
- dashboard load/refresh;
- async job completion;
- availability;
- freshness;
- cache correctness;
- provider failover behavior;
- maximum supported result size;
- concurrency;
- tenant isolation;
- recovery objectives where stateful components exist.

Exact numeric targets are deployment/profile decisions and must be benchmarked rather than invented in this spec.

---

## 58. Additional Failure Modes

The implementation SHALL test and handle:

- source schema drift;
- deleted/renamed fields;
- duplicate facts;
- fan-out joins;
- timezone boundary errors;
- fiscal-calendar rollover;
- currency-rate absence;
- partial provider outage;
- stale cache after metric revision;
- policy change during long-running query;
- revoked access before result retrieval;
- tenant context mismatch;
- oversized result;
- export interruption;
- alert storm;
- schedule duplication;
- provider semantic mismatch;
- snapshot replay unavailable.

Failure SHALL be explicit; silent semantic degradation is prohibited.

---

## 59. Expanded Production Acceptance Gates

In addition to Section 36, production acceptance requires evidence that:

1. additive, semi-additive and non-additive metrics behave correctly;
2. unsafe fan-out joins are rejected or safely planned;
3. timezone/fiscal-calendar boundary tests pass;
4. currency/unit conversion is governed and reproducible;
5. target/actual/variance semantics are deterministic;
6. pivot, drill-down and drill-through preserve authorization;
7. self-service Explore cannot bypass semantic/policy gates;
8. point-in-time limitations are surfaced honestly;
9. data-quality failures propagate correct status;
10. lineage identifies downstream impact for certified content;
11. semantic CI/CD prevents incompatible silent promotion;
12. cache/materialization cannot cross tenant or policy boundaries;
13. embedded analytics cannot escalate permissions;
14. large exports are separately authorized and auditable;
15. agent ambiguity and high-cost query paths are tested;
16. provider fallback preserves semantic and security equivalence;
17. mobile/accessibility/localization metadata is available to consumers;
18. alert deduplication and storm controls are proven;
19. SLO/load tests cover interactive and background workload contention;
20. rollback restores the prior semantic/runtime behavior without corrupting historical receipts.

---

## 60. Recommended Implementation Priority

### P0 — correctness and authority
Semantic registry, grain/additivity, relationship safety, tenant/policy enforcement, query contract, receipts, native execution minimum.

### P1 — usable BI
Explore, KPI, pivot, drill, dashboards, reports, target/variance, visualization contract, Agent/MCP access.

### P2 — operational BI
Scheduling, alerts, subscriptions, quality/lineage, acceleration, exports, environment promotion.

### P3 — advanced/provider extensions
Cohort/funnel/retention, streaming, external BI adapters, advanced provider-native features.

External provider integration SHALL NOT delay P0/P1 Native SmartAIHub capability unless a deployment explicitly selects that provider as its implementation strategy.

---

## 61. Revised Architectural Decision

**Decision:** SPEC-299 is the canonical SmartAIHub authority for provider-neutral business analytics semantics, governed semantic queries, normalized analytical results, and BI content contracts.

**Native-first:** Core BI/analytics SHALL work without Apache Superset.

**Provider-neutral:** Superset and other BI/semantic platforms are optional adapters.

**Agent-native:** Material analytical capabilities SHALL be callable headlessly with the same permission ceiling and semantic definitions used by human BI surfaces.

**Correctness-first:** A chart or SQL result is not considered valid analytics unless semantic grain, policy, provenance, freshness and metric version are valid.

**Action-safe:** Analytics may inform Decision Intelligence and workflows but never grants execution authority by itself.

**Strategic outcome:** humans, agents, Mini Apps, dashboards, reports and Decision Intelligence share one governed analytical language while existing SmartAIHub authorities remain intact.

---

## 62. Original Architectural Decision Summary (Superseded by Section 61)

**Decision:** Build SmartAIHub's provider-neutral, agent-native Unified
Analytics & Business Intelligence Fabric as SPEC-299.

**Do not:** make Apache Superset a mandatory dependency or retrofit
SPEC-266.

**Default:** Native SmartAIHub analytics.

**Extension:** External BI and semantic providers through governed
adapters.

**Strategic outcome:** one analytical language and metric authority
shared by humans, agents, dashboards, reports, Mini Apps, Decision
Intelligence and workflows.
