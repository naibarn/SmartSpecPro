---
spec_id: 238
title: SmartAIHub Universal Intelligent Monitoring & Alert Builder
revision: 1.3
created: 2026-09-24
reviewed: 2026-09-24
status: PROPOSED / NOT IMPLEMENTED / NOT PRODUCTION CERTIFIED
numbering: PROVISIONAL — verify SmartSpecPro registry, main branch, PRs and worktrees
suggested_repository_path: specs/feature/238-universal-intelligent-monitoring-alert-builder/spec.md
risk_class: high — user-configurable; life-safety domain packs require additional certification
owners: [Universal Assistant, Workflow Studio, Monitoring Intelligence, Notification UX, Trust and Safety]
canonical_execution: Feature 186/195 worker_jobs
canonical_agent: Feature 196
canonical_workflow: Specs 209/214/215
canonical_notification: Spec 225 via Spec 226 bridge
canonical_authorization: Spec 220
canonical_billing: Spec 207
canonical_retrieval: Spec 229 / Cloudflare Vectorize
migration_alignment: Spec 232
related_specs: [199, 200, 206, 208, 212, 213, 222, 224, 225, 226, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237]
---

# Spec 238 — Universal Intelligent Monitoring & Alert Builder

> **Product intent:** The AI Chat user says *what matters and why*; SmartAIHub compiles a bounded, inspectable and versioned monitoring system tailored to that goal. It discovers eligible data sources, assembles or reuses an approved Workflow, collects evidence over time, evaluates explicit conditions and domain-specific models, then sends a proportional alert using the **existing** Notification Gateway. It is not a general-purpose autonomous daemon, a new task ledger or a new notification provider.
>
> **Illustrative request:** “Monitor multi-source heavy rain and flood risk around my selected districts, warn me normally when conditions worsen, urgently before potential impacts, and critically when trustworthy evidence shows imminent severe impacts.” No claim that the proposed risk model can currently issue certified public emergency warnings.

## 0. Scope and exclusions

**P0 (first usable vertical slice):** AI Chat → Monitoring Blueprint → source/capability check → explicit consent and budget → dry run → publish a private monitor → scheduled or event-based evaluations → three-level alerts through existing in-app/push/email → user management, pause/resume, audit and reason-for-alert. At least one simple non-life-safety connector plus a deterministic flood-data replay fixture must pass.

**P1:** Thai hydro-meteorological Flood Domain Pack using *verified-access* primary sources; geospatial targeting, independent observations, authoritative CAP ingestion, hydrological rule checks, historical replay, multi-factor scoring where scientifically supported, explicit source-gap state and calibration dashboard.

**P2:** Approved domain-pack marketplace (including Spec 212 template reuse), domain-agnostic source onboarding with review, event/webhook ingress, organization escalation policies, validated forecast models and opt-in advanced predictive analytics.

**Out of scope:** Replicating an emergency authority; issuing government CAP warnings as SmartAIHub's own; unsupervised public evacuation instructions; monitoring any arbitrary website by evading access controls; guaranteed push/LINE delivery; polling private sources without consent; automatically deploying arbitrary generated source code; assuming every topic can produce a defensible numerical risk/confidence score; replacing Spec 225, 215, 195 or 196.

All defaults below are **product policy proposals**, not official rainfall/flood thresholds, demonstrated forecast accuracy, or confirmed provider service levels. Before production, inspect deployed code/schema/migration journal; do not infer a capability is implemented because this spec names it.

## 1. Canonical ownership: no duplicated runtime

| Responsibility | Single owner | Additive Spec 238 responsibility |
|---|---|---|
| User's natural-language intent, conversation, capability planning | Feature 196 | `monitor.create/revise/explain` intents and MonitoringBlueprint compilation profile |
| AI-first reusable authoring | Spec 209 | Monitoring task preview/authoring surface and reusable monitoring templates |
| Node manifest/type registry | Spec 214 | Register **additive** reusable connector/evidence/monitor policy node contracts only if missing; no fork |
| Workflow compilation, schedules, step retries/checkpoints | Spec 215 | Monitoring Workflow definitions, domain-pack parameters, verification and evaluation output contracts |
| Job authority, leasing, idempotency, audits/outbox | Features 186/195 (`worker_jobs`) | Namespaced monitor evaluation/collector job families, never second job ledger |
| Notification Gateway, cross-device Attention, preferences | Spec 225 | Domain event and proposed severity passed to existing Gateway |
| Existing Chat/Task Control compatibility/read projections | Spec 226 | Add Monitor cards, detail deep links and typed command bridge; no new Attention source of truth |
| RBAC/ABAC, approval, secrets, external capabilities | Specs 220/199/200/206 | Consent grants per source, per-monitor audience, outbound destination and hazard-policy checks |
| Credits/usage | Spec 207 | Estimate/reserve/settle metered ingestion + model + delivery through existing ledger |
| Authorized retrieval / source provenance | Spec 229 | Source registry metadata and authorized evidence retrieval; Vectorize is semantic index only |
| Maintenance incident lifecycle | Spec 228 | Auto-file monitoring infrastructure incidents; do not equate sensor-derived flood risk with an app bug |
| Optimization / policy learning | Spec 222 | Offline proposals/shadow tests only; never silently raise/lower critical thresholds |
| Model selection | Spec 231 | Task-based routing for planning, extraction and explanation; deterministic rules remain authoritative |
| Cloudflare Redis migration | Spec 232 | Per-family routing, source coalescing and scheduler transport without dual active ownership |
| Dev automation (in progress) | Spec 224 | Consumes this frozen spec later; MUST NOT mutate Spec 224 in place |
| Realtime voice/camera | Spec 237 | Optional voice authoring, clarification and spoken *summary* of user's own alert |

**Compatibility rule:** Specs ≤213 are immutable historical design boundaries. Use explicit adapters/migrations and contract tests; never rewrite the old requirement to pretend a new feature always existed. Spec 212's design/corpus baseline is available, but its runtime publication owner must be source/deployment-verified before extension; otherwise this spec remains a read-only candidate. The latest Spec 225 and Spec 226 in source control must be compared before coding; drafts in Library may differ from deployed versions.

## 2. Product mental model and taxonomy

A **Monitor** is a durable, user/tenant-owned subscription to a versioned **MonitoringBlueprint**. The Blueprint compiles to an existing Spec 215 Workflow that produces observations, assessments and potential **MonitorAlertEvents**; user-facing delivery uses Spec 225 only.

- **Schedule reminder:** A predetermined message at a predetermined time; route through existing simple reminder if no evidence check is needed.
- **Condition watch:** Trigger when measurable condition crosses a rule (e.g., service down, price below cap).
- **Intelligent monitor:** Multi-source evaluation with freshness/quality checks, temporal/spatial correlation, domain model and explainable alert decisions (e.g., flood).
- **Decision-support monitor:** Ambiguous or consequential topic; recommend human review of the assessment before activating external actions.

The AI should detect the simplest safe class and avoid expensive multi-source workflows for a simple reminder. Domain packs are typed extensions, not independent applications/runtimes. A monitor may run while user's desktop is off using approved cloud executors; local-only sources are visibly `PAUSED_SOURCE_OFFLINE` if required Runner is offline.

## 3. End-to-end architecture

```text
AI Chat / optional Spec 237 voice / Monitor Gallery
                │ Feature 196 parses goal and scope
                ▼
    Monitoring Intent Compiler & Capability Resolver
        source/permission/connector discovery
                │
                ▼
    Versioned MonitoringBlueprint (draft)
      sources + domain pack + evidence contract
      cadence + events + audience + severity policy
      budget + retention + approvals + failure modes
                │
           Compile via 209/214/215
                │
      Preview → source test → historical dry run
           → user approves activation
                │
  PostgreSQL: monitors/versions/subscriptions/policies
           [Feature 195 remains job truth]
                │
  shared source collection / webhooks / schedule fan-out
                │
   195 worker_jobs → 232 Queue / Workflow / Runner
                │
 R2 evidence objects ─┐  PostgreSQL observation metadata
                      ▼
       Normalize → quality/freshness → provenance
                      ▼
       Domain evaluation / source disagreement
           deterministic checks + validated models
           optional LLM synthesis/explanation
                      ▼
         Versioned Assessment + evidence refs
         risk/impact/urgency/certainty/confidence
                      ▼
       Alert Policy Evaluator (Spec 238 only)
   state transition → dedup → hysteresis → cooldown
   escalation override → opt-in channels/recipients
                      ▼
      Spec 225 Attention / Notification Gateway
     via Spec 226 UI bridge / delivery attempts
                      ▼
   Web / Mobile / Web Push / LINE OA / Telegram / Email
       open → acknowledge → re-evaluate → resolve
```

**Hard architectural separation:** A source reading is not a job, a completed collection job is not evidence of safe conditions, an Assessment is not a Notification, a delivery receipt is not an acknowledgement, and acknowledgement is not a determination that the hazard ended.

## 4. Chat-to-Monitor lifecycle and controls

`DRAFT → NEEDS_SOURCE → READY_TO_TEST → READY_FOR_APPROVAL → ACTIVE ↔ PAUSED → DEGRADED → RETIRING → ARCHIVED`; independent evaluation and alert-event state machines follow below. `NEEDS_SOURCE` blocks activation of mandatory evidence contracts. `DEGRADED` does not mean benign.

**Intent compiler SHALL:**
1. Extract goal, domain, geographic/entity scope, time horizon, decision lead time, sources, data sensitivity, recipient(s), language/timezone, cadence, budget and acceptable false-alert/missed-alert trade-off.
2. Search the approved Capability Registry/Spec 199 and Spec 229 source catalog. Distinguish verified accessible API from a public webpage, unlicensed imagery, future feature and unverifiable claim.
3. Select reusable domain pack/template/Spec 212 capability if available; otherwise construct a constrained typed rule monitor. If a domain requires new algorithms or specialist validation, create a proposal **not** an automatically production-enabled model.
4. Return a **reviewable** Blueprint and truthful source matrix with permissions, available history, expected refresh, expected latency, coverage, licensing and expected cost. Ask only for material missing consent/area/budget details; allow a limited preview from available facts.
5. Produce an executable Spec 215 workflow graph, run manifest, test fixture and an explicit `activation_blockers[]` list. Never let prompt text become SQL, unrestricted JS/Python, arbitrary cron deployment or an external capability grant.
6. Require user confirmation for notification destinations, personal location use, potential costs and critical quiet-hours override; require stronger administrative/domain approval for public alerts or high-consequence automated actions.
7. Bind `blueprint_version`, `policy_version`, `data_contract_version`, domain pack/model digest and dependency versions at activation. A conversational change creates a new proposed version + diff; no silent mutation of active monitors.

**Illustrative user flow:** “แจ้งเตือนน้ำท่วม นครราชสีมา” → Chat proposes map-based polygon + available official sources and known source gaps → user chooses districts and urgency/time window → AI produces inspectable flood workflow and notification ladder → runs 30–90-day historical replay if accessible or labels fixture-only simulation → user approves selected channels/budget → `ACTIVE` only for certified scope. Any missing mandatory live feed means restricted/official-warning-only mode or `NEEDS_SOURCE`—not fabricated multisource confidence.

## 5. MonitoringBlueprint v1: conceptual typed contract

```json
{
  "schema_version": "monitor.blueprint.v1",
  "monitor_id": "mon_example_001",
  "version": 1,
  "domain_pack": "th.flood.multisource@1.0.0",
  "owner_scope": {"tenant_id": "tenant_placeholder", "user_id": "user_placeholder"},
  "subject": {"type": "geo_polygon_ref", "geometry_ref": "r2://approved-geometry-ref", "display_name": "selected district(s)"},
  "goal": "Warn about worsening heavy-rain and flood risk",
  "horizon_minutes": 180,
  "scheduling": {"mode": "HYBRID", "evaluation_interval_minutes": 5, "event_sources": ["official_warning", "river_threshold"]},
  "sources": [
    {"source_id": "tmd_radar_verified_adapter", "required": true, "freshness_slo_minutes": 20},
    {"source_id": "river_telemetry_verified_adapter", "required": false, "freshness_slo_minutes": 20}
  ],
  "evidence_policy": {"min_independent_groups": 2, "on_missing": "DEGRADED_NO_ALL_CLEAR", "official_alert_override": true},
  "decision_policy": {"policy_ref": "policy_001@1", "profile": "CONSERVATIVE", "critical_requires_verified_signal": true},
  "notifications": {"recipient_refs": ["self"], "channels": ["IN_APP", "WEB_PUSH"], "critical_override_opt_in": false},
  "budget": {"daily_credit_cap": 20, "on_exhaustion": "NOTIFY_AND_DEGRADE"},
  "retention": {"raw_days": 14, "normalized_days": 90, "assessment_days": 365},
  "approval": {"status": "PENDING_USER", "purpose": "ACTIVATE_MONITOR"},
  "state": "DRAFT"
}
```

