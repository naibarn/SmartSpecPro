# Spec 228 — SmartAIHub Autonomous Maintenance, Issue & Improvement Management System
## Continuous Bug Qualification, Feedback Triage, Priority Queue, Autonomous Repair, Admin Oversight, Alerting, GitHub Promotion & Safe Deployment

**Status:** Proposed / Target maintenance architecture; unified implementation pending  
**Spec ID:** 228  
**Revision:** 7 — historical similarity/duplicate detection and maintenance evidence retrieval through Spec 229
**Date:** 2026-09-22  
**Target repository path:** `specs/feature/228-SmartAIHub Autonomous Maintenance, Issue & Improvement Management System/spec.md`  
**Primary owner:** SmartAIHub Reliability / Maintenance / Continuous Improvement Platform  
**Canonical development-runtime dependency:** Spec 224 Revision 19+ — SmartAIHub Autonomous Development Orchestrator Runtime  
**Compatibility / cross-device dependency:** Spec 225 Revision 7+ / Spec 226 Revision 9+ — SmartAIHub Universal Access & Compatibility Bridge  
**Media-policy boundary:** Spec 227 — SmartAIHub Publishing Policy, EDSA & Platform Compliance Engine  
**Canonical durable execution plane:** existing `worker_jobs` / `worker_job_events`  
**Canonical approval:** existing shared SmartAIHub Approval infrastructure  
**Canonical notification delivery:** existing Attention / Notification infrastructure exposed through Specs 225/226 where available  
**Canonical source-control / development promotion:** Spec 224 development workspace, Git / GitHub, verification and promotion contracts  

---

## 0.1 Codebase alignment snapshot — 2026-09-22

The repository contains existing feedback intake/status/notification routes, feedback auto-close processing, memory maintenance jobs and Skill maintenance scheduling. These are separate capabilities; no unified Spec 228 `MaintenanceItem`/IIMS/AME lifecycle, qualification queue, maintenance work-package router, release-batch controller or Maintenance Center was found.

Spec 228 remains a target integration above Spec 224 and Feature 195. Existing feedback or maintenance jobs must not be relabelled as the canonical autonomous repair lifecycle.

# 0. Executive Decision

SmartAIHub SHALL implement a platform-wide **Autonomous Maintenance, Issue & Improvement Management System** that receives software defects, runtime failures, user bug reports, user feedback, automated test failures, operational anomalies and improvement opportunities; determines whether each report represents a real software bug, external failure, user error, expected behavior, product improvement or insufficient evidence; prioritizes the resulting work; and safely drives eligible maintenance work through diagnosis, repair, verification, GitHub promotion and deployment.

The system SHALL reduce the historical dependency on an administrator repeatedly capturing screenshots, copying errors to Codex/Claude, asking a coding agent to investigate, waiting for completion, manually rechecking, and deciding when to deploy.

The target operating model is:

```text
Runtime / Users / Monitoring / Tests / Agents / Admin
                         │
                         ▼
           Issue & Improvement Intake
                         │
                         ▼
      Qualification + Evidence + Deduplication
                         │
                         ▼
            Triage + Priority + Risk
                         │
                         ▼
                Autonomy Decision
             ┌───────────┼───────────┐
             │           │           │
             ▼           ▼           ▼
        Auto-handle   Prepare only   Admin decision
             │           │           │
             └───────────┴─────┬─────┘
                               ▼
                    Maintenance Work Package
                               │
                               ▼
                  Spec 224 DevelopmentRun
                               │
        Plan → Reproduce → Fix → Test → Review
                   → Verify → Final Verify
                               │
                               ▼
                        GitHub candidate
                               │
                   Release / Deployment Gate
                               │
                 Canary → Observe → Promote
                               │
                    Close or Auto-Rollback
```

The system SHALL NOT equate an error message with a confirmed bug. A message error, exception, failed provider call, timeout or user report is only an **observation** until the qualification process determines what it represents.

The system SHALL support autonomous maintenance, but **autonomous maintenance SHALL NOT mean unrestricted autonomous source-code modification or production deployment**. Every action SHALL be bounded by explicit authorization, risk policy, evidence, blast radius, reversibility and verification requirements.

---

# 1. Product Name and Internal Subsystems

The overall subsystem defined by this spec is:

> **SmartAIHub Autonomous Maintenance, Issue & Improvement Management System**

Recommended short name:

> **AMIIMS**

It contains two major logical layers:

1. **IIMS — Issue & Improvement Management System**  
   Owns intake, canonical issue records, evidence, deduplication, classification, triage, priority, backlog, audit trail and admin-facing work management.

2. **AME — Autonomous Maintenance Engine**  
   Owns maintenance-specific qualification, autonomy policy, remediation requests, release policy and post-fix observation. It delegates software-development lifecycle execution to Spec 224 rather than implementing a second development orchestrator.

The UI MAY present the product simply as **Maintenance** or **Issues & Improvements** while preserving the internal architecture above.

---

# 2. Problems This Spec Solves

Current and historical workflows create the following operational problems:

1. runtime errors may already be reported automatically but still require manual investigation;
2. users can report bugs, but reports may be incomplete, duplicate, non-reproducible or not actual bugs;
3. administrators must frequently collect screenshots or logs manually;
4. administrators must manually hand work to Codex, Claude or another coding harness;
5. every issue tends to become a human-attended development session even when the repair is low risk and deterministic;
6. feedback and improvement ideas are mixed with defects without a consistent prioritization model;
7. priority is often implicit rather than auditable;
8. urgent defects can wait behind low-value work;
9. there is no single maintenance command center showing intake, diagnosis, active repairs, approvals, code changes, releases and deployment outcome;
10. there is no durable connection from a user report to `worker_jobs`, DevelopmentRuns, Git commits, pull requests and deployed releases;
11. automated fixes can be dangerous if error messages are misclassified or if high-risk areas are modified without approval;
12. repeated errors can create alert noise rather than one consolidated issue with occurrence counts;
13. post-deployment regressions may not be automatically linked back to the fix that introduced them;
14. maintenance data is not yet used as a controlled continuous-improvement loop.

---

# 3. Goals

Spec 228 SHALL provide:

- automatic and manual issue intake;
- user bug-report intake;
- user feedback and improvement intake;
- automated evidence capture where policy permits;
- secret and PII redaction before persistence or agent exposure;
- issue fingerprinting, clustering and deduplication;
- bug qualification and reproducibility assessment;
- classification of non-bug failures;
- severity and priority as separate concepts;
- configurable prioritization with human override;
- a durable maintenance backlog;
- autonomous repair only when policy permits;
- admin approval only when actually required;
- immediate containment paths for urgent incidents;
- Spec 224 integration for implementation, test, debug, review and Final Verify;
- durable linkage to `worker_jobs` and `worker_job_events`;
- GitHub commit / branch / pull-request traceability;
- maintenance-release batching and urgent hotfix paths;
- canary deployment, health observation and rollback integration;
- admin dashboards and full monitoring UI;
- alert delivery to administrators when new or high-priority work arrives;
- cross-device actionable approval / attention flows through existing SmartAIHub notification infrastructure;
- maintenance analytics and self-improvement evidence.

---

# 4. Non-Goals and Ownership Boundaries

Spec 228 SHALL NOT:

1. create a second generic development orchestrator — Spec 224 owns the software-development lifecycle;
2. create a second durable job system — existing `worker_jobs` / `worker_job_events` remain canonical execution truth;
3. create a second Approval Service;
4. create a second mobile notification stack — it SHALL emit maintenance attention events to the existing notification/attention infrastructure;
5. replace Spec 200 external coding-agent integration;
6. replace Spec 208/213 browser/computer-use infrastructure;
7. convert ordinary Spec 227 media-compliance jobs into DevelopmentRuns;
8. rewrite already implemented specs merely because a defect is discovered;
9. grant coding harnesses direct unrestricted production credentials;
10. permit a model confidence score alone to authorize a production-changing action.

---

# 5. Cross-Spec Contract

## 5.1 Spec 224

Spec 228 owns **maintenance intake, qualification, prioritization, autonomy and maintenance release policy**.

Spec 224 owns **DevelopmentRun lifecycle authority**, including planning, implementation, build, test, debug/repair loops, review, verification, recovery and Final Verify.

Spec 228 SHALL create a versioned `MaintenanceWorkPackage` and request a Spec 224 DevelopmentRun. It SHALL NOT reproduce Spec 224 phase-state logic.

## 5.2 Spec 226

Spec 228 SHALL reuse Spec 226 compatibility mechanisms for external development control, normalized provider progress and cross-device attention where available.

## 5.3 Spec 225

Where Spec 225 is available, Maintenance alerts, Needs Attention items and approvals SHALL be accessible from supported web/mobile/tablet/PWA surfaces without creating a maintenance-specific parallel notification product.

## 5.4 Spec 227

A normal media policy/compliance workflow remains a Spec 227 lifecycle. If that workflow uncovers a **software defect** or **platform improvement opportunity**, it MAY emit a Spec 228 intake observation. The media job itself SHALL NOT be converted into a Spec 224 DevelopmentRun.

## 5.5 Spec 200 and provider harnesses

Codex, Claude Code, Antigravity, Hermes, ZCode, Kimi Code and future harnesses SHALL be invoked through the existing external-agent/development integration contracts. Provider-native progress remains observational; SmartAIHub retains canonical state.

---

# 6. Core Domain Model

Spec 228 SHALL introduce canonical maintenance records separate from `worker_jobs`.

Minimum entities:

```text
maintenance_items
maintenance_occurrences
maintenance_evidence
maintenance_fingerprints
maintenance_diagnoses
maintenance_triage_decisions
maintenance_priority_history
maintenance_dependencies
maintenance_links
maintenance_work_packages
maintenance_execution_links
maintenance_approvals
maintenance_release_candidates
maintenance_deployments
maintenance_observations
maintenance_alerts
maintenance_comments
maintenance_watchers
maintenance_slas
maintenance_audit_events
maintenance_incidents
maintenance_incident_links
maintenance_problems
maintenance_known_errors
maintenance_change_records
maintenance_change_windows
maintenance_postmortems
maintenance_policy_decisions
maintenance_artifact_attestations
maintenance_slo_snapshots
maintenance_runbooks
maintenance_service_components
maintenance_component_owners
maintenance_dependency_health
maintenance_customer_communications
maintenance_vulnerability_context
maintenance_sbom_refs
maintenance_vex_statements
maintenance_feature_flag_actions
maintenance_migration_plans
maintenance_schema_contracts
maintenance_configuration_changes
maintenance_ai_decision_records
maintenance_ai_evaluation_runs
maintenance_cleanup_leases
maintenance_operational_readiness
improvement_proposals
```

An issue record SHALL NOT be implemented as a `worker_job` row.

Operational records SHALL remain distinct even when the UI links them together:

```text
Observation = one reported/detected occurrence or signal
Maintenance Item = actionable defect/improvement work record
Incident = time-bounded live service-impact coordination record
Problem = underlying/recurring root-cause investigation record
Known Error = understood problem with documented workaround/mitigation
Change = governed production-affecting modification/promotion record
Release = immutable candidate/artifact set promoted through environments
```

A single incident MAY link to several Maintenance Items. A recurring Maintenance Item MAY link to one Problem. A Change MAY contain several verified Maintenance Items. These records SHALL NOT be collapsed into one polymorphic row merely for implementation convenience.

One maintenance item MAY create many worker jobs and many DevelopmentRun attempts.

Example:

```text
MNT-1842 — upload page null reference
  ├─ JOB-9001 evidence normalization
  ├─ JOB-9002 deterministic reproduction
  ├─ DEV-RUN-702 repair candidate A
  │    ├─ JOB-9003 tests
  │    ├─ JOB-9004 review
  │    └─ JOB-9005 final verify
  ├─ DEV-RUN-706 repair candidate B after rollback
  └─ DEPLOY-311 canary verification
```

---

# 7. Maintenance Item Types

Canonical item types SHALL include at least:

```text
BUG
REGRESSION
INCIDENT
SECURITY_FINDING
PERFORMANCE_REGRESSION
RELIABILITY_ISSUE
DATA_INTEGRITY_ISSUE
UX_FRICTION
ACCESSIBILITY_ISSUE
IMPROVEMENT
FEATURE_REQUEST
TECH_DEBT
DOCUMENTATION_ISSUE
TEST_GAP
OBSERVABILITY_GAP
DEPENDENCY_ISSUE
EXTERNAL_PROVIDER_ISSUE
CONFIGURATION_ISSUE
UNKNOWN
```

The type MAY change as evidence improves. Every type change SHALL be audited.

`INCIDENT` as an item type MAY be retained for backward compatibility or intake classification, but a live service incident SHALL create/use the canonical `maintenance_incidents` record defined by this spec. The incident record owns coordination state; the Maintenance Item owns repair/improvement work.

---

# 8. Qualification Classes

Before a report becomes an actionable software defect, the system SHALL classify the observation into one of the following or an extensible equivalent:

```text
CONFIRMED_BUG
PROBABLE_BUG
REGRESSION_CONFIRMED
USER_ERROR
EXPECTED_FAILURE
INVALID_INPUT
EXTERNAL_PROVIDER_FAILURE
NETWORK_FAILURE
RATE_LIMIT_OR_QUOTA
AUTHENTICATION_OR_AUTHORIZATION_FAILURE
CONFIGURATION_ERROR
ENVIRONMENT_FAILURE
SECURITY_INCIDENT
PERFORMANCE_REGRESSION
UX_FRICTION
IMPROVEMENT_OPPORTUNITY
FEATURE_REQUEST
DUPLICATE
CANNOT_REPRODUCE
INSUFFICIENT_EVIDENCE
FALSE_POSITIVE
```

No source-code repair SHALL begin merely because the intake contains the word “error”.

---

# 9. Intake Sources

The intake layer SHALL support at least:

1. existing automatic feedback generated from application error messages;
2. user-submitted bug reports;
3. user feedback / improvement suggestions;
4. administrator-created issues;
5. automated test failures;
6. synthetic monitoring failures;
7. health-check failures;
8. backend exceptions;
9. frontend errors;
10. job failures from `worker_jobs`;
11. Runner failures;
12. browser/computer-use failures;
13. external provider failures;
14. deployment health regressions;
15. audit/security findings;
16. performance telemetry anomalies;
17. agent-generated improvement observations;
18. repeated support/help patterns where policy allows aggregation;
19. Spec 227 software-defect observations;
20. future external integrations such as GitHub issues or monitoring systems through explicit adapters.

Each intake SHALL create an immutable observation envelope before normalization.

---

# 10. Intake Observation Envelope

Minimum fields:

```json
{
  "observation_id": "obs_...",
  "source_type": "runtime_error | user_feedback | test | monitor | agent | admin | ...",
  "source_ref": "optional opaque reference",
  "tenant_id": "...",
  "user_id": "nullable",
  "session_id": "nullable/redacted",
  "occurred_at": "...",
  "received_at": "...",
  "app_version": "...",
  "commit_sha": "...",
  "release_id": "...",
  "route_or_feature": "...",
  "job_id": "nullable",
  "trace_id": "nullable",
  "message": "redacted normalized message",
  "metadata": {},
  "evidence_refs": [],
  "privacy_class": "..."
}
```

Secrets, credentials, session tokens, cookies and unnecessarily identifying data SHALL NOT be copied into the issue store or sent to coding harnesses.

---

# 11. Automatic Evidence Collection

When available and authorized, evidence SHOULD include:

- normalized error message;
- stack trace with secret redaction;
- failing route / API / capability;
- build and release version;
- commit SHA;
- feature flag state;
- tenant scope without exposing another tenant’s data;
- browser / OS / device class;
- workflow/job/run identifiers;
- selected request/response metadata after redaction;
- relevant application logs;
- test failure output;
- provider response classification;
- latency / resource metrics;
- reproduction steps inferred from safe event breadcrumbs;
- user-provided description;
- optional user-provided screenshot/video;
- related recent deployments;
- related incidents;
- related existing issue fingerprints.

A screenshot SHALL be helpful but SHALL NOT be required for every bug.

---

# 12. Privacy, Secret Redaction and Evidence Safety

Before evidence is persisted, indexed or exposed to an AI agent, the system SHALL run a redaction/safety stage.

Required controls:

1. secret scanner;
2. authorization headers removed;
3. cookie/session material removed;
4. API keys/token-like values removed;
5. password fields removed;
6. tenant boundaries enforced;
7. user text classified for privacy sensitivity;
8. screenshots or attachments treated according to access policy;
9. raw sensitive evidence stored separately when retention is legally/operationally required;
10. agent-facing evidence uses a least-privilege projection.

Security-sensitive evidence SHALL be access controlled separately from ordinary maintenance tickets.

---

# 13. Fingerprinting and Deduplication

The system SHALL prevent one repeated defect from creating hundreds of independent tickets.

Fingerprint inputs MAY include:

- exception type;
- normalized stack signature;
- top application frames;
- route / feature;
- release version;
- error code;
- provider / capability;
- normalized message tokens;
- failing test identity;
- browser/runtime family;
- semantic embedding of redacted report text;
- known issue signatures.

Deduplication SHALL support:

```text
EXACT_DUPLICATE
LIKELY_DUPLICATE
SAME_ROOT_CAUSE_DIFFERENT_SYMPTOM
RELATED_NOT_DUPLICATE
NEW_ISSUE
```

The system SHALL increase occurrence counts and impact estimates when duplicates arrive, rather than discarding them silently.

An administrator SHALL be able to merge or unmerge incorrectly clustered issues with full audit history.

---

# 14. Bug Qualification Engine

For defect-like observations, the qualification engine SHALL attempt to determine:

1. Is the observed behavior inconsistent with the applicable spec, product contract or documented behavior?
2. Is it reproducible?
3. Is the failure deterministic or intermittent?
4. Did the same path work in a previous release?
5. Is this a regression?
6. Is the root cause likely internal code, external provider, configuration, environment, network or user input?
7. Is there already a known issue?
8. Is there a safe deterministic test that demonstrates the failure?
9. What is the confidence of the classification?
10. What evidence is missing?

The engine SHOULD generate a `DiagnosisRecord` containing hypotheses, supporting evidence, contradictory evidence and confidence.

No single LLM judgment SHALL be treated as proof of a bug.

---

# 15. Reproduction Strategy

Reproduction MAY use:

- unit tests;
- integration tests;
- API tests;
- deterministic fixtures;
- synthetic requests;
- isolated development environments;
- browser automation through existing Spec 208/213 capabilities;
- Runner execution;
- controlled provider mocks;
- real external provider calls only when explicitly allowed and budgeted.

Production user state SHALL NOT be mutated merely to reproduce a bug.

A reproduction result SHALL be recorded as:

```text
REPRODUCED_DETERMINISTIC
REPRODUCED_INTERMITTENT
NOT_REPRODUCED
BLOCKED_BY_ENVIRONMENT
BLOCKED_BY_AUTHORIZATION
BLOCKED_BY_EXTERNAL_DEPENDENCY
UNSAFE_TO_REPRODUCE
```

---

# 16. Severity Is Not Priority

Spec 228 SHALL treat **Severity**, **Urgency** and **Priority** as separate values.

## Severity

Represents technical/user harm if the problem occurs.

Suggested classes:

```text
S0_CATASTROPHIC
S1_CRITICAL
S2_MAJOR
S3_MODERATE
S4_MINOR
S5_COSMETIC
```

## Priority

Represents the order in which SmartAIHub intends to act.

Suggested classes:

```text
P0_EMERGENCY
P1_HIGH
P2_NORMAL
P3_LOW
P4_DEFERRED
```

A technically severe defect affecting a disabled experimental feature may have lower priority than a moderate defect affecting most active users.

---

# 17. Priority Scoring Engine

Priority SHALL be derived from configurable dimensions rather than one model guess.

At minimum:

- severity;
- number of affected users/tenants;
- occurrence frequency;
- growth rate;
- regression status;
- business-critical workflow impact;
- security/privacy impact;
- data-integrity risk;
- availability impact;
- workaround availability;
- external dependency status;
- SLA status;
- age in queue;
- estimated effort;
- confidence that work is actionable;
- release/dependency blocking impact;
- strategic value for improvement proposals;
- SLO impact and current error-budget burn where an SLO exists;
- correlated incident status and customer-facing degradation;
- queue starvation/aging guardrails.

Raw occurrence volume SHALL NOT dominate priority when it is known to be telemetry duplication, retry amplification, bot traffic or another non-user-impact multiplier. SLO/error-budget signals are inputs to priority, not replacements for severity or business context.

A configurable scoring model MAY calculate an internal numerical score, but the human-facing priority SHALL remain understandable and explainable.

Every automatic priority decision SHALL expose a “Why this priority?” explanation.

---

# 18. Admin Priority Override

Authorized administrators SHALL be able to:

- change P0–P4 priority;
- drag/drop items to change rank within a priority class;
- pin an item to the top of a queue;
- set an explicit due date;
- freeze automatic reprioritization;
- re-enable automatic reprioritization;
- mark a release blocker;
- mark “do not auto-fix”;
- mark “auto-fix allowed” within policy bounds;
- bulk-edit priority for selected items;
- defer until a date or dependency;
- attach a priority rationale.

Manual priority changes SHALL NOT erase calculated severity or evidence.

Every override SHALL record:

```text
actor
old_priority
new_priority
reason
scope
effective_at
expiry_or_review_at (optional)
```

---

# 19. Queue Ordering

The actionable backlog SHALL have a deterministic ordering model.

Recommended ordering precedence:

```text
1. active P0 incident / emergency containment
2. administrator-pinned blockers
3. security/data-integrity urgent work
4. P1 items approaching/breaching SLA
5. release blockers
6. remaining P1
7. P2 by score / age / dependency
8. P3
9. P4 / deferred
```

Within a class, administrators MAY manually reorder items.

Queue ordering changes SHALL be durable and visible to all authorized operators.

---

# 20. Dependency and Blocking Model

A maintenance item SHALL support explicit links such as:

```text
BLOCKS
BLOCKED_BY
DUPLICATES
DUPLICATED_BY
RELATED_TO
REGRESSION_OF
CAUSED_BY_RELEASE
FIXED_BY
SUPERSEDES
PARENT_OF
CHILD_OF
```

The UI SHALL make dependency-blocked items visually distinct and SHALL prevent an automated executor from repeatedly retrying an item whose required dependency remains unresolved.

---

# 21. Maintenance Item State Machine

Canonical state classes:

```text
NEW
NORMALIZING
TRIAGE_PENDING
INVESTIGATING
NEEDS_EVIDENCE
QUALIFIED
QUEUED
WAITING_DEPENDENCY
WAITING_APPROVAL
READY_FOR_AUTONOMOUS_WORK
REPAIR_IN_PROGRESS
VERIFYING
READY_FOR_RELEASE
DEPLOYING
OBSERVING
RESOLVED
CLOSED
REOPENED
DEFERRED
REJECTED
DUPLICATE
CANCELLED
```

Terminal vs non-terminal semantics SHALL be explicit. `WAITING_APPROVAL`, `NEEDS_EVIDENCE` and `WAITING_DEPENDENCY` are paused states, not failures.

---

# 22. Autonomy Levels

Spec 228 SHALL support policy-controlled autonomy levels.

```text
A0_OBSERVE
  Detect, cluster and record only.

A1_RECOMMEND
  Diagnose and recommend a fix/improvement; no code modification.

A2_PREPARE
  Create plan, branch/patch, tests and PR candidate; human approval required before merge.

A3_AUTO_MERGE
  May merge verified low-risk changes according to branch protection policy; production deployment still gated.

A4_AUTO_DEPLOY
  May promote verified low-risk changes through configured canary/staged deployment policy.

A5_EMERGENCY_RESPONSE
  May execute pre-authorized containment/rollback/hotfix actions for explicitly enumerated emergency classes.
```

A5 SHALL NOT mean unrestricted production access.

---

# 23. Autonomy Decision Model

The decision engine SHALL evaluate at least:

- qualification confidence;
- reproduction confidence;
- blast radius;
- reversibility;
- code-area criticality;
- security impact;
- privacy impact;
- data-migration impact;
- payment/billing/credit impact;
- authentication/authorization impact;
- tenant-boundary impact;
- deployment scope;
- test coverage;
- regression risk;
- estimated change size;
- independent review availability;
- current incident urgency;
- administrator policy;
- repository protection rules.

Model confidence alone SHALL NOT authorize a change.

Every autonomy decision that can lead to source modification, merge, deployment, rollback, containment or data mutation SHALL persist an immutable `PolicyDecisionSnapshot` containing at least:

```text
decision_id
maintenance_item_id
policy_id + policy_version
policy_snapshot_hash
input_evidence_refs
risk_snapshot
autonomy_level_granted
actions_allowed
actions_denied
required_approvals
decision_reason_codes
decision_engine_version
created_at
expires_at / invalidation conditions
```

A materially changed candidate, policy, risk profile, environment, deployment target or evidence epoch SHALL invalidate or re-evaluate the decision according to policy.

---

# 24. High-Risk Paths

The default policy SHOULD require human approval before merge or deployment for changes touching any of the following unless an explicit stricter verified automation policy exists:

- authentication;
- authorization / RBAC;
- tenant isolation;
- secrets / credentials;
- billing / credits / wallets / money movement;
- destructive database migrations;
- irreversible data transformations;
- production infrastructure;
- encryption / key management;
- compliance enforcement;
- source-control protection rules;
- deployment credentials;
- security boundaries;
- bulk deletion;
- privileged admin actions.

Emergency containment MAY still disable or roll back a dangerous feature when a pre-authorized runbook allows it.

---

# 25. Immediate Containment Before Repair

For urgent incidents, the first autonomous action MAY be containment rather than code modification.

Allowed pre-authorized containment strategies MAY include:

- disable a feature flag;
- stop a broken workflow;
- pause an affected queue;
- fall back to a known-good provider;
- fall back to a known-good implementation;
- reduce traffic to a new release;
- roll back a deployment;
- disable a specific unsafe capability;
- isolate a tenant-scoped failure path;
- switch a service to read-only or degraded mode where designed.

Containment SHALL create a durable incident action record and alert administrators.

---

# 26. Maintenance Work Package

Before requesting Spec 224 execution, Spec 228 SHALL create a versioned immutable-at-dispatch `MaintenanceWorkPackage`.

Minimum content:

```json
{
  "maintenance_item_id": "MNT-1842",
  "work_package_version": 3,
  "classification": "CONFIRMED_BUG",
  "priority": "P1_HIGH",
  "severity": "S2_MAJOR",
  "problem_statement": "...",
  "expected_behavior": "...",
  "actual_behavior": "...",
  "reproduction": {},
  "evidence_refs": [],
  "suspected_components": [],
  "constraints": [],
  "risk_profile": {},
  "autonomy_grant": "A2_PREPARE",
  "required_tests": [],
  "required_review": [],
  "required_final_verify": true,
  "release_policy": "BATCHED | HOTFIX | MANUAL",
  "source_context": {},
  "spec_refs": []
}
```

Any material change to scope/evidence/authorization SHALL create a new work-package version or decision epoch rather than silently mutating an in-flight development contract.

---

# 27. Spec 224 Handoff

The canonical handoff is:

```text
Spec 228 MaintenanceWorkPackage
              ↓
     Spec 224 DevelopmentRun
              ↓
DISCOVERY / PLANNING / PLAN_VERIFY
IMPLEMENT / BUILD / TEST / DEBUG
REVIEW / VERIFY / RECOVERY
REGRESSION / FINAL_VERIFY
              ↓
 Verification Certificate + candidate SHA
              ↓
Spec 228 Release Decision
```

Spec 228 MAY request additional maintenance-specific constraints, but SHALL NOT reinterpret a failed Final Verify as success.

---

# 28. Worker Jobs Integration

`worker_jobs` remains the durable execution plane for asynchronous work.

Spec 228 SHALL maintain links rather than overload job records.

Example job types:

```text
maintenance.normalize
maintenance.redact
maintenance.fingerprint
maintenance.cluster
maintenance.collect_evidence
maintenance.reproduce
maintenance.diagnose
maintenance.score_priority
maintenance.prepare_work_package
maintenance.request_development_run
maintenance.observe_release
maintenance.verify_resolution
maintenance.notify
maintenance.generate_improvement_proposal
```

Each job SHALL be idempotent or explicitly fenced according to the existing control-plane contract.

---

# 29. GitHub / Source-Control Flow

A successful repair SHALL be traceable to source control.

Recommended default flow:

```text
Maintenance Item
   ↓
Spec 224 isolated workspace
   ↓
maintenance/<item-or-batch-id> branch
   ↓
commit(s)
   ↓
push to allowed automation target
   ↓
PR / protected promotion path
   ↓
required checks + Final Verify evidence
   ↓
merge according to policy
```

The verified source candidate SHALL be bound to an immutable artifact identity before production promotion. Where the build system supports it, SmartAIHub SHOULD generate verifiable build provenance/attestation and an SBOM or equivalent dependency manifest. Promotion SHOULD use **build once, promote the same immutable artifact** semantics rather than rebuilding different binaries for staging and production.

For autonomous merge/deploy paths, repository protection SHALL prevent the executing coding identity from silently weakening branch protection, required checks or approval policy in the same change. High-risk changes SHALL require an independent verifier and, where policy requires, a separate human approver.

Every maintenance item SHALL expose links to relevant:

- repository;
- branch;
- commit SHA;
- pull request;
- review result;
- Verification Certificate;
- release candidate;
- deployed version;
- immutable artifact digest;
- build/provenance attestation where available;
- SBOM/dependency manifest where available.

---

# 30. Maintenance Release Modes

Spec 228 SHALL support at least three release modes.

## 30.1 Emergency Hotfix

Used for validated urgent issues where waiting for a normal batch materially increases harm.

## 30.2 Maintenance Batch

Default for ordinary bugs and small improvements. Multiple verified items MAY be combined into a controlled maintenance release.

## 30.3 Planned Improvement Release

Used for non-urgent improvements or changes requiring broader regression / product review.

An administrator SHALL be able to move an item between release modes with audit evidence.

---

# 31. Release Batch Model

A maintenance batch SHALL have a durable record containing:

- batch id;
- candidate commits;
- included issue ids;
- excluded/deferred issue ids;
- target environment;
- regression requirements;
- risk summary;
- approval status;
- deployment stages;
- observation window;
- rollback candidate;
- final outcome.

A batch SHALL NOT close individual issues until their deployed resolution has been observed according to policy.

---

# 32. Deployment Safety

A normal autonomous deployment path SHOULD be:

```text
Verified candidate
  ↓
Staging / isolated validation where applicable
  ↓
Canary or limited scope
  ↓
Health and regression observation
  ↓
Expand traffic / full promotion
  ↓
Post-deploy verification
```

The deployment controller SHALL monitor configured error, latency, job failure, SLO and functional signals.

Promotion SHALL be blocked when the artifact digest differs from the artifact that passed required verification, unless policy explicitly requires a rebuild and all invalidated evidence is rerun.

Deployment policy SHALL support maintenance windows, change-freeze windows, environment-specific gates and an emergency-change exception path. Emergency exceptions SHALL require a retrospective/post-implementation review even when the emergency action itself was pre-authorized.

If health materially regresses, the system SHALL support automatic rollback when pre-authorized.

---

# 33. Post-Deployment Observation

A maintenance item SHALL not be considered resolved solely because code was merged.

Resolution SHOULD require appropriate evidence such as:

- failing reproduction now passes;
- targeted regression tests pass;
- production/canary error signature disappears or returns to baseline;
- no correlated new regression appears;
- affected job success rate recovers;
- user-facing health check passes;
- required observation window completes.

If the original signature reappears, the issue SHALL be eligible for automatic reopen.

---

# 34. Improvement Opportunity Engine

The system MAY create improvement proposals even when no defect exists.

Possible signals:

- repeated user retries;
- repeated cancellations;
- unusually high task abandonment;
- repeated feedback themes;
- slow workflows;
- high support/help usage around one feature;
- repeated manual admin intervention;
- repeated low-confidence agent behavior;
- recurring workaround usage;
- frequent provider fallback;
- recurring repair loops;
- expensive execution patterns;
- poor success rate for a feature.

The proposal SHALL identify evidence and expected benefit rather than simply state “AI thinks this should change.”

---

# 35. Product-Semantic Change Gate

An improvement that materially changes product semantics, pricing, permissions, policy, user data meaning or workflow contract SHALL NOT be silently auto-implemented merely because it appears beneficial.

Such proposals SHALL enter a human decision state with:

- current behavior;
- proposed behavior;
- evidence;
- expected benefits;
- risks;
- affected users/tenants;
- migration implications;
- estimated implementation effort.

---

# 36. Admin UI Information Architecture

Spec 228 SHALL provide an Admin **Maintenance Center** with the following first-class surfaces:

```text
Maintenance
├─ Overview
├─ Inbox
├─ Priority Queue
├─ Incidents
├─ Problems & Known Errors
├─ Active Repairs
├─ Needs Attention
├─ Changes / Release Calendar
├─ Releases & Deployments
├─ Improvements
├─ Vulnerabilities
├─ Service Map & Ownership
├─ Analytics / SLO
├─ Automation Policies
├─ Policy Simulator
├─ Alerts, On-call & Escalation
├─ Operational Readiness
└─ Settings / Integrations
```

All pages SHALL support tenant-aware authorization and deep links to canonical records.

---

# 37. Admin UI — Overview / Maintenance Command Center

The Overview page SHALL give an administrator an immediate operational picture.

Required headline cards:

- New items;
- P0 / P1 open;
- Awaiting triage;
- Awaiting admin decision;
- Autonomous repairs running;
- Verification running;
- Ready for release;
- Deployment observing;
- SLA at risk / breached;
- Reopened items;
- Auto-fix success rate;
- rollback count.

Required panels:

1. **Priority Work Queue** — top actionable items;
2. **Needs Attention** — approvals and blocked decisions;
3. **Live Maintenance Activity** — state changes from intake through deploy;
4. **Recent High-Impact Errors** — grouped by fingerprint;
5. **Current Repairs** — active Spec 224 DevelopmentRuns and progress;
6. **Upcoming Maintenance Release** — included fixes and readiness;
7. **Recent Deployments** — health and rollback status;
8. **Recurring Problems** — high-frequency or repeatedly reopened issues;
9. **Improvement Opportunities** — top evidence-backed proposals;
10. **Alert Health** — undelivered / unacknowledged critical alerts;
11. **Service Reliability / SLO** — current SLO status and error-budget burn for monitored services;
12. **Live Incidents** — active incident commander, impact, containment and next checkpoint;
13. **Change Risk** — upcoming maintenance windows, freezes and high-risk releases.

The Overview SHALL be useful without requiring administrators to open individual issues.

---

# 38. Admin UI — Inbox

The Inbox SHALL be the triage surface for newly received observations and unqualified items.

Columns / cards SHOULD expose:

- item id;
- title / normalized summary;
- source;
- first seen / last seen;
- occurrence count;
- affected users/tenants estimate;
- current qualification;
- severity;
- proposed priority;
- confidence;
- duplicate cluster;
- latest release/commit;
- current owner;
- state;
- autonomy eligibility.

Filters SHALL include source, type, state, severity, priority, feature, release, tenant scope, age, confidence and duplicate status.

Bulk actions SHALL include triage, merge, assign, defer, mark duplicate, request evidence and priority change.

---

# 39. Admin UI — Priority Queue

The Priority Queue SHALL provide both **ranked list** and **board** views.

Required capabilities:

- P0–P4 lanes;
- drag/drop rank within a lane;
- authorized drag/drop across priority lanes;
- pin to top;
- priority freeze;
- due date;
- SLA badge;
- dependency badge;
- release blocker badge;
- autonomy badge;
- risk badge;
- owner/team;
- active repair status;
- multi-select and bulk action;
- saved filters / views;
- queue search.

On a manual priority move, the UI SHALL request or permit a concise rationale according to configured governance policy.

The previous automatic score SHALL remain visible for comparison.

---

# 40. Admin UI — Issue / Improvement Detail

The detail page SHALL use tabs or equivalent sections:

```text
Overview
Evidence
Occurrences
Diagnosis
Reproduction
Priority & Risk
Work / Jobs
Development
Code / PR
Tests & Verification
Release / Deployment
Comments
Timeline / Audit
```

The header SHALL show:

- id and title;
- type;
- qualification;
- severity;
- priority;
- state;
- owner;
- occurrence count;
- affected scope;
- autonomy level;
- current next action;
- SLA status.

Primary admin actions SHALL include where authorized:

- Confirm Bug;
- Reclassify;
- Change Priority;
- Assign;
- Request More Evidence;
- Start Investigation;
- Allow Autonomous Repair;
- Force Human Review;
- Approve Plan;
- Approve Merge;
- Approve Deploy;
- Pause;
- Cancel;
- Defer;
- Merge Duplicate;
- Split Issue;
- Reopen;
- Close;
- Trigger Rollback;
- Create Follow-up Improvement.

---

# 41. Admin UI — Diagnosis and Evidence

The Diagnosis UI SHALL show reasoning **as structured conclusions and evidence**, not hidden chain-of-thought.

It SHOULD present:

- confirmed facts;
- hypotheses;
- evidence supporting each hypothesis;
- contradictory evidence;
- reproduction status;
- likely ownership/component;
- missing evidence;
- confidence;
- external dependency status;
- proposed next diagnostic action.

Administrators SHALL be able to attach notes and correct a classification without destroying the original machine decision.

---

# 42. Admin UI — Active Repairs

The Active Repairs page SHALL monitor maintenance DevelopmentRuns and related jobs.

For each repair show:

- issue id;
- current Spec 224 phase;
- selected harness/provider;
- active subrun/job;
- progress summary;
- elapsed time;
- retry/recovery count;
- current candidate SHA;
- tests passed/failed;
- review status;
- blockers;
- approval needed;
- budget / cost if applicable;
- last activity.

The UI SHALL permit authorized pause/cancel/escalate actions through canonical control APIs rather than provider-specific hacks.

---

# 43. Admin UI — Needs Attention

Needs Attention SHALL aggregate maintenance decisions requiring human action.

Examples:

```text
MNT_APPROVAL_REPAIR_REQUIRED
MNT_APPROVAL_MERGE_REQUIRED
MNT_APPROVAL_DEPLOY_REQUIRED
MNT_PRODUCT_DECISION_REQUIRED
MNT_SECURITY_REVIEW_REQUIRED
MNT_EVIDENCE_REQUIRED
MNT_BUDGET_DECISION_REQUIRED
MNT_ROLLBACK_DECISION_REQUIRED
MNT_EXTERNAL_DEPENDENCY_BLOCKED
```

Each entry SHALL state:

- what decision is needed;
- why the system cannot decide under current policy;
- deadline / urgency;
- consequences of approve / reject / defer;
- deep link to the canonical maintenance item.

---

# 44. Admin UI — Releases & Deployments

This page SHALL display:

- next maintenance batch;
- hotfixes in progress;
- candidate commits / PRs;
- included items;
- verification status;
- approval status;
- target environment;
- deployment progress;
- canary health;
- observation window;
- current version;
- rollback target;
- deployment history.

An administrator SHALL be able to remove an item from a batch before release, subject to dependency checks.

---

# 45. Admin UI — Improvements

Improvement proposals SHALL have a dedicated surface so they do not obscure urgent defects.

Show:

- evidence summary;
- user impact;
- expected benefit;
- estimated effort;
- confidence;
- suggested priority;
- affected feature;
- dependencies;
- proposed product-semantic change;
- approval requirement;
- implementation readiness.

Admins SHALL be able to promote an improvement into a planned MaintenanceWorkPackage or reject/defer it with reason.

---

# 46. Admin UI — Automation Policies

The Automation Policies page SHALL make autonomous behavior explicit and editable by authorized administrators.

Policy dimensions SHALL include:

- maximum autonomy level;
- repositories / components allowed for auto-fix;
- protected/high-risk components;
- maximum change size;
- minimum qualification confidence;
- minimum reproduction requirement;
- minimum test coverage/check set;
- independent review requirement;
- merge permission;
- deployment permission;
- canary requirements;
- rollback permission;
- cost/budget ceiling;
- time windows;
- tenant scope;
- feature flags;
- provider/harness restrictions.

Policy changes SHALL be versioned, auditable and effective only for explicitly determined scopes.

---

# 47. Admin UI — Alerts & Notification Rules

Administrators SHALL be able to configure which maintenance events generate alerts.

Configurable dimensions:

- event type;
- minimum severity;
- minimum priority;
- affected-user threshold;
- occurrence-rate threshold;
- environment;
- component;
- tenant scope;
- delivery channel;
- acknowledgement requirement;
- escalation delay;
- quiet hours;
- on-call target where integrated;
- escalation chain;
- acknowledgement timeout;
- repeat/reminder policy;
- incident auto-open threshold;
- delivery fallback channel;
- maintenance/change-window suppression policy.

The UI SHALL include a routing preview/test action that shows who would receive an example event without sending a real production alert.

Critical events SHALL be allowed to bypass quiet hours only according to explicit policy.

---

# 48. User-Facing Bug / Feedback UI

The existing user feedback surface SHALL be extended or normalized to support:

- Report a bug;
- Suggest an improvement;
- General feedback;
- optional description;
- optional screenshot/video/file;
- optional reproduction steps;
- affected feature auto-detected where possible;
- consented diagnostic metadata;
- confirmation that the report was received;
- report reference id where appropriate.

