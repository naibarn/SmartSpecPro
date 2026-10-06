# Spec 271 — SmartAIHub Portable UAT Acceptance & Execution Platform

**Status:** Proposed / Implementation-Ready — Revision 1.5 — ten-pass decision-plane hardening (implementation unverified)  
**Revision Date:** 2026-10-02  
**Owner:** SmartAIHub Platform  
**Primary Integration:** Spec 224 Development Orchestrator Runtime  
**Related Specs:** 196, 208, 215, 224, 226, 231, 239, 242, 256, 259, 263, 267, 269, 270  
**Target:** SmartAIHub Web, Mini Apps, Desktop/Worker, Cloud Runtimes, External Harnesses  
**Design Principle:** One Acceptance Contract, many execution locations.
**Release Principle:** No critical feature is accepted from implementation-agent claims alone; acceptance requires independent, policy-bound evidence.

---

## 1. Executive Summary

Spec 271 introduces a shared **UAT Acceptance & Execution Platform** for SmartAIHub.

The purpose is not merely to automate browser clicks. The platform must determine whether a feature, Mini App, workflow, or product change is **actually acceptable for real users**, with reproducible evidence across UI, API, database, events, permissions, background jobs, recovery paths, and business invariants.

The system must work in two major operating modes:

1. **Local-first execution**
   - User has PC/Mac.
   - SmartAIHub Desktop/Worker is online.
   - User may already have Codex, Claude Code, Hermes, thClaws, or another development harness.
   - Local source code, local services, browser, and user-owned subscriptions may be used.

2. **Cloud execution**
   - User has only tablet/mobile, or local runner is unavailable.
   - SmartAIHub executes development/test/UAT in cloud infrastructure.
   - The approved Cloudflare Container runtime is used for isolated build/test/runtime workloads.
   - Cloudflare Browser Run / Playwright is used for browser UAT.
   - Results, previews, screenshots, evidence, and approvals return to Chat / Task Control Center.

The UAT contract must remain identical regardless of where it executes.

The main architectural rule is:

> **Harnesses implement. SmartAIHub independently accepts.**

An external development agent must not become the sole authority that its own implementation is correct.

---

# 2. Problem Statement

Spec 224 can implement, test, debug, review, verify, and recover software automatically, but traditional unit/integration/E2E tests still leave several classes of defects undetected:

- UI reports success while backend state is wrong.
- API returns 200 but asynchronous work later fails.
- Credits are charged twice.
- A retry creates duplicate deployment.
- Tenant isolation fails.
- ACL/permission behavior is inconsistent.
- UI state and DB state diverge.
- worker_jobs complete incorrectly.
- audit events are missing.
- browser actions choose the wrong semantic target.
- a service restart breaks a workflow.
- test suites pass even though the business outcome is wrong.
- mobile/tablet experience is unusable even though desktop tests pass.
- an implementation harness declares completion without independent acceptance.

Spec 271 makes UAT a formal **Final Acceptance Gate** in Spec 224.

---

# 3. Goals

## 3.1 Primary Goals

The platform MUST:

1. Convert requirements/user stories/spec acceptance criteria into executable UAT contracts.
2. Execute the same UAT scenario locally or in cloud infrastructure.
3. Support browser, API, DB, event, audit, ACL, job, file/artifact, and runtime assertions.
4. Use deterministic execution whenever possible.
5. Use Jev / bounded-decision models only when semantic ambiguity exists.
6. Use general LLMs only when rules and bounded decision models are insufficient.
7. Keep Vision/Computer Use as a late fallback.
8. Produce an immutable evidence bundle for every important UAT run.
9. Support replay and deterministic diagnosis of failures.
10. Feed failures back into Spec 224 repair loops.
11. Support users with only tablet/mobile devices.
12. Prefer a user's local runner/harness when available and policy allows.
13. Remain vendor-neutral for decision models and external harnesses.
14. Support multi-tenant isolation, auditability, budgets, approvals, and least privilege.
15. Become a reusable platform capability for Mini Apps and all SmartAIHub products.

---

# 4. Non-Goals

Spec 271 is NOT:

- a replacement for unit tests;
- a replacement for integration tests;
- a replacement for security testing;
- a replacement for performance/load testing;
- a replacement for human UX judgment in every case;
- a Jev-specific test framework;
- a Playwright-only framework;
- a browser-only UAT system;
- a replacement for Spec 224;
- a new general-purpose coding harness.

---

# 5. Core Design Principles

## 5.1 Acceptance Contract Is Canonical

UAT intent must be represented as an execution-neutral contract.

Execution provider may change without rewriting the scenario.

```text
Requirement / Spec / User Story
        ↓
Acceptance Contract
        ↓
Execution Placement Resolver
        ↓
Local | Cloud Browser | Cloud Sandbox | Remote Device
```

## 5.2 Deterministic First

Preferred resolution order:

```text
1. Explicit test id
2. ARIA role + accessible name
3. DOM semantic relation
4. deterministic rule
5. semantic matcher
6. bounded DecisionProvider (e.g. Jev)
7. fast structured LLM
8. reasoning LLM
9. Vision / Computer Use
10. HUMAN_REVIEW
```

## 5.3 Independent Acceptance

A harness that implemented code MUST NOT be the only authority for UAT PASS.

## 5.4 Mobile/Tablet Is a Control Surface

Tablet/mobile does not need local development tooling.

It must be able to:

- request implementation;
- observe progress;
- inspect previews;
- inspect UAT evidence;
- approve/reject;
- rerun failed UAT;
- receive final result.

## 5.5 Evidence Over Claims

No critical UAT should pass because an agent says “looks good”.

PASS must be backed by machine-verifiable evidence.

---

# 6. High-Level Architecture

```text
                         USER
             ┌────────────┴────────────┐
             │                         │
          PC / Mac                 Tablet/Mobile
             │                         │
      Local Worker/Harness         Chat/Task Control
             │                         │
             └────────────┬────────────┘
                          ↓
                  Spec 224 Control Plane
                          ↓
               UAT Scenario Compiler
                          ↓
                Acceptance Contract
                          ↓
              Execution Placement Resolver
         ┌────────────────┼─────────────────┐
         │                │                 │
   Local Runner      Cloud Browser     Cloud Sandbox
         │                │                 │
   Playwright/API     Browser Run       Container/Sandbox
   local services     Playwright        Build/Test/Runtime
         │                │                 │
         └────────────────┼─────────────────┘
                          ↓
                   Decision Resolver
      Rules → DOM/A11y → Decision Intelligence Plane → Fast LLM → Reasoning → Vision
                          ↓
                      Assertions
        UI / API / DB / Events / ACL / Jobs / Invariants
                          ↓
                    Evidence Bundle
                          ↓
              PASS / FAIL / BLOCKED / HUMAN_REVIEW
                          ↓
                  Spec 224 Final Gate
```

---

# 7. UAT Acceptance Contract

## 7.1 Canonical Example

```yaml
contract_schema_version: 1
scenario_id: miniapp.publish.private
scenario_version: 1

business_goal:
  creator_can_publish_private_mini_app

risk:
  level: high
  release_blocking: true

traceability:
  spec_ref: SPEC-271
  requirement_refs:
    - MINIAPP-PUBLISH-PRIVATE-001
  source_revision: ${git_commit_or_tree_digest}
  acceptance_owner: product_owner

environment_policy:
  fidelity: production_like
  required_browser_engines:
    - chromium
  network_profile: normal
  locale: en-US
  timezone: UTC
  clock_mode: controlled
  random_seed: 271001
  feature_flag_snapshot: ${feature_flag_snapshot_id}

preconditions:
  - actor.role == creator
  - app.status == draft
  - credits.available >= expected_cost

steps:
  - navigate:
      route: creator_workspace

  - select:
      entity: mini_app
      fixture_ref: app_under_test

  - action:
      intent: publish

  - set:
      visibility: private

  - confirm: true

acceptance:
  ui:
    - path: app.status_badge
      equals: Published

  api:
    - request: GET /v1/mini-apps/{app_id}
      jsonpath: $.status
      equals: published

  database:
    - table: mini_apps
      where:
        id: ${app_id}
      field: status
      equals: published

  audit:
    - event: mini_app.published
      actor_id: ${actor_id}
      entity_id: ${app_id}

  acl:
    - actor: anonymous
      action: read
      expected: denied

  jobs:
    - type: mini_app.deploy
      state: succeeded
      exactly_once: true

invariants:
  - credits.balance >= 0
  - tenant_id == initial.tenant_id
  - owner_id == initial.owner_id
  - no_cross_tenant_access == true
  - no_duplicate_deployment == true

evidence:
  - screenshot
  - dom_snapshot
  - api_trace
  - db_snapshot
  - audit_event
  - job_timeline
  - decision_trace

side_effect_policy:
  mode: sandbox_or_compensatable
  irreversible_requires_approval: true

post_deploy:
  synthetic_verify: true
  rollback_on_failure: true
```

---

# 8. UAT Scenario Compiler

The compiler converts one or more of:

- Spec acceptance criteria
- User story
- Requirement
- Bug report
- Chat instruction
- existing test case
- regression incident
- production failure replay

into a normalized Acceptance Contract.

The compiler MUST:

1. preserve original business intent;
2. distinguish precondition, action, assertion, invariant, cleanup;
3. identify destructive actions;
4. identify approval requirements;
5. identify required execution capabilities;
6. calculate risk class;
7. flag ambiguous acceptance criteria;
8. generate negative/boundary/recovery companion cases when applicable;
9. never silently weaken a user-provided acceptance requirement;
10. emit a requirement-to-scenario traceability map;
11. bind each generated scenario to the exact spec/repository/source revision used to generate it;
12. identify the acceptance oracle for each assertion and reject circular/self-referential oracles;
13. identify external side effects and attach sandbox, mock, compensation, or approval policy;
14. declare required locale, timezone, clock behavior, random seed, feature flags, and viewport/device matrix;
15. calculate scenario criticality and required evidence strength;
16. detect stale scenarios when requirements or implementation contracts change;
17. record compiler version, model/provider version, prompt/template digest, and generated-contract digest;
18. validate `contract_schema_version` against the UAT Contract Schema Registry before scheduling;
19. declare temporal semantics for asynchronous assertions instead of generating arbitrary fixed sleeps;
20. declare AI/non-deterministic acceptance policy when the feature under test depends on LLM/agent output;
21. declare browser-engine and network-fidelity requirements explicitly;
22. declare media/multimodal acceptance requirements when output includes image, video, or audio artifacts;
23. declare configuration/feature-flag/tenant variants that are release-critical;
24. attach supply-chain/build provenance requirements for release-blocking build scenarios.

---

# 9. Execution Placement Resolver

New shared component:

```text
UATExecutionPlacementResolver
```

## 9.1 Inputs

- project location
- local runner availability
- source accessibility
- target OS
- required browser/device
- required secrets
- privacy policy
- tenant policy
- cost policy
- user preference
- harness availability
- cloud capability
- network reachability
- test isolation requirement
- exact source revision / commit / tree digest
- required environment fidelity
- preview reachability and secure-tunnel availability
- locale/timezone/device matrix
- side-effect policy
- provider health/capacity
- data residency policy
- required trusted execution boundary

## 9.2 Decision Policy

```text
if target.requires_native_windows:
    select Windows Runner

else if target.requires_native_macos:
    select macOS Runner

else if local_runner.online
     and project.local_accessible
     and policy.local_allowed:
    select Local Runner

else if browser_only:
    select Cloud Browser

else:
    select Cloud Sandbox
```

## 9.3 User Override

Users may choose:

- Auto
- Prefer Local
- Cloud Only
- Local Only

Default: `Auto`

---

# 10. Execution Providers

## 10.1 Local Runner Provider

Target:

- Windows
- macOS
- Linux

Capabilities:

- local repository
- local browser
- Playwright
- local DB/services
- user harness
- native filesystem
- native application testing
- localhost
- private network if explicitly allowed

Possible harnesses:

- Codex
- Claude Code
- Hermes
- thClaws
- Antigravity
- DeepSeek Harness
- future registered harness

The harness MUST be treated as implementation capability, not acceptance authority.

---

## 10.2 Cloud Browser Provider

Recommended implementation:

- Cloudflare Browser Run
- Playwright-compatible browser controller

Use for:

- UI navigation
- screenshots
- responsive viewport
- DOM inspection
- accessibility tree
- network request observation
- browser-based regression
- public/staging preview validation

Avoid Cloud Sandbox when browser-only testing is sufficient.

---

## 10.3 Cloud Sandbox Provider

In this Spec, **Cloud Sandbox** describes the isolated workload placement. Its SmartSpecPro provider is the approved Cloudflare Container runtime defined in §32.4; it is not a separate runtime or dispatch authority.

Recommended for:

- git checkout
- package installation
- build
- unit/integration test
- dev server
- API test
- migrations in isolated DB
- local preview service
- artifacts
- code analysis

The sandbox MUST be ephemeral by default.

Source and secrets must be scoped to the UAT run.

Cloud Sandbox execution MUST record the repository revision, dependency lockfile digest, runtime/toolchain versions, base image digest, environment variables after redaction, feature-flag snapshot, and network-egress policy as part of the environment fingerprint.

A private preview exposed from the sandbox MUST use an authenticated, run-scoped preview channel. It MUST NOT create a long-lived public preview URL by default.

---

## 10.4 Remote Device Provider

Future provider for:

- Windows native
- macOS native
- Android
- iOS
- hardware-specific testing

The contract must be defined now even if provider implementation is deferred.

---

# 11. Decision Resolver

## 11.1 Goal

Resolve ambiguous UI/action choices without forcing a full reasoning LLM for every step.

## 11.2 Provider Interface

```ts
interface DecisionProvider {
  choose(input: ChoiceInput): Promise<ChoiceResult>;
  score(input: ScoreInput): Promise<ScoreResult>;
  boolean(input: BooleanInput): Promise<BooleanResult>;
}
```