Illustrative placeholders above **are not live endpoints or configured production IDs**. Persist canonical authorized resource references and PostgreSQL identifiers, not a raw R2 URI supplied by the model. The server validates every referenced resource and strips forbidden fields before compile.

Required immutable audit metadata: who proposed/approved, model/tool versions used to author the Blueprint, normalized purpose, frozen source manifests, cost estimate, replay fixture/results, effective UTC interval, authorization policy digest, `created_at`, and previous version/diff.

## 6. Source Registry and shared collection

**SourceAdapter manifest:** `id/version`, official owner, legal access/licence, endpoint/auth method, permitted purposes, geographic and temporal coverage, sample rate, actual lag, connector limits, data type, unit/CRS/timezone, geographic resolution, reliability statistics, health status, provenance policy, fallback policy, and verification evidence. `DECLARED`, `TESTED`, `AUTHORIZED`, `CERTIFIED`, `DEGRADED`, `DISABLED` are distinct.

**Connector types:** authenticated API/REST/GraphQL; RSS/CAP feed; authenticated webhook; approved spatial tile/grid endpoint; time-series telemetry; archived datasets; read-only SmartAIHub tenant Project/Library data; approved third-party Skills/MCP/A2A; approved browser extraction only where rights/terms/certification permit. A site displaying data does not establish redistributable API access. Scraped screenshots alone are not a primary-source integration.

**Shared collection:** Multiple users monitoring the same public radar tile or gauge MUST share tenant-safe/public-safe collection and normalized cache, rather than fetching per user. Partition private/commercial sources by credential/tenant/licence. Registry enforces per-source quota, conditional requests, TTL, jitter, backoff, circuit breaker, retry budget and rate-limited poison-queue handling.

**Event/raw records:** store original permitted bytes/checksum and immutable retrieval metadata in R2 where licence allows; PostgreSQL stores observation metadata, provider timestamps, retrieval timestamps, normalizer version, checksum, canonical station/geometry reference and quality flags. Use incremental upsert and time-window partitions; don't make Redis authoritative. If provider forbids persistence, store allowed derived metadata and an access-control-compliant provenance pointer with a visible retention limitation.

**Quality gates:** reject impossible units/ranges; validate monotonic timestamp/skew, sensor downtime, duplicated and out-of-order samples, station relocation and datum changes, cross-source disagreement, geo/CRS, accumulation-window mismatches, model issue time vs valid time, stale materialized readings and malicious/altered payloads. Retain raw observation and corrected/derived versions separately. Distinguish observation time (`observed_at`), ingestion time (`ingested_at`), forecast issue time and forecast valid time.

**Event triggers vs polling:** provider webhook/CAP event when supported; otherwise shared 5–15-minute collection *only for sources with actual supported cadence*. Static DEM/watersheds/flood maps are versioned datasets, not frequent poll jobs. Costs must be forecast for provider, requests, geo compute, storage, model and delivery.

## 7. Execution and Cloudflare deployment

- `MonitorSchedule` is a supporting scheduler/desired-state record, not a second execution authority. A small fixed set of Cloudflare Cron schedules (e.g., every 5 minutes) dispatches due monitors from PostgreSQL; **never deploy one Cron expression per user/monitor**. Schedule sweeps use leases/overlap guards and fair tenant quotas.
- Collection fan-out produces **shared per-source** logical jobs with bounded partition/window keys. Domain evaluations produce Feature 195 canonical `worker_jobs` with tenant/monitor/version and assessment idempotency keys. Use existing `worker_job_events`, outbox, lease/fencing, retry and reconcile semantics.
- Spec 232 supplies explicit `legacy` vs `cloudflare` job-family execution ownership during migration. No silent fallback to BullMQ after cutover; reconciliation/rollback must fence former owner first. Queues have at-least-once delivery: de-duplicate collector, assessment and outbound effect independently.
- Cloudflare Workers run small scheduler/connector/normalizer/policy operations. Heavy image decoding, geospatial raster interpolation, large NWP ensemble and specialized Python models go to the existing approved Runner or Cloudflare Container execution adapter, not a memory-heavy Edge Worker.
- Cloudflare Workflows MAY orchestrate multi-step collection/recovery where useful, but are a **physical engine under Spec 215/195**, not a new user-visible Workflow/Job source of truth. Use checkpoint receipts/canonical `worker_jobs` settlement. Queues are transport only.
- PostgreSQL (via Hyperdrive for suitable reads/writes with explicit freshness controls) stores monitor/config/observation metadata and audit. R2 stores allowed original images, gridded forecasts, map tiles and evidence artifacts. Vectorize remains semantic index for documentation/template/retrieval; it is **not** the spatial database nor rights authority.
- **PostGIS decision gate:** Enable only if the actual chosen managed PostgreSQL provider and provisioned cluster support the required extension/version, indexes and workload. PlanetScale + Hyperdrive connectivity does **not** prove PostGIS support. If unavailable, use versioned precomputed geometry/tile/zone intersections produced in an approved geospatial worker; keep canonical polygon IDs + geometry metadata in PostgreSQL and large raster data in R2. Do not insert full radar rasters into transactional PostgreSQL.
- Monitor runs are bounded, cancelable and auto-recoverable when the user closes the browser or desktop; offline-only dependencies surface degraded status, not false success.

## 8. Evidence fusion and assessment contract

`Assessment` fields: `{assessment_id, monitor_id, blueprint_version, domain_model_version, analysis_window_utc, horizon_utc, scope_geometry_ref, evaluated_signals[], missing_sources[], disagreements[], quality_flags[], verified_official_alert_refs[], impact_level, onset_urgency, evidence_certainty, calibrated_probability?, risk_index?, confidence?, source_coverage, freshness, explanation, actions[], policy_decision, created_at}`.

1. Use a **domain-specific deterministic baseline** for physically defined comparisons (e.g., rate of water-level rise after station datum verification). Use a validated forecast/statistical/hydrologic model where suitable; use an LLM for source extraction when allowed, causal narrative, anomaly hypotheses and readable explanations—not as ungrounded sole arbiter of physical risk or primary sensor.
2. Independent evidence groups must be established via dependency lineage. Radar-derived rainfall and its gauge-corrected radar estimate are **not automatically independent sources**. Cross-correlated sensors/derived forecasts must not be double counted.
3. Provide source disagreement and coverage. If mandatory sources are stale, return `INSUFFICIENT_EVIDENCE`, `SOURCES_DEGRADED`, or `OFFICIAL_WARNING_ONLY`, not false `LOW_RISK` and not an invented 90% confidence.
4. Separate **risk index** (a domain-defined relative indicator 0–100), **impact severity**, **onset urgency**, **evidence certainty** and **confidence/probability**. A risk index is **not** a percent chance of flooding. Confidence as a number is shown only after relevant ground-truth calibration and monitored reliability, such as reliability bins/Brier score/ECE where applicable; otherwise show `Evidence: HIGH/MODERATE/LOW` and explicit coverage.
5. Baseline model, thresholds, forecast horizon, calibration geography/season, excluded conditions, hazard cost assumptions and scoring explanations are versioned. Unvalidated model changes require replay + shadow/canary + domain approval, with rollback. Spec 222 suggestions never auto-promote critical policies.
6. Existing recognized authority warning can trigger an **official-alert relay** path if current area/scope/validity/signature/source checks succeed. Attribute it to the authority, preserve official wording/links where licensed, and do not lower/dismiss it because SmartAIHub's model disagrees. Private AI assessment and official public warning are separate objects.
7. Monitor must report **decision latency**, `last_good_source_at`, last successful evaluation, next planned evaluation and all blockers, not only model inference duration.

## 9. Alert policy: three user-facing levels

**Normal / ธรรมดา:** Meaningful non-immediate condition change or scheduled digest. Inbox and user-selected ordinary channel; respect quiet hours, rate limits and per-topic digest preferences.

**Urgent / เร่งด่วน:** Strong corroboration of meaningful near-term impact, or relevant official warning needing timely attention. Send immediate push on opted-in channels, add persistent Needs Attention card, request optional acknowledgement and elevate if condition worsens or critical deadline approaches.

**Critical / ด่วนมาก:** Credible evidence of imminent severe impact or authoritative severe/immediate official warning within subscribed scope, under the approved domain policy. Send priority messages through **user-authorized** redundant channels, request acknowledgement, maintain active event tracking and escalate on evidence change or configured acknowledgement timeout. Do **not** claim to bypass OS Do Not Disturb, telecom cell broadcast or device-level delivery blocks. Critical quiet-hours override is opt-in and subject to platform capability; always show official emergency links and advise following authorities for life-safety topics.

`INFORMATIONAL` is an internal dashboard-only state; it is **not** a fourth required user alarm level. For a simple non-hazard condition monitor, thresholds may use domain-specific metrics; never reuse weather-specific numerical thresholds across topics.

### 9.1 Decision matrix (illustrative policy, not government thresholds)

| Inputs | Default result | Mandatory guard |
|---|---|---|
| Meaningful change, low immediacy, adequate evidence | NORMAL | respectful frequency cap and digest |
| High impact with credible near-term onset, or verified relevant official warning | URGENT | fresh geographic/subject match, uncertainty disclosure |
| Severe + imminent + sufficiently verified; **or** verified official severe/immediate warning in scope | CRITICAL | domain-approved policy; independent corroboration when required; provenance visible |
| Insufficient/late mandatory evidence without authoritative warning | DATA_GAP event (not risk downgrade) | user-visible degraded monitoring and operations alert |
| Evidence of continuing official warning, AI index drops | keep official warning active until official update/expiry | AI must not downgrade public authority |
| Rapid worsening during cooldown | upgrade despite cooldown | monotonic event version and deterministic idempotency |

Use CAP 1.2 field semantics (`urgency`, `severity`, `certainty`, `area`, `effective`, `onset`, `expires`, `references`) for **compatible ingestion/export mapping**, but do **not** imply our custom NORMAL/URGENT/CRITICAL are direct CAP aliases. Source authenticity, official area applicability and updates/cancellations must be verified.

### 9.2 Alert-event lifecycle and control of notification storms

`CANDIDATE → ACTIVE_NORMAL / ACTIVE_URGENT / ACTIVE_CRITICAL → ACKNOWLEDGED? → RECOVERING → RESOLVED` with orthogonal `DELIVERY_PENDING/DELIVERED/FAILED/UNKNOWN`. `ACKNOWLEDGED` is a recipient action flag, not a hazard-ending state. `SOURCES_DEGRADED` and `DISPUTED` are orthogonal assessment tags.

Stable `event_fingerprint = domain + monitor_subject/geofence + event_kind + event_window + source_event_id` where available. Use spatial overlap/adjacency grouping and event-chain IDs to avoid 1 push per district/sensor for same moving storm. Persist `event_version`, `policy_version`, notification idempotency keys, last-notified severity and channel attempts. Hysteresis and minimum dwell stabilize recoveries; escalation **overrides** cooldown; updates send materially changed lead time/severity/scope. Confirm recovery using fresh observations over configured minimum hold period or official cancellation/expiry (with caveat if observations remain degraded). Reopen as a new version/episode on renewed hazard.

Acknowledgement/escalation tiers are user- or organization-policy choices; sending to an external emergency contact requires their consent and compatible channel terms. Do not auto-call emergency services.

## 10. Notification and attention routing

Spec 238 emits a validated typed `MonitorAlertEvent` from canonical PostgreSQL with `source_type=MONITOR_ALERT`, `source_ref=alert_event_id`, `source_version`, owner/tenant scope, three-level priority, title, safe summary, evidence deep link, requested action, expiry, dedup/collapse grouping key and optional acknowledgement deadline. Spec 225 alone owns channel selection/preferences/provider adapters and delivery attempts; Spec 226 projects the event to existing AI Chat and Task Control. Clicking any notification revalidates access and retrieves the current event version.