The system SHOULD automatically attach safe technical context so users do not need to manually capture every environment detail.

Users SHALL NOT be shown internal stack traces, sensitive diagnostics, security findings or admin-only investigation content.

---

# 49. Feedback Status Experience

Where product policy allows, a reporter MAY see high-level status such as:

```text
RECEIVED
UNDER_REVIEW
KNOWN_ISSUE
FIX_IN_PROGRESS
FIX_RELEASED
NEEDS_MORE_INFORMATION
CLOSED
```

Internal priority, exploit details, sensitive release information and private cross-tenant evidence SHALL not leak through this surface.

---

# 50. Alert Event Model

Spec 228 SHALL emit canonical maintenance events without building a parallel notification transport.

Minimum events:

```text
MNT_NEW_ITEM
MNT_NEW_HIGH_PRIORITY_ITEM
MNT_P0_CONFIRMED
MNT_PRIORITY_ESCALATED
MNT_DUPLICATE_SPIKE
MNT_SLA_AT_RISK
MNT_SLA_BREACHED
MNT_AUTONOMOUS_REPAIR_STARTED
MNT_AUTONOMOUS_REPAIR_FAILED
MNT_APPROVAL_REQUIRED
MNT_FINAL_VERIFY_READY
MNT_RELEASE_READY
MNT_DEPLOYMENT_STARTED
MNT_DEPLOYMENT_HEALTHY
MNT_DEPLOYMENT_DEGRADED
MNT_AUTO_ROLLBACK_STARTED
MNT_AUTO_ROLLBACK_COMPLETED
MNT_ITEM_REOPENED
MNT_SECURITY_ESCALATION
MNT_IMPROVEMENT_PROPOSAL_CREATED
```

---

# 51. Admin Alert Requirements

A new item SHALL notify an administrator when it matches configured alert policy.

At minimum, the default configuration SHOULD alert for:

- every new P0 item;
- every new P1 item;
- confirmed security/data-integrity incidents;
- sudden duplicate/occurrence spikes;
- autonomous repair failure on P0/P1;
- any maintenance action waiting for admin approval;
- a verified release ready for approval when approval is required;
- failed or degraded production deployment;
- automatic rollback;
- repeated reopen of the same issue;
- SLA breach.

Low-priority intake SHOULD normally appear in the Maintenance Inbox without generating noisy immediate push notifications.

---

# 52. Notification Delivery and Acknowledgement

Maintenance alerts SHALL use the existing Attention / Notification delivery plane where available.

Supported surfaces MAY include:

- SmartAIHub web notification center;
- Needs Attention inbox;
- mobile/PWA push;
- email through configured notification infrastructure;
- future approved channels.

Critical alerts SHALL support acknowledgement.

The system SHALL record:

- notification generated;
- target user/role;
- delivery attempt;
- delivered / failed;
- opened;
- acknowledged;
- action taken;
- escalation generated.

No secret or raw sensitive evidence SHALL be included in push notification payloads.

---

# 53. Alert Deduplication and Noise Control

The alert layer SHALL suppress repeated alerts for the same fingerprint unless:

- severity increases;
- priority increases;
- occurrence rate crosses a threshold;
- affected scope materially expands;
- SLA approaches breach;
- previous alert remains unacknowledged beyond policy;
- deployment health worsens;
- issue is reopened.

A P0 alert storm SHALL be represented as one incident with updated counts where possible.

---

# 54. Approval Model

Spec 228 SHALL use the shared Approval infrastructure and SHALL create durable paused states rather than blocking transient requests.

Approval subjects MAY include:

- diagnostic action;
- expensive external reproduction;
- repair plan;
- source change;
- merge;
- database migration;
- production deployment;
- rollback;
- high-impact containment;
- product-semantic improvement.

Approvals SHALL be bound to relevant item/work-package/candidate/version epochs so stale approval cannot authorize a newer materially different change.

For policies requiring separation of duties, the principal that authored/executed a privileged change SHALL NOT satisfy the independent approval/review requirement for that same candidate. Machine independent review MAY satisfy only those policies that explicitly allow machine-only separation; high-risk human-required policies remain human-required. Approval delegation, expiry and revocation SHALL be explicit and audited.

---

# 55. Role and Permission Model

Recommended roles/capabilities:

```text
Platform Admin
  Full maintenance governance.

Maintenance Operator
  Triage, priority, assignment, ordinary approvals according to policy.

Developer / Investigator
  Evidence, diagnosis and implementation visibility; scoped actions.

Independent Reviewer
  Review/verify without self-approving restricted changes.

Security Admin
  Access to sensitive security findings and security approvals.

Tenant Admin
  Visibility/actions only for tenant-scoped items where policy permits.

Read-only Auditor
  Evidence, state and audit visibility without mutation.
```

RBAC SHALL be capability-based and tenant-aware.

---

# 56. Assignment and Ownership

Each item MAY have:

- owning team;
- responsible user;
- autonomous owner (`SmartAIHub Maintenance Agent` logical owner);
- watchers;
- reviewer;
- release owner.

Assignment SHALL NOT be required before a pre-authorized autonomous P0 containment action.

---

# 57. SLA and Escalation

SLA policies SHALL be configurable by priority/type/component.

A policy MAY define:

- time to triage;
- time to first action;
- time to containment;
- time to resolution target;
- approval response target;
- alert escalation target.

The system SHALL calculate SLA clocks using durable state and SHALL support configured pause semantics for legitimate external dependencies.

SLA, SLO and error budget SHALL remain distinct:

- **SLA** governs response/resolution commitments for maintenance work;
- **SLO** describes measured service reliability objectives;
- **error budget** represents tolerated unreliability relative to an SLO and MAY influence maintenance priority/change policy.

The UI SHALL show which clock is paused, why, by whom/policy, and the unpaused elapsed time.

---

# 58. Security Incident Boundary

Security findings MAY enter Spec 228 for tracking, but sensitive security incidents SHALL be automatically routed through stricter access and autonomy policies.

The ordinary maintenance UI SHALL not expose exploit details to roles without authorization.

Auto-fix SHALL not publish a vulnerability before the relevant fix/deployment process is safe.

Confirmed software vulnerabilities SHOULD carry CVSS v4.0 data (score **and vector**) when CVSS is applicable, while keeping maintenance Priority as a separate SmartAIHub decision. Security incident handling SHALL use the stricter incident-response path and coordinated disclosure rules configured for the platform. Vulnerability evidence, exploitability data and remediation details SHALL have restricted visibility by default.

---

# 59. External Provider Failures

A provider outage or bad provider response SHALL NOT automatically create a code repair task.

The system SHALL distinguish:

- provider outage;
- provider quota/rate limit;
- provider schema/API change;
- provider quality degradation;
- SmartAIHub adapter bug;
- SmartAIHub fallback-policy bug.

Only internal defects or deliberate improvement work SHALL normally become Spec 224 repair work.

---

# 60. Regression Attribution

When a defect first appears after a release, the system SHOULD correlate it with:

- release id;
- candidate commits;
- changed components;
- feature flags;
- schema migrations;
- provider configuration changes;
- dependency upgrades.

Correlation SHALL be represented as evidence, not certainty, until verified.

---

# 61. Reopen Logic

A resolved item SHALL reopen automatically or enter review when:

- the same validated fingerprint recurs above threshold;
- post-deploy verification fails;
- rollback reintroduces an older known defect;
- a dependent issue invalidates the resolution;
- user reports demonstrate the defect remains;
- regression tests fail in a later release.

Reopen count SHALL contribute to priority/risk and analytics.

---

# 62. Failed Autonomous Repair

If an autonomous repair fails, the system SHALL NOT loop indefinitely.

It SHALL use bounded attempts and no-progress detection.

Possible outcomes:

```text
TRY_ALTERNATE_PLAN
TRY_ALTERNATE_HARNESS
REQUEST_MORE_EVIDENCE
REDUCE_SCOPE
ESCALATE_TO_HUMAN
DEFER_EXTERNAL_DEPENDENCY
ROLLBACK_CANDIDATE
FAIL_TERMINAL_WITH_EVIDENCE
```

Spec 224 recovery capabilities SHALL be reused for development lifecycle failures.

---

# 63. Cost and Budget Guardrails

Maintenance automation SHALL respect configured cost envelopes.

Examples:

- maximum external model spend per issue;
- maximum paid provider reproduction spend;
- maximum development attempts;
- maximum browser/computer-use attempts;
- maximum infrastructure test cost;
- higher emergency budget for P0 where authorized.

Budget exhaustion SHALL not silently close an unresolved issue.

---

# 64. Analytics Dashboard

The Analytics UI SHALL include at least:

- issues created by period;
- issues by source;
- confirmed-bug rate;
- false-positive rate;
- duplicates avoided;
- P0/P1 volume;
- time to triage;
- time to containment;
- time to resolution;
- time waiting for approval;
- auto-fix eligibility rate;
- auto-fix success rate;
- autonomous deployment success rate;
- rollback rate;
- reopen rate;
- recurring root causes;
- top failing components;
- top failing providers;
- error rate before/after fixes;
- improvement proposals created/accepted/deferred;
- admin intervention rate;
- queue age distribution;
- SLA compliance.

Metrics SHALL be filterable by time, component, tenant scope, release and priority where authorization permits.

---

# 65. Continuous Improvement / Learning Loop

Resolved issues SHALL produce structured learning evidence:

```text
symptom
root cause
successful reproduction
failed hypotheses
successful repair strategy
failed repair strategies
required tests
release outcome
rollback outcome
post-deploy behavior
human corrections
```

This evidence MAY improve future retrieval, diagnosis and prioritization.

It SHALL NOT create unrestricted self-modification of policies or production logic.

Policy/model changes derived from maintenance history SHALL be versioned and governed.

---

# 66. Retrieval and Historical Similarity

The system SHOULD support structured and semantic retrieval over prior maintenance cases.

Use cases:

- find similar previous bugs;
- find known root cause;
- find previous successful repair;
- identify recurring component failure;
- detect duplicate feedback expressed in different words;
- suggest tests that previously caught similar regressions.

Structured identifiers and deterministic fingerprints SHALL remain authoritative where available; vector similarity is supporting evidence, not canonical identity.

---

# 67. Search

Admin global search SHALL support:

- issue id;
- title / description;
- error code;
- stack signature;
- route/feature;
- commit SHA;
- PR number;
- release id;
- job id;
- DevelopmentRun id;
- provider;
- user feedback text subject to permission;
- tags;
- component.

---

# 68. Timeline and Audit

Every item SHALL expose a chronological timeline including:

- observation received;
- duplicate/cluster decision;
- classification changes;
- severity changes;
- priority changes;
- manual overrides;
- evidence additions;
- reproduction attempts;
- work-package versions;
- worker jobs;
- DevelopmentRun transitions;
- approvals;
- commits / PRs;
- verification;
- releases;
- deployments;
- alerts;
- acknowledgement;
- rollback;
- close/reopen events.

Audit events SHALL be append-oriented and tamper-evident according to platform conventions.

Every privileged audit event SHALL include actor/principal, tenant/scope, request/correlation id, event schema version, event time, observed server time where relevant, target resource version, reason code, policy decision reference and before/after references for mutable business state. Clock skew SHALL be measurable for remote Runners/providers where precise time synchronization cannot be assumed.

Audit export SHALL be available to authorized auditors without requiring direct database access.

---

# 69. API Surface

Illustrative endpoints; implementation SHALL follow repository conventions.

```text
POST   /api/maintenance/intake
GET    /api/maintenance/items
POST   /api/maintenance/items
GET    /api/maintenance/items/:id
PATCH  /api/maintenance/items/:id
POST   /api/maintenance/items/:id/triage
POST   /api/maintenance/items/:id/priority
POST   /api/maintenance/items/:id/assign
POST   /api/maintenance/items/:id/merge
POST   /api/maintenance/items/:id/split
POST   /api/maintenance/items/:id/reproduce
POST   /api/maintenance/items/:id/diagnose
POST   /api/maintenance/items/:id/start-repair
POST   /api/maintenance/items/:id/pause
POST   /api/maintenance/items/:id/cancel
POST   /api/maintenance/items/:id/reopen
POST   /api/maintenance/items/:id/close
GET    /api/maintenance/items/:id/timeline
GET    /api/maintenance/queue
PATCH  /api/maintenance/queue/order
GET    /api/maintenance/attention
GET    /api/maintenance/releases
POST   /api/maintenance/releases
POST   /api/maintenance/releases/:id/promote
POST   /api/maintenance/releases/:id/rollback
GET    /api/maintenance/policies
PATCH  /api/maintenance/policies/:id
GET    /api/maintenance/analytics
```

Write APIs SHALL enforce idempotency and authorization.

State-changing APIs SHALL support a stable idempotency key or equivalent command id. Mutations that depend on the current record version SHALL use optimistic concurrency (`row_version`, ETag/`If-Match`, or equivalent) so two administrators or automations cannot silently overwrite each other. Privileged commands SHALL return the canonical command/decision id used for audit correlation.

API errors SHOULD use the platform-standard structured problem format and SHALL distinguish retryable, non-retryable, authorization, stale-version and policy-denied failures.

---

# 70. Event Surface

Illustrative domain events:

```text
maintenance.observation.received
maintenance.item.created
maintenance.item.clustered
maintenance.item.classified
maintenance.item.qualified
maintenance.item.priority_changed
maintenance.item.queue_rank_changed
maintenance.item.assigned
maintenance.item.waiting_approval
maintenance.item.autonomy_granted
maintenance.work_package.created
maintenance.development_run.requested
maintenance.development_run.progress
maintenance.final_verify.completed
maintenance.release_candidate.ready
maintenance.deployment.started
maintenance.deployment.observation
maintenance.deployment.rolled_back
maintenance.item.resolved
maintenance.item.closed
maintenance.item.reopened
maintenance.improvement.created
maintenance.alert.created
maintenance.alert.acknowledged
```

Events SHALL carry references, not secret-rich payloads.

Every domain event SHALL carry an event id, event type, schema version, occurred-at time, producer, tenant/scope, correlation id and aggregate id/version. Consumers SHALL be idempotent by event id. The producer SHALL use the platform transactional-outbox/equivalent durability pattern where required so a committed state transition cannot be silently lost between the database and event transport. Poison events SHALL enter a visible quarantine/dead-letter workflow rather than retry forever.

Where the event transport supports interoperable envelopes, producers SHOULD expose a **CloudEvents-compatible stable envelope** with `id`, `source`, `type`, `specversion`, `time`, `subject` and `dataschema`/schema-reference semantics while keeping the SmartAIHub domain payload separately versioned. Event consumers SHALL ignore unknown additive fields where safe and SHALL reject incompatible major schema changes deterministically rather than misinterpreting them.

---

# 71. Priority Recalculation

Automatic reprioritization SHOULD occur when material evidence changes, including:

- affected-user count rises;
- frequency spikes;
- regression confirmed;
- workaround disappears;
- release blocker status changes;
- security/data-integrity impact discovered;
- issue becomes reproducible;
- dependency resolves;
- issue ages toward SLA breach.

If an administrator has frozen priority, the system SHALL surface the new calculated priority as a recommendation but SHALL NOT silently override the frozen value.

---

# 72. Batch vs Immediate Execution Policy

Not every qualified item SHALL immediately consume development capacity.

Scheduler policy SHALL consider:

- priority;
- available Runner capacity;
- active P0 incident work;
- component conflicts;
- shared test environment capacity;
- release batching policy;
- code-area overlap;
- cost budget;
- dependency readiness.

P0 emergency work MAY preempt lower-priority maintenance jobs according to configured scheduler policy.

---

# 73. Concurrent Repair Conflict Control

The system SHALL detect when multiple repairs touch overlapping components/files/migrations.

It SHALL support:

- serialize conflicting repairs;
- rebase/update candidate;
- rerun affected tests;
- invalidate stale verification;
- merge compatible items into one maintenance batch;
- prevent stale candidate deployment.

Queue claims and privileged execution SHALL use leases/fencing tokens or an equivalent monotonic ownership mechanism so an expired worker cannot continue mutating state after a replacement worker has taken ownership. Candidate/release promotion SHALL compare expected aggregate/candidate versions before mutation.

The scheduler SHALL include starvation protection and per-scope fairness controls so a noisy tenant/component cannot indefinitely starve unrelated P2/P3 work while preserving P0/P1 preemption.

---

# 74. Documentation and Spec Drift

When a bug fix demonstrates that implementation and documented behavior disagree, the repair process SHALL determine whether:

1. code is wrong;
2. spec/docs are wrong;
3. behavior is intentionally changing.

Spec 228 SHALL NOT allow an autonomous bug fix to silently redefine product semantics by changing code and documentation together without the required decision authority.

---

# 75. Test Requirements

Implementation SHALL include tests for at least:

- intake idempotency;
- secret redaction;
- duplicate clustering;
- false-positive handling;
- priority calculation;
- manual priority override;
- frozen priority behavior;
- queue ordering;
- alert generation;
- alert deduplication;
- approval binding;
- autonomy policy denial;
- high-risk component escalation;
- Spec 224 handoff;
- `worker_jobs` linkage;
- failed repair recovery;
- release batching;
- canary failure and rollback;
- automatic reopen;
- tenant isolation;
- security evidence access control;
- stale approval rejection;
- stale candidate rejection;
- concurrent repair conflict handling;
- duplicate/replayed event handling;
- stale lease/fencing rejection;
- optimistic-concurrency conflict UI/API behavior;
- policy-version drift and stale policy decision rejection;
- notification transport outage and fallback;
- dead-letter/poison event recovery;
- maintenance subsystem restart during each non-terminal state;
- artifact digest mismatch rejection;
- provenance/attestation verification where enabled;
- build-once/promote-same-artifact enforcement;
- change-freeze and emergency exception;
- SLO/error-budget priority input;
- security issue CVSS storage/access behavior;
- incident/problem/change linkage;
- legal hold/retention expiry behavior;
- shadow-mode autonomy decision comparison;
- kill-switch behavior;
- chaos/fault injection for worker/provider/database/notification failures.

---

# 76. End-to-End Certification Scenario — Ordinary Auto-Fix

Certification SHALL demonstrate:

```text
1. Runtime emits an application error observation.
2. Observation is redacted and fingerprinted.
3. Existing duplicates are clustered.
4. Qualification determines CONFIRMED_BUG.
5. Severity and priority are calculated.
6. Policy determines low-risk A4_AUTO_DEPLOY eligibility.
7. MaintenanceWorkPackage is created.
8. Spec 224 DevelopmentRun starts without human “continue”.
9. Failure is reproduced.
10. Regression test is added.
11. Repair is implemented.
12. Test/review/verify/Final Verify pass.
13. Candidate commit is pushed through approved GitHub path.
14. Release candidate is created.
15. Canary deploy occurs.
16. Health remains acceptable.
17. Full promotion occurs.
18. Original production error signature disappears.
19. Issue closes with evidence.
20. Admin can inspect the complete timeline afterward.
```

---

# 77. End-to-End Certification Scenario — Approval Required

```text
1. User submits a bug report.
2. System reproduces it.
3. Root cause touches authentication/authorization code.
4. Priority is P1.
5. Policy permits A2_PREPARE only.
6. Spec 224 prepares patch and verification evidence.
7. System enters WAITING_APPROVAL.
8. Admin receives Needs Attention + notification.
9. Admin reviews diff, tests, risk and candidate SHA.
10. Admin approves the bound candidate.
11. Promotion resumes without a new development command.
12. Deployment is observed.
13. Issue closes only after post-deploy verification.
```

---

# 78. End-to-End Certification Scenario — Error Is Not a Bug

```text
1. Repeated error observations arrive.
2. Evidence shows provider rate limiting.
3. Adapter behavior matches documented fallback policy.
4. System classifies EXTERNAL_PROVIDER_FAILURE.
5. No code repair begins.
6. Existing provider-health/fallback path handles execution.
7. Maintenance item records impact and related improvement suggestion if useful.
8. Admin sees the classification and evidence.
```

---

# 79. End-to-End Certification Scenario — Manual Priority Override

```text
1. Three P2 items exist.
2. Automatic scores rank A > B > C.
3. Admin promotes C to P1 and pins it as a release blocker.
4. Reason is recorded.
5. Queue order updates immediately.
6. Scheduler respects new priority.
7. Automatic rescoring later recommends P2 again.
8. Frozen/manual priority remains P1 until authorized change.
9. Audit history shows calculated and effective priority separately.
```

---

# 80. End-to-End Certification Scenario — Critical Incident

```text
1. P0 regression is detected after deployment.
2. System correlates the new error spike to current release.
3. Emergency policy authorizes rollback.
4. Production is rolled back to known-good candidate.
5. Admin receives critical alert and acknowledgement request.
6. Incident remains open.
7. Repair work package is generated.
8. Spec 224 executes permanent repair.
9. Fix receives stricter regression and independent review.
10. Canary succeeds.
11. Production is restored to fixed version.
12. Incident closes with containment + permanent-fix evidence.
```