## 11.3 Resolution Ladder

```text
Explicit selector/testid
→ ARIA/accessibility match
→ deterministic semantic rules
→ DOM relation
→ bounded DecisionProvider
→ fast structured LLM
→ reasoning LLM
→ Vision / Computer Use
→ HUMAN_REVIEW
```

## 11.4 Jev

Jev is OPTIONAL.

It must be registered as a provider, not hard-coded.

Possible deployment:

```text
Cloudflare Workers AI
→ typesafe/jev
```

No separate SmartAIHub Worker deployment is required solely for Jev.

## 11.5 General LLM

Existing SmartAIHub LLM Gateway should be used.

No dedicated LLM subscription is required purely for UAT.

Every non-deterministic DecisionProvider invocation MUST capture enough replay metadata to explain the decision later: provider, model/version, prompt/template digest, candidate-set digest, normalized state digest, confidence/result, and policy threshold used. Raw secrets and unrelated page content MUST NOT be persisted.

---

# 12. Model Roles

Do not conflate these roles:

```text
Cognitive Model
= planning / reasoning / recovery

Decision Model
= bounded choice / score / classification

Vision Model
= visual fallback

Executor
= performs deterministic action
```

Recommended routing:

```text
Rules                   first
Jev / bounded model      ambiguity
Fast LLM                 fallback
Reasoning LLM            complex recovery
Vision                    last resort
```

---

# 13. Browser Targeting Standard

SmartAIHub UI components SHOULD expose stable identifiers.

Preferred order:

```text
data-testid
ARIA role + accessible name
semantic labels
DOM relationships
stable attributes
fallback decision resolver
```

Example:

```html
<button
  data-testid="miniapp-publish"
  aria-label="Publish application">
  Publish
</button>
```

Avoid:

```text
button:nth-child(3)
```

except as a temporary fallback.

Browser pages, DOM text, accessibility labels, uploaded files, external websites, and rendered content MUST be treated as **untrusted input**. Text from a page must never be interpreted as privileged instructions to the UAT agent. Tool instructions, approval policy, credentials, system prompts, and execution policy remain outside the page-content trust domain.

---

# 14. Assertions

## 14.1 UI Assertions

- visible text
- component existence
- enabled/disabled
- state
- route
- modal
- form value
- toast
- accessibility state
- responsive rendering

## 14.2 API Assertions

- HTTP status
- response schema
- semantic values
- idempotency key behavior
- authorization behavior
- side effect outcome

## 14.3 Database Assertions

- row state
- cardinality
- ownership
- tenant scope
- version
- transaction result
- no duplicate rows

## 14.4 Audit/Event Assertions

- event type
- actor
- tenant
- timestamp
- entity
- correlation id
- causality chain

## 14.5 Job Assertions

- job created exactly once
- correct queue/runtime
- retry count
- settlement
- completion
- no orphan lease
- watchdog behavior

## 14.6 ACL Assertions

- anonymous
- owner
- collaborator
- tenant admin
- platform admin
- cross-tenant denial

## 14.7 Artifact Assertions

- R2 object exists
- file hash
- correct tenant namespace
- expected media format
- no orphan artifact

## 14.8 Accessibility Assertions

Critical user journeys SHOULD verify:

- keyboard reachability;
- focus order;
- accessible names/roles;
- required form labels;
- modal focus trapping/restoration;
- critical contrast/readability checks where machine-verifiable;
- no blocking accessibility regression in the supported matrix.

## 14.9 Visual Regression Assertions

Visual assertions MAY be used for layout, clipping, overflow, responsive breakpoints, editor/canvas surfaces, and cross-device rendering. Visual diff MUST be treated as evidence, not the sole business oracle. Baseline creation or replacement requires provenance and approval according to risk policy.

## 14.10 Test Oracle Independence

For critical outcomes, the assertion oracle SHOULD be independent from the component producing the claimed result. Examples:

```text
UI says Published → verify API/DB/event independently
API says payment settled → verify ledger/settlement record independently
worker reports complete → verify durable state + artifact independently
```

Direct DB assertions MUST use read-only test credentials and must not become the only public-contract assertion when an API/domain-level oracle exists.

---

# 15. Business Invariants

Every high-risk UAT MUST support invariants.

Examples:

```text
credits.balance >= 0
credit debit occurs once
tenant_id never changes
owner_id remains correct
no cross-tenant data leak
no duplicate deployment
no duplicate payment
no orphan R2 asset
worker_job settles once
audit event exists
approval boundary preserved
```

These are checked independently from UI success.

---

# 16. Negative, Boundary, and Adversarial UAT

For critical scenarios, auto-generate or require:

```text
Happy path
Negative path
Permission path
Boundary path
Retry path
Concurrency path
Recovery path
Failure-injection path
```

Example: Publish Mini App

```text
✓ valid creator publishes
✗ viewer attempts publish
✗ insufficient credit
✗ deployment timeout
✗ duplicate click
✗ browser refresh during publish
✗ runner disconnect
✗ retry same request
✗ tenant B requests tenant A resource
✗ audit writer unavailable
```

---

# 17. Recovery UAT

Spec 224 integration MUST test:

```text
Start operation
→ inject expected failure
→ restart/resume
→ recover durable state
→ continue
→ ensure no duplicate side effect
→ verify final business outcome
```

Recovery scenarios include:

- Worker termination
- network timeout
- queue delay
- duplicate delivery
- browser restart
- sandbox restart
- partial DB transaction
- external harness crash
- LLM provider failure
- Jev provider failure

---

# 18. Failure Injection

Failure injection MUST be explicit and policy-controlled.

Examples:

```text
network timeout
HTTP 500
queue delivery duplication
job lease expiration
temporary DB unavailable
R2 failure
browser crash
runner disconnect
decision provider unavailable
```

Production destructive injection is prohibited unless explicitly approved.

Failure injection MUST be scoped by environment, blast radius, tenant, resource, duration, and compensation/rollback plan. Every injected failure receives a unique `fault_id` included in logs and evidence so a real incident is not confused with a test fault.

---

# 19. Evidence Bundle

Every significant UAT run SHOULD produce:

```text
uat_run/
├── manifest.json
├── scenario.yaml
├── normalized_contract.json
├── environment.json
├── steps.jsonl
├── screenshots/
├── dom/
├── accessibility/
├── network/
├── api/
├── database/
├── events/
├── jobs/
├── logs/
├── decisions/
├── artifacts/
├── integrity.json
├── redaction_report.json
└── final_report.json
```

Critical evidence bundles MUST include content hashes for all evidence artifacts and a signed/attested manifest when supported. The manifest must bind evidence to `uat_run_id`, tenant, scenario version, source revision, environment fingerprint, and timestamps. Evidence retention and deletion follow tenant/data-class policy rather than an unlimited default.


## 19.1 Decision Evidence

Example:

```json
{
  "step": 7,
  "resolver": "decision_provider",
  "provider": "jev",
  "goal": "publish private app",
  "candidates": [
    "Keep working",
    "Make available to workspace",
    "Finalize later"
  ],
  "selected": "Make available to workspace",
  "confidence": 0.94
}
```

This allows SmartAIHub to distinguish:

```text
application bug
vs
resolver bug
vs
test contract bug
vs
environment failure
```

---

# 20. Replay

UAT MUST support:

## 20.1 Live Replay

Re-execute against a live/staging environment.

## 20.2 Mock Replay

Replay using stored:

- API responses
- DOM snapshots
- event stream
- decision inputs
- fixture data

Benefits:

- cheaper debugging
- reproducible failure analysis
- no repeated external API cost
- safer incident investigation

---

# 21. Fixtures and Test Data

Introduce:

```text
UATFixtureService
```

Example fixture set:

```text
tenant_uat_001

users:
  creator
  viewer
  admin

credits:
  normal
  empty
  near_limit

mini_apps:
  valid_draft
  published
  invalid
```

Fixture lifecycle:

```text
allocate
→ execute
→ verify
→ cleanup
```

Cleanup must be idempotent.

Fixtures MUST also control sources of nondeterminism where relevant:

```text
clock/time
timezone
locale
random seed
feature flags
external API fixture version
model/provider version policy
```

Where exact determinism is impossible, the contract must declare the permitted tolerance and comparison policy.

---

# 22. Shadow UAT

Support non-destructive validation of production-like traffic.

Shadow mode MAY:

- resolve routing
- validate permissions
- query data
- perform read-only browser actions
- compute decisions
- render previews

Shadow mode MUST NOT automatically:

- charge credits
- send external emails
- publish
- delete
- mutate customer records
- execute irreversible side effects

---

# 23. Human Acceptance

Human review is required when:

- business meaning is ambiguous;
- UX quality is inherently subjective;
- legal/compliance acceptance is required;
- high-impact external side effects are present;
- confidence falls below policy threshold;
- security-sensitive operation cannot be deterministically validated.

Risk routing:

```text
Low       → auto accept
Medium    → sample / policy
High      → human approval
Critical  → mandatory human acceptance
```

Human overrides/waivers MUST be explicit records with actor, reason, scope, expiry, affected scenarios, evidence reviewed, and follow-up obligation. A waiver cannot silently mutate the underlying scenario into PASS.


---

# 24. UAT Status Model

Allowed final statuses:

```text
PASS
FAIL
BLOCKED
HUMAN_REVIEW
```

Prohibited final statuses:

```text
probably pass
looks okay
mostly works
```

---

# 25. UAT Run State Machine

```text
CREATED
→ PREPARING
→ ENVIRONMENT_READY
→ EXECUTING
→ VERIFYING
→ EVIDENCE_FINALIZING
→ PASS | FAIL | BLOCKED | HUMAN_REVIEW
```

Recovery states:

```text
RETRY_WAIT
RECOVERING
REPLAYING
QUARANTINED
```

A run may enter `QUARANTINED` only for a confirmed test-system defect/flaky test; quarantine MUST NOT be used to bypass a confirmed product failure.


---

# 26. Integration with worker_jobs

All non-trivial UAT runs SHOULD integrate with the shared job control plane.

Required properties:

- run_id
- tenant_id
- project_id
- correlation_id
- lease
- idempotency key
- retry policy
- provider
- execution placement
- budget
- approval state

No UAT engine should create an independent incompatible background-job system.

---

# 27. Database Model

Recommended logical entities:

```text
uat_scenarios
uat_scenario_versions
uat_runs
uat_steps
uat_assertions
uat_decisions
uat_evidence
uat_fixtures
uat_replays
uat_failures
uat_approvals
uat_requirement_links
uat_environment_fingerprints
uat_waivers
uat_quarantines
uat_side_effects
uat_provider_invocations
```

Minimum `uat_runs` fields:

```text
id
tenant_id
project_id
scenario_id
scenario_version
spec_ref
execution_provider
status
risk_level
started_at
finished_at
evidence_manifest_uri
correlation_id
worker_job_id
created_by
source_revision
environment_fingerprint_id
contract_digest
compiler_version
release_candidate_id
```

---

# 28. Multi-Tenant Security

All UAT data MUST be tenant-scoped.

Enforce:

- tenant-aware DB predicates
- namespaced R2 paths
- isolated fixture data
- restricted credentials
- provider-level secret isolation
- cross-tenant denial tests
- audit logging

UAT test data MUST NOT accidentally become production customer data.

Synthetic data is the default. Production-derived data requires explicit policy, minimization/de-identification, residency controls, retention limits, and auditable authorization before use.

---

# 29. Secret Handling

Rules:

1. Secrets are capability-scoped.
2. Sandbox receives only secrets required for the scenario.
3. Secret values must never appear in evidence.
4. Logs must redact secrets.
5. Harnesses receive no broader privilege than required.
6. Cloud and local credentials remain separately scoped.
7. Browser/page content cannot request or reveal privileged secrets.
8. Sandbox network egress is deny-by-default or allowlisted for high-risk scenarios.
9. UAT artifacts uploaded from untrusted sources are scanned/validated before privileged processing where applicable.
10. Evidence redaction runs before persistence, and redaction failure blocks finalization for protected data classes.

---

# 30. Cost Control

Each run should estimate:

```text
sandbox compute
browser minutes
Workers AI / Jev
LLM tokens
vision calls
external APIs
storage
```

Routing preference:

```text
deterministic
→ bounded model
→ fast LLM
→ reasoning LLM
→ vision
```

Add per-run:

```text
cost_budget
token_budget
browser_budget
sandbox_budget
```

Over-budget behavior:

```text
continue
degrade
ask approval
abort
```

depending on policy.

Cost controls MUST support **impact-based test selection** so Spec 224 can run the smallest safe regression set after a change, while still forcing the full critical suite for release candidates or high-risk dependency changes.

---

# 31. Jev Failure and Vendor Independence

Jev MUST NOT be a single point of failure.

If Jev unavailable:

```text
Jev
→ Fast structured LLM
→ reasoning model
→ HUMAN_REVIEW
```

The UAT scenario must remain unchanged.

---

# 32. Cloudflare Integration

## 32.1 Workers

Control-plane/API runtime.

## 32.2 Workers AI

Optional decision model inference:

```text
typesafe/jev
```

Workers AI is a separate Cloudflare service/capability but does not require an additional SmartAIHub Worker deployment solely for UAT.

## 32.3 Browser Run

Preferred managed browser UAT runtime for Chromium/headless-Chrome-compatible scenarios.

As of the Revision 1.2 implementation baseline, Cloudflare Browser Run provides headless Chrome. A Browser Run PASS therefore MUST NOT be represented as Firefox, WebKit/Safari, or native-device certification unless those engines/devices were exercised by another attested provider.

Supported integration patterns may include Worker-bound Playwright and remote CDP/Playwright sessions. Browser provider details remain behind `UATExecutionProvider`.

## 32.4 Sandbox / Containers