Channel plan: `IN_APP` and first-party `WEB_PUSH`/mobile push first; opt-in email/Telegram/LINE Messaging API where destination permissions and budgets allow. **Never integrate the retired LINE Notify API.** Restrict lock-screen text to privacy-safe summary; link to authenticated map/evidence. Failed/unknown provider delivery creates retry/reconciliation; it does not change physical hazard assessment.

Users can choose maximum severity by channel, quiet hours, minimum lead time, normal digest frequency, escalation recipient(s), exact area/entity and credit cap. Account-wide push suppression cannot be defeated by an ordinary monitor except explicit, supported and revocable critical opt-in.

## 11. UI and interaction contracts

**AI Chat composer** — users can say, for example, “เฝ้าระวังน้ำท่วมอำเภอของฉันทุก 5 นาที ใช้ข้อมูลหน่วยงานจริง ห้ามส่งเตือนถ้าแหล่งข้อมูลมีปัญหาโดยไม่บอก”; Chat returns a single `Create Intelligent Monitor` proposal, not a reminder text. Short commands: `สร้าง`, `ทดสอบ`, `เปิดใช้งาน`, `หยุดชั่วคราว`, `แก้เกณฑ์ด่วน`, `แสดงหลักฐาน`, `ทำไมเตือน`, `มีแหล่งข้อมูลใดขัดข้อง`, `ค่าใช้จ่ายเดือนนี้`, `ลบ`. Every mutation routes through existing approved action and version/CAS guard.

**Builder preview card / modal:** natural-language goal; subject map/entity selector; verified Sources vs Proposed vs Unavailable; sample cadence and real feed lag; evaluation method and model provenance; Normal/Urgent/Critical policy previews; channel/quiet-hours/ack settings; costs and provider permissions; missing sources and consequences; a `Test using historical data` button and `Activate` only when gates pass. Show a *visual* workflow summary while allowing advanced users to open the Spec 209 builder; drag-and-drop is never mandatory.

**Monitor Center (Chat/Task Control):** `My monitors`, search/tag/folder/project, active/paused/degraded/permission-expired, last-good evaluation, next run, total estimated cost, source health and recent alerts. Per-monitor detail includes timeline, source table, observed vs forecast separation, spatial coverage/mapping where relevant, risk contributors (including uncertainty and correlation), assessment diff, delivery receipts, acknowledgement controls, evaluation/debug trace, latest official warnings and exact Blueprint version. All device layouts use Spec 225/226 responsive Attention/Task Control, not an independent mobile-only app.

**Admin Monitoring Console:** source adapter registry/status/quota/licence, shared collector throughput, domain pack certification, unverified model warnings, false-positive/missed-event investigations, calibration strata, source outages, per-tenant quota/abuse, audit and moderation, default policy templates, domain pack kill switch and emergency disable. Monitoring-platform outages flow to Spec 228. Admin views use aggregate/redacted information unless privileged audited purpose justifies personal location access.

**Accessibility:** Thai/English localizations, time zone and absolute timestamp (ICT and UTC), visually distinguish forecasts from observations and uncertainty from hazard severity, screen-reader readable charts and alternate non-color cues.

## 12. Domain Pack SDK and extensibility

A `DomainPack` declares: `pack_id`, semver/digest/signature, author/tenant, approved purposes, domain-specific schemas and evidence minimums, connector dependencies, optional geospatial assets, deterministic evaluators, optional reviewed model endpoints, explainability templates, risk semantics, alert policy defaults, replay fixtures, certification scope, rollback policy and supported regions/horizons.

Supported classes include meteorology, infrastructure uptime, project/marketplace metrics, user-authorized finance price changes, travel itinerary disruptions, document/regulation update watch and owned-IoT telemetry. **Not all classes support numerical risk indexes**; many need Boolean threshold, event change or statistical anomaly only. For medical, legal, financial, physical safety, public warning or trade execution, require domain-specific safety review; no autonomous consequential action from a general-purpose LLM assertion.

A generated new connector/domain pack begins `DRAFT_UNTRUSTED` and is testable only in a controlled sandbox with no private credentials/egress beyond the allowlist. Certification requires source rights, schema validation, offline replay, injection tests, abuse review, budget limits and an accountable owner. User text or tool output can request a change but can never approve its own production publication.

## 13. Flood Domain Pack `th.flood.multisource` — reference use case

This is the required **P1 reference** and a P0 replay fixture. See separate `SPEC238_FLOOD_DOMAIN_PACK_REFERENCE.md` for detailed source classification, update targets, risk design, official-warning relay and worked sample. Implementation does **not** require every example source to be publicly accessible; source audit decides whether to run multi-source live or degrade to narrower certified modes.

Source candidates to verify: Thai Meteorological Department (TMD) published open-API/RSS offerings, licensed radar feed, Himawari satellite products, quality-controlled rain gauges; ThaiWater water-data **draft interoperability specifications** for rainfall `/Rainfall`, runoff `/Runoff`, reservoir data and station metadata (a documented specification is **not proof of a usable production endpoint**); Royal Irrigation Department published dam/runoff information and separately authorized telemetry if available; authorized tide observations; verified NWP model licence/data currency; versioned DEM/watershed/historical flooding GIS.

Proposed per-source **collection targets contingent on access**: radar 5–15 min; gauges and river telemetry 5–15 min; satellite 10–30 min; tide 30 min; dam/release 60 min; NWP each issue cycle, usually 1–6 h where truly published; static DEM/watershed/flood-history only on source version change. Actual available cadence is documented per adapter and checked from timestamps; do not advertise an impossible 5-minute refresh for daily-only dam bulletins.

Hydrological quality/ethics gates: river levels require consistent vertical datum and station normalization; reservoir storage alone is not downstream discharge; flood risk requires basin connectivity, lag/routing and local drainage, not simple nationwide summation; forecast skill varies region/season; risk should be evaluated per geofenced zone with lead-time uncertainty. Satellite/radar/gauge dependencies and station gaps are explicit. Historical flood polygons are impact priors, not live inundation proof.

**Output example — synthetic replay, not current weather:**

> 🔴 [ตัวอย่างทดสอบ] ความเสี่ยงน้ำท่วมสูง — พื้นที่ที่ผู้ใช้เลือก  
> พบหลักฐานฝนสะสมสูงและระดับน้ำเพิ่มเร็วตามข้อมูลจำลอง เหตุการณ์มีแนวโน้มกระทบพื้นที่ลุ่มต่ำในช่วง 06:30–08:30 น. ตามโมเดลทดสอบ  
> Risk index: 81/100 (**ค่าดัชนีจำลอง ไม่ใช่โอกาสเกิดน้ำท่วม 81%**)  
> Evidence: สูง — เฉพาะ fixture ที่ตั้งต้นให้เซนเซอร์ครบ; ค่าความน่าจะเป็นจริงยังไม่ผ่านการสอบเทียบ  
> Latest observation: 05:45 ICT (synthetic); แสดงลิงก์หลักฐาน/ข้อจำกัดและคำเตือนทางการหากมี  
> **สถานะ: DEMO เท่านั้น ห้ามส่งเป็นการเตือนภัยจริง**

## 14. Data model (conceptual additive migration)

| Table / aggregate | Canonical responsibility / important fields |
|---|---|
| `monitor_definitions` | id, tenant/user, `current_blueprint_version`, status, source permissions, scope hash, next_due_at, budget policy |
| `monitor_blueprint_versions` | immutable canonical JSON, schema/digest, compiler manifest, activation approval, diff, effective times |
| `monitor_source_bindings` | source/adapter version, authorized credentials reference, source agreement/scope, required flag, freshness contract |
| `monitor_observations` | typed normalized time-series partitions, source/provider/obs/ingest timestamps, geo/station ref, quality/provenance/digest, retention |
| `monitor_assessments` | monitor/version/window/model/policy/source digests, evidence coverage, uncertainty, score (nullable), decision, trace refs |
| `monitor_alert_events` | stable episode key, state, current severity/version, source assessment refs, official warning ref, acknowledgement policy, lifecycle timestamps |
| `monitor_alert_event_history` | append-only state/severity/scope changes with actor, event order, idempotency, policy version |
| `monitor_subscriptions` | authorized recipients, geo/topic filters, notification preference refs, escalation policy ref |
| `monitor_source_health` | collection SLA/liveness, last good observation, licence/auth state, incident link to Spec 228 |

`worker_jobs`, job events/outbox, approvals, AttentionItems/Notification delivery, credits, tenant ACL, audit logs, provider secrets and R2 file ownership remain canonical where already defined. New tables use restrictive tenant/user policies, row-level authorization, no cross-tenant inference via fingerprint, and additive migrations with backfill/rollback plan. Stored immutable observations and assessments have configurable retention and deletion; required audited safety records follow approved retention policy.

Minimum indexes: `(tenant_id, owner_id, status, next_due_at)`, `(source_id, observed_at DESC, station_id)`, `(monitor_id, assessed_at DESC, blueprint_version)`, unique `(monitor_id, blueprint_version, evaluation_window, evaluator_version)`, unique `(episode_key, owner_or_subscription_scope)` and `(alert_event_id, event_version)`; actual DDL must be reconciled with deployed schema. Partition raw high-cardinality observations from low-volume monitor control records; never place raw raster blobs in relational rows.

## 15. API and event contracts

```text
POST   /api/monitors/drafts               # compile proposed Blueprint (no activation)
POST   /api/monitors/{id}/validate         # source/rights/schema/budget checks
POST   /api/monitors/{id}/replay           # bounded fixture/historical dry run
POST   /api/monitors/{id}/activate         # explicit consent + version precondition
PATCH  /api/monitors/{id}                  # proposed revision; CAS/version guard
POST   /api/monitors/{id}/pause|resume     # audited, idempotent actions
GET    /api/monitors/{id}/status           # sources, next run, last good assessment
GET    /api/monitors/{id}/assessments       # evidence-aware pagination
GET    /api/monitors/{id}/alerts           # event history, current severity
POST   /api/monitor-alerts/{event_id}/ack  # acknowledgment != hazard resolution
GET    /api/monitors/source-catalog        # authorized/verified capabilities
```

Exact routes MUST conform to the deployed API/version/CSRF/auth conventions of Specs 195/196/220/226; names above are a proposed contract, not claims of existing endpoints. Mutation calls require idempotency key, expected version and current authorization. Webhook ingress uses HMAC/signature where available, replay window, body-size/time limits, source allowlist and tenant/credential scoping.

`MonitorAlertEvent.v1` includes `(event_id, event_version, tenant_id, monitor_id, blueprint_version, source_assessment_id, priority: NORMAL|URGENT|CRITICAL, title, privacy_safe_summary, created_at, expires_at?, deep_link, collapse_key, needs_ack, policy_digest)`. Publish to Spec 225 through transactional outbox. Consumer must reconcile current canonical event before retrying late messages; severe escalation must not be overwritten by a delayed routine message.

## 16. Privacy, security, source rights and operational safety

- Personal monitoring geography/location is private by default and optional; minimize precision/retention, make history deletion/revocation possible, enforce per-tenant isolation. Do not expose the user's precise location in third-party channels unless separately authorized.
- Tool source payloads, scraped pages, CAP descriptions and files are untrusted **data**, never instructions for the agent to alter rules, approve credentials, post arbitrary alerts or extract secrets. Domain pack code is signed/reviewed; external calls are allowlisted, sandboxed and least-privilege.
- Monitor creation cannot grant itself paid provider credentials, API subscriptions, external webhook destinations, mass notification authority or use beyond contract/legal access; manual admin/tenant approval as needed.
- High-severity production changes need independently reviewed domain criteria, replay certification and rollback. No generative model may override official cancellation/update or issue fabricated official agency instructions.
- Provider outage, stale data, clock skew, regional Cloudflare incident, depleted credits, exhausted third-party API quota and unauthorized/expired credentials each have explicit degraded states, monitored by Spec 228. Credit exhaustion can never be relabeled as safe weather.
- Distinguish safety-facing *private assessment* from *public emergency warning*. Product copy must not impersonate TMD, RID or Thai official public warning channels. For life-safety use show official links and limitations, with human gate for public dissemination.
- External channels are not a secure evidence store; rich evidence and state-changing actions stay in authenticated SmartAIHub.

## 17. Observability, service-level objectives and unit economics

