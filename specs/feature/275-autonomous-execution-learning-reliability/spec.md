---
canonical_authorities:
  assistant_workforce_lifecycle: Spec 269
  capability_and_skill_routing: Spec 256
  development_orchestration: Spec 224
  executable_artifact_integrity: Spec 274
  verification_and_uat: Spec 271
compatibility_policy: ADDITIVE_ONLY
date: 2026-10-04
primary_owner: SmartAIHub Platform
revision: R1.1
risk_class: HIGH
scope: Platform / Agent Runtime / Reliability / Learning / Additive
spec_id: 275
status: PROPOSED_IMPLEMENTATION_READY_REVIEWED_10X
title: SmartAIHub Autonomous Execution Learning, Reliability &
  Continuous Improvement Layer
numbering_status: CANONICAL_ID_PRESERVED_AFTER_COLLISION_REVIEW
recovery_note: Conflicting Local Agentic Model Runtime draft renumbered to Spec 291.
---

# Spec 275 --- Autonomous Execution Learning, Reliability & Continuous Improvement Layer

## 0. Executive Summary

Spec 275 defines a platform-wide learning and reliability layer that
converts real execution outcomes, verification evidence, repeated agent
failures, human interventions, recovery actions, and operational
incidents into durable improvements to SmartAIHub.

The core principle is:

> Agent completion is a claim. Verification is evidence. Repeated
> correction should become system capability.

Spec 275 MUST NOT replace, reopen, or redesign the implemented
Development Orchestrator defined by Spec 224. Spec 224 remains the
canonical authority for development execution and its existing
state-machine semantics. Spec 275 consumes additive evidence/events from
execution systems and produces versioned improvement candidates such as
Skills, deterministic rules, tests, tools, context policies, knowledge
requirements, and execution-policy changes.

The target is not maximum agent count or maximum PR count. The target is
a measurable increase in verified autonomous outcomes while reducing
unnecessary human intervention, regressions, duplicate work, unsafe
actions, and cost per verified outcome.

------------------------------------------------------------------------

# 1. Problem Statement

Modern coding and operational agents can produce work much faster than a
human can manually supervise. At scale, the bottleneck moves from
generation to:

1.  task definition;
2.  coordination;
3.  verification;
4.  recovery;
5.  risk control;
6.  repeated human correction;
7.  institutional learning.

Without a platform learning layer, the same failures recur across agents
and sessions. Humans repeatedly explain the same constraints, AGENTS.md
and prompts accumulate warnings, agents reinvent tools, verification
remains manual, and parallel execution increases coordination and
resource contention.

SmartAIHub requires a mechanism that turns observed failures and
corrections into reusable, governed, testable system improvements.

------------------------------------------------------------------------

# 2. Goals

Spec 275 SHALL:

1.  capture structured execution and verification evidence;
2.  capture and classify human interventions;
3.  detect repeated failure and correction patterns;
4.  distinguish reasoning problems from deterministic enforcement
    opportunities;
5.  create improvement candidates rather than silently modifying
    production behavior;
6.  support promotion into Skills, rules, tests, tools, context
    policies, knowledge requirements, and execution policies;
7.  validate improvements against historical and synthetic regression
    cases;
8.  support shadow, canary, staged promotion, rollback, and audit;
9.  measure autonomous reliability using outcome-based metrics;
10. integrate with Spec 224 without changing its canonical state
    machine;
11. integrate with Spec 256 for capability/Skill resolution;
12. consume verification/UAT evidence from Spec 271;
13. interoperate with Spec 269 assistant/team execution;
14. use the Unified Job Control Plane for durable asynchronous work
    where applicable;
15. work across local Runner, desktop harness, Cloudflare runtime,
    containers, and future execution providers;
16. prevent self-improvement from becoming uncontrolled
    self-modification.

------------------------------------------------------------------------

# 3. Non-Goals

Spec 275 SHALL NOT:

-   replace Spec 224;
-   redefine the Spec 224 state machine;
-   create a second development orchestrator;
-   create a second capability registry;
-   create a second job-control plane;
-   replace Spec 271 verification/UAT;
-   automatically edit production Skills, policies, security rules, or
    guardrails without governed promotion;
-   optimize for PR count, token count, lines of code, agent count, or
    raw task volume;
-   require every execution to invoke an LLM;
-   treat every failure as a prompt-engineering problem;
-   permit learning across tenant/private boundaries without explicit
    authority;
-   train foundation models directly as part of the initial
    implementation.

------------------------------------------------------------------------

# 4. Architectural Principle

The platform SHALL prefer the following progression:

``` text
Human expertise
      ↓
Intent + constraints
      ↓
Canonical orchestrator
      ↓
Execution
      ↓
Verification
      ↓
Evidence
      ↓
Outcome / Failure / Intervention
      ↓
Learning & Reliability Layer
      ↓
Candidate Improvement
      ↓
Validation
      ↓
Shadow / Canary
      ↓
Governed Promotion
      ↓
Future executions improve
```

Spec 275 is therefore a feedback and reliability plane, not an execution
plane.

------------------------------------------------------------------------

# 5. Relationship to Existing Specs

## 5.1 Spec 224 --- Development Orchestrator Runtime

Spec 224 remains canonical and read-only from the perspective of Spec
275.

Its existing lifecycle remains:

``` text
Plan → Implement → Test → Debug → Review → Verify → Recovery → Final Verify
```

Spec 275 MAY require additive event emission or metadata at stable
integration seams, but MUST NOT change the meaning, ordering,
durability, approval semantics, or completion gates of existing Spec 224
states.

## 5.2 Spec 256 --- Skill-First Capability Resolution

Spec 256 remains the canonical authority for capability discovery and
routing.

Spec 275 MAY submit validated Skill candidates or capability metadata
updates through the interfaces authorized by Spec 256. It MUST NOT
maintain a competing Skill registry.

## 5.3 Spec 269 --- Assistant / Specialist / Workforce Layer

Spec 269 MAY originate execution evidence, delegation evidence,
coordination failures, duplicate-work signals, escalation events, and
human-intervention records.

## 5.4 Spec 271 --- Verification / UAT

Spec 271 is the canonical verification authority where applicable.

Spec 275 consumes verification evidence and may propose new
regression/UAT cases, but MUST NOT weaken or bypass verification gates.

## 5.5 Spec 274 --- Executable Artifact Integrity