---

# 81. End-to-End Certification Scenario — Improvement Proposal

```text
1. Telemetry shows users repeatedly retry a workflow step.
2. No functional defect is found.
3. System creates UX_FRICTION / IMPROVEMENT_OPPORTUNITY.
4. Evidence summary explains the repeated friction.
5. Proposed improvement materially changes product behavior.
6. System requests admin/product decision instead of auto-changing semantics.
7. Admin accepts proposal and sets priority.
8. MaintenanceWorkPackage is created.
9. Spec 224 implements and verifies the approved behavior.
10. Post-release analytics measure whether the friction decreases.
```

---

# 82. UI Responsiveness and Cross-Device Requirements

The Maintenance Center SHALL be usable on desktop and tablet. Critical Needs Attention and approval flows SHALL be usable on mobile/PWA through existing cross-device infrastructure where implemented.

Large tables SHALL provide responsive alternatives rather than requiring horizontal desktop-only workflows for critical actions.

---

# 83. Accessibility

Admin UI SHALL target WCAG 2.2 AA-equivalent behavior through the SmartAIHub design system and SHALL support:

- keyboard navigation;
- visible focus;
- semantic labels;
- screen-reader compatible state changes;
- non-color-only severity/priority indicators;
- accessible tables/boards;
- confirmation text for destructive actions.

---

# 84. Performance

Large occurrence volumes SHALL not require rendering every raw event in the primary UI.

The system SHOULD aggregate high-volume occurrences while preserving sampled/raw evidence according to retention policy.

Priority Queue and Overview SHOULD use precomputed/projection-friendly read models where necessary.

---

# 85. Retention

Retention SHALL be configurable by evidence type.

Examples:

- canonical issue/audit metadata: long-lived;
- raw logs: shorter retention;
- sensitive attachments: policy-controlled;
- occurrence aggregates: long-lived;
- notification delivery receipts: operational retention;
- model diagnostic prompts/responses: governed by privacy and debugging policy.

Deleting raw evidence SHALL not corrupt the canonical audit history; the system SHALL record that evidence expired according to policy.

Retention controls SHALL support legal/security hold, tenant/data-residency constraints where configured, and deletion/anonymization workflows that preserve non-identifying operational integrity. A hold SHALL prevent automated expiry only for the explicitly scoped evidence. Authorization to view an expired/deleted evidence placeholder does not restore the deleted payload.

---

# 86. Migration / Adoption Strategy

Implementation SHALL be additive.

Recommended phases:

## Phase 1 — Intake + Canonical IIMS

- normalize existing auto-error feedback;
- normalize user bug reports / feedback;
- create canonical maintenance records;
- build Inbox, Detail and Priority Queue;
- add alert events;
- preserve manual development workflow.

## Phase 2 — Qualification + Prioritization

- evidence enrichment;
- deduplication;
- bug qualification;
- priority scoring;
- manual override / queue control;
- analytics.

## Phase 3 — Spec 224 Repair Handoff

- MaintenanceWorkPackage;
- autonomous DevelopmentRun request;
- progress UI;
- approval gates;
- commit/PR linkage.

## Phase 4 — Release Automation

- maintenance batches;
- hotfix path;
- canary observation;
- rollback integration;
- automatic reopen.

## Phase 5 — Continuous Improvement

- telemetry-derived improvement proposals;
- similarity retrieval;
- recurring root-cause analytics;
- guarded policy/model refinement.

---

# 87. Feature Flags

Major autonomous functions SHALL be separately feature-gated, for example:

```text
maintenance_iims_enabled
maintenance_auto_ingest_enabled
maintenance_auto_dedup_enabled
maintenance_bug_qualification_enabled
maintenance_priority_scoring_enabled
maintenance_auto_reproduce_enabled
maintenance_spec224_handoff_enabled
maintenance_auto_patch_enabled
maintenance_auto_merge_enabled
maintenance_auto_deploy_enabled
maintenance_auto_rollback_enabled
maintenance_improvement_mining_enabled
maintenance_admin_alerts_enabled
```

No rollout SHALL require enabling all autonomy levels at once.

---

# 88. Observability

Spec 228 itself SHALL expose health telemetry for:

- intake lag;
- normalization failures;
- deduplication latency;
- qualification latency;
- queue depth;
- alert delivery latency;
- repair-start latency;
- Spec 224 handoff failures;
- stuck approvals;
- release observation failures;
- rollback failures;
- database/event projection lag;
- failed automation policy evaluations.

A maintenance system that silently stops receiving errors is itself a critical reliability risk.

Telemetry SHOULD follow OpenTelemetry semantic conventions where practical. A stable correlation chain SHALL allow an operator to navigate:

```text
observation_id → maintenance_item_id → incident/problem → worker_job_id
→ development_run_id → candidate_sha/artifact_digest → release_id → deployment_id
```

Metrics SHALL avoid unbounded-cardinality dimensions such as raw user ids, stack traces or arbitrary feedback text. Logs/events SHALL be redacted before export.

A dead-man / heartbeat signal SHALL detect when intake, alert delivery or autonomous scheduling has stopped producing expected health signals.

---

# 89. Failure of Spec 228 Itself

If the maintenance subsystem is impaired:

- production application execution SHALL not depend on its availability unless explicitly designed otherwise;
- intake SHOULD be buffered where possible;
- P0 monitoring SHALL retain an independent fallback alert path where platform architecture provides one;
- automation SHALL fail closed for privileged code/deployment actions;
- unresolved work SHALL remain durable;
- operators SHALL be able to identify backlog/replay requirements after recovery;
- canonical state SHALL have tested backup/restore and disaster-recovery procedures;
- target RPO/RTO SHALL be configurable/documented for the maintenance control plane;
- degraded mode SHALL prevent privileged automation while preserving intake/audit whenever feasible;
- replay SHALL be idempotent and SHALL not repeat already-applied production actions.

---

# 90. Acceptance Criteria

Spec 228 is implementation-complete only when all applicable criteria pass:

1. existing automatic runtime-error feedback can enter the canonical intake;
2. user bug reports can enter the same canonical system;
3. improvement suggestions can enter without being mislabeled as bugs;
4. secrets are redacted before agent exposure;
5. duplicate runtime errors cluster correctly;
6. one issue can contain many occurrences;
7. issue records are not implemented as worker jobs;
8. issue-to-worker-job links are durable;
9. confirmed bug vs provider/user/config failure is distinguishable;
10. reproduction status is explicit;
11. severity and priority are independent;
12. P0–P4 priorities exist;
13. automatic priority is explainable;
14. admin can manually change priority;
15. admin can reorder within priority;
16. admin can pin an item;
17. admin can freeze priority;
18. manual priority override is audited;
19. dependencies/blockers are visible;
20. Maintenance Overview exists;
21. Inbox exists;
22. Priority Queue exists;
23. Issue Detail exists;
24. Active Repairs exists;
25. Needs Attention exists;
26. Releases & Deployments exists;
27. Improvements exists;
28. Automation Policies exists;
29. Alerts & Notification Rules exists;
30. Analytics exists;
31. new P0/P1 item can emit an admin alert;
32. approval-required work emits an actionable alert;
33. alert deduplication prevents notification storms;
34. critical alerts can require acknowledgement;
35. no sensitive evidence is placed in push payloads;
36. autonomy levels A0–A5 are represented;
37. high-risk components default to stricter policy;
38. low-risk repair can proceed without admin approval when authorized;
39. approval-required repair pauses durably;
40. stale approval cannot authorize a materially changed candidate;
41. urgent containment can occur before permanent repair when authorized;
42. MaintenanceWorkPackage is versioned;
43. Spec 224 owns development lifecycle execution;
44. Spec 228 can request a DevelopmentRun;
45. Spec 224 progress is visible from Maintenance UI;
46. coding harness progress does not become canonical lifecycle truth;
47. Final Verify result is linked back to the maintenance item;
48. Git commit SHA is visible;
49. PR is visible where used;
50. release candidate links included items;
51. ordinary items can be batched;
52. emergency item can use hotfix mode;
53. canary/staged deployment can be represented;
54. failed health check can trigger authorized rollback;
55. merge alone does not automatically close a bug;
56. post-deploy verification is supported;
57. recurrence can reopen the issue;
58. recurring failed autonomous repair is bounded;
59. product-semantic improvement requires decision when policy says so;
60. improvement proposals remain separate from urgent bug queue views;
61. tenant isolation is enforced;
62. security evidence has stricter access;
63. audit timeline is complete;
64. analytics include time-to-triage and time-to-resolution;
65. analytics include auto-fix success and rollback rate;
66. Phase 1 can ship without enabling auto-deploy;
67. feature flags allow incremental autonomy rollout;
68. Spec 228 failure does not silently grant unsafe production action;
69. browser reproduction reuses existing Spec 208/213 capabilities;
70. Spec 227 media lifecycle is not collapsed into maintenance development lifecycle.

---

# 91. Recommended Initial Default Policy

For first production rollout:

```text
A0/A1  enabled broadly
A2     enabled for approved repositories/components
A3     disabled by default, enable per low-risk component after evidence
A4     disabled by default, enable only after canary/rollback certification
A5     limited to explicit containment/rollback runbooks
```

This allows SmartAIHub to become progressively autonomous without requiring administrators to approve every ordinary diagnostic action while still protecting high-risk changes.

---

# 92. Recommended Admin Navigation Entry

Primary navigation:

```text
Admin
└─ Maintenance
   ├─ Overview
   ├─ Inbox
   ├─ Priority Queue
   ├─ Active Repairs
   ├─ Needs Attention
   ├─ Releases
   ├─ Improvements
   ├─ Analytics
   └─ Settings
```

Global header SHOULD show a Maintenance badge when urgent items or pending approvals exist.

Example:

```text
🔔 3        Maintenance: 2 P1 · 1 approval
```

Visual presentation SHALL follow SmartAIHub design-system conventions rather than hard-code the emoji example above.

---

# 93. Recommended Maintenance Overview Layout

Desktop conceptual layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ Maintenance                              [Policies] [Settings]│
├─────────┬─────────┬─────────┬─────────┬──────────────────────┤
│ New 12  │ P0/P1 3 │ Repair 4│ Await 2 │ Ready to Release 5   │
├──────────────────────────────┬───────────────────────────────┤
│ Priority Queue               │ Needs Attention               │
│ P0 ...                       │ Deploy approval MNT-1842      │
│ P1 ...                       │ Security review MNT-1811      │
│ P1 ...                       │                               │
├──────────────────────────────┼───────────────────────────────┤
│ Active Repairs               │ Live Activity                 │
│ MNT-1839 TEST                │ 10:02 issue clustered         │
│ MNT-1842 FINAL_VERIFY        │ 10:03 priority escalated      │
├──────────────────────────────┼───────────────────────────────┤
│ Recurring Problems           │ Upcoming Maintenance Release  │
└──────────────────────────────┴───────────────────────────────┘
```

Tablet/mobile layouts SHALL stack panels while preserving urgent action visibility.

---

# 94. Recommended Priority Queue Interaction

An administrator moving an item from P2 to P1 SHALL see:

```text
Move MNT-1842 to P1 High

Calculated priority: P2 Normal
Current effective priority: P2 Normal

Reason:
[ Regression blocks Media Studio export for many users       ]

[ ] Freeze manual priority until changed by an admin

[Cancel] [Change priority]
```

The system SHALL preserve the calculated priority independently so future machine assessment remains inspectable.

---

# 95. Recommended New-Item Alert Experience

For a high-priority new issue:

```text
New P1 maintenance issue
MNT-1842 · Media Studio export fails after latest release

342 occurrences · 81 affected users · regression probable
Autonomous diagnosis is running.

[Open issue] [Acknowledge]
```

No raw stack trace, credential or secret SHALL appear in the alert.

---

# 96. Recommended Autonomous Repair Status Experience

The Admin UI SHOULD communicate maintenance progress at a useful semantic level:

```text
MNT-1842 — Repair in progress

✓ Evidence collected
✓ Bug reproduced
✓ Repair plan verified
✓ Patch implemented
✓ Targeted tests
→ Regression tests
○ Independent review
○ Final Verify
○ Maintenance release
```

Administrators SHALL not need to inspect provider-specific raw logs just to understand current phase.

---

# 97. Data Integrity Invariants

The following SHALL be invariant:

1. deleting a worker job does not delete the maintenance issue;
2. retrying a worker job does not duplicate the issue;
3. changing priority does not alter severity evidence;
4. merging duplicates preserves occurrence provenance;
5. an approval references a specific candidate/decision epoch;
6. a closed issue remains historically queryable;
7. a rollback does not erase the deployment record;
8. reclassification preserves prior classification history;
9. automated model output cannot overwrite immutable audit facts;
10. source-control candidate identity must match verification evidence before promotion.

---

# 98. Security Invariants

1. coding harnesses SHALL receive only scoped credentials/capabilities;
2. production secrets SHALL not be embedded in MaintenanceWorkPackages;
3. push alerts SHALL contain no raw secrets;
4. tenant-scoped reporters SHALL not see cross-tenant evidence;
5. automatic repair SHALL obey repository/component allowlists;
6. automatic merge/deploy SHALL require explicit policy grant;
7. destructive actions SHALL use existing approval/command fencing;
8. security issues SHALL support restricted visibility;
9. prompt-injection text in feedback/logs SHALL be treated as untrusted data;
10. tool instructions embedded in user feedback SHALL NOT automatically become executable maintenance commands.

---

# 99. Implementation Notes

Implementation SHALL first inspect the current repository and reuse existing:

- feedback models/routes;
- admin notification infrastructure;
- job/event schemas;
- audit and approval services;
- GitHub integration;
- Spec 224 DevelopmentRun APIs;
- Spec 226 attention/progress adapters;
- telemetry/logging infrastructure;
- existing design-system components.

The implementation team SHALL prefer adapters and migrations over parallel replacement systems.

---

# 100. Baseline Architecture Decision

Spec 228 establishes SmartAIHub as a platform that can progressively move from:

```text
Bug occurs
→ Admin notices
→ Admin captures screenshot
→ Admin asks Codex/Claude to investigate
→ Admin repeatedly follows up
→ Admin manually verifies
→ Admin manually decides when to deploy
```

into:

```text
Observation detected
→ Evidence captured safely
→ Real bug vs non-bug qualified
→ Duplicate impact aggregated
→ Severity + priority determined
→ Admin alerted only when appropriate
→ Low-risk work proceeds autonomously
→ High-risk decisions pause for approval
→ Spec 224 executes development lifecycle
→ GitHub candidate is verified
→ Maintenance release / hotfix is promoted safely
→ Post-deploy health confirms resolution
→ Issue closes or automatically reopens
→ Outcome improves future diagnosis and prioritization
```

The administrator remains the policy authority and can monitor, reprioritize, pause, approve, reject, defer, release or roll back according to role and configured autonomy policy.

The system SHALL minimize unnecessary human waiting while preserving explicit human control over decisions whose blast radius, product semantics or risk exceed delegated authority.

---



---

# 101. Production-Grade Standards and Practice Alignment

Spec 228 SHALL use broadly accepted engineering/service-management practices as **design references**, not as an unsupported certification claim.

The implementation SHOULD align with the following where applicable:

1. **ISO/IEC 20000-1:2018 (including Amendment 1:2024 where applicable)** — service-management system discipline, lifecycle control and continual improvement;
2. **ISO/IEC 27035-1:2023 / 27035-2:2023** — information-security incident management principles, preparation and lessons learned;
3. **ISO/IEC 25010:2023** — product-quality characteristics for classifying and evaluating improvement outcomes;
4. **NIST SP 800-61 Rev. 3 (2025)** — incident response integrated into cybersecurity risk management;
5. **NIST SP 800-218 SSDF v1.1 (final)** — secure software-development practices; **SP 800-218 Rev. 1 / SSDF v1.2 remains draft as of this revision and SHALL be treated as informative until finalized**;
6. **NIST AI RMF 1.0 + NIST AI 600-1 Generative AI Profile** — governance, measurement and lifecycle risk controls for AI-assisted qualification, prioritization and autonomous remediation;
7. **SLSA v1.2** — verifiable software supply-chain provenance and hardened build expectations;
8. **in-toto Attestation Framework v1.0** — interoperable signed supply-chain claims where used;
9. **SPDX 3.0 project specification and ISO/IEC 5962:2021 baseline** plus **CycloneDX 1.7 / ECMA-424** — machine-readable BOM/security/license interchange; implementation SHALL record exactly which syntax/version it emits;
10. **FIRST CVSS v4.0** — vulnerability severity communication;
11. **FIRST EPSS** and **CISA Known Exploited Vulnerabilities (KEV)** — exploitation likelihood/observed exploitation as prioritization inputs, never substitutes for local exposure and impact;
12. **OpenTelemetry semantic conventions** — consistent traces, metrics, logs, events and cross-system correlation;
13. **CloudEvents stable 1.0 family where practical** — vendor-neutral event envelope interoperability; SmartAIHub domain schema versioning remains explicit;
14. **OpenFeature specification where practical** — vendor-neutral feature-flag evaluation semantics and context handling;
15. **GitHub Rulesets / protected branches / deployment environments** or equivalent source/deployment protection in the configured SCM/CD platform;
16. **DORA software-delivery metrics** — change lead time, deployment frequency, change fail rate and failed-deployment recovery time as operational outcome metrics, not performance quotas;
17. **OWASP secure logging guidance** — safe logging, redaction, failure handling and protection against log abuse;
18. **RFC 2119 / RFC 8174 terminology** — interpretation of normative MUST/SHALL/SHOULD/MAY language;
19. **RFC 9110 HTTP semantics** and explicit idempotency/conditional-write contracts for retry-safe APIs.

Conformance mapping SHALL be maintained as implementation evidence. Standards with multiple current/draft versions SHALL be pinned in an internal alignment manifest. Updating an external reference SHALL require an explicit compatibility review; it SHALL NOT silently alter production behavior.

If SmartAIHub later seeks formal certification against a standard, that SHALL be a separate compliance program covering implementation, operations, people/process controls and audit evidence.

---

# 102. Canonical Operational Record Separation — Incident, Problem, Change and Issue

Production operations SHALL distinguish four related but different concerns:

```text
Issue / Maintenance Item
  = something to fix or improve

Incident
  = active service degradation/outage requiring coordination and restoration

Problem
  = investigation of an underlying/recurring cause

Change
  = governed modification promoted toward/into production