Instrument `collector_due_to_start`, `provider_observed_to_ingested`, `ingested_to_assessment`, `assessment_to_attention_created`, `attention_to_provider_accepted`, `provider_accepted_to_confirmed_delivery_if_available`, data staleness, source-gap rate, replay outcome, per-pack false positive/false negative where labels exist, critical missed-events, user acknowledgements, escalation storms, provider rate-limit/cost and DLQ backlog. Store explicit `no-ground-truth` and uncalibrated flags; never score prediction success from a collection-success metric.

Proposed internal SLOs for first certified flood scope (must be benchmarked, not marketed guarantees): `>=99%` planned evaluation starts within 2 minutes of due time when all required feeds are healthy; `100%` cross-tenant isolation and stale-approval rejection in all mandatory security regression tests (any confirmed violation blocks release); `p95 <=60s` from a **received authenticated official event** to successful submission to enabled first-party notification gateway where capacity allows (excludes upstream issue lag, app/device delivery and outages); critical policy transitions audit-complete. Safety correctness takes precedence over latency; define separate measurable targets for provider delay, content freshness and end-to-end actual user delivery before public launch.

Cost strategies: pool public observations, prefilter region/time before heavy analysis, run deterministic rules on each cadence, invoke LLM only on changed/high-value assessments or digest requests, reuse authorized R2/Vectorize artifacts, cap paid API and fan-out frequency, batch similar observations and choose explicit per-tenant budget. UI reveals forecast monthly range and last/current spend through Spec 207; allow user to degrade optional enrichments, but not silently discard mandatory safety evidence.

## 18. Implementation plan: staged non-disruptive activation

| Phase | Work package | Exit criterion |
|---|---|---|
| P238.0 | Inventory actual existing Alert/Attention/Reminder/Workflow/Job/approval code, DB migrations, current registry and source rights; reserve non-conflicting number | signed canonical ownership map; no older spec overwritten |
| P238.1 | Versioned Blueprint schema/compiler profile in Feature 196, typed source registry, additive PG tables, flags, simple condition pack | fake-source E2E: Chat → preview → consent → test → activate → real canonical job → Spec 225 notification |
| P238.2 | Due-index scheduler, source pooling, provenance/quality/freshness, budget, pause/resume and fail-safe states | load/chaos tests; no duplicate work or cross-tenant leak; legacy family stays active until certified cutover |
| P238.3 | Decision engine, three-level policy, hysteresis/escalation/ack, detailed Chat/Task Control UI | all transition and delivery/ack separation tests pass; source-gap alerts visible |
| P238.4 | Flood pack connectors only after individual official-access/licence verification; synthetic replay then authorized live shadow | measured lag/coverage, historical out-of-sample validation, independent domain review; public warning relay gate |
| P238.5 | Limited private production canary by geofence and source set; calibration/error budget, rollback | explicit operator/owner authorization, source/notification SLO evidence and fail-safe drill |
| P238.6 | Reusable monitored templates & Skill marketplace registration (Spec 212 integration) | isolated per-tenant provenance, signed pack/version, developer review and fair billing |

Feature flags: `monitor_blueprint_beta`, `monitor_collectors_beta`, `monitor_policy_beta`, `monitor_flood_shadow`, `monitor_flood_private_live`, `monitor_pack_publish`, `monitor_critical_notifications`. Critical must default OFF for unreviewed packs. Never enable high-consequence features solely because all unit tests pass.

## 19. Acceptance tests / certification gates

| ID | Mandatory scenario | Expected behavior |
|---|---|---|
| AT-01 | User asks ordinary time reminder | Existing reminder path used; no unnecessary monitor costs |
| AT-02 | User asks simple website uptime | Typed condition monitor; proof-of-access and budget preview |
| AT-03 | Flood request missing geography | Non-active preview; bounded map/area choice; no fabricated region |
| AT-04 | Source documented but production API inaccessible | `NEEDS_SOURCE` or narrower mode; no silent fake feed |
| AT-05 | Source permissions denied/expired | Fail-closed, visible degraded monitor, safe re-auth link |
| AT-06 | Flood required radar stale; river rising | No `ALL_CLEAR`; show data-gap and evidence-qualified escalation |
| AT-07 | Two correlated derived radar streams | Independence grouping prevents double count |
| AT-08 | Mismatched river datum/unit | Quarantine measurement; no derived flood trigger from corrupt reading |
| AT-09 | Verified severe/immediate official warning in scope | Attributed relay; cannot be downranked by model |
| AT-10 | Official warning expired/canceled | Update references and recompute, no stale relayed warning |
| AT-11 | Source data and telemetry disagree | Confidence reduced/unknown, disagreement and source timestamps shown |
| AT-12 | Uncalibrated model emits 93% confidence text | Numeric confidence rejected; qualitative evidence shown |
| AT-13 | Same upstream flood episode in 20 zones | Correct spatial/correlation grouping and limited notifications |
| AT-14 | Urgency escalates during cooldown | Immediate CRITICAL transition (under policy), old routine attempt fenced |
| AT-15 | Push delivered/opened but not acknowledged | Hazard/ack state unchanged, policy escalation still eligible |
| AT-16 | User pauses from mobile while scheduler fires | Version/lease guard prevents new evaluation; current inflight reconciled |
| AT-17 | Duplicate/reordered Cloudflare Queue messages | One canonical assessment/effect per idempotency key; no severity regression |
| AT-18 | Credit cap reached | Transparent notice and configured degradation; no fake safe assessment |
| AT-19 | Provider fails or 429; Runner offline | Retries bounded; `SOURCE_DEGRADED`, DLQ and Spec 228 infrastructure incident |
| AT-20 | Third-party source injects model/tool instructions | Content treated as data, no unauthorized egress/credential use |
| AT-21 | Cross-tenant source/geometry/notification request | Scoped denial and redacted audit; no accidental public cache exposure |
| AT-22 | User changes thresholds while critical event open | Proposed version diff, explicit activation, old event retention and deterministic migration |
| AT-23 | Wrong geometry/CRS or clock skew | Reject/quarantine affected evidence, no phantom warning zone |
| AT-24 | Local desktop switches off | Cloud-owned monitor remains active; local-only connector shows actual degradation |
| AT-25 | Restore after outage, replay delayed event | Reconcile from canonical PG state, no stale flood alert after newer official cancellation |
| AT-26 | Device OS blocks high-priority push | Gateway reports available delivery evidence; never asserts guaranteed receipt |
| AT-27 | Model upgrade improves replay but regresses rare events | Shadow gates fail, retain prior version and roll back |
| AT-28 | External public warning publication requested | Block absent authorized operator/domain policy; private assessment still available |
| AT-29 | Managed PG lacks PostGIS | Alternate precomputed geospatial implementation passes same spatial correctness fixtures |
| AT-30 | Tenant has 50k monitors for same public radar feed | Shared connector requests bounded independently of subscription count; fair scheduling |

The live flood-certification matrix SHALL include real permitted-source availability, exact upstream issue/retrieval lag, geographical/seasonal holdout validation, known historical floods and non-flood rainfall episodes, localized uncertainty and an independent reviewer. Fixture tests certify software plumbing, **not hydrological predictive skill**.

## 20. Open gates / requirements not to misrepresent as delivered

1. Verify `238` is free in canonical registry and every open worktree/PR; if occupied, reallocate all artifacts consistently rather than clobbering existing work.
2. Compare latest repository implementation of Spec 225/226 and actual current Alert infrastructure to this contract; Library drafts are design references, not production attestations.
3. Confirm primary Thai data licences, authentication, refresh, coverage and rate limits. ThaiWater's draft API specification alone does not prove a public operational endpoint.
4. Test actual provider PostGIS extension availability; if absent, certify precomputed geometry fallback instead of assuming a schema migration will work.
5. Life-safety predictive accuracy, false-negative cost, official-warning ingestion rights, and critical notification capabilities require named domain reviewers and geographic certification.
6. Confirm Cloudflare Workers/Queues/Workflows plan limits, timezone/UTC schedule and per-tenant economics for current deployed plan before broad rollout.

## 21. External standards and primary technical references (checked 2026-09-24)

- OASIS, CAP 1.2 standard: https://www.oasis-open.org/standard/cap/ ; field semantics: https://docs.oasis-open.org/emergency/cap/v1.2/pr01/CAP-v1.2-PR01.html
- WMO Common Alerting Protocol and implementation resources: https://wmo.int/site/wmo-common-alerting-protocol ; https://public.wmo.int/site/wmo-common-alerting-protocol/cap-resources
- TMD official service catalog (open API/RSS links): https://www.tmd.go.th/service/servicePage
- ThaiWater interoperability catalog (`/Rainfall`, `/Runoff`, `/LargesizedWaterResources` etc.): https://standard.thaiwater.net/ (draft documentation; verify endpoints/licence separately)
- Royal Irrigation Department official water situation and dam information: https://www.rid.go.th/th/main
- Cloudflare Workers Cron Trigger UTC execution: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Cloudflare Workflows schedule limits: https://developers.cloudflare.com/workflows/reference/limits/
- Cloudflare Queues at-least-once delivery: https://developers.cloudflare.com/queues/reference/delivery-guarantees/
- Cloudflare Hyperdrive / PlanetScale PostgreSQL connectivity (not extension guarantee): https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/planetscale-postgres/
- LINE Notify terminated on 2025-03-31; use eligible LINE Messaging API: https://developers.line.biz/en/news/2025/04/01/line-notify/
---

# Revision 1.1 — Twenty-Pass Gap Closure, Spec 212 Expansion and Formal Activation Contracts

**Normative precedence:** This section supersedes Revision 1.0 wherever requirements conflict. Existing sections 0–21 remain effective otherwise. Proposed design ≠ deployed implementation, approved source entitlement, certified hydrology, or guaranteed device delivery. The corresponding 20-pass findings/verification matrix is in `SPEC238_20_PASS_AUDIT_REPORT_v1.1.md`.

## 22.1. Repository and Spec 212 source-of-truth reconciliation

The Library-visible Spec 212 Revision 20 corpus contains **2,930** ordered bilingual identities, and its Revision 21 Spec 233 amendment adds semantic-dedup rules without a confirmed larger corpus. Rev 1.0 references to a 2,810 corpus are historical only. Candidate Spec 238 extensions propose **UC-2931…UC-3130** as a *provisional, append-only* 200-case, 20-subcategory parent category `Intelligent Monitoring & Alerts`. Before registering, inspect canonical current registry, source branch, pending PRs/worktrees and the actual Spec 212 importer. If IDs have been claimed elsewhere, reallocate the entire block deterministically and regenerate hashes; never overwrite IDs or silently modify the first 2,930 prompts. Preserve the existing prompt-only ordered `{th,en}` array, and a separate Marketplace Catalog of `{id,category,prompt:{th,en}}`. Metadata sidecar is optional. Classify each candidate against current Spec 212 (`SAME_USE_CASE`, `VARIANT`, `RELATED`, `NEW_USE_CASE`, `INSUFFICIENT_EVIDENCE`) and only mint approved genuinely distinct IDs; related generic prior watches may be offered as monitoring *Solution Variants*, not falsely claimed as novel identities. The candidate merged 3,130 file is a reproducible snapshot **not** a replacement for the actual deployed corpus.

## 22.2. Explicit operation classes and cost-aware intent routing

Feature 196 first classifies the request as `TIME_REMINDER | BASIC_CONDITION | MULTISOURCE_MONITOR | HIGH_STAKES_DECISION_SUPPORT`. If `TIME_REMINDER`, route to the existing Alert/Reminder implementation and do not allocate a sensor collector. `BASIC_CONDITION` must have a bounded truthful source and a rule. The other classes require a reviewable typed `MonitoringBlueprint`, source-health plan and explicit activation grants. An LLM-generated plan may propose but never silently provision paid sources, arbitrary web scraping, raw code execution or new notification recipients. Requesting an unsupported source produces `ACTIVATION_BLOCKER`, not a phantom provider.

## 22.3. Versioned activation transaction and side-effect isolation

`draft → validated → previewed → user-approved → active` is a server-controlled, idempotent transition. Activation binds `blueprint_digest`, `policy_digest`, `compiled_workflow_digest`, `domain_pack_digest`, `source_grant_epoch`, `recipient_grant_epoch`, `budget_policy_epoch` and an effective time. The activation path MUST validate all required dependencies within the same authoritative transaction boundary feasible for its DB and must create dispatch/outbox state atomically. The chat model's narration does not activate a monitor. Any changed requirement creates a new immutable version; old assessment/alert evidence remains linked to its original version. Risky changes require a fresh approval and cannot retroactively authorize work in flight.