Promoted tools, Skills, rule bundles, or other executable artifacts
SHALL preserve Spec 274 integrity/manifest requirements where
applicable.

## 5.6 Unified Job Control Plane

Long-running analysis, pattern mining, replay, shadow evaluation, canary
analysis, and promotion workflows SHOULD use the existing durable job
infrastructure rather than creating a new queueing subsystem.

------------------------------------------------------------------------

# 6. Core Domain Model

## 6.1 ExecutionEvidenceEnvelope

Every participating runtime SHOULD be able to emit an envelope
containing:

``` yaml
execution_evidence:
  evidence_id: uuid
  tenant_id: string
  project_id: string|null
  run_id: string
  task_id: string|null
  orchestrator: string
  provider: string|null
  capability_ids: []
  skill_versions: []
  tool_versions: []
  source_revision: string|null
  environment_fingerprint: string|null
  started_at: timestamp
  completed_at: timestamp|null
  outcome: PASS|FAIL|PARTIAL|CANCELLED|BLOCKED
  verification_refs: []
  failure_refs: []
  intervention_refs: []
  recovery_refs: []
  cost_evidence_ref: string|null
  resource_evidence_ref: string|null
  provenance:
    source: string
    schema_version: string
```

Sensitive payloads MUST be referenced rather than copied where possible.

## 6.2 FailureObservation

``` yaml
failure_observation:
  failure_id: uuid
  run_id: string
  stage: string
  category: string
  signature: string
  symptom: string
  evidence_refs: []
  suspected_causes: []
  confidence: 0.0-1.0
  blast_radius: string
  reversible: boolean|null
  detected_by: agent|test|rule|runtime|human|monitor
```

## 6.3 HumanIntervention

``` yaml
human_intervention:
  intervention_id: uuid
  run_id: string
  category: string
  trigger: string
  action_summary: string
  evidence_refs: []
  prevented_failure: boolean|null
  reusable_lesson_candidate: boolean
  created_at: timestamp
```

Canonical categories SHALL initially include:

-   REQUIREMENT_AMBIGUITY
-   MISSING_CONTEXT
-   AGENT_REASONING_ERROR
-   VERIFICATION_FAILURE
-   TOOL_MISSING
-   PERMISSION_REQUIRED
-   RISK_APPROVAL
-   RESOURCE_CONFLICT
-   EXTERNAL_DEPENDENCY
-   ARCHITECTURE_DECISION
-   STALE_REPOSITORY_STATE
-   DUPLICATE_WORK
-   UNSAFE_ACTION
-   POLICY_CONFLICT
-   UNKNOWN

## 6.4 ImprovementCandidate

``` yaml
improvement_candidate:
  candidate_id: uuid
  candidate_type: SKILL|RULE|TEST|TOOL|CONTEXT_POLICY|KNOWLEDGE|EXECUTION_POLICY
  source_failure_ids: []
  source_intervention_ids: []
  proposed_change_ref: string
  expected_effect: string
  scope: project|team|tenant|platform
  confidence: 0.0-1.0
  risk_class: R0|R1|R2|R3|R4|R5|R6
  status: DRAFT|VALIDATING|SHADOW|CANARY|APPROVAL_REQUIRED|PROMOTED|REJECTED|ROLLED_BACK
  validation_refs: []
  rollback_ref: string|null
```

------------------------------------------------------------------------

# 7. Failure Intelligence Pipeline

The canonical pipeline SHALL be:

``` text
Observe
  ↓
Normalize
  ↓
Fingerprint
  ↓
Cluster
  ↓
Detect recurrence
  ↓
Root-cause hypothesis
  ↓
Select prevention class
  ↓
Create candidate
  ↓
Validate
  ↓
Promote or reject
```

The system MUST preserve raw evidence references so that clustering or
classification can be re-evaluated later.

A model-generated root-cause hypothesis MUST NOT be treated as fact
without supporting evidence.

------------------------------------------------------------------------

# 8. Prevention-Class Resolver

When a recurring issue is identified, the system SHOULD resolve it using
the least expensive reliable mechanism.

``` text
Repeated problem
      ↓
Can deterministic enforcement prevent it?
      ├─ YES → Rule / Lint / Hook / Validator / Policy / Script
      └─ NO
           ↓
Is it a reusable procedure?
      ├─ YES → Skill
      └─ NO
           ↓
Is it a regression condition?
      ├─ YES → Test / UAT case
      └─ NO
           ↓
Is a reusable operation/tool missing?
      ├─ YES → Tool / CLI
      └─ NO
           ↓
Is context or knowledge missing?
      ├─ YES → Context policy / Knowledge requirement
      └─ NO
           ↓
Escalate for expert analysis
```

LLM reasoning SHALL NOT replace deterministic validation when
deterministic validation is feasible.

------------------------------------------------------------------------

# 9. Human Intervention as a Learning Signal

Human intervention MUST be treated as structured operational evidence,
not merely chat history.

The platform SHOULD answer:

-   How often did a human need to intervene?
-   At which stage?
-   Why?
-   Which intervention categories recur?
-   Which interventions can be eliminated safely?
-   Which interventions represent legitimate approval boundaries and
    SHOULD remain human-controlled?

The system MUST distinguish avoidable intervention from intentional
governance.

Example:

`RISK_APPROVAL` is not automatically a defect.

`AGENT_REASONING_ERROR` repeated 40 times may indicate a Skill, context,
or verification defect.

------------------------------------------------------------------------

# 10. Verification Evidence Contract

A task SHALL NOT be considered reliably completed solely because an
agent reports completion.

Verification evidence MAY include:

-   compiler/type-check result;
-   targeted tests;
-   integration tests;
-   browser/UAT evidence;
-   runtime probes;
-   performance measurements;
-   screenshots or visual evidence;
-   API contract verification;
-   schema checks;
-   security checks;
-   deterministic policy checks;
-   artifact hashes;
-   deployment health checks.

Evidence MUST identify who/what produced it, when, against which
revision/environment, and the result.

------------------------------------------------------------------------

# 11. Anti-Tautological Verification

The system MUST detect or flag verification that merely reproduces
implementation assumptions.

Examples include:

-   tests generated directly from the same incorrect assumption as the
    implementation;
-   mocks that bypass the behavior being tested;
-   tests asserting constants created by the implementation itself;
-   verification that never exercises the modified path.

