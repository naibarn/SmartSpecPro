---
document_type: SPEC_275_PROPOSED_ADDITIVE_AMENDMENT
spec_id: 275
title: Predictive Decision, World-Model Feedback and Recursive Improvement
amendment: RSI-ANYTHING-2026-10-12
date: 2026-10-12
status: PROPOSED_FOR_CANONICAL_RECONCILIATION
risk_class: HIGH
implementation_state: NOT_IMPLEMENTED_BY_THIS_DOCUMENT
canonical_source: specs/feature/275-autonomous-execution-learning-reliability/spec.md
scope: Platform-wide advisory decision intelligence for authorized agent execution
normative_language: MUST / MUST NOT / SHOULD / MAY
---

# SPEC-275 Addendum — Predictive Decision & Safe Recursive Self-Improvement

## 0. Decision and reconciliation notice

This is a **proposed additive specification file**, not a new numbered canonical spec, merged policy, implementation receipt, or approval. It is deliberately separate from the existing canonical `spec.md` and generated `handoff/*` records. Adoption MUST proceed through the existing SPEC-275 ownership/reconciliation workflow, the canonical `tools.spec_handoff` writer, Deep Plan / Deep Implement and protected integration. This document itself does not change any requirement to PASS.

**Why not create a new SPEC ID?** SPEC-222 already designs replay, discovery traces, policy evaluation, shadow/canary and safe promotion; SPEC-275 already owns execution-learning and reliability improvement; SPEC-224 owns the development runtime. Another orchestration or learning framework would duplicate them.

**Unresolved authority:** SPEC-222's canonical HandOff is `DISCOVERING / RECONCILIATION_REQUIRED` with low-confidence replace/merge relationship claims involving SPEC-224, 221, 229 and 230. They are NOT proof of supersession. SPEC-275 is also `DISCOVERING / RECONCILIATION_REQUIRED` and has fixture-only evidence plus an unresolved production failed-event/tenant-retention authority dependency. This addendum defines a proposed integration seam without asserting or changing either authority. Owner-led reconciliation MUST decide whether its prediction interfaces attach to the existing SPEC-222 policy-evaluator contract or an additive SPEC-275 adapter. No automatic migrations, dispatch or policy promotion are authorized by this text.

## 1. Purpose and measurable outcome

Provide a bounded, testable `Propose → Predict → Select → Execute → Observe → Learn → Retain` loop that reduces repeated technical failures and human-proxy escalation while preserving the existing job, approval, security, source-control, memory and acceptance authorities.

Primary outcome: **verified autonomous task completion**, not PR count, action count, number of agents or model-generated self-assessments.

Examples: select the most promising code-repair candidate before spending an expensive Runner/UAT execution; choose a low-risk diagnostic when a Runner appears unavailable; prefer a previously validated recovery path instead of repeatedly reporting the same technical blocker; reduce redundant GUI actions without bypassing website permissions.

Out of scope: uncontrolled recursive code rewriting; autonomous production policy replacement; unrestricted self-modification; second scheduler/orchestrator; second memory store; new admission tokens; changing the meaning of SPEC-224 READY/WAITING/COMPLETED; self-granted permissions; training a foundation model in P0/P1; claiming external RSI-Anything benchmark results as product performance.

## 2. Actual Handoff review (read-only baseline, 2026-10-12)