```

Required relationships:

```text
Incident 1 ── N IncidentLink ── N MaintenanceItem
Problem  1 ── N MaintenanceItem
Problem  1 ── N KnownError
Change   1 ── N MaintenanceItem / candidate / release artifact
Postmortem N ── incident / problem / change
```

Closing an Incident because service is restored SHALL NOT automatically close the underlying Maintenance Item or Problem. Conversely, merging a code fix SHALL NOT close an Incident until service recovery is confirmed.

---

# 103. Incident Command and Major-Incident Workflow

For P0 or policy-defined major incidents, Spec 228 SHALL support a dedicated incident coordination state machine:

```text
DETECTED
→ DECLARED
→ TRIAGED
→ MITIGATING
→ MONITORING_RECOVERY
→ RECOVERED
→ POSTMORTEM_PENDING
→ CLOSED
```

Required incident fields:

- incident id/title;
- declaration time;
- affected services/features/tenants;
- severity and current impact;
- incident commander / automated coordinator;
- operations/technical lead where used;
- current mitigation;
- customer/admin communication state;
- timeline/checkpoints;
- linked Maintenance Items / Problems / Changes;
- rollback/containment actions;
- recovery criteria;
- postmortem status.

P0 policy SHALL make restoration/containment the immediate objective; permanent root-cause repair MAY continue after service restoration.

### Admin UI — Incident Command

The **Incidents** page SHALL provide:

- live incident list with impact/status;
- incident commander and responders;
- elapsed time and next checkpoint;
- containment/rollback controls subject to policy;
- live timeline;
- affected services and SLO status;
- linked errors/issues/jobs/deployments;
- alert acknowledgement/escalation status;
- communication notes/status;
- recovery checklist;
- postmortem entry point.

The UI SHALL make it impossible to mistake `RECOVERED` service for `ROOT_CAUSE_FIXED` unless both conditions are actually satisfied.

---

# 104. Problem Management and Known Error Knowledge Base

Repeated/reopened/related issues SHOULD be eligible for a canonical Problem record.

Problem states:

```text
OPEN
INVESTIGATING
ROOT_CAUSE_IDENTIFIED
KNOWN_ERROR
PERMANENT_FIX_PLANNED
FIX_IN_PROGRESS
VERIFYING
RESOLVED
CLOSED
```

A Known Error record SHALL capture:

- verified root cause or bounded causal explanation;
- affected versions/components;
- symptom signatures;
- workaround/containment;
- workaround safety/limitations;
- permanent-fix status;
- expiry/revalidation conditions;
- related tests/runbooks.

The qualification/retrieval engine SHOULD consult Known Errors before launching expensive reproduction or code modification.

### Admin UI — Problems & Known Errors

Required capabilities:

- recurring problem ranking;
- reopen/recurrence trends;
- known workaround visibility;
- linked incidents/issues/releases;
- root-cause confidence;
- permanent-fix plan;
- owner and review date;
- “convert recurring issue to Problem” action;
- “publish internal Known Error” action with restricted/security scope as appropriate.

---

# 105. Root Cause Analysis and Postmortem

A postmortem SHALL be required by configurable policy, including at minimum for major incidents, repeated auto-rollback, serious data-integrity incidents and high-impact security incidents.

Postmortem content SHALL include:

- impact and duration;
- detection source and detection delay;
- timeline;
- contributing factors;
- proximate cause and root-cause analysis when known;
- why safeguards/tests did not prevent/detect earlier;
- containment and recovery actions;
- what worked / did not work;
- follow-up Maintenance Items with owners/priorities;
- test/monitor/runbook/documentation gaps;
- policy/autonomy changes proposed;
- completion tracking.

The system SHALL NOT require an artificial single “root cause” when evidence supports multiple contributing conditions. Human-authored postmortems SHALL remain editable under version/audit control.

---

# 106. Change Management, Maintenance Windows and Change Freeze

Every production-affecting promotion SHALL create or link to a `maintenance_change_record`.

Change types:

```text
STANDARD_CHANGE
NORMAL_CHANGE
EMERGENCY_CHANGE
ROLLBACK_CHANGE
CONFIGURATION_CHANGE
DATA_MIGRATION_CHANGE
```

A change record SHALL contain:

- linked issue/problem/incident;
- candidate SHA and immutable artifact digest;
- risk classification;
- planned environments;
- maintenance window;
- freeze-window status;
- approval/policy decision;
- verification evidence;
- deployment plan;
- rollback/roll-forward plan;
- deployment result;
- post-implementation verification/review.

### Admin UI — Changes / Release Calendar

The UI SHALL provide calendar/list views showing:

- planned maintenance batches/hotfixes;
- change windows;
- freezes;
- active deployments;
- collisions on the same service/component;
- high-risk changes;
- emergency exceptions;
- rollback windows;
- status and owner.

A change-freeze override SHALL require explicit authority and rationale. An emergency change that bypasses normal timing SHALL automatically require retrospective review.

---

# 107. Reliability Objectives, SLO and Error-Budget Integration

Where services have SLOs, Spec 228 SHALL ingest SLO state as operational evidence.

Recommended inputs:

- availability SLI/SLO;
- request/job success SLI;
- latency SLI;
- correctness/data-integrity SLI where measurable;
- current error-budget remaining;
- short/long-window burn rate;
- recent incident budget consumption.

Policy MAY:

- raise priority when error-budget burn is excessive;
- pause risky feature/improvement deployments while reliability is materially below objective;
- require postmortem/follow-up work after a high-budget incident;
- require stronger canary criteria during reliability stress.

SLO data SHALL be evidence, not an excuse to ignore user-reported harm that is not represented by the current SLI set.

### UI

Overview and Analytics SHALL show SLO/error-budget status next to relevant services and correlate budget burn with incidents, releases and recurring Maintenance Items.

---

# 108. Policy Decision Reproducibility and Policy Simulator

All policy-controlled autonomous actions SHALL be reproducible from a versioned policy snapshot and bounded evidence set.

The **Policy Simulator** UI SHALL allow an authorized administrator to select an existing Maintenance Item/candidate or synthetic test case and preview:

- calculated severity/priority;
- autonomy level;
- allowed/denied actions;
- required approvals;
- release mode;
- alert routing;
- policy rules that matched;
- differences between current and proposed policy versions.

Simulation SHALL have no production side effects.

Policy deployment SHALL support:

```text
DRAFT → VALIDATED → SHADOW → ACTIVE → RETIRED
```

A new policy version SHOULD run in shadow/dry-run mode before it is allowed to increase autonomy in production.

---

# 109. Progressive Autonomy, Shadow Mode and Global Kill Switch

Autonomy SHALL be enabled progressively by repository/component/action scope rather than only by a single global level.

Required rollout mechanisms:

- shadow decisions with no mutation;
- compare automated decision vs actual admin decision;
- dry-run work packages;
- limited repository/component allowlist;
- tenant/environment scope;
- percentage/ring rollout where applicable;
- per-action enablement (`patch`, `merge`, `deploy`, `rollback`);
- immediate global and scoped kill switch.

The kill switch SHALL:

- stop creation of new privileged autonomous commands;
- prevent queued-but-not-started privileged actions from starting;
- NOT corrupt already-running work;
- allow policy-defined safe rollback/containment to complete;
- emit a critical audited event;
- be available through an admin UI and a separately protected operational mechanism.

---

# 110. Security Severity, Vulnerability Handling and Coordinated Disclosure

Security vulnerability handling SHALL keep three concepts distinct:

```text
CVSS severity       = standardized vulnerability technical severity
Maintenance severity = SmartAIHub technical/user harm class
Maintenance priority = order/urgency of remediation in SmartAIHub
```

For CVSS-scored vulnerabilities, store:

- CVSS version;
- score;
- vector string;
- scorer/source;
- scored_at;
- environmental context where used.

Security findings SHALL support embargo/restricted visibility, coordinated disclosure status and “do not notify ordinary reporter yet” semantics where disclosure could create risk.

Automated agents SHALL NOT publish exploit details, proof-of-concept material or security advisories as a side effect of ordinary repair automation.

---

# 111. Untrusted Intake and Agent-Safety Boundary

All feedback, logs, stack traces, HTML, screenshots, attachments, repository comments, provider payloads and retrieved historical issue text SHALL be treated as **untrusted data**.

Required controls:

- content-type validation;
- attachment size/type limits;
- malware/safety scanning where supported;
- HTML/script neutralization for admin rendering;
- prompt-injection resistant context separation;
- no tool execution from text instructions embedded in evidence;
- allowlisted tool/capability invocation only;
- sandboxed reproduction for untrusted artifacts;
- URL/network egress policy;
- secret redaction before embedding/LLM use;
- provenance label identifying observation/source.

An LLM recommendation extracted from untrusted evidence SHALL never expand its own authority.

---

# 112. Secure Development and Software Supply-Chain Gates

Maintenance repair shall reuse Spec 224 but Spec 228 SHALL require maintenance-specific security gates appropriate to the risk profile.

Possible gates:

- dependency vulnerability scan;
- secret scan;
- static analysis;
- relevant unit/integration/regression tests;
- security regression/abuse test for security-boundary changes;
- migration safety check;
- license/policy check where used;
- SBOM/dependency manifest generation;
- build provenance/attestation;
- independent verification;
- artifact signature verification where the build/release platform supports it.

An autonomous repair SHALL NOT “fix” a failed security gate by disabling the gate, weakening branch protections or suppressing the finding unless a separately authorized policy change explicitly approves that behavior.

Where SBOM/VEX interchange is enabled, the implementation SHALL emit a documented interoperable format (for example SPDX or CycloneDX), validate the produced document against its declared version, bind it to the immutable artifact digest, and retain format/version metadata. AI-generated or imported code SHALL pass the same license/provenance policy as human-written code.

---

# 113. Immutable Artifact Identity and Promotion

The production deployment SHALL be linked to the exact verified artifact.

Canonical identity chain:

```text
MaintenanceWorkPackage version
→ source candidate SHA
→ build invocation/provenance
→ immutable artifact digest
→ verification certificate
→ release candidate
→ environment deployment
```

If any material element changes, invalidated verification SHALL be rerun.

A deployment record SHALL store the digest actually deployed, not merely a mutable tag such as `latest`.

Rollback targets SHALL use previously known immutable identities.

---

# 114. Delivery Semantics, Idempotency and Replay Safety

Spec 228 SHALL assume distributed delivery can be duplicated, delayed, reordered or retried.

Therefore:

- every intake observation has a globally unique observation/event id;
- every command has a command/idempotency key;
- consumers de-duplicate by durable identity;
- aggregate updates use expected version checks;
- event producers use transactional outbox/equivalent guarantees when a state/event atomic boundary matters;
- retries use bounded backoff with jitter where appropriate;
- non-retryable failures are not retried indefinitely;
- poison messages/events are quarantined visibly;
- replay tools operate in dry-run/preview mode before applying effects;
- replay never repeats external irreversible actions without an explicit replay-safe contract.

The system SHALL target **effectively-once business effects**, not claim impossible end-to-end exactly-once delivery across arbitrary external systems.

---

# 115. Lease, Fencing and Split-Brain Protection

Long-running workers/runners SHALL use canonical lease ownership from the shared job/control plane.

Privileged state mutation after lease acquisition SHALL include a fencing token or equivalent monotonically comparable ownership proof where split-brain could cause harm.

A worker with an expired/stale fence SHALL be rejected even if it later reconnects and attempts to publish success.

This requirement is especially important for:

- deployment;
- rollback;
- source-control promotion;
- migration execution;
- queue pause/resume;
- feature-flag mutation;
- incident containment.

---

# 116. Multi-Tenant Isolation, Fairness and Noisy-Neighbor Protection

Cross-tenant aggregation MAY be used for platform reliability only when authorization/privacy policy allows it.

The system SHALL NOT expose another tenant’s:

- report text;
- attachments;
- user identifiers;
- stack context containing tenant data;
- internal issue comments;
- occurrence counts when those counts could reveal sensitive tenant activity.

Tenant-scoped UI/API queries SHALL apply authorization at the data-access layer, not only in frontend filtering.

Scheduler policy SHOULD support per-tenant/component quotas/fairness while allowing global P0/P1 safety work to preempt lower-priority work.

---

# 117. Evidence Retention, Legal Hold, Data Deletion and Residency

Evidence lifecycle SHALL distinguish canonical operational metadata from raw sensitive evidence.

Required capabilities:

- retention policy by evidence class;
- encryption/access class;
- legal/security hold;
- expiration job with audit record;
- deletion/anonymization workflow;
- evidence tombstone after expiry;
- residency/storage-policy tagging where applicable;
- export controls for authorized audit/compliance use.

Embedding/vector indexes SHALL not outlive the underlying evidence authorization/retention policy. Deleting an evidence object SHALL trigger deletion or invalidation of derived embeddings/search projections where required.

---

# 118. Alert Reliability, Escalation and Dead-Man Monitoring

Alerting is part of the control plane and SHALL be monitored as such.

Required behavior:

- delivery status/latency;
- acknowledgement deadline;
- escalation chain;
- fallback channel for critical alerts where configured;
- dedup/grouping;
- silence/quiet-hours audit;
- critical-event bypass policy;
- test-notification action;
- dead-man/heartbeat alarm if alert generation/delivery silently stops;
- alert-loop prevention when the alert system itself fails.

A P0 SHALL not be considered “human-notified” merely because an event row was written; delivery/acknowledgement state must be observable.

---

# 119. Observability and Correlation Contract

Every maintenance lifecycle SHOULD be traceable across services using stable IDs and OpenTelemetry-compatible telemetry where practical.

Required cross-domain correlation attributes include at least:

```text
maintenance.item.id
maintenance.observation.id
maintenance.incident.id (optional)
maintenance.problem.id (optional)
worker.job.id (optional)
development.run.id (optional)
release.id (optional)
deployment.id (optional)
service.name
tenant.scope (non-sensitive form)
correlation.id
```

Telemetry requirements:

- bounded metric cardinality;
- trace sampling policy that retains critical/error flows appropriately;
- log redaction;
- no raw secrets in span/log attributes;
- instrumentation self-health;
- dashboards for queue saturation, policy failures and event projection lag.

---

# 120. Admin UI Operational Safety and Concurrency

Admin UI mutations SHALL be safe under simultaneous operators/automation.

Required UI behavior:

- show last-updated timestamp/version;
- detect stale edits;
- present conflict/reload/reapply flow instead of last-write-wins for priority, policy and approval-sensitive fields;
- preserve audit reason on bulk actions;
- preview affected count/scope before destructive bulk actions;
- support undo only for actions that are semantically reversible;
- require explicit confirmation for irreversible/high-impact actions;
- show policy denial reason when an action button is unavailable;
- retain accessible non-drag alternatives for queue reordering;
- virtualize/paginate high-volume lists without hiding urgent items;
- provide saved views with owner/share visibility controls;
- provide deep-link stability to canonical records.

Board drag/drop SHALL never be the only way to reprioritize an item.

---

# 121. Capacity Management, Backpressure and Queue Saturation

Spec 228 SHALL detect when maintenance demand exceeds safe execution capacity.

Required controls:

- intake buffering;
- queue-depth thresholds;
- per-stage concurrency limits;
- P0/P1 reserved capacity where configured;
- expensive reproduction rate limits;
- model/provider budget limits;
- scheduler backpressure;
- noisy-fingerprint aggregation;
- starvation aging;
- capacity alerting;
- graceful reduction of low-priority enrichment before dropping canonical intake.

The system SHALL prefer preserving a minimal canonical observation over dropping the event because optional enrichment is overloaded.

---

# 122. Disaster Recovery and Control-Plane Continuity

The maintenance system SHALL have documented and tested recovery behavior.

Minimum requirements:

- backup/restore for canonical data;
- replayable durable events where architecture supports them;
- RPO/RTO targets documented by deployment environment;
- restart/recovery from every non-terminal state;
- recovery of interrupted leases/jobs;
- reconciliation of GitHub/deployment state after control-plane outage;
- idempotent alert/release reconciliation;
- degraded manual mode when autonomy is disabled;
- periodic restore/recovery test evidence.

After recovery, the system SHALL reconcile external reality before retrying destructive operations. For example, it SHALL check whether a deployment actually completed before issuing another deployment command.

---

# 123. Production Verification, Fault Injection and Chaos Tests

Beyond normal unit/integration tests, production-readiness certification SHOULD include controlled fault-injection campaigns for:

- database transient failure;
- Redis/queue interruption;
- duplicate/delayed/out-of-order events;
- worker crash mid-command;
- stale lease continuation;
- Spec 224 restart;
- provider timeout/quota/outage;
- GitHub transient failure;
- notification outage;
- deployment health-signal loss;
- rollback command failure;
- telemetry pipeline failure;
- clock skew;
- high-cardinality/noisy error storm;
- malformed/malicious feedback attachment;
- prompt injection in logs/comments;
- partial region/control-plane outage where relevant.

Fault injection SHALL not be performed against production in a way that can cause uncontrolled customer harm. Production experiments require explicit safety policy, blast-radius limits and abort conditions.

---

# 124. Quality Metrics and Automation Calibration

In addition to operational speed, Spec 228 SHALL measure whether automation is **correct and safe**.

Required/desired metrics:

- qualification precision / false-positive rate;
- sampled false-negative rate where measurable;
- duplicate clustering precision;
- priority override rate;
- autonomy decision disagreement rate vs admin review;
- auto-fix first-attempt success;
- no-progress/loop rate;
- repair-induced regression rate;
- change failure rate for maintenance releases;
- rollback rate;
- reopen rate;
- mean time to detect/acknowledge/contain/restore/resolve;
- alert delivery and acknowledgement latency;
- policy-denial rate;
- stale-decision rejection count;
- security-gate failure rate;
- postmortem action completion;
- SLO/error-budget recovery after repair;
- cost per resolved item by class.

Metric definitions SHALL be versioned. Changes in denominator or sampling SHALL be visible so trend charts do not silently compare incompatible definitions.

---

# 125. 24-Round Production-Grade Gap Audit Record

Revision 2 was hardened through the following independent review dimensions. Each round had to answer: **Can this subsystem fail unsafely, become unauditable, or create operational ambiguity under realistic production conditions?**

| Round | Audit dimension | Gap found in Revision 1 | Revision 2 correction |
|---:|---|---|---|
| 1 | Domain ownership | Issue and live Incident could be conflated | Separate Issue/Incident/Problem/Change canonical records |
| 2 | Major incident operations | No full incident-command lifecycle/UI | Add Incident Command workflow/UI |
| 3 | Recurrence/root cause | Recurring issues lacked Problem/Known Error lifecycle | Add Problem + Known Error model/UI |
| 4 | Learning after incidents | No normative postmortem contract | Add RCA/postmortem + tracked actions |
| 5 | Change governance | Release existed but Change record/windows/freezes incomplete | Add Change model, calendar, freeze/emergency review |
| 6 | Reliability economics | Priority did not formally consume SLO/error-budget signals | Add SLO/error-budget inputs and UI |
| 7 | Policy reproducibility | Autonomy decision lacked immutable decision snapshot | Add PolicyDecisionSnapshot + invalidation |
| 8 | Safe policy rollout | No shadow/simulator lifecycle | Add Policy Simulator and DRAFT→SHADOW→ACTIVE |
| 9 | Emergency stop | Feature flags existed but no explicit autonomous kill switch semantics | Add scoped/global kill switch |
| 10 | Vulnerability severity | Security severity had no standard representation | Add CVSS v4 score+vector while keeping priority separate |
| 11 | Untrusted evidence | Prompt injection mentioned but attachment/evidence boundary incomplete | Add untrusted-intake safety boundary |
| 12 | Secure SDLC | General tests existed; secure-development gates not complete | Add SSDF-aligned maintenance security gates |
| 13 | Supply-chain integrity | Commit/PR traceability lacked artifact provenance | Add SLSA-style provenance/SBOM/attestation hooks |
| 14 | Artifact identity | Verification could theoretically precede a different production rebuild | Add build-once/promote-same-artifact digest binding |
| 15 | Delivery semantics | “idempotent” present but distributed replay semantics underspecified | Add command/event ids, outbox, DLQ and replay safety |
| 16 | Split brain | Concurrent repairs addressed code conflicts, not stale worker authority | Add lease/fencing requirements |
| 17 | Tenant safety | Tenant-aware access existed but aggregation/fairness leakage underspecified | Add isolation + noisy-neighbor controls |
| 18 | Evidence governance | Retention existed but legal hold/derived embeddings/residency incomplete | Add evidence lifecycle controls |
| 19 | Alert reliability | Alert dedup existed but delivery dead-man/fallback incomplete | Add escalation/fallback/heartbeat monitoring |
| 20 | Observability | Health metrics existed but no cross-system correlation contract | Add OTel-compatible correlation schema |
| 21 | Admin concurrency | Priority UI strong, but simultaneous edit conflict behavior missing | Add optimistic concurrency/stale-edit UX |
| 22 | Capacity/backpressure | Scheduling existed but overload degradation policy incomplete | Add saturation/backpressure/reserved capacity |
| 23 | Disaster recovery | Spec-self-failure existed but RPO/RTO/external reconciliation incomplete | Add DR/reconciliation contract |
| 24 | Production certification | Test list lacked systematic fault injection and automation calibration | Add chaos/fault campaigns + correctness metrics |

Revision 2 SHALL NOT be considered production-ready merely because these requirements are documented. Implementation must produce the test, audit, security, recovery and deployment evidence required by the acceptance criteria.

---

# 126. Revision 2 Additional Acceptance Criteria

In addition to Section 90, production certification SHALL demonstrate:

71. Incident, Maintenance Item, Problem and Change records are distinct and linkable;
72. closing an Incident does not silently close an unresolved Problem/Maintenance Item;
73. P0 incident command UI shows impact, commander, mitigation, timeline and recovery state;
74. a recurring issue can become a Problem/Known Error with a reusable workaround;
75. configured major incidents generate a postmortem requirement;
76. postmortem follow-up actions become tracked Maintenance Items;
77. production promotion creates/links a Change record;
78. maintenance/freeze windows are enforced;
79. emergency change exceptions are auditable and trigger retrospective review;
80. SLO/error-budget state can influence priority/change policy without replacing severity;
81. every privileged autonomy decision stores policy id/version/hash and evidence snapshot;
82. materially changed policy/candidate/risk invalidates stale authorization where required;
83. Policy Simulator produces no side effects;
84. new higher-autonomy policy can run in shadow mode;
85. scoped/global autonomy kill switch is certified;
86. CVSS v4 score and vector can be stored for applicable vulnerabilities;
87. malicious feedback/log instructions cannot cause tool execution or authority expansion;
88. maintenance security gates cannot be silently disabled by the repairing agent;
89. verified candidate maps to immutable artifact digest;
90. deployed digest matches required verified digest;
91. build/provenance attestation is stored/verified when that capability is enabled;
92. duplicate command/event delivery produces one business effect;
93. poison event is quarantined rather than infinitely retried;
94. stale lease/fencing token cannot deploy/rollback/promote;
95. simultaneous admin edits produce explicit conflict rather than silent overwrite;
96. tenant-scoped operators cannot retrieve cross-tenant evidence through API/search/export;
97. scheduler fairness/noisy-neighbor controls are exercised under load;
98. legal hold prevents scoped evidence expiry;
99. evidence deletion invalidates derived embeddings/projections where policy requires;
100. critical alert delivery/ack state is observable and fallback escalation works;
101. alert/intake dead-man detects silent pipeline failure;
102. observation→issue→job→DevelopmentRun→artifact→release→deployment correlation works end-to-end;
103. high-volume metrics do not use unbounded raw user/feedback dimensions;
104. capacity saturation preserves canonical intake while degrading optional enrichment;
105. backup/restore is tested against documented RPO/RTO targets;
106. restart/recovery from every non-terminal state is certified;
107. external deployment/GitHub reality is reconciled after control-plane outage before retry;
108. controlled fault injection covers duplicate/out-of-order events and worker crash mid-command;
109. malformed/malicious evidence cannot compromise the admin UI or execution sandbox;
110. auto-fix/change-failure/reopen/rollback/priority-override metrics are measurable;
111. metric definition versions prevent silent historical comparison drift;
112. no privileged autonomous action depends solely on LLM confidence;
113. high-risk separation-of-duties policy prevents self-approval;
114. board drag/drop has an accessible non-drag equivalent;
115. audit export is available to authorized roles without direct DB access;
116. expired/raw evidence removal does not break canonical audit lineage;
117. emergency containment and permanent repair remain separately visible;
118. service recovery and root-cause resolution remain separately visible;
119. reporter-facing status never leaks restricted security/cross-tenant evidence;
120. production rollout can begin at A0/A1/A2 with A3/A4/A5 independently disabled.

---

# 127. Implementation Order for Production Readiness

Recommended implementation order after Revision 2:

```text
R2-A  Canonical entities + migrations
      Observation / Item / Incident / Problem / KnownError / Change