High-risk changes SHOULD require independent evidence classes where
feasible.

------------------------------------------------------------------------

# 12. Autonomy Risk Model

Spec 275 defines a common risk vocabulary; execution authority remains
with the relevant canonical runtime/policy system.

  --------------------------------------------------------------------------------
  Class                   Typical action                   Default treatment
  ----------------------- -------------------------------- -----------------------
  R0                      Read/search/analyze              autonomous

  R1                      Edit isolated source/worktree    autonomous with
                                                           evidence

  R2                      Build/test/local execution       autonomous under
                                                           resource policy

  R3                      PR/preview/staging deployment    autonomous with
                                                           verification

  R4                      Reversible production change     policy-controlled +
                                                           rollback evidence

  R5                      Data/schema/security/financial   strong guardrails /
                          mutation                         approval as policy
                                                           requires

  R6                      Destructive or materially        explicit authorization
                          irreversible external action     required
  --------------------------------------------------------------------------------

Risk classification MUST consider:

-   reversibility;
-   blast radius;
-   data sensitivity;
-   financial impact;
-   external side effects;
-   tenant impact;
-   verification strength;
-   recovery time.

------------------------------------------------------------------------

# 13. Resource & Concurrency Reliability

Spec 275 SHALL support learning from resource failures and concurrency
conflicts.

Example:

``` text
Agent requests full type-check
      ↓
Execution/resource policy
      ↓
Active sessions?
Memory budget?
CPU budget?
Workspace/repository state?
Existing equivalent job?
      ↓
ALLOW
QUEUE
SCOPE_DOWN
REUSE_RESULT
DENY_WITH_REMEDIATION
```

Repeated resource failures SHOULD produce deterministic execution-policy
candidates rather than repeated prompt warnings.

This is specifically intended to prevent multi-session development
environments from destabilizing a shared machine through redundant
high-memory builds/tests.

------------------------------------------------------------------------

# 14. Repository-State Reliability

The system SHOULD capture repository-state failures such as:

-   local branch behind canonical remote;
-   dirty worktree;
-   detached HEAD;
-   stale generated artifacts;
-   dependency drift;
-   concurrent conflicting work;
-   unmerged prerequisite work.

Where safe, these SHOULD become deterministic preflight checks rather
than natural-language reminders.

------------------------------------------------------------------------

# 15. Coordination & Duplicate-Work Detection

Multi-agent execution introduces coordination cost.

Spec 275 SHOULD detect:

-   multiple agents addressing the same root cause;
-   overlapping files/workspaces;
-   duplicated research;
-   repeated tool construction;
-   competing remediation plans;
-   obsolete tasks caused by a newer fix.

The system SHOULD correlate issues before dispatch when evidence
suggests a shared root cause.

------------------------------------------------------------------------

# 16. Reusable Tool Promotion

If agents repeatedly reconstruct the same deterministic operation, the
system SHOULD propose promotion into a reusable tool/CLI.

A tool candidate MUST include:

-   stable input/output contract;
-   deterministic behavior where possible;
-   version;
-   tests;
-   permissions;
-   resource limits;
-   provenance;
-   rollback/deprecation strategy;
-   Spec 274 integrity metadata where applicable.

------------------------------------------------------------------------

# 17. Skill Promotion

A repeated expert procedure MAY become a Skill candidate.

Skill promotion MUST NOT be based solely on frequency. It SHALL
consider:

-   successful historical outcomes;
-   applicability boundaries;
-   required context;
-   failure modes;
-   verification requirements;
-   provider neutrality where practical;
-   safe fallback behavior.

Skill candidates SHALL be validated before registry promotion.

------------------------------------------------------------------------

# 18. Rule / Guardrail Promotion

Repeated deterministic mistakes SHOULD preferentially become enforceable
rules.

Examples:

-   forbidden dependency direction;
-   file-placement constraints;
-   mandatory schema fields;
-   unsafe command patterns;
-   prohibited production actions;
-   required preflight checks.

Rules MUST provide actionable remediation rather than opaque failure
messages.

------------------------------------------------------------------------

# 19. Test / Regression Promotion

A confirmed defect SHOULD be eligible for conversion into a regression
case.

Regression candidates MUST:

1.  reproduce the actual failure where feasible;
2.  fail before the fix;
3.  pass after the fix;
4.  avoid tautological assertions;
5.  identify environment requirements;
6.  record provenance to the original failure.

------------------------------------------------------------------------

# 20. Context & Knowledge Promotion

Not every repeated failure should become a larger prompt.

The system SHALL distinguish:

-   ephemeral task context;
-   project conventions;
-   reusable expert knowledge;
-   deterministic constraints;
-   secrets/private data;
-   stale or time-sensitive information.

Context candidates MUST have scope and freshness semantics.

Sensitive information MUST NOT be copied into shared/global Skills or
knowledge.

------------------------------------------------------------------------

# 21. Improvement Candidate Lifecycle

Canonical lifecycle:

``` text
DRAFT
  ↓
VALIDATING
  ↓
SHADOW
  ↓
CANARY
  ↓
APPROVAL_REQUIRED (when policy requires)
  ↓
PROMOTED
```

Any stage MAY transition to `REJECTED`.

A promoted candidate MAY transition to `ROLLED_BACK`.

Low-risk deterministic changes MAY use an abbreviated path only when
platform policy explicitly permits it.

------------------------------------------------------------------------

# 22. Historical Replay

Before promotion, candidates SHOULD be replayed against relevant
historical cases.

Replay SHALL compare:

-   baseline outcome;
-   candidate outcome;
-   false positives;
-   false negatives;
-   resource impact;
-   latency;
-   cost;
-   new regressions.

Historical replay MUST respect tenant isolation and data-retention
policy.

------------------------------------------------------------------------

# 23. Shadow Evaluation

Shadow mode SHALL allow a candidate to evaluate real executions without
controlling them.

Shadow results MUST NOT silently affect production behavior.

The platform SHOULD compare candidate recommendations against canonical
execution outcomes.

------------------------------------------------------------------------

# 24. Canary Promotion

Canary promotion SHALL:

-   target an explicitly bounded population;
-   define success/failure thresholds;
-   have a maximum observation window;
-   provide automatic stop conditions;
-   preserve rollback capability;
-   record affected versions/runs.

High-risk policy candidates MUST NOT skip canary/approval requirements
where applicable.

------------------------------------------------------------------------