## 22.4. Source legality, secret access and revocation

Each `SourceAdapter` records machine-readable `access_basis`, territorial/data-use terms, third-party redistribution rights, source owner, credentials reference, entitlement expiry, source API version, approved egress destinations and provider rate-limit evidence. Website visibility alone is not source API entitlement. Denied/revoked/expired licence or credentials immediately blocks new collection, invalidates reuse where agreement requires it, retains only legally permitted evidence, and produces `SOURCE_UNAUTHORIZED` independently from sensor degradation. Approvals are user/tenant/resource/purpose scoped and cannot be inferred from a prompt or another tenant's public monitor subscription.

## 22.5. Evidence data typing, provenance, independence and quality

Every observation has explicit `source_event_id`, `source_version`, `raw_or_derived`, `lineage_parent_refs[]`, `independence_group_id`, `observed_at`, `published_at?`, `ingested_at`, `forecast_issued_at?`, `forecast_valid_at?`, `unit`, `measurement_window`, `crs?`, `vertical_datum?`, `quality_flags[]`, `rights_profile_id`, `checksum?`, `provenance_digest`. **Missing/invalid/late measurement is not numeric zero.** The confidence/evidence coverage denominator is the required *independent* evidence families valid for the scope and horizon, not the raw number of URLs. Derived feeds sharing upstream radar data must not boost independence. Each normalized data version is immutable; corrections link parent records; out-of-window or ambiguous-time samples are quarantined.

## 22.6. Common assessment contract without fictitious numerical risk

`Assessment` contains separate `impact_severity`, `onset_urgency`, `evidence_certainty`, `coverage_state`, `source_lineage_digest`, `domain_pack_version`, `policy_version`, `evidence_refs`, `model_limitations[]`, `risk_index?` and `probability?`. Risk index is an internal uncalibrated ordinal indicator unless a reviewed domain calibration contract establishes its numeric meaning; it must never be presented as 0–100% probability. Percentage `confidence` requires an explicitly named calibration target (event × geography × lead time) and independent held-out reliability scorecards. LLM-generated explanation cannot change measured inputs, official alert status, categorical severity or approved deterministic thresholds.

## 22.7. One assessment decision, three notification levels, and independent health state

Use three user-facing levels `NORMAL`, `URGENT`, `CRITICAL` but decide by a reviewed matrix of expected impact, lead time/onset, evidence validity, vulnerability/exposure where authorized, source authority and allowed channels. This is **not** a global threshold such as `risk>=80`. `SOURCE_DEGRADED`, `SOURCE_UNAUTHORIZED`, `MODEL_UNVALIDATED`, `COST_LIMITED`, `DELIVERY_DEGRADED`, `OUTSIDE_CERTIFIED_SCOPE` are *orthogonal* service/evidence states, never fourth risk levels or evidence of safety. Every output states observed versus forecast versus verified official information. If an official severe warning applies, preserve its attributed status and relay authority even when a local model disagrees; only authenticated official update/cancel/expiry affects that official status.

## 22.8. Canonical CAP handling and authenticated provenance

When using CAP, verify publisher identity, permitted feed and retrieval chain; validate `identifier`, `sender`, `sent`, `status`, `msgType`, `scope`, `references`, geospatial area and each applicable `info` block's `urgency`, `severity`, `certainty`, `effective`/`expires`. Track canonical official-message references and updates, cancel, replay, expiry and multilanguage/overlapping regions; quarantine unsigned/untrusted or mismatched sources where trust policy demands verified transport. CAP field values remain **source-reported official metadata**, not AI-issued authority. `Critical` presentation for a verified warning is a platform routing policy subject to scope and user opt-in, not automatic impersonation of the authority.

## 22.9. Alert episode/version, cooldown and acknowledgment semantics

Canonical episode key includes hazard/subject, certified area, impacted time window, domain pack, user/tenant subscription and policy-defined correlation. Create monotonically versioned episode events and a transactional outbox. `alert-created`, `provider-accepted`, `device-confirmed-if-available`, `opened`, `acknowledged`, `resolved`, `official-cancelled` are separate facts. User acknowledgement never resolves hazard; quiet-hours may suppress NORMAL only under current preferences; URGENT/CRITICAL channel overrides require explicit revocable user consent and available provider capabilities. A higher-severity version bypasses cooldown, but replayed lower-severity messages cannot supersede it. Delivery failures must not alter risk assessment.

## 22.10. Storm safety, exact effect boundaries and unknown outcomes

System targets at-least-once dispatch **with** idempotent consumers, not exactly-once external effects. Unique keys exist for observation ingestion, assessment/window, episode transition and delivery effect; late outcomes are reconciled against durable receipts. Expensive/irreversible provider action that returns unknown must be `RECONCILIATION_REQUIRED`, not blindly retried. Use fair per-tenant queues, regional public-source pooling, source-aware backoff and bounded notification fan-out. Critical events are grouped by real correlation without collapsing unrelated regions/hazard subtypes; anti-flood throttles may not silently suppress escalation evidence. Avoid a monitor→Spec228→monitor recursive incident storm.

## 22.11. Schedule accuracy and cross-region execution fencing

Spec 232 schedules a finite UTC Cron set; per-monitor due times reside in PostgreSQL. Due claiming requires atomic conditional/leased rows with `next_due_at`, `schedule_generation`, `lease_token`, fencing and idempotency. DST and timezone changes alter only user-facing local schedule projections, not canonical UTC history. Reconcile skipped/outage windows according to domain semantics: old observations may update evidence history but may **not** emit stale imminent-hazard notifications. Poll interval must respect actually measured upstream update frequency, account entitlements, plan limitations, processor quotas and approved alert SLO. Regional outage uses a tested single authoritative fallback path, never dual writers.

## 22.12. Geospatial correctness and PostGIS fallbacks

Do not assume PostgreSQL host provides PostGIS merely because Cloudflare Hyperdrive connects to PostgreSQL. Before use, verify actual `CREATE EXTENSION` rights, spatial index compatibility, planned-region performance and audited migrations in an isolated certification environment. If absent, versioned R2 vector/raster tiles, certified fixed geometry identifiers and bounded approved GIS worker compute provide a tested fallback. A monitor's affected polygon, forecast raster, catchment topology, DEM version, vertical datum, event-time CRS transformations and population/exposure layers have explicit provenance; no unverified Zone 17 or approximate district centroids for critical location-specific warnings.

## 22.13. Regulated/high-stakes domain deployment gates

Flood/physical safety, medicine, cybersecurity containment, finance/trading and legal-regulatory conclusions require domain risk profiles. Fixture/test deployments can demonstrate orchestration without justifying production high-stakes thresholds. A pack declares its permitted subjects, geographic/tenant scope, lead-time window, supported observation sources and autonomous-action policy. High-impact public dissemination and irreversible actions require human authorization or separate legal entitlement. The product must not impersonate an authority, recommend unsourced evacuation, autonomously diagnose or place trades based on a generic LLM narrative.

## 22.14. Model and threshold changes, calibration and shadow rollouts

For each domain pack/model/threshold/policy version, store immutable evaluator digest, training data limitations, hold-out definition, forecast horizon, calibration target, slices with false-negative/false-positive/lead-time performance and an independent reviewer. No ground truth means `UNCALIBRATED` and shadow mode, not invented accuracy. Upgrade candidate must replay baseline + rare-event fixtures, run shadow alongside frozen baseline and pass non-regression gates before staged opt-in. Spec 222 may propose improvements but cannot activate a life-safety threshold change autonomously.

## 22.15. Delivery assurance without impossible guarantees

Spec 225 is the **only** Notification Gateway and Attention source of truth. Define measurable steps `assessment_ready → outbox_committed → gateway_accepted → provider_accepted → device_delivery_confirmed_if_available → opened → acknowledged`; provider acceptance is not delivery to a handset. Introduce synthetic canary recipient(s), delivery dead-letter/degraded Attention and user-visible warnings when critical channel coverage is unavailable. For time-critical watches, ensure at least one available selected path or block claiming the monitor is fully protected; alternate e-mail/LINE/Telegram routes require verified configured entitlement and explicit consent. Never promise that a disconnected phone, muted OS or disabled browser push will receive a message.

## 22.16. Budget exhaustion and safety-preserving degradation

Cost preview separately itemizes upstream API fees, collector frequency, geospatial compute, inference, retained evidence, paid notifications and expected fan-out. Spec 207 owns quotes, reservations, settlement and refunds. `COST_LIMITED` reduces permitted optional enrichment only; it must not silently disable mandatory evidence then publish an all-clear. If essential source or delivery cannot be funded, enter visible `PAUSED_BUDGET`/`DEGRADED_COVERAGE`, display the last trustworthy observation timestamp and notify through preauthorized low-cost channels where available. Critical quota overrides are **not** unlimited spending permission; use a separately authorized reserve/budget policy and safety stop.

## 22.17. Privacy, recipient consent and cache inference protection

Personal location and monitored entities default private; store coarse geography where sufficient, encrypt authorized fine-grained scope, scope R2 and observation metadata by lawful access tier and retention, prevent membership inference via shared public-cache keys, and restrict external notification previews. An organization may not add an employee, family member or emergency contact as a high-frequency recipient without approved consent/policy. Revocation cancels not-yet-started jobs, prevents future notification and access, and drives legally permissible derived-data retention/purge. Admin dashboards show aggregation/redaction by default with audited break-glass where authorized.

## 22.18. Source ingestion, webhook and AI security hardening

All external bytes are untrusted input. Enforce adapter allowlist/deny private-network SSRF, redirect revalidation, DNS rebinding checks, content-type/size/decompression limits, malicious-file quarantine, XML entity restrictions on CAP parsing, signed webhook/HMAC where provided, nonce/timestamp replay window and provider-specific secret rotation. Do not execute generated JS/Python from a chat prompt in the cloud monitoring evaluator; unreviewed plugins remain sandbox-only and cannot invoke privileged Tool endpoints. Per-tenant subscriptions and webhook feedback require verified, purpose-bound ownership.

## 22.19. Data lifecycle, operations, recovery and user-visible limitations

Publish explicit retention classes for original permitted bytes, normalized observations, model assessments, alert/correction history and delivery receipts. Legal holds, deletion requests, and licence expiry are separate from user subscription archival; evidence references must never dangle silently after expiry. Operations dashboard separates collection health from actual alert quality. DR procedures test PG state restore, outbox cursor reconciliation, source replay without stale outgoing effects, re-authorization of restored grants and read-only safe degraded fallback. Show latest *last-good* measurement alongside current source outage; unknown is never displayed as a low-risk green status.

## 22.20. Product/Marketplace integration and independent release evidence

Preserve the Spec 212 design/corpus baseline; publish a candidate **new parent category** via separate prompt-only and catalog append files only after its runtime owner is verified, then resolve semantic overlaps and current ID registry. Use independent black-box tests that originate in Feature 196 Chat, construct real Spec 214 manifests via Spec 209, compile and run Spec 215, persist all durable work under Feature 195, create Spec 238 evidence/policy events and reach Spec 225 through its existing outbox/gateway. Require a verifier different from the builder/LLM; include TH/EN parity, non-life-safety and flood fixture variants, degraded data, false positives/negatives, user correction and tenant isolation. No domain pack or template becomes `CERTIFIED` solely from prompt plausibility or generated tests.

## 23. Additive acceptance tests AT-31…AT-50