R2-B  Durable command/event contracts
      idempotency / versions / outbox / DLQ / fencing

R2-C  Admin Maintenance Center
      Overview / Inbox / Queue / Incidents / Problems / Attention

R2-D  Qualification + priority + SLO + alert routing

R2-E  Spec 224 handoff + immutable policy decision snapshots

R2-F  Source/supply-chain evidence
      SHA / artifact digest / provenance / verification certificate

R2-G  Change / release / canary / rollback / post-deploy verification

R2-H  Progressive autonomy
      shadow → A2 → scoped A3/A4; kill switch certified first

R2-I  DR / fault-injection / security / load / accessibility certification

R2-J  Production acceptance evidence + controlled rollout
```

A3/A4 autonomous merge/deploy SHALL NOT be enabled merely because application code is complete. The corresponding policy simulator, kill switch, audit, fencing, artifact identity, rollback and recovery tests MUST also pass.

---

# 128. Final Production-Grade Architecture Decision

The production target is therefore:

```text
Signals / Feedback / Tests / Telemetry
                  ↓
          Observation Intake
       redact / validate / dedup
                  ↓
        IIMS Canonical Records
     Issue ─ Incident ─ Problem
              │           │
              └── Known Error
                  ↓
       Qualification / Evidence
                  ↓
 Severity + Priority + SLO Context
                  ↓
 Policy Snapshot / Autonomy Decision
          │              │
    human gate       autonomous path
          └──────┬───────┘
                 ↓
        MaintenanceWorkPackage
                 ↓
      Spec 224 DevelopmentRun
                 ↓
 source SHA → verified immutable artifact
                 ↓
        Change / Release Record
                 ↓
 staging → canary → production
                 ↓
    observe / rollback / reopen
                 ↓
 Problem / Postmortem / Improvement
                 ↓
      governed learning feedback
```

The system SHALL optimize for **safe autonomous recovery and continual improvement**, not maximum autonomous code churn. The correct production-grade outcome may be to auto-contain, auto-classify, auto-prepare a verified patch, request a bounded decision, defer an unsafe change, or roll back — not necessarily to modify and deploy code every time an error appears.

The administrator remains policy authority, but routine low-risk maintenance can proceed without continuous human attendance once the relevant autonomy scope has earned and passed its certification gates.

---


# 129. Revision 3 — Second 24-Round Production Hardening Scope

Revision 3 performs a second independent production audit. It does **not** re-count the 24 dimensions from Revision 2. The question for every round is:

> Can SmartAIHub safely run this maintenance system unattended for long periods, across multiple services/tenants/providers/releases, while the AI models, dependencies, schemas, operators and infrastructure change underneath it?

The following Sections 130–153 are normative corrections discovered in that audit.

---

# 130. Service Catalog, Component Ownership and Criticality Registry

A maintenance system cannot safely prioritize or autonomously modify a component it cannot identify and own.

Spec 228 SHALL maintain or integrate with a canonical **Service/Component Registry** containing, at minimum:

```text
component_id
service_id
name
repository + paths
runtime/deployment unit
environments
owner team / code owners
on-call route
business criticality tier
data classification
security boundary tags
tenant exposure
regions/residency
SLO references
runbook references
dependency edges
feature-flag namespace
last ownership review
```

Every Maintenance Item SHOULD resolve to one or more components before A2+ work begins. If component ownership/criticality cannot be resolved, autonomy SHALL be capped by policy; unknown ownership MUST NOT be interpreted as low risk.

Repository paths SHOULD map to code owners and deployment units. Ownership drift SHALL be detectable.

### Admin UI — Service Map & Ownership

The UI SHALL provide:

- searchable services/components;
- owners/on-call route;
- repository and deploy target;
- criticality/security/data tags;
- open P0/P1 items/incidents;
- SLO/error-budget state;
- recent changes/deployments;
- known problems;
- dependency graph;
- “unowned component” and stale-owner warnings.

---

# 131. Customer Impact, Status Communication and Stakeholder Updates

Major incidents require more than internal alerts.

Spec 228 SHALL support governed communication records for affected users/tenants/stakeholders when configured:

```text
DRAFT
APPROVAL_REQUIRED
APPROVED
PUBLISHED
UPDATED
RESOLVED_NOTICE
RETRACTED
```

A communication record SHALL capture audience, channel, incident/item reference, approved content/version, publisher, timestamps and visibility classification.

The system MAY integrate with a status page, in-product banner, email or tenant notification service, but SHALL NOT disclose:

- exploit details;
- secrets;
- another tenant’s impact;
- unverified root-cause claims;
- internal security evidence.

“Service recovered” and “permanent fix deployed” SHALL remain separately communicable states.

For automated communication, templates SHALL be policy-controlled and the generated message SHALL be bounded to verified facts. High-impact/security-sensitive external communication SHOULD require human approval unless a pre-approved template/runbook applies.

---

# 132. Vulnerability Prioritization Beyond CVSS

CVSS severity alone SHALL NOT determine vulnerability-remediation priority.

For applicable CVEs/dependency findings, the decision engine SHOULD ingest:

- CVSS v4 score/vector;
- CISA KEV membership and date added;
- FIRST EPSS score/percentile and observation date;
- product/component exposure;
- reachability/exploit path evidence;
- VEX status where available;
- internet/public exposure;
- asset/service criticality;
- tenant/data sensitivity;
- compensating controls;
- patch/fixed-version availability;
- active incident/exploitation evidence;
- vendor urgency/advisory information.

`KEV=true` SHALL be treated as strong evidence of real-world exploitation, not merely theoretical severity. EPSS SHALL be treated as a time-varying probability signal, not a severity score. VEX “not affected” assertions SHALL be retained with provenance and SHALL NOT suppress remediation when contradictory runtime evidence exists.

### Admin UI — Vulnerabilities

The page SHALL show CVE/package/component, affected deployed versions, CVSS, KEV, EPSS, VEX, exposure, linked incidents/items, fixed version, SLA and remediation state. Filters SHALL support “known exploited”, “internet exposed”, “reachable”, “no fix”, “overdue” and “suppressed with evidence”.

---

# 133. SBOM/VEX Interoperability, License and Provenance Policy

Software transparency artifacts SHALL be machine-readable and artifact-bound.

SmartAIHub SHALL support at least one production SBOM format and SHOULD support both major ecosystems where useful:

- SPDX;
- CycloneDX.

The implementation SHALL record:

```text
format
spec_version
artifact_digest
sbom_digest
producer/tool version
generated_at
validation_result
storage reference
```

VEX SHOULD be supported for contextual exploitability status. Package identity SHOULD use Package URL (`purl`) where applicable.

License/provenance gates SHALL detect at least:

- disallowed/incompatible licenses according to configured policy;
- unknown license where policy requires review;
- unexpected vendored/binary dependencies;
- generated/copied code whose origin cannot be established when provenance policy requires it.

An AI-generated repair SHALL not receive weaker IP/license controls than a human-authored change.

---

# 134. Source-Control and Deployment Protection as Enforced External Gates

SmartAIHub policy SHALL be an **additional** control layer, not a replacement for repository/deployment protections.

For GitHub-backed repositories, implementation SHOULD use Rulesets/protected branches and deployment environments where plan capabilities permit, including applicable controls such as:

- PR required before protected-branch merge;
- required status checks;
- signed commits/tags where configured;
- required code-owner/security review;
- stale-review invalidation where appropriate;
- prohibition of force-push/deletion;
- required deployment environment checks;
- prevention of self-review for protected deployment where available.

Equivalent controls SHALL be used on other SCM/CD providers.

Before A3/A4 actions, Spec 228 SHALL verify that expected external protections still exist. Protection drift SHALL fail closed for autonomous merge/deploy and raise a high-priority administrative alert.

The coding identity SHALL NOT be authorized to weaken the protections that govern its own promotion path.

---

# 135. Feature-Flag Governance and Emergency-Control Lifecycle

Feature flags are production configuration and SHALL be governed as changes.

Where a feature-flag abstraction is used, SmartAIHub SHOULD expose OpenFeature-compatible evaluation semantics or an adapter boundary so the maintenance system is not permanently coupled to one flag vendor.

Every autonomous flag mutation SHALL record:

```text
flag_key
provider/domain
evaluation/target scope
old value
new value
reason
policy decision
actor/automation identity
expiry/review_at
rollback value
```

Emergency-disable flags SHALL support an out-of-band operational path when the main UI/control plane is impaired.

Temporary repair/kill flags SHALL have an owner and expiry/review date. Stale flags SHALL be surfaced as technical debt; a permanent repair MUST NOT leave an emergency flag silently indefinite.

Evaluation context SHALL avoid raw secrets/PII unless explicitly required and authorized.

---

# 136. Database and Data-Migration Safety

Database/data changes require a dedicated safety contract beyond ordinary source-code testing.

For any migration, Spec 228 SHALL classify:

```text
SCHEMA_ADDITIVE
SCHEMA_DESTRUCTIVE
DATA_BACKFILL
DATA_TRANSFORM
INDEX_CHANGE
CONSTRAINT_CHANGE
STORAGE_MOVE
TENANT_DATA_MIGRATION
```

Migration plans SHALL include:

- schema/data preconditions;
- affected tables/tenants/volume;
- lock and timeout risk;
- forward/backward application compatibility;
- backup/snapshot or verified recovery strategy when appropriate;
- idempotency/resume behavior;
- progress checkpoints;
- verification queries/invariants;
- rollback vs roll-forward strategy;
- abort thresholds;
- expected runtime/resource impact.

The preferred online pattern SHOULD be **expand → migrate/backfill → verify → contract** when applicable.

Destructive migration SHALL default to human approval and SHALL NOT be auto-authorized merely because generated tests pass. For large migrations, production execution SHOULD be chunked/resumable with bounded lock time and tenant/service impact.

Schema drift between declared migrations and production SHALL be detectable before autonomous repair/deploy.

---

# 137. API, Event and Schema Compatibility Contract

Autonomous maintenance can break consumers even when local tests pass. Therefore Spec 228 SHALL maintain compatibility contracts for public/internal APIs and durable events.

Required controls where applicable:

- API/schema version identifier;
- machine-readable schema reference/digest;
- consumer/contract tests;
- backward/forward compatibility check;
- deprecation window and owner;
- replay tests for durable events;
- fixture corpus for historical payloads;
- unknown-additive-field tolerance where schema permits;
- explicit major-version migration for breaking semantics.

For evented integrations, a CloudEvents-compatible envelope SHOULD be used where practical, but **CloudEvents does not replace SmartAIHub payload schema/version governance**.

A repair that changes durable event semantics SHALL trigger replay/consumer compatibility tests before A3/A4 promotion.

---

# 138. Configuration, Secrets and Infrastructure-as-Code Drift

Production defects may originate from configuration drift rather than application code.

The diagnosis engine SHALL distinguish:

```text
CODE_DEFECT
CONFIGURATION_DEFECT
SECRET_ROTATION/EXPIRY
INFRASTRUCTURE_DRIFT
FEATURE_FLAG_DEFECT
DEPENDENCY_CONFIGURATION
UNKNOWN
```

Where infrastructure/configuration is managed declaratively, autonomous repair SHOULD update the canonical desired state and let the normal reconciler apply it rather than making an untracked production mutation.

Direct emergency mutation MAY be allowed by runbook, but SHALL create a follow-up reconciliation item so desired state and actual state converge.

Secrets SHALL NOT be written into source control, issue text, work packages, logs or model context. Secret rotation SHALL use the canonical secret broker/provider and store only references/audit metadata.

---

# 139. External Dependency and Provider Incident Correlation

Provider outages SHALL not trigger unnecessary code churn.

Spec 228 SHALL correlate external failure signals using available evidence such as:

- provider HTTP/error codes;
- quota/rate-limit state;
- provider status/incident feed where available;
- failure concentration across tenants/services;
- fallback-provider health;
- known provider maintenance;
- recent local code/config change absence.

When evidence strongly indicates an external outage, the default response SHOULD be containment/fallback/retry-policy adjustment rather than source modification.

Provider incidents SHOULD have a distinct record/link and may suppress duplicate local bug creation while preserving occurrence counts and affected-user evidence.

When the provider recovers, the system SHALL verify local recovery before auto-closing linked impact.

---

# 140. Intake Abuse, Spam and Economic-Denial-of-Service Controls

Because user reports can trigger expensive AI/reproduction work, intake itself is a resource boundary.

Required controls:

- per-user/tenant/source rate limits;
- duplicate/fingerprint aggregation before expensive enrichment;
- attachment quotas;
- model/reproduction budget by priority/trust class;
- suspicious automation/bot/spam detection;
- bounded recursive link/file fetching;
- queue admission control;
- quarantine/review for abusive payloads;
- cost-attribution telemetry;
- hard budget stop that preserves the canonical report while skipping optional enrichment.

A malicious or noisy reporter SHALL NOT be able to consume unlimited model tokens, browser sessions, CI minutes or runner capacity simply by generating unique-looking error text.

---

# 141. On-Call, Escalation Schedule and Ownership Governance

Critical alert routing SHALL resolve to a real accountable responder path.

Spec 228 SHALL support integration with an on-call/escalation source of truth or maintain equivalent data:

```text
team
primary
secondary
schedule/timezone
escalation delay
channel(s)
coverage state
last tested
```

P0/P1 items with no resolvable owner/on-call path SHALL generate an **ownership failure alert** to a platform-level fallback route.

Alert acknowledgement SHALL identify the acting principal. Reassignment and handoff SHALL be visible on the incident timeline.

### Admin UI — Alerts, On-call & Escalation

The UI SHALL show routing policy, current primary/backup, unacknowledged critical alerts, next escalation, delivery health, schedule gaps and a test-escalation action.

---

# 142. Evidence Consent, Data Minimization and Reporter Privacy UX

Automatic evidence collection SHALL apply data-minimization principles.

For user-submitted reports, the UI SHOULD let the user understand what is being attached and, where practical, preview/remove optional screenshots/files before submission.

Evidence policies SHALL distinguish:

- required operational telemetry already authorized by platform terms/policy;
- optional diagnostic logs;
- screenshots/screen recordings;
- user-provided attachments;
- potentially sensitive content.

The system SHALL capture only what is needed for diagnosis, redact before broad access/model use, and preserve the applicable consent/legal basis metadata where required by deployment policy.

Reporter identity SHOULD be separable from diagnostic evidence so anonymization/deletion can occur without destroying the canonical engineering/audit record.

---

# 143. AI Decision Governance, Model/Prompt Versioning and Drift

AI-assisted qualification/prioritization/remediation SHALL be treated as a versioned decision dependency.

Every materially consequential AI decision SHALL persist, as applicable:

```text
provider
model identifier/version
endpoint/profile
prompt/template version or hash
policy version
retrieval corpus/index version
relevant tool/capability manifest version
sampling/configuration profile
input evidence refs
structured output schema version
confidence/calibration metadata
latency/cost
fallback path used
```

The system SHALL maintain representative offline evaluation sets for at least:

- bug vs non-bug qualification;
- severity/priority recommendations;
- duplicate clustering;
- unsafe/autonomy-boundary scenarios;
- remediation-plan quality.

A model/prompt/provider upgrade that can materially change autonomous decisions SHALL pass regression evaluation and SHOULD run in shadow/canary mode before broader authority is granted.

Drift monitoring SHALL track disagreement/override/false-positive/repair-failure trends by model/prompt version. A degraded model version SHALL be revocable without rewriting historical decisions.

This governance SHOULD align with NIST AI RMF / Generative AI Profile principles while preserving SmartAIHub’s explicit policy gates as the actual authority source.

---

# 144. Independent Verification and Anti-Self-Approval Controls

“Independent review” SHALL have a concrete independence definition by risk class.

For high-risk changes, policy SHALL require one or more of:

- verifier process isolated from implementer workspace;
- independent test execution from clean checkout/artifact;
- distinct model/harness/provider for review;
- code-owner/security-owner approval;
- deployment approver different from the initiating identity;
- deterministic/security tooling independent of LLM judgment.

The same agent/model session that authored a risky patch SHALL NOT be the sole authority that declares it safe.

Changing the candidate after approval/review SHALL invalidate stale approvals according to repository/policy semantics.

---

# 145. Self-Maintenance Bootstrap, Root of Trust and Last-Known-Good Controller

Spec 228 and Spec 224 themselves are special maintenance targets because defects in the maintenance/development control planes can invalidate their own decisions.

A repair that modifies:

- Spec 228 policy/executor;
- Spec 224 lifecycle/verification authority;
- approval service;
- worker-job authority/fencing;
- source/deployment protection integration;
- secret broker;

SHALL be classified as **control-plane self-maintenance** and use stricter gates.

Required protections:

- last-known-good controller/runtime artifact;
- upgrade candidate verified outside the candidate process where practical;
- no simultaneous unreviewed mutation of both policy and enforcing executor;
- canary/standby controller rollout;
- rollback path that does not depend solely on the broken new controller;
- migration compatibility between old/new controller versions;
- recovery drill proving in-flight work can be reconciled.

Autonomy SHALL fail closed if the root-of-trust state is ambiguous.

---

# 146. Autonomous Repair Loop Circuit Breaker and Churn Prevention

Autonomous systems can oscillate between patch, deploy and rollback. Spec 228 SHALL explicitly detect and stop this behavior.

Per-item/component policy SHALL define:

- max repair attempts per evidence epoch;
- max deployments/rollbacks in a rolling window;
- max cumulative model/runner/CI cost;
- no-progress threshold;
- cooldown after repeated rollback;
- repeated diff/revert detection;
- repeated identical failure-signature detection;
- escalation threshold.

If the candidate alternates between materially equivalent states or repeatedly reintroduces a recently reverted change, the system SHALL transition to `WAITING_HUMAN_DECISION` or `BLOCKED_RECOVERABLE` rather than continuing indefinitely.

An evidence change may start a new bounded attempt epoch; merely waiting and retrying SHALL NOT reset the circuit breaker.

---

# 147. Cross-Service Dependency and Coordinated Release Safety

A maintenance fix may span multiple services/repos/deployments.

Spec 228 SHALL model change dependencies such as:

```text
DEPLOY_BEFORE
DEPLOY_AFTER
COMPATIBLE_WITH
REQUIRES_SCHEMA_VERSION
REQUIRES_FLAG_STATE
MUST_NOT_OVERLAP
ROLLBACK_TOGETHER
```

For multi-service change sets, the release plan SHALL define compatibility windows, ordering, partial-failure behavior and rollback/roll-forward strategy.

The scheduler SHALL prevent conflicting concurrent changes to the same protected component/dependency set unless the changes are explicitly proven compatible.

A “green” result from one service SHALL NOT close the maintenance item while a dependent service remains unverified.

---

# 148. Progressive Delivery, Cohorts and Automatic Abort Thresholds

Canary deployment SHALL be more specific than “deploy to a small percentage and observe”.

A progressive rollout plan SHOULD specify:

```text
baseline/control reference
initial cohort/ring
traffic/user/tenant percentage
minimum observation time or sample
health metrics
business/correctness guardrails
abort thresholds
promotion thresholds
max step size
max total rollout duration
```

Cohorts SHALL respect tenant/data/regional restrictions. High-value tenants SHALL not be used as involuntary high-risk canaries solely because they generate more traffic.

Automatic promotion SHALL require sufficient signal according to policy. Missing/invalid telemetry SHALL fail closed or hold the rollout, not be treated as success.

---

# 149. Correctness Oracles, Synthetic Transactions and Data Invariants

Infrastructure health alone cannot prove a bug is fixed.

Where feasible, post-deploy verification SHALL include **correctness oracles** such as:

- deterministic business-rule assertions;
- synthetic end-to-end user journeys;
- API contract probes;
- queue/job round trips;
- data integrity/checksum/count invariants;
- permission-boundary tests;
- payment/credit dry-run/sandbox verification;
- browser/computer-use golden paths for UI regressions;
- comparison against known-good outputs.

A service returning HTTP 200 SHALL NOT by itself prove semantic correctness.

For destructive/data-sensitive changes, verification SHALL check both absence of new errors and preservation of defined invariants.

---

# 150. Audit Integrity, Time Provenance and Export Verification

The audit log is evidence and SHALL be protected against undetected mutation.

The platform SHALL implement one or more tamper-evidence controls appropriate to deployment risk, such as:

- append-only storage permissions;
- immutable/WORM retention tier for selected events;
- chained event hashes/Merkle batches;
- signed audit export manifests;
- independent replication/checkpointing.

The canonical server receipt time SHALL be stored separately from producer-reported event time. Remote clock offset/uncertainty SHOULD be captured where available.

Audit export SHALL include a manifest/digest so an auditor can detect truncation or mutation of the exported package.

No autonomous repair identity SHALL have unilateral authority to erase the audit trail of its own actions.

---

# 151. Operational Readiness Review, Runbook Certification and Game Days

A component SHALL NOT graduate to A3/A4 merely because its code tests pass.

Before higher autonomy, an **Operational Readiness Review (ORR)** SHALL verify applicable items:

- owner/on-call assigned;
- criticality/data classification known;
- SLO/health signals exist;
- rollback/containment tested;
- runbook current;
- alert route tested;
- backup/restore applicable and tested;
- deployment protection active;
- dependency map adequate;
- synthetic/correctness verification available;
- kill switch tested;
- cost/budget guardrails configured;
- failure/recovery game day completed for critical components.

ORR evidence SHALL have an expiry/review date. Major architecture changes SHALL trigger re-review.

### Admin UI — Operational Readiness

The UI SHALL show readiness by component, missing controls, autonomy ceiling, last certification/game day, expiring evidence and blockers to increasing autonomy.

---

# 152. Improvement Experimentation and Product-Outcome Guardrails

An improvement is not equivalent to a defect repair. For product/UX/performance improvements whose benefit is uncertain, Spec 228 SHALL support an experiment path instead of directly declaring the change “better”.

An experiment proposal SHOULD define:

- hypothesis;
- target cohort;
- primary success metric;
- safety/guardrail metrics;
- minimum observation period/sample;
- rollback/disable method;
- privacy/consent implications;
- decision owner;
- stop/promote criteria.

Where suitable, improvement rollout SHOULD use a feature flag and controlled cohort. The system SHALL NOT optimize one local metric while violating declared guardrails (for example reducing latency while materially increasing errors or cost).

AI may recommend an experiment, but ambiguous product-value tradeoffs remain a human/product decision according to policy.

Improvement proposals SHOULD tag the quality characteristic(s) they intend to improve using a stable internal taxonomy that MAY map to ISO/IEC 25010:2023 (for example performance efficiency, reliability, security, maintainability, compatibility, interaction capability and related product-quality characteristics). The mapping is descriptive; it SHALL NOT be treated as ISO certification.

---

# 153. Ephemeral Resource Cleanup, Credential Revocation and Orphan Reconciliation

Every repair attempt can leave operational debris. Spec 228 SHALL track and clean ephemeral resources including:

- branches/worktrees;
- temporary PRs;
- sandboxes/containers/VMs;
- temporary test databases;
- temporary buckets/objects;
- ephemeral credentials/tokens;
- leases/locks;
- browser sessions;
- preview deployments;
- generated evidence/artifacts subject to retention policy.

Each resource SHALL have owner/run linkage and cleanup policy/TTL where feasible.

Cleanup SHALL be idempotent and MUST NOT delete evidence/artifacts under legal/security hold or required for reproducibility.

A periodic reconciler SHALL detect orphan resources after crashes/restarts and either clean or surface them. Temporary credentials SHALL be revoked/expired even when the DevelopmentRun fails terminally.

---

# 154. Revision 3 — Second 24-Round Gap Audit Record

Revision 3 independently audited the following dimensions and incorporated each correction above.

| Round | Independent audit dimension | Gap remaining after Revision 2 | Revision 3 correction |
|---:|---|---|---|
| 1 | Service ownership/criticality | Risk model could act without authoritative component owner/tier | Service/Component Registry + Service Map |
| 2 | Customer/stakeholder communication | Incident UI lacked governed outward communication records | Customer Communication workflow |
| 3 | Exploited-vulnerability prioritization | CVSS alone did not model exploitation likelihood/reality | KEV + EPSS + exposure + VEX inputs |
| 4 | SBOM/VEX interoperability | “SBOM where available” lacked format/version contract | SPDX/CycloneDX/VEX artifact-bound contract |
| 5 | External SCM/CD enforcement | Internal policy could drift from GitHub protections | Ruleset/environment verification + fail closed |
| 6 | Feature flags | Flags existed as containment but lacked lifecycle/audit standard | OpenFeature-compatible boundary + expiry/cleanup |
| 7 | Database migration | Migration risk was listed but not operationally specified | Expand/migrate/contract + resumable verification |
| 8 | API/event compatibility | Local tests could pass while breaking consumers | Contract/schema/replay compatibility gates |
| 9 | Configuration/IaC drift | System could misdiagnose config drift as code bug | Config/secret/IaC classification + reconciliation |
| 10 | Third-party outage correlation | Provider outage could trigger code churn | Dependency-health correlation + provider incident path |
| 11 | Intake/economic abuse | User reports could consume unbounded AI/runner resources | Rate limits, budgets, admission and quarantine |
| 12 | On-call ownership | “alert delivered” did not prove accountable responder exists | On-call schedule/fallback ownership governance |
| 13 | Reporter privacy/consent | Redaction existed but capture UX/minimization underspecified | Evidence consent/data-minimization contract |
| 14 | AI model/prompt lifecycle | Policy was versioned but AI dependency itself was not fully reproducible | Model/prompt/tool/RAG versioning + eval/drift |
| 15 | Verification independence | “independent review” had no enforceable definition | Anti-self-approval independence policy |
| 16 | Self-maintenance bootstrap | Controller could theoretically certify its own broken replacement | LKG controller/root-of-trust/canary upgrade |
| 17 | Autonomous oscillation | Retry bounds did not fully prevent patch↔rollback churn | Repair-loop circuit breaker |
| 18 | Multi-service changes | Change records lacked cross-service ordering/atomicity semantics | Coordinated dependency/release model |
| 19 | Canary rigor | Canary existed without explicit sample/abort/promotion contract | Progressive-delivery thresholds/cohorts |
| 20 | Semantic correctness | Health/error-rate checks might miss wrong business results | Correctness oracles/synthetic transactions |
| 21 | Audit non-repudiation | Append-oriented log lacked concrete tamper evidence/export verification | Hash/immutable/signature options + time provenance |
| 22 | Operational readiness | A3/A4 could be enabled without service-readiness certification | ORR + game-day gate |
| 23 | Improvement validation | “improvement” could be deployed without proving benefit | Experiment hypothesis/metrics/guardrails |
| 24 | Resource leakage | Failed runs could leave credentials/sandboxes/preview resources | Cleanup TTL/revocation/orphan reconciliation |

After this second 24-round pass, no unresolved **architecture-level blocker** was identified inside Spec 228’s defined scope. This statement is not a claim that an implementation is production-ready; production readiness requires the evidence and tests in Sections 90, 126 and 155.

---

# 155. Revision 3 Additional Acceptance Criteria

In addition to Sections 90 and 126, production certification SHALL demonstrate:

121. every A2+ maintenance item resolves to known component(s) or is autonomy-capped;
122. component owner/criticality/SLO/runbook references are queryable;
123. ownership drift/unowned critical component is surfaced;
124. major incident can create versioned customer/stakeholder communication records;
125. external communication cannot expose restricted security/cross-tenant evidence;
126. CVSS, KEV, EPSS and VEX can coexist without collapsing into one score;
127. KEV/EPSS refresh timestamps are retained so old threat context is distinguishable;
128. an artifact-bound SBOM validates against its declared format/version;
129. VEX status retains source/provenance and can be contradicted by runtime evidence;
130. disallowed license/provenance policy blocks autonomous promotion;
131. autonomous A3/A4 verifies expected SCM/deployment protections before promotion;
132. protection drift fails closed and alerts an admin;
133. executing coding identity cannot weaken its own required promotion controls;
134. emergency feature-flag action stores before/after/expiry/rollback metadata;
135. expired temporary flags are surfaced for cleanup;
136. destructive migration defaults to explicit approval;
137. migration can resume safely after interruption without duplicating destructive effects;
138. migration verification checks declared data/schema invariants;
139. durable API/event breaking change is caught by compatibility/contract tests;
140. historical event fixtures can be replayed against the new consumer/schema path;
141. configuration/IaC drift can be classified separately from source defect;
142. emergency config mutation creates a desired-state reconciliation action;
143. provider outage correlation can prevent unnecessary source repair;
144. provider recovery is locally verified before linked impact closes;
145. intake rate/budget controls preserve canonical report while dropping optional expensive work;
146. abusive reporter cannot trigger unbounded browser/model/CI work;
147. a P0/P1 without owner/on-call path escalates to platform fallback;
148. escalation route gaps are visible/testable;
149. user-report UI supports minimization/preview of optional diagnostic evidence where practical;
150. reporter identity can be removed/anonymized without destroying canonical engineering lineage where policy permits;
151. consequential AI decision records model/provider/prompt-or-hash/policy/tool/evidence version metadata;
152. model/prompt upgrade is evaluated before gaining equal or greater autonomous authority;
153. AI decision drift/override/failure metrics are attributable to model/prompt version;
154. high-risk change cannot rely solely on the authoring agent/session as verifier;
155. high-risk deployment supports a distinct approving authority where policy requires;
156. control-plane self-maintenance uses last-known-good rollback independent of candidate controller;
157. controller upgrade reconciles in-flight work across old/new versions;
158. repeated patch→deploy→rollback loop trips a durable circuit breaker;
159. waiting/retrying alone cannot reset the repair-attempt epoch;
160. cross-service release plan enforces declared deployment ordering/compatibility dependencies;
161. conflicting concurrent changes to a protected dependency set are prevented or explicitly reconciled;
162. canary plan stores cohort, observation criteria, abort threshold and promotion threshold;
163. missing/invalid required telemetry cannot be interpreted as successful canary health;
164. semantic correctness oracle can fail a deployment despite green infrastructure health;
165. data-sensitive release verifies configured integrity invariants;
166. audit export includes integrity manifest/digest;
167. autonomous repair identity cannot erase its own privileged audit events;
168. producer time and canonical server receipt time are distinguishable;
169. A3/A4 component has valid ORR evidence;
170. ORR detects missing owner/on-call/rollback/kill-switch evidence;
171. critical-component game day/failure drill evidence can expire and require renewal;
172. improvement experiment stores hypothesis and primary/guardrail metrics;
173. improvement experiment can stop/rollback automatically when guardrail fails;
174. product-value ambiguity does not silently become an autonomous “success” decision;
175. every ephemeral privileged credential has revocation/expiry behavior on terminal failure;
176. orphan sandbox/branch/preview resources are detected after crash/restart;
177. cleanup does not remove held evidence required for audit/reproducibility;
178. SBOM/provenance/candidate/deployed artifact digests form one queryable lineage;
179. DORA-style delivery metrics can be computed without being used as unsafe individual/operator quotas;
180. final production certification includes one end-to-end scenario combining provider outage misclassification prevention, repair, guarded rollout, rollback signal and audit/evidence reconciliation.

---

# 156. Revision 3 Recommended Implementation Order

Revision 3 SHOULD be implemented in the following dependency order on top of Revision 2:

```text
R3-A  Service/component ownership registry + dependency map
R3-B  Vulnerability context + SBOM/VEX/license/provenance interoperability
R3-C  SCM/CD protection drift checks + feature-flag governance
R3-D  Migration + API/event/schema compatibility gates
R3-E  Config/IaC/provider-outage classification
R3-F  Intake abuse/budget + on-call ownership + privacy capture controls
R3-G  AI model/prompt governance + independent verification
R3-H  Control-plane self-maintenance + repair-loop circuit breaker
R3-I  Cross-service release + progressive-delivery + correctness oracles
R3-J  Tamper-evident audit + ORR/game day + improvement experiments
R3-K  Resource cleanup/reconciliation + full R3 certification campaign
```

A3/A4 SHALL remain disabled for a component until both Revision 2 safety gates **and** the applicable Revision 3 ORR/ownership/release-correctness gates are satisfied.

---

# 157. Revision 3 Final Architecture Decision

The durable architecture becomes:

```text
Signals / Feedback / Telemetry / Security Feeds
                    ↓
             Observation Intake
      rate-limit / redact / validate / dedup
                    ↓
        Service + Component Resolution
       owner / tier / SLO / dependency map
                    ↓
             IIMS Canonical Records
      Issue ─ Incident ─ Problem ─ Change
                    ↓
 Qualification / Provider Correlation / Evidence
                    ↓
 Severity + Priority + CVSS/KEV/EPSS/SLO Context
                    ↓
 Versioned Policy + AI Decision Evidence
          │                         │
     human decision          bounded autonomy
          └──────────────┬──────────┘
                         ↓
              MaintenanceWorkPackage
                         ↓
             Spec 224 DevelopmentRun
                         ↓
 Independent verification + compatibility/migration/security gates
                         ↓
 source SHA → provenance/SBOM → immutable artifact digest
                         ↓
 external SCM/CD protections + Change/Release record
                         ↓
 cohort/ring canary → correctness + SLO/business guardrails
                         ↓
            promote / hold / rollback
                         ↓
 incident/problem/postmortem/improvement experiment
                         ↓
 governed learning + model/policy calibration