# 25. Rollback

Every promoted mutable improvement SHALL have one of:

1.  explicit rollback;
2.  version pinning to previous known-good behavior;
3.  disable switch;
4.  documented proof that rollback is not applicable.

Rollback itself SHALL be audited.

------------------------------------------------------------------------

# 26. Tenant & Privacy Boundaries

Learning SHALL be scoped.

Default scopes:

``` text
Run
Project
Team
Tenant
Platform
```

Evidence MUST NOT be promoted from Tenant A into Tenant B or
platform-global behavior if it contains tenant-specific/private
information unless an authorized sanitization and promotion process
explicitly permits it.

Raw chat, email, source code, secrets, personal data, and customer
content MUST NOT be indiscriminately copied into learning artifacts.

Pattern metadata SHOULD be minimized and pseudonymized where feasible.

------------------------------------------------------------------------

# 27. Provenance

Every promoted improvement MUST be traceable to:

-   source evidence;
-   creator/proposer;
-   validation runs;
-   reviewer/approval where applicable;
-   version;
-   promotion timestamp;
-   rollback history.

The platform MUST support answering:

> Why does this rule/Skill/tool exist?

------------------------------------------------------------------------

# 28. Metrics

The primary optimization target SHALL be verified useful outcomes, not
activity volume.

Required metrics SHOULD include:

### 28.1 Autonomous Completion Rate

`verified tasks completed without avoidable human intervention / eligible tasks`

### 28.2 Verification Pass Rate

`verified successful outcomes / completed claims`

### 28.3 Human Intervention Rate

`avoidable human interventions / eligible runs`

### 28.4 Regression Escape Rate

Defects discovered after the relevant verification/promotion gate.

### 28.5 Mean Recovery Time

Time from verified failure to recovered verified state.

### 28.6 Cost per Verified Outcome

Total model/tool/runtime cost divided by verified useful outcomes.

### 28.7 Duplicate Work Rate

Detected materially overlapping work divided by dispatched work.

### 28.8 Improvement Effectiveness

Observed reduction in targeted failure after promotion.

### 28.9 Rollback Rate

Promoted candidates later rolled back.

Raw PR count, commit count, tokens, or number of agents MAY be
diagnostic metrics but MUST NOT be treated as primary productivity
metrics.

------------------------------------------------------------------------

# 29. Reliability Scorecard

A platform scorecard SHOULD expose:

``` text
Verified outcomes
Autonomous completion
Human intervention
Verification failures
Regression escapes
Recovery time
Duplicate work
Cost / verified outcome
Top recurring failure classes
Top intervention classes
Promoted improvements
Rolled-back improvements
```

Metrics MUST support project/tenant/time-window scoping.

------------------------------------------------------------------------

# 30. Human Review UX

The system SHOULD present improvement candidates as decisions rather
than requiring users to inspect raw agent transcripts.

Example:

``` text
Repeated problem detected: 7 occurrences

Cause:
Full repository type-check launched while 3–5 development sessions
were active on the same host.

Proposed prevention:
Resource policy: queue full type-check when estimated memory headroom
is below threshold; permit scoped checks.

Evidence:
7 failures / 5 sessions / 2 OOM events

Expected effect:
Reduce shared-host instability.

Choices:
[Approve canary] [Edit] [Reject] [Inspect evidence]
```

------------------------------------------------------------------------

# 31. Explainability Requirements

Every candidate MUST explain:

-   what happened;
-   how often;
-   supporting evidence;
-   why the proposed prevention class was chosen;
-   affected scope;
-   expected benefit;
-   possible downside;
-   validation performed;
-   rollback path.

The UI MUST NOT present model confidence alone as proof.

------------------------------------------------------------------------

# 32. Agent Provider Neutrality

Spec 275 SHALL operate across Codex, Claude, Hermes, SmartAIHub-native
agents, Grokbot-like agents, Muse-like agents, future external agents,
and deterministic executors where integration exists.

Failure and intervention schemas MUST NOT assume one provider's
transcript format.

------------------------------------------------------------------------

# 33. Local vs Cloud Execution

Evidence may originate from:

-   SmartAIHub cloud;
-   Cloudflare Worker;
-   Cloudflare Container/Sandbox;
-   Windows/macOS Runner;
-   local harness;
-   external provider runtime.

The learning plane SHALL normalize evidence without requiring execution
to occur centrally.

------------------------------------------------------------------------

# 34. Offline / Intermittent Runner Behavior

Local runners MAY buffer evidence when disconnected.

Buffered evidence MUST:

-   have stable IDs;
-   preserve timestamps;
-   be idempotently ingestible;
-   avoid duplicate counting;
-   respect local retention/security policy.

------------------------------------------------------------------------

# 35. Event Contracts

Initial event vocabulary SHOULD include:

``` text
execution.started
execution.completed
execution.failed
verification.completed
verification.failed
human.intervention_recorded
recovery.started
recovery.completed
failure.cluster_detected
improvement.candidate_created
improvement.validation_completed
improvement.shadow_completed
improvement.canary_started
improvement.promoted
improvement.rejected
improvement.rolled_back
```

Events MUST be versioned and idempotent.

------------------------------------------------------------------------

# 36. Storage Strategy

Spec 275 MUST reuse existing platform storage authorities where
practical.

It MUST NOT introduce a new database technology merely for this feature.

Canonical records SHOULD use the existing system-of-record database.
Large evidence artifacts SHOULD be referenced through the existing
artifact/storage layer. Semantic clustering MAY use the existing
semantic/vector infrastructure where justified.

------------------------------------------------------------------------

# 37. Security

The system SHALL enforce:

-   tenant isolation;
-   least privilege;
-   signed/authorized promotion actions;
-   immutable audit trail for sensitive policy changes;
-   secret redaction;
-   evidence access control;
-   protection against malicious evidence injection;
-   protection against prompt/instruction poisoning in learned
    artifacts.

External text SHALL be treated as untrusted data unless explicitly
elevated through governed validation.

------------------------------------------------------------------------

# 38. Poisoning & Self-Corruption Defense

Self-improvement creates a new attack surface.

The system MUST assume that:

-   an agent may misdiagnose a failure;
-   a user report may be malicious;
-   external content may contain instructions;
-   repeated occurrence does not prove correctness;
-   a candidate may improve one metric while degrading another.