**SmartSpecPro runtime boundary:** isolated cloud build/test/runtime workloads MUST use the repository-approved Cloudflare Container runtime. References in this Spec to Cloudflare Sandbox or Sandbox SDK versions are product research/context only; they do not authorize a separate runtime, dependency or dispatch path. Any SDK may be used only when it is part of the approved Cloudflare Container integration contract.

Preferred cloud build/test runtime.

**Provider lifecycle baseline (2026-10-02):** Cloud runtime lifecycle remains provider-adapter-owned and MUST conform to the approved Cloudflare Container runtime boundary above. The Cloudflare Sandbox SDK 1.0 notes below are implementation research, not an independent provider-selection decision.

The provider adapter MUST own:

- sandbox/container identity;
- image digest and instance size selection;
- start/stop policy;
- process cancellation semantics;
- authenticated preview-port exposure;
- snapshot/restore policy where used;
- egress policy;
- orphan-resource reaping;
- cleanup/TTL behavior.

Existing 0.x integrations may be supported through a compatibility adapter during migration, but no Acceptance Contract may depend on 0.x-only semantics.

## 32.5 R2

Evidence bundles and test artifacts.

## 32.6 PostgreSQL + Hyperdrive

Source of record for UAT metadata, states, audit linkage, and business verification.

## 32.7 Queues / Workflows / Durable Coordination

Long-running UAT orchestration where appropriate.

Cloud provider selection MUST be capability-driven. Spec 271 MUST preserve provider abstractions so Browser Run, the approved Cloudflare Container runtime, or another explicitly approved future runtime can be replaced without changing the Acceptance Contract.

---

# 33. Local Harness Integration

Harness adapter contract:

```ts
interface DevelopmentHarness {
  capabilities(): Promise<HarnessCapabilities>;
  prepare(run): Promise<void>;
  implement(task): Promise<ImplementationResult>;
  test(plan): Promise<TestResult>;
  collectArtifacts(): Promise<ArtifactSet>;
}
```

UAT remains separate:

```text
Harness
→ IMPLEMENTED
→ SmartAIHub UAT
→ ACCEPTED
```

Do not permit:

```text
Harness says done
→ automatic release
```

without acceptance gate.

The harness result MUST identify the exact source revision it produced. UAT MUST reject or restart if the tested revision differs from the candidate revision submitted to Final Verify (TOCTOU protection).

---

# 34. Tablet/Mobile User Flow

Example:

User:

> Add PDF export to this Mini App, test desktop/tablet/mobile, fix problems until UAT passes.

System:

```text
Chat
→ Spec 224 plan
→ choose Cloud Sandbox
→ modify code
→ build/test
→ launch preview
→ Browser Run
→ desktop viewport
→ tablet viewport
→ mobile viewport
→ API/DB assertions
→ evidence
→ repair loop if FAIL
→ final UAT
→ return result to Chat
```

User receives:

```text
UAT 18/18 PASS

Desktop       PASS
Tablet        PASS
Mobile        PASS
API           PASS
Database      PASS
Permissions   PASS
Recovery      PASS
```

with:

- Preview
- Screenshots
- Evidence
- Diff
- Approval action

---

# 35. Task Control Center UI

Required UAT panel:

```text
Scenario
Run ID
Spec Ref
Execution location
Harness
Current phase
Step progress
Assertions
Evidence
Cost
Failures
Decision traces
Verification level (mock/sandbox/real)
Browser/device/runtime fidelity
Configuration digest
AI evaluation sample/threshold summary
Causality/trace completeness
```

Actions:

```text
Open Preview
View Screenshot
View Evidence
Replay
Retry Failed Step
Retry Full Scenario
Compare Runs
Ask Agent to Diagnose
Create Bug
Approve
Reject
View Requirement Coverage
View Environment Fingerprint
View Side Effects
View Verification Matrix
View AI Evaluation Summary
View Causality Trace
View Waiver/Quarantine Status
```

---

# 36. Spec 224 Integration

Spec 224 release flow becomes:

```text
Plan
→ Implement
→ Unit Test
→ Integration Test
→ Contract Test
→ E2E
→ Security Checks
→ UAT
→ Recovery UAT
→ Pre-Release Acceptance
→ Final Verify
→ Release
→ Post-Deploy Synthetic Verification
→ Promote / Roll Back
```

If UAT FAIL:

```text
FAIL
→ collect evidence
→ diagnose
→ root cause
→ propose repair
→ implement
→ targeted tests
→ rerun failed UAT
→ regression UAT
→ Final Verify
```

---

# 37. Acceptance Loop

Canonical automated loop:

```text
IMPLEMENT
→ TEST
→ UAT
→ FAIL?
    YES
      → DIAGNOSE
      → FIX
      → RETEST
      → RE-UAT
    NO
      → FINAL VERIFY
```

A repair loop MUST preserve the failing evidence and requirement link so the agent cannot “fix” the test by weakening the acceptance condition unless a separately authorized requirement change exists.

Loop MUST terminate on:

- PASS
- unresolved blocker
- approval requirement
- budget exhausted
- risk policy
- max repair attempts

---

# 38. Skill-First Integration

UAT capabilities must be discoverable as Skills/functions.

Examples:

```text
uat.create_scenario
uat.compile_contract
uat.run
uat.run_browser
uat.assert_api
uat.assert_db
uat.inject_failure
uat.replay
uat.compare_runs
uat.collect_evidence
uat.explain_failure
uat.request_human_review
uat.requirement_coverage
uat.select_impacted_suite
uat.verify_environment
uat.post_deploy_verify
uat.rollback_release
uat.create_waiver
uat.quarantine_test
```

Agents should invoke these capabilities before improvising bespoke shell/browser automation.

---

# 39. Regression Promotion

A production bug SHOULD become a reusable UAT regression scenario.

Flow:

```text
incident
→ root cause
→ acceptance scenario
→ regression suite
→ permanent gate
```

Prevent recurrence of known bugs.

Regression scenarios MUST retain the incident/root-cause reference and the minimal reproduction evidence. Removal requires explicit justification and approval.

---

# 40. Flaky Test Management

Track:

```text
pass rate
retry success rate
environment dependency
selector instability
provider instability
decision instability
```

Flaky scenarios MUST NOT silently count as stable PASS.

Possible states:

```text
stable
suspected_flaky
confirmed_flaky
quarantined
```

Quarantine records MUST include owner, cause, evidence, issue reference, expiry date, and release-gate behavior. Expired quarantine automatically returns to blocking state unless renewed explicitly.


---

# 41. Confidence Policy

Decision confidence and business acceptance are separate.

Example:

```text
Jev target confidence = 0.96
```

does not mean:

```text
UAT confidence = 0.96
```

UAT PASS requires assertions to pass.

Low target-resolution confidence may trigger escalation before execution.

---

# 42. Observability

Metrics:

```text
uat_run_count
uat_pass_rate
uat_fail_rate
uat_blocked_rate
uat_human_review_rate
mean_run_duration
mean_cost
decision_provider_usage
vision_fallback_rate
flaky_rate
replay_rate
repair_loop_count
bug_escape_rate
requirement_coverage_rate
stale_scenario_count
quarantine_count
waiver_count
post_deploy_failure_rate
automatic_rollback_count
contract_migration_failure_count
async_assertion_timeout_rate
ai_acceptance_revalidation_count
browser_matrix_coverage_rate
media_validation_failure_rate
sandbox_orphan_reap_count
configuration_matrix_coverage_rate
causality_chain_complete_rate
```

Critical product KPI:

```text
production_bug_escape_rate_after_uat
```

---

# 43. Minimum Viable Milestones

## M1 — Contract, Traceability & UAT Core

Implement:

- Acceptance Contract schema/versioning
- Contract Schema Registry + compatibility range
- explicit schema migration functions/tests
- requirement-to-scenario traceability
- scenario registry
- source-revision binding
- UAT runner/state machine
- deterministic assertions
- PASS/FAIL/BLOCKED/HUMAN_REVIEW

Exit:

- browser-independent API UAT works end to end and every release-blocking scenario maps to at least one requirement.

## M2 — Evidence, Environment & Fixtures

Implement:

- evidence manifest + hashes/redaction
- environment fingerprint
- fixture service
- clock/locale/timezone/seed controls
- temporal assertion engine (`wait_until`, event barriers, deadlines)
- test-oracle metadata

Exit:

- a run is reproducible enough to identify source revision, environment, data fixture, and oracle used.

## M3 — Browser + API + DB + Accessibility

Implement:

- Playwright local
- Cloud Browser provider
- API assertions
- DB assertions
- audit assertions
- accessibility assertions
- visual evidence/baseline policy
- browser-engine/network capability matrix
- media/multimodal technical validators

Exit:

- same scenario can run local or cloud browser against an identical logical contract.

## M4 — Placement + Secure Cloudflare Container Runtime

Implement:

- approved Cloudflare Container runtime provider
- secure preview channel
- Placement Resolver
- source revision/TOCTOU checks
- egress policy
- side-effect policy
- sandbox lifecycle/TTL/reaper
- supply-chain/build provenance attestation

Exit:

- tablet-only development can build, preview, and execute UAT without weaker acceptance quality.

## M5 — Intelligent Decision Resolver

Implement:

- stable selector rules
- DOM/A11y resolver
- untrusted-content boundary
- Jev provider
- fast LLM provider
- fallback policy
- provider invocation replay metadata
- AI/Agent non-deterministic evaluation harness
- model/prompt/skill/retrieval drift invalidation

Exit:

- ambiguous browser flows recover without full vision in common cases and page content cannot override privileged instructions.

## M6 — Recovery, Replay, Parallelism & Governance

Implement:

- failure injection
- recovery tests
- evidence replay
- deterministic mock replay
- concurrency/idempotency tests
- test sharding/resource locks
- waiver/quarantine governance
- tenant/feature-flag/configuration matrix planner
- distributed trace/causality verifier

Exit:

- worker restart, duplicate-delivery, concurrency, quarantine-expiry, and replay scenarios are verified.

## M7 — Spec 224 Autonomous Acceptance & Post-Deploy Verification

Implement:

- automatic UAT generation
- impact-based suite selection
- repair loops
- targeted rerun
- regression promotion
- final acceptance gate
- post-deploy synthetic verification
- automated rollback policy
- controlled UX/SLO smoke gates
- final verification-level summary (mock/sandbox/real, browser engines, device/runtime fidelity)

Exit:

- Spec 224 can implement → UAT → diagnose → fix → re-UAT → final verify → deploy → verify production candidate → promote/rollback.

---

# 44. Implementation Order

Recommended sequence:

```text
1. Contract schema + versioning + requirement links
2. DB schema + run state machine
3. Source-revision binding + environment fingerprint
4. Assertions + oracle metadata
5. Evidence integrity + redaction + retention
6. Fixtures + deterministic clock/locale/seed controls
7. Local Playwright
8. Cloud Browser
9. Approved Cloudflare Container runtime + secure preview
10. Placement Resolver
11. Side-effect controller + approval/compensation hooks
12. Decision Resolver
13. Jev provider
14. LLM fallback + untrusted-content protections
15. Recovery/failure injection
16. Replay
17. Parallelism/resource locks
18. Waiver/quarantine governance
19. Task Control UI
20. Spec 224 repair loop
21. Impact-based regression selection
22. Regression promotion
23. Post-deploy verification + rollback gate
24. Contract Schema Registry + migration tooling
25. Temporal assertion/synchronization engine
26. AI/Agent non-deterministic evaluation harness
27. Browser-engine/network-fidelity matrix
28. Media/multimodal artifact validators
29. Approved Cloudflare Container lifecycle/reaper + supply-chain attestation
30. Configuration/feature-flag variant planner
31. Distributed trace/causality verifier
32. Controlled UX/SLO smoke gates
```

Do not begin with AI/vision. Do not allow AI-generated UAT to weaken a human/spec-defined acceptance condition.

---

# 45. Required Acceptance Tests for Spec 271 Itself

The implementation MUST prove at minimum:

### Placement

- local available → local selected
- local unavailable → cloud selected
- browser-only → cloud browser
- build required → cloud sandbox
- Windows native → Windows runner

### Decision

- exact testid requires no AI
- ARIA match requires no AI
- ambiguous target invokes bounded resolver
- Jev unavailable falls back
- LLM unavailable returns BLOCKED/HUMAN_REVIEW

### Evidence

- screenshot stored
- API evidence stored
- DB assertion stored
- secret redaction works
- evidence manifest complete

### Security

- cross-tenant fixture denied
- cross-tenant evidence denied
- unauthorized replay denied
- sandbox receives scoped secrets only

### Recovery

- worker restart resumes
- duplicated job does not duplicate side effect
- replay reproduces failure
- cleanup is idempotent

### Spec 224

- failed UAT creates repair loop
- repaired implementation reruns targeted scenario
- regression suite executes before Final Verify

---

# 45.1 Additional Mandatory Self-UAT After Gap Review

### Traceability / Anti-Test-Weakening

- every release-blocking requirement maps to scenario(s);
- changed requirement marks affected scenario stale;
- agent cannot edit failing assertion to PASS without an authorized requirement change;
- tested source revision equals release candidate revision.

### Environment Fidelity

- environment fingerprint captured;
- locale/timezone/feature flags are reproducible;
- dependency/runtime drift is detected;
- private preview is run-scoped and access-controlled.

### Untrusted Content / Prompt Injection

- page text attempting to override system/tool policy is ignored;
- page content cannot request secrets;
- external file content cannot change approval policy;
- egress rules block unauthorized exfiltration.

### Side Effects

- email/payment/publish/delete actions use sandbox/mock/compensation or approval policy;
- irreversible action without required approval is blocked;
- duplicate execution does not duplicate external side effects.

### Evidence Integrity

- artifact hashes verify;
- evidence redaction occurs before persistence;
- tampered manifest is detected;
- retention/deletion policy is enforceable.

### Governance

- waiver does not convert a failed scenario to PASS;
- quarantine requires expiry and owner;
- expired quarantine becomes blocking again;
- human approval is auditable.