| Owner | Canonical Handoff observed | Exact boundary for this addendum |
| --- | --- | --- |
| SPEC-222 | DISCOVERING / RECONCILIATION_REQUIRED; 0/556 ledger rows PASS | Existing replay, policy evaluation, shadow, canary, promotion design; authority conflict needs reconciliation before normative ownership change |
| SPEC-275 | DISCOVERING / RECONCILIATION_REQUIRED; 0/138 PASS; fixture-only evidence; production failure-event authority unresolved | Execution evidence, failure intelligence, policy improvement lifecycle; no trusted production ingestion yet |
| SPEC-224 | WAITING_APPROVAL / RECONCILIATION_REQUIRED; 0/1247 PASS | Owns DevelopmentRun, ready-work eligibility, protected dispatch, autonomous repair and completion evidence; M6/M7 genuine Runner acceptance remains unavailable |
| SPEC-271 | VALIDATION_PENDING / RECONCILIATION_REQUIRED; 0/287 PASS | Owns authoritative UAT receipts; owner-bound tenant/project/retention and real process-restart evidence pending |
| SPEC-277 | CONTINUATION_REQUIRED / CONTINUE_REQUIRED; 0/431 PASS | Existing Task Control projection and worker_jobs/outbox receipt continuity; provider-receipt and durable storage authority pending |
| SPEC-268 | ACTIVE_CANONICAL / VALIDATION_PENDING | Sole canonical Memory owner, scope/ACL/retention; learning projections cannot bypass it |
| SPEC-269 | ACTIVE_CANONICAL / PARTIAL_INTEGRATED | Assistant consumers; App route and worker-side App/Project binding must be authenticated or fail closed |
| SPEC-208 | PARTIAL_INTEGRATED / RECONCILIATION_REQUIRED | Computer-use decision consumer; Runner/Moli live authorization and acceptance still open |
| SPEC-267 | VALIDATION_PENDING / RECONCILIATION_REQUIRED | Existing Cloudflare-oriented durable control plane; do not create a competing queue/DB |
| SPEC-228 | DISCOVERING / RECONCILIATION_REQUIRED | Incident intake and maintenance qualification owner; one observation is not a confirmed bug |

These are observed index/STATUS states, not a declaration that the raw requirements have all been audited individually. PASS remains dependent on independently accepted requirement-level evidence.

## 3. Canonical ownership and integration contract

- **SPEC-224 / Orchestra / Deep Plan / Deep Implement** retain authoritative task planning, WorkUnits, execution, recovery, source SHAs, approvals, and completion decisions. A predictor is only an advisory ranking input.
- **SPEC-275** owns execution-outcome learning, causal failure classification, improvement proposals and reliability metrics, subject to its existing ownership reconciliation.
- **SPEC-222** retains its pre-existing proposal for replay datasets, policy evaluation, shadow/canary and policy registry unless a resolved canonical ownership decision changes that; reuse rather than clone its stores and gates.
- **SPEC-271** supplies independently verifiable UAT and test observations. A predictor's confidence is never acceptance evidence.
- **SPEC-277 and existing worker_jobs/outbox** supply authoritative job/attempt identity and event correlation. No new background scheduler.
- **SPEC-268 / 266 / 229** supply governed memory, durable evidence and retrieval references. Prediction records are not user-facing memory, and vector matches are not current operational truth.
- **SPEC-256 / Capability Registry** own provider/capability selection eligibility; advisor may rank only eligible options.
- **SPEC-208 / SPEC-269** are optional consumers under their own authorization rules.
- **SPEC-274** governs executable artifact integrity where relevant.
- **SPEC-302 / 304** own application/project identity proof when app/project context is used.
- **SPEC-267** governs the cloud deployment/runtime boundary; do not add Cloudflare infrastructure until capacity, data and authority are established.

Retired Agency, legacy `/workflows`, `workpacks/*`, OpenSandbox and `sandbox_jobs` MUST NOT be reintroduced.

## 4. Capability design

### 4.1 Decision input and eligible candidates

An authorized owner creates a `DecisionRequest` with an immutable snapshot of:
- `decision_id`, `tenant_id`, authorized principal, optional project/app identity plus provenance;
- `source_sha`, workspace digest, WorkUnit/DevelopmentRun ID, job ID and attempt/lease epoch where applicable;
- normalized task class, goal, constraints, permitted actions, risk tier, approval and budget ceilings;
- current capability snapshot and its observation timestamp/expiry;
- evidence references with version, trust and source identity;
- known blockers and their exact reactivation predicates.

Candidate generation MUST be bounded, reproducible and provider-neutral. It may use deterministic heuristics, LLM planning or existing skills, but MUST reject candidates that are unauthorized, duplicate, non-viable, incompatible with the source/workspace, or in conflict with an active lease. Every candidate MUST include `candidate_id`, stable action digest, intended operation, known prerequisites, expected proof route, estimated cost/latency, reversibility and declared side effects.

Candidate generation is NOT dispatch. A READY WorkUnit MUST remain eligible to start even without its **final completion predicate** or **fresh completion evidence**. Those are closure checks, not universal preconditions for planning or permitted development work.

### 4.2 Predictive evaluator / optional world-model adapter

Introduce a *logical*, versioned `OutcomePredictor` interface, not another orchestrator. It SHOULD support:
- `score(request, candidates) -> PredictionSet`;
- `explain_evidence_refs(prediction)`, with no private chain-of-thought;
- `observe(outcome_receipt)` via SPEC-275's authorized evidence intake;
- `evaluate_offline(dataset_ref)`; and
- `policy_version` / `predictor_version` pinning.