Therefore no recurrence detector or LLM classifier SHALL have direct
production mutation authority.

------------------------------------------------------------------------

# 39. Promotion Authority

Promotion authority SHALL be policy-based.

Examples:

-   low-risk test addition → may be automatically promoted after
    deterministic validation;
-   project-local Skill → project policy;
-   tenant-wide execution rule → tenant authority;
-   platform-wide guardrail → platform authority;
-   security/financial/destructive policy → explicit high-trust
    approval.

------------------------------------------------------------------------

# 40. Emergency Stop

Administrators MUST be able to:

-   pause candidate generation;
-   pause promotion;
-   disable a promoted candidate;
-   pin known-good versions;
-   stop a canary;
-   isolate a suspected poisoned evidence source.

Emergency controls MUST NOT require the learning model itself to
function.

------------------------------------------------------------------------

# 41. Minimum Viable Implementation

## Phase 275-A --- Evidence Foundation

Implement:

-   ExecutionEvidenceEnvelope;
-   FailureObservation;
-   HumanIntervention;
-   ingestion API/event contract;
-   provenance;
-   tenant scoping;
-   Spec 224 additive adapter.

No autonomous promotion.

## Phase 275-B --- Failure Intelligence

Implement:

-   normalization;
-   signatures;
-   recurrence detection;
-   basic clustering;
-   intervention analytics;
-   reliability scorecard.

## Phase 275-C --- Candidate Generation

Implement:

-   prevention-class resolver;
-   candidate lifecycle;
-   Skill/rule/test/tool/context/policy candidate types;
-   human review UI.

## Phase 275-D --- Validation

Implement:

-   historical replay;
-   regression evaluation;
-   deterministic validation;
-   independent verification hooks;
-   cost/resource comparison.

## Phase 275-E --- Shadow & Canary

Implement:

-   shadow execution;
-   canary policy;
-   stop conditions;
-   rollback.

## Phase 275-F --- Governed Promotion

Integrate with canonical registries/policy authorities.

## Phase 275-G --- Continuous Reliability

Implement:

-   effectiveness measurement;
-   stale candidate detection;
-   rollback recommendation;
-   cross-run trend analysis;
-   controlled automated promotion for explicitly permitted low-risk
    classes.

------------------------------------------------------------------------

# 42. Spec 224 Integration Contract

The first implementation MUST minimize changes to Spec 224.

Preferred integration:

``` text
Spec 224 existing transition
        ↓
existing persistence/event seam
        ↓
Spec 275 adapter
        ↓
normalized evidence
```

If Spec 224 does not currently expose required evidence, implementation
MAY add optional fields/events.

Rules:

1.  existing Spec 224 consumers MUST continue to work;
2.  existing state names/semantics MUST NOT change;
3.  Spec 275 outage MUST NOT prevent Spec 224 from completing work
    unless an existing safety policy independently requires fail-closed
    behavior;
4.  evidence delivery SHOULD be retryable/idempotent;
5.  learning analysis SHOULD be asynchronous by default.

------------------------------------------------------------------------

# 43. Example --- Session Finish Failure

Observed:

``` text
Agent reaches session-finish.
Result says repository is behind origin/main.
Agent does not provide clear remediation.
Human intervenes repeatedly.
```

Spec 275 flow:

``` text
Human interventions
      ↓
same signature detected
      ↓
root cause: ambiguous remediation contract
      ↓
candidate type: SKILL/RULE
      ↓
improve session-finish output contract
      ↓
replay against historical cases
      ↓
shadow
      ↓
promote new version
```

Future sessions receive explicit remediation rather than another generic
warning.

------------------------------------------------------------------------

# 44. Example --- Shared Machine OOM

Observed:

``` text
Several Codex sessions active.
One session launches full type-check.
Memory pressure causes system-wide failure.
```

The correct long-term remediation is NOT merely:

``` text
"Remember not to run full type-check."
```

Preferred remediation:

``` text
resource evidence
      ↓
recurring RESOURCE_CONFLICT
      ↓
EXECUTION_POLICY candidate
      ↓
preflight resource/concurrency check
      ↓
ALLOW / QUEUE / SCOPE_DOWN / REUSE / DENY
```

This converts human operational knowledge into enforceable
infrastructure.

------------------------------------------------------------------------

# 45. Example --- Repeated Tool Reinvention

Observed:

Multiple agents independently construct equivalent repository validation
scripts.

Response:

``` text
detect semantic duplication
      ↓
TOOL candidate
      ↓
define stable CLI contract
      ↓
tests + manifest
      ↓
validation
      ↓
registry/capability exposure
```

Future agents reuse the tool rather than spending tokens and time
rebuilding it.

------------------------------------------------------------------------

# 46. Acceptance Criteria

## AC-275-01

Spec 224 completes successfully when Spec 275 is disabled.

## AC-275-02

No existing Spec 224 state or transition meaning is changed.

## AC-275-03

Evidence ingestion is idempotent.

## AC-275-04

Repeated failures can be clustered without exposing one tenant's raw
data to another.

## AC-275-05

Human interventions are categorized and queryable.

## AC-275-06

A failure can produce a candidate without directly mutating production
behavior.

## AC-275-07

Candidates support Skill, Rule, Test, Tool, Context Policy, Knowledge,
and Execution Policy classes.

## AC-275-08

Historical replay compares baseline and candidate outcomes.

## AC-275-09

Shadow mode cannot affect canonical execution.

## AC-275-10

Canary has bounded scope and stop conditions.

## AC-275-11

Promoted mutable improvements can be rolled back or version-pinned.

## AC-275-12

Promotion provenance is auditable.

## AC-275-13

High-risk candidates cannot self-promote.

## AC-275-14

Raw agent completion without verification evidence is distinguishable
from verified completion.

## AC-275-15

The system can identify repeated human correction as a learning signal.

## AC-275-16

The system prefers deterministic enforcement when appropriate.

## AC-275-17

A repeated resource-conflict failure can become an execution-policy
candidate.

## AC-275-18

Repository-state problems can become deterministic preflight candidates.

## AC-275-19

Duplicate work across agents can be detected or surfaced.

## AC-275-20

Cost per verified outcome can be measured.

## AC-275-21

Improvement effectiveness can be measured after promotion.

## AC-275-22

Sensitive evidence is access-controlled and redactable.

## AC-275-23

External untrusted content cannot directly become an executable global
Skill/rule.