### Post-Deploy

- release candidate performs synthetic verification after deploy;
- failed post-deploy verification triggers policy-defined rollback or HUMAN_REVIEW;
- promoted release is bound to the UAT-tested revision.

---


### Contract Evolution

- old supported contract versions still execute or migrate explicitly;
- unsupported contract version fails closed;
- migration cannot silently weaken assertions/invariants.

### Temporal Correctness

- eventual assertions use deadlines/event barriers rather than blind sleeps;
- timeout evidence distinguishes product timeout from provider timeout;
- controlled clock cannot falsify monotonic-duration checks.

### AI / Agent Output

- evaluator and generator independence policy is enforced;
- tool-call invariants remain deterministic even when prose output varies;
- model/prompt drift invalidates or re-baselines affected acceptance evidence according to policy.

### Browser / Network Fidelity

- Chromium-only execution cannot certify Firefox/WebKit;
- required offline/slow-network scenarios are routed to a capable provider;
- browser/version mismatch blocks a release gate when declared mandatory.

### Media / Multimodal

- corrupt image/video/audio artifacts fail before subjective quality review;
- video duration/FPS/audio-stream assertions are machine-verifiable;
- subjective semantic quality cannot be promoted to deterministic PASS without an approved oracle.

### Sandbox / Supply Chain

- Sandbox SDK/provider version and image digest are attested;
- cancelled processes trigger compensation/dirty-workspace handling where required;
- dependency install cannot silently gain unrestricted network/secret access;
- orphan sandboxes/previews are reclaimed.

### Configuration Variants

- critical tenant/feature-flag combinations are not lost to pairwise reduction;
- executed configuration digest is stored with evidence.

### Causality

- browser action, API request, worker job, audit event, and artifact can be joined by correlation/trace identity;
- missing causality links in release-critical flows produce FAIL/BLOCKED according to contract.

---

# 46. Performance Targets

Initial non-binding targets:

```text
deterministic target resolution       < 100 ms typical
bounded decision resolution           < 1 s target
UAT orchestration overhead            minimal vs test runtime
evidence manifest finalization        < 5 s typical
critical decision audit coverage      100%
critical assertion evidence coverage  100%
```

Do not sacrifice correctness for these targets.

---

# 47. Cost Optimization Targets

Target routing distribution after maturity:

```text
70–85% deterministic
10–20% bounded decision model
<10% full reasoning/vision
```

This is a directional optimization goal, not a pass/fail requirement.

---

# 48. Compatibility Requirements

Spec 271 MUST:

- not break existing test suites;
- coexist with existing Playwright/Cypress/etc.;
- support import/wrapping of existing E2E cases;
- not require Jev;
- not require a local runner;
- not require a cloud sandbox for browser-only cases;
- not force a user to own a development PC;
- not force one specific LLM vendor;
- not bypass approvals defined elsewhere.

---

# 49. Migration Strategy

Existing E2E tests should be classified:

```text
E2E only
UAT candidate
UAT critical
deprecated/duplicate
```

Critical business flows should be promoted first:

1. authentication
2. credits
3. Mini App create/edit/publish
4. tenant ACL
5. marketplace purchase/run
6. worker_jobs
7. runner connection
8. artifact upload/export
9. background recovery
10. deployment

---

# 50. Initial High-Priority UAT Suite

Recommended first suite:

```text
AUTH-001 signup/login/session
CREDIT-001 deduct exactly once
TENANT-001 cross-tenant denial
MINIAPP-001 create
MINIAPP-002 edit
MINIAPP-003 publish private
MINIAPP-004 publish public
RUNNER-001 connect/disconnect/recover
JOB-001 retry/idempotency
ARTIFACT-001 upload/store/retrieve
MARKET-001 purchase/run/settle
DEPLOY-001 build/deploy/verify
RECOVERY-001 worker crash/resume
SECURITY-001 hostile page/prompt-injection isolation
SIDEFX-001 irreversible side-effect approval block
TRACE-001 requirement-to-release-candidate traceability
POSTDEPLOY-001 synthetic verify and rollback
```

---

# 51. Risks

## Risk: Too Much AI in Testing

Mitigation:

- deterministic-first
- typed decision provider
- evidence-based assertions

## Risk: Cloud Cost

Mitigation:

- local-first
- browser-only provider
- sandbox only when required
- bounded model before LLM
- budget controls

## Risk: Flaky Browser Tests

Mitigation:

- testid/ARIA standard
- semantic resolver
- replay
- flakiness tracking

## Risk: Vendor Lock-In

Mitigation:

- DecisionProvider abstraction
- ExecutionProvider abstraction
- Harness abstraction

## Risk: False PASS

Mitigation:

- multi-layer assertions
- business invariants
- independent acceptance
- critical evidence requirements

---

# 52. Requirement Traceability & Coverage Governance

Every release-blocking UAT scenario MUST be connected to its originating requirement(s).

Maintain a bidirectional graph:

```text
Spec / Requirement
      ↕
Acceptance Criterion
      ↕
UAT Scenario
      ↕
Assertions / Invariants
      ↕
Evidence / Run
      ↕
Release Candidate
```

Required capabilities:

- requirement coverage matrix;
- stale-scenario detection after requirement changes;
- orphan-requirement detection;
- orphan-scenario detection;
- explicit acceptance owner;
- requirement version/digest;
- scenario compiler version/digest;
- release candidate binding.

A release-blocking requirement with no executable scenario must appear as a visible coverage gap, never as implicit PASS.

---

# 53. Environment Fidelity & Reproducibility

Every significant run MUST record an environment fingerprint including, where applicable:

```text
source commit/tree digest
container/base image digest
OS/runtime versions
Node/Python/Rust/toolchain versions
package lockfile digest
browser + Playwright version
schema/migration version
feature flag snapshot
locale/timezone
controlled-clock configuration
random seed
external fixture versions
DecisionProvider/LLM model version policy
network-egress policy
```

Release-gate policy may require a minimum fidelity level:

```text
unit_like
integration_like
staging
production_like
native_device
```

A run from an insufficient-fidelity environment cannot satisfy a higher-fidelity release requirement.

---

# 54. Source Revision Integrity / TOCTOU Protection

UAT MUST bind the following to one immutable release candidate identity:

```text
implementation result
source revision
build artifact
UAT evidence
Final Verify
post-deploy verification
```

If source changes after UAT, the acceptance result is stale unless policy determines the change is evidence-neutral and proves it deterministically.

Critical releases SHOULD use artifact digests/content-addressed identities rather than branch names alone.

---

# 55. Untrusted Content & Agent Security Boundary

The UAT system will intentionally browse arbitrary pages and consume user/external content. Therefore:

```text
DOM
Accessibility tree
page text
images
PDF/file content
external API content
chat-derived fixture data
```

are **data**, not privileged instructions.

Mandatory protections:

- privileged tool policy exists outside page content;
- prompt injection from a page cannot grant capabilities;
- page content cannot expand network egress;
- page content cannot expose secrets;
- page content cannot disable assertions or acceptance gates;
- page content cannot approve irreversible side effects;
- decision prompts receive the smallest necessary content subset;
- suspicious content is recorded as security evidence without executing its instructions.

---

# 56. Side-Effect Controller

UAT requires an explicit controller for actions that leave the test boundary.

Side effects are classified:

```text
READ_ONLY
REVERSIBLE
COMPENSATABLE
EXTERNAL_SANDBOXED
IRREVERSIBLE
```

Examples:

- email → test mailbox/provider sandbox when possible;
- payment → provider sandbox/test mode;
- publish → isolated tenant/staging target;
- delete → disposable fixture or reversible soft-delete;
- webhook → test receiver;
- external message → sandbox/draft unless explicitly approved.

`IRREVERSIBLE` actions require explicit policy/approval and must never be triggered solely by a probabilistic UI decision.

---

# 57. Concurrency, Parallelism & Resource Locks

UAT suites may run in parallel, but shared resources require fencing.

Support:

- scenario sharding;
- tenant-scoped test namespaces;
- resource lock/fencing tokens;
- unique idempotency keys;
- per-scenario concurrency policy;
- parallel-safe fixtures;
- serial groups for destructive/shared-state tests.

Concurrency UAT MUST test races relevant to credits, jobs, publishing, approvals, marketplace settlement, and artifact writes.

---

# 58. Impact-Based Test Selection

Spec 224 SHOULD not execute the entire expensive suite after every small edit.

Create an impact graph from:

```text
changed files/modules
API contracts
DB schema
skills/capabilities
UI routes/components
worker job types
feature flags
dependencies
historical failures
requirement links
```

Selection policy:

```text
small low-risk change → impacted scenarios + smoke suite
medium change         → impacted + dependent regression
high-risk change      → full critical suite
release candidate     → policy-required release suite
```

The selection decision itself must be auditable.

---

# 59. Failure Taxonomy & Automated Triage

Normalize failures into categories:

```text
PRODUCT_DEFECT
TEST_DEFECT
ENVIRONMENT_DEFECT
FIXTURE_DEFECT
DECISION_RESOLVER_DEFECT
PROVIDER_OUTAGE
SECURITY_POLICY_BLOCK
REQUIREMENT_AMBIGUITY
EXPECTED_BLOCKER
FLAKY_SUSPECTED
```

Spec 224 repair behavior depends on category. For example:

- `PRODUCT_DEFECT` → code repair;
- `TEST_DEFECT` → UAT repair with independent approval if release-blocking;
- `ENVIRONMENT_DEFECT` → recreate environment;
- `REQUIREMENT_AMBIGUITY` → HUMAN_REVIEW;
- `PROVIDER_OUTAGE` → provider fallback/retry;
- `SECURITY_POLICY_BLOCK` → no autonomous bypass.

---

# 60. Evidence Integrity, Privacy & Retention

Evidence must be useful without becoming a new data-leak surface.

Required policy dimensions:

- data classification;
- PII/secret redaction;
- retention duration;
- deletion rights;
- tenant isolation;
- content hashing;
- manifest attestation/signing where supported;
- immutable audit linkage;
- access-log auditing.

Evidence should default to **minimum sufficient evidence**, not indiscriminate recording of whole sessions.

---

# 61. Visual, Accessibility & Device Matrix

Each product defines a supported acceptance matrix, for example:

```text
Desktop Chromium
Tablet portrait
Tablet landscape
Mobile narrow viewport
Keyboard-only accessibility path
```

Not every scenario must execute across every matrix cell. Critical journeys declare required cells; impact-based selection expands them when responsive/layout code changes.

Native Windows/macOS/iOS/Android requirements must route to a compatible device/provider rather than being falsely certified from Linux/headless browser execution.

---

# 62. External Dependency Virtualization

Where external systems are expensive, unsafe, nondeterministic, or unavailable, provide contract-preserving test adapters for:

- payment gateways;
- email/SMS;
- webhooks;
- storage providers;
- external AI providers;
- third-party data APIs;
- OAuth providers.

The platform MUST distinguish:

```text
mock verification
sandbox-provider verification
real integration verification
```

and must not claim the strongest level when only a mock was exercised.

---

# 63. Provider Health & Capability Attestation

Before placement, providers report capabilities and health:

```text
browser version
OS/runtime
network policy
available tools
native-device capability
secret support
GPU/CPU class if relevant
current load
region/data-residency
provider health
```

Placement MUST fail closed when a mandatory capability cannot be attested.

Capability attestation MUST also carry freshness and trust information:

```text
provider_id
runner_id
trust_tier
attestation_issued_at
attestation_expires_at
software/version digest
capability digest
capacity snapshot
region/residency
health state
```

A stale self-declared capability from an untrusted or disconnected local runner MUST NOT certify a release-blocking environment.

---

# 64. Waiver, Quarantine & Exception Governance

A release gate may sometimes need an exception, but exceptions must never erase truth.

`WAIVER` means an authorized actor accepts a known release risk.

`QUARANTINE` means a confirmed test-system problem temporarily removes a test from normal gating.

Both require:

```text
owner
reason
scope
issue/reference
evidence
expiry
release behavior
follow-up action
```

Neither changes a FAIL into PASS.

---

# 65. Pre-Release and Post-Deploy Acceptance

A release is not complete at deployment.

Canonical flow:

```text
Pre-release UAT PASS
→ immutable release candidate
→ deploy
→ post-deploy synthetic verification
→ critical health/business checks
→ PROMOTE
       or
  ROLLBACK / HUMAN_REVIEW
```

Post-deploy checks should use low-risk synthetic/test identities and avoid mutating real customer data.

---

# 66. Acceptance Ownership & Human Agency

Each release-blocking scenario declares an acceptance owner class, such as:

```text
product
engineering
security
operations
tenant owner
human end-user sample
```

Automation may execute and recommend a gate outcome, but it must preserve explicit human approval requirements defined by policy. The system must make it easy to see what was automatically verified versus what still requires human judgment.

---

# 67. Updated Definition of Done After 10-Pass Review

In addition to the earlier Definition of Done, implementation is not complete until:

21. release-blocking requirements have bidirectional UAT traceability;
22. UAT result is bound to an immutable source/release-candidate revision;
23. environment fingerprints and fidelity levels are recorded;
24. page/external content is isolated as untrusted data from privileged agent instructions;
25. external/irreversible side effects are policy-controlled;
26. evidence integrity, redaction, retention, and access controls are implemented;
27. waiver/quarantine have expiry and cannot rewrite FAIL into PASS;
28. impact-based suite selection is auditable;
29. concurrent tests use fencing/resource isolation;
30. post-deploy synthetic verification can promote or stop/rollback a release according to policy;
31. mock/sandbox/real-integration verification levels are explicitly distinguished;
32. critical accessibility/device-matrix requirements are representable and executable;
33. provider capability attestation prevents false certification on an incompatible runtime;
34. Spec 224 cannot “repair” a failure by silently weakening acceptance criteria;
35. the tested source revision is the revision promoted by Final Verify/deployment.