```

The core safety rule is:

> **Automation may accelerate diagnosis and recovery, but every increase in autonomy must be earned by component ownership, reproducible evidence, independent verification, enforceable external controls, safe release mechanics and demonstrated recovery.**

Spec 228 Revision 3 is therefore an implementation-ready **production-grade specification candidate**, not a declaration that the future implementation is certified or production-ready before its evidence gates pass.

---

# Appendix A — Reference Alignment Notes

These are alignment references, not claims of formal certification:

- ISO/IEC 20000-1:2018 + Amd 1:2024 — service management system / continual improvement;
- ISO/IEC 27035-1:2023 / 27035-2:2023 — information-security incident management;
- ISO/IEC 25010:2023 — software/ICT product quality model;
- NIST SP 800-61 Rev. 3 (2025) — incident response and cybersecurity risk management;
- NIST SP 800-218 SSDF v1.1 — current final secure-software-development baseline used by this revision;
- NIST SP 800-218 Rev. 1 / SSDF v1.2 — draft only as of 2026-09-22; track but do not claim conformance as a final standard;
- NIST AI RMF 1.0 and NIST AI 600-1 — AI/GenAI risk-management reference for AI-assisted maintenance decisions;
- SLSA v1.2 — supply-chain levels and provenance;
- in-toto Attestation Framework v1.0 — interoperable attestation envelope/reference;
- SPDX 3.0 project specification; ISO/IEC 5962:2021 remains the published ISO SPDX baseline while a 3.0 revision is under development;
- CycloneDX 1.7 / ECMA-424 — BOM/VEX and software-transparency interoperability;
- FIRST CVSS v4.0 — vulnerability severity communication;
- FIRST EPSS — exploit-probability prioritization input;
- CISA Known Exploited Vulnerabilities — observed exploitation prioritization input;
- OpenTelemetry Semantic Conventions — trace/metric/log/event conventions;
- CloudEvents stable 1.0 family — interoperable event envelope;
- OpenFeature specification — feature-flag provider abstraction/evaluation context;
- OWASP Logging guidance — secure/operational logging practices;
- GitHub Rulesets / Environments — concrete SCM/CD protection mechanisms for GitHub implementations;
- DORA software-delivery performance metrics — delivery/stability outcome measurements;
- RFC 2119 and RFC 8174 — normative requirement terminology;
- RFC 9110 — HTTP semantics.

When these references evolve, SmartAIHub SHALL evaluate changes before updating its internal alignment profile; external standard updates SHALL NOT silently change production policy.

---

# Appendix B — Official Reference URLs

Implementation documentation SHOULD retain a reviewed source registry. Initial sources:

```text
ISO/IEC 20000-1
https://www.iso.org/standard/70636.html

ISO/IEC 27035-1
https://www.iso.org/standard/78973.html

ISO/IEC 25010
https://www.iso.org/standard/78176.html

NIST SP 800-61 Rev. 3
https://csrc.nist.gov/pubs/sp/800/61/r3/final

NIST SSDF
https://csrc.nist.gov/projects/ssdf

NIST AI RMF
https://www.nist.gov/itl/ai-risk-management-framework

NIST AI 600-1 Generative AI Profile
https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence

SLSA v1.2
https://slsa.dev/spec/v1.2/

in-toto specifications
https://in-toto.io/docs/specs/

SPDX specifications
https://spdx.dev/use/specifications/

CycloneDX specification
https://cyclonedx.org/specification/overview/

FIRST CVSS v4.0
https://www.first.org/cvss/v4.0/

FIRST EPSS
https://www.first.org/epss/

CISA KEV
https://www.cisa.gov/known-exploited-vulnerabilities-catalog

OpenTelemetry Semantic Conventions
https://opentelemetry.io/docs/specs/semconv/

CloudEvents specification
https://github.com/cloudevents/spec

OpenFeature specification
https://openfeature.dev/specification/

GitHub Rulesets
https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets

GitHub Deployments and Environments
https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments

DORA
https://dora.dev/
```

The registry SHALL record review date and pin the specific external version/status used for any production control decision.

---

# 158. Revision 4 Amendment — Unified AI Chat & Task Control Operational Integration

**Amendment date:** 2026-09-22  
**Aligned companions:** Spec 224 Revision 15, Spec 225 Revision 4, Spec 226 Revision 6  
**Purpose:** make the entire maintenance operational lifecycle controllable and observable from SmartAIHub AI Chat and Task Control while retaining Maintenance Center as the deep domain administration surface.

Revision 4 is additive and normative. It SHALL preserve all Revision 1–3 service-management, security, release, evidence, autonomy and operational-readiness requirements.

---

# 159. Unified Surface Ownership

Spec 228 SHALL expose canonical domain contracts so the following surfaces operate on the same MaintenanceItem/Incident/Release truth:

```text
Maintenance Center
AI Chat
Task Control
Mobile / PWA Working
Needs Attention / Notification deep links
External authorized control clients where applicable
```

Ownership remains:

```text
Spec 228       = maintenance lifecycle, priority, autonomy, release/deployment/closure
Spec 224       = linked DevelopmentRun lifecycle
Feature 195    = worker_jobs / worker_job_events
Approval       = shared approval authority where used
Spec 225       = first-party attention / cross-device UX
Spec 226       = compatibility/projection/control bridge
```

No UI surface may keep an independent copy of canonical maintenance state as decision truth.

---

# 160. MaintenanceTaskControlProjection Contract

Spec 228 SHALL provide or support an authoritative projection contract for cross-domain Task Control.

Minimum logical fields:

```text
maintenance_item_id
record_version
title
type / qualification
severity
priority / queue_rank
canonical_state
presentation_stage
health
owner/team
autonomy_level
occurrence_count
affected_scope_summary
current_next_action
SLA status / paused reason
attention_count
active_decision_refs[]
active_approval_refs[]
active_development_run_ref?
release_candidate_ref?
deployment_ref?
alert_summary
last_activity_at
available_command_descriptors[]
canonical_deep_links[]
```

This projection SHALL be derivable/rebuildable from canonical records and SHALL NOT become a competing write model.

---

# 161. Presentation Stage Mapping

For concise Task Control UX, Spec 228 SHALL expose a presentation-stage mapping from detailed domain states:

```text
INTAKE
QUALIFY
TRIAGE
INVESTIGATE
DIAGNOSE
REPAIR
VERIFY
RELEASE
DEPLOY
OBSERVE
RESOLVE
```

Example mapping is implementation-defined and versioned, but MUST preserve canonical state separately.

A stage is not authority for transition logic.

---

# 162. Canonical Maintenance Command Descriptor

Every user-visible maintenance action exposed to AI Chat/Task Control SHALL be represented by a server-authoritative descriptor equivalent to:

```text
command_id
semantic_operation
subject_type
subject_id
subject_version
command_owner = SPEC_228
allowed_now
unavailable_reason?
required_capabilities[]
risk_class
confirmation_required?
step_up_required?
approval_or_decision_ref?
idempotency_required = true
expected_state_transition?
```

The descriptor prevents clients from guessing availability from UI state.

---

# 163. Complete Operational Command Coverage

The cross-surface command contract SHALL cover the ordinary maintenance lifecycle actions already defined by Spec 228, including where authorized:

```text
Confirm / Reclassify / Triage
Change Priority / Rank / Pin / Freeze
Assign
Request More Evidence
Reproduce / Diagnose / Start Investigation
Grant or constrain autonomous repair
Force Human Review
Start Repair
Pause Automation
Continue Automation
Cancel Repair Attempt
Defer
Merge Duplicate
Split Issue
Reopen
Close
Approve Repair Plan
Approve Merge
Approve Deploy
Promote Release
Trigger Rollback
Acknowledge Maintenance Alert
Create Follow-up Improvement
```

High-volume queue administration, policy authoring, service-map management and analytics MAY remain primarily in Maintenance Center, but any decision/action that blocks or advances an individual maintenance task SHALL be representable from Task Control/Rich Review or AI Chat when the actor has authority.

---

# 164. Pause, Continue and Cancellation Semantics

Spec 228 SHALL make control scope explicit.

Canonical distinctions:

```text
PAUSE_AUTOMATION
  durable non-terminal pause of automated maintenance progression