## AC-275-24

Spec 256 remains the canonical capability/Skill authority.

## AC-275-25

Spec 271 remains the canonical verification/UAT authority.

## AC-275-26

Spec 274 integrity requirements are preserved for promoted executable
artifacts.

## AC-275-27

Learning analysis can run asynchronously through existing durable job
infrastructure.

## AC-275-28

Offline/local evidence upload is idempotent.

## AC-275-29

The system records why a promoted improvement exists.

## AC-275-30

The platform can pause promotion independently from execution.

------------------------------------------------------------------------

# 47. Architecture Invariants

## INV-275-01 --- No Second Orchestrator

Spec 275 MUST NOT become a parallel development orchestrator.

## INV-275-02 --- Evidence Before Learning

No learning decision without traceable evidence.

## INV-275-03 --- Verification Before Trust

Agent assertion is not verification.

## INV-275-04 --- Determinism First

Prefer deterministic enforcement where reliable.

## INV-275-05 --- Candidate Before Mutation

Learned changes become candidates before production mutation.

## INV-275-06 --- Scope Preservation

Learning cannot silently cross project/team/tenant boundaries.

## INV-275-07 --- Version Everything

Promoted mutable behavior is versioned.

## INV-275-08 --- Rollbackability

Mutable promoted behavior must support rollback/disable/pinning where
applicable.

## INV-275-09 --- Provider Neutrality

Evidence schema is not tied to one model/provider.

## INV-275-10 --- No Metric Gaming

Raw output volume is not the canonical success metric.

## INV-275-11 --- Human Governance Is Not Failure

Required approvals are not automatically classified as avoidable
intervention.

## INV-275-12 --- Existing Authorities Remain Canonical

Specs 224/256/269/271/274 and existing platform authorities retain their
responsibilities.

------------------------------------------------------------------------

# 48. Implementation Guardrails

Implementers MUST NOT:

-   rewrite Spec 224 to satisfy Spec 275;
-   add a new queue when the Unified Job Control Plane suffices;
-   add a new Skill registry;
-   add a new UAT engine;
-   allow a classifier to directly edit production policy;
-   copy entire private transcripts into global learning storage;
-   require expensive model calls for deterministic checks;
-   block normal execution because learning analytics is temporarily
    unavailable;
-   silently auto-merge candidate changes into platform-global
    configuration.

------------------------------------------------------------------------

# 49. Definition of Done

Spec 275 R1 implementation is complete when:

1.  Spec 224 emits or exposes sufficient additive evidence without
    contract regression;
2.  evidence ingestion is durable/idempotent;
3.  human interventions are captured and categorized;
4.  repeated failures are detectable;
5.  improvement candidates can be created;
6.  at least Rule, Skill, Test, Tool, and Execution Policy candidate
    paths work end-to-end;
7.  candidates can be replayed/validated;
8.  shadow mode exists;
9.  canary + rollback exists for applicable classes;
10. tenant/privacy boundaries are enforced;
11. reliability metrics are visible;
12. no high-risk candidate can self-promote;
13. rollback and audit are tested;
14. Spec 224 continues to operate with Spec 275 disabled;
15. regression tests prove backward compatibility.

------------------------------------------------------------------------

# 50. Recommended First Vertical Slice

The first production slice SHOULD use the development-session problems
already observed because they are concrete, measurable, and low enough
risk to validate the architecture:

``` text
A. session-finish ambiguous remediation
B. repository behind origin/main
C. shared-machine full type-check resource conflict
D. repeated validation-tool reconstruction
```

Expected result:

``` text
Observed correction
      ↓
structured intervention/failure
      ↓
recurrence detection
      ↓
candidate
      ↓
validation
      ↓
controlled promotion
      ↓
future session requires less human correction
```

This slice proves the central thesis of Spec 275 without modifying the
canonical Spec 224 orchestration lifecycle.

------------------------------------------------------------------------

# 51. Final Design Rule

SmartAIHub SHALL optimize for:

> More verified useful work per unit of human intervention, risk, time,
> and cost.

It SHALL NOT optimize merely for:

> More agents, more PRs, more tokens, or more autonomous actions.

The purpose of Spec 275 is to turn expert corrections and real execution
evidence into durable platform capability while preserving human
authority at genuine decision and risk boundaries.

---

# 52. Ten-Pass Gap Review Record — R1.1

Spec 275 R1.0 was reviewed through ten independent lenses. R1.1 incorporates the resulting gaps rather than treating review as prose-only sign-off.

| Pass | Review lens | Gap found | R1.1 disposition |
|---|---|---|---|
| 1 | Architecture/authority | Risk of accidental ownership overlap during candidate application | Added authority-routing and write-boundary contract |
| 2 | Evidence semantics | No explicit evidence quality/freshness/conflict model | Added Evidence Quality Contract |
| 3 | Learning validity | Correlation could be mistaken for causal improvement | Added baseline/control/counterfactual attribution |
| 4 | Verification | Producer and verifier could share the same failure assumption | Added independence/diversity policy |
| 5 | Lifecycle | No explicit expiry/staleness/supersession model | Added drift, TTL, revalidation, supersession |
| 6 | Safety/security | Poisoning defense lacked quarantine and trust weighting | Added evidence trust tiers and quarantine |
| 7 | Operations | Learning jobs could compete with production workloads | Added budgets/backpressure/load shedding |
| 8 | Coordination | Duplicate/conflicting candidates could race to promotion | Added candidate dedupe/conflict/serialization |
| 9 | Measurement | Metrics could be gamed by changing task eligibility/denominator | Added cohort/denominator governance and SLOs |
| 10 | Implementation/recovery | Migration, kill switch, DR and failure injection insufficiently explicit | Added rollout, DR, chaos/fault-injection gates |

All ten passes preserve the central constraint: Spec 224 remains canonical and is not reopened.

# 53. Evidence Quality, Freshness & Conflict Contract

Evidence SHALL carry sufficient metadata to evaluate whether it is suitable for learning or promotion.

```yaml
evidence_quality:
  source_class: DETERMINISTIC|RUNTIME|INDEPENDENT_AGENT|PRIMARY_AGENT|HUMAN|EXTERNAL_UNTRUSTED
  observed_at: timestamp
  valid_for_revision: string|null
  environment_fingerprint: string|null
  freshness_deadline: timestamp|null
  confidence: 0.0-1.0|null
  integrity_ref: string|null
  independence_group: string|null
```