---

# 68. Ten-Pass Gap Review Record

The Revision 1.1 review was performed across ten independent lenses:

1. **Architecture:** closed provider abstraction and control-plane/runtime boundaries.
2. **Acceptance semantics:** added traceability, acceptance ownership, oracle independence, and anti-test-weakening rules.
3. **Execution placement:** added capability attestation, fidelity requirements, secure private previews, and native-device constraints.
4. **Determinism/reproducibility:** added source/environment fingerprints, time/locale/seed/feature-flag controls.
5. **Security:** added untrusted-content/prompt-injection boundary, egress controls, and side-effect policy.
6. **Evidence/data governance:** added hashes/attestation, redaction, retention, privacy, and minimum-sufficient-evidence rules.
7. **Failure/recovery:** added fault identities, normalized failure taxonomy, concurrency/resource fencing, replay governance.
8. **Cost/scalability:** added impact-based regression selection, sharding, and provider capability/health routing.
9. **UX/governance:** added Task Control visibility, waiver/quarantine lifecycle, human acceptance ownership, tablet parity.
10. **Spec 224/release lifecycle:** added immutable candidate binding, anti-TOCTOU, post-deploy synthetic verification, promotion/rollback.

No remaining architectural blocker is known for beginning M1 implementation. Provider-specific API details and production credentials remain implementation-time configuration, not reasons to weaken the platform contracts above.

---

# 69. Final Architectural Decision

SmartAIHub SHALL treat UAT as a platform capability rather than a test-script collection.

The canonical structure is:

```text
SmartAIHub UAT Platform
        ↓
Acceptance Contract
        ↓
Execution Placement Resolver
        ↓
Local / Cloud Browser / Cloud Sandbox / Remote Device
        ↓
Decision Resolver
Rules → DOM/A11y → Decision Intelligence Plane → LLM → Vision
        ↓
Assertions
UI / API / DB / Events / ACL / Jobs / Invariants
        ↓
Evidence + Replay
        ↓
Spec 224 Acceptance Gate
```

The resulting system must allow both:

```text
User with powerful PC + Codex/Claude/Hermes
```

and

```text
User with only tablet/mobile
```

to receive the same logical acceptance quality.

The difference is execution placement, not feature capability.

---

# 70. Definition of Done (Original Baseline)

Spec 271 is considered implemented when:

1. Acceptance Contract schema is versioned and validated.
2. UAT runs are represented in the shared job/control plane.
3. Local Runner execution works.
4. Cloud Browser execution works.
5. Cloud Sandbox execution works for build/test scenarios.
6. Placement Resolver automatically chooses a valid execution location.
7. Browser target resolution is deterministic-first.
8. Jev is optional behind DecisionProvider.
9. Existing SmartAIHub LLM Gateway provides fallback.
10. UI/API/DB/Audit/ACL/Job assertions are supported.
11. Evidence bundles are generated.
12. Replay is supported.
13. Failure injection and recovery UAT are supported.
14. Multi-tenant isolation is verified.
15. Task Control Center displays UAT state/evidence.
16. Spec 224 can invoke UAT as a release gate.
17. Spec 224 can repair failed UAT and rerun it.
18. Tablet-only users can initiate and review the complete workflow.
19. Local-harness users can reuse their own compute/subscriptions.
20. Critical flows cannot reach Final Verify without the required UAT gate.

---


# 72. UAT Contract Schema Registry & Evolution

The Acceptance Contract is a durable platform API and therefore requires its own schema lifecycle.

Every contract MUST include:

```text
contract_schema_version
scenario_id
scenario_version
compiler_version
contract_digest
```

The platform MUST provide:

- canonical JSON Schema (or equivalent machine-validatable schema);
- schema registry;
- runner compatibility range;
- explicit migration functions;
- migration test fixtures;
- migration provenance;
- validation before scheduling.

Rules:

1. A runner MUST fail closed on an unsupported contract schema.
2. A migration MUST NOT remove or weaken release-blocking assertions, invariants, approvals, fidelity requirements, or evidence requirements without explicit authorized change.
3. Stored historical runs retain the original normalized contract and digest.
4. Recompilation under a newer compiler creates a new scenario version rather than mutating historical evidence.
5. Contract migration and requirement change are distinct operations.

---

# 73. Temporal Semantics & Asynchronous Assertions

Distributed systems are eventually consistent. UAT must model time explicitly rather than hide races behind sleeps.

Release-blocking scenarios SHOULD use primitives such as:

```text
wait_until(predicate, deadline)
wait_for_event(event_type, correlation_id, deadline)
assert_stable(predicate, duration)
assert_never(predicate, observation_window)
assert_eventually_once(event, deadline)
```

Requirements:

- arbitrary fixed `sleep()` SHOULD NOT be generated as an acceptance strategy;
- every wait has a deadline;
- timeout reason is evidence;
- polling uses bounded backoff/jitter;
- event-driven barriers are preferred when available;
- monotonic duration and wall-clock business time are treated separately;
- controlled clock/time travel is declared in the environment fingerprint;
- cancellation does not imply that side effects did not already occur.

This section is critical for `worker_jobs`, queues, Workflows, deployments, media generation, payments, credits, and external provider callbacks.

---

# 74. AI / Agent UAT for Non-Deterministic Outputs

SmartAIHub is an AI platform; exact-string assertions are insufficient for many first-class product behaviors.

AI/Agent UAT MUST separate:

```text
deterministic invariants
structured-output validity
tool/action correctness
policy compliance
semantic quality
consistency / stability
human judgment
```

## 74.1 Reproducibility Metadata

Where applicable record:

```text
provider
model + version/alias resolution
prompt/template digest
system-policy digest
tool schema digest
skill/version digest
retrieval-source digest
temperature/top_p
seed when supported
context digest
routing decision
```

## 74.2 Deterministic Invariants First

Examples:

- output matches JSON/schema;
- no forbidden tool was called;
- spend/budget limit honored;
- tenant boundary preserved;
- required citation/evidence present;
- tool call arguments satisfy policy;
- max loop/step count respected;
- approval gate respected.

These must not be replaced by an LLM judge.

## 74.3 Semantic Evaluation

When semantic quality must be evaluated, use one or more:

- bounded rubric;
- reference/golden cases;
- Jev/structured evaluator where suitable;
- independent evaluator model;
- human sample;
- statistical multi-run threshold.

The generator MUST NOT be the sole judge of its own output for release-blocking AI quality.

## 74.4 Statistical Acceptance

For inherently variable behavior, a contract MAY define:

```yaml
ai_acceptance:
  samples: 20
  min_pass_rate: 0.95
  max_policy_violation_rate: 0
  confidence_interval_policy: required
```

A single lucky run cannot certify a stochastic behavior when the requirement is statistical.

## 74.5 Drift Governance

Provider/model/prompt/skill/retrieval changes can stale previous AI acceptance evidence even when application source code is unchanged.

The impact graph MUST therefore include AI configuration and model-routing changes.

---

# 75. Browser Engine, Network & Client Fidelity Matrix

Viewport size is not equivalent to browser or device fidelity.

The acceptance matrix may include:

```text
Chromium
Firefox
WebKit/Safari-equivalent
native Android WebView
native iOS WebView
desktop Windows/macOS native surface
tablet/mobile viewport
keyboard-only
touch
offline
high-latency network
intermittent network
reduced-motion / high-contrast where required
```

Rules:

1. Cloudflare Browser Run Chromium evidence certifies Chromium-compatible requirements only.
2. Firefox/WebKit/native requirements route to Local Runner or another attested provider.
3. User-agent spoofing MUST NOT be treated as equivalent to executing the required engine.
4. Network conditions required by the contract are part of provider capability attestation.
5. Service-worker/cache/offline scenarios require explicit storage/cache reset semantics.
6. Browser version is stored in the environment fingerprint.
7. Critical matrix cells are explicit; optional cells may use impact/pairwise selection.

---

# 76. Media & Multimodal Artifact Acceptance

SmartAIHub generates image, video, audio, PDFs, and composite media. UAT must validate these artifacts without relying only on screenshots.

## 76.1 Deterministic Media Assertions

Examples:

```text
file exists
content hash recorded
MIME/container is valid
decoder can open asset
expected resolution
expected duration
expected FPS/timebase
expected audio stream/channel/sample rate
expected page count
expected codec/profile when contract requires
no zero-byte/truncated artifact
R2 namespace/ownership correct
```

Video/audio validation SHOULD inspect stream metadata and decode representative segments.

## 76.2 Semantic / Creative Quality

Subjective properties such as:

```text
composition
naturalness
character continuity
brand/style match
speech quality
lip sync
story coherence
```

must be represented as an explicit semantic/human acceptance layer, not a deterministic technical assertion.

## 76.3 Timeline / Structured Media

For Film Studio/Video Editor workflows, validate both rendered output and structured source artifacts where applicable:

```text
timeline state
camera_path
object tracks
timing
trajectory manifest
audio alignment
render/playblast identity
```

---

# 77. Build Supply Chain & Untrusted-Code Protection

Cloud build/UAT executes repository and dependency code and therefore crosses a strong trust boundary.

Required controls:

- immutable dependency lockfile policy for release candidates;
- runtime/toolchain/base-image digests;
- package-manager version;
- lifecycle/install-script policy;
- scoped network egress during dependency install;
- no production secrets during untrusted install/build unless explicitly required;
- dependency/cache provenance;
- build artifact digest;
- optional SBOM and provenance attestation for release policy;
- vulnerability/license/security gates may be linked from security tooling without making Spec 271 the scanner itself.

A passing UAT MUST NOT launder an untrusted or untraceable build artifact into a trusted release.

---

# 78. Sandbox Lifecycle, Cancellation & Resource Reaping

Each cloud execution needs an explicit resource lifecycle.

Canonical lifecycle:

```text
ALLOCATE
→ PREPARE
→ EXECUTE
→ VERIFY
→ SNAPSHOT_IF_POLICY
→ CLEANUP
→ REAPED
```

Requirements:

- default one isolated sandbox namespace per run/task boundary;
- authenticated preview endpoints;
- TTL/idle-stop policy;
- explicit process handles;
- cancellation semantics recorded;
- dirty workspace marked after uncertain cancellation;
- no automatic retry of a non-idempotent command unless compensation/idempotency is proven;
- orphan preview ports, containers, leases, and temporary artifacts reclaimed by watchdog/reaper;
- cleanup failure produces evidence/operations alert rather than disappearing;
- snapshots never replace source-of-record artifacts unless policy says so.

For new implementation, the adapter MUST conform to the approved Cloudflare Container runtime contract. Sandbox SDK lifecycle semantics are reusable only when that runtime contract explicitly includes them.

---

# 79. Configuration, Feature-Flag & Tenant-Variant Coverage

SmartAIHub behavior can vary by:

```text
tenant
plan
role
feature flags
provider routing
region
white-label domain
plugin/skill availability
runtime placement
billing/credit policy
```

A release gate therefore needs a declared configuration matrix.

Use:

- exhaustive coverage for critical combinations;
- pairwise/covering-array reduction for lower-risk combinatorial space;
- historical-risk weighting;
- tenant-specific mandatory cases where contractual;
- configuration digest in evidence.

Pairwise reduction MUST NOT remove a combination explicitly marked safety-, payment-, tenant-isolation-, or release-critical.

---

# 80. Performance & UX SLO Smoke Gates

Spec 271 does not replace load/performance testing, but UAT may enforce small controlled experience-level SLOs.

Examples:

```text
critical page becomes usable before deadline
publish acknowledgement before deadline
background operation reports progress
no infinite spinner
API p95 under a controlled synthetic sample
preview opens within policy threshold
```

Rules:

- label these as controlled smoke/SLO assertions, not load-test certification;
- environment and sample size are recorded;
- high-scale capacity claims require the dedicated performance/load system;
- a severe latency regression may block acceptance even when functional assertions pass.

---

# 81. Distributed Trace & Causality Verification

For distributed flows, evidence should show not only final state but how it happened.

Propagate or correlate:

```text
uat_run_id
scenario_id
correlation_id
trace_id
request_id
worker_job_id
deployment_id
artifact_id
audit_event_id
```

Release-critical flows SHOULD permit construction of a causality chain:

```text
browser action
→ API request
→ DB mutation
→ outbox/event
→ worker job
→ provider call
→ artifact
→ audit event
→ UI state
```

Missing or contradictory causality evidence is a first-class diagnostic signal.

OpenTelemetry-compatible trace context MAY be used where available, but the Acceptance Contract remains vendor-neutral.

---

# 82. Test Repository, Ownership & Change-Control Policy

Executable acceptance is production governance, not disposable test glue.

Requirements:

- scenario/contract source is version-controlled;
- generated contracts have provenance;
- release-blocking scenario changes show semantic diffs;
- change to a test oracle, threshold, invariant, waiver, or baseline is reviewable separately from product code;
- the implementation agent cannot silently self-approve a weaker gate;
- ownership/CODEOWNERS-equivalent policy can be attached by domain;
- stale scenarios and stale baselines create visible debt.

A code change and its proposed acceptance-criteria weakening MUST be presented as separate decisions.

---

# 83. Additional Mandatory Self-UAT — Revision 1.2

The Spec 271 implementation itself MUST additionally prove:

### Contract Registry
- unsupported contract version fails closed;
- supported migration preserves acceptance strength;
- historical contract/evidence digest remains immutable.

### Temporal Engine
- async success before deadline passes;
- late success after deadline fails;
- `assert_never` catches a delayed duplicate side effect;
- no critical scenario depends on arbitrary blind sleep.

### AI/Agent
- variable prose can pass while deterministic invariants remain exact;
- forbidden tool call fails regardless of semantic judge score;
- statistical scenario requires configured sample threshold;
- generator cannot be its only release-blocking evaluator.