CONTINUE_AUTOMATION
  revalidate state/version/dependencies/authorization and resume appropriate stage

CANCEL_REPAIR_ATTEMPT
  stop selected active repair/DevelopmentRun attempt while keeping MaintenanceItem actionable

CANCEL_MAINTENANCE_ITEM
  explicit domain terminal transition where allowed

DEFER
  keep item non-resolved but intentionally out of active queue under policy

CLOSE
  close only under Spec 228 closure rules
```

Clients SHALL NOT map all of these to a generic `cancel` button.

If a linked Spec 224 DevelopmentRun exists, propagation uses the cross-spec rules in Spec 224 Revision 15.

---

# 165. Maintenance Human Decision Envelope

Every maintenance decision requiring human action SHALL expose a structured envelope suitable for Chat cards, Task Control and mobile:

```text
decision_id
decision_epoch
maintenance_item_id
subject_version
kind
why_attention_is_required
current_state
recommended/default-safe option if policy provides one
choices[]
impact_of_each_choice
blast_radius
cost/budget impact
release/deployment implications
evidence refs
linked DevelopmentRun / candidate / release refs
required role/capability
step_up_required?
expires_at?
supersedes_decision_id?
```

Examples include repair authorization, product-semantic choice, merge, migration, deploy, rollback, containment and budget expansion.

The UI SHALL show bounded evidence/reasoning summaries, not hidden model chain-of-thought.

---

# 166. AI Chat Maintenance Contract

AI Chat SHALL be a supported maintenance operational surface through Feature 196 + Spec 226.

At minimum it SHALL support:

```text
query current issue/incident state
query why priority/classification was chosen
query active repair / tests / Final Verify
query blockers / SLA / attention
create/report an observation or feedback into canonical intake
request evidence collection/reproduction/diagnosis
pause / continue / cancel repair attempt
change priority/assignment when authorized
start/authorize repair
respond to maintenance decisions/approvals
request merge/deploy/rollback when authorized
create follow-up improvement
```

Natural-language ambiguity MUST resolve to an explicit subject/action preview before material side effects.

Chat responses SHALL retrieve current canonical state rather than trust stale conversational summaries.

---

# 167. Task Control Maintenance Contract

Task Control SHALL support a maintenance root task from first intake through post-deploy observation.

A task detail SHALL be able to present:

```text
Overview
Current state + presentation stage
Health / SLA
Timeline
Evidence / Diagnosis summary
Occurrences
Work / worker_jobs
Linked DevelopmentRun
Tests / Verification
Decisions / Approvals
PR / Candidate / Artifacts
Release / Deployment / Canary
Alerts
Cost / Budget
Audit
```

Task Control is not required to duplicate every Maintenance Center bulk/policy/analytics tool. It MUST, however, expose every current item-specific blocker/decision and authorized action needed to advance or safely stop that item.

---

# 168. Maintenance Center ↔ Task Control ↔ Chat Navigation

All three surfaces SHALL provide stable context navigation:

```text
Maintenance Center → Open in Task Control / Open in Chat
Task Control       → Open Maintenance Item / Open in Chat
AI Chat            → Open Task Control / Open Maintenance Item
```

Navigation carries opaque/canonical references and current authorization context; it SHALL NOT serialize secret-rich maintenance records into URLs or model prompts.

---

# 169. Composite Repair Monitoring

When a MaintenanceItem has an active Spec 224 DevelopmentRun, Spec 228 SHALL expose the relationship without flattening ownership.

Example:

```text
MNT-1842 — REPAIR_IN_PROGRESS
  Priority: P1
  Health: HEALTHY
  Repair:
    DEV-RUN-702 — TEST
    3/4 test groups passed
    Last activity: ...
  Next maintenance action:
    wait for Final Verify
```

If the repair fails:

```text
MaintenanceItem may remain INVESTIGATING / QUEUED / WAITING_APPROVAL / REPAIR_IN_PROGRESS
DevelopmentRun = FAILED_TERMINAL
Next action = diagnose failure / new work package / human decision
```

Parent state SHALL not be inferred solely from child terminality.

---

# 170. Unified Attention Correlation

Spec 228 SHALL assign correlation/grouping metadata so alerts, maintenance decisions and linked development decisions can appear as one user-facing attention group without merging canonical identities.

Required behavior:

- one P0 incident with 10,000 occurrences does not create 10,000 attention cards;
- one MaintenanceItem can show multiple distinct actionable decisions;
- a resolved child Spec 224 decision disappears while unresolved deploy approval remains;
- alert acknowledgement does not approve repair/deploy;
- notification open/delivery state does not acknowledge the maintenance alert unless explicitly commanded.

---

# 171. Release, Deploy and Rollback from Task Control

Authorized release/deployment actions SHALL be reachable from Task Control Rich Review and AI Chat while preserving Spec 228 release policy.

Before high-impact dispatch the surface MUST show/currently validate as applicable:

```text
candidate SHA / artifact digest
Verification Certificate
included MaintenanceItems
migration status
risk summary
canary/staging evidence
change window/freeze state
current production version
rollback target
approval/decision epoch
```

Configured step-up authentication and separation of duties remain mandatory.

---

# 172. Maintenance Alert Delivery Contract

Spec 228 alerts SHALL use shared Attention/Notification delivery with explicit distinction among:

```text
notification delivered
notification opened
attention viewed
maintenance alert acknowledged
decision answered
approval resolved
```

Escalation continues until the canonical condition required by policy is satisfied.

Push/email/chat previews SHALL not contain restricted vulnerability details, secrets, PII or tenant-sensitive evidence.

---

# 173. Cross-Device State and Conflict Safety

All cross-device maintenance actions SHALL carry or resolve the latest subject version/decision epoch.

Stale mutations SHALL fail with current-state information and a safe refresh/review path.

Examples:

- priority changed while mobile card was open;
- issue became duplicate before repair-start command;
- new candidate SHA superseded deploy approval;
- rollback target changed;
- maintenance work package changed while repair was paused;
- issue automatically reopened during post-deploy observation.

---

# 174. Maintenance Task Privacy and Security Projection

Task Control/Chat projection SHALL follow the stricter of Spec 228 domain policy and shared platform access controls.

Sensitive `SECURITY_FINDING` / vulnerability tasks MAY require:

```text
opaque generic title
status-only projection
restricted evidence
restricted occurrence/customer scope
restricted comments
restricted links
restricted notification preview
```

No generic task-search endpoint may become a side channel for discovering sensitive maintenance items.

---

# 175. User Feedback / Send Feedback Integration

The existing `Send Feedback` surface MAY create a canonical Spec 228 observation/feedback intake record when the maintenance feature is enabled.

The user-facing flow SHOULD support:

```text
submit feedback / bug
→ receive tracking reference where policy permits
→ see high-level status appropriate to role
→ add requested evidence when asked
→ receive resolution/result notification where configured
```

Internal triage, vulnerability or cross-tenant information SHALL remain hidden from ordinary reporters.

This integration SHALL not create a second feedback-to-maintenance database if an existing feedback backend is retained; use a versioned linkage/adapter according to migration policy.

---

# 176. Revision 4 Additional Events

Spec 228 SHOULD emit stable domain events needed by Task Control/Attention projection, including equivalents of:

```text
maintenance.item.state_changed
maintenance.item.health_changed
maintenance.item.next_action_changed
maintenance.item.paused
maintenance.item.continued
maintenance.repair_attempt.started
maintenance.repair_attempt.cancelled
maintenance.decision.required
maintenance.decision.resolved
maintenance.approval.required
maintenance.release.attention_required
maintenance.deployment.health_changed
maintenance.alert.acknowledgement_required
```

Events remain references/redacted summaries and follow the existing event-envelope/versioning rules.

---

# 177. Revision 4 API / Query Additions

The implementation SHALL provide or adapt APIs sufficient for projection/control without forcing clients to reconstruct maintenance state from event history.

Logical requirements include:

```text
GET task-control projection for authorized maintenance subjects
GET available commands for current item/version
GET unresolved attention/decisions for item
POST semantic command with idempotency + expected version
POST decision/approval response with epoch
GET linked DevelopmentRun summary
GET release/deployment review summary
```

Existing Spec 228 endpoints MAY satisfy these contracts through adapters; duplicate write endpoints are not required.

---

# 178. Revision 4 Acceptance Tests

In addition to all prior acceptance criteria:

1. user reports a bug from AI Chat/Send Feedback and it links to one canonical Spec 228 intake record;
2. MaintenanceItem appears once in Task Control from intake through closure;
3. maintenance presentation stage never replaces canonical state in mutations;
4. linked Spec 224 DevelopmentRun is nested/correlated correctly;
5. pause automation from Chat and Task Control resolves to the same Spec 228 command;
6. cancel repair attempt leaves parent item open/actionable;
7. continue validates current item/work-package version before resuming;
8. human decision can be answered from AI Chat or Task Control and resolves exactly once;
9. every item-specific decision needed to advance/stop work is actionable without requiring CLI/database access;
10. stale cross-device decision is fenced;
11. P0 alert grouping prevents occurrence storm in Needs Attention;
12. alert acknowledgement remains distinct from deploy approval;
13. Final Verify PASS does not equal maintenance resolution;
14. merge does not equal deployment;
15. deployment does not equal resolution until observation policy passes;
16. rollback can be initiated through Rich Review with current artifact/target and step-up where required;
17. security-sensitive item cannot leak through task search, chat summary or notification preview;
18. Maintenance Center, Task Control and Chat converge on the same subject version after concurrent edits;
19. linked repair failure yields an actionable maintenance next state rather than orphaning the issue;
20. cross-device user can leave after starting work and later resume from the same canonical item/attention state.

---

# 179. Revision 4 Definition of Done

Revision 4 is complete when a Spec 228 maintenance item can be reported, qualified, monitored, repaired through Spec 224, paused/continued/cancelled at the correct scope, reviewed, approved, released, deployed, observed, rolled back, reopened and closed with all current item-specific human decisions actionable through AI Chat or Task Control, while Maintenance Center retains deep domain administration and no duplicate lifecycle truth exists.

---

# 180. Revision 4 Final Architecture Decision

> **Maintenance Center is the domain cockpit; Task Control is the cross-platform operational cockpit; AI Chat is the conversational cockpit. They are different views over one Spec 228 maintenance lifecycle and its linked Spec 224 execution. The system is complete only when a user can move among those surfaces without losing task identity, progress, alerts, authority, evidence or the ability to safely continue the work.**

---

# 181. Revision 5 Amendment — Maintenance UI/Device Closure & Hardening Finding Integration

Revision 5 is additive and aligns maintenance operations with Spec 224 Revision 17, Spec 225 Revision 5 and Spec 226 Revision 7.

Spec 228 remains the maintenance-domain authority. It SHALL consume development/hardening results without turning Task Control or the development runtime into a second maintenance lifecycle.

# 182. Maintenance `UICapabilityContract`

Every required maintenance action SHALL declare whether and where the user must be able to perform it.

Representative actions include:

```text
report issue
view/qualify issue
change priority
assign/defer
start/monitor repair
pause/continue/cancel repair attempt
answer product/maintenance decision
approve merge/deploy where authorized
rollback/reopen/close
capture/add evidence
```

Each action SHALL link to canonical Spec 228 command semantics or the correct linked Spec 224 child command when the action is development-run-specific.

# 183. Maintenance Route / Surface Closure

For required first-party maintenance capabilities, the system SHALL know:

```text
Maintenance Center route/surface
Task Control projection/deep link where applicable
AI Chat action/card where applicable
Needs Attention entry
actor/permission
canonical command
current subject version
```

A maintenance page/component that exists in source but is unreachable from the intended product navigation SHALL not satisfy the requirement.

# 184. Maintenance Device Experience Matrix

Recommended baseline:

```text
Desktop
  FULL Maintenance Center, queue/policy/analytics/review + Task Control

Tablet
  FULL/ADAPTED operational queue, issue detail, evidence, priority, repair monitoring/control, decisions and release actions

Mobile
  FOCUSED alerts, issue status, essential priority/control, evidence capture, decisions/approvals, pause/resume/cancel, result/rollback attention
  HANDOFF for dense policy simulation, large service maps or complex multi-artifact analysis when appropriate
```

Spec-specific requirements MAY tighten this matrix.

# 185. Maintenance Interaction Alternatives

Maintenance queue operations such as reprioritization SHALL NOT rely exclusively on drag-and-drop for touch-supported Tablet/Mobile profiles.

At least one explicit semantic alternative SHALL exist where the capability is required, for example priority selector or Move action.

# 186. Maintenance User Journey Registry

Spec 228 SHOULD define/compile journeys such as:

```text
user reports issue
admin receives alert and opens issue
admin reprioritizes issue
system qualifies/reproduces/diagnoses
repair DevelopmentRun starts
admin monitors or pauses/resumes repair
human decision is answered
candidate is reviewed/approved
release/deploy occurs
post-deploy observation succeeds or rollback/reopen occurs
```

Required journeys SHALL link to route/action/device evidence rather than relying only on backend unit tests.

# 187. Production-Hardening Finding Ingestion

A Spec 224 `ProductionHardeningCampaign` may discover issues that belong in the maintenance/improvement domain.

Spec 228 SHALL accept a structured finding handoff containing:

```text
finding_id/cluster_id
origin DevelopmentRun/candidate
classification/severity
affected capability/service
requirement/derived-requirement refs
evidence refs
repair status
recommended maintenance disposition
```

Spec 228 decides whether to create/merge a MaintenanceItem, improvement item, incident relation or no domain item.

# 188. No Double Ownership of Hardening Repair

If a finding is being repaired inside the active Spec 224 DevelopmentRun, Spec 228 MAY track/correlate it but SHALL NOT create a second concurrent repair authority for the same candidate unless policy explicitly splits the work.

After the development run ends, unresolved/post-deploy findings MAY become normal maintenance items.

# 189. UI/UX Defects as First-Class Maintenance Findings

Maintenance intake SHALL recognize UI/UX defect classes including:

```text
missing route
unreachable required page
dead control
missing UI for user-facing backend capability
incorrect visible/enabled state
frontend/backend authorization mismatch
missing touch alternative
mobile-required capability missing
mobile overload / inappropriate dense workflow
broken responsive/device layout
missing error/recovery state
```

These are not automatically cosmetic; severity depends on capability impact.

# 190. Maintenance Hardening Campaign Relationship

Spec 228 MAY request a Spec 224 hardening campaign for a repair candidate or maintenance-driven improvement when risk warrants.

The maintenance item SHALL display high-level campaign progress/findings through Task Control/Maintenance Center while detailed development finding/closure truth remains owned by Spec 224.

# 191. Post-Deploy Device/UI Observation

For changes affecting user-facing maintenance/product surfaces, post-deploy observation MAY include deterministic route/action/journey health signals per supported device profile.

A successful backend deployment SHALL NOT close a user-facing maintenance item when the required surface remains unreachable or unusable.

# 192. Revision 5 Required Tests

1. maintenance issue page exists but intended admin navigation has no path and closure fails;
2. priority reorder works by mouse drag but no Tablet alternative exists and required Tablet closure fails;
3. Mobile-focused maintenance view exposes essential approve/pause/result actions without full desktop policy UI;
4. mobile dense policy simulator is intentionally HANDOFF and not treated as missing capability;
5. backend maintenance command exists without required user UI and item remains incomplete;
6. hardening finding generated by child Spec 224 run correlates to parent item without duplicating repair authority;
7. unresolved post-deploy UI route defect reopens/prevents resolution of the maintenance item;
8. AI Chat, Task Control and Maintenance Center dispatch the same semantic maintenance command while rendering device-specific controls;
9. UI/UX defect severity can be production-blocking when it makes a required capability unusable;
10. feature-flag/device projection rollback does not alter canonical MaintenanceItem history.

# 193. Revision 5 Definition of Done

Revision 5 is complete when maintenance capabilities are provably reachable and actionable through the intended first-party surfaces/device profiles, UI/UX defects are first-class maintenance findings, and Spec 224 hardening discoveries can flow into maintenance governance without creating duplicate repair ownership.

# 194. Revision 5 Final Architecture Decision

> **A maintenance feature is not operational merely because its backend exists. Spec 228 SHALL close the loop from issue/domain semantics through reachable user actions and device-appropriate operation, while Spec 224 remains the authority for development hardening and candidate verification.**

# End of Spec 228 Revision 5

---

# Revision 6 Harness-Family and Canonical Numbering Alignment

Maintenance does not select providers by inventing provider-specific repair lifecycles. Eligible repair execution remains delegated to Spec 224/Spec 230/Spec 200.

```text
Spec 222 = learning/advisory evidence about repair strategies
Spec 230 = harness/context/methodology preparation
Spec 224 = repair DevelopmentRun lifecycle and Final Verify
Spec 228 = maintenance intake/priority/release/observation authority
```

Kimi Code is an eligible harness family after adapter certification. A Kimi Goal/Swarm/task completing does not close the MaintenanceItem and does not replace Spec 224 Final Verify or Spec 228 post-deploy observation.


## Shared Retrieval Contract Family — `SAH-RETRIEVAL-2`

All production consumers in Specs 214–230 that require semantic/document/entity search SHALL use the canonical Spec 229 Retrieval Broker contract rather than provider-specific search APIs.

The shared request MUST carry at least:

```text
request_id
principal / tenant / project / environment
purpose
query_class
query_text or structured selector
source_classes
required_visibility / ACL scope
language hints
exact identifiers if present
maximum evidence budget
freshness requirement
consumer spec / run / workflow references
```

The normalized response MUST carry at least:

```text
retrieval_trace_id
provider/profile/version
query plan
EvidenceRef[]
source identity + source revision/digest
ACL/provenance/freshness state
retrieval/rerank scores as non-authoritative evidence
quality-gate result
partial/degraded indicators
```

`EvidenceRef` SHALL be a reference to authorized canonical content; retrieved text/vector similarity SHALL NOT become lifecycle state, authorization, approval, identity or source-of-truth data.


---

# Revision 7 — Maintenance Retrieval, Similarity and Duplicate-Control Alignment

Maintenance historical similarity, known-error discovery, similar incident retrieval, regression-test suggestion and issue-cluster candidate generation SHALL use Spec 229 Retrieval Broker.

Semantic similarity is supporting evidence only. Canonical duplicate identity SHOULD prefer deterministic fingerprints when available, including error signatures, stack fingerprints, affected release/capability, reproducible symptom identity and explicitly linked issue IDs.

A candidate duplicate from vector search MUST be revalidated against tenant/visibility/state and must not silently merge MaintenanceItems.

Maintenance may project redacted issue/repair/outcome summaries for future retrieval according to retention and sensitivity policy. Sensitive logs/secrets SHALL NOT be embedded merely to improve similarity.

Resolved/reopened/reclassified/deleted issues SHALL update/tombstone derived search projections. Index lag MUST NOT make a closed/revoked issue appear as authoritative current state without canonical reread.