Rules:

1. deterministic/runtime evidence SHOULD outrank unsupported model claims for factual execution outcomes;
2. stale evidence MUST NOT silently authorize promotion;
3. conflicting evidence MUST remain visible and trigger reconciliation rather than last-write-wins truth;
4. missing evidence is not negative evidence;
5. absence of observed failure MUST NOT be interpreted as proof of safety;
6. evidence derived from external untrusted content MUST retain its trust classification through downstream transformations.

# 54. Verification Independence & Diversity

A verification result is weaker when produced from the same assumptions, prompt context, implementation path, or model instance that created the change.

For medium/high-risk candidates, the platform SHOULD seek verification diversity across one or more dimensions:

- deterministic checker vs model judgment;
- implementation agent vs independent review agent;
- unit/integration test vs runtime/UAT observation;
- generated assertion vs externally specified acceptance criterion;
- one model/provider vs another verifier where economically justified.

The system SHALL record `independence_group` so evidence that merely repeats the same reasoning chain is not counted as multiple independent confirmations.

R5/R6 changes MUST NOT be promoted solely from self-verification by the proposing agent.

# 55. Baseline, Counterfactual & Causal Attribution

Spec 275 MUST avoid claiming that a candidate caused improvement merely because outcomes improved after deployment.

Every measurable candidate SHOULD define:

```yaml
candidate_evaluation:
  target_failure_signature: string
  baseline_window: string
  baseline_cohort: string
  treatment_cohort: string
  control_or_shadow_cohort: string|null
  primary_metric: string
  guardrail_metrics: []
  minimum_sample_size: integer|null
  success_threshold: string
  regression_threshold: string
```

Where traffic permits, canary evaluation SHOULD compare equivalent cohorts. Where it does not, the system MUST label conclusions as observational rather than causal.

A candidate SHALL NOT be declared effective solely from model opinion.

# 56. Concept Drift, Staleness, Expiry & Supersession

Learned behavior can become wrong after architecture, dependencies, providers, policies, or product requirements change.

Every promoted artifact/policy SHOULD support:

- `effective_from`;
- optional `expires_at` or revalidation interval;
- applicability predicate;
- dependency/version constraints;
- `supersedes` / `superseded_by`;
- last successful validation;
- last observed use;
- stale-state marker.

Triggers for mandatory revalidation SHOULD include:

- major dependency/runtime upgrade;
- canonical architecture contract change;
- provider/tool contract change;
- repeated false positives;
- rollback;
- long period without representative evidence.

Stale improvements MUST be eligible for disablement or retirement rather than accumulating forever.

# 57. Evidence Trust Tiers, Quarantine & Poisoning Response

Evidence SHALL be assigned a trust tier before it can influence promotion.

Suggested tiers:

```text
T0  untrusted external/user-controlled content
T1  agent observation without independent proof
T2  authenticated human/runtime observation
T3  deterministic or independently reproduced evidence
T4  security-sensitive/platform-authoritative evidence
```

Trust tier is not equivalent to correctness; it controls how evidence may be used.

The system SHALL provide a quarantine path for suspicious evidence, clusters, and candidates. Quarantined material MUST NOT participate in automatic promotion.

If poisoning is suspected, administrators SHALL be able to trace downstream candidates and promoted artifacts derived from the affected evidence and disable/revalidate them.

# 58. Candidate Identity, Deduplication, Conflict & Serialization

Parallel learning jobs may independently propose equivalent or incompatible improvements.

Each candidate SHOULD have a semantic fingerprint derived from:

- target scope;
- failure/problem signature;
- candidate type;
- affected authority/capability;
- normalized intended effect.

The platform SHALL detect:

- duplicate candidates;
- competing candidates for the same target;
- mutually exclusive rules;
- candidate dependency chains;
- candidates invalidated by newer source revisions.

Promotion affecting the same canonical authority/scope MUST be serialized or use optimistic concurrency/version preconditions. Silent last-writer-wins behavior is prohibited.

# 59. Canonical Authority Routing & Write Boundary

Spec 275 owns candidate/evidence lifecycle, not the final canonical stores owned by other specs.

A promotion MUST resolve a destination authority before mutation:

```text
Skill                → Spec 256 authority
Verification/UAT     → Spec 271 authority
Development workflow → Spec 224 authority boundary (normally no mutation)
Assistant workforce  → Spec 269 authority
Executable artifact  → Spec 274 integrity path
Execution policy     → existing policy/runner authority
Knowledge/context    → canonical knowledge/context authority
```

If no canonical authority exists, promotion MUST stop with `AUTHORITY_UNRESOLVED`; Spec 275 MUST NOT silently create a competing store.

All writes to an external authority MUST use version/precondition checks and return a durable receipt.

# 60. Learning Workload Budget, Backpressure & Load Shedding

Learning is subordinate to user-facing and production-critical execution.

Spec 275 SHALL support separate budgets for:

- model/token spend;
- CPU;
- memory;
- storage;
- vector/index operations;
- historical replay;
- concurrent learning jobs.

When budgets are constrained, the preferred degradation order is:

```text
preserve execution + safety verification
        ↓
defer clustering / replay
        ↓
defer candidate generation
        ↓
defer analytics enrichment
        ↓
never weaken production safety gates merely to keep learning online
```

Learning jobs SHOULD be priority-separated from critical execution jobs through the existing job-control plane.

# 61. Metric Governance, Cohorts & Anti-Gaming

Metrics SHALL preserve denominator definitions and cohort metadata.

For example, Autonomous Completion Rate MUST record which tasks were considered `eligible`. A system MUST NOT improve the metric simply by reclassifying difficult tasks as ineligible without an auditable policy change.

Scorecards SHOULD segment by:

- task class/risk class;
- provider/model;
- project/tenant;
- runtime;
- candidate version;
- time window;
- complexity band where available.

Primary metric improvements MUST be checked against guardrails such as regression escape, latency, cost, safety incidents, and rollback rate.

# 62. Reliability SLOs & Promotion Gates

Production deployment SHALL define quantitative SLOs appropriate to each candidate class rather than using a universal threshold.

At minimum, a promotion policy SHOULD be able to specify:

```yaml
promotion_gate:
  minimum_evidence_count: integer
  maximum_regression_rate: number
  maximum_false_positive_rate: number|null
  maximum_cost_delta: number|null
  maximum_latency_delta: number|null
  required_independent_evidence_classes: integer
  observation_window: string
  auto_stop_on_safety_event: true
```

Threshold values belong to deploy-time policy/configuration and MUST NOT be hard-coded into this specification without operational evidence.

# 63. Data Retention, Deletion & Derived-Artifact Lineage

Evidence retention MUST follow applicable platform privacy/data-retention authority.

The system SHALL maintain lineage from raw evidence to derived clusters/candidates/promoted artifacts so that deletion, legal/privacy requirements, or poisoned-source response can determine what was derived from removed evidence.

Deletion of source evidence does not automatically imply deletion of every derived generic rule; the system MUST evaluate whether the derived artifact still has independent lawful/authorized evidence and provenance. Where it does not, it SHALL be disabled/revalidated/deleted according to governing policy.

# 64. Disaster Recovery, Rebuild & Reconciliation

Spec 275 SHALL be recoverable without making the learning database a hidden source of execution truth.

Required capabilities:

- backup/restore of candidate and audit state;
- idempotent re-ingestion from durable event sources where available;
- reconciliation between promoted-candidate records and canonical destination authority versions;
- detection of orphaned or partially applied promotions;
- recovery after crash between destination write and local receipt persistence;
- no double promotion after retry.

Promotion SHALL use a durable transaction/outbox/saga-style protocol appropriate to the existing architecture; cross-system atomicity MUST NOT be assumed.

# 65. Fault Injection & Adversarial Validation

Before production certification, tests SHALL cover at least:

1. duplicate evidence delivery;
2. out-of-order events;
3. stale evidence;
4. conflicting verifier results;
5. poisoned external evidence;
6. candidate generator hallucination;
7. learning service outage during Spec 224 execution;
8. crash during promotion;
9. rollback during active canary;
10. concurrent conflicting promotion;
11. tenant-boundary attack;
12. resource exhaustion/backpressure;
13. canonical authority unavailable;
14. verifier/provider unavailable;
15. historical replay using obsolete environment assumptions.

Failure injection MUST prove that the default failure mode preserves canonical execution and safety boundaries.

# 66. Additional Acceptance Criteria — R1.1

## AC-275-31
Conflicting evidence cannot be silently collapsed into a single truth value.

## AC-275-32
Stale evidence cannot authorize a high-risk promotion without revalidation.

## AC-275-33
Verification evidence records independence groups and avoids double-counting correlated verification.

## AC-275-34
R5/R6 candidates cannot pass solely through proposing-agent self-verification.

## AC-275-35
Candidate effectiveness is measured against a declared baseline and guardrail metrics.

## AC-275-36
Observational effectiveness is not mislabeled as causal when no valid control/counterfactual exists.

## AC-275-37
Promoted improvements support staleness/revalidation/supersession semantics.

## AC-275-38
Suspicious evidence and its candidates can be quarantined.

## AC-275-39
Downstream artifacts derived from poisoned evidence can be traced.

## AC-275-40
Duplicate and conflicting candidates are detected before promotion.

## AC-275-41
Concurrent writes to the same canonical authority use serialization or version preconditions.

## AC-275-42
Unresolved destination authority fails closed with `AUTHORITY_UNRESOLVED`.

## AC-275-43
Learning workload pressure cannot weaken canonical safety verification.

## AC-275-44
Metric denominator/cohort definitions are auditable.

## AC-275-45
Promotion policies support quantitative SLO/guardrail thresholds without hard-coded universal values.

## AC-275-46
Evidence-to-promoted-artifact lineage supports deletion/poisoning analysis.

## AC-275-47
Crash between destination mutation and local promotion receipt is recoverable without double application.

## AC-275-48
Out-of-order and duplicate events do not corrupt candidate state.

## AC-275-49
Spec 275 outage does not break Spec 224's normal execution path except where an independent existing safety authority requires fail-closed behavior.

## AC-275-50
The fault-injection matrix in Section 65 passes before production certification.

# 67. Additional Architecture Invariants — R1.1

## INV-275-13 — Learning Is Subordinate to Execution Safety
Learning availability or throughput can never justify weakening execution safety or verification.

## INV-275-14 — Correlation Is Not Causation
The platform must distinguish observed association from demonstrated candidate effect.

## INV-275-15 — Independent Evidence Is Not Counted by Quantity Alone
Multiple outputs from the same reasoning chain are not equivalent to independent confirmation.

## INV-275-16 — No Hidden Canonical Store
Spec 275 may not become the authoritative store for domains owned by other specs.

## INV-275-17 — Learned Behavior Can Expire
No learned rule, Skill, or policy is assumed permanently valid.

## INV-275-18 — Learning Must Be Reconstructable and Auditable
Critical candidate/promotion state must be reconcilable from durable records and destination authority receipts.

# 68. R1.1 Implementation Order

To minimize regression risk, implementation SHOULD proceed in this order:

```text
1. Schemas + evidence quality metadata
2. Spec 224 read-only/additive adapter
3. Durable ingestion + idempotency + lineage
4. Human intervention capture
5. Failure fingerprinting / recurrence detection
6. Candidate store only — no writes to canonical authorities
7. Historical replay + verification independence
8. Human-reviewed low-risk candidate export
9. Shadow mode
10. Canary + SLO/guardrail engine
11. Canonical authority adapters with receipts/version preconditions
12. Rollback/reconciliation/DR
13. Limited auto-promotion only for explicitly authorized low-risk classes
```

The implementation MUST establish a baseline measurement period before claiming improvement from Spec 275 itself.

# 69. R1.1 Production Certification Gate

Spec 275 SHALL NOT be considered production-certified until all of the following are evidenced:

- Spec 224 backward-compatibility regression suite passes with Spec 275 enabled and disabled;
- evidence ingestion idempotency and ordering tests pass;
- tenant isolation tests pass;
- poisoning/quarantine tests pass;
- historical replay demonstrates no hidden mutation of canonical execution;
- shadow mode demonstrates zero execution authority;
- canary stop/rollback is proven;
- canonical authority write reconciliation is proven;
- resource pressure/load-shedding behavior is proven;
- metric baseline and denominator definitions are frozen/versioned;
- fault-injection matrix passes;
- emergency stop functions without dependence on the learning model.

Only after this gate may policy explicitly enable bounded automatic promotion for approved low-risk candidate classes.