Predictions MUST include:
- probability of verified success with uncertainty and calibration metadata;
- risk of security, data, policy, regression or permission failure;
- expected token/compute spend, wall-clock time and action count;
- likely blocker class and external-authority requirements;
- evidence sufficiency, out-of-distribution/UNKNOWN indicator;
- source snapshot and model/policy version.

`UNKNOWN` is a first-class result. The adapter MUST NOT infer a valid grant from a model prediction or an expired status probe. Baseline P1 implementation MAY use deterministic rules and existing LLM scoring. JEPA-style world-model training and upstream RSI-Anything components are optional later adapters requiring licensing, reproducibility, data controls and independent benchmark qualification.

Selection objective is configurable but MUST be bounded by admission, risk, budget, concurrency, privacy and side-effect policy. Example conceptual score: `P(success) × value_of_verified_outcome − expected_cost − risk_penalty − latency_penalty`. This score NEVER overrides a hard security/authority gate. If confidence is low or candidate distribution is unsupported, use approved deterministic fallback, narrowly targeted diagnosis or abstention; continue unrelated READY WorkUnits.

### 4.3 Decision and execution boundary

The advisor returns an ordered, explainable candidate set and recommendation. Existing SPEC-224/worker_jobs/Runner chooses if and when an eligible candidate executes. Fresh grants, tenant binding, runtime capability probes, idempotency keys, source/workspace binding and lease fencing MUST be rechecked at **dispatch**, not accepted solely from proposal-time evidence.

If one WorkUnit is waiting for owner-supplied authority, its exact waiting predicate is scoped to that WorkUnit only. The decision layer MUST search for independent permitted WorkUnits rather than freezing the parent capsule. A new Main SHA invalidates stale *completion proof*, not the immutable history or unrelated readiness. Merged work MUST NOT be replayed on resume.

No bypass is allowed through browser automation, MCP/A2A, changing the endpoint to localhost/IP, or switching provider when the denial is permission-based.

### 4.4 External-feedback learning

Only authority-validated receipts may update candidate outcome statistics:
- actual test/UAT verdict and verifier identity, with environment/source digest and evidence links;
- runtime attempt/lease/job receipt and exact outcome status;
- actual cost/time/tool calls and identifiable side effects;
- interruption/retry/resume and duplicate-work observations;
- whether an intervention was needed and why.

Keep `OBSERVED`, `VERIFIED`, `ACCEPTED` and `UNKNOWN` separate. Never treat a failed, skipped, resource-blocked, timeout, unavailable or model-estimated test as PASS. Do not learn success from the agent's own unverified assertion. Quarantine conflicting receipts, mismatched source SHA, untrusted issuers, wrong tenant scope, stale authorization and content containing unreviewed secrets. Provenance and replay deduplication MUST prevent double-counting the same attempted work.

Learning updates MUST be side-effect-free candidates until independently evaluated. Memory/retrieval context can suggest a solution but cannot mutate production policy directly.

### 4.5 Retain, compare, promote and rollback

All learning improvements (ranking weights, routing rules, diagnostic recipes, Skills, tests, model checkpoints) are versioned, with immutable baseline, training-data lineage, evaluation dataset snapshot and artifact digest.

Progression: `OBSERVE_ONLY → OFFLINE_REPLAY → SHADOW → AUTHORIZED_CANARY → GATED_PROMOTION`; rejected candidates return to a retained known-good version. Approval/rollout authority MUST remain with the existing policy owners. Neither an LLM, an evaluator, nor this addendum grants itself production promotion rights.

Automatic rollback/kill-switch triggers include changed security behavior, tenant isolation failure, incorrect authorization route, significant regression, calibration drift, cost blowout and duplicate protected dispatch. Shadow MUST not execute proposed actions or spend on the proposed second route. Canary MUST have explicit tenant/task allowlists, stable assignment, maximum spend and expiry.

## 5. Conceptual contracts (not an instruction to create a new database)

### DecisionPrediction