### Browser Matrix
- Browser Run result reports Chromium capability only;
- Firefox/WebKit requirement routes elsewhere or BLOCKED;
- spoofed UA cannot satisfy engine requirement.

### Media
- corrupt/truncated media fails technical validation;
- video/audio metadata assertions work;
- subjective quality is routed to explicit semantic/human oracle.

### Supply Chain
- source/lock/image/build digests are bound to evidence;
- dependency install does not inherit unrelated production secrets;
- artifact promoted is the artifact tested.

### Sandbox Lifecycle
- cancellation marks uncertain side effects appropriately;
- orphan resource reaper works;
- cleanup failure is visible.

### Configuration Matrix
- critical tenant/feature-flag combination cannot be optimized away;
- configuration digest matches executed run.

### SLO
- functional PASS plus severe controlled latency regression can still fail an SLO-gated scenario;
- load-test claims are not inferred from smoke tests.

### Causality
- a complete critical flow can be traced end-to-end;
- broken correlation is diagnosed rather than silently ignored.

---

# 84. Consolidated Definition of Done — Revision 1.2

In addition to all earlier requirements, Spec 271 is not complete until:

36. Acceptance Contract has a versioned schema registry and tested migrations;
37. temporal assertions support eventual consistency without blind-sleep dependence;
38. AI/agent UAT supports deterministic invariants plus explicit stochastic/semantic evaluation;
39. model/prompt/skill/retrieval changes participate in UAT impact analysis;
40. browser-engine certification is capability-accurate and does not overclaim Browser Run coverage;
41. network/client fidelity requirements are representable;
42. media/multimodal technical validation is supported;
43. subjective media/AI quality is separated from deterministic technical PASS;
44. build/source/dependency/image provenance is bound to the release candidate;
45. new isolated cloud execution uses the approved Cloudflare Container provider contract;
46. sandbox cancellation, TTL, cleanup, and orphan reaping are implemented;
47. tenant/feature-flag/configuration matrices are risk-aware and auditable;
48. controlled UX/SLO smoke gates can participate in acceptance without pretending to be load testing;
49. distributed causality/correlation evidence can be reconstructed for critical workflows;
50. release-blocking UAT definitions, thresholds, baselines, and waivers are governed as versioned production assets.

---

# 85. Second Independent Ten-Pass Gap Review Record — Revision 1.2

A second review was completed after Revision 1.1 using ten different implementation-focused lenses:

1. **Contract lifecycle:** added schema registry, compatibility range, explicit migrations, and anti-weakening migration policy.
2. **Temporal/distributed correctness:** added eventual assertions, deadlines, event barriers, monotonic time, and no-blind-sleep rule.
3. **AI/agent acceptance:** added stochastic/statistical evaluation, deterministic tool/policy invariants, evaluator independence, and AI drift invalidation.
4. **Browser/device fidelity:** closed the Chromium-vs-Firefox/WebKit certification gap and added network/client fidelity.
5. **Media/multimodal:** added image/video/audio structural validation plus separate subjective-quality acceptance.
6. **Supply-chain security:** added lock/toolchain/image/build provenance, dependency-install isolation, and optional SBOM/attestation hooks.
7. **Cloud runtime lifecycle:** retained cancellation, cleanup, TTL, preview auth, and orphan reaping requirements under the approved Cloudflare Container provider boundary.
8. **Configuration explosion:** added tenant/flag/provider/config matrices with risk-aware pairwise reduction and protected critical combinations.
9. **Experience/observability:** added controlled UX/SLO smoke gates and end-to-end distributed causality verification.
10. **Governance/maintainability:** added version-controlled UAT assets, semantic test diffs, separate approval for weakened gates, and expanded self-UAT.

No known architecture-level blocker remains for beginning M1. The remaining work is implementation, provider configuration, migration sequencing, and empirical calibration of thresholds—not an unresolved platform contract.

---


# 87. Test Oracle Integrity & Mutation Validation

A UAT system is only as trustworthy as the oracle that decides expected behavior.

An assertion may be syntactically correct but semantically wrong, stale, or accidentally generated from the same defect it is supposed to detect.

Introduce an `AcceptanceOracleRegistry`.

Each release-blocking oracle SHOULD record:

```text
oracle_id
requirement_ref
owner
oracle_type
source/provenance
version
digest
created_at
reviewed_at
freshness_policy
criticality
```

Oracle types may include:

```text
deterministic rule
schema/contract
reference artifact
golden dataset
business invariant
statistical threshold
independent evaluator
human acceptance
```

Rules:

1. An implementation agent MUST NOT silently rewrite its own release-blocking oracle to make its implementation pass.
2. Golden snapshots/baselines require semantic review when a large change is accepted.
3. A new screenshot becoming the new baseline is not proof that the UI is correct.
4. Oracle changes and product changes are separate reviewable changes.
5. Stale/orphaned oracles become visible coverage debt.

## 87.1 Mutation / Fault-Seeding Validation

For high-risk flows, periodically validate that the acceptance suite can detect representative defects.

Examples:

```text
remove permission check
double credit debit
drop audit event
return stale DB status
duplicate worker job
break tenant predicate
change publish target
corrupt artifact
```

Expected result:

```text
seeded defect
→ relevant UAT MUST FAIL
```

This measures assertion potency, not merely scenario count.

Mutation/fault-seeding is performed only in isolated environments and MUST never be injected into customer production state.

---

# 88. Test Data Privacy, Residency & Lineage

UAT data is a first-class governed asset.

Preferred order:

```text
synthetic fixture
→ generated privacy-safe fixture
→ provider sandbox data
→ de-identified production-derived sample
→ real production data only under exceptional explicit policy
```

Every non-trivial fixture SHOULD have lineage metadata:

```text
fixture_id
tenant_scope
classification
synthetic_or_derived
source_ref if permitted
generation/version digest
residency
retention
created_by
cleanup_policy
```

Required controls:

- data minimization;
- secret/credential exclusion;
- masking/tokenization where appropriate;
- residency-aware placement;
- retention and deletion policy;
- access auditing;
- fixture cleanup verification;
- no silent copy of entire production databases;
- no model training/reuse from test evidence unless independently authorized by platform policy.

Where privacy law or tenant policy requires deletion/correction, evidence retention policy must distinguish immutable operational audit facts from retained user-content payloads.

---

# 89. Cross-Run State Isolation & Reset Verification

Parallel UAT must prove that one run cannot contaminate another.

Potential contamination surfaces include:

```text
cookies
localStorage/sessionStorage
IndexedDB
service workers
browser cache
filesystem/worktree
environment variables
DB rows/schema
PostgreSQL connection/session state
R2 objects
KV/cache entries
Durable Object state
queues/workflows
webhooks
email test inbox
OAuth sessions
feature flags
provider-side test resources
```

Each execution provider MUST declare an isolation strategy.

Examples:

```text
unique run namespace
ephemeral DB/schema
isolated browser context
dedicated fixture IDs
run-scoped R2 prefix
run-scoped idempotency key
clean worktree/container
explicit cache/service-worker reset
```

Before a release-blocking PASS, the platform SHOULD verify the required reset/isolation conditions rather than assume cleanup succeeded.

Cross-run contamination is classified as `ENVIRONMENT_DEFECT` or `FIXTURE_DEFECT` unless evidence shows a product defect.

---

# 90. Runner / Provider Trust Tiers & Attestation

Not all execution environments deserve the same trust.

Define trust tiers such as:

```text
T0_UNTRUSTED
T1_USER_MANAGED
T2_REGISTERED_LOCAL
T3_MANAGED_CLOUD
T4_RELEASE_ATTESTED
```

A provider/runner attestation binds:

```text
runner identity
software/version digest
OS/runtime
toolchain
browser/device capability
security policy
region
capacity
attestation freshness
```

Requirements:

1. Placement policy may require a minimum trust tier.
2. A user-managed local harness can be very useful but must not automatically certify high-risk platform release gates.
3. Provider health and capabilities are checked at scheduling time, not only registration time.
4. Results from disconnected/stale runners are rejected when freshness policy is violated.
5. Privileged signing/attestation keys remain outside untrusted repository code.
6. A compromised harness cannot self-upgrade its acceptance authority.

This preserves local-first execution without treating every local machine as an equivalent trusted release environment.

---

# 91. Immutable Artifact Promotion & Rollback / Migration Safety

The release principle is:

> **Test what will ship; ship what was tested.**

For release-blocking builds:

```text
source digest
→ build
→ artifact digest
→ UAT artifact
→ promote SAME artifact
→ deploy
→ post-deploy verify
```

A fresh rebuild after UAT creates a new artifact identity and requires policy-based revalidation.

## 91.1 Database / Schema Compatibility

Database changes require explicit compatibility classification:

```text
backward compatible
expand phase
contract phase
irreversible
data migration
destructive
```

Release UAT SHOULD verify applicable combinations such as:

```text
old app + expanded schema
new app + expanded schema
rollback app + current schema
background migration resume
duplicate migration attempt
```

## 91.2 Rollback Readiness

A rollback policy MUST state whether recovery means:

```text
redeploy previous immutable artifact
feature-flag disable
traffic shift
compensating action
restore
forward fix
HUMAN_REVIEW
```

Do not advertise automatic rollback when database/data side effects make rollback unsafe.

For irreversible migrations or external effects, pre-release acceptance must validate the forward-recovery strategy.

---

# 92. Admission Control, Capacity, Fairness & Cost-Abuse Protection

Spec 224 may launch many parallel UAT runs. External execution providers have finite concurrency, launch-rate, runtime, and billing limits.

Therefore placement requires an admission-control layer before execution.

Inputs include:

```text
tenant quota
project quota
priority
release criticality
provider concurrency
provider launch rate
provider health
browser/sandbox budget
LLM/DecisionProvider budget
estimated duration
current queue depth
```

Required behavior:

```text
ADMIT
QUEUE
DEFER
DEGRADE_TO_COMPATIBLE_PROVIDER
REQUEST_BUDGET_APPROVAL
REJECT/BLOCK
```

Rules:

1. Provider-capacity exhaustion MUST NOT be reported as a product UAT failure.
2. 429/rate-limit/provider-capacity responses are normalized as provider/capacity states.
3. Per-tenant fair-share policy prevents one project from exhausting shared UAT capacity.
4. Recursive repair loops have hard attempt/cost ceilings.
5. A malicious or malformed spec cannot explode a test matrix without policy/budget admission.
6. Browser/session reuse may optimize capacity only when isolation guarantees remain satisfied.
7. Current provider limits are discovered/configured as capacity policy, not hard-coded permanently in Acceptance Contracts.

---

# 93. Accessibility: Automation, Assistive Technology & Real Interaction

Automated accessibility checks are valuable but are not full accessibility certification.

The UAT system distinguishes:

```text
static automated checks
keyboard/focus behavior
semantic accessibility tree
screen-reader/assistive-technology sample
touch/pointer interaction
human accessibility review
```

Critical user journeys SHOULD verify:

- logical focus order;
- visible focus;
- keyboard operability;
- accessible names/roles/states;
- error announcement;
- modal/focus trapping behavior;
- dynamic content announcements when required;
- touch target and gesture alternatives where relevant.

When contractual accessibility certification requires a real assistive technology/browser/OS combination, route to a compatible device/provider or Human Review rather than infer it from headless Chromium alone.

---

# 94. Protected Acceptance Sets & Anti-Test-Gaming

Autonomous coding agents may see ordinary tests and optimize specifically for them.

For critical behavior, SmartAIHub MAY maintain a **protected acceptance set** separate from the implementation agent's visible development tests.

Purpose:

```text
prevent hard-coded test-specific behavior
detect overfitting to visible examples
verify generalized business behavior
```

Rules:

1. Hidden/protected tests must derive from disclosed requirements and must not introduce secret product requirements.
2. Failure reports reveal enough requirement/evidence information to allow legitimate repair.
3. Protected fixtures/secrets are not exposed to implementation code before execution.
4. The implementation agent cannot edit protected tests.
5. Human owners can inspect the protected acceptance definition under authorized access.
6. For AI behaviors, split datasets into development/calibration/acceptance sets where statistically appropriate.

This preserves fairness while reducing “make the test green” behavior.

---

# 95. Authentication, OAuth, MFA, CAPTCHA & Human-in-the-Loop Boundary

Some real user journeys contain controls intentionally designed to resist automation.

Examples:

```text
OAuth consent
MFA
passkeys
CAPTCHA/bot challenge
bank/payment confirmation
email verification
enterprise SSO
sensitive permission grant
```

Spec 271 MUST NOT bypass or weaken these security controls merely to make UAT autonomous.

Preferred strategies:

```text
provider test tenant/account
pre-authorized test identity
sandbox/test-mode integration
service account with equivalent scoped behavior
Human-in-the-Loop step
manual certification for the protected boundary
```

The evidence bundle records which portion was machine-executed and which was human-attested.

Authentication secrets and recovery factors are never stored in screenshots/log evidence in plaintext.

---

# 96. Known-Risk Ledger, Waiver Aggregation & Expiry

Individual waivers can appear acceptable while their combined release risk is not.

Introduce a release-scoped Known-Risk Ledger aggregating:

```text
active waivers
quarantined scenarios
known product defects
missing environment coverage
provider limitations
unverified human-review items
temporary baselines
security exceptions
```

Each entry records:

```text
owner
affected requirement
severity
scope
evidence
expiry
compensating control
issue/ref
release impact
```

Rules:

1. No silent or automatic waiver renewal.
2. Expired waivers block according to policy.
3. A quarantine cannot hide a known product defect.
4. Release policy evaluates aggregate known risk, not only each waiver independently.
5. Known-risk state is visible in Task Control Center and Final Verify.
6. Post-deploy incidents can invalidate a waiver assumption and reopen the gate.

---

# 97. Third Independent Ten-Pass Gap Review Record — Revision 1.3

A third independent review was performed after Revision 1.2.

The ten review lenses and resulting changes were:

1. **Oracle correctness / false confidence**  
   Added Oracle Registry and mutation/fault-seeding so the suite proves it can detect representative defects.

2. **Test-data privacy / residency / lineage**  
   Added synthetic-first data policy, fixture lineage, minimization, de-identification, residency, retention, and deletion handling.

3. **Cross-run contamination**  
   Added explicit isolation/reset guarantees for browser storage, DB, R2, KV, Durable Objects, queues, caches, filesystems, and provider-side resources.

4. **Execution trust**  
   Added runner/provider trust tiers, fresh capability attestation, and release-authority separation for user-managed harnesses.

5. **Artifact promotion / rollback safety**  
   Added build-once/promote-same-artifact, schema compatibility classification, rollback readiness, and forward-recovery handling for irreversible changes.

6. **Capacity / cost / abuse resistance**  
   Added admission control, fair-share scheduling, provider-capacity normalization, budget ceilings, and test-matrix explosion protection.

7. **Accessibility realism**  
   Separated automated checks from actual assistive-technology/human certification and added interaction-level accessibility requirements.

8. **Test leakage / autonomous-agent gaming**  
   Added protected acceptance sets with requirement transparency and separate development/calibration/acceptance data where appropriate.

9. **Protected authentication boundaries**  
   Added OAuth/MFA/CAPTCHA/passkey/SSO/HITL policy so UAT cannot weaken security controls for automation convenience.

10. **Waiver accumulation / residual release risk**  
    Added a Known-Risk Ledger, aggregate risk evaluation, no auto-renewal, expiry enforcement, and Final Verify visibility.

The review found no need for a separate specification. These controls belong inside Spec 271 because they determine whether acceptance evidence is trustworthy.

---

# 98. Consolidated Definition of Done — Revision 1.3

In addition to all prior Revision 1.2 requirements, Spec 271 is not complete until:

51. release-blocking assertions have identifiable oracle provenance/ownership;
52. critical UAT suites can demonstrate defect-detection potency through isolated mutation/fault-seeding or equivalent validation;
53. test data is synthetic-first and has classification, lineage, residency, retention, and cleanup policy;
54. cross-run state isolation/reset is explicit and verifiable;
55. local/cloud execution providers expose trust tier and fresh capability attestation;
56. high-risk release policy can require a minimum execution trust tier;
57. release promotion deploys the immutable artifact actually accepted by UAT;
58. DB/schema migrations declare compatibility and rollback/forward-recovery semantics;
59. admission control distinguishes capacity/provider failure from product failure;
60. UAT scheduler enforces tenant/project fairness and cost/attempt ceilings;
61. accessibility acceptance distinguishes automation from real assistive-technology/human certification;
62. protected acceptance sets can be used for critical autonomous-development workflows without introducing undisclosed requirements;
63. security controls such as MFA/CAPTCHA/SSO are never bypassed merely to automate UAT;
64. active waivers/quarantines/known defects are aggregated into a release Known-Risk Ledger;
65. waiver expiry/no-auto-renewal is enforced;
66. Final Verify displays remaining known risk before release approval.

---


# 98.1 Additional Mandatory Self-UAT — Revision 1.3

### Oracle Strength
- seeded missing tenant predicate is detected;
- seeded duplicate credit debit is detected;
- baseline/oracle update cannot be silently approved by the implementation agent.

### Data Governance
- production-derived fixture is rejected without required policy metadata;
- fixture cleanup is verifiable;
- residency-restricted data cannot be placed on an incompatible provider.

### Isolation
- cookies/cache/storage from run A are unavailable to run B;
- stale R2/KV/DB resources cannot make a clean run pass;
- service-worker/cache reset semantics are tested.

### Trust
- stale runner attestation is rejected;
- untrusted local runner cannot satisfy a release gate requiring managed/attested execution;
- repository code cannot forge provider authority.

### Artifact / Rollback
- deployed artifact digest equals accepted artifact digest;
- rebuild-after-UAT invalidates release evidence;
- irreversible migration cannot advertise unsafe automatic rollback.

### Admission / Capacity
- provider 429 is not classified as PRODUCT_DEFECT;
- per-tenant fair-share works under load;
- repair-loop cost ceiling stops runaway execution.

### Accessibility
- headless accessibility checks cannot claim real screen-reader certification;
- keyboard/focus failure blocks a declared critical accessibility journey.

### Protected Acceptance
- implementation harness cannot read/edit protected tests;
- protected tests remain traceable to disclosed requirements.

### Authentication Boundary
- CAPTCHA/MFA boundary becomes HITL/test-provider flow rather than being bypassed;
- auth factors are redacted from evidence.

### Known Risk
- expired waiver is not silently renewed;
- multiple waivers are visible as aggregate release risk;
- quarantine cannot convert a product defect into PASS.

---

# 99. Final Product Principle


## Implementation Baseline References (non-contractual, verified 2026-10-02)

The provider abstractions above are normative; these links only record the current external implementation baseline:

- Cloudflare Browser Run: https://developers.cloudflare.com/browser-run/
- Cloudflare Browser Run limits: https://developers.cloudflare.com/browser-run/limits/
- Cloudflare Browser Run pricing: https://developers.cloudflare.com/browser-run/pricing/
- Cloudflare Playwright integration: https://developers.cloudflare.com/browser-run/playwright/
- Cloudflare Sandbox limits: https://developers.cloudflare.com/sandbox/platform/limits/
- Cloudflare Sandbox SDK 1.0 announcement: https://developers.cloudflare.com/changelog/post/2026-09-30-sandbox-sdk-1-0/
- Cloudflare Sandbox 0.x → 1.0 migration: https://developers.cloudflare.com/sandbox/sdk/migrate/
- Cloudflare Workers AI `typesafe/jev`: https://developers.cloudflare.com/ai/models/typesafe/jev/

Provider changes MUST be absorbed by adapters/capability attestation, not by weakening the Acceptance Contract.

---


> **Build anywhere. Test anywhere. Accept by one standard.**

SmartAIHub should not care whether the implementation was produced by Codex on a user's PC, Claude on a Mac, thClaws in a sandbox, or a SmartAIHub-native development agent.

The release decision should come from the same independent Acceptance Contract, evidence, invariants, and UAT gate.
# 99A. Revision 1.4 — Vendor-Neutral Decision Intelligence & Verification Provider Layer

## 99.1 Purpose

Revision 1.4 evolves the bounded semantic decision path from a Jev-oriented integration into a vendor-neutral **Decision Intelligence & Verification Provider Layer**.

This revision is additive. It MUST NOT weaken or bypass the existing Spec 271 acceptance contract, deterministic assertions, Oracle Registry, mutation testing, evidence/replay, trust tiers, artifact identity, protected acceptance sets, Known-Risk Ledger, or the Spec 224 Final Acceptance Gate.

The architectural invariant remains:

> Harnesses implement. SmartAIHub independently accepts.

Decision models are bounded advisors/evaluators. They are never execution authority and never acceptance authority by themselves.

## 99.2 Updated Decision Resolution Order

The canonical resolution order is:

```text
Deterministic Rules / Contract Assertions
        ↓ unresolved semantic ambiguity only
DOM / Accessibility / Structured State
        ↓ unresolved
Decision Intelligence Plane
        ├─ Clef-flash
        ├─ Clef
        ├─ Jev
        ├─ Strands Decider / compatible bounded model
        └─ future DecisionModelProvider
        ↓ low confidence / unsupported modality / policy escalation
Fast structured LLM
        ↓ unresolved
Reasoning LLM
        ↓ unresolved visual or multimodal ambiguity
Vision evaluator
        ↓ policy requires / residual uncertainty
Human acceptance
```

A decision model MUST NOT be called when deterministic evidence is sufficient.

## 99.3 DecisionModelProvider Contract

All bounded decision models MUST implement a common provider contract conceptually equivalent to:

```ts
interface DecisionModelProvider {
  id: string;
  capabilities(): DecisionProviderCapabilities;
  evaluate(request: DecisionRequest): Promise<DecisionResult>;
  health(): Promise<ProviderHealth>;
}

type DecisionRequest = {
  decisionType: "choice" | "score" | "boolean" | "multi_choice" | "verification";
  state: unknown;
  options?: DecisionOption[];
  schema: DecisionSchema;
  evidenceRefs?: string[];
  modality?: ("text" | "json" | "image" | "video")[];
  policyContext: DecisionPolicyContext;
  traceContext: DecisionTraceContext;
};

type DecisionResult = {
  provider: string;
  model: string;
  selected?: string | string[];
  scores: Record<string, number>;
  confidence: number;
  calibratedConfidence?: number;
  abstained: boolean;
  reasonCode: string;
  latencyMs: number;
  usage?: DecisionUsage;
  evidenceReceiptRef: string;
};
```

Provider-specific payloads MUST remain behind adapters.

## 99.4 Initial Provider Set

The initial provider registry SHOULD support:

| Provider | Primary role | Placement |
|---|---|---|
| Cloudflare Clef-flash | default candidate for low-latency bounded cloud decisions | Workers AI |
| Cloudflare Clef | harder bounded/multimodal decisions | Workers AI |
| Jev | compatible bounded-decision provider / benchmark fallback | configured provider |
| Strands Decider or compatible local model | local/offline/private bounded decisions | Local Runner / eligible runtime |
| Structured LLM fallback | unsupported or low-confidence decisions | existing LLM routing |
| Human | protected/high-risk/final escalation | approval/acceptance surface |

No provider is mandatory for Spec 271 conformance.

## 99.5 Clef / Clef-flash Integration

Clef and Clef-flash MUST be integrated through `DecisionModelProvider`, never through business logic that assumes a Cloudflare-specific API.

The adapter SHOULD expose schema-constrained bounded decisions and normalized probability/score outputs.

Clef-flash SHOULD be evaluated as the default **cloud hot-path candidate** for:
- intent/capability disambiguation;
- tool/skill/agent selection assistance;
- retry/escalation classification;
- bounded policy classification;
- low-cost UAT semantic checks;
- high-volume acceptance triage.

Clef SHOULD be evaluated for:
- harder semantic decisions;
- richer state;
- multimodal verification;
- screenshot/image/video-assisted UAT;
- cases where Clef-flash calibration is insufficient.

Neither model receives authority merely because it has high confidence.

## 99.6 Multimodal Verification

When the selected provider supports multimodal state, Spec 271 MAY submit protected evidence such as screenshots, rendered frames, or short verification media under evidence-policy controls.

Example normalized verification schema:

```json
{
  "matches_spec": ["yes", "no", "uncertain"],
  "visual_regression": ["none", "minor", "major"],
  "layout_broken": ["yes", "no"],
  "interaction_state_valid": ["yes", "no", "uncertain"],
  "needs_human": ["yes", "no"]
}
```

Multimodal model output MUST be corroborated by deterministic assertions whenever deterministic evidence exists.

## 99.7 Confidence Is Not Authority

Raw model confidence MUST NOT directly authorize execution, release, destructive action, security-sensitive action, billing mutation, permission escalation, or Final Acceptance.

SmartAIHub MUST maintain per-provider/per-decision calibration.

Policy uses:

```text
raw score
  → calibration profile
  → calibrated confidence
  → risk class
  → threshold policy
  → accept / retry / alternate provider / LLM / human
```

Calibration MUST be versioned by at least:
- provider;
- model/version;
- decision schema;
- decision class;
- tenant or applicable policy scope;
- modality where material.

## 99.8 Abstention and Escalation

Every provider MUST support normalized abstention, whether native or adapter-derived.

Escalation MUST occur when:
- confidence is below the calibrated threshold;
- top candidates are insufficiently separated;
- required evidence is missing;
- provider/model capability does not match the request;
- policy marks the decision as protected;
- provider health is degraded;
- drift/calibration alarms are active;
- cross-provider disagreement exceeds policy.

Abstention is a successful safety outcome, not a provider failure.

## 99.9 Provider Selection Policy

Provider selection MUST be policy-driven rather than hard-coded.

The selector MAY optimize:

```text
expected correctness
× calibrated confidence
× capability fit
× trust
÷ latency
÷ monetary cost
÷ privacy/data-egress penalty
```

Policy MUST support:
- tenant/provider allowlists;
- data residency and privacy constraints;
- local-only decisions;
- Cloudflare-preferred placement;
- cost ceilings;
- latency SLOs;
- modality requirements;
- provider circuit breakers;
- deterministic fallbacks.

## 99.10 Decision Evidence Receipt

Every non-deterministic decision used by UAT or orchestration MUST emit a normalized evidence receipt containing at least:

```json
{
  "decision_id": "...",
  "decision_type": "...",
  "provider": "...",
  "model": "...",
  "model_version": "...",
  "schema_version": "...",
  "input_evidence_refs": [],
  "selected": "...",
  "scores": {},
  "raw_confidence": 0.0,
  "calibrated_confidence": 0.0,
  "threshold": 0.0,
  "abstained": false,
  "reason_code": "...",
  "policy_snapshot_ref": "...",
  "permission_snapshot_ref": "...",
  "latency_ms": 0,
  "usage": {},
  "created_at": "..."
}
```

Sensitive prompts/media SHOULD be referenced by protected evidence handles rather than duplicated into logs.

## 99.11 Shadow, Canary, and Champion/Challenger Evaluation

Changing the default provider MUST NOT be based only on vendor benchmark claims.

Spec 271 MUST support:
1. offline replay against protected acceptance sets;
2. shadow evaluation with no execution authority;
3. champion/challenger comparison;
4. disagreement analysis;
5. latency/cost comparison;
6. calibration error measurement;
7. false-accept and false-reject analysis;
8. canary rollout;
9. rollback.

Clef-flash becomes the production default only after SmartAIHub-specific evidence passes policy thresholds.

## 99.12 Decision Quality Metrics