| ID | Revision 1.1 mandatory test | Required outcome |
|---|---|---|
| AT-31 | Latest Spec 212 already allocated UC-2931 | Stop import and reallocate append block; original corpus unchanged |
| AT-32 | Candidate semantics overlap existing generic price/flight watches | Mark RELATED/VARIANT; mint only independently approved NEW_USE_CASE identities |
| AT-33 | Draft attempts auto-grant webhook, pay for an API or add recipient | Preview + blocker; never autonomous effect or grant |
| AT-34 | Activation races a policy edit and source-grant revocation | CAS/epoch check rejects stale activation and stops new source jobs |
| AT-35 | Derived feeds share primary upstream gauge/radar | Evidence counts one independence family; no synthetic confidence boost |
| AT-36 | Missing rainfall sample serialized as zero | Reject and preserve MISSING; no false reassuring assessment |
| AT-37 | CAP update/cancel/expiry arrives late after an AI lower score | Authenticated official version remains authoritative and properly reconciles |
| AT-38 | Old NORMAL outbox delivered after CRITICAL | Current canonical episode version wins; no downgrade or misleading lock-screen preview |
| AT-39 | Cross-tenant public-source pooling with different private geofences | Same public reading reused; membership, location and alert metadata isolated |
| AT-40 | Queue redelivery after unknown paid third-party send | Reconcile external receipt; never blind double-send/charge |
| AT-41 | UTC scheduler runs across DST/overlap and region outage | One fenced job; due history stable; no replay of expired imminent alerts |
| AT-42 | Managed PG provider lacks PostGIS or CREATE EXTENSION | Identical fixed geometry fixture passes certified GIS-worker fallback |
| AT-43 | Uncalibrated model emits 93% probability and CRITICAL threshold suggestion | Numeric probability withheld and critical activation review-blocked |
| AT-44 | Critical channel has provider acceptance but muted device | UI shows acceptance only; not claimed device delivery or user acknowledgment |
| AT-45 | Credit cap exhausted during active flood watch | Visible coverage degradation; no fabricated all-clear or unlimited charge |
| AT-46 | Third-party content embeds network URL redirect or XML entity payload | Prevent SSRF/XXE; quarantine source; no privilege expansion |
| AT-47 | Revoked recipient, personal location or source licence | No new collection/delivery; enforce retention/grant invalidation |
| AT-48 | PG disaster restore replays old outbox after official cancellation | Canonical sequence reconciled; no stale hazard broadcast |
| AT-49 | New model wins average replay but misses rare flood episode | Fails non-regression/shadow gate; old certified version remains active |
| AT-50 | 200 appended bilingual candidate cases imported with wrong baseline/hash | Append blocked; TH/EN parity, count, file digests and first 2,930 identities verified |

**Required release states:** `DESIGN_COMPLETE` after document/schema/fixture static validation; `IMPLEMENTATION_READY` only after source-code/registry/schema inventory and owner signoff; `CERTIFIED_NON_LIFE_SAFETY` after real end-to-end evidence; `FLOOD_SHADOW` after permitted live inputs and domain replay; `FLOOD_PRIVATE_LIVE` only after independent region/horizon/source certification and opted-in user policy. There is no implicit path from file audit to production safety certification.

## 24. API/schema/artifact addition

Provide the accompanying strict conceptual JSON Schemas `monitor-blueprint-v1.1.schema.json`, `monitor-assessment-v1.1.schema.json` and `monitor-alert-event-v1.1.schema.json`. They define version/epoch/evidence semantics but are still **candidate wire contracts**, not production migrations. Bind field names to the real deployed Feature 196/195/225 interfaces in P238.0 before code generation. The schema uses intentionally bounded enums and forbids extra fields in narrow alert/output contracts; compatibility needs explicit schema-version negotiation. Schema validation alone does not confer rights to a source or permission to notify a recipient.

## 25. Independent 20-pass review and non-closed deployment blockers

See `SPEC238_20_PASS_AUDIT_REPORT_v1.1.md` for each finding, closure in Rev 1.1 and test requirement. Open **external** gates remain: live repository/Spec number and UC registry; actual deployed Alert/Notification Gateway and migration journal, Spec 224 economic certification; legal source/data access; PostGIS provider extension confirmation; calibrated domain performance; approved domain reviewer; subscribed device/channel delivery checks. These are not document defects that can be declared closed by drafting additional text.

# Revision 1.2 — Twelve-Pass Residual-Gap Closure (normative)

**Reviewed:** 2026-09-24. **Scope:** Spec 238 v1.1, Flood Domain Pack v1.1, Cross-Spec Impact v1.1, v1.1 candidate wire schemas, and the existing Spec 212 200-case monitoring extension. **Status:** design/document/schema validation only. **Normative precedence:** Rev 1.2 takes precedence where older language or example contracts conflict. Rev 1.1 requirements otherwise remain in force. No new execution authority, Notification Gateway, Agent, Node Type, economic ledger, production database migration, Spec 212 Use Case identity or claim of live hydrological certification is created by this revision.

## 26.1 — Event intent is distinct from hazard severity and monitoring health (PASS 01)

`Assessment`, `MonitorHealthEvent`, `OfficialWarning`, `AlertEpisode` and `MonitorAlertEvent` have separate canonical identities. **Alert purpose** (`HAZARD | CONDITION | OFFICIAL_RELAY | SOURCE_HEALTH | CORRECTION`) is NOT the same field as **delivery priority** (`NORMAL | URGENT | CRITICAL`); a critical failure to observe a required river gauge is an urgent *monitoring failure*, **not** proof of a critical flood. A hazard event requires an independent valid assessment and domain-policy decision; health events reference a source/evaluation health assessment and shall be styled differently, including on small-screen notifications. `CORRECTION` is a purpose/action referencing a previously issued notification and cannot silently overwrite historical evidence. Dashboard/aggregates must never group health failures as actual flood detections. An uncalibrated model cannot generate a production percentage, and a `DATA_GAP` assessment cannot become `ALL_CLEAR` from fallback defaults. The API adapter must transform these typed purposes to deployed Spec 225 message categories without creating an additional attention database.

## 26.2 — CAP message status, distribution scope and issuer trust gates (PASS 02)

Before relaying any purported official CAP warning, verify `status=Actual`, `scope=Public` or an explicitly licensed authorized scope, authenticated issuer/feed identity, intended area/altitude, valid effective/onset/expiry window, full `(sender,identifier,sent)` triplet, source sequence, `msgType`, `references` and every relevant `info`/language block. A CAP `Test`, `Exercise`, `Draft` or `System` message is **not** a public real-hazard alert; it stays quarantined or in an explicitly labeled operator test surface and must never enter live recipient delivery. `Restricted`/`Private` CAP data must be distributed only within separately documented authority, recipient and licence constraints, not to public monitor subscribers. `Ack`/`Error` are control messages, not fresh hazard detections. `Update`/`Cancel` must link to an authenticated prior message from the authorized issuer; a mismatched reference or unauthorized sender is quarantined and surfaced to source health, not silently applied. Conflicting signed notices from different issuers remain separately attributed; do not let an LLM synthesize issuer authority. Domain-approved advisory feeds without CAP use an equivalent verified issuer/scope/lifecycle mapping and must not be represented as CAP.

## 26.3 — Retraction, correction and material-change propagation (PASS 03)

SmartAIHub-originated predictions and measurements can be wrong or superseded even without an official `Cancel`. Add an immutable `CORRECTION` event and `RETRACT` action referencing original `episode_key`, `event_id`, `event_version`, reason and superseding evidence. A correction must reach the originally targeted consenting recipients **who were actually attempted** (using Spec 225 delivery-attempt records), where their current consent permits delivery; revoked recipients are suppressed with an audited privacy-safe reason. If the original provider attempt has an unknown outcome, use the existing unknown-effect reconciliation and a bounded corrective message rather than presuming nobody saw it or blindly duplicating delivery. Correction text identifies whether the claim is disproven, merely revised, or data is too degraded to maintain it; a missing reading is not a claim that the hazard has ended. Queued stale notifications must be fenced against the current episode version immediately before provider send. Where provider recall is unsupported, **never claim to unsend** an already-delivered notification. Resolved monitor events and official issuer cancellations are separate facts; neither implies the other.

## 26.4 — Per-recipient consent, on-call ownership and acknowledgement quorum (PASS 04)

An `ACK` belongs to `(recipient_id, event_version, consent/grant_epoch, acknowledged_at, authenticated_actor)`, not the entire hazard episode. Organizational delivery policies define explicit escalation owner, optional rota snapshot, recipient role, timeouts, quorum (`ANY | ALL | NAMED_ROLES`) and maximum fan-out. User personal monitors default to `SELF_ONLY`, no auto-added family, staff or authorities. A recipient may acknowledge their own delivery without marking every recipient or the underlying hazard resolved. Acknowledging an older event version cannot approve an unseen higher-severity version. When staff rotations change while the episode is active, newly eligible staff receive a versioned handoff only within current authorization; never spray old private location details to a replacement outside scope. External destinations need separate consent and unsubscribe/revoke handling. Spec 225 remains owner of delivery attempts and Attention state; Spec 238 owns only its domain acknowledgement policy metadata.

## 26.5 — End-to-end data-age and decision lead-time budgets (PASS 05)

For each hazard/region/horizon, store source observation time, upstream publication lag, retrieval lag, normalization/evaluation lag, queued notification lag, predicted onset window and applicable required-evidence maximum age. `freshness_slo` based solely on **fetch time** is insufficient: a recently downloaded image of yesterday's radar is stale. An assessment's `observed_cutoff_at` cannot be later than its actual validated observations; forecast issue time must not be mistaken for forecast valid time. Domain certification defines a maximum defensible evaluation age and a minimum practical lead time. If credible time-to-impact has already elapsed, a model must not generate a confident prospective “2-hour advance warning”; label ongoing/late event, disclose source age and prioritize any actual official current guidance. Shadow qualification measures end-to-end observation-to-user-notification where receipts exist, not just algorithm runtime. This contract also applies to rate-of-rise when sampling interval is irregular.

## 26.6 — Reserved critical capacity, backpressure and finite DLQ recovery (PASS 06)

Normal polls, historical catch-up, inference enrichment and digests may be delayed/shed **before** verified relevant official relays or certified high-priority evaluation work. Allocate bounded tenant-fair critical admission and outbox capacity; use a reserved high-priority route only inside existing Feature 195/Spec 232 ownership, with strict per-tenant anti-abuse and verified eligibility. CRITICAL cannot be inferred from arbitrary user text to bypass admission. Preserve priority through collector/evaluation/outbox/gateway handoff, but avoid starving the evidence collection needed to decide whether a critical alert is warranted. For critical jobs, overdue thresholds, delivery attempt age, dead-letter ingress and source-age metrics require independent alerts. Cloudflare Queue DLQ contents are **not** the durable business record: reconciliation always starts from PostgreSQL canonical job/outbox state; retention expiry in a DLQ must not lose undelivered critical work. Do not promise a delivery deadline without load/chaos results and real provider receipts. Test outage duration beyond queue/DLQ retention, degraded provider and mass-recovery stampede with priority inversion.

## 26.7 — Correlated storms, independently actionable hazards and feedback isolation (PASS 07)

A shared meteorological event may affect multiple locations, but one push per station wastes attention and one collapsed message for separate flash-flood/river/coastal hazards can hide divergent actions. Group by authenticated hazard identity **plus** actionable geography, hazard subtype, lead-time window, version and compatible user preferences, not spatial overlap alone. Shared public collection must not produce cross-tenant exposure through cache keys, existence checks, counts, billing statements, side-channel timings or debugging traces. A user correcting their local flood event cannot alter another tenant's source truth or an official notice. Users may mute repeated low-severity updates; a verified severe material escalation still follows their separately authorized critical route. Apply maximum per-event update cadence and a materiality gate, with separate corrective traffic budget so correction is never suppressed by routine cooldown.

## 26.8 — Explainability must be traceable to an immutable evidence snapshot (PASS 08)

For every human-readable high-consequence claim (e.g., “upstream water rose 37 cm in one hour”), retain normalized value, unit, source/station identifier, observation/valid window, quality and independence group, estimator/model digest, immutable snapshot manifest digest, transformation chain and citation/deep-link target where rights permit. Explanations may be localized by an LLM but MUST be rendered from an allowlisted structured `ClaimLedger` and checked for source/value/units/temporal consistency before delivery; hallucinated numbers are a release-blocking failure. A risk contributor chart must reconcile with approved scoring rules or explicitly label qualitative contribution, never add up fictional percentages. Store immutable episode-to-assessment-to-source hashes and a privacy/retention-safe disclosure path; where raw bytes legally expire, keep only legally permitted audit metadata and show evidence availability limitation. Reproducibility compares exact frozen evaluator/policy/config and excludes nondeterministic LLM prose from the hazard decision.

## 26.9 — Monitor validity window, ownership transfer and deletion cutover (PASS 09)