| Field | Contract |
| --- | --- |
| identity | decision_id, candidate_id, tenant_id, task_class, run/workunit ID |
| provenance | source_sha, workspace_digest, job/attempt, capability_snapshot_ref |
| prediction | success_probability, uncertainty, expected_cost, expected_latency, expected_actions, blocker_likelihood, risk flags |
| validity | predictor_version, policy_version, training/evaluation reference, prediction timestamp/expiry |
| admission | decision_authority_ref, permission/result snapshot; `DENY` and `UNKNOWN` preserved |
| evidence | reason_codes, references, candidate digest; no secret or hidden reasoning |

### OutcomeFeedback

| Field | Contract |
| --- | --- |
| binding | decision_id + candidate_id + source_sha + tenant + job/attempt/lease |
| facts | verified result classification, independent verifier, timestamp, receipt hash, test scope |
| economics | actual spend/time/tool counts, retries and side effects |
| provenance | receipt issuer, signature/trust check, retention/ACL, replay identity |
| disposition | accepted / quarantined / unknown; quarantine reason |

The implementation SHOULD map these contracts onto existing SPEC-275 / 222 / 271 / 277 interfaces after a read-only source audit. No migrations, tables, APIs or distributed state stores are authorized merely by these conceptual shapes. Any required durable migration must have its own owner, plan, rollback and explicit approval.

## 6. Repair behavior and anti-loop requirements

**Technical failure**: inspect available evidence, distinguish deterministic environmental faults from policy faults, propose bounded root-cause hypotheses, rank diagnostic actions, execute permitted targeted repairs, then verify against the original success predicate.

**Real authority failure**: record the exact missing grant, tenant binding, non-production control URL, resource preflight or other owner-provisioned predicate; leave that operation blocked; continue independent work. Repeating the same unauthorized enrollment or producing repeated permission requests MUST NOT be treated as progress.

**Repeated identical failure**: recognize stable fingerprints scoped by task/provider/source/environment, avoid identical retries without new evidence, try a distinct lower-risk diagnostic or alternative permitted route; preserve complete history and idempotency. No arbitrary global retry cap may silently substitute for diagnosis, but bounded budget/time/risk policy still applies.

**Resource block**: classify OOM, exit 137 and admission memory shortfall as `RESOURCE_BLOCKED`, not code failure. Rerun only after fresh resource evidence, different authorized capacity or a changed load profile.

**Prediction failure**: log prediction vs actual, not an invented explanation. Retain cause-agnostic uncertainty when no controlled counterfactual or verified causal basis exists.

## 7. Security, legal and operational safety

1. **No self-authority:** advisor predictions are non-authoritative; production grants and security approvals are not generated by a learning model.
2. **Tenant isolation:** never mix raw user/tenant experience across boundaries. Cross-tenant aggregate learning is opt-in, anonymized, protected by privacy review, purpose and retention.
3. **Prompt injection:** external logs, webpage text, repository content, MCP tool output and tickets are untrusted observations. They cannot instruct the predictor to change policy or execute side effects.
4. **Secrets/PDPA:** redact content before recording/training; persist references to governed evidence rather than raw transcripts. Respect data-subject deletion and purge-derived-model policies as applicable.
5. **Provenance:** training and observed receipts carry source digests, evaluator revision, time window, provider and hash.
6. **Cost:** model use, candidate count and experiments are charged against existing economic policy, with no invisible exploration budget.
7. **No self-scoring:** candidate promotion requires independently verified outcomes, adversarial/regression evaluation, not another response from the same model.
8. **Reversible deploy:** kill switch, pinning and rollback are mandatory; no irreversible side effects without original authorization.
9. **GUI host constraint:** any SmartAIHub **UI acceptance** MUST use `https://smartaihub.app` exclusively; never substitute IP address, localhost or 127.0.0.1. Disposable backend fixtures may run in approved isolated test environments without being represented as live UI acceptance.

## 8. Staged work plan (work independently when admissible)

### P0 — Read-only reconciliation and baseline [no privileged Runner required]

- **WU-275-RSI-00:** audit existing SPEC-222, 275, 224, 271, 277, 268 and companion source contracts; produce ownership matrix, status/manifest generation and exact current Main SHA.
- **WU-275-RSI-01:** instrument an offline fixture benchmark using historical permitted/denied decisions and independently verified outcome labels; separate stale snapshot, permission-denied, resource-blocked, technical-failure and waiting-owner cases.
- Deliverable: baseline metrics and compatibility report, without changing canonical grant rules.

### P1 — Advisory candidate ranking [no live protected dispatch]