At minimum collect:
- accuracy / task success where ground truth exists;
- false accept rate;
- false reject rate;
- abstention rate;
- escalation rate;
- calibration error;
- Brier score or equivalent probabilistic metric where applicable;
- provider disagreement rate;
- latency p50/p95/p99;
- input usage/cost;
- decision cost per accepted run;
- drift by schema/model/version.

Agent-trace decisions MUST be measured separately because performance characteristics may differ from simple bounded classification.

## 99.13 Failure Isolation

Decision providers MUST have independent:
- timeout;
- retry budget;
- circuit breaker;
- concurrency budget;
- rate limit;
- cost budget;
- health state.

Provider outage MUST NOT collapse Spec 271.

Canonical degradation:

```text
preferred bounded provider
  → alternate bounded provider
  → structured LLM
  → reasoning/vision evaluator when applicable
  → human / fail-closed according to policy
```

Protected acceptance paths MUST fail closed when required authority/evidence cannot be established.

## 99.14 Security and Prompt-Injection Boundary

Decision models MUST treat application content, retrieved documents, screenshots, agent traces, tool output, and external media as untrusted evidence.

Evidence MUST NOT be allowed to redefine:
- decision schema;
- system policy;
- permission snapshot;
- acceptance threshold;
- execution authority;
- provider routing policy.

The adapter MUST separate trusted policy/schema from untrusted evidence.

## 99.15 Spec 256 Integration

Spec 256 remains the capability/skill-first discovery and routing authority.

Spec 271 MAY provide bounded decision assistance for:
- intent disambiguation;
- ranking retrieved capabilities;
- choosing among already-authorized skills/tools/agents;
- confidence and escalation.

Spec 271 MUST NOT bypass Capability Registry, permissions, or Spec 256 retrieval constraints.

## 99.16 Spec 269 Integration

Spec 269 MAY request Decision Intelligence for assistant/delegation behavior, stage/handoff classification, or bounded orchestration choices.

Spec 269 remains responsible for its orchestration semantics.

Spec 271 supplies:
- normalized decision results;
- confidence/calibration;
- evidence receipts;
- verification and acceptance services.

## 99.17 Specs 275 / 276 / 277 Integration

- **Spec 275** may expose eligible local decision models/runtime capabilities through the existing capability resolver.
- **Spec 276** supplies runtime hardening, durable state, compact/recoverable tool-output handles, and explicit execution authority boundaries consumed by 271.
- **Spec 277** SHOULD surface decision provenance, confidence, escalation, provider state, and normalized evidence in Task Control without forcing users to inspect raw model traces.

Spec 271 MUST NOT duplicate those responsibilities.

## 99.18 Spec 224 Final Acceptance Invariant

Spec 224 remains the primary development-orchestrator integration.

No decision provider can mark a DevelopmentRun complete by itself.

Completion remains:

```text
implementation result
→ deterministic verification
→ semantic/multimodal verification where needed
→ evidence closure
→ Known-Risk Ledger / waiver checks
→ Spec 271 Acceptance Contract
→ Spec 224 Final Acceptance Gate
```

## 99.19 Cost and Admission Control

Decision-model calls MUST participate in existing capacity/admission controls.

Budgets SHOULD be enforceable per:
- run;
- project;
- user;
- tenant;
- provider;
- decision class.

The resolver SHOULD prefer the cheapest provider that satisfies calibrated quality, privacy, latency, and capability policy rather than simply choosing the cheapest nominal token price.

## 99.20 Portability

Acceptance contracts MUST remain portable across:
- local SmartAIHub Runner;
- Cloudflare Worker/Workers AI;
- Cloudflare Container/Sandbox;
- external harness;
- remote device/browser;
- future compatible decision providers.

A Mini App or workflow MUST NOT require Clef, Jev, or any single vendor unless its own explicit deployment contract declares that dependency.

## 99.21 Implementation Work Packages

### WP-DI1 — Provider abstraction
- implement `DecisionModelProvider`;
- normalized schemas/results/errors;
- provider registry and health.

### WP-DI2 — Clef adapters
- Clef-flash adapter;
- Clef adapter;
- multimodal capability negotiation;
- normalized usage/cost telemetry.

### WP-DI3 — Existing provider adapters
- migrate Jev behind the common adapter;
- add Strands/local-compatible adapter where deployment permits;
- preserve structured LLM fallback.

### WP-DI4 — Policy and calibration
- threshold policy;
- calibration registry;
- abstention/escalation;
- provider selection;
- privacy/cost/latency constraints.

### WP-DI5 — Evidence and observability
- normalized Decision Evidence Receipt;
- trace correlation;
- Spec 277 presentation fields;
- metrics and drift monitoring.

### WP-DI6 — Evaluation
- protected acceptance-set replay;
- mutation tests;
- shadow/champion-challenger;
- provider outage/failover;
- false-accept protection.

### WP-DI7 — UAT integration
- semantic assertion migration;
- multimodal verification;
- Final Acceptance Gate integration;
- regression against Rev 1.3 acceptance behavior.

## 99.22 Mandatory Acceptance Criteria for Revision 1.4

Revision 1.4 is implementation-complete only when:

1. no UAT business logic directly depends on a Jev- or Clef-specific API;
2. deterministic assertions remain ahead of probabilistic evaluation;
3. Clef-flash and Clef can be enabled/disabled independently;
4. Jev remains optional and removable without acceptance-path failure;
5. low-confidence decisions abstain/escalate rather than silently choose;
6. raw confidence never grants execution or acceptance authority;
7. provider-specific confidence is calibrated before production authority;
8. every consequential probabilistic decision emits a normalized evidence receipt;
9. provider outage has tested deterministic/fallback behavior;
10. protected acceptance paths fail closed;
11. multimodal evidence follows privacy/retention/lineage policy;
12. Spec 256 routing authority is preserved;
13. Spec 269 orchestration authority is preserved;
14. Specs 275/276/277 integrations do not duplicate runtime responsibilities;
15. Spec 224 remains the final completion gate;
16. Mini Apps remain portable unless they explicitly declare provider dependency;
17. shadow/champion-challenger tests exist before changing production default;
18. vendor benchmarks are treated as evidence inputs, not acceptance proof;
19. cost/latency/quality metrics are observable by provider and decision class;
20. rollback can restore the prior provider policy without schema migration.

## 99.23 Revision 1.4 Gap Review — 10 Passes

The Revision 1.4 delta was reviewed against ten independent concern classes:

1. **Authority separation** — provider confidence cannot become execution authority.
2. **Vendor lock-in** — all decision models are behind a common provider contract.
3. **Deterministic-first UAT** — probabilistic models cannot replace exact assertions.
4. **Calibration** — raw confidence is insufficient; versioned calibration is mandatory.
5. **Failure behavior** — abstention, failover, circuit breaking, and fail-closed paths are explicit.
6. **Security** — untrusted evidence cannot mutate schema/policy/permissions.
7. **Portability** — local/cloud/external execution remains supported.
8. **Observability/evidence** — normalized receipts, cost, latency, drift, and disagreement are recorded.
9. **Cross-spec boundaries** — 224/256/269/275/276/277 responsibilities remain explicit.
10. **Production rollout** — protected replay, shadow, champion/challenger, canary, and rollback are required.

No new standalone Clef-specific spec is required. Revision 1.4 is the canonical home for bounded decision-model use in SmartAIHub UAT and acceptance verification.

## 99.24 Revision 1.4 Decision

**ADOPT:** vendor-neutral Decision Intelligence & Verification Provider Layer.

**CANDIDATE DEFAULT:** Clef-flash for eligible Cloudflare hot-path bounded decisions, subject to SmartAIHub-specific calibration and champion/challenger evidence.

**ESCALATION:** Clef or another qualified bounded provider for harder/multimodal cases; structured/reasoning LLM and human paths remain available under policy.

**NON-NEGOTIABLE:** decision models advise/evaluate; SmartAIHub policy authorizes; Spec 271 accepts; Spec 224 closes the development run.


# 100. Revision 1.5 — Ten-Pass Remediation and Operational Hardening

This section supersedes conflicting Rev 1.4 decision-plane guidance; all preexisting Spec 271 acceptance requirements remain binding. These are design-review findings and remediation requirements, **not evidence of implemented tests**.

## 100.1 Canonical terminology and compatibility

The preceding Rev 1.4 appendix is **Revision 1.4 section 99**; its section number is historical. This Rev 1.5 section 100 is authoritative for conflicts. Existing Jev integrations remain operational behind a feature-flagged compatibility adapter. No destructive schema migration, provider switch, or change to Spec 224/256/269 authority is implied. Implement additive APIs first, dual-read old evidence, shadow-run new providers, and cut over only after gated evaluation.

## 100.2 Probability semantics and provider output normalization

Scores may be logits, uncalibrated weights, or probabilities. Providers MUST declare score type, choice-set completeness, and score direction; reject NaN/infinity, missing candidates, schema mismatch, and malformed or partial responses. Never interpret an arbitrary score as probability. Calibrated confidence is defined only for supported calibration cohorts with measured error and minimum sample sizes; otherwise abstain or escalate. A multi-question response MUST bind each result to its question ID and independently enforce schema and policy.

## 100.3 Provider metadata and release governance

Registry records MUST include immutable model ID/revision, adapter version, modality support, schema/option limits, supported regions, pricing effective date, data retention/training terms, provider endpoint, credentials scope, and verified health. Treat public model specifications, costs, benchmarks and availability as time-varying claims until verified in the target account and region. Feature-flag model revision changes and retain rollback policies.

## 100.4 Authorization and irreversible action firewall

Separate `propose_decision`, `authorize_action`, `execute_action`, and `verify_outcome` as independent auditable steps. An authorization service, not the model or adapter, MUST enforce user/tenant permissions, approvals, transaction ceilings, and current policy snapshot immediately before execution. Re-check permissions after a long wait or handoff; deny on stale snapshots. Decision output never authorizes destructive database operations, deployment, payment, privileged computer use, or external messaging.

## 100.5 Privacy, evidence minimization and injection isolation

Before external provider calls, classify data sensitivity, consent, tenant boundary, region restrictions, retention and allowed providers. Apply redaction/minimization; use protected handles for screenshots and media; enforce size, frame-count, token and content-type limits. Never send secrets or cross-tenant evidence to decision models. Where no compliant provider is available, use eligible local/deterministic checks or fail closed. Store only required evidence under existing retention/deletion policy; do not promise provider-side deletion absent a verified contract.

## 100.6 Replay and model nondeterminism

A replay MUST distinguish exact deterministic reproduction from probabilistic reevaluation. Store immutable input/evidence hashes, schema, adapter/model revision, policy and calibration snapshot, provider response, and receipt signature; retain protected artifacts as policy permits. Compare distributions and outcome bands for probabilistic reruns; do not demand byte-identical outputs. Missing original artifacts are explicit `REPLAY_INCOMPLETE`, not passing evidence.

## 100.7 Disagreement, escalation and anti-gaming

Define per-decision-class disagreement thresholds and independent adjudication rules. A second model agreeing is not independent ground truth. Protected acceptance sets MUST be isolated from model selection/tuning and periodically refreshed. Require human adjudication for high-risk disagreement and label contamination/suspected benchmark leakage. Report false accepts by severity; never optimize cost or latency at the expense of the protected false-accept ceiling.

## 100.8 Billing, fairness and degraded service

Admission MUST reserve an estimated budget using tenant-scoped idempotency keys, settle actual usage once from provider receipts, refund unused reservation and reconcile failed/late receipts. Avoid double billing on retries, timeouts or shadow runs; identify who funds shadow evaluation. Enforce per-tenant fairness, concurrency, regional routing and provider circuit breakers. If fallback violates privacy, budget or risk policy, abstain/fail closed rather than silently switch.

## 100.9 UX and evidence transparency

Spec 277 SHOULD show a concise user-facing decision state (`verified`, `needs review`, `provider unavailable`, `blocked by policy`) with expandable provenance, model/version, calibrated confidence when valid, cost and evidence link. Hide raw internal traces, secrets and other tenants' data. Display `uncalibrated` rather than a misleading percentage. Human override MUST capture actor, justification, scope, expiry and receipt; overrides cannot silently waive protected acceptance gates.

## 100.10 Implementation migration and tests

Use expand/migrate/contract rollout: introduce adapter contract and receipt v2; maintain dual-reader for v1 receipts; shadow Clef/Clef-flash; validate calibration and agent-trace cohorts; canary by tenant and decision class; rollback by policy flag. Include integration tests for provider schema drift, malformed scores, question ID mix-ups, multimodal refusal, stale permissions, injected screenshots, tenant leakage, regional unavailability, timeouts after provider success, duplicate billing, replay without original artifacts, false-accept ceiling, and human override expiry. Test on both local runner and eligible Cloudflare execution placement. Do not claim production readiness until tests and target-provider access are evidenced.

## 100.11 Ten-pass review ledger

| Pass | Focus | Gap addressed | Required verification |
|---|---|---|---|
| 1 | Document governance | duplicate section 99 / conflicting revisions | canonical precedence check |
| 2 | Output semantics | raw scores mistaken for probabilities | malformed-score and calibration tests |
| 3 | Provider drift | unverified capability, price and version | registry and compatibility tests |
| 4 | Authorization | model recommendation confused with permission | stale-policy/privileged-action tests |
| 5 | Privacy | sensitive multimodal egress | residency, redaction and isolation tests |
| 6 | Replay | nondeterministic models / missing evidence | receipt and replay tests |
| 7 | Quality | correlated judges and acceptance leakage | protected holdout and disagreement tests |
| 8 | Economics | retries/shadow runs double-charged | ledger idempotency and fairness tests |
| 9 | UX | misleading confidence and override | role-specific presentation tests |
| 10 | Deployment | unsafe provider cutover | dual-read, canary and rollback drills |

**Review result:** ten design-review passes completed and gaps translated into explicit normative requirements. Implementation, external model capabilities, benchmark superiority and runtime test results remain unverified until corresponding evidence is attached.