A monitor subscription may have `active_from`, `active_until`, configurable expiry notification, explicit owner, current consent epochs and approved reauthorization window. On expiry, revocation or deletion, increment `monitor_generation` and fence **all** new scheduler claims and pending provider sends; in-flight external unknown outcomes remain reconciled and auditable without resuming alerts to revoked recipients. `PAUSED`, `EXPIRED`, `DELETED`, `SOURCE_DEGRADED`, `COST_LIMITED` and `PENDING_REAUTH` are distinct operational projections; expiry must not mean `ALL_CLEAR`. Ownership transfers require current owner authorization, recipient reconsent, new source-rights review and fresh budget authority; no cross-tenant silent transfer. Shared public observations can remain cached only under their separate rights/retention basis, without retaining a deleted user's private area membership. Due-cursor compaction cannot delete legally required episode/delivery audit records.

## 26.10 — Safety circuit breakers, drill integrity and rollback signaling (PASS 10)

Provide independently permissioned per-domain, per-region, per-model and per-channel kill switches with audited actor/reason/epoch, on-call runbook and automatic owner/user transparency. Emergency disable of unreliable *AI predictive* outputs must leave verified permitted official relays and existing basic reminders unaffected unless their own authenticated feed or delivery route is compromised. If a compromised official source is disabled, clearly indicate that official relay protection is unavailable instead of impersonating the agency or showing green. Dry-run, fixture, shadow and `CAP Test/Exercise` must be cryptographically/structurally isolated from live outbox destinations; toggling a UI test badge cannot authorize a real send. Production publish path requires a server-side environment grant and approved distribution profile; replay/drill jobs can write synthetic inbox receipts only to dedicated test principals. Rollback fences active workers first, audits stranded work and sends an appropriate degradation update to currently subscribed eligible users.

## 26.11 — Onboarding and app UX: uncertainty, accessibility, and offline truth (PASS 11)

The Chat preview and mobile/desktop Monitor Center must present **(a)** currently monitored geography/subject, **(b)** sources available vs unavailable and last actual source observation, **(c)** assessed uncertainty and certified coverage, **(d)** user-selected alert/quiet-hours/ack path, **(e)** budget and operational expiry and **(f)** official versus proprietary prediction status. Use bilingual Thai/English text, absolute dates with IANA timezone plus UTC in evidence detail, accessible non-color urgency/status markers, readable mobile chart alternatives and attribution/limitations suitable for a lock screen. After an offline open, deep-link to the **current** canonical event and indicate “superseded/corrected/expired” rather than displaying a cached now-false warning. If no device-delivery receipt exists, UI says provider accepted/unknown, not “received.” Distinguish `SOURCE_HEALTH URGENT` from `HAZARD URGENT` visibly to non-expert users.

## 26.12 — Implemented-spec compatibility and provenance of certification (PASS 12)

Rev 1.2 is an **additive proposal** for a new Spec 238 module. Do not rewrite the Spec 212 design/corpus baseline, Feature 195/196, or in-progress Spec 224; only use signed/in-repo integration contracts after actual code/registry/migration discovery. No new speculative Node Types merely to execute a benchmark: use Spec 214 manifests actually found and Spec 215 compiler; a missing runtime/connector becomes a capability gap. Keep the existing 200 candidate monitoring Use Cases, UC-2931…3130, **unchanged and provisional**, pending the exact deployed registry and semantic review. Do not inflate the 2,930 baseline, imply all 200 genuinely novel, or alter its earlier rows. Every release certificate names the specific build SHA, schema digest, source/issuer rights, region/horizon, effective policy/pack digest, reviewer distinct from builder, replay dataset slice, test outcomes, real end-to-end channel receipts, rollback and expiry. Fixture/schema success is `DESIGN_VALIDATED`, never `FLOOD_PRIVATE_LIVE` or an official public-warning right.

## 27 — Additive acceptance tests AT-51…AT-62

| ID | New mandatory scenario | Expected result |
|---|---|---|
| AT-51 | Required river telemetry becomes stale while a partial radar signal suggests risk | A `SOURCE_HEALTH` notice is visibly not a flood detection, and `HAZARD` cannot report all-clear without required evidence. |
| AT-52 | Verified CAP feed returns `Test`, `Exercise`, `Draft`, `System`, or `Private` message; forged `Cancel` references valid alert | No real public relay; test/private/quarantined routing, issuer/scope/ref validation, active official alert not silently canceled. |
| AT-53 | Provider accepted an AI flood warning; subsequent evidence refutes it after unknown delivery outcome | Immutable linked `CORRECTION/RETRACT`, targeting eligible originally attempted recipients via reconciled delivery attempts; no claim of provider recall. |
| AT-54 | One team member acknowledges `URGENT` v1, rota changes, then `CRITICAL` v2 arrives | Group ACK/quorum and individual consent respected; old ACK cannot satisfy v2; replacement recipient receives only authorized current handoff. |
| AT-55 | Recently fetched upstream data is 4h old; model predicts impact 30m ago | Event marked stale/ongoing or late, no claimed future lead time; actual source observation vs receipt timestamps visible. |
| AT-56 | 50,000 routine monitors contend with verified relevant critical relay, followed by Queue+DLQ retention expiry | Reserved fair priority and PostgreSQL-outbox reconciliation protect critical work; no stale immediate blast after recovery; no invented delivery guarantee. |
| AT-57 | One storm crosses two districts but flash-flood and tidal impact demand different actions; two tenants subscribe | Safe correlation reduces noise without suppressing a distinct actionable hazard or leaking tenant geofence membership. |
| AT-58 | LLM writes a convincing risk summary using a fabricated 131mm rainfall figure absent from evidence | Output rejected by `ClaimLedger` verifier; frozen evidence snapshot and legal-retention caveat preserved. |
| AT-59 | Monitor expires during scheduler claim; user deletes account during pending LINE send; ownership transfer requested | Epoch-fenced claims/sends, lawful retention and verified reconsent; none interpreted as hazard all-clear. |
| AT-60 | Operator activates kill switch during active AI warning while an authenticated official alert persists; shadow CAP Test arrives | Predictive path stops with visible degraded status; authorized official relay remains separate; synthetic/test payload cannot escape to live recipient. |
| AT-61 | Offline mobile opens old CRITICAL notification after linked correction; local timezone/locale differs | Fresh version fetch shows correction and exact observation time; accessible bilingual distinctions; no false delivered/ack claims. |
| AT-62 | CI validates fixtures and 200 use cases while registry or source entitlement is unavailable | Design-only status; production promotion and canonical UC import blocked until independent exact-version receipts. |

**Release severity:** AT-52, AT-53, AT-54, AT-55, AT-56, AT-58, AT-59, AT-60 and AT-62 are hard blocking for any high-stakes deployment in their applicable scope. No passing document/static check substitutes for real adversarial/chaos tests, channel entitlement, issuer authorization or hydrological skill assessment.

## 28 — v1.2 candidate wire contracts and compatibility

Provide `monitor-blueprint-v1.2.schema.json`, `monitor-assessment-v1.2.schema.json`, `monitor-alert-event-v1.2.schema.json` and synthetic validation fixtures. Preserve the v1.1 JSON files for historical compatibility. The new contracts add strict purpose/action/env separation and snapshot/correction metadata; consumers must negotiate `schema_version`, reject unknown enums and use an explicit audited v1.1→v1.2 adapter without synthesizing missing approval, issuer or evidence fields. A schema-valid `official_verification_ref` **does not prove issuer authenticity**; a runtime signed-trust registry and applicable scope validation are mandatory. A schema-valid `calibration_ref` does not prove scientific calibration; it must resolve to a current independently approved region/horizon certificate. The emitted `MonitorAlertEvent` remains a **source event for existing Spec 225**, never a second push provider or per-user notification ledger.

## 29 — Release and non-closed dependencies

Independent owner checks before code/DDL: current SmartSpecPro registry/main/PR/worktrees; deployed Alert/Attention/Job/approval/Spec 212 importer; actual DB journal (Spec 224 in progress); tenant and provider source licences; actual Thai agency authenticated feed and CAP scope; enabled recipient/provider accounts; Cloudflare plan quotas, real Queue/DLQ retention and load; managed PostgreSQL/PostGIS extension rights; domain reviewer and region/horizon model replay. Freeze the new v1.2 schema only after those adapters are reconciled. Normal reminders and existing alerts must continue unchanged with all new feature flags OFF. Do not auto-disable live official warnings because a predictive model or billing API failed, but never promise their delivery when the official feed or approved channel is unavailable.

**Standards anchors (documentation, not runtime evidence):** OASIS CAP 1.2 https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2.html ; Cloudflare Cron UTC behavior https://developers.cloudflare.com/workers/configuration/cron-triggers/ ; Cloudflare Queues DLQ retention caveats https://developers.cloudflare.com/queues/configuration/dead-letter-queues/ .

---

# Revision 1.3 — Twelve Further Cross-Cutting Gap Closures (normative)

**Effective as a design addendum:** 2026-09-24. The following sections supersede conflicting v1.0–v1.2 design details but do **not** claim deployed interfaces, current provider credentials, a new runtime, an authorized government relay, or hydrological certification. Existing `worker_jobs` (Feature 195), Spec 215 Workflow, Spec 225 notification, Spec 220 authorization and Spec 207 economics remain the sole respective authorities. Proposed v1.3 schemas are a separately versioned candidate wire profile; v1.2 consumers require reviewed migration/adapters rather than implicit acceptance.

## 30.1 — Retroactive provider corrections and source-revision dependency index (review R01)

A sensor/provider can revise an observation **after** it drove an alert. Each admissible normalized sample SHALL have `(source_id, provider_record_id, provider_revision/ref, observed_at, ingested_at, immutable_payload_digest, supersedes_record_ref?, quality_state, licence_profile)`; changing raw values is never an in-place overwrite. A bounded dependency index from `source revision → evidence snapshot → assessment → alert episode/version → attempted recipients` SHALL make corrected/backfilled evidence discoverable. Where licensing forbids raw retention, keep only allowed revision identifiers/digests and conspicuous evidence limits. On correction, compute affected windows/regions, replay through exact frozen model/policy where scientifically possible, re-evaluate present impact using *current* approved model separately, then `UPDATE`, `CORRECT`, `RETRACT`, or `UNKNOWN` as warranted. A backfill never automatically blasts stale historical hazard notifications; material historical corrections must be visible in authenticated incident history and sent to originally attempted, currently authorized recipients when policy warrants. Signed source revision is *source evidence*, not authority to bypass current notification consent.

## 30.2 — Event-time windows, bounded lateness and immutable watermarks (review R02)

Differentiate observation event-time, provider publication/issue-time, fetch-time, normalization-time, assessment-time and gateway submission-time. Every domain/source contract SHALL define a bounded `allowed_lateness_seconds` and `future_clock_skew_seconds`, with a source-scoped monotonic **accepted watermark** and explicit reopening policy. A late sample may improve a historical replay but must not silently overwrite a more current source window, reduce an active warning, or claim newly available advance notice. Duplicate/out-of-order webhook messages and delayed provider `Update`/`Cancel` go through source revision/order checks; unorderable conflicts become `SOURCE_DISPUTED` and are referred to domain review. Ingest parser distinguishes accumulated interval from instantaneous sampling and validates real interval endpoints before any rate-of-rise metric. The dispatcher checks actionable lead time against source observation and **actual dispatch timestamp**, never against a convenient ingestion timestamp.

## 30.3 — Calendar semantics, DST and due-job identity (review R03)

Cloudflare Cron is a bounded UTC **sweep trigger**, not one user Cron per monitor; PostgreSQL stores the canonical intended UTC due instant. For wall-clock schedules the Blueprint SHALL pin IANA timezone and a reviewed policy for nonexistent DST local times (`SKIP` or `NEXT_VALID`) and repeated DST local times (`FIRST_ONLY` or `BOTH`), plus tzdb-version audit. Each due attempt has a stable idempotency key `(monitor_id, generation, blueprint_version, intended_due_at_utc, due_kind)` and a unique PG claim with lease/fence. Catch-up `HISTORY_ONLY` never resends a missed actionable alert as current; any new live decision requires a **fresh assessment**. Repeated schedule sweeps, leap-day, DST and future timezone database revisions need deterministic fixtures; wall-clock clock drift must not mint two live evaluations of the same logical due.

## 30.4 — Disaster recovery, restored revocations and split-brain admission (review R04)