- **WU-275-RSI-02:** implement a pure, scoped predictor/decision contract through the resolved owner adapter; deterministic baseline with explicit UNKNOWN.
- **WU-275-RSI-03:** integrate optional prediction into existing orchestration's *permitted* option selection, initially behind observe-only/shadow flag; execute exactly one original authorized path.
- Required: existing WorkUnit readiness must remain independent of closure evidence.

### P2 — Feedback + replay qualification [authorization scoped to receipt owner]

- **WU-275-RSI-04:** bind to canonical accepted receipt adapters only; defer genuine production failure ingestion until SPEC-275's `SPEC275_PRODUCTION_FAILURE_EVIDENCE_AUTHORITY` blocker resolves.
- **WU-275-RSI-05:** offline calibration, repeat-failure learning, source-drift detection, replay deduplication and fail-closed quarantine.
- Do NOT call synthetic fixture acceptance genuine SPEC-271 WP2B acceptance.

### P3 — Authorized shadow/canary [requires real independent receipt + owner gate]

- **WU-275-RSI-06:** shadow on approved task classes; report gains and regressions without changing dispatch.
- **WU-275-RSI-07:** explicit low-risk canary with bounded budget, source pinning, evidence and rollback; no automatic production promotion.

### P4 — Optional model-backed predictor [deferred until evidence warrants]

- **WU-275-RSI-08:** benchmark local/provider world-model or JEPA-style adapter vs deterministic/LLM baseline for exact tasks, licenses and data policy. Adopt only if calibrated performance and net verified-outcome cost materially improve.

Each WU records source SHA, owner, readiness, completed/open evidence, exact blocker/reactivation predicate and next action in the **existing** canonical HandOff; do not create a parallel progress state machine. Continue independent P0/P1 work while SPEC-224 M6/M7 authority remains blocked.

## 9. Acceptance matrix and regression scenarios

| ID | Independently checkable acceptance |
| --- | --- |
| RSI-AC-01 | GIVEN two legal candidate repairs, ranking is deterministic at a pinned version and never modifies execution state |
| RSI-AC-02 | A DENY/UNKNOWN grant, expired token, missing tenant scope, stale capability probe or wrong source SHA cannot become permitted by scoring |
| RSI-AC-03 | READY WorkUnit without final completion evidence may start permitted implementation; cannot close without evidence |
| RSI-AC-04 | One waiting WorkUnit does not stop a separate authorized READY WorkUnit |
| RSI-AC-05 | Change of Main SHA preserves historical completed work and prevents stale proof from closing new-source requirements |
| RSI-AC-06 | Exactly-once/deduplicated outcome intake under retries, replay, interrupt and duplicate callback |
| RSI-AC-07 | Unverified or quarantined feedback cannot train/promote a production policy |
| RSI-AC-08 | Cross-tenant and unauthorized App/Project evidence never influences another scope |
| RSI-AC-09 | Offline/shadow mode causes zero extra protected dispatch and no authority mutation |
| RSI-AC-10 | Canary enforces expiry, spend, tenant allowlist, version pin, rollback and emergency kill switch |
| RSI-AC-11 | Resource-blocked results are not code failures; no identical retry without fresh admissible evidence |
| RSI-AC-12 | No source content, secrets, private chain-of-thought or raw unredacted external data enters training traces |
| RSI-AC-13 | SPEC-271 receipts remain independently authoritative, including replay across a real process restart when an authorized fixture exists |
| RSI-AC-14 | Browser UI acceptance uses only `https://smartaihub.app` and checks domain-bound tenant/authentication |
| RSI-AC-15 | Every policy candidate can be traced to dataset, version, benchmark, risk review and rollback target |
| RSI-AC-16 | When predictor is disabled or fails, existing authorized execution and handoff semantics are preserved |
| RSI-AC-17 | Provenance mismatch, poisoned log or malicious page text cannot alter dispatch/approval policies |
| RSI-AC-18 | No duplicate scheduler, queue, agent runtime, memory authority or legacy retired system is introduced |

**Test layers:** (a) pure contract/unit tests for eligibility, ranking and fail-closed behavior; (b) replay/fixture tests with synthetic and historical labels kept distinct; (c) disposable, authorized PostgreSQL/worker_jobs restart and duplicate-receipt tests; (d) approved Runner/Computer Use integration; (e) independent UAT and protected CI; (f) controlled shadow/canary only after owner authorization. CI must reject skipped/missing tests being counted as green; evidence must pin exact source commit.

## 10. Metrics and promotion thresholds

Mandatory published, task-class-stratified measures:
- **Verified Autonomous Completion Rate** = independently accepted tasks / eligible attempted tasks, with exclusions and denominators explicit.
- **Human Intervention Rate**, **repeated failure rate**, **mean time to verified recovery**, **cost per verified outcome**, **duplicate work rate** and **regression escape rate**.
- **Forecast calibration**: Brier score / calibration bins or equivalent for success forecasts, predicted-vs-actual cost/time error, coverage of UNKNOWN/out-of-distribution abstentions.
- **Security and safety**: denied-dispatch count, tenant-boundary failures, unauthorized side effects, quarantine effectiveness, rollback rate.
- **GUI**: successful verified task outcomes and action count together; a click-count reduction without functional completion is not a win.

Baseline/control and challenger MUST use comparable tasks, verified label sources, source/policy versions, cost caps and sufficiently powered sample sizes. Stratify by repo/task class, source freshness, authorization and environment; report uncertainty, confidence intervals and failures. No universal improvement percentage is assumed from upstream benchmarks. Thresholds for canary/promotion must be registered by owner before evaluation and MUST fail closed on any critical safety regression. Optimization MUST resist Goodhart effects (e.g. skipping tests to reduce cost, weakening acceptance to inflate completion).

## 11. Dependencies, blockers and handoff protocol

**Dependency gates**, not excuses to stop all work:
- SPEC-275 failure receipt owner/tenant/retention authority not yet bound: production learning ingestion and promotion remain disabled; offline fixture evaluation is independent.
- SPEC-271 WP2B authoritative receipt/restart verification incomplete: can prototype receipt schema against fixtures but not assert live UAT learning.
- SPEC-224 M6/M7 protected non-production Runner enrollment/grant not available: do not contact production-bound Runner or shared production-mode database; continue unrelated offline code.
- SPEC-222 spec relationship/owner status unresolved: no rewrite or claimed supersession; owner resolves integration seam first.
- SPEC-268 / 269 / 302 / 304 project/app scope assertions incomplete: fail closed for App-bound shared learning.
- Heavy local tests/builds require resource preflight; use focused checks and approved CI, no forced primary-workspace resets.

At implementation kickoff: read exact latest `specs/_status/SPEC-STATUS.md`, SPEC-222 and SPEC-275 `handoff/manifest.json`, `handoff/STATUS.md`, `handoff/requirement-ledger.json` where present, and current owner task HandOff. Determine whether a more recent approved implementation has superseded any proposal in this file. Resolve potential cross-spec ownership collisions; write canonical status through `python3 -m tools.spec_handoff` rather than editing generated files. Run `index --check` and scoped `validate`. A doc-only proposal MUST NOT mark implementation or acceptance complete.

## 12. Definition of done for this addendum

**Spec draft delivered** when the Markdown is committed to a review branch, scoped references are correct and a non-destructive PR is open. This does not imply implementation.

**Runtime delivered** only when P1/P2 behavior is integrated via protected PR and independently verified per `RSI-AC-01..18`. Authority-dependent P3 gates may remain `WAITING_AUTHORITY` at WorkUnit scope; label final feature PARTIAL rather than PASS until accepted.

**Production eligible** only after canonical owner reconciliation, accepted receipt/retention/identity adapters, independently verified non-production E2E, required security/data review, budget authorization, controlled canary, promotion approval, rollback proof and current-source required checks.

## 13. Research and code-reuse references

- Gen-Verse RSI-Anything: https://github.com/Gen-Verse/RSI-Anything — architectural inspiration only; not evidence of SmartAIHub runtime success.
- Workflow implementation notes: https://github.com/Gen-Verse/RSI-Anything/blob/main/docs/workflow.md
- Paper: https://arxiv.org/abs/2610.13912
- License: https://github.com/Gen-Verse/RSI-Anything/blob/main/LICENSE (verify dependency/component notices and attribution before copying code).
- Canonical internal references: `specs/feature/222-smartaihub-agentic-development-fabric/spec.md`; `specs/feature/275-autonomous-execution-learning-reliability/spec.md`; `specs/feature/224-Autonomous Development Orchestrator Runtime/spec.md`; `skills/orchestra/references/autonomous-completion-contract.md`.

**Critical principle:** the objective is a higher probability of completing the *original authorized task* with genuine evidence, not a higher likelihood of convincing the system that it succeeded.