A restored stale database image, stale outbox or restarted regional Worker must not resurrect a deleted monitor, revoked location/recipient grant, expired source rights or disabled predictive model. Keep one canonical PG execution/authorization owner. After failover or point-in-time recovery, enter `RECOVERY_RECONCILIATION_REQUIRED`: reconcile current signed deployment/owner checkpoint and monotonic revocation/kill-switch evidence against recovered PG epochs **before** admitting production sends. If a trustworthy non-rolled-back checkpoint is unavailable, fail closed, page the authorized operator, expose coverage outage and require fresh reauthorization; do not manufacture a second execution or credential authority to solve recovery. Partitioned regions must not each own active leases; fencing is checked at final Spec 225 send. Compare outbox/provider attempts using existing 195/225 receipts before replay; unknown external outcomes require reconciliation, not blind retry. RTO/RPO targets and data-loss caveats are per-domain and measured in drills.

## 30.5 — Network fetch, inbound webhook and decompression safety (review R05)

The natural-language source suggestion is never an executable network destination. Source ingestion requires an admin-reviewed SourceAdapter manifest, per-tenant/per-credential allowed destinations and egress policy. Enforce URL scheme allowlist, hostname allowlist, DNS/IP checking *on each connection and redirect*, private/link-local/metadata address protection, bounded redirect depth, TLS validation, response/decompression byte caps, parser nesting limits, CPU timeouts and per-source budget. XML/CAP parsing disables external entities, DTD/network inclusion and unsafe file references. Authenticated webhooks require sender/signature verification, replay nonce/event ID, bounded request sizes and quarantine before effects. Tool/LLM-extracted URLs or untrusted Markdown links are **never** trusted source adapter permissions. Adapters that require approved private internal services use an isolated, separately authorized private path rather than a blanket SSRF exception. 

## 30.6 — Outbound alert abuse, destination ownership and trustworthy UI (review R06)

A tenant or public Mini App creator must not repurpose Critical notification fan-out to send spam, phishing, impersonated authority notices or unreviewed mass messages. Treat a monitor's source output as untrusted **data**; compose channel output only from verified allowlisted `ClaimLedger` facts plus reviewed templates and authenticated deep links. Existing Spec 225 enforces per-destination proof of control, first/third-party consent, allowed channel classes, unsubscribe/revocation, finite per-tenant and per-destination attempt quotas, abuse/anomaly limits, approved critical opt-in and deliverability monitoring. Priority/critical status comes from approved *domain policy*, not user text, a Marketplace creator's label or a forged CAP severity field. A legitimate private severe alert may bypass the **routine** quota only under a distinct finite safety budget and the same recipient consent; disabled/unauthorized channels are never forced open. A domain pack may *cite* a verified government warning but must never brand SmartAIHub as that government issuer.

## 30.7 — Observe/notify boundary vs consequential physical or financial actions (review R07)

Spec 238 outputs observations, assessments and alerts only. It SHALL NOT automatically trigger reservoir releases, industrial controls, door locks, emergency calls, medicine dosage, trades, emergency evacuations or government/public warning publication from a monitor evaluation. If a user requests consequential automation, Feature 196 must produce a **separate** explicit action proposal through existing Spec 220 approval / Spec 215 workflow, with target-specific verified capability, operator policy, fresh independent precondition, physical/manual stop path, and unknown-effect reconciliation. An accepted alert, a clicked acknowledgement, a high score or a Marketplace-template install never counts as action approval. The default `action_boundary` contract is `NOTIFY_ONLY`, with `SEPARATE_APPROVED_WORKFLOW_REQUIRED` for any requested effects.

## 30.8 — Domain-pack provenance, signed dependencies and reversible rollout (review R08)

Compiled source adapters, hydrological pack, normalizers, model weights/config and safety policy SHALL have immutable digests and a reproducible dependency manifest (SBOM or equivalent). Production pack eligibility needs reviewed maintainer/signature, supported provenance, scanned/sandboxed dependencies, pinned version, source rights and per-environment promotion certificate. Loading a signed Marketplace listing alone never authorizes arbitrary code execution. A discovered compromised dependency or expired maintainer key quarantines new active evaluations of affected pack versions; applicable independently verified official relay routes remain separately operable. Scope a kill switch to pack digest, region and model, preserve affected-episode evidence, notify active subscribers of any coverage loss, and require an independently reviewed rollback version. No dynamic install of an LLM-proposed package at runtime.

## 30.9 — Drift and changing source topology after certification (review R09)

Flood science approval is not permanent. Each domain certificate pins basins/geometry, lead-time horizon, source stations and network topology, station datum revisions, model and calibration cohort (season, rare events) and expected data distribution. Continuously measure missing-event/false-negative evidence *when independent labels exist*, changed station metadata, sensor-network drift, source distribution shifts and calibration reliability; absent labels show `NOT_MEASURABLE`, never claim recall. A material distribution change, altered source lineage or OOD state moves the **affected predictive scope** into shadow/qualified observation or authorized official-only mode; there is no silent self-learning threshold promotion by Spec 222. Re-entry requires new domain review and event-based holdout + timing tests. Preserve reliable portions of an unaffected region rather than disabling every tenant when a single basin is invalid.

## 30.10 — Geofence revision, moving recipients and boundary uncertainty (review R10)

Static selected districts, optional personal addresses and optional moving-device locations have distinct consent, precision, retention and rights. A live device location is never assumed current because a cached coordinate exists; bind its observation time, accuracy radius, permission epoch and TTL. Evaluating CAP polygon, watershed or alert boundary requires certified geometry/datum and appropriate uncertainty buffer: an uncertain borderline match must be labeled `AREA_UNCERTAIN` and cannot masquerade as safe or guarantee precise local impact. On user polygon edit, project transfer or mobile-location permission revocation, increment `geofence_revision` with monitor generation where needed, invalidate pending scoped sends, rerun subscriptions/recipient eligibility and minimize exposed private locations. Shared public observations never reveal subscribers' home geofences through shared cache keys or analytics.

## 30.11 — Silent delivery black holes and human response readiness (review R11)

`provider accepted`, `notification posted` and `device received/read` remain distinct. Add a per-region/channel synthetic heartbeat and outage-detection profile that does not generate live danger content or bypass current user consent; alert operators of stalled outbox, expired provider token, repeated unknown outcomes and missing critical-lane capacity. For applicable high-stakes profiles require a staffed on-call route, escalation owner, documented maximum allowed acknowledgement/delivery uncertainty, provider outage runbook and a visible `DELIVERY_DEGRADED` status. Exhausting all opted-in destinations triggers an operations coverage-loss incident, not fabricated acknowledgement or unsupported telecom escalation. Late retry after `expires_at` or a superseding episode must be suppressed or reframed as an explicit historical correction under approved policy. A green last-send metric never implies user/device receipt.

## 30.12 — Semantic invariants beyond JSON Schema and fail-closed bridge (review R12)

The three candidate v1.3 JSON Schemas SHALL reject structurally inconsistent event-kind/actions, require a revision/time policy profile, and carry required **linkage** across Blueprint/Assessment/Alert. A mandatory independent runtime `MonitorSemanticValidator` (not an LLM self-check) validates: UTC-aware and chronologically ordered windows; `observed_at ≤ fetched_at ≤ validated_at ≤ assessed_at` subject to documented verified skew; alert creation before expiry; `(tenant, monitor, blueprint_version, policy_digest, snapshot_digest, source_assessment_id)` matches *current authorized canonical objects*; all evidence/claim refs resolve to the same immutable snapshot; `source_revision_set_digest` agrees with the dependency manifest; live alert requires current generation, consent, source rights, geofence version, kill-switch and recovery-admission epoch; hazard outcomes are blocked when required evidence is missing; official relay requires live verified issuer/rights/scope independently of schema; correction links must reference the prior eligible episode and attempted recipients. Schema-valid strings or cryptographic-looking digests are **not** evidence of actual authorization. On mismatch, fail closed, record privacy-safe `CONTRACT_REJECTED` for Spec 228 and do not dispatch. v1.2→v1.3 adapters may parse historical records for display/replay but cannot fabricate absent provenance or upgrade them into production send authority.

## 31. Acceptance tests AT-63…AT-74 (new mandatory specification tests)

| Test | Adversarial scenario | Required result |
|---|---|---|
| AT-63 | Provider retroactively corrects a previously used river-level point after an alert was attempted | Append source revision, bounded dependency replay, immutable assessment correction, targeted currently consented original recipients; no stale hazard blast. |
| AT-64 | Duplicate late gauge/webhook event arrives after event-time watermark; device clock is far ahead | Source-scoped order/skew checks, disputed/late lane, no false newly gained lead time or active-warning downgrade. |
| AT-65 | Wall-clock monitor due at a repeated/nonexistent DST local hour; two Cron sweeps race | Reviewed DST handling, single logical UTC due claim where intended, fenced duplicates and history-only late catch-up. |
| AT-66 | Restore an old PG snapshot after user deleted monitor and revoked location/recipient consent; second region is online | Recovery admission closed until current revocation/lease proof; no resurrected push, audited outage and reconciled attempts. |
| AT-67 | Agent suggests internal metadata URL via redirect/DNS rebinding and a nested compressed feed | Manifest/egress validation and safe parser limits block the request, no secrets or arbitrary files leaked. |
| AT-68 | Tenant creator marks marketing content `CRITICAL`, adds someone else's phone and embeds a fake official link | No provider send without independently approved domain severity, destination ownership, consent, abuse budget and authenticated content. |
| AT-69 | User asks flood monitor to automatically open downstream floodgate or execute market order | Separate authorized high-impact workflow/human decision only; no Monitor alert event authorizes effect. |
| AT-70 | Domain-pack dependency signature revoked while active episodes and independent official relay exist | Affected prediction disabled/coverage-loss noted, historical evidence retained, authorized official relay independently intact. |
| AT-71 | Gauge datum and watershed topology change after seasonal certification; model accuracy becomes unmeasurable | Scoped OOD/shadow and recertification, no fabricated false-negative/confidence statistic or silent threshold update. |
| AT-72 | Mobile device geofence older than TTL overlaps only uncertain edge of valid warning polygon; user revokes location | AREA_UNCERTAIN/no invented local all-clear; geofence epoch fences further sends; private location is not leaked. |
| AT-73 | Push vendor accepts requests but drops receipts for 40m while enabled critical subscribers lack other channels | Channel health/coverage-loss operational alert, no false device-delivered label, bounded expired retry and staffed escalation where configured. |
| AT-74 | JSON-valid alert references another tenant/monitor; reversed times; HAZARD with action RETRACT but no correction | Strict v1.3 shape + independent semantic validator refuse dispatch, audit safe rejection and preserve historical read-only compatibility. |

**Release blockers:** AT-63, 64, 66–74 are hard gates for a high-stakes scope when applicable. AT-65 is hard for enabled wall-clock schedules including any timezone with DST. Production tests require real deployed Feature 195/225 adapters, actual source-rights/permissions and independent verifier, not only synthetic records. All prior AT-01…AT-62 remain in force; no implicit waive because an example JSON validates.

## 32. v1.3 wire-contract and promotion gate

Proposed contract files: `monitor-blueprint-v1.3.schema.json`, `monitor-assessment-v1.3.schema.json`, `monitor-alert-event-v1.3.schema.json`, `synthetic-monitor-contract-fixtures-v1.3.json`, `synthetic-monitor-v1.3-event-variants.json`, `validate_spec238_v13.py`. New fields explicitly bind source revision/watermark, scheduling/DST, source and egress policy, immutable pack dependency, monitor generation and geofence/recovery epochs. Wire compatibility is **versioned**; never mutate a deployed v1.2 schema in place. Validate static negative cases and service-level cross-record invariants using a separate deterministic verifier; after local correctness, run actual staged integration/chaos tests and review source/capability rights before live release. Suggested phased plan: P238.0 repository+contract discovery → P238.1 static v1.3 parser+validator → P238.2 ordinary non-life-safety replay on existing 195/225 → P238.3 bounded source corrections/DR/ingress abuse E2E → P238.4 licensed flood shadow+expert validation → P238.5 gated single-basin/private live. Existing time reminders and in-progress Spec 224 must not regress.

**References:** [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) (UTC and propagation semantics); [OWASP SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) (destination allowlists, private/metadata address protection, DNS/redirect risk); [OASIS CAP 1.2](https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2.html) (issuer message/update/references schema, not government feed entitlement).
