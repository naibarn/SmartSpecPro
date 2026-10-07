---
spec_id: 269
title: SmartAIHub Primary Assistant, Specialist Assistant Teams & Autonomous Workforce Runtime
revision: 3.18
source_revision: 3.17
date: 2026-10-07
recovery_source_sha256: f22593c292daa2390cc8875675d9de182d1826e6873080f9707abf177bcdf1d4
status: PROPOSED_IMPLEMENTATION_READY_CANONICAL_ASSISTANT_AND_USER_WORK_LIFECYCLE_LAYER
scope: Platform-wide / Additive / User-facing Assistant layer
risk_class: HIGH
primary_owner: SmartAIHub Assistant Platform / Chat & Task Control
canonical_assistant_authority: Spec 269
canonical_memory_authority: Spec 268
canonical_knowledge_evidence_authority: Spec 266
canonical_skill_capability_authority: Spec 256 and existing Capability Registry
canonical_durable_job_authority: Feature 186 / Feature 195 worker_jobs + worker_job_events
canonical_development_orchestrator: Spec 224
canonical_portable_application_standard: Spec 261 SPAAS
canonical_ui_design_authority: Spec 270 Design Intelligence / UI Generation
canonical_external_personal_agent_interop: Spec 239
canonical_cloudflare_migration_authority: Spec 267
normative_language: RFC-style MUST / MUST NOT / SHOULD / SHOULD NOT / MAY
reference_inspirations:
  - Grok Bot Primary Bot product pattern
  - jaturapornchai/mybotdemo01 BotTeam demo
  - Rakazo persistent bots / delegation pattern
  - collabs-inc/collab-public agentic workspace / ACP / agent-controlled canvas pattern
reference_policy: Inspirations are non-normative; SmartAIHub contracts remain provider-neutral and authoritative.
implemented_dependencies_read_only:
  - Spec 224 Autonomous Development Orchestrator Runtime
  - Spec 256 Skill-first Capability Catalog & Intent Routing
r2_supersedes:
  - SPEC-269-SmartAIHub-Primary-Specialist-Assistant-Teams-Autonomous-Workforce-R1.0.md
  - SPEC-269-SmartAIHub-Primary-Specialist-Assistant-Teams-Autonomous-Workforce-R2.0.md
  - SPEC-269-SmartAIHub-Primary-Specialist-Assistant-Teams-Autonomous-Workforce-R2.1.md
  - SPEC-269-SmartAIHub-Primary-Specialist-Assistant-Teams-Autonomous-Workforce-R2.2.md
  - SPEC-269-SmartAIHub-Primary-Specialist-Assistant-Teams-Autonomous-Workforce-R2.3.md
r2_key_additions:
  - Solution Strategy Resolver and progressive productization
  - Durable Development Workspace and DevelopmentCheckpoint
  - User-controlled execution placement with no silent fallback
  - Assistant Workspace and policy-controlled Terminal Surface
  - Build placement separated from deployment target
  - Sandbox isolation and disposable materialization policy
  - Development budget estimate/reservation/reforecast/settlement integration
  - Cross-device continuation from PC/Mac/tablet/mobile
  - Generated user applications separated from SmartAIHub core source tree
r2_1_hardening_additions:
  - Reusable Workflow/Automation as a first-class solution strategy between one-off composition and Mini App
  - Source persistence locality separated from execution locality
  - Dirty-work journal and checkpoint durability for local/offline materializations
  - Multi-materialization mutation lease, branch/worktree policy and fencing against split-brain writes
  - Reconstructable build-environment descriptor, dependency lock and provenance/SBOM references
  - Deployment readiness gate for data, secrets, capabilities, migrations and runtime dependencies
  - Immutable release promotion from preview to production plus rollback semantics
  - External subscription/quota observability and affordability UNKNOWN state
  - Workspace/product lineage, maintenance and future-modification continuity
  - Workspace export/archive/delete/retention lifecycle
  - Secret-safe checkpoint/snapshot requirements
  - Database migration safety and rollback evidence
r2_2_hardening_additions:
  - Effective policy snapshot and policy-drift handling for long-running work
  - Trusted executor binding, revocation and reconnect authorization for local/remote harnesses
  - Data residency/processing-region policy separated from execution/source locality
  - Development preflight feasibility gate before open-ended paid build
  - Guided/autonomous development interaction modes and phase review gates
  - Preview environment isolation, private-by-default access and non-production data/secret bindings
  - Environment binding promotion separated from immutable release artifact promotion
  - User customization protection and three-way merge/fork semantics
  - Deployed-app operational spend guard and orphan-resource cleanup
  - Economic idempotency/correlation for retries and duplicate provider callbacks
  - Explicit WAITING_FOR_QUOTA/RATE_LIMIT continuation semantics
  - Cross-device freshness visibility for local-only or partially synchronized workspaces
  - Workspace/checkpoint schema-version compatibility across platform upgrades
  - Large/binary artifact persistence outside Git with integrity-index references
  - Terminal/session control lease and output sanitization/security hardening
r2_3_hardening_additions:
  - Runtime/model/provider compatibility binding and deprecation/drift handling
  - Desired-vs-observed deployment/configuration drift detection and reconciliation
  - Staged/canary production rollout health gates and safe rollback references
  - Scheduled/triggered execution version pinning and update semantics
  - Approval freshness, replay protection and re-authorization after material plan/target changes
  - User/member offboarding and revocation propagation across active sessions, schedules and executors
  - Workspace/product ownership transfer with re-authorization of secrets, billing, domains and external bindings
  - Non-financial resource quotas for compute, storage, egress, concurrency and execution duration
  - Security incident quarantine and compromised-release containment lifecycle
  - Declared durability/recovery class with truthful RPO/RTO-style guarantees and restore verification
  - Secret-binding generation/rotation freshness for long-running sessions and deployments
  - Explicit deployed-product decommission lifecycle and resource/domain cleanup
  - Custom-domain ownership verification and route/takeover protection
  - Post-deploy observability/health projection and Needs You incident escalation
r2_4_hardening_additions:
  - Serialized deployment mutation generation/fencing to prevent promotion, rollback and route races
  - Authenticated replay-safe trigger invocation envelopes with dedupe, causation and source-trust references
  - Explicit schedule timezone/calendar/DST/misfire semantics for durable assistant and workflow activation
  - Monotonic event/projection causality to prevent stale callbacks from regressing terminal state
  - Indeterminate external side-effect outcome state requiring reconciliation before unsafe retry
  - Consistent RecoveryPointSet references across release, data, bindings and artifacts for stateful recovery
  - Public/shared Mini App consumer isolation for identity, data namespace, quotas, memory and creator credentials
  - Versioned external API/MCP/webhook contracts with compatibility and deprecation policy
  - Attention/incident deduplication, flapping suppression and bounded escalation
  - Audited time-bounded break-glass/manual intervention boundary without hidden authority expansion
  - Data disposition/erasure lifecycle projection across canonical stores, indexes, artifacts and external processors
  - ChangeSet provenance linking human/assistant/harness mutations to source, policy and verification evidence
  - Runtime user-data boundary preventing implicit ingestion of production consumer data into development/assistant memory
  - Resource admission/reservation semantics for scarce compute before expensive work starts
  - Automation/event feedback-loop prevention through causation-chain depth and cycle guards
r3_supersedes:
  - SPEC-269-SmartAIHub-Primary-Specialist-Assistant-Teams-Autonomous-Workforce-R2.4.md
r3_key_additions:
  - Human Intent Frame separating stated request, possible underlying goal, decision maturity and surface context
  - Personal Operator / Chief-of-Staff interaction doctrine with recommendation separated from authority
  - Functional multi-perspective executive deliberation with evidence/opinion separation
  - Premise-challenge budget so strategic recurring work can be questioned without obstructing decided work
  - Relationship intelligence and learned working-pattern projections backed by Spec 268 memory
  - Anticipation and proactive preparation without implicit authority expansion
  - Proactive Opportunity & Correction Engine driven by goals, metrics and live signals
  - Initiative ladder from observe through prepare/propose experiment to authorized execution
  - Morning Brief / What Matters Now relevance experience personalized per principal
  - Routine Crystallization from Chat to saved routine, widget, workspace, Mini App or product
  - Chat-for-ambiguity / UI-for-repetition / LLM-for-judgment / software-for-routine boundary
  - Deterministic-vs-LLM operation classification and cost-aware intelligence escalation
  - Surface-aware behavior for SmartAIHub Chat, developer harnesses, persistent bots and specialized workspaces
  - Native harness/bot delegation that preserves provider intelligence while SmartAIHub owns continuity, policy and outcome integration
  - Proactive nuisance budgets, suppression, proposal expiry and user correction loops
  - Scenario-based acceptance suite for human-like continuity, proactive preparation and adaptive work surfaces
r3_1_hardening_additions:
  - Work-definition maturity: Quick Brief / Execution Plan / Implementation Spec
  - Lens-based risk-proportional multi-pass spec hardening with review provenance
  - Executive Approval Digest bound to immutable/versioned scope
  - Material scope-delta re-approval semantics
  - Readable multi-perspective Chat / cards / Meeting Board presentation modes
  - UAT strategy choice: system-managed / user-managed / hybrid / optional skip with truthful state
  - Separate UAT cost visibility and budget authorization
  - Mandatory readiness/security requirements remain non-bypassable, but failure triggers autonomous remediation rather than default human blocking
r3_2_hardening_additions:
  - Completion-seeking autonomy: accepted work is expected to continue until verified completion, cancellation, or a true human-exclusive boundary
  - Guardrails-as-route-constraints: security/readiness requirements constrain valid solutions but do not create dead ends when compliant remediation exists
  - Autonomous blocker remediation ladder: diagnose, repair, retry, replan, reroute, rollback, substitute, reconcile, and continue before escalation
  - Pre-authorized CompletionAuthorityContract for choosing tools, agents, runtimes, repair strategies and bounded scope-preserving changes without repeated approval
  - Unattended-to-completion / sleep mode with durable continuation after UI/browser/device disconnect
  - Attention-minimization and user-contact budget: batch non-urgent questions and ask only when human input is materially unavoidable
  - Auto-remediation for failed mandatory checks, UAT failures, missing deploy readiness and recoverable security/configuration defects
  - Budget/executor/provider fallback policies that prefer authorized alternatives over WAITING_FOR_USER
  - Goal-preserving plan revision without re-approval for non-material implementation changes inside the approved objective/authority/budget envelope
  - True-terminal-boundary definition for human-exclusive consent, unavailable credentials, non-delegable legal acts, unapproved irreversible impact, or exhausted authorized resources with no viable alternative
  - Blocker reports MUST include attempted remedies, best next options, and the smallest exact human action required when escalation is unavoidable
  - Completion notification may be the only user interaction for fully pre-authorized work
r3_3_hardening_additions:
  - ConvergencePolicy and recovery circuit breaker to prevent repeated non-improving repair loops
  - SideEffectSafetyFence requiring reconciliation of ambiguous external commits before retry
  - Goal/Instruction Freshness Fence so new user decisions supersede unattended plans safely
  - EvidenceFreshnessPolicy for long-running research/decision work before final verification
  - RepairMutationLease/fencing for concurrent autonomous repair actors
  - QualityFloorContract preventing silent outcome degradation solely to save cost/time
  - Background resource fairness and priority admission for unattended completion loops
  - Resume revalidation for environment/provider/capability drift after long waits or platform upgrades
  - Production-safe remediation boundary: diagnose/test in preview/sandbox by default before production mutation
  - Dependency substitution gate for security/license/provenance compatibility before auto-replacement
  - Cancellation/redirect responsiveness across child agents, provider jobs and durable continuations
  - Completion deviation ledger summarizing material autonomous changes without forcing user babysitting
  - Human-only requests batching and parallel-progress continuation
  - Unattended progress watchdog / stuck-work recovery SLO
  - Context-purpose minimization for proactive/anticipatory work
r3_4_hardening_additions:
  - Definition-to-Done Closure Model across Specification, Planning, Implementation and Verification phases
  - RequirementCoverageGraph linking every applicable requirement to plan tasks, implementation evidence and verification evidence
  - PlanCompletenessGate that automatically repairs missing plan coverage before implementation
  - ImplementationCompletenessGate that automatically opens/executes closure work for unimplemented or partially implemented requirements
  - VerificationCompletenessGate preventing DONE while applicable requirements lack passing evidence
  - Gap-as-Work invariant: AI-fixable findings become owned executable work, not user-facing terminal reports
  - HarnessPartialResultInterceptor preventing external harness “remaining N items” summaries from becoming final completion
  - ClosureLedger with explicit finding lifecycle from detected through verified closed/reopened
  - Orphan/placeholder/stub/skipped-test/deferred-block discovery and applicability-aware closure
  - Cross-session/harness closure ownership so unfinished work survives provider/session termination
  - Phase reconciliation after planning and implementation, including regression reopening
  - Final Completion Certificate generated only when closure graph contains no unresolved applicable AI-actionable requirement
  - User communication suppression for ordinary closure debt; notify only on completion or true human-exclusive boundary
  - Closure review hardening across 14 independent lenses
r3_5_hardening_additions:
  - CrossSessionDependencyContract for durable peer-session/task dependencies and automatic continuation
  - DependencySufficiencyResolver to decide whether current committed/checkpointed code is already sufficient for the next step
  - SourceFreshnessResolver distinguishing main/origin lag from usable branch/checkpoint/worktree state
  - PartialHandoffProtocol for safe checkpoint/commit/snapshot of completed subsets without waiting for an entire peer goal
  - PeerSessionCoordinator for status query, machine-to-machine handoff requests and non-user-mediated coordination
  - Event-first dependency wakeup with scheduled periodic recheck fallback and watchdog reconciliation
  - CheckpointAndReactivateContract: every recoverable wait checkpoint carries a future wake condition/schedule
  - WAITING_ON_PEER / WAITING_EXTERNAL / WAITING_FOR_EXECUTOR / WAITING_FOR_QUOTA states must auto-reactivate
  - Dependency minimization: wait only for the exact artifact/capability needed, not unrelated peer-session work
  - Auto-takeover/continuation when a peer session terminates or stalls and remaining work is transferable
  - Branch/worktree/commit safety for consuming partial peer work without corrupting canonical source
  - Sleep-mode continuation: checkpoint → release resources → scheduled/event activation → resume → checkpoint again until DONE
  - User-facing waiting notice MUST state that SmartAIHub will recheck and continue automatically
  - Cross-session dependency and self-reactivation acceptance suite
r3_6_hardening_additions:
  - Subagent Execution Fabric for bounded parallel fan-out/fan-in above canonical worker_jobs
  - ParallelismPlanner using dependency graph, critical path, cost/context/resource budgets and expected speedup
  - ContextPacket minimization so each subagent receives only task-relevant context instead of parent conversation history
  - SubagentProgressReceipt / heartbeat / phase / evidence tracking for inspectable progress and stale detection
  - StallDetector with automatic retry, rebind, checkpoint recovery, work stealing, or alternate-provider execution
  - ResearchPathFallback for temporary bandwidth/rate-limit/provider saturation with retry-after scheduling and alternate routes
  - HedgedExecution and speculative parallel approaches for slow/uncertain tasks when benefit exceeds extra cost
  - ResultSelectionContract for best-of-N, first-acceptable, quorum, synthesis, and independent verification policies
  - Candidate scoring on correctness/evidence/quality/compatibility/cost/latency/risk rather than model confidence alone
  - Straggler mitigation and early cancellation of losing/redundant subagents once sufficient result exists
  - Parallel coding isolation with branch/worktree/patch fencing plus explicit merge/synthesis owner
  - Parent accountability: child PARTIAL/FAILED/STALLED results become recovery work, not user-facing terminal blockers
  - Dynamic fanout reduction/expansion based on resource pressure, diminishing returns and information diversity
  - Duplicate-work suppression and semantic subtask dedupe
  - Subagent observability UI: progress, wait reason, attempts, route/provider, artifacts, evidence, next recovery action
  - Multi-approach experiment provenance so the selected result can explain why it won without exposing chain-of-thought
r3_7_hardening_additions:
  - GitDevelopmentLifecycleController that owns automatic phase transitions across implementation, session finalization, integration, canonical sync, build/deploy and smoke verification
  - Existing session-finish / integration-controller / canonical-checkout-sync Skills become lifecycle action handlers rather than user-invoked commands
  - GitLifecycleState inferred from durable repository/session/job/evidence truth, not Chat memory
  - Automatic session-finish trigger when session scope reaches closure and no required child work remains
  - Persistent serialized IntegrationControllerService reacting to READY markers/events instead of requiring a dedicated user command
  - Automatic canonical-checkout-sync after validated main SHA is emitted
  - Build-source certification and deployment continuation after canonical sync under existing authority/budget/resource policies
  - GitLifecycleEvent contract for session-ready, integration-promoted, main-validated, canonical-prepared, build/deploy/smoke events
  - Lifecycle transition leases/idempotency to prevent duplicate finish/integration/sync runs
  - Resource-aware lifecycle admission so full verification/build waits for safe host capacity instead of killing parallel sessions
  - Auto-remediation for dirty/diverged canonical checkout using the current canonical-checkout-sync recovery semantics
  - Auto-reconciliation for main movement, branch overlap, merge conflict, stale READY evidence and baseline drift
  - Lifecycle watchdog for stuck transitions and missing next-step dispatch
  - User-visible development timeline with current phase, next automatic action, blockers and wakeup condition
  - Manual Skill invocation remains an override/debug path, not the normal UX
  - Git-host-neutral contract with GitHub as first-class default and room for GitLab/other remotes
r3_8_hardening_additions:
  - ResearchStrategyIntelligence that decides when, why and how deeply to research from sparse user goals
  - ResearchTriggerPolicy for novelty/currentness/reference-cloning/competitor/design/market/unknown-term/high-impact decisions
  - LiteralRequest vs ResearchObjective vs UnderlyingGoal separation
  - Entity/Alias Resolution before research so ambiguous names, nicknames and typos do not collapse to the first guess
  - ReferencePortfolio discovery: multiple materially distinct projects/products, not first-result anchoring
  - ReferenceDecomposition cards for capability, UX, architecture, maturity, cost, constraints, provenance and applicability
  - ConceptExtraction and PatternHarvesting: borrow useful ideas without implying code/package adoption
  - AdoptStrategy decision: INSPIRE_ONLY / REIMPLEMENT_PATTERN / ADAPTER / DEPENDENCY / FORK / INSTALL / IGNORE
  - UserProjectFitEvaluator using current architecture, goals, device constraints, cost preferences and prior decisions
  - Research-to-Design bridge with Spec 270 for side-by-side reference-inspired mockups and concrete preference elicitation
  - Research-to-Plan bridge: findings must influence scope/spec/plan rather than stop as an informational report
  - ResearchAdequacyPolicy with decision coverage, contradictions, freshness, source independence and blind-spot challenge
  - Deep-research escalation only when expected decision value justifies time/cost; no arbitrary source/pass count
  - Current/fresh claims refresh before recommendation/action
  - Open-source/code reference rights, license/provenance and clean-room concept-reuse boundary
  - Personalized recommendation narrative: explain what fits this user/project and what should be rejected as unnecessary complexity
  - Research result UX that presents findings, comparisons, recommendation, alternatives and optional mockups without overwhelming the user
  - Research failure continuation using R3.5/R3.6 fallback, checkpoint and subagent execution semantics
r3_9_hardening_additions:
  - ResearchBrief / QuestionGraph so subagents receive distinct decision-relevant questions instead of duplicate broad prompts
  - ResearchReusePolicy to reuse recent evidence/analysis and refresh only volatile or decision-critical claims
  - MultiModalReferenceInspection for screenshots, demos, videos, docs, release notes, repositories and live product behavior when relevant
  - ClaimTruthClassification separating vendor/README claims from independently observed, demonstrated, measured or inferred behavior
  - ReferenceVersionSnapshot pinning product/repository/app version and observation time to avoid mixing generations
  - DecisionAuthorityBridge so research can auto-select/recommend/continue under pre-authorized decision policy instead of always waiting for user choice
  - ProgressiveResearchEnvelope with time/cost/source/tool budgets and staged deepening based on marginal decision value
  - PrivacySafeResearchQuery projection that strips unnecessary proprietary/private context before external search/research calls
  - UntrustedSourceInstructionFence: external pages/repos/comments are evidence/content, never orchestration instructions
  - LocaleLanguageJurisdictionExpansion for region/language-specific research when applicability matters
  - ResearchToExperimentBridge for cheap prototype/spike/mock/sandbox validation when web evidence alone cannot establish feasibility
  - ResearchExecutionOverlapPolicy allowing safe prototyping in parallel with deeper research without prematurely committing architecture
  - DecisionImpactMatrix / apples-to-apples comparison dimensions to prevent selective feature cherry-picking
  - RecommendationRobustnessCheck including sensitivity, counterexample, and "what would change my recommendation?"
  - ResearchDecisionReceipt linking selected/rejected references, evidence, user-fit factors and downstream requirements
  - ResearchPreferenceLearning bridge: user selections/corrections become scoped preference evidence via Spec 268
  - ResearchInvalidationCascade when source/version/fact changes invalidate derived recommendations/spec decisions
  - Research status UX showing coverage, unresolved contradictions, active subagents and next automatic action without exposing raw chain-of-thought
r3_10_hardening_additions:
  - StageManifest Standard with machine-readable stage.json for every non-trivial durable goal/workspace
  - HandoffManifest Standard with handoff.json for session/agent/harness/workspace transfer
  - ResumeManifest Standard with resume.json for every recoverable wait/suspend/checkpoint
  - Explicit distinction between canonical runtime state and portable control-artifact projections
  - Stage taxonomy across RESEARCH / SPEC / PLAN / IMPLEMENT / VERIFY / UAT / INTEGRATE / BUILD / DEPLOY / OPERATE plus substages
  - Stage generation/CAS/freshness fencing to prevent stale sessions from resuming or publishing
  - Handoff bundle includes Git/worktree/source SHA, requirements coverage, closure ledger, artifacts, evidence, known failures and next action
  - must_not_repeat / attempted_actions fields to prevent replacement harnesses from repeating known failed work
  - Handoff producer/consumer acknowledgement and takeover ownership semantics
  - Control artifacts are secret-free, integrity-addressed and default-excluded from normal Git commits
  - Automatic regeneration of stage.json after every material lifecycle transition
  - Handoff bundle export/import for cross-session, cross-harness and recovery after context loss
  - Stage watchdog rejects UNKNOWN/STALE stage without reconciliation
  - User-facing stage timeline reads from the same manifest projection
r3_11_hardening_additions:
  - Multi-scope ControlManifestIndex so concurrent goals/tasks/sessions do not overwrite one shared stage.json/handoff.json/resume.json
  - NonLinearStageProjection with primary_stage plus active_fronts/parallel_tracks for research/prototype/implementation/verification occurring concurrently
  - AtomicProjectionProtocol so canonical state commit and manifest projection cannot leave silently inconsistent control artifacts after crash
  - ProjectionHealth status (CURRENT/LAGGING/REBUILDING/CONFLICT/UNKNOWN) and automatic rebuild from canonical state
  - OfflineLocalAheadReconciliation for authorized local checkpoints/manifests newer than cloud-visible projection
  - HandoffClaimLease with expiry/heartbeat/orphan recovery and automatic reassignment
  - NestedHandoffLineage / cycle detection for parent→subagent→specialist→replacement chains
  - Cancellation/Supersession cascade across stage/handoff/resume manifests, child continuations and stale ownership leases
  - ManifestCompletenessGate validating schema, referenced artifacts/evidence, source identity, next action and secret/privacy rules before publish/claim
  - Schema/capability negotiation between producer and consumer harnesses with required/optional feature declarations and safe downgrade refusal
  - Sensitive-context minimization beyond secret stripping, with classification/access scope on portable handoff bundles
  - Manifest retention/compaction/garbage-collection lifecycle tied to canonical audit/retention policy and shared-ref safety
  - Cross-tenant/cross-environment portability classification with explicit non-portable refs and rebind requirements
  - Monotonic generation/order semantics independent of device wall-clock timestamps
  - Reopened-work semantics: stage may regress/re-enter prior phase explicitly without falsifying history or progress
  - CheckpointCadencePolicy for long-running mutation work so crash recovery loses bounded work rather than an entire session
  - ControlArtifactIndex / active manifest discovery for recovery after context loss or controller restart
  - Completion finalization retires stale continuations/claims while retaining audit-safe final manifests
r3_12_hardening_additions:
  - PresentationOutputIntegration delegates rich rendering to Spec 240 without creating a second UI authority
  - PresentationIntent for assistant/subagent/research/stage outputs
  - Read-only stage/handoff/resume/subagent projections into shared presentation blocks
  - Presentation failure isolation: renderer failure does not become goal failure
r3_13_hardening_additions:
  - GoalGraph and SubgoalCompletionContract for compositional completion across nested delegated work
  - DependencyWaitGraph with deadlock/livelock detection across tasks, peers, leases, resources and external waits
  - VerificationStabilityPolicy for flaky/nondeterministic tests so retry-until-green cannot fake completion
  - RiskBasedIndependentVerification requiring verifier separation for critical/high-impact work
  - UntrustedChildResultFence so subagent/external-harness output cannot expand authority or inject orchestration instructions
  - InstructionEpoch propagation into active child ContextPackets with stale-child fencing before consequential actions
  - CommitPointGate revalidating goal/policy/authority/budget/source/evidence immediately before irreversible or externally visible commits
  - DeadlinePolicy distinguishing soft target, hard expiry, best-verified-delivery and post-deadline continuation semantics
  - PriorityInheritance/Preemption policy for shared resources to prevent priority inversion and starvation
  - SpeculativeEconomicReconciliation for hedged/cancelled/losing child work, orphan reservations and actual-usage settlement
  - MultiSystemCommitPlan / compensation semantics for partially committed Git/DB/deployment/external side effects
  - ExecutionAttemptFingerprint for reproducibility/debugging across model/provider/tool/skill/context/environment versions
  - SharedWorkReuseContract for safe reuse/join of equivalent in-flight/completed work without cross-scope leakage
  - CompletionFinalityBarrier preventing DONE while required children, unknown side effects, late callbacks or cleanup/reconciliation remain unresolved
r3_14_hardening_additions:
  - GoalInvariantLedger and SemanticPreservationCheck to prevent goal meaning from drifting across research/spec/plan/implementation/review rewrites
  - RequirementProvenance and ConstraintCoverage for positive requirements, non-goals, prohibitions, exclusions and source authority
  - AssumptionLedger / DecisionDebt lifecycle so unverified assumptions cannot silently become facts or permanent architecture
  - MaterialGapPolicy separating MUST_FIX completion debt from SHOULD_IMPROVE optimization so hardening converges without silent scope erosion
  - ChangeImpactGraph / BlastRadiusGate before shared code/schema/runtime mutation across concurrent goals/products
  - ControlPlanePartitionPolicy with split-brain fencing and minority/read-only behavior during network partitions
  - RuntimeCompatibilityEnvelope for controller/runner/harness/skill/tool protocol version skew and rolling upgrades
  - CanonicalStateIntegrityAudit for event/state corruption detection, replay, repair and explicit UNKNOWN/DEGRADED truth
  - RecoveryDrill / FaultInjectionPolicy to prove checkpoint, takeover, retry, rollback, compensation and resume paths actually work
  - ActiveExecutionContainment / EmergencyBrake for compromised/runaway agent, tool, provider or executor
  - DegradedModePolicy preserving critical work and truthful behavior during partial platform/provider outages
  - Assumption/Decision invalidation cascade into affected research, plan, child contexts, verification and completion evidence
  - NegativeConstraintVerification so "must not" requirements are tested, not merely documented
  - Shared-resource mutation collision detection across goals/workspaces before commit
  - Operational survivability evidence for long-running unattended goals across controller restart/version rollout/network partition
  - Release/completion cannot rely on untested recovery claims for critical durability guarantees
r3_15_hardening_additions:
  - DeliveryVsOutcomeCompletion semantics distinguishing artifact delivery, stabilization, operational acceptance and longer-horizon outcome realization
  - StabilizationWindow / DelayedFailureBarrier so async failures, queued jobs and production health have time to surface before strong finality claims
  - ObservabilitySufficiencyGate preventing "healthy" claims when required telemetry is missing, stale, sampled away or inaccessible
  - VerificationOracleProfile for test-oracle strength, evidence diversity and coverage confidence beyond raw pass counts
  - RepresentativeScenarioPortfolio covering realistic data/device/tenant/load/error/localization cohorts rather than only happy-path fixtures
  - EvidenceIndependenceGraph for correlated agents/models/sources so consensus is not overstated
  - EvidenceAuthenticityReceipt binding claimed tests/benchmarks/artifacts to trusted tool/runtime receipts instead of model narration
  - RecoveryAssetRetentionLease keeping rollback artifacts/checkpoints/backups available through stabilization/recovery windows
  - RetryBudget / Backpressure / Bulkhead semantics preventing autonomous retry storms and thundering-herd recovery
  - CompletionBudgetReserve preserving budget/resources for verification, recovery and final reconciliation instead of spending everything on implementation
  - SuccessMetricContract with baseline, target, guardrail metrics, attribution limits and observation window
  - GoodhartGuard preventing optimization of one success metric from violating quality, safety, cost or user-value guardrails
  - PostDeliveryWatcher handoff for outcome-monitoring goals without keeping development goal falsely open forever
  - ConfidenceCalibration / UnknownCoverage status so "all observed checks pass" is not misrepresented as "all possible failures are ruled out"
  - FinalResultClass distinguishing DELIVERED, STABILIZING, VERIFIED_COMPLETE and OUTCOME_OBSERVED
  - Production completion evidence must distinguish technical completion from business/outcome attribution
r3_16_hardening_additions:
  - MultiPrincipalInstructionResolver for conflicting instructions from owner/team/admin/collaborators without duplicating Spec 220 authorization
  - AuthorityWeightedInstructionEnvelope carrying principal, scope, command class, generation and authorization provenance
  - GoalPortfolioConflictGraph for objective-level conflicts across concurrently valid goals, not only shared-file/resource collisions
  - HierarchicalDelegationBudget ensuring nested subagents cannot multiply aggregate spend beyond the parent goal envelope
  - LearningWriteGate and LearningCandidateReceipt preventing speculative/failed/default-derived output from contaminating Spec 268 memory
  - ScopedLearningPolicy ensuring personal/project/team/tenant learning does not leak across authority boundaries
  - DefaultDecisionReceipt so autonomous defaults remain auditable, reversible and are not mistaken for user preference
  - CapabilityHealthSnapshot consumed from Spec 256/provider adapters before dispatch; registry presence alone is not execution readiness
  - CapabilityContractDrift detection for external APIs/tools whose behavior/schema changes without clean version boundaries
  - ProviderDeprecationMigrationPolicy for active goals and durable workflows when a capability/model/tool is sunset or materially degraded
  - NotificationDeliveryReceipt / AttentionDeliveryPolicy so completion or true-human-exclusive requests are not silently lost after channel failure
  - Human attention waits remain durable and auto-retry delivery without making notification transport part of goal truth
  - Cross-goal learning and work reuse require scope/purpose compatibility, not semantic similarity alone
  - Completion reports distinguish autonomous defaults, learned preferences, and explicit user decisions
  - Multi-principal conflict pauses only the affected decision/commit while independent work continues
  - No new auth, memory, capability registry, scheduler or notification backend is created by these policies
r3_17_hardening_additions:
  - NormativeSpecIndex / precedence map so cumulative amendments are machine-navigable and conflicting clauses are not resolved by context-window accident
  - RequirementLineageGraph preserving coverage across requirement split/merge/reword/supersede operations
  - ContextSliceCompletenessContract proving compact subagent packets include all required invariants/constraints for the assigned slice
  - BehavioralConfigurationSnapshot pinning AssistantProfile, prompt/template, routing policy, feature-flag cohort and model-selection policy used by consequential attempts
  - BehaviorDriftPolicy for active work when behavioral configuration changes mid-goal
  - DataPurposeEpoch / PrivacyRevocationFence propagating consent/purpose/forget changes into active ContextPackets and external-processing eligibility
  - DerivedProjectionConvergenceBarrier for required outbox/cache/index/vector/search/CDN/materialized projections after canonical mutation
  - ConstraintSatisfiabilityGate detecting mutually impossible requirements before expensive execution and after material scope changes
  - CheckpointDurabilityReceipt proving a checkpoint is retrievable/integrity-valid before releasing executor/lease or relying on resume
  - RecoveryFailureDomainProfile preventing correlated primary/fallback/recovery paths from being misrepresented as independent resilience
  - EvaluationLeakageFence / HoldoutVerification reducing correlated implementer-test-verifier blind spots
  - EnvironmentParityReport making Preview/Staging→Production differences explicit before applying verification evidence
  - VerificationTargetBindingSet binding test evidence to exact code, schema, config, behavior, runtime and environment generations
  - Required derived-state convergence and parity are risk-based; noncritical caches/optional projections do not become ceremonial blockers
  - Spec execution indexes are derived artifacts, never a competing spec source of truth
  - No second privacy authority, cache/index authority, test runner, configuration service or recovery backend is introduced

---

# Spec 269 — SmartAIHub Primary Assistant, Specialist Assistant Teams & Autonomous Workforce Runtime R3.17

## 0. Executive decision

SmartAIHub SHALL introduce one canonical user-facing **Assistant layer** that turns the existing Chat, Goal/Plan, Skills, Capability Resolver, durable jobs, external-agent adapters, memory, knowledge/evidence and runtime-placement infrastructure into a coherent system of persistent AI coworkers.

The canonical hierarchy is:

```text
User
  ↓
Primary Assistant             persistent / user-facing / relationship owner
  ↓
Specialist Assistant(s)       persistent / role- or domain-specific responsibility
  ↓
Task Agent / Subagent(s)      ephemeral / execution-only / scoped to delegated work
  ↓
Skills / Capabilities / Tools / Models / Apps
  ↓
Runtime placement             Worker / Container / PC-Mac / external provider
```

The platform MUST preserve the following abstraction boundary:

```text
Assistant = WHO is responsible
Agent     = HOW reasoning/execution is performed
Skill     = reusable KNOW-HOW
Tool      = WITH WHAT action is performed
Runtime   = WHERE execution occurs
Model     = which inference engine is used
Provider  = who supplies a managed capability/runtime
```

A Primary Assistant MUST NOT become a second orchestration runtime, a second job source of truth, or a provider-specific bot type.

A Specialist Assistant MUST be capable of accepting a delegated goal, executing autonomously within policy, following up on waits/events, using Skills/Agents/Tools, verifying completion, and returning a typed result to its delegator without requiring the user to micromanage each step.

R2 adds a second product-level decision before software development begins:

```text
User Goal
   ↓
Solution Strategy Resolver
   ├── USE_EXISTING_CAPABILITY
   ├── COMPOSE_EXISTING_CAPABILITIES
   ├── CREATE_REUSABLE_WORKFLOW
   ├── CUSTOMIZE_EXISTING_PRODUCT
   ├── CREATE_REUSABLE_MINI_APP
   └── CREATE_CUSTOM_APPLICATION
```

Creating a new Mini App or custom application MUST NOT be the automatic answer to every user goal. SmartAIHub SHALL prefer the least-complex solution that satisfies the user's desired durability, customizability, ownership and future-extension requirements.

R2 also establishes the following execution rule:

> **A user-selected local harness or execution placement is a binding policy decision, not a hint. SmartAIHub MUST NOT silently move that work to cloud execution when the selected executor is unavailable unless the user's policy explicitly authorizes such fallback.**

Cloud execution remains a full baseline capability for users who have no PC at all, including tablet- and mobile-only users. This baseline does not override an explicit `LOCAL_ONLY` or `DENY_CLOUD_FALLBACK` policy chosen by another user.

---

# 1. Why this spec exists

SmartAIHub already has most of the infrastructure needed for autonomous work:

- Chat and Task Control surfaces;
- Goal/Plan semantics;
- Skill-first capability resolution;
- MCP/A2A and external-agent interoperability;
- durable job execution and recovery;
- Cloudflare/local execution placement;
- persistent and project memory;
- Knowledge / Evidence / RAG fabric;
- Development Orchestrator;
- Mini Apps and portable SPAAS applications;
- approval, budget, credential and audit primitives.

What is still missing is one canonical product/runtime object that answers:

1. Who is the user's main AI coworker?
2. Which persistent specialists belong to the user/project/team/tenant?
3. What responsibility does each specialist own?
4. When should the Primary do the work directly vs delegate it?
5. How does one Assistant delegate to another and receive completion evidence?
6. How does an Assistant wait and resume without asking the user to remember?
7. How is bounded autonomy expressed consistently?
8. How are temporary subagents prevented from polluting the permanent Assistant roster?
9. How does the user see all ongoing work, blockers and decisions in one place?
10. How do external bots such as Grok Bot, Dots, Muse or provider-managed agents participate without owning SmartAIHub identity, memory, policy or job truth?

Spec 269 establishes these contracts.

---

# 2. Architectural boundaries and ownership

## 2.1 Spec 269 owns

Spec 269 is authoritative for:

- `AssistantProfile` identity and lifecycle;
- Primary Assistant bindings and scope inheritance;
- Specialist Assistant semantics;
- `AssistantTeam` and membership/hierarchy;
- role/responsibility declarations;
- Assistant-level autonomy and authority modes;
- Assistant-to-Assistant `DelegationContract`;
- Assistant-level completion contracts;
- Assistant continuation / self-follow-up semantics;
- persistent Assistant roster and templates;
- ephemeral Task Agent/Subagent semantics;
- Assistant Workboard / delegation graph semantics;
- unified human Attention Inbox semantics for Assistant work;
- Assistant-specific verification policy;
- delegation depth/cost/loop guards;
- provider/runtime binding rules for Assistants;
- Assistant creation from templates, AI-assisted creation and promotion to Primary;
- teach-by-demonstration integration into Skill acquisition;
- Assistant Team templates and organization views;
- `SolutionStrategyContract` and progressive productization decision semantics;
- project-level `DevelopmentStrategy` and execution-placement policy envelopes;
- durable `DevelopmentWorkspace` identity and materialization semantics above execution runtimes;
- project-level `DevelopmentCheckpoint` references required for cross-runtime/cross-device continuation;
- `AssistantWorkspace` composition semantics and adaptive execution surfaces;
- policy-controlled `TerminalSurface` semantics as a view over an authorized execution session;
- user-visible build-cost estimate/budget-envelope semantics that project onto the canonical billing/credit authority;
- no-silent-runtime-fallback semantics;
- build-placement vs deployment-target separation;
- generated-user-application isolation from the SmartAIHub core source tree.

## 2.2 Spec 269 does NOT own

Spec 269 MUST NOT replace or duplicate:

| Concern | Existing authority |
|---|---|
| Durable generic jobs/events/leases/fencing/idempotency | Feature 186 / Feature 195 |
| Development run state machine / Final Verify | Spec 224 |
| Knowledge, evidence, provenance, source rights | Spec 266 |
| Memory, context retrieval, retention/forget semantics | Spec 268 |
| Portable AI application package/lifecycle | Spec 261 |
| External personal-agent provider interoperability | Spec 239 |
| Skill catalog / capability descriptors / intent routing | Spec 256 + Capability Registry |
| Production queue/control-plane migration | Spec 267 |
| Provider-specific runtime implementation | Runtime/Managed Agent adapters |
| Model routing/inference selection | Unified LLM Routing authority |
| Billing/credit ledger | Existing billing/economic authority |

Where another specification is authoritative, Spec 269 SHALL store references/foreign keys/policy bindings rather than reimplement that subsystem.

## 2.3 No retroactive rewrite requirement

Frozen, completed or already-implemented specs MUST NOT be rewritten merely to implement Spec 269.

**Spec 224 and Spec 256 are implemented dependencies and SHALL be treated as read-only contracts for Spec 269 R2.**

```text
Spec 224 = CONSUME_ONLY / NO_REQUIRED_MODIFICATION
Spec 256 = CONSUME_ONLY / NO_REQUIRED_MODIFICATION
```

Spec 269 implementation SHALL adapt around their existing public behavior using composition, adapters, projection tables, correlation records and compatibility services owned by the Spec 269 implementation boundary.

If an existing implemented dependency does not expose a desirable R2 field, that absence MUST NOT be used as permission to modify the dependency silently. The R2 implementation SHALL either:

1. derive/project the missing planning metadata outside the implemented subsystem;
2. persist correlation state in Spec 269-owned storage;
3. use an already-supported extension mechanism; or
4. stop at an explicit compatibility limitation and create a separately approved future change.

Existing systems SHALL integrate through additive adapters, foreign keys, events and compatibility contracts.

---

# 3. Core invariants

The following are platform invariants:

```text
PRIMARY ASSISTANT ≠ SUPER-LLM
PRIMARY ASSISTANT ≠ JOB QUEUE
PRIMARY ASSISTANT ≠ ORCHESTRATION KERNEL
SPECIALIST ASSISTANT ≠ SYSTEM PROMPT ONLY
ASSISTANT ≠ MODEL
ASSISTANT ≠ PROVIDER BOT
ASSISTANT ≠ RUNTIME
ASSISTANT ≠ SKILL
ASSISTANT ≠ TASK AGENT
TASK AGENT ≠ PERMANENT ROSTER MEMBER
DELEGATION ≠ FIRE-AND-FORGET CHAT MESSAGE
WAITING ≠ LOST
RETRY ≠ NEW UNRELATED TASK
DONE ≠ LLM SAYS "DONE"
COMPLETION ≠ SUCCESS WITHOUT EVIDENCE
VERIFICATION ≠ SAME ACTOR SELF-ASSERTION FOR HIGH-RISK WORK
SEMANTIC RELEVANCE ≠ AUTHORIZATION
CAPABILITY MATCH ≠ PERMISSION TO EXECUTE
PROVIDER AVAILABILITY ≠ AUTHORITY TO SPEND
AUTONOMY ≠ UNBOUNDED SIDE EFFECTS
TEAM HIERARCHY ≠ UNLIMITED DELEGATION DEPTH
NEW MINI APP ≠ DEFAULT ANSWER TO EVERY GOAL
SOLUTION STRATEGY ≠ EXECUTION IMPLEMENTATION
DEVELOPMENT WORKSPACE ≠ SANDBOX
SANDBOX ≠ SOURCE OF TRUTH
SANDBOX LOSS ≠ PROJECT LOSS
LOCAL EXECUTOR SELECTED ≠ CLOUD EXECUTION AUTHORIZED
EXECUTOR UNAVAILABLE ≠ SILENT FALLBACK
BUILD PLACEMENT ≠ DEPLOYMENT TARGET
DEVELOPMENT MEMORY ≠ SOURCE REVISION
MEMORY ≠ CANONICAL TASK STATE
ESTIMATED COST ≠ EXACT FINAL COST
AUTONOMY ≠ UNBOUNDED SPEND
RESERVED BUDGET ≠ CHARGED AMOUNT
TERMINAL SURFACE ≠ PRODUCTION SERVER SHELL
GENERATED USER APP ≠ SMARTAIHUB CORE SOURCE TREE
```

A user MUST be able to determine at any time:

- which Assistant owns the goal;
- what has been delegated;
- where each task is executing;
- what it is waiting for;
- what has been completed;
- what evidence supports completion;
- what requires the user's decision or approval;
- what it has cost or is authorized to cost.

---

# 4. Canonical actor model

## 4.1 Primary Assistant

A **Primary Assistant** is a persistent AssistantProfile assigned as the default user-facing owner for a specific scope.

It is responsible for:

- receiving broad goals from the user;
- understanding context and scope;
- deciding whether to act directly, invoke a Skill, start a workflow, or delegate;
- creating/maintaining an execution plan for complex goals;
- monitoring delegated work;
- aggregating results;
- resolving recoverable blockers;
- escalating only when policy or missing information requires the user;
- returning progress and final outcomes into the originating Chat/Task context.

Primary is a **binding/role**, not a separate class of runtime.

## 4.2 Specialist Assistant

A **Specialist Assistant** is a persistent AssistantProfile whose purpose is a stable domain responsibility such as:

- CEO / Business Strategy;
- Finance / Accounting;
- Research;
- Software Engineering;
- Graphics Design;
- Video Production;
- Marketing;
- Sales;
- Customer Service;
- Legal/Compliance;
- Data Analysis;
- Operations.

A Specialist Assistant MUST have an explicit responsibility profile, capability requirements and authority policy.

It MAY delegate further within limits.

## 4.3 Task Agent / Subagent

A **Task Agent** or **Subagent** is ephemeral and scoped to a task/run/delegation.

It MAY be spawned to perform:

- independent research;
- parallel exploration;
- a bounded implementation task;
- review/verification;
- provider-specific tool execution;
- short-lived specialist reasoning.

It MUST NOT automatically become a persistent AssistantProfile.

Default retention:

```text
Task Agent identity: ephemeral
Task result/evidence: durable according to job/task retention
Useful learned execution pattern: may be extracted into Spec 268 procedural memory
Reusable process: may be proposed as a Skill under Spec 256
```

## 4.4 External managed bot/agent

A provider-managed entity such as Grok Bot, Dots, Muse or a future managed agent MAY be bound as:

- an execution provider for a SmartAIHub Assistant;
- a provider-native specialist mapped to a SmartAIHub AssistantProfile;
- an external delegate through Spec 239;
- an attached SPAAS materialization/binding under Spec 261.

The provider entity MUST NOT become canonical identity, policy, billing, memory or job authority unless a future explicit migration spec changes that boundary.

---

# 5. Assistant scope and Primary binding

## 5.1 Supported Primary scopes

Primary Assistant bindings SHALL support:

```text
PERSONAL
PROJECT
TEAM
TENANT
MINI_APP_CONTEXT   optional extension where product policy permits
```

## 5.2 Scope-aware resolution

When a Chat or command is issued, the `PrimaryAssistantResolver` SHALL resolve the most specific authorized active binding.

Recommended precedence:

```text
explicit assistant selected by user
    > current project binding
    > current team binding
    > current tenant binding where tenant policy declares ownership
    > personal binding
    > platform default assistant
```

Precedence MUST be policy-configurable where tenant semantics differ.

## 5.3 Binding is not cloning

`Make Primary` MUST create/update a binding, not duplicate the AssistantProfile.

The same AssistantProfile MAY be Primary for more than one compatible scope if policy permits.

## 5.4 No hidden scope escalation

A Project Primary MUST NOT automatically inherit access to Personal memory, other projects, other teams or tenant-wide data solely because it is Primary.

Authorization is independent from semantic relevance and role title.

---

# 6. AssistantProfile canonical model

Minimum logical schema:

```yaml
AssistantProfile:
  id: uuid
  tenant_id: uuid
  owner_principal_id: uuid
  name: string
  avatar_asset_id: uuid|null
  role_key: string|null
  title: string
  description: string
  status: draft|active|suspended|archived

  persona:
    instructions: string
    communication_style: object
    languages: [string]

  responsibility:
    mission: string
    domains: [string]
    owned_outcomes: [string]
    non_responsibilities: [string]

  capability_policy:
    required_capabilities: [CapabilityRequirement]
    preferred_capabilities: [CapabilityRequirement]
    prohibited_capabilities: [CapabilityRef]
    preferred_skills: [SkillRef]

  memory_policy:
    memory_space_refs: [MemorySpaceRef]
    writable_memory_scopes: [string]
    read_policy_ref: string

  knowledge_policy:
    source_scope_refs: [KnowledgeScopeRef]
    evidence_requirements: object

  authority_policy_ref: uuid
  runtime_policy_ref: uuid
  verification_policy_ref: uuid
  delegation_policy_ref: uuid
  budget_policy_ref: uuid

  provider_bindings: [AssistantProviderBinding]
  team_memberships: [AssistantTeamMembershipRef]

  created_at: timestamp
  updated_at: timestamp
  version: integer
```

Persona text MUST NOT be the sole enforcement mechanism for permissions, budgets, side effects or delegation depth.

---

# 7. Assistant lifecycle

Canonical lifecycle:

```text
DRAFT
  ↓ activate
ACTIVE
  ↔ suspend/resume
SUSPENDED
  ↓ archive
ARCHIVED
```

Deletion MAY be implemented as retention-policy-aware tombstoning rather than physical deletion.

Lifecycle constraints:

- DRAFT cannot own active work unless an explicit preview/test execution is created.
- SUSPENDED cannot accept new work and MUST not auto-resume scheduled work.
- Active delegations at suspension MUST be reconciled according to policy: cancel, allow-to-finish, or transfer.
- ARCHIVED cannot be selected as Primary.
- Primary binding to a non-active Assistant MUST fail closed and resolve fallback.

---

# 8. Assistant role templates

SmartAIHub SHOULD ship role templates as **starter configurations**, not hard-coded bot types.

Initial template catalog SHOULD include:

```text
Chief of Staff / Primary Assistant
CEO / Business Strategy
COO / Operations
CFO / Finance
Research Professional
Software Engineer
Product Manager
Graphics Designer
Video Professional
Marketing Strategist
Sales Professional
Customer Service
Data Analyst
Legal / Compliance Assistant
```

Each template MAY declare:

- default mission/responsibility;
- recommended capability requirements;
- recommended Skills;
- suggested knowledge scopes;
- default authority mode;
- recommended verification requirements;
- starter dashboard fields;
- suggested budget class.

Templates MUST NOT grant hidden permissions.

---

# 9. Assistant creation flows

The product SHALL support at least four creation modes.

## 9.1 From Template

User selects a template and reviews generated permissions/capabilities before activation.

## 9.2 Create with AI

Example user request:

> สร้างผู้ช่วยที่เชี่ยวชาญการทำวิดีโอสินค้าให้ฉัน

The platform MAY generate a proposed AssistantProfile, Skills/capability bundle and policy settings.

AI-generated configuration MUST be presented as a diff/proposal when it changes permissions, external connections or spending authority.

## 9.3 Promote existing Assistant

An existing Assistant MAY be assigned additional responsibility or made Primary by changing bindings/policy, not by cloning identity.

## 9.4 Primary proposes a new Specialist

When recurring work exposes a durable domain responsibility, Primary MAY propose creating a specialist.

Creation MUST require policy-appropriate user/tenant approval because a persistent Assistant can hold memory, permissions and budget.

Ephemeral Task Agents do not require persistent-roster creation approval unless their execution itself triggers a separate approval boundary.

---

# 10. AssistantTeam first-class model

A team is not merely a chat room.

Minimum logical model:

```yaml
AssistantTeam:
  id: uuid
  tenant_id: uuid
  scope_type: personal|project|team|tenant|mini_app
  scope_id: uuid|null
  name: string
  purpose: string
  status: active|suspended|archived
  lead_assistant_id: uuid|null
  shared_memory_space_refs: [MemorySpaceRef]
  shared_knowledge_scope_refs: [KnowledgeScopeRef]
  delegation_policy_ref: uuid
  collaboration_policy_ref: uuid
  budget_policy_ref: uuid
  approval_policy_ref: uuid
  completion_policy_ref: uuid
```

Team membership:

```yaml
AssistantTeamMembership:
  team_id: uuid
  assistant_id: uuid
  role_key: string
  reports_to_assistant_id: uuid|null
  can_receive_delegations: boolean
  can_delegate: boolean
  priority: integer
  active: boolean
```

## 10.1 Example teams

### Startup Team

```text
Lead: CEO Assistant
Members: Research, Product, Engineering, Graphics, Marketing
```

### Film Production Team

```text
Lead: Producer Assistant
Members: Director, Scriptwriter, Cinematographer, Graphics, Video, Sound
```

### Engineering Team

```text
Lead: Engineering Lead
Members: Architect, Frontend, Backend, Database, QA, Security, DevOps
```

---

# 11. Delegation decision policy

The system MUST avoid multi-agent theater.

Before delegation, Primary/Specialist SHALL evaluate:

1. Can this be completed directly with a Skill or deterministic tool?
2. Does the work require persistent domain context/responsibility?
3. Would delegation materially improve quality, parallelism, safety or ownership?
4. Does the delegation cost/time fit policy?
5. Is a persistent Specialist appropriate, or is an ephemeral Task Agent enough?

Preferred decision flow:

```text
Goal
 ↓
Simple deterministic capability?
 ├─ yes → Skill/Tool directly
 └─ no
      ↓
Needs stable specialist ownership/context?
 ├─ yes → Specialist Assistant
 └─ no  → Task Agent/Subagent or Workflow
```

Delegating a trivial resize, format conversion or deterministic lookup through multiple Assistants SHOULD be prevented by policy unless there is a special compliance requirement.

---

# 12. DelegationContract

Assistant-to-Assistant delegation MUST be typed and durable.

Minimum contract:

```yaml
DelegationContract:
  id: uuid
  parent_goal_id: uuid
  parent_task_id: uuid|null
  delegator_assistant_id: uuid
  delegatee_kind: assistant|task_agent|workflow|external_agent
  delegatee_id: string

  objective: string
  success_criteria: [Criterion]
  input_artifact_refs: [ArtifactRef]
  context_refs: [ContextRef]
  evidence_requirements: [EvidenceRequirement]

  authority_grant:
    capability_refs: [CapabilityRef]
    side_effect_classes: [string]
    credential_binding_refs: [string]
    max_spend: Money|null
    max_tokens: integer|null
    deadline: timestamp|null

  delegation_policy:
    max_child_depth: integer
    child_budget: Money|null
    allow_subdelegation: boolean

  return_contract:
    result_schema_ref: string|null
    required_artifacts: [ArtifactRequirement]
    verification_level: string

  state: created|accepted|running|waiting|blocked|verifying|completed|failed|cancelled|expired
  created_at: timestamp
  accepted_at: timestamp|null
  terminal_at: timestamp|null
```

A delegation MUST NOT rely solely on free-form chat messages for lifecycle truth.

Human-readable messages MAY accompany the contract.

---

# 13. Delegation state machine

Canonical delegation lifecycle:

```text
CREATED
  ↓
ACCEPTED
  ↓
RUNNING
  ├─→ WAITING ──→ RUNNING
  ├─→ BLOCKED ──→ RUNNING / FAILED / ESCALATED
  ├─→ VERIFYING ──→ RUNNING (rework)
  │                 └→ COMPLETED
  ├─→ CANCELLED
  ├─→ EXPIRED
  └─→ FAILED
```

Delegation state MAY be projected from canonical durable job/task state but MUST maintain stable Assistant-level semantics for UI and collaboration.

---

# 14. Goal ownership

Every autonomous goal MUST have exactly one current logical owner at the Assistant layer.

Ownership can be:

```text
Primary Assistant
Specialist Assistant
System-owned workflow coordinator where no Assistant identity is needed
```

When work is delegated, the parent owner retains accountability unless ownership is explicitly transferred.

Delegation and ownership transfer are distinct operations.

---

# 15. Goal-to-completion autonomous loop

An Assistant accepting a goal SHALL follow a durable logical loop:

```text
UNDERSTAND
  ↓
PLAN / SELECT CAPABILITY
  ↓
EXECUTE OR DELEGATE
  ↓
OBSERVE
  ↓
EVALUATE AGAINST SUCCESS CRITERIA
  ├─ insufficient → REPAIR / RETRY / REPLAN
  ├─ waiting      → CONTINUATION
  ├─ blocked      → RECOVER / ESCALATE
  └─ sufficient   → VERIFY
                         ↓
                       COMPLETE
```

The loop MUST stop when:

- success criteria are met and verified;
- a non-recoverable terminal failure is reached;
- the user/policy cancels the goal;
- budget/time/attempt/delegation limits are exhausted;
- an approval/decision is required and cannot be safely inferred.

It MUST NOT stop merely because one model call ended.

---

# 16. CompletionContract

Assistant work MUST be evidence-based.

Minimum logical model:

```yaml
CompletionContract:
  id: uuid
  goal_or_task_id: uuid
  criteria:
    - id: string
      description: string
      validator_kind: deterministic|llm_review|human|external|artifact_check
      required: boolean
  required_artifacts: [ArtifactRequirement]
  evidence_policy: object
  verification_policy_ref: uuid
  completion_threshold: object
```

Example — Graphics Assistant:

```text
Goal: Create launch poster

Required:
✓ requested dimensions exist
✓ brand constraints pass
✓ text overflow/layout validation passes
✓ required languages exist
✓ output artifact stored in canonical Library/R2 path
✓ final artifact linked to task
```

Example — Video Professional:

```text
✓ storyboard approved or auto-approved under policy
✓ all required shots produced
✓ timeline has no missing media
✓ target duration/timing tolerance passes
✓ audio/subtitle requirements pass
✓ render artifact exists and is playable
✓ requested delivery formats exist
```

---

# 17. Verification policy

Verification levels SHOULD include:

```text
NONE              only for low-risk deterministic actions
SELF_CHECK
DETERMINISTIC
INDEPENDENT_AGENT
EVIDENCE_GROUNDED
HUMAN_APPROVAL
COMPOSITE
```

For higher-risk work, the same execution actor SHOULD NOT be the sole verifier.

The platform MAY select an independent Specialist/Task Agent as verifier.

When factual correctness matters, verification SHOULD use Spec 266 evidence/provenance rather than merely asking another LLM whether it agrees.

---

# 18. Continuation and self-follow-up

An Assistant MUST be able to wait without losing task identity or asking the user to remember to prompt it again.

Canonical continuation kinds:

```text
WAIT_UNTIL_TIME
WAIT_FOR_EVENT
WAIT_FOR_DELEGATION_RESULT
WAIT_FOR_PROVIDER_JOB
WAIT_FOR_APPROVAL
WAIT_FOR_USER_DECISION
WAIT_FOR_EXTERNAL_RESOURCE
RETRY_AT
BACKOFF_RETRY
DEPENDENCY_BARRIER
```

Logical object:

```yaml
AssistantContinuation:
  id: uuid
  goal_id: uuid
  task_id: uuid|null
  assistant_id: uuid
  kind: string
  condition: object
  resume_payload_ref: string|null
  due_at: timestamp|null
  timeout_at: timestamp|null
  state: pending|ready|resumed|expired|cancelled
  dedupe_key: string
```

Continuation MUST ultimately be backed by existing durable scheduling/job/event infrastructure rather than local browser timers or ephemeral localStorage.

Cron/routine is appropriate for recurring work; it MUST NOT be abused as the only mechanism for dependency waits.

---

# 19. Authority modes

Every Assistant SHALL operate under an explicit authority mode.

Minimum canonical modes:

```text
OBSERVE_ONLY
RECOMMEND_ONLY
DRAFT_ONLY
EXECUTE_WITH_APPROVAL
BOUNDED_AUTONOMOUS
```

Semantics:

- `OBSERVE_ONLY`: may read/inspect authorized sources; no mutations or external side effects.
- `RECOMMEND_ONLY`: may analyze and propose actions; no persistent mutation except internal draft/analysis artifacts.
- `DRAFT_ONLY`: may create drafts/artifacts but not publish/send/commit externally.
- `EXECUTE_WITH_APPROVAL`: may prepare execution and perform explicitly pre-approved low-risk actions; configured side effects require approval.
- `BOUNDED_AUTONOMOUS`: may execute authorized capabilities within budget, side-effect and destination boundaries until completion.

There is deliberately no `UNBOUNDED_AUTONOMOUS` mode.

---

# 20. Side-effect classification

Actions SHOULD be classified independently from Assistant role.

Example classes:

```text
READ_DATA
WRITE_INTERNAL_DRAFT
WRITE_INTERNAL_CANONICAL
SEND_EXTERNAL_MESSAGE
PUBLISH_PUBLIC
SPEND_MONEY
CREATE_FINANCIAL_COMMITMENT
DELETE_OR_IRREVERSIBLE
CHANGE_SECURITY_OR_ACCESS
RUN_CODE
CONTROL_COMPUTER
DEPLOY_PRODUCTION
TRANSFER_DATA_EXTERNAL
```

Approval requirements MUST be enforced by policy/data, not prompt wording.

---

# 21. DelegationPolicy

Minimum policy fields:

```yaml
DelegationPolicy:
  can_delegate: boolean
  allowed_target_types: [assistant, task_agent, workflow, external_agent]
  allowed_team_ids: [uuid]
  max_depth: integer
  max_fanout_per_step: integer
  max_open_delegations: integer
  max_total_delegations_per_goal: integer
  max_child_budget: Money|null
  require_reason: boolean
  disallow_same_goal_cycles: boolean
  duplicate_work_detection: boolean
```

Default platform policy SHOULD reject delegation cycles.

---

# 22. Delegation cycle and storm prevention

Before creating a child delegation, the platform SHALL evaluate ancestry.

It MUST reject or require exceptional approval for:

- A → B → A cycles;
- repeated semantically equivalent delegations without new evidence;
- fan-out exceeding policy;
- recursive specialist spawning with no measurable completion progress;
- multiple Assistants simultaneously mutating the same exclusive resource without a coordination primitive.

The Workboard MUST make delegation depth visible.

---

# 23. Budget and credit control

Assistant autonomy MUST be budget-bounded.

Budget MAY include:

```text
credits
currency spend
token allowance
provider calls
GPU/runtime time
computer-use minutes
external API quota
parallelism
```

Budget resolution precedence SHOULD be:

```text
explicit task grant
  ≤ Assistant policy
  ≤ Team policy
  ≤ Project/Tenant policy
  ≤ User/account economic limits
```

A child delegation cannot receive more authority or budget than its parent can lawfully grant.

For open-ended creation/development work, exact cost is generally unknowable before planning and implementation. SmartAIHub therefore SHALL distinguish:

```text
Estimate Range      = forecast, not a promise
Budget Envelope     = user-authorized maximum for the current scope
Reservation         = temporarily held capacity/credits
Actual Usage        = metered economic events
Settlement          = amount actually charged
Release             = unused reservation returned
```

Before a materially billable build begins, the user SHOULD be shown at minimum:

- estimated range;
- confidence/uncertainty where available;
- recommended maximum budget;
- current available balance;
- whether the available balance covers the recommendation;
- expected charging source for each major class (`SmartAIHub credits`, `user-owned subscription/quota`, `included`, or another configured source);
- statement that spend will not exceed the authorized envelope without a new approval.

When a user elects to execute through a user-owned Codex/Claude/Hermes-class subscription or other harness quota, SmartAIHub MUST attribute that execution to the user-owned entitlement and MUST NOT charge an equivalent SmartAIHub provider-model fee unless a separately disclosed platform/runtime charge applies.

Development, hosting and post-deployment runtime usage MUST be displayed as separate economic categories.

---

# 24. Capability resolution

Assistant identity MUST remain stable while capabilities/providers change.

Example:

```text
Video Professional Assistant
       ↓ needs capability
video.product.create
       ↓
Capability Resolver
       ↓
Skill / Film Studio / Media Studio / external video provider / Task Agent
       ↓
Runtime Resolver
```

Assistant profiles SHOULD declare requirements and preferences, not hard-code provider names unless the user explicitly requests/provider-locks them.

---

# 25. Model routing

AssistantProfile MAY declare model preferences/constraints, but canonical model routing remains owned by the LLM routing layer.

Role names such as `Graphics Designer` or `CEO` MUST NOT imply a specific model.

Model selection MAY vary per step while Assistant identity remains stable.

---

# 26. Runtime placement

Execution MAY be placed across:

```text
Cloudflare Worker
Cloudflare Workflow
Cloudflare Container/Sandbox
SmartAIHub Rust Runner
PC/Mac local Runner
provider-managed runtime
external agent harness
browser/computer runtime
```

Spec 269 only expresses user/Assistant placement constraints and consumes the existing placement/execution mechanisms. It does not create a second low-level placement engine.

R2 distinguishes **optimization** from **authorization**. A resolver MAY optimize only inside the placement set authorized by `DevelopmentStrategy` / task policy.

Example:

```yaml
execution_policy:
  selected_executor: local_codex
  placement_mode: LOCAL_ONLY
  fallback_policy: DENY
```

If that executor becomes unavailable, the task MUST enter an explicit waiting/blocking state. Cloud execution is prohibited until the user or an already-authorized policy changes the envelope.

Conversely, a tablet-only user who has not selected a local-only constraint MAY execute the full development lifecycle in approved cloud runtimes.

---

# 27. Provider bindings

Logical model:

```yaml
AssistantProviderBinding:
  id: uuid
  assistant_id: uuid
  provider_type: smartaihub_native|managed_agent|external_harness|model|computer
  provider_name: string
  external_identity: string|null
  binding_mode: preferred|fallback|exclusive|attached
  capability_subset: [CapabilityRef]
  credential_binding_ref: string|null
  data_egress_policy_ref: string|null
  active: boolean
```

Binding MUST support revoke/rotate/disable without deleting Assistant identity.

---

# 28. Memory integration — Spec 268

Spec 268 remains authoritative.

An Assistant MAY reference:

- its private Assistant memory space;
- project memory;
- Team shared memory;
- tenant-authorized memory;
- current session memory;
- procedural execution memory.

An Assistant MUST NOT infer memory access merely because it belongs to a team.

Team memory sharing requires explicit authorized memory spaces.

Provider-native memory SHOULD be treated as a cache/adapter capability unless explicitly certified as a synchronized projection of canonical SmartAIHub memory.

---

# 29. Knowledge and evidence integration — Spec 266

Assistants MAY request knowledge/evidence using authorized source scopes.

Persistent role does not grant universal data access.

For research/factual outputs, the delegation/completion contract MAY require:

- minimum evidence count;
- source class requirements;
- freshness requirements;
- contradiction handling;
- provenance references;
- rights/usage restrictions.

---

# 30. Skill-first integration — Spec 256 (IMPLEMENTED / CONSUME ONLY)

Spec 256 is already implemented and remains authoritative for reusable Skills/capability discovery and intent/capability routing.

Before spawning another Assistant/Agent or generating new software, the system SHOULD consume the implemented Spec 256 path to determine whether registered Skills/capabilities already satisfy the goal.

A Specialist becomes valuable through a combination of:

```text
Assistant responsibility/context
+ Skills
+ Capabilities
+ Memory
+ Knowledge
+ Authority
+ Tools
```

not through an excessively long persona prompt.

Spec 269 R2 MUST NOT require changes to Spec 256. Where product-planning decisions need metadata not present in the implemented capability contract, Spec 269 SHALL maintain a derived `CapabilityPlanningProjection` or adapter-side metadata without changing Spec 256 ownership.

---

# 31. Teach-by-demonstration → Skill

Spec 269 requires a product path to acquire Skills from demonstrated work.

Canonical flow:

```text
User starts Teach mode
  ↓
User performs actions
  ↓
Capture semantic actions + observations + inputs/outputs
  ↓
Normalize into Skill candidate
  ↓
Infer parameters / preconditions / side effects / failure handling
  ↓
User or policy reviews
  ↓
Skill validation sandbox
  ↓
Register under Spec 256
  ↓
Available to authorized Assistants
```

Captured raw coordinates MUST NOT be treated as the preferred reusable abstraction when semantic DOM/accessibility/API actions are available.

A taught Skill MUST declare:

- inputs/outputs;
- required capabilities;
- side effects;
- approvals;
- secrets/credentials;
- environment assumptions;
- failure recovery;
- verification method;
- supported application/site versions when relevant.

---

# 32. Learning from successful work

After successful repeated execution, the platform MAY propose:

```text
successful task trace
  → reusable procedure candidate
  → user/admin review where required
  → Skill candidate
```

The system MUST NOT silently convert every execution trace into an executable Skill.

Learning records belong to Spec 268 procedural memory; Skill publication belongs to Spec 256.

---

# 33. Attention Inbox

SmartAIHub SHALL provide one cross-Assistant human-attention surface.

Canonical attention types:

```text
APPROVAL
DECISION
QUESTION
TAKEOVER
CREDENTIAL_REQUIRED
BUDGET_EXTENSION
CONFLICT
POLICY_EXCEPTION
FAILURE_REQUIRING_USER
```

Each item MUST identify:

- owning goal/task;
- requesting Assistant;
- requested action;
- why human involvement is needed;
- consequences of approve/deny/no response;
- deadline/time sensitivity where applicable;
- recommended option when allowed, clearly marked as recommendation not hidden execution.

---

# 34. Attention aggregation

Primary MAY aggregate multiple low-level blockers into one decision card when they share the same decision.

Aggregation MUST preserve traceability to original items and MUST NOT widen approval scope.

Example:

```text
6 child tasks are blocked
but all depend on the same brand-color decision
→ show one decision to user
→ replay answer to all authorized waiting tasks
```

---

# 35. Assistant Workboard

Task Control SHALL expose Assistant work as a delegation graph/list/board.

Minimum fields:

```text
Owner
Delegator
Delegatee
Goal/task
State
Current step
Wait reason
Deadline
Cost/budget
Runtime/provider
Artifacts
Evidence
Verification status
Last progress
```

The Workboard MUST be canonical UI over durable task/delegation state, not an animation-only dashboard.

---

# 36. Visualization modes

The product MAY provide multiple views over the same canonical state:

```text
List
Kanban/Board
Dependency Graph
Timeline
Organization/Team View
Optional Office/3D View
```

An Office/3D visualization MUST remain a projection. It MUST NOT contain hidden execution state unavailable to Task Control.

---

# 37. Chat integration

Chat remains the primary user command surface.

The user SHOULD be able to:

- address Primary implicitly;
- `@` mention a Specialist explicitly;
- ask Primary to create/modify a team;
- inspect delegated work without leaving Chat;
- receive progress summaries;
- approve/deny attention items inline;
- switch context between Personal/Project/Team/Tenant scope;
- receive final artifacts and evidence in the originating thread.

The system MUST show which Assistant currently owns the response/work when materially relevant.

---

# 38. Goal planning UX

For complex goals, the system MAY present an editable Plan Card before execution.

Example:

```text
Goal: Launch Product A

☑ Market research      → Research Professional
☑ Positioning/pricing  → CEO Assistant
☑ Key visual           → Graphics Designer
☑ Product video        → Video Professional
☑ Launch copy          → Marketing Strategist

[Edit] [Approve]
```

Approval MAY be skipped when authority policy allows autonomous planning/execution.

A Plan Card is a user-facing projection; canonical goal/task/delegation records remain durable data.

---

# 39. Progress reporting

Primary SHOULD report progress based on state transitions or meaningful milestones, not every internal model step.

Suggested semantics:

```text
PLANNING
WORKING
WAITING
NEEDS_YOU
VERIFYING
DONE
FAILED
CANCELLED
```

Users SHOULD be able to expand details when desired.

---

# 40. Routine and proactive work

Assistants MAY own scheduled or event-triggered responsibilities.

Examples:

- morning business brief;
- weekly content plan;
- watch for new support tickets;
- inspect a folder/source event;
- monitor a provider job;
- follow up delegated work.

Routine activation MUST resolve the same AssistantProfile and policy context as Chat activation.

It MUST NOT create an unrelated identity every run.

---

# 41. Scheduled activation → original Chat continuation

Where a scheduled/event activation belongs to an existing user goal/thread, the result SHOULD return to that originating context.

A scheduled Assistant MUST know:

- activation reason;
- scope;
- goal/task link;
- memory/context references;
- authority/budget;
- return destination.

---

# 42. Trigger safety modes

Event triggers SHALL support an explicit execution mode, including `OBSERVE_ONLY`.

A watch-only trigger can inspect and recommend without silently mutating external systems.

This is especially useful for:

- financial events;
- inbox/file watches;
- new external data;
- security signals;
- public/news monitoring;
- production health events.

---

# 43. Independent verification assistant

A verification task MAY be assigned to:

- another persistent Specialist;
- a fresh ephemeral Task Agent;
- a deterministic validator;
- Spec 266 evidence verification;
- a human reviewer.

The verifier SHALL receive the assertion/artifact plus required evidence scope, not hidden chain-of-thought.

---

# 44. Assistant Teams and hierarchy

Teams MAY use hierarchy, but hierarchy MUST be functional rather than decorative.

Example:

```text
Personal Primary / Chief of Staff
      ↓
CEO Assistant
      ↓
Marketing Lead
  ├─ Graphics Designer
  ├─ Video Professional
  └─ Copywriter
```

Each edge MUST correspond to a permitted delegation relationship.

---

# 45. Dynamic team formation

Primary MAY form an ephemeral **Task Team** for one complex goal without creating permanent Assistant profiles for every temporary role.

Rules:

- reuse existing persistent specialists when appropriate;
- spawn ephemeral Task Agents for temporary roles;
- create a new persistent Specialist only when stable ongoing responsibility exists and policy permits;
- archive task-team membership at goal completion while retaining audit/evidence.

---

# 46. Team shared context

A team MAY share:

- explicit Team memory spaces from Spec 268;
- knowledge scopes from Spec 266;
- project artifacts;
- goal/task state;
- authorized Skill/capability catalogs.

Private Assistant memory MUST not be copied into Team shared context by default.

---

# 47. Concurrency and shared-resource mutation

When multiple Assistants operate in parallel, shared mutable resources MUST use an appropriate coordination mechanism.

Examples:

- Git branches/worktrees and merge protocol;
- document edit leases/version checks;
- database transactional constraints;
- artifact versioning;
- deployment locks;
- idempotency keys;
- economic reservation/settlement.

Assistant hierarchy does not replace technical concurrency control.

---

# 48. Failure and recovery

Assistants SHALL distinguish:

```text
TRANSIENT_FAILURE
CAPABILITY_UNAVAILABLE
PROVIDER_UNAVAILABLE
AUTH_REQUIRED
POLICY_BLOCKED
BUDGET_EXCEEDED
DEPENDENCY_FAILED
VERIFICATION_FAILED
NON_RECOVERABLE_FAILURE
```

Recovery MAY include:

- retry/backoff;
- alternate capability/provider;
- alternate runtime;
- replan;
- delegate to another Assistant;
- request human takeover;
- reduce scope with user approval;
- fail with explicit evidence.

Silent abandonment is prohibited.

---

# 49. Runtime/provider fallback

Fallback is policy-controlled, not automatic by definition.

Fallback MUST preserve:

- Assistant identity;
- goal/task/delegation IDs;
- authority ceiling;
- data-egress policy;
- budget ceiling;
- completion criteria;
- audit trail.

Fallback MUST NOT silently send restricted data to a new provider.

Fallback MUST NOT silently change a user-selected execution funding source or subscription path.

Supported policy semantics SHALL include at least:

```text
DENY                    never switch automatically
ASK_BEFORE_SWITCH       create Attention item before switching
ALLOW_WITHIN_POLICY     switch only to explicitly authorized alternatives
AUTO_OPTIMIZE           resolver may optimize within declared constraints
```

Selecting a concrete local harness SHOULD default to `DENY` or `ASK_BEFORE_SWITCH` unless the user explicitly enables automatic alternatives.

---

# 50. Human takeover

A runtime MAY request human takeover for conditions such as:

- CAPTCHA;
- interactive login/passkey;
- unavailable credential;
- ambiguous irreversible decision;
- UI state the automation cannot safely resolve.

Takeover MUST suspend the relevant action scope without losing the goal.

After takeover, the user can resume the same task.

---

# 51. Credentials and secrets

Assistants store credential references, not plaintext secrets in profile/persona/memory.

Credential access SHALL be capability- and destination-scoped.

Delegation MUST NOT widen credential scope merely because a child actor was selected.

---

# 52. Data egress

Every provider/runtime binding SHALL respect data-egress policy.

Before sending data externally, the system MUST evaluate:

- data classification;
- provider destination;
- jurisdiction/tenant restrictions;
- user policy;
- provider binding permissions;
- requested capability need.

External-agent delegation MUST fail closed if required trust/egress policy cannot be established.

---

# 53. Multi-tenant isolation

Every AssistantProfile, Team, delegation and policy MUST be tenant-scoped.

Cross-tenant delegation is prohibited unless a future explicit inter-tenant collaboration protocol authorizes it.

White-label/custom-domain tenants may define their own templates and policies while using the same canonical Assistant runtime contracts.

---

# 54. Assistant Marketplace and templates

Future marketplace support MAY publish:

- Assistant templates;
- Team templates;
- Skill bundles;
- policy presets;
- SPAAS applications associated with Assistants.

Marketplace install MUST create SmartAIHub-owned profile/template materializations, not grant the publisher runtime ownership over the user's Assistant.

Permissions, secrets and provider bindings MUST be reviewed on install/update.

---

# 55. Mini App integration

A Mini App MAY declare:

- recommended/required Assistant roles;
- capability requirements;
- optional Team template;
- app-specific memory scopes;
- app-specific authority defaults.

The Mini App MUST NOT create unrestricted persistent Assistants without user/tenant policy approval.

R2 adds a **reuse-first productization rule**. Before a new Mini App is created, the Solution Strategy Resolver SHALL test whether the goal can be satisfied by:

```text
1. existing function/Skill/capability
2. composition of existing capabilities
3. save/compose a reusable Workflow or Automation
4. customization/fork of an existing Mini App/product
5. reusable Mini App creation
6. custom application creation
```

The resolver MUST NOT force the cheapest option when the user explicitly requires future source-level customization, ownership, reusable deployment or independent product evolution. The user SHALL be able to intentionally choose a more customizable productization level.

Work MAY be progressively promoted without discarding earlier artifacts:

```text
ad-hoc result
→ reusable workflow/workspace
→ Mini App
→ custom application
→ dedicated deployment
```

---

# 56. SPAAS integration — Spec 261

SPAAS SHOULD support declarative resources or extension points for:

```text
assistantProfileTemplates
assistantTeamTemplates
assistantCapabilityRequirements
assistantPolicyRequirements
assistantBindings
```

Spec 261 continues to own package identity, lifecycle, portability, install/provision/bind/attach and state export/import.

Spec 269 owns the runtime meaning of Assistant objects.

---

# 57. External personal agents — Spec 239

Spec 239 adapters SHOULD expose normalized operations where provider capabilities permit:

```text
create/bind external agent
send delegated goal
receive progress
receive result
cancel
resume
request approval/takeover
discover capabilities
sync provider status
```

A provider that cannot guarantee a contract MUST declare partial support rather than simulate full compliance.

---

# 58. Development Orchestrator — Spec 224 (IMPLEMENTED / CONSUME ONLY)

Spec 224 is already implemented and remains the owner of autonomous software-development lifecycle and Final Verify.

A `Software Engineer Assistant` MAY delegate implementation work into an existing Spec 224 DevelopmentRun path through a Spec 269-owned compatibility adapter/orchestration call site.

Relationship:

```text
Software Engineer Assistant = persistent role / user-facing responsibility
Spec 269 DevelopmentWorkspace = durable project-level continuation envelope
Spec 224 DevelopmentRun      = implemented specialized development execution lifecycle
```

Spec 269 MUST NOT reimplement the development state machine and MUST NOT require a modification to Spec 224 to implement R2.

Project-level continuation data introduced by R2 SHALL reference Spec 224 run/evidence identifiers rather than duplicating Spec 224 internal states. If a correlation field cannot be injected into the implemented Spec 224 contract, Spec 269 SHALL store that correlation externally.

---

# 59. Durable Job Plane — Feature 186/195 and Spec 267

Assistant goals/delegations are control/product semantics above durable execution.

Execution records SHALL reference canonical `worker_jobs`/events or approved future equivalents.

Cloudflare Queues/Workflows/Containers remain transport/execution mechanisms under Spec 267, not Assistant source of truth.

---

# 60. Observability

The platform SHOULD expose metrics including:

- active Assistants;
- active goals per Assistant;
- delegation count/fanout/depth;
- completion time by role/capability;
- waiting time by reason;
- human-attention frequency;
- autonomous completion rate;
- verification failure/rework rate;
- provider fallback rate;
- cost by Assistant/Team/goal;
- duplicate-delegation suppression;
- continuation resume success;
- task abandonment count (target: zero unexplained).

---

# 61. Audit events

At minimum, emit durable audit events for:

```text
assistant.created
assistant.updated
assistant.activated
assistant.suspended
assistant.archived
assistant.primary_bound
assistant.primary_unbound
team.created
team.member_added
team.member_removed
goal.accepted
delegation.created
delegation.accepted
delegation.started
delegation.waiting
delegation.resumed
delegation.completed
delegation.failed
delegation.cancelled
continuation.created
continuation.resumed
attention.created
attention.resolved
authority.granted
authority.denied
budget.reserved
budget.exhausted
verification.started
verification.passed
verification.failed
provider.fallback
human.takeover_requested
human.takeover_resumed
skill.taught_candidate_created
```

---

# 62. Suggested database tables

Implementation SHOULD reuse existing account/tenant/job/task/policy tables where appropriate. New logical tables may include:

```text
assistant_profiles
primary_assistant_bindings
assistant_teams
assistant_team_memberships
assistant_authority_policies
assistant_delegation_policies
assistant_runtime_policies
assistant_verification_policies
assistant_budget_policies
assistant_provider_bindings
assistant_goals                only if no existing canonical Goal table fits
assistant_delegations
assistant_continuations
assistant_attention_items      or projection into existing approval/control inbox
assistant_completion_contracts
assistant_completion_evidence
assistant_templates
assistant_team_templates
```

Do not create duplicate tables if an existing canonical table can be extended safely.

---

# 63. Suggested SQL invariants

Recommended constraints:

```text
one active primary binding per (principal/scope_type/scope_id)
active primary must reference active assistant
team membership tenant_id must match team and assistant tenant
reports_to must be another active member of same team or null
self-reporting hierarchy forbidden
self-delegation allowed only when converted to internal task, not a delegation edge
completed delegation requires terminal result/evidence reference where policy requires
child authority ceiling <= parent grant
child budget ceiling <= parent grant
continuation dedupe_key unique within active goal scope
```

---

# 64. Service interfaces

Suggested internal services:

```text
AssistantProfileService
PrimaryAssistantResolver
AssistantTeamService
AssistantGoalService / adapter to existing Goal service
DelegationService
AssistantContinuationService
AssistantAuthorityService
AssistantCapabilityResolver adapter
AssistantVerificationService
AssistantAttentionService
AssistantTemplateService
AssistantProviderBindingService
AssistantWorkboardProjectionService
TeachSkillCaptureService
```

Services MUST preserve existing authority boundaries.

---

# 65. API surface

Illustrative API endpoints; actual transport may be REST/tRPC/RPC according to existing conventions.

```text
POST   /assistants
GET    /assistants
GET    /assistants/:id
PATCH  /assistants/:id
POST   /assistants/:id/activate
POST   /assistants/:id/suspend
POST   /assistants/:id/archive

PUT    /primary-assistant-bindings/:scope
DELETE /primary-assistant-bindings/:scope
GET    /primary-assistant/resolve

POST   /assistant-teams
PATCH  /assistant-teams/:id
POST   /assistant-teams/:id/members
DELETE /assistant-teams/:id/members/:assistantId

POST   /assistant-goals
GET    /assistant-goals/:id
POST   /assistant-goals/:id/cancel

POST   /assistant-delegations
GET    /assistant-delegations/:id
POST   /assistant-delegations/:id/cancel

GET    /assistant-attention
POST   /assistant-attention/:id/resolve

GET    /assistant-workboard
```

---

# 66. Chat command semantics

Examples the platform SHOULD support naturally:

```text
"ตั้ง Jarvis เป็นผู้ช่วยหลักของโปรเจกต์นี้"
"สร้างผู้ช่วย Video Professional ให้ทีมนี้"
"ให้ทีมช่วยเปิดตัวสินค้าใหม่นี้ให้พร้อมใช้"
"งานนี้ไม่ต้องถามผมเรื่องการสร้าง draft แต่ก่อน publish ให้ถาม"
"ให้ Graphics กับ Video ทำคู่ขนานกัน"
"ถ้าฝ่าย Research ยังไม่เสร็จใน 2 ชั่วโมง ให้ตามเอง"
"แสดงงานที่กำลังติดและเรื่องที่ต้องให้ฉันตัดสินใจ"
"สอนขั้นตอนนี้ให้ผู้ช่วยทำเองครั้งหน้า"
```

Natural language commands MUST resolve into typed mutations/policies and should present confirmation when authority is materially widened.

---

# 67. Primary Assistant UX

Primary Assistant settings SHOULD show:

- identity/avatar/title;
- current Primary scopes;
- responsibilities;
- autonomy mode;
- budget;
- attached Team(s);
- Skills/capabilities;
- memory/knowledge scopes;
- provider/runtime preferences;
- current goals;
- recent delegated work;
- attention requests;
- audit history.

Primary status SHOULD be visually clear but not imply that the Assistant is more privileged than policy permits.

---

# 68. Specialist Assistant UX

Specialist page SHOULD emphasize:

```text
What I am responsible for
What I can do
What I cannot do
What I may do without asking
What always requires approval
Which Team(s) I belong to
What knowledge/memory I can access
What jobs I own now
What I delivered recently
```

Avoid exposing low-level model/provider settings by default unless advanced mode is opened.

---

# 69. Team UX

Team page SHOULD provide:

- lead;
- members/roles;
- reporting/delegation lines;
- shared memory/knowledge scopes;
- shared budget;
- current goals;
- Workboard;
- team-level attention items;
- Team templates;
- optional visualization modes.

---

# 70. Mobile/tablet requirements

Core workflows MUST be usable on mobile/tablet without requiring a desktop-style multi-pane view.

Priority mobile actions:

- issue goal by text/voice;
- inspect concise plan;
- approve/deny attention items;
- see current work and blockers;
- open result/artifact;
- talk to Primary or a Specialist;
- pause/cancel goal;
- switch project/team scope.

A 3D Office MUST NOT be required for core operation.

---

# 71. Notifications

Notifications SHOULD be emitted for meaningful attention events, completion and policy-defined milestones.

They SHOULD deep-link to the originating Chat/Task/attention item.

Avoid notifying for every internal delegation/tool call.

---

# 72. Explainability

When a user asks why a Specialist was selected, the platform SHOULD provide concise operational reasons such as:

```text
Selected Video Professional because:
- task requires video.product.create + timeline.edit
- this Assistant owns video-production responsibility for Project A
- it has access to the project's brand/video knowledge scope
- current budget and runtime policy permit execution
```

Do not expose hidden chain-of-thought.

---

# 73. Role and capability mismatch

If a role exists but lacks required capability, the resolver MAY:

- use another authorized capability/provider;
- spawn a Task Agent;
- delegate to another Specialist;
- request installation/binding of a capability;
- fail with a clear blocker.

Role title alone MUST NOT fake capability availability.

---

# 74. Assistant replacement and transfer

Users MAY change Primary without losing unrelated Team/specialist identities.

Open goals require explicit handling:

```text
keep with old Assistant until completion
transfer ownership
cancel
```

Ownership transfer MUST preserve audit and authority checks.

---

# 75. Assistant suspension during active work

On suspension:

- new work is rejected;
- scheduled activations are blocked;
- open tasks follow policy: allow-to-finish, pause, transfer, cancel;
- active external provider bindings may remain attached but cannot be newly invoked;
- Attention Inbox receives unresolved decisions if needed.

---

# 76. Deletion and retention

Assistant deletion MUST respect:

- audit retention;
- financial records;
- job evidence;
- legal/tenant retention;
- memory deletion/forget semantics from Spec 268;
- provider resource ownership rules from Spec 261/239.

Deleting an Assistant MUST NOT automatically delete user-owned external agents/computers unless ownership policy explicitly says so.

---

# 77. Security threat model

Implementation MUST address at least:

- prompt injection causing unauthorized delegation;
- role title privilege escalation;
- child delegation authority amplification;
- recursive delegation storms;
- cross-tenant data leakage;
- provider binding spoofing;
- malicious Skill side effects;
- hidden data egress;
- approval replay;
- stale approval after plan mutation;
- budget race conditions;
- compromised external bot returning forged completion;
- artifact substitution;
- takeover session hijack;
- memory poisoning;
- Team shared-memory oversharing.

---

# 78. Approval validity and mutation

If a plan/delegation materially changes after approval, the previous approval MUST NOT automatically cover new actions outside the approved envelope.

Approval envelope SHOULD capture:

- objective;
- side-effect classes;
- destinations;
- max spend;
- data scope;
- deadline/expiry;
- capability set;
- artifacts/resources affected.

---

# 79. Idempotency

Goal acceptance, delegation creation, attention resolution and continuation resume MUST be idempotent.

External side effects MUST use provider-supported idempotency or SmartAIHub dedupe/settlement strategies where possible.

---

# 80. Cancellation

Cancellation SHALL propagate through the delegation tree subject to safe-cleanup rules.

The system MUST distinguish:

```text
cancel requested
cancel acknowledged
non-cancellable external operation already committed
cleanup/reconciliation pending
cancelled terminal
```

---

# 81. Timeout and stale work

Every delegation SHOULD have explicit or inherited timeout/staleness policy.

A watchdog/reconciler MUST surface work that is:

- running without heartbeat beyond threshold;
- waiting past timeout;
- provider job completed but callback missing;
- child completed but parent not resumed;
- approval resolved but continuation not resumed;
- terminal job with missing Assistant projection update.

---

# 82. Reconciliation

Spec 269 SHALL include an Assistant-level reconciler that projects/reconciles from canonical job/task/provider state without becoming job authority.

Example repairs:

```text
worker job completed + delegation still RUNNING
→ verify evidence
→ move delegation to VERIFYING/COMPLETED

provider job terminal + callback lost
→ provider reconciliation detects terminal state
→ resume continuation
```

---

# 83. Cost-aware delegation

The resolver SHOULD prefer the least complex execution structure that meets quality/safety requirements.

Cost model MAY incorporate:

- inference cost;
- runtime/computer-use cost;
- latency;
- opportunity cost of scarce provider capacity;
- verification cost;
- expected failure/retry cost.

This helps prevent unnecessary multi-agent expansion.

---

# 84. Parallel execution

Parallel delegation MAY be used when tasks are independent or coordination-safe.

Parent SHALL define join semantics:

```text
ALL
ANY_SUCCESS
QUORUM
FIRST_VALIDATED
CUSTOM
```

Failure of one child MUST be handled according to join/goal policy rather than automatically failing all work.

---

# 85. Conflict resolution between specialists

When Specialists return incompatible recommendations/results, Primary SHALL not silently average them.

It MAY:

- request evidence comparison;
- ask an independent verifier;
- apply deterministic business rule;
- choose under explicit policy;
- escalate a decision to user.

The conflicting outputs and resolution rationale SHOULD remain auditable.

---

# 86. Autonomous completion and user interruption

Users MUST be able to interrupt, pause, redirect or cancel ongoing work where operationally possible.

A user message that changes the goal MUST create a versioned plan/goal revision rather than silently mutating completed evidence/history.

---

# 87. Primary proactive behavior

Primary MAY act proactively only from authorized triggers/responsibilities.

It MUST NOT invent open-ended work merely to remain active.

Proactive activation examples:

- scheduled responsibility;
- event subscription;
- overdue delegated task;
- provider completion;
- policy-defined project milestone;
- explicit monitoring watch.

---

# 88. Completion reporting

A final report SHOULD include:

```text
Outcome
What was done
Key artifacts/results
Important decisions/assumptions
Verification status
Outstanding limitations
Cost/usage summary when relevant
```

If completion is partial, the report MUST say so explicitly.

---

# 89. Implementation phases

## Phase A — Canonical data and binding

Implement:

- AssistantProfile;
- PrimaryAssistantBinding;
- AssistantTeam/Membership;
- Authority/Delegation/Runtime/Verification policy references;
- basic UI roster and Make Primary;
- tenant/scope isolation.

Exit gate: Primary resolves deterministically for Personal/Project/Team/Tenant and no legacy/fallback path can create two active Primary authorities for the same scope.

## Phase B — Delegation and Workboard

Implement:

- typed DelegationContract;
- Assistant delegation state projection;
- Workboard;
- Attention Inbox linkage;
- delegation budget/depth/cycle guards;
- result return.

Exit gate: complex goal can be delegated to 2+ Specialists and parent receives durable results after restart.

## Phase C — Durable continuation

Implement:

- continuation types;
- event/time/provider/delegation waits;
- resume dedupe;
- stale/reconciliation paths.

Exit gate: Assistant can wait hours/days and resume without a user reminder or app/browser remaining open.

## Phase D — Completion and verification

Implement:

- CompletionContract;
- evidence collection;
- independent/deterministic verification policies;
- rework loop.

Exit gate: `DONE` requires declared criteria/evidence, not free-form model claim.

## Phase E — Provider/runtime bindings

Integrate:

- SmartAIHub native agent;
- external harnesses;
- managed agents through Spec 239;
- dynamic runtime placement;
- provider fallback respecting egress/authority.

Exit gate: provider change does not change Assistant identity or lose task state.

## Phase F — Teach-by-demonstration and templates

Implement:

- teach capture;
- Skill candidate validation;
- starter role/team templates;
- AI-assisted Assistant creation.

## Phase G — Advanced organization UX

Implement:

- organization view;
- graph/timeline projections;
- optional visual office mode if product value warrants it.

---

# 90. Migration from existing agents/bots

Existing persistent agent-like objects SHOULD be classified:

```text
user-facing durable responsibility → migrate/map to AssistantProfile
execution-only durable runtime       → keep as Agent/Runtime binding
provider-managed persistent bot      → map through AssistantProviderBinding
one-off subagent                     → keep ephemeral
workflow                             → do not turn into Assistant
```

Migration MUST avoid converting every existing agent record into a user-visible Assistant.

---

# 91. Backward compatibility

Legacy Chat or Agent entry points MAY continue while Spec 269 is staged, but new Assistant identity and delegation state MUST converge to one authority.

Do not maintain two independent Primary Assistant systems.

---

# 92. Reference pattern from BotTeam / Rakazo demo

The reviewed `jaturapornchai/mybotdemo01` demonstration validates several useful product patterns:

- CEO-like lead delegates via bot-to-bot messaging;
- specialist roles own domain work;
- a central work center shows handoffs and waiting items;
- follow-up can be scheduled by the bot;
- a spoken/typed messy plan can be decomposed into assigned tasks;
- an independent bot can verify results;
- event triggers can operate in watch-only mode;
- teach-by-demonstration can become a reusable Skill;
- a visual office can project live agent events.

SmartAIHub SHALL adopt the useful semantics while avoiding the demo's limitations:

- Primary selection by hard-coded name;
- prompt-only authority enforcement;
- global rather than per-Assistant policy;
- fixed bot roster;
- app-open-dependent triggers;
- runtime-per-bot coupling;
- model/provider identity coupling;
- 3D UI as a substitute for canonical task state.

This section is informative, not normative dependency.

---

# 93. Initial acceptance test suite

Implementation MUST include automated/integration tests covering at least the following.

## Identity / Primary binding

1. Create AssistantProfile in DRAFT.
2. DRAFT cannot be Primary.
3. Activate then bind as Personal Primary.
4. Bind Project Primary without changing Personal Primary.
5. Explicit Assistant selection overrides default resolution for that command only.
6. Suspending Primary triggers deterministic fallback.
7. Archived Assistant cannot receive new Primary binding.
8. Cross-tenant Primary binding is rejected.
9. Make Primary updates binding without cloning Assistant.
10. Two active Primaries for the same exact scope are prevented transactionally.

## Teams

11. Create Team and add Specialists.
12. reports_to must reference same Team.
13. self-reporting is rejected.
14. shared memory requires explicit memory space grant.
15. private Assistant memory is not exposed by Team membership.
16. suspended member cannot receive new work.
17. Team lead can be changed without cloning Team.
18. Team archive prevents new team delegation.

## Delegation

19. Primary delegates to Specialist via typed contract.
20. Specialist accepts and completes with result schema.
21. Parent restart does not lose child result.
22. child failure is visible and reconciled.
23. delegation cycle A→B→A is rejected.
24. max depth is enforced.
25. max fanout is enforced.
26. child cannot receive authority wider than parent.
27. child cannot receive budget wider than parent.
28. duplicate semantic delegation is detected according to policy.
29. delegation cancellation propagates.
30. provider-managed delegate maps result back to same contract.

## Continuation

31. WAIT_UNTIL_TIME resumes once.
32. duplicate scheduler delivery does not resume twice.
33. WAIT_FOR_DELEGATION_RESULT resumes parent after child terminal state.
34. WAIT_FOR_PROVIDER_JOB survives process restart.
35. WAIT_FOR_APPROVAL resumes with approved envelope.
36. expired approval does not execute.
37. resolved approval after plan mutation is revalidated.
38. stale continuation is surfaced by reconciler.
39. cancelled goal cancels pending continuations.
40. app/browser closure does not prevent durable resume.

## Authority / safety

41. OBSERVE_ONLY cannot write external/internal canonical state except allowed observation logs.
42. RECOMMEND_ONLY cannot send/publish.
43. DRAFT_ONLY can create draft but cannot publish.
44. publish action requires configured approval.
45. bounded autonomous action stops at budget ceiling.
46. external data transfer is blocked by egress policy.
47. credential scope cannot widen through delegation.
48. role title cannot grant capability.
49. prompt injection cannot override typed authority policy.
50. cross-tenant delegation is rejected.

## Completion / verification

51. model saying "done" without required artifact does not complete.
52. deterministic validator failure returns to rework.
53. independent verifier can reject result.
54. factual verification can require Spec 266 evidence refs.
55. completion evidence remains linked after provider fallback.
56. partial completion is not represented as full success.
57. required output format mismatch prevents completion.
58. timeout reaches explicit terminal/attention state, never silent loss.

## Capability / runtime

59. Specialist can use direct Skill without spawning another Assistant.
60. complex task can spawn ephemeral Task Agent without roster pollution.
61. Task Agent termination retains durable result evidence.
62. model can change mid-goal without changing Assistant identity.
63. runtime can move from cloud to local when authorized.
64. fallback to external provider is blocked if egress policy forbids it.
65. provider outage triggers allowed alternate or explicit blocker.
66. provider binding revoke prevents new calls immediately according to revocation policy.

## Workboard / Attention

67. every active delegation appears on Workboard.
68. wait reason is visible.
69. user attention item deep-links to originating goal/task.
70. one decision can aggregate multiple compatible blockers.
71. aggregated approval does not widen scope.
72. user can pause/cancel from Chat/Task Control.
73. final result returns to originating Chat.

## Teach-by-demonstration

74. semantic web action is preferred over raw coordinate where available.
75. captured Skill candidate declares side effects.
76. Skill candidate cannot publish without validation/policy.
77. secret values are not embedded in learned Skill.
78. repeated successful procedure can be proposed, not silently auto-published.

## Reliability / reconciliation

79. worker job terminal + stale delegation projection is repaired.
80. child complete + parent not resumed is repaired.
81. provider callback loss can be reconciled by polling/query when supported.
82. duplicate external callback is idempotent.
83. Assistant suspension with active work follows configured policy.
84. ownership transfer preserves audit trail.
85. deletion/archive does not erase required economic/audit evidence.

---

# 94. Initial performance/SLO targets

Targets are implementation goals subject to measurement and production tuning:

- Primary resolution p95 < 100 ms excluding remote policy/provider calls.
- Workboard state freshness < 5 s for active work where event transport is healthy.
- Attention item creation after blocking event < 5 s.
- Continuation resume dispatch after condition observed < 60 s unless schedule/policy defines a wider window.
- No unexplained accepted-goal disappearance.
- Delegation/task terminal reconciliation completes within bounded watchdog interval.

---

# 95. Implementation stop conditions

Implementation MUST stop/fail closed at a boundary rather than invent behavior when:

- no authorized Primary/fallback can be resolved;
- provider trust/egress cannot be established;
- required capability does not exist;
- budget reservation fails;
- approval envelope is missing/expired for required side effect;
- credential binding is unavailable;
- completion criteria are impossible/contradictory;
- required evidence source is unauthorized;
- requested cross-tenant delegation lacks explicit protocol authority.

---

# 96. Cross-spec normative integration requirements

## Spec 196 / Assistant Runtime

Treat Spec 269 AssistantProfile/Primary/Team/Delegation as the user-facing identity and responsibility layer. Existing Goal/Agent runtime remains execution semantics; do not create another runtime state machine.

## Spec 224 — IMPLEMENTED / READ ONLY

Consume the existing Spec 224 development lifecycle and Final Verify behavior through a Spec 269-owned adapter/correlation layer. **No Spec 224 modification is required or authorized by Spec 269 R2.** Project-level checkpoint/continuation data SHALL reference Spec 224 state/evidence rather than duplicating its development state machine.

## Spec 239

Normalize managed external personal agents as provider bindings/delegates. External identity never silently replaces canonical AssistantProfile.

## Spec 256 — IMPLEMENTED / READ ONLY

Consume the implemented Skill-first capability and intent-routing interfaces. **No Spec 256 modification is required or authorized by Spec 269 R2.** Any additional planning metadata SHALL live in a Spec 269-owned projection/adapter. Teach-by-demonstration, where not already supported by Spec 256, remains a Spec 269 candidate workflow until a separately approved extension is available.

## Spec 261

SPAAS SHALL be able to package/declare Assistant and Team templates and their capability/policy requirements without taking ownership of Assistant runtime semantics.

## Spec 266

Expose evidence/provenance interfaces for CompletionContract and verification. Do not store Assistant memory as Knowledge by default.

## Spec 268

Expose authorized Assistant private memory, Team shared memory, Project memory and procedural execution memory. Do not make Spec 269 a second memory store.

## Spec 267 / Feature 186 / Feature 195

Provide durable execution/event projection and reconciliation interfaces. Queue/worker transport remains separate from Assistant semantics.

---

# 97. Non-goals

Spec 269 does not require:

- every user to create many Assistants;
- a 3D office;
- every task to use multi-agent execution;
- a fixed corporate org chart;
- a specific LLM;
- a specific provider;
- dedicated computer per Assistant;
- Grok/Dots/Muse to be installed;
- replacement of existing workflow/development/job runtimes;
- hidden autonomous publishing/spending;
- exposing internal chain-of-thought.

A user may have only one Primary Assistant and still use the platform effectively.

---

# 98. Product principle

The final product behavior should feel like:

> The user tells one trusted AI coworker what outcome is needed. That Assistant knows what it owns, uses a Skill directly when simple, delegates to persistent specialists when responsibility matters, creates temporary subagents only when useful, follows work through waits and failures, asks the user only when authority or judgment genuinely requires it, verifies the result, and returns the finished outcome in the original Chat.

The user SHOULD NOT need to understand which model, queue, container, MCP server or external harness was used unless they choose to inspect advanced details.

---

# 99. Inherited R1 twelve-pass gap review record

The R1.0 baseline was reviewed against twelve independent architecture lenses; R2 preserves those findings and adds a separate twelve-pass R2 review in Section 123.

| Pass | Lens | Gap checked / remediation |
|---:|---|---|
| 1 | Authority ownership | Prevented Primary Assistant from becoming a second orchestrator/job authority. |
| 2 | Identity/provider separation | Made Assistant stable while models/providers/runtimes can change. |
| 3 | Persistent vs ephemeral actors | Split Primary, Specialist and Task Agent to prevent roster explosion. |
| 4 | Delegation durability | Replaced chat-only handoff with typed durable DelegationContract. |
| 5 | Autonomous continuation | Added wait/event/provider/delegation/approval continuations rather than cron-only follow-up. |
| 6 | Completion truth | Added evidence-backed CompletionContract and verification. |
| 7 | Safety/autonomy | Added explicit authority modes, side-effect classes, budget and child authority ceilings. |
| 8 | Multi-agent efficiency | Added Skill-first selection, cost-aware delegation, depth/fanout/cycle/storm controls. |
| 9 | Memory/data boundaries | Kept Spec 268 memory and Spec 266 knowledge/evidence as separate authorities. |
| 10 | Provider interoperability | External bots/harnesses are bindings/delegates, not canonical identity. |
| 11 | UX/operations | Added Workboard, Attention Inbox, Chat continuation, mobile priority and optional visualization projection. |
| 12 | Reliability/migration | Added reconciliation, idempotency, cancellation, suspension, migration phases and cross-spec adapters. |

No gap identified in these inherited baseline passes required creating a second orchestration kernel.

---

# 100. Definition of Done for Spec 269 R2 implementation

Spec 269 can be considered implemented only when all of the following are demonstrated in an integration environment:

1. A user can create at least Primary, Graphics Designer and Video Professional Assistants from templates.
2. A Primary can be bound independently at Personal and Project scope.
3. A complex goal entered in Chat can be decomposed and delegated to at least two Specialists.
4. Delegated work survives service restart and resumes correctly.
5. At least one Specialist can self-follow-up after a durable wait without user prompting.
6. At least one action operates in OBSERVE_ONLY and is technically prevented from side effects.
7. At least one action requires approval and cannot bypass it via prompt injection.
8. At least one Task Agent is spawned and disappears from active roster after task completion while evidence remains durable.
9. Completion requires objective artifact/evidence checks.
10. Workboard shows live delegation state and blocker reason.
11. Attention Inbox aggregates approvals/questions across Assistants.
12. Provider/runtime can be changed for a step without changing Assistant identity.
13. Cross-tenant access tests fail closed.
14. Budget/delegation depth limits are enforced.
15. A taught demonstration can become a validated Skill candidate.
16. All acceptance tests in Section 93 applicable to implemented phases pass.
17. No new generic job source of truth, memory store, knowledge store or development lifecycle state machine has been introduced.

---

# 101. Recommended implementation priority

The highest-value sequence is:

```text
1. AssistantProfile + Primary binding
2. Specialist roster + Assistant Team
3. Typed DelegationContract
4. Workboard + Attention Inbox integration
5. Durable continuation/self-follow-up
6. CompletionContract + verification
7. Provider/runtime binding
8. Templates: Chief of Staff / CEO / Research / Graphics / Video / Engineer
9. Teach-by-demonstration → Skill
10. Advanced organization/visualization views
```

Do not start with 3D Office, large template catalogs or provider-specific bot cloning before the canonical identity/delegation/continuation/completion contracts are proven.

---

# 102. R2 product/work lifecycle architecture

R2 extends the Assistant layer with a user-work lifecycle while preserving all implemented runtime authorities.

```text
USER GOAL
   │
   ▼
Primary Assistant
   │
   ▼
Solution Strategy Resolver
   │
   ├── USE_EXISTING_CAPABILITY ───────────────→ Spec 256 existing path
   ├── COMPOSE_EXISTING_CAPABILITIES ─────────→ existing Skills/Apps/Workflows
   ├── CUSTOMIZE_EXISTING_PRODUCT ────────────→ managed customization path
   ├── CREATE_REUSABLE_MINI_APP ──────────────┐
   └── CREATE_CUSTOM_APPLICATION ──────────────┤
                                               ▼
                                      DevelopmentStrategy
                                               │
                                      DevelopmentWorkspace
                                               │
                           ┌───────────────────┴───────────────────┐
                           ▼                                       ▼
                 authorized local materialization        authorized cloud materialization
                 PC/Mac + user harness                    Sandbox/Container/provider
                           │                                       │
                           └───────────────────┬───────────────────┘
                                               ▼
                                      Spec 224 (when development required)
                                               │
                                    Build/Test/Final Verify
                                               │
                                               ▼
                                         Release / SPAAS
                                               │
                                               ▼
                                      Deployment Resolver
                                               │
                           ┌───────────────────┼────────────────────┐
                           ▼                   ▼                    ▼
                       Shared runtime     Dedicated runtime     External/local capability
```

---

# 103. SolutionStrategyContract

Every goal that may result in a new reusable product/application SHALL first receive a productization decision.

```yaml
SolutionStrategyContract:
  id: uuid
  goal_id: uuid
  selected_mode: USE_EXISTING_CAPABILITY|COMPOSE_EXISTING_CAPABILITIES|CREATE_REUSABLE_WORKFLOW|CUSTOMIZE_EXISTING_PRODUCT|CREATE_REUSABLE_MINI_APP|CREATE_CUSTOM_APPLICATION
  recommendation_mode: same-enum
  alternatives: []
  rationale_summary: string
  estimated_build_cost_range: ref|null
  customization_level: LOW|MEDIUM|HIGH|FULL_SOURCE
  reuse_candidates: [ref]
  future_extension_requirement: LOW|MEDIUM|HIGH
  ownership_requirement: PLATFORM_MANAGED|USER_OWNED_SOURCE|TENANT_OWNED_SOURCE
  user_selected: boolean
  selected_at: timestamp
```

The resolver SHOULD compare:

- whether existing capabilities already satisfy the immediate goal;
- expected frequency of reuse;
- user desire to modify logic/UI/workflow later;
- need for source ownership/export;
- expected build/maintenance cost;
- deployment/branding requirements;
- tenant/public/marketplace ambitions;
- privacy/data-locality requirements.

A recommendation MUST remain a recommendation. When alternatives materially differ in cost, ownership, future customizability or execution placement, the user SHALL be able to select among them.

---

# 104. Progressive productization

SmartAIHub SHALL support promotion instead of forcing a rebuild from zero.

```text
One-off analysis/result
  ↓
Saved reusable workspace/workflow
  ↓
Configurable Mini App
  ↓
Custom source application
  ↓
Dedicated/white-label deployment
```

Promotion SHOULD preserve where compatible:

- data bindings;
- prompts/Skills;
- evidence/source definitions;
- UI configuration;
- user decisions;
- tests;
- artifacts;
- memory;
- prior usage/economic history.

---

# 105. DevelopmentStrategy

When software development is actually required, Spec 269 SHALL persist a project-level strategy before dispatch.

```yaml
DevelopmentStrategy:
  project_id: uuid
  app_id: uuid|null
  solution_strategy_id: uuid

  execution:
    placement_mode: LOCAL_ONLY|CLOUD_ONLY|LOCAL_PREFERRED|CLOUD_PREFERRED|HYBRID|AUTO_OPTIMIZE
    selected_executor_binding: ref|null
    selected_harness: codex|claude|hermes|thclaws|other|null
    fallback_policy: DENY|ASK_BEFORE_SWITCH|ALLOW_WITHIN_POLICY|AUTO_OPTIMIZE
    allowed_alternatives: [ref]
    data_locality_policy_ref: ref|null

  economic:
    budget_contract_ref: ref|null
    preferred_funding_source: SMARTAIHUB_CREDITS|USER_SUBSCRIPTION|MIXED|OTHER

  persistence:
    canonical_source_ref: ref
    checkpoint_required: true
    artifact_store_ref: ref
    project_memory_space_ref: ref|null
    source_persistence_policy: PLATFORM_MANAGED|REMOTE_ENCRYPTED|USER_GIT|LOCAL_ONLY|HYBRID
    source_data_locality_policy_ref: ref|null
    dirty_work_protection: REQUIRED|BEST_EFFORT|LOCAL_ONLY

  release:
    promotion_policy: MANUAL_APPROVAL|AUTO_AFTER_ACCEPTANCE|POLICY_DRIVEN
    immutable_artifact_required: true
    rollback_required: true

  deployment:
    mode: MANUAL_APPROVAL|AUTO_AFTER_ACCEPTANCE|POLICY_DRIVEN
    target_policy_ref: ref|null
```

If the user explicitly selects a local harness because they possess an existing subscription/quota, `selected_executor_binding` MUST be honored. The system MUST NOT move the same task to SmartAIHub-paid cloud inference merely because the local executor is offline, busy or rate-limited unless fallback policy authorizes the change.

---

# 106. Durable DevelopmentWorkspace

`DevelopmentWorkspace` is the durable logical home of a user-created software project. It MUST NOT be equated with any one filesystem directory, VM, container, sandbox or user device.

```yaml
DevelopmentWorkspace:
  id: uuid
  tenant_id: uuid
  project_id: uuid
  app_id: uuid|null
  strategy_ref: uuid
  canonical_source_ref: ref
  current_source_revision: string|null
  product_lineage_ref: ref|null
  active_development_run_refs: [ref]
  latest_checkpoint_ref: ref|null
  latest_environment_descriptor_ref: ref|null
  artifact_collection_ref: ref
  memory_space_ref: ref|null
  release_refs: [ref]
  deployment_refs: [ref]
  state: ACTIVE|PAUSED|WAITING_FOR_EXECUTOR|WAITING_FOR_BUDGET|WAITING_FOR_USER|READY_TO_DEPLOY|DEPLOYED|MAINTENANCE|ARCHIVED|DELETION_PENDING
```

Core invariant:

```text
DevelopmentWorkspace = durable logical project context
Sandbox/PC checkout   = temporary materialization
```

The following MUST survive loss of any execution materialization:

- requirements and accepted plan;
- canonical source revision;
- durable task/run references;
- decisions/approvals;
- build/test/final-verify evidence references;
- artifacts;
- blockers and next actions;
- economic/budget state;
- project development memory;
- deployment history.

---

# 107. Workspace materialization

A `WorkspaceMaterialization` represents a temporary usable copy of a DevelopmentWorkspace.

```yaml
WorkspaceMaterialization:
  id: uuid
  workspace_id: uuid
  kind: CLOUD_SANDBOX|LOCAL_RUNNER|EXTERNAL_HARNESS|CONTAINER|OTHER
  executor_binding_ref: ref
  source_revision: string
  base_revision: string
  working_branch_ref: string|null
  mutation_lease_ref: ref|null
  fencing_token: string|null
  write_mode: READ_ONLY|EXCLUSIVE_WRITER|ISOLATED_BRANCH
  runtime_instance_ref: ref|null
  filesystem_root: string|null
  trust_domain_id: string
  dirty_state: CLEAN|DIRTY|SNAPSHOTTING|UNRECOVERABLE_LOCAL_DIRTY
  local_journal_ref: ref|null
  remote_snapshot_ref: ref|null
  created_at: timestamp
  last_heartbeat_at: timestamp|null
  state: STARTING|READY|BUSY|DISCONNECTED|FENCED|DESTROYED
```

Materialization loss MUST NOT imply project loss.

A replacement materialization SHALL be reconstructable from canonical source + durable metadata + artifacts + authorized context.

Generated applications MUST NOT be placed into the SmartAIHub core source tree by default. A generated project MAY appear as a directory inside a temporary build workspace such as `/workspace/<project>` without becoming part of the platform repository.

---

# 108. DevelopmentCheckpoint

R2 SHALL introduce a project-level checkpoint that references, rather than duplicates, implemented development execution state.

```yaml
DevelopmentCheckpoint:
  id: uuid
  workspace_id: uuid
  source_revision: string|null
  source_snapshot_ref: ref|null
  dirty_patch_bundle_ref: ref|null
  environment_descriptor_ref: ref|null
  dependency_lock_refs: [ref]
  development_run_refs: [ref]
  completed_milestones: [string]
  active_task_refs: [ref]
  blocker_refs: [ref]
  test_evidence_refs: [ref]
  artifact_refs: [ref]
  decision_refs: [ref]
  next_actions: [string]
  executor_policy_snapshot_ref: ref
  source_persistence_policy_snapshot_ref: ref
  budget_snapshot_ref: ref|null
  secret_reference_set_ref: ref|null
  created_at: timestamp
  reason: MILESTONE|PAUSE|EXECUTOR_LOSS|BUDGET_GATE|USER_REQUEST|PRE_DEPLOY|RECOVERY
```

Checkpoint creation SHOULD occur at meaningful durable boundaries, including before intentional suspension and after externally observable milestones.

Checkpoint content MUST NOT copy Spec 224's internal state machine. It stores stable references and user/product-level continuation information.

---

# 109. Development memory vs canonical state

Development continuation SHALL use both durable state and Spec 268 memory, but these concepts MUST remain distinct.

```text
Canonical durable state:
  source revision
  task/run status
  artifact hashes
  tests/evidence
  approvals
  deployment records

Development memory:
  why an architecture was selected
  rejected approaches and reasons
  user preferences
  coding/product conventions
  known workarounds
  important unresolved questions
  useful next-step context
```

An LLM memory summary MUST NOT be treated as proof of source revision, completed tests, billing settlement or deployment state.

---

# 110. Cross-device continuation

A project MUST be resumable independently of the device used to inspect/control it.

Example:

```text
Day 1: PC + Codex → implementation progresses
PC turns off
Day 2: user opens Tablet → can inspect exact durable state, blockers, artifacts and next action
Execution policy = LOCAL_ONLY → project waits
Day 3: PC reconnects → same workspace resumes on authorized local executor
```

Tablet/mobile clients MUST be able to:

- inspect project progress;
- view artifacts/results;
- view checkpoint summary;
- approve/deny runtime switches;
- adjust budget envelopes where authorized;
- pause/cancel;
- open preview/deployed app.

They do not need to provide local compute for these control functions.

---

# 111. Execution isolation policy

SmartAIHub SHALL require an isolation boundary appropriate to the workload but MUST NOT require one VM per Assistant or one VM per command.

Recommended conceptual tiers:

```text
TIER 0 EDGE
  ordinary API/LLM/routing operations

TIER 1 RESTRICTED CODE
  tightly constrained code/capability execution without general OS authority

TIER 2 PROJECT SANDBOX
  build/test/package-manager/shell/browser/development execution for one trust domain

TIER 3 DISPOSABLE HIGH-RISK SANDBOX
  unknown repositories, untrusted generated code, risky external dependencies

LOCAL
  SmartAIHub Desktop/Runner when authorized and available
```

Sessions inside one sandbox MUST NOT be assumed to provide tenant/security isolation merely because they have separate terminals or working directories. Different users/tenants or materially different trust domains SHOULD receive separate isolation boundaries.

---

# 112. AssistantWorkspace and adaptive surfaces

`AssistantWorkspace` is the user-facing surface composition for inspecting and interacting with current work. It is distinct from `DevelopmentWorkspace`.

```text
DevelopmentWorkspace = durable project/work state
AssistantWorkspace   = how humans/Assistants inspect and present that state
```

Supported surface classes SHOULD include:

```text
CHAT
TASK_BOARD
ARTIFACT
DOCUMENT
CODE
DIFF
TEST
LOGS
TERMINAL
BROWSER
IMAGE
VIDEO
GRAPH
AGENT_SESSION
RUNTIME_STATUS
```

The Assistant MAY compose surfaces based on the task. For example, after a failed test it MAY present `TEST + failing CODE + DIFF + TERMINAL/LOGS` without requiring the user to assemble the view manually.

Desktop MAY use multi-pane/canvas presentation, tablet MAY use stacked/board layouts and mobile SHOULD default to compact Chat-first cards. These are renderings of the same underlying workspace objects.

---

# 113. TerminalSurface

SmartAIHub SHALL support a Terminal Surface where development/runtime workflows require shell visibility or controlled interaction.

A Terminal Surface is:

> **a policy-controlled view over an authorized execution session.**

It is NOT:

- unrestricted root access to SmartAIHub production;
- a canonical source-of-truth store;
- a required primary interface for normal users.

Logical fields SHOULD include:

```yaml
TerminalSurface:
  id: uuid
  workspace_id: uuid
  materialization_id: uuid
  execution_session_ref: ref
  owner_actor_ref: ref
  mode: AGENT_OWNED|INTERACTIVE_USER|READ_ONLY_LOG_VIEW
  filesystem_scope_ref: ref
  network_policy_ref: ref
  credential_scope_ref: ref
  expires_at: timestamp|null
  audit_ref: ref
```

Normal users SHOULD see structured execution/test status first and open raw Terminal details only when useful. Human takeover MAY temporarily switch an Agent-owned terminal to an interactive mode and later return control to the Assistant.

---

# 114. Build placement is not deployment target

The place where an application is developed MUST be independent from the place where its release is deployed.

Examples:

```text
Codex @ user PC      → Final Verify → deploy to SmartAIHub Cloud
Cloud Sandbox        → Final Verify → deploy to SmartAIHub Cloud
Cloud development    → Final Verify → export for external deployment
Local development    → Final Verify → dedicated tenant runtime
```

A local PC/harness MUST NOT be required to remain online merely because it was used to build the application, unless the production application intentionally depends on a local capability such as the user's GPU/ComfyUI.

---

# 115. Deployment model

After Final Verify/package/acceptance, a Deployment Resolver SHOULD select among supported targets according to application requirements and policy.

Default SmartAIHub deployment modes:

```text
SHARED_RUNTIME
  platform-hosted Mini Apps/configuration-driven products

DEDICATED_RUNTIME
  dedicated Worker/Container/resources when isolation, dependency, load or enterprise policy requires it

EXTERNAL_EXPORT_OR_DEPLOYMENT
  approved portable/external target
```

Deployment may compose resources such as Workers, Containers, Queues, Workflows, PostgreSQL/Hyperdrive, R2, Vectorize and approved external/local capability providers. Not every application receives every service.

Deployment is represented by platform resources and routes, not by placing the user app as a permanent folder under the SmartAIHub core repository.

---

# 116. Generated source and repository isolation

Normative invariant:

> **Generated user applications MUST NOT become part of the SmartAIHub core source tree by default.**

Acceptable canonical source models include:

```text
separate Git repository
managed project source store
versioned SPAAS application source/artifact bundle
other approved tenant-scoped source authority
```

Temporary materializations MAY be directories beneath a sandbox workspace.

Platform-core modification is a separate privileged development goal and MUST NOT be inferred from ordinary Mini App generation.

---

# 117. DevelopmentBudgetContract

Before an open-ended paid build starts, SmartAIHub SHOULD create a `DevelopmentBudgetContract` that projects onto the canonical credit/billing subsystem.

```yaml
DevelopmentBudgetContract:
  id: uuid
  workspace_id: uuid
  estimate:
    min_credits: number|null
    max_credits: number|null
    confidence: LOW|MEDIUM|HIGH
  authorized_cap_credits: number|null
  reserved_credits: number|null
  current_actual_credits: number
  projected_remaining_range: object|null
  affordability_status: SUFFICIENT|INSUFFICIENT|UNKNOWN_EXTERNAL_QUOTA|PARTIALLY_OBSERVABLE
  funding_sources:
    - type: SMARTAIHUB_CREDITS|USER_SUBSCRIPTION|INCLUDED|OTHER
      scope_ref: ref|null
      quota_observability: EXACT|ESTIMATED|UNKNOWN
      platform_charge_policy_ref: ref|null
  overrun_policy: STOP_AND_ASK|REDUCE_SCOPE|AUTHORIZED_AUTO_EXTENSION
```

Required behavior:

```text
Preflight estimate
→ user-visible affordability check
→ budget envelope/reservation
→ real-time metering
→ dynamic reforecast
→ hard guard before cap
→ settlement
→ release unused reservation
```

Exact final cost MUST NOT be fabricated before the work is known.

If projected cost crosses the authorized envelope, the work MUST pause before unauthorized additional spend and present alternatives such as increasing the cap, reducing scope, switching to a cheaper authorized path, or delivering the completed subset.

---

# 118. Economic category separation

User-visible cost reporting SHALL distinguish at least:

```text
DEVELOPMENT COST
  one-time/episodic cost to create or modify the product

HOSTING COST
  cost to keep deployed resources available where applicable

RUNTIME USAGE COST
  per-run/per-token/per-media/per-compute usage after deployment
```

Where the user supplies a third-party subscription or local compute, SmartAIHub SHALL identify that funding source distinctly rather than presenting it as ordinary SmartAIHub-credit usage.

---

# 119. No silent executor/funding-source substitution

The following transition is prohibited unless policy authorizes it:

```text
User selects Codex subscription on PC
PC becomes unavailable
↓
SmartAIHub silently starts a paid cloud model
```

Required behavior for `DENY`:

```text
WAITING_FOR_EXECUTOR
→ preserve workspace/checkpoint
→ notify user
→ resume when selected executor returns
```

Required behavior for `ASK_BEFORE_SWITCH`:

```text
WAITING_FOR_EXECUTOR
→ Needs You item
→ disclose alternative + estimated economic/privacy impact
→ switch only after approval
```

---

# 120. Solution and execution UX

Before material software creation, Chat/Task Control SHOULD present a compact decision card such as:

```text
Goal: Analyze last month's sales

A. Analyze now using existing capabilities
   Fastest / least setup / one-off

B. Save as a reusable workflow/dashboard
   Reuses platform capabilities / repeatable / lower maintenance

C. Create or customize a Mini App
   Reusable / shareable / future customization

D. Create a custom application
   Full source ownership / maximum customization
```

If development is selected, execution options MAY include:

```text
Use my Codex subscription on Desktop-01
Use SmartAIHub cloud development
Ask me before changing executor
```

The UI SHOULD show estimated build cost/range and funding source before commitment.

---

# 121. R2 acceptance tests

In addition to the R1 test suite, implementation MUST prove at least:

1. a goal solvable by an existing capability can complete without creating a Mini App;
2. user can explicitly choose Mini App/custom application despite a simpler alternative;
3. existing product can be selected for customization rather than rebuilt;
4. Spec 224 code/contract remains unchanged by R2 implementation;
5. Spec 256 code/contract remains unchanged by R2 implementation;
6. local Codex selected with `DENY` does not fall back to cloud when PC disconnects;
7. local executor loss transitions workspace to `WAITING_FOR_EXECUTOR` without source/task loss;
8. `ASK_BEFORE_SWITCH` creates an Attention item before alternate executor dispatch;
9. tablet can inspect a locally paused development project and approve/deny a runtime switch;
10. destroyed cloud sandbox can be reconstructed from canonical source/checkpoint;
11. no canonical source exists only inside a sandbox filesystem;
12. DevelopmentCheckpoint references Spec 224 run/evidence without duplicating its state machine;
13. Development memory cannot override canonical source revision/test truth;
14. user-generated app source is not written into SmartAIHub core repository by default;
15. Terminal Surface cannot address an unauthorized production shell;
16. Agent-owned terminal can be viewed without granting interactive human mutation rights;
17. takeover/return-control preserves the same authorized execution session where supported;
18. build performed locally can deploy to cloud without keeping the local PC online;
19. cloud build can deploy to shared runtime;
20. application requiring dedicated runtime can be deployed without changing project identity;
21. preflight shows estimate range, authorized cap, available balance and funding source;
22. budget cap prevents additional charge before explicit approval;
23. unused reservation is released after settlement;
24. user-owned subscription usage is not double-charged as SmartAIHub provider-model usage;
25. development/hosting/runtime usage are distinguishable in user-visible accounting;
26. work paused for months can resume from durable checkpoint + canonical source + authorized memory;
27. same DevelopmentWorkspace can have different materializations over time without changing project identity;
28. two tenants cannot share a project sandbox merely because sessions use different working directories;
29. high-risk/untrusted repo can be forced to a disposable isolation tier;
30. progressive productization preserves compatible prior artifacts/configuration when promoted.

---

# 122. R2 implementation order

R2 SHOULD be implemented in additive slices that do not reopen Spec 224 or 256:

```text
R2-A  SolutionStrategyContract + UX decision card
R2-B  DevelopmentStrategy + no-silent-fallback policy
R2-C  Durable DevelopmentWorkspace + materialization registry
R2-D  DevelopmentCheckpoint + Spec 268 development-memory integration
R2-E  AssistantWorkspace surfaces + Terminal/Test/Diff/Logs projections
R2-F  Deployment model + generated-source isolation
R2-G  DevelopmentBudgetContract + credit/billing projection
R2-H  cross-device resume + executor-loss recovery
R2-I  acceptance/reconciliation hardening
```

Each slice MUST use existing Spec 224/256 behavior as a dependency rather than changing those subsystems.

---

# 123. R2 twelve-pass gap review record

R2 was reviewed across the following independent lenses:

| Pass | Lens | R2 resolution |
|---:|---|---|
| 1 | Already-implemented dependency safety | Made Specs 224/256 consume-only and removed required modifications. |
| 2 | Over-building / product sprawl | Added Solution Strategy Resolver and reuse-first/progressive productization. |
| 3 | Local harness subscription ownership | Added binding execution/funding-source policies and no silent cloud substitution. |
| 4 | Sandbox ephemerality | Added durable DevelopmentWorkspace, materializations and reconstruction rule. |
| 5 | Cross-device continuity | Added checkpoints and tablet/mobile control over paused/local work. |
| 6 | State vs memory truth | Separated canonical source/task/evidence from Spec 268 development memory. |
| 7 | Execution isolation | Added trust-tier policy without VM-per-task assumption. |
| 8 | Human/agent observability | Added AssistantWorkspace + structured Test/Diff/Logs/Terminal surfaces. |
| 9 | Terminal security | Defined Terminal as an authorized session view, never implicit production shell. |
| 10 | Build vs deploy confusion | Separated build materialization from deployment target/shared-vs-dedicated runtime. |
| 11 | Economic uncertainty | Added estimate range, cap, reservation, reforecast and settlement semantics. |
| 12 | Core-repository contamination | Prohibited generated user apps from entering SmartAIHub core source tree by default. |

No R2 gap identified in these passes requires reopening implemented Spec 224 or Spec 256.

---

# 124. Canonical architecture summary

```text
                              USER
                                │
                                ▼
                    ┌──────────────────────┐
                    │   PRIMARY ASSISTANT  │
                    │ persistent / scoped  │
                    └──────────┬───────────┘
                               │
                         Goal / Intent
                               │
                    direct? / plan? / delegate?
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
      Skill/Tool        SPECIALIST ASSISTANT     Workflow/App
                              persistent
                               │
                  ┌────────────┼────────────┐
                  ▼            ▼            ▼
             Task Agent     Skill       External Agent
             ephemeral                 / Managed Bot
                  │            │            │
                  └────────────┼────────────┘
                               ▼
                      Capability Resolver
                               │
                      Runtime / Model Router
                               │
             ┌─────────────────┼─────────────────┐
             ▼                 ▼                 ▼
        CF Worker/Flow     CF Container       PC/Mac Runner
             │                 │                 │
             └─────────────────┼─────────────────┘
                               ▼
                     Durable Job/Event Plane
                               │
                 ┌─────────────┼─────────────┐
                 ▼             ▼             ▼
             RUNNING         WAITING       BLOCKED
                 │             │             │
                 │       Continuation         │
                 └─────────────┴─────────────┘
                               │
                            VERIFY
                               │
                            COMPLETE
                               │
                         Result to parent
                               │
                    Primary → original Chat
```

This architecture is canonical for the SmartAIHub Assistant layer after adoption of Spec 269.

---

# 125. R2.1 hardening decision

R2.1 hardens R2.0 after an additional independent gap audit. It does **not** reopen implemented Spec 224 or Spec 256. All changes in this revision remain additive at the Spec 269 product/Assistant/workspace layer or consume existing canonical authorities.

The following additional invariants are normative:

```text
REUSABLE WORKFLOW ≠ MINI APP REQUIRED
EXECUTION LOCALITY ≠ SOURCE PERSISTENCE LOCALITY
LOCAL EXECUTOR OFFLINE ≠ LOCAL DIRTY WORK DURABLY CAPTURED
CHECKPOINT WITHOUT SOURCE/ENVIRONMENT CONSISTENCY ≠ RECOVERABLE CHECKPOINT
MULTIPLE MATERIALIZATIONS ≠ MULTIPLE UNFENCED WRITERS
RECONNECTED STALE EXECUTOR ≠ AUTHORIZED WRITER
SOURCE REVISION ALONE ≠ REPRODUCIBLE BUILD
SECRET REFERENCE ≠ SECRET VALUE
PREVIEW SUCCESS ≠ DEPLOYMENT READINESS
REBUILD FOR PRODUCTION ≠ PROMOTE VERIFIED ARTIFACT
USER SUBSCRIPTION SELECTED ≠ QUOTA KNOWN
DEPLOYED APP ≠ DEVELOPMENT FINISHED FOREVER
ARCHIVED WORKSPACE ≠ DELETED USER DATA
```

---

# 126. Reusable Workflow / Automation solution mode

A reusable Workflow/Automation SHALL exist as a first-class solution strategy between one-off composition and Mini App creation.

Use this mode when the user needs repeatability, scheduling, parameterization or team reuse but does not require a dedicated app UI/product boundary.

```text
One-off capability execution
    ↓ save/repeat
Reusable Workflow / Automation
    ↓ productize when useful
Mini App
    ↓ full ownership/customization when needed
Custom Application
```

The Solution Strategy Resolver MUST consider this mode before recommending a new Mini App when the user primarily needs repeatable orchestration rather than a standalone application experience.

---

# 127. Execution locality vs source persistence locality

Execution placement and project-source persistence are independent policy dimensions.

Examples:

```text
LOCAL_ONLY execution + USER_GIT persistence
LOCAL_ONLY execution + REMOTE_ENCRYPTED persistence
LOCAL_ONLY execution + LOCAL_ONLY persistence
CLOUD_ONLY execution + PLATFORM_MANAGED persistence
HYBRID execution + HYBRID persistence
```

Selecting `LOCAL_ONLY` execution MUST NOT automatically mean that source code, checkpoints or artifacts may be uploaded to SmartAIHub. Conversely, denying cloud execution MUST NOT be interpreted as denying cloud storage unless the source/data locality policy also says so.

For `LOCAL_ONLY` source persistence, SmartAIHub MUST disclose the reduced cross-device/recovery guarantee. The platform MUST NOT claim that a destroyed/lost local device can be reconstructed from cloud state when the user prohibited remote source/snapshot persistence.

---

# 128. Dirty-work durability and local journal

A clean Git/source revision is insufficient when a local or sandbox materialization contains uncommitted work.

Writable materializations SHALL maintain a recoverability journal appropriate to policy. At meaningful mutation boundaries it SHOULD record at least:

```text
base revision
changed-file inventory
patch/delta or snapshot reference where permitted
untracked-file inventory where permitted
current task/ref
materialization generation/fencing token
timestamp
```

Allowed durability modes include:

```text
REMOTE_DURABLE_SNAPSHOT     encrypted/authorized remote patch or snapshot
USER_GIT_DURABLE            committed/pushed to user-controlled canonical Git
LOCAL_DURABLE_JOURNAL       durable local journal only
BEST_EFFORT_EPHEMERAL       only when user explicitly accepts reduced durability
```

A materialization MUST NOT be advertised as safely recoverable if its latest dirty work exists only in volatile sandbox storage or an unjournaled process filesystem.

When privacy policy forbids remote snapshotting, the UI SHALL identify the last **cloud-visible/cross-device durable checkpoint** separately from the latest **local-only checkpoint**.

---

# 129. Workspace mutation lease, branching and split-brain fencing

A DevelopmentWorkspace MAY have multiple materializations, but concurrent writable access MUST be explicit.

At least one of the following strategies SHALL be used:

1. **Exclusive Writer** — only one materialization holds a workspace mutation lease;
2. **Isolated Branch/Worktree** — each writer mutates a separate branch/worktree and merges through an explicit reconciliation gate;
3. **Domain-specific optimistic concurrency** — only where the mutable resource supports version/CAS semantics safely.

A `WorkspaceMutationLease` SHOULD contain:

```yaml
WorkspaceMutationLease:
  id: uuid
  workspace_id: uuid
  materialization_id: uuid
  resource_scope: string
  fencing_generation: integer
  expires_at: timestamp
  mode: EXCLUSIVE|BRANCH_SCOPED|RESOURCE_SCOPED
```

After executor loss, lease expiry, fallback or manual transfer, a newly authorized writer SHALL receive a higher fencing generation. A stale/reconnected executor MUST NOT be allowed to publish mutations, deployment actions or canonical-source updates using an older generation.

This rule prevents:

```text
PC disconnects
→ cloud fallback continues
→ old PC reconnects
→ both sides write canonical branch
```

from becoming a split-brain project.

---

# 130. Reconstructable build environment

Canonical source alone does not guarantee that a build can be resumed months later.

Each releasable/checkpointed development state SHOULD reference a `BuildEnvironmentDescriptor` containing or referencing, where applicable:

```text
runtime/toolchain versions
OS/runtime base image or compatible environment class
package-manager version
lockfiles
registry/source configuration without embedded secrets
native/system dependencies
build commands
feature flags
required capability/runtime versions
SBOM/provenance reference
```

The descriptor MUST use secret references rather than embedded credentials.

A replacement sandbox SHOULD be reconstructed from the source revision plus this environment descriptor. If exact reconstruction is impossible because a dependency disappeared or a runtime is no longer supported, the workspace SHALL surface `ENVIRONMENT_DRIFT` rather than silently claiming deterministic continuation.

---

# 131. Secret-safe checkpoints and materializations

Raw secrets MUST NOT be persisted in:

- DevelopmentCheckpoint;
- source snapshots/patch bundles;
- project memory;
- build logs/artifacts;
- Terminal transcript retention;
- environment descriptors.

These objects may contain typed secret/credential references. Secret material SHALL be injected only into an authorized runtime scope and SHALL obey destination, lifetime and capability policies.

Before a remotely persisted dirty-work snapshot or publishable artifact is accepted, the platform SHOULD run policy-appropriate secret detection/redaction checks. A detected credential leak MUST create an explicit security/blocking event and rotation recommendation where applicable.

---

# 132. DeploymentReadinessGate

Passing development Final Verify does not by itself prove that a target deployment environment is ready.

Before Preview or Production deployment, Spec 269 SHALL require a product-level `DeploymentReadinessGate` that checks or references checks for at least:

```text
verified release artifact/package
target runtime compatibility
required capabilities/providers available at target
required credentials/bindings present and scoped
data-source availability and locality compatibility
network/egress policy compatibility
storage/database bindings
schema/data migration plan where applicable
route/domain configuration
budget/hosting authorization
license/provenance/security gates required by target policy
rollback/recovery readiness
```

A development environment having access to a local file, local database, local GPU or user harness MUST NOT be interpreted as proof that production has the same dependency.

The gate SHALL block unsafe/incomplete deployment, emit actionable machine-readable findings, and route recoverable findings into authorized remediation/retest rather than defaulting to human interruption. It MUST NOT silently deploy a partially functional application.

---

# 133. Immutable release promotion and rollback

The artifact accepted in Preview SHOULD be the same immutable artifact promoted to Production.

Preferred lifecycle:

```text
Build
→ Verify
→ immutable Release artifact/digest
→ Preview deployment
→ acceptance/readiness checks
→ promote SAME release digest
→ Production
```

Production promotion MUST NOT silently rebuild source into a different unverified artifact when immutable promotion is supported.

The product lifecycle SHALL retain references needed to answer:

```text
which release is deployed?
which source revision produced it?
which tests/evidence verified it?
which deployment replaced it?
what is the last known-good rollback target?
```

Rollback policy MAY delegate low-level mechanics to the canonical deployment/control-plane subsystem, but Spec 269 SHALL preserve user-visible release lineage and approval semantics.

---

# 134. Data/schema migration safety

Deployment that mutates durable production data requires stronger handling than stateless code promotion.

Where a release includes schema/data migrations, DeploymentReadinessGate SHALL require applicable evidence for:

```text
migration identity/version
forward migration plan
compatibility window
backup/snapshot or equivalent recovery strategy
rollback/roll-forward strategy
estimated lock/downtime impact
tenant/data scope
approval requirement for destructive operations
post-migration verification
```

An application release MUST NOT be marked safely rollback-capable when its data migration is irreversible unless that limitation is explicitly surfaced and approved according to policy.

---

# 135. External subscription quota and affordability truth

When the user chooses a third-party subscription/harness, SmartAIHub may not know the exact remaining provider quota.

User-visible affordability MUST therefore support:

```text
SUFFICIENT                  known SmartAIHub balance/reservation covers platform charge
INSUFFICIENT                known balance/reservation does not cover required platform charge
UNKNOWN_EXTERNAL_QUOTA      provider subscription quota cannot be reliably queried
PARTIALLY_OBSERVABLE        some funding components are known, others are not
```

SmartAIHub MUST NOT display “credits sufficient” as a claim about an external subscription whose remaining quota is unknown.

If the external provider reports quota/rate-limit exhaustion, the task SHALL follow executor fallback policy (`DENY`, `ASK_BEFORE_SWITCH`, etc.) rather than silently converting the work into SmartAIHub-paid cloud usage.

Any SmartAIHub platform charge that still applies while using user-funded inference—such as sandbox, storage, orchestration, media, egress or Skill fees—MUST be disclosed separately.

---

# 136. Product lineage and future modification

A deployed Mini App/custom application remains linked to the DevelopmentWorkspace and its product lineage so future modification does not require rediscovery from scratch.

The lineage SHOULD preserve references for:

```text
originating goal/solution strategy
parent product/version if customized or forked
canonical source/package
releases and deployment history
compatible saved workflows/configuration
data/credential bindings by reference
architecture decisions and project memory
known migration obligations
```

A user returning months later with “แก้ App เดิม เพิ่ม forecast” SHOULD resume from this lineage rather than create an unrelated product unless the user explicitly requests a fork/new product.

---

# 137. DevelopmentWorkspace lifecycle, export and deletion

DevelopmentWorkspace lifecycle SHALL be explicit:

```text
ACTIVE
PAUSED
MAINTENANCE
ARCHIVED
DELETION_PENDING
DELETED/TOMBSTONED according to canonical retention authority
```

The platform SHALL define behavior for:

- archive without destroying source/release history;
- export of user-owned source/package/artifacts where policy permits;
- tenant/account transfer where supported;
- deployment retention when workspace is archived;
- deletion requests and retention/legal holds;
- revocation/destruction of workspace-specific secrets and executor bindings;
- orphaned deployment detection.

Archiving an Assistant or a DevelopmentWorkspace MUST NOT accidentally delete a production deployment unless an explicit lifecycle action requests that effect.

---

# 138. Dependency provenance, licensing and supply-chain gate

Reuse-first development may incorporate external packages, templates, repositories, Skills or generated code. Before marketplace publication, public deployment or other policy-defined release classes, the platform SHOULD require provenance/supply-chain evidence appropriate to risk.

Evidence MAY include:

```text
package/SBOM inventory
source/template provenance
license compatibility status
known-vulnerability/security scan refs
disallowed package/source policy checks
generated-vs-copied source attribution metadata where available
```

Spec 269 does not become the canonical software-composition database; it references the appropriate Spec 261/266/security evidence and exposes unresolved release blockers through DeploymentReadinessGate.

---

# 139. R2.1 additional acceptance tests

In addition to Sections 93 and 121, implementation MUST prove at least:

1. a repeatable goal can be saved as a reusable Workflow without forcing Mini App creation;
2. `LOCAL_ONLY` execution can coexist with authorized remote encrypted source persistence;
3. `LOCAL_ONLY` source persistence clearly reports reduced cross-device disaster recovery;
4. dirty local work is not reported as remotely recoverable until a policy-compliant journal/snapshot/commit exists;
5. a local-only latest checkpoint and a cloud-visible durable checkpoint can be distinguished;
6. two writable materializations cannot mutate the same exclusive source scope without lease/branch isolation;
7. stale materialization fencing blocks canonical write after executor transfer;
8. local PC reconnect after authorized cloud fallback cannot overwrite newer canonical state with an old generation;
9. replacement sandbox restores declared toolchain/package-lock/environment information or reports `ENVIRONMENT_DRIFT`;
10. raw secret values are absent from checkpoint, snapshot, environment descriptor and retained terminal transcript fixtures;
11. deployment fails readiness when a local-only dependency is unavailable in production;
12. preview and production can reference the same immutable release digest;
13. rollback identifies a known-good prior release and its evidence chain;
14. irreversible database migration blocks “safe rollback” claim and requires policy-appropriate approval;
15. unknown external subscription quota produces `UNKNOWN_EXTERNAL_QUOTA`, not a false sufficient-credit claim;
16. SmartAIHub platform charges remain separately visible when user-funded harness inference is used;
17. modifying a deployed app months later resumes the same product lineage by default;
18. workspace archive does not silently destroy deployment;
19. workspace deletion/retention respects export, legal-hold and credential-revocation policy;
20. public/marketplace release can be blocked by missing required provenance/license/security evidence.

---

# 140. R2.1 fifteen-pass gap review record

The R2.1 hardening audit applied fifteen independent review lenses to R2.0:

| Pass | Lens | Gap found | R2.1 remediation |
|---:|---|---|---|
| 1 | Solution granularity | Reusable workflow/automation sat implicitly between compose and Mini App but lacked a canonical mode | Added `CREATE_REUSABLE_WORKFLOW` |
| 2 | Multi-materialization concurrency | Local/cloud materializations could both write without explicit project-level fencing | Added mutation lease, isolated-branch modes and fencing generation |
| 3 | Local executor durability | Executor locality was conflated with source persistence locality | Added separate source-persistence/data-locality policy |
| 4 | Dirty/uncommitted work | Canonical revision did not protect uncommitted local/sandbox changes | Added dirty-work journal/snapshot semantics and truthful durability levels |
| 5 | Offline/reconnect split-brain | Reconnected stale PC could conflict after authorized fallback | Added stale-writer fencing and generation transfer |
| 6 | Reproducibility | Source revision alone cannot recreate toolchain/dependency environment months later | Added BuildEnvironmentDescriptor and environment-drift state |
| 7 | Secret safety | Checkpoints/snapshots could accidentally persist credentials | Added secret-reference-only persistence and secret scan requirement |
| 8 | Deployment dependency parity | Local build success did not prove production capability/data/credential availability | Added DeploymentReadinessGate |
| 9 | Preview-to-production integrity | Deployment could rebuild after preview and produce different bytes | Added immutable release promotion semantics |
| 10 | Data migration safety | Rollback semantics ignored irreversible schema/data changes | Added migration readiness/backup/rollback evidence |
| 11 | Economic truth | User-subscription quota may be unknowable even if SmartAIHub balance is known | Added external-quota observability and affordability states |
| 12 | Long-term maintenance | Deployed app lineage to future modification was not explicit enough | Added product lineage and maintenance continuity |
| 13 | Workspace lifecycle | Archive/export/delete/retention semantics were under-specified | Added DevelopmentWorkspace lifecycle and orphan prevention |
| 14 | Supply-chain/provenance | Reused packages/templates could reach public deployment without explicit release gate | Added provenance/license/security evidence linkage |
| 15 | Implemented-spec safety regression | New hardening could accidentally expand Spec 224/256 scope | Confirmed all R2.1 contracts remain Spec 269/adapters/projections; 224/256 remain consume-only |

No R2.1 finding requires reopening or modifying implemented Spec 224 or Spec 256.

---

# 141. R2.1 Definition of Done extension

Spec 269 R2.1 is not complete unless, in addition to the existing R2 Definition of Done:

- Solution Strategy supports reusable Workflow/Automation without Mini App creation;
- every writable DevelopmentWorkspace materialization is protected by an explicit mutation coordination mode;
- dirty-work durability is truthful under local-only and remote-persisted policies;
- a stale executor is technically unable to regain canonical write authority after fencing transfer;
- environment reconstruction inputs are versioned/referenced;
- checkpoints and snapshots are secret-safe;
- deployment cannot proceed through a missing-capability/data/credential/migration readiness blocker;
- verified Preview release identity can be traced into Production promotion;
- user-visible affordability distinguishes SmartAIHub credit certainty from unknown external subscription quota;
- deployed products retain lineage for future customization;
- workspace archive/delete/export semantics are implemented without accidental deployment/source loss;
- release policy can require provenance/license/security evidence.



---

# 142. R2.2 hardening decision

R2.2 is an additive hardening revision produced after a further fifteen-pass audit of R2.1. It does **not** reopen Spec 224 or Spec 256 and does not create a new orchestration, billing, memory or deployment authority.

Additional normative invariants:

```text
CURRENT POLICY ≠ AUTOMATICALLY IN-FLIGHT POLICY
POLICY CHANGE ≠ SILENT AUTHORITY EXPANSION
EXECUTOR NAME ≠ TRUSTED EXECUTOR IDENTITY
RECONNECTED DEVICE ≠ AUTHORIZED EXECUTOR
EXECUTION LOCALITY ≠ DATA RESIDENCY
BUILD REQUEST ≠ FEASIBLE BUILD
AUTONOMOUS DEVELOPMENT ≠ USER CANNOT REQUEST PHASE GATES
PREVIEW ≠ PRODUCTION DATA/SECRETS
SAME RELEASE ARTIFACT ≠ SAME ENVIRONMENT BINDINGS
AI REGENERATION ≠ PERMISSION TO OVERWRITE USER CUSTOMIZATION
DEPLOYMENT SUCCESS ≠ UNBOUNDED OPERATING SPEND AUTHORIZED
RETRY ≠ SECOND ECONOMIC CHARGE
RATE LIMIT ≠ PERMISSION TO SWITCH FUNDING SOURCE
LOCAL-ONLY LATEST STATE ≠ CLOUD-VISIBLE LATEST STATE
PLATFORM UPGRADE ≠ OLD CHECKPOINT INVALID
LARGE BINARY ARTIFACT ≠ GIT BLOB REQUIRED
TERMINAL VIEW ACCESS ≠ TERMINAL MUTATION AUTHORITY
PRODUCT FORK ≠ COPY SECRETS OR PRODUCTION DATA
```

---

# 143. EffectivePolicySnapshot and policy drift

Long-running work SHALL execute against a deterministic effective policy snapshot rather than re-evaluating every mutable policy field on every step without traceability.

An `EffectivePolicySnapshot` SHOULD reference at least:

```yaml
EffectivePolicySnapshot:
  id: uuid
  scope_refs: [ref]
  assistant_policy_version: string|null
  tenant_policy_version: string|null
  project_policy_version: string|null
  execution_policy_ref: ref|null
  source_persistence_policy_ref: ref|null
  residency_policy_ref: ref|null
  budget_policy_ref: ref|null
  approval_policy_ref: ref|null
  created_at: timestamp
  digest: string
```

Policy precedence MUST be deterministic and documented. More specific policy MAY narrow authority granted by broader policy, but MUST NOT silently broaden a higher-level restriction unless the authoritative policy system explicitly allows that override.

When policy changes while work is active, the platform SHALL classify the change:

```text
RESTRICTIVE_SECURITY_CHANGE
REVOKED_CREDENTIAL_OR_EXECUTOR
BUDGET_REDUCTION
ORDINARY_PREFERENCE_CHANGE
AUTHORITY_EXPANSION
```

Restrictive/revocation changes MUST take effect according to canonical security policy and may suspend/revoke in-flight work. Authority expansion MUST NOT silently grant an already-running task new powers; it requires an explicit rebind/re-authorization boundary. The Workboard/audit trail MUST be able to show which policy snapshot governed an action.

---

# 144. TrustedExecutorBinding and reconnect authorization

A local/remote harness MUST be identified by a durable trusted binding, not merely by a user-visible machine name such as `Desktop-01`.

A `TrustedExecutorBinding` SHOULD contain/reference:

```yaml
TrustedExecutorBinding:
  id: uuid
  owner_scope_ref: ref
  executor_kind: SMARTAIHUB_DESKTOP|CODEX|CLAUDE|HERMES|THCLAWS|OTHER
  device_or_runtime_identity_ref: ref
  capability_snapshot_ref: ref
  trust_state: PENDING|ACTIVE|SUSPENDED|REVOKED|EXPIRED
  credential_binding_ref: ref|null
  last_attested_at: timestamp|null
  last_seen_at: timestamp|null
  allowed_project_scopes: [ref]
```

Reconnect MUST re-establish current authorization. A stale process possessing an old workspace fencing token MUST still fail canonical writes after lease transfer even if the device itself is trusted.

Revoking a device/executor MUST block new dispatch and invalidate applicable interactive/session grants. Trust/attestation implementation MAY be delegated to the existing Runner/pairing/security subsystem; Spec 269 stores the binding/policy relationship and consumes its result.

---

# 145. Data residency and processing-region policy

R2.1 separates execution locality from source persistence locality. R2.2 additionally separates both from legal/organizational data residency and processing-region requirements.

A DevelopmentStrategy MAY reference:

```text
allowed_processing_regions
prohibited_processing_regions
allowed_storage_regions
cross_border_transfer_policy
provider_region_requirements
regulated_data_classification
```

A runtime/provider that satisfies `CLOUD_ONLY` or `HYBRID` execution policy MUST still be rejected if it violates the effective residency/egress policy.

Fallback MUST NOT move source, prompts, artifacts, customer data or secrets into a different region/provider merely because compute is available there.

Where a provider cannot guarantee the required region, the planner SHALL surface a compatibility limitation rather than falsely claim policy compliance.

---

# 146. DevelopmentPreflightGate

Before starting an open-ended paid development run, SmartAIHub SHALL perform a product-level feasibility preflight outside Spec 224's internal state machine.

The gate SHOULD verify or truthfully classify:

```text
selected solution strategy
required data/source access
required capabilities/Skills
selected executor availability/trust
source persistence mode
residency/data-egress compatibility
required credentials/references
estimated funding/credit condition
external subscription quota visibility
required toolchain/runtime feasibility
expected deployment target class
known blocking approvals
```

Possible outcomes:

```text
READY
READY_WITH_WARNINGS
WAITING_FOR_EXECUTOR
WAITING_FOR_CREDENTIAL
WAITING_FOR_DATA
WAITING_FOR_BUDGET
UNKNOWN_EXTERNAL_QUOTA
POLICY_BLOCKED
UNSUPPORTED_REQUIREMENT
```

`READY_WITH_WARNINGS` MUST NOT hide a hard blocker. Preflight is not Final Verify and does not duplicate Spec 224; it prevents avoidable spend on a plan that cannot currently execute or deploy.

---

# 147. Development interaction mode and phase gates

A user who wants full customization/control MUST be able to choose a different interaction mode without changing the underlying development authority.

Supported modes SHOULD include:

```text
AUTONOMOUS_WITHIN_POLICY
GUIDED_PHASE_REVIEW
MANUAL_APPROVAL_AT_DEFINED_GATES
```

A DevelopmentStrategy MAY declare review gates such as:

```text
requirements
architecture
UI/UX proposal
provider/runtime choice
schema migration
pre-deploy preview
production promotion
```

These gates MUST project onto existing approval/task mechanisms rather than create a duplicate orchestration state machine.

The user MAY tighten interaction policy for future phases. Loosening a policy that increases authority/spend follows EffectivePolicySnapshot re-authorization rules.

---

# 148. PreviewEnvironmentContract

Preview environments SHALL be treated as real security boundaries, not merely alternate URLs.

Default behavior SHOULD be:

```text
private/authenticated preview
separate environment identity
separate credential bindings
non-production or explicitly approved data bindings
no public indexing by default
short-lived or managed lifecycle
```

A PreviewEnvironmentContract SHOULD reference:

```yaml
PreviewEnvironmentContract:
  release_digest: string
  environment_id: string
  access_policy_ref: ref
  data_binding_refs: [ref]
  credential_binding_refs: [ref]
  route_ref: ref|null
  expires_at: timestamp|null
```

Production secrets MUST NOT be copied into Preview by default. Production customer data MUST NOT be cloned into Preview merely for convenience; masking/sampling/synthetic data or explicit authorized bindings SHOULD be preferred according to policy.

Preview URLs/tokens MUST be revocable and scoped to the intended tenant/project/audience.

---

# 149. Immutable release vs environment binding promotion

R2.1 requires promotion of the same immutable release digest from Preview to Production where supported. R2.2 clarifies that environment-specific bindings are intentionally **not** identical bytes.

```text
Release artifact/digest = immutable application code/package
Environment bindings     = target-specific configuration references
```

Promotion SHALL therefore preserve the release digest while resolving a separately versioned Production binding set for:

```text
secrets
routes/domains
runtime/provider bindings
database/storage bindings
feature flags
data sources
regional policy
hosting budget policy
```

A deployment record MUST make both identities traceable:

```text
release_digest
binding_set_version/digest
target_environment
```

This prevents the false choice between “same verified artifact” and “correct production configuration.”

---

# 150. User customization protection and update/merge semantics

A product that the user customizes over time MUST NOT be silently regenerated over user-owned changes.

The DevelopmentWorkspace SHOULD track product/source lineage sufficient to distinguish, where practical:

```text
platform/template baseline
AI-generated changes
user-authored/custom changes
upstream template/product updates
```

When updating a customized product, the system SHOULD use one of:

1. safe three-way merge/rebase;
2. isolated branch plus reviewable diff;
3. explicit fork preserving the current customized baseline.

Conflicts MUST become visible work items. An AI regeneration step MUST NOT replace a customized file/region solely because a newer template exists.

Fork/copy behavior MUST NOT clone secrets, private production data or external-account credentials by default. Such bindings require explicit re-authorization in the destination scope.

---

# 151. OperationalSpendPolicy and orphan-resource cleanup

Deployment creates ongoing economic exposure distinct from development spend. Every deployed product SHOULD reference an operational spend policy projected onto the canonical billing/economic authority.

The policy MAY include:

```text
monthly hosting cap or alert threshold
runtime usage cap/rate policy
provider/local fallback funding policy
idle-resource policy
suspend/degrade/stop behavior when budget is exhausted
owner notification thresholds
```

Dedicated runtimes, preview environments, temporary routes, build containers and other billable resources MUST have ownership/lease metadata sufficient for reconciliation and orphan detection.

Failed/cancelled deployment MUST trigger reconciliation of partially created resources. The system MUST NOT leave indefinitely billable orphan resources merely because deployment failed after resource creation.

Archiving a workspace or app SHALL surface any still-running/billable deployment rather than assuming archive stops charges.

---

# 152. Economic idempotency and duplicate-charge protection

Retries, provider callbacks and reconciliation MUST NOT create duplicate SmartAIHub economic settlement for one logical billable operation.

Spec 269-originated paid actions SHOULD propagate a stable correlation such as:

```text
economic_operation_id
reservation_id
logical_action_id
provider_request_id where available
attempt_id
```

The canonical billing authority remains responsible for ledger semantics, but Spec 269 MUST supply enough stable identity that retry/reconciliation can distinguish:

```text
same logical action / retry
new authorized action
provider duplicate callback
partial failure requiring reconciliation
```

A user-visible retry MUST NOT automatically imply a second charge unless a genuinely new provider/compute consumption event occurred and the billing authority records it accordingly.

---

# 153. Explicit quota/rate-limit continuation states

External/local subscription execution needs explicit durable wait semantics.

Where applicable, Assistant/Workspace projections SHALL distinguish:

```text
WAITING_FOR_EXECUTOR
WAITING_FOR_QUOTA
WAITING_FOR_RATE_LIMIT
WAITING_FOR_BUDGET
WAITING_FOR_USER
```

If a provider returns a trustworthy retry-after or reset time, that reference MAY create a durable continuation. If no reset information exists, the state remains waiting with user-visible uncertainty.

`WAITING_FOR_QUOTA` or `WAITING_FOR_RATE_LIMIT` MUST obey the no-silent-fallback policy. Automatic movement to a SmartAIHub-paid provider is prohibited unless already authorized.

---

# 154. Cross-device state freshness and visibility

When source persistence is local-only or synchronization is partial, remote clients MUST distinguish the newest state they can prove from a newer state that may exist elsewhere.

A workspace projection SHOULD expose:

```text
latest_known_canonical_revision
latest_cloud_visible_checkpoint_at
latest_local_checkpoint_at if reported
sync_state: CURRENT|STALE|LOCAL_AHEAD|UNKNOWN|CONFLICT
last_executor_seen_at
```

Tablet/mobile UI MUST NOT present a cloud-visible checkpoint as “latest project state” when the system knows a local executor is ahead but unsynchronized.

Where the device is offline and the exact local state is unknowable, the truthful state is `UNKNOWN/possibly local-ahead`, not fabricated continuity.

---

# 155. Persistent contract/schema version compatibility

A DevelopmentWorkspace may survive platform upgrades for months or years. Durable Spec 269 records SHALL therefore carry sufficient schema/contract version information for safe resume.

At minimum, persisted objects that may outlive a deployment SHOULD be versioned or migratable, including:

```text
DevelopmentStrategy
DevelopmentWorkspace
DevelopmentCheckpoint
EffectivePolicySnapshot
workspace/materialization metadata
release/deployment lineage
AssistantTeam/Delegation user-work projections where applicable
```

Resume after platform upgrade SHALL either:

1. migrate/normalize the durable record safely;
2. interpret it through a backward-compatible reader; or
3. enter an explicit `MIGRATION_REQUIRED/UNSUPPORTED_LEGACY_STATE` condition.

The platform MUST NOT silently discard old checkpoint fields or restart the project from scratch because an internal schema changed.

---

# 156. Large/binary artifact persistence and integrity index

Development for media, maps, datasets and ML assets can produce files unsuitable for ordinary Git history.

A DevelopmentWorkspace SHOULD support a tenant-scoped artifact index that references durable object storage for large/binary content while preserving source-relative identity and integrity metadata.

Example logical record:

```yaml
WorkspaceArtifactRef:
  logical_path: string
  object_ref: ref
  content_digest: string
  size_bytes: integer
  media_type: string
  source_revision_or_checkpoint_ref: ref|null
  provenance_ref: ref|null
```

Git/source manifests MAY reference these artifacts rather than embedding large binaries. Restore/reconstruction MUST verify digest/integrity before treating a fetched artifact as the expected checkpoint input.

Retention/deletion MUST respect the workspace lifecycle and shared-object reference counting/policy rather than deleting an object still referenced by another authorized product/version.

---

# 157. Terminal/session control lease and output hardening

Interactive terminal access is a side effect and SHALL use an explicit control lease when mutation is permitted.

A `SessionControlLease` SHOULD identify:

```text
session_ref
controller_actor_ref
mode: AGENT|HUMAN|READ_ONLY
fencing_generation
expires_at
```

Human takeover MUST revoke/pause conflicting agent input for the same session unless the execution backend explicitly supports safe multiplexed control. Returning control MUST create a new authoritative control generation.

Terminal/log rendering in web/mobile surfaces MUST sanitize unsafe terminal escape sequences, control characters, clickable/embedded content and HTML/script injection paths according to the UI security layer. Secret-redaction policy applies to retained and streamed output.

Possession of a view token MUST NOT imply stdin/write authority; read and mutate capabilities SHOULD use separately scoped short-lived grants.

---

# 158. R2.2 additional acceptance tests

In addition to Sections 93, 121 and 139, implementation MUST prove at least:

1. an in-flight action can identify the EffectivePolicySnapshot that authorized it;
2. an authority-expanding policy change does not silently enlarge powers of an already-running task;
3. executor/device revocation blocks new dispatch and applicable session control;
4. a reconnected trusted device with stale fencing still cannot write canonical state;
5. a cloud runtime satisfying compute requirements is rejected when residency policy disallows its region/provider;
6. DevelopmentPreflightGate can stop a paid build before dispatch when a required credential/data/executor is missing;
7. `GUIDED_PHASE_REVIEW` can pause at architecture/pre-deploy gates without modifying Spec 224 internals;
8. Preview is private/authenticated by default under default policy;
9. Preview does not receive Production secrets or production customer data by default;
10. Production promotion preserves release digest while using a distinct versioned Production binding set;
11. an AI/template update cannot silently overwrite a conflicting user customization;
12. product fork does not clone secret bindings or production data automatically;
13. failed deployment reconciles/flags partially created billable resources;
14. operational spend policy can block/suspend further billable operation according to policy without corrupting deployed state;
15. retry/duplicate callback maps to one logical economic operation and does not double-settle SmartAIHub credits;
16. rate-limit/quota exhaustion transitions to explicit waiting state and respects no-silent-fallback;
17. tablet shows `LOCAL_AHEAD/UNKNOWN` rather than falsely claiming a stale cloud checkpoint is latest;
18. a workspace created under an older supported schema can resume through migration/backward-compatible read;
19. incompatible legacy state fails explicitly rather than silently resetting project history;
20. a large binary artifact can be restored from object storage with digest verification without being stored as a Git blob;
21. human terminal takeover fences agent stdin until control is returned;
22. terminal read token cannot be used as mutation authority;
23. unsafe terminal output is sanitized before browser rendering;
24. archive/deletion of one workspace does not remove a shared artifact still referenced by another authorized product/version;
25. policy/residency/preflight/preview/spend hardening introduces no required modification to implemented Specs 224/256.

---

# 159. R2.2 fifteen-pass gap review record

The R2.2 audit applied fifteen independent implementation lenses to R2.1:

| Pass | Lens | Gap found | R2.2 remediation |
|---:|---|---|---|
| 1 | Policy precedence/drift | Mutable policies could change interpretation of an in-flight task without a stable authorization snapshot | Added `EffectivePolicySnapshot`, deterministic precedence and re-authorization rules |
| 2 | Executor identity/trust | A friendly machine label was insufficient to prove local harness identity after reconnect | Added `TrustedExecutorBinding`, trust state and revocation/reconnect rules |
| 3 | Residency/region compliance | Execution/source locality did not fully express storage/processing-region constraints | Added separate data residency and processing-region policy |
| 4 | Cost-before-feasibility | Budget could be reserved for a plan blocked by missing data/credential/executor | Added `DevelopmentPreflightGate` |
| 5 | User customization workflow | Autonomous build mode did not explicitly support users who want review/control at each phase | Added guided/manual phase-gate interaction modes |
| 6 | Preview security | Preview was a deployment step but lacked private-by-default data/secret/access isolation | Added `PreviewEnvironmentContract` |
| 7 | Promotion semantics | Same immutable release requirement could be misread as copying Preview config/secrets to Production | Separated immutable release digest from versioned environment binding sets |
| 8 | Custom code preservation | Future AI/template upgrades could overwrite user customizations | Added customization provenance/merge/fork protection |
| 9 | Post-deploy cost leakage | Development caps did not bound ongoing hosting/runtime cost or orphaned resources | Added `OperationalSpendPolicy` and resource reconciliation |
| 10 | Economic retry race | Idempotent jobs did not by itself guarantee no duplicate economic settlement | Added stable economic-operation correlation contract |
| 11 | Subscription wait semantics | Quota/rate-limit exhaustion lacked explicit durable continuation states | Added quota/rate-limit wait states with fallback enforcement |
| 12 | Cross-device truth | Tablet could misinterpret an older cloud checkpoint as latest when local work was ahead | Added synchronization freshness/visibility states |
| 13 | Long-lived schema evolution | Old workspaces/checkpoints could become unreadable after platform upgrades | Added persistent object contract-version/migration requirement |
| 14 | Large/binary project assets | Git-centric recovery was insufficient for video/data/map/ML assets | Added durable object-storage artifact index with digest verification |
| 15 | Terminal control/browser security | Terminal takeover/read mode lacked explicit stdin fencing and renderer hardening | Added `SessionControlLease`, separate read/write grants and output sanitization |

No R2.2 finding requires reopening or modifying implemented Spec 224 or Spec 256.

---

# 160. R2.2 Definition of Done extension

Spec 269 R2.2 is not complete unless, in addition to all prior Definition-of-Done requirements:

- in-flight actions are attributable to stable effective policy snapshots;
- executor trust/revocation/reconnect is enforced independently of display name;
- residency constraints are evaluated independently of generic cloud/local placement;
- paid development passes feasibility preflight or surfaces an explicit blocker state;
- users can select autonomous or guided phase-gated development behavior;
- Preview uses explicit access/data/credential bindings and is private by default under default policy;
- Production promotion traces both immutable release digest and environment binding-set version;
- user customization is protected from silent AI/template overwrite;
- deployed applications have an operational spend/reconciliation policy where billable resources exist;
- economic retry/callback identity is sufficient to prevent duplicate SmartAIHub settlement;
- quota/rate-limit waits are durable and do not bypass no-silent-fallback policy;
- remote clients represent synchronization freshness truthfully;
- long-lived durable objects remain resumable across supported platform schema upgrades;
- large/binary project assets are durably referenced and integrity-verifiable outside ordinary Git when needed;
- terminal mutation control and renderer security are independently enforced from read visibility.

---

# 161. R2.3 hardening decision

R2.3 is an additive hardening revision produced after another independent implementation audit of R2.2. It does **not** reopen Spec 224 or Spec 256 and does not create a competing orchestration, billing, device-trust, deployment, secret-management or monitoring authority.

The following invariants are additionally normative:

```text
DEPLOYED APP ≠ PERMANENTLY COMPATIBLE WITH A PROVIDER/MODEL VERSION
DESIRED DEPLOYMENT STATE ≠ OBSERVED DEPLOYMENT STATE
OUT-OF-BAND CHANGE ≠ AUTHORIZED SMARTAIHUB CHANGE
SCHEDULED TRIGGER ≠ PERMISSION TO RUN WHATEVER VERSION IS CURRENT
OLD APPROVAL ≠ AUTHORIZATION FOR A MATERIALLY CHANGED PLAN/TARGET/COST
USER OFFBOARDED ≠ EXISTING SESSION MAY CONTINUE INDEFINITELY
PROJECT TRANSFER ≠ TRANSFER OF SECRETS / BILLING / EXTERNAL ACCOUNT AUTHORITY
CREDIT AVAILABLE ≠ UNBOUNDED CPU / STORAGE / EGRESS / CONCURRENCY
SECURITY INCIDENT ≠ DELETE EVIDENCE
WORKSPACE DURABLE ≠ INFINITE OR UNSTATED RECOVERY GUARANTEE
SECRET REFERENCE STABLE ≠ SECRET GENERATION STILL AUTHORIZED
ARCHIVE WORKSPACE ≠ DECOMMISSION DEPLOYMENT
CUSTOM DOMAIN STRING ≠ PROOF OF DOMAIN OWNERSHIP
DEPLOYED ≠ HEALTHY
ROLLBACK ARTIFACT ≠ AUTOMATICALLY SAFE DATABASE ROLLBACK
```

---

# 162. Runtime / model / provider compatibility binding

A deployed or scheduled product may depend on external models, providers, runtime APIs, capability versions or agent harness contracts that change independently of the product source.

Each release/deployment SHOULD therefore reference a `RuntimeDependencyBindingSet` sufficient to reconstruct the compatibility assumptions used during verification.

```yaml
RuntimeDependencyBindingSet:
  id: uuid
  release_ref: ref
  dependencies:
    - capability_ref: ref
      provider_ref: ref|null
      logical_model_or_runtime: string|null
      resolved_version_or_revision: string|null
      compatibility_mode: PINNED|COMPATIBLE_RANGE|FOLLOW_APPROVED_CURRENT
      fallback_policy_ref: ref|null
      residency_policy_ref: ref|null
      cost_policy_ref: ref|null
      verified_at: timestamp|null
  version: integer
```

Rules:

- `FOLLOW_APPROVED_CURRENT` MUST NOT mean silent movement to a provider/model that violates cost, residency, data-egress, quality or user execution policy.
- A provider/model/runtime deprecation or materially incompatible version change SHALL create a compatibility event before the next affected deployment/run where advance notice exists.
- If a binding cannot be satisfied, the product SHALL enter an explicit compatibility-blocked state rather than pretending the old verification still proves the new runtime combination.
- Migration to a replacement model/provider SHOULD run the applicable validation/evaluation suite before it becomes the active binding for production or scheduled automation.
- User-selected provider/harness constraints remain authoritative; compatibility pressure does not authorize silent fallback.

---

# 163. Desired-versus-observed deployment/configuration drift

SmartAIHub MUST distinguish the deployment state it intends from the state actually observed in the target environment.

A deployment projection SHOULD track at least:

```text
release digest
binding-set version
routes/domains
runtime class/resources
scheduled triggers
secret-reference generations where visible safely
network/egress policy refs
provider/capability binding refs
operational spend policy ref
observed_at
```

Out-of-band changes performed directly in Cloudflare, a user account, an external provider or another administrative path MAY cause drift.

When material drift is detected, the system SHALL surface `DRIFT_DETECTED` and choose an explicit policy action:

```text
RECONCILE_TO_DESIRED
ADOPT_OBSERVED_AS_NEW_DESIRED
PAUSE_AND_REVIEW
IGNORE_NON_MATERIAL
```

SmartAIHub MUST NOT silently overwrite a material external change merely because its last stored desired state differs. Conversely, an out-of-band change MUST NOT automatically become trusted canonical configuration without validation and authority checks.

---

# 164. Staged production rollout and health gate

Promotion to Production SHOULD support a staged rollout policy where the target runtime permits it.

Supported product-level strategies MAY include:

```text
IMMEDIATE
CANARY
BLUE_GREEN
PERCENTAGE_RAMP
MANUAL_STAGE
```

A `ProductionHealthGate` SHOULD reference:

```text
release_ref
binding_set_ref
rollout_strategy
health_check_refs
error/latency/SLO thresholds
observation_window
rollback_release_ref|null
rollback_binding_set_ref|null
```

The product lifecycle SHALL not equate successful deployment API calls with healthy operation.

If a rollout violates its health gate, SmartAIHub SHOULD pause further traffic expansion and MAY roll back to the last known-good immutable release/binding set when the rollback is technically and policy-wise safe.

Database/data migrations MUST obey Section 134. An artifact rollback MUST NOT claim full rollback if persistent data has crossed an irreversible migration boundary; the system SHALL surface the actual recovery strategy truthfully.

---

# 165. Scheduled/triggered execution version binding

A scheduled or event-triggered Assistant/Workflow/Mini App execution MUST have deterministic version semantics.

Each durable trigger SHOULD resolve or store, as applicable:

```text
assistant/profile version or compatible binding
workflow/app release reference
policy snapshot resolution mode
runtime dependency binding policy
funding/budget policy reference
```

Supported version policies SHOULD include:

```text
PINNED_RELEASE
FOLLOW_APPROVED_ACTIVE_RELEASE
FOLLOW_COMPATIBLE_RELEASE
REQUIRE_REVIEW_ON_CHANGE
```

Updating a Mini App, Workflow or Assistant configuration MUST NOT silently cause an existing schedule to execute materially different code/policy unless its version policy explicitly permits that behavior.

A schedule whose pinned release has been revoked, quarantined, deleted or rendered incompatible SHALL enter an explicit blocked/attention state rather than automatically selecting another release.

---

# 166. Approval freshness, scope and replay protection

Approvals for side effects or spending SHALL be bounded to the context the user actually approved.

An approval envelope SHOULD include or reference:

```text
actor/requester
project/workspace/goal
plan or action digest
resource/destination scope
environment
release/binding version where relevant
maximum spend or quantity where relevant
side-effect class
policy snapshot
time-to-live / expiry
one-shot vs reusable semantics
```

Approval MUST be revalidated when a material change occurs, including:

- target resource/destination changes;
- Production vs Preview changes;
- release or executable action changes materially;
- spend/risk increases beyond the approved envelope;
- authority/policy becomes more restrictive;
- approval expires;
- a reusable approval is revoked.

An approval token/reference from one environment, tenant, product fork or stale plan MUST NOT be replayable as authorization for a materially different action.

---

# 167. Offboarding and revocation propagation

User/member removal, tenant suspension, role revocation or security-driven access revocation MUST propagate beyond the visible UI session.

Affected controls MAY include:

```text
Assistant/Primary bindings
open delegation authority
scheduled activations
Attention approvals
workspace mutation leases
Terminal/session control leases
TrustedExecutorBinding dispatch authority
Preview access tokens
provider sessions
secret-access grants
custom-domain administration
operational spend authority
```

The platform SHALL reconcile active work according to policy: pause, cancel, allow-to-finish under already-valid bounded authority, or transfer to another authorized owner.

A revoked/offboarded principal MUST NOT regain write authority merely by reconnecting a previously trusted local Runner or browser session.

---

# 168. Workspace/product ownership transfer contract

Transfer of a DevelopmentWorkspace, Mini App or custom application between users/teams/tenants is a security and economic boundary, not a simple owner-id edit.

A `ProductOwnershipTransfer` SHOULD explicitly classify transferability of:

```text
source and release artifacts
project memory/history
large artifact refs
custom domains/routes
external provider bindings
secrets/credentials
billing/funding policy
runtime/executor bindings
scheduled triggers
marketplace/publication state
data residency obligations
```

By default, secret material, external-account credentials, user-owned subscriptions, payment authority and device trust MUST require re-authorization in the destination scope.

Transfer SHALL preserve audit/release lineage and SHALL fail closed when required data rights, tenant policy or external ownership constraints cannot be satisfied.

---

# 169. Non-financial resource quota policy

Credit/spend controls are necessary but insufficient to prevent runaway or unfair resource consumption.

A project/deployment MAY require policy limits for:

```text
CPU/runtime duration
memory class
concurrency
background job count
storage/object bytes
network egress
database/query pressure
GPU/runtime minutes
browser/session count
provider request rate
artifact retention volume
```

Spec 269 stores/project-level references and user-visible limits; canonical runtime/storage/provider authorities enforce the actual limits.

Exhaustion SHOULD map to explicit states such as:

```text
THROTTLED
WAITING_FOR_RESOURCE_QUOTA
RESOURCE_LIMIT_REVIEW_REQUIRED
```

Resource-limit exhaustion MUST NOT silently authorize a more expensive provider/runtime or a different funding source.

---

# 170. Security incident quarantine and compromised-release containment

A deployed release, dependency, provider binding, artifact or executor may later become unsafe even after successful verification.

Spec 269 SHALL support a product-level `QUARANTINED` condition distinct from archive/delete.

Quarantine policy MAY:

- block new executions/deployments;
- stop scheduled triggers;
- restrict Preview/Production traffic where authorized;
- revoke or rotate relevant runtime/secret bindings through canonical authorities;
- unpublish Marketplace/public exposure;
- preserve source, logs, evidence and audit records for investigation;
- require an explicit remediated release before resuming.

Quarantine MUST NOT destroy incident evidence automatically. Restoring service requires explicit policy-compliant clearance and should reference the remediation/verification evidence.

---

# 171. Declared durability and recovery class

Because SmartAIHub promises durable continuation, each DevelopmentWorkspace SHOULD expose a truthful durability class rather than implying identical recovery guarantees for every locality policy.

Example classes:

```text
LOCAL_ONLY_BEST_EFFORT
STANDARD_DURABLE
ENHANCED_DURABLE
TENANT_MANAGED
```

A durability class MAY reference target recovery objectives such as maximum accepted checkpoint loss and expected recovery-time class, but Spec 269 does not own the underlying backup system.

Required behavior:

- the UI MUST distinguish remote-durable from local-only state;
- canonical storage/backup authorities remain responsible for actual replication/backup;
- restore procedures SHOULD verify source/artifact digests and checkpoint/version compatibility;
- a successful restore drill MAY be recorded as evidence;
- the system MUST NOT advertise an RPO/RTO or equivalent guarantee it cannot enforce or observe.

---

# 172. Secret-binding generation and rotation freshness

A secret reference may remain the same logical name while its authorized value/generation rotates or is revoked.

Long-running sessions, deployments and schedules SHALL therefore treat secret bindings as versioned/revalidatable authority, not permanent bearer permission.

Where supported, a safe binding record SHOULD expose non-secret metadata such as:

```text
secret_ref
generation/version
status: ACTIVE|ROTATING|REVOKED|EXPIRED
scope
authorized destination/runtime class
last_validated_at
```

New sessions SHOULD resolve the currently authorized generation. Existing sessions MUST follow the canonical secret policy for revocation/rotation, which may require re-injection, restart or termination.

A checkpoint or deployment manifest MUST NOT preserve old secret bytes merely to make restoration easier.

---

# 173. Deployed-product decommission lifecycle

Deployment lifecycle is distinct from DevelopmentWorkspace archive/delete.

A deployed product SHOULD support states such as:

```text
ACTIVE
SUSPENDED
RETIRED
DECOMMISSIONING
DECOMMISSIONED
```

Decommission planning SHALL account for, where applicable:

```text
public/private routes
custom domains and certificates
Workers/Containers/runtime instances
scheduled triggers
Queues/Workflows
Preview environments
database/storage retention
large artifacts
external provider subscriptions/bindings
operational spend resources
Marketplace/publication entries
```

Data deletion/retention follows canonical policy and MUST NOT be inferred solely from runtime shutdown.

A decommission action SHOULD produce a reconciliation result showing resources removed, retained intentionally, blocked from deletion and still billable.

---

# 174. Custom-domain ownership and route safety

A custom domain or route is a tenant-security boundary.

Before binding a custom domain, the deployment layer SHALL prove or rely on canonical proof of ownership/control appropriate to the provider.

Spec 269 SHOULD project:

```text
domain/route ref
owning tenant/product
verification status
certificate/status refs
binding generation
release/deployment ref
```

Rules:

- two unauthorized tenants/products MUST NOT concurrently claim the same exclusive route;
- transfer/reuse after decommission MUST invalidate stale bindings/tokens as required;
- a product fork MUST NOT inherit another product's custom domain automatically;
- failed verification MUST block activation;
- route changes detected out of band feed the deployment-drift contract in Section 163.

---

# 175. Post-deploy observability and incident escalation

After deployment, the user/Primary Assistant SHOULD be able to determine at least:

```text
active release and environment-binding version
health status
recent deployment/rollback
runtime/provider dependency status
error/latency or equivalent health summary where available
operational spend state
resource/quota blockers
security/quarantine status
drift status
pending deprecation/migration actions
```

Spec 269 provides the product/Assistant projection and Attention escalation semantics; canonical monitoring/runtime systems remain authoritative for metrics and health events.

Material production incidents SHOULD create a `Needs You` item or autonomous remediation task according to authority policy. The Primary MAY coordinate diagnosis/recovery but MUST NOT fabricate health when telemetry is unavailable.

---

# 176. R2.3 additional acceptance tests

In addition to Sections 93, 121, 139 and 158, implementation MUST prove at least:

1. a pinned provider/model/runtime binding does not silently move to an incompatible replacement;
2. provider/model deprecation creates an explicit compatibility/migration condition;
3. deployment observed-state drift is detected without silently overwriting the external change;
4. authorized adoption of observed state creates a new auditable desired-state version;
5. staged rollout can halt before full traffic when the health gate fails;
6. rollback preserves truthful data-migration limitations rather than claiming impossible reversal;
7. a pinned scheduled trigger continues using its pinned release after a newer release is published;
8. a schedule with a revoked/quarantined pinned release blocks instead of silently changing release;
9. an expired/stale approval cannot authorize a changed Production target;
10. approval from Preview cannot be replayed automatically for a materially different Production side effect;
11. offboarding removes new dispatch/session-write authority from a previously trusted local executor;
12. active work owned by an offboarded principal follows explicit pause/cancel/transfer policy;
13. workspace ownership transfer does not transfer secrets/user subscriptions/payment authority without re-authorization;
14. ownership transfer preserves source/release/audit lineage where authorized;
15. resource quota exhaustion can throttle/pause work independently from credit balance;
16. resource quota exhaustion does not silently select a costlier runtime/provider;
17. a compromised deployed release can enter `QUARANTINED` while preserving investigation evidence;
18. quarantine blocks scheduled/new execution according to policy until cleared;
19. a local-only workspace does not claim cloud-grade recovery guarantees;
20. restore verification detects an artifact digest mismatch;
21. secret rotation/revocation is observable as binding freshness state without exposing secret bytes;
22. a revoked secret cannot be rehydrated from an old checkpoint;
23. deployed product can be decommissioned independently of DevelopmentWorkspace archive;
24. decommission reconciliation reports retained/still-billable resources;
25. unverified custom domain cannot become active;
26. product fork does not inherit custom-domain binding automatically;
27. route ownership conflict fails closed across tenants;
28. Workboard/Assistant view can show active release, health, spend, drift and compatibility blockers without becoming monitoring authority;
29. telemetry unavailability is shown as unknown/degraded rather than fabricated healthy state;
30. all R2.3 hardening remains additive and requires no modification to implemented Specs 224/256.

---

# 177. R2.3 fifteen-pass gap review record

The R2.3 audit applied fifteen independent implementation lenses to R2.2:

| Pass | Lens | Gap found | R2.3 remediation |
|---:|---|---|---|
| 1 | Model/provider/runtime evolution | A verified app could later execute against materially different provider/model/runtime semantics | Added `RuntimeDependencyBindingSet` and compatibility/deprecation handling |
| 2 | Desired vs observed infra state | Out-of-band Cloudflare/provider/admin changes had no explicit reconciliation contract | Added deployment/config drift detection and adopt/reconcile policies |
| 3 | Production rollout safety | Deploy success did not prove healthy full-production operation | Added staged rollout and `ProductionHealthGate` |
| 4 | Scheduled-version determinism | Existing schedules could accidentally follow a materially changed app/workflow version | Added pinned/follow-compatible schedule version policies |
| 5 | Approval staleness | Old approvals could be reused after target/plan/cost/environment changed | Added scoped approval freshness/replay protection |
| 6 | Offboarding/revocation | Removing a user/role could leave active device/session/schedule authority alive | Added revocation propagation/reconciliation |
| 7 | Ownership transfer | Workspace transfer lifecycle existed but secret/billing/domain/external-binding semantics were under-specified | Added `ProductOwnershipTransfer` boundary |
| 8 | Non-financial exhaustion | Credit caps did not limit compute/storage/egress/concurrency runaway | Added resource quota policy and explicit resource-wait states |
| 9 | Post-release compromise | Verified release had no first-class quarantine lifecycle | Added `QUARANTINED` containment and evidence preservation |
| 10 | Recovery guarantees | “Durable” could be misread as identical recovery guarantees under local-only and cloud-durable modes | Added declared durability/recovery class and restore truth requirements |
| 11 | Secret rotation | Stable secret refs did not express rotation/revocation freshness for long-lived sessions | Added versioned/revalidatable secret-binding generation semantics |
| 12 | Deployment retirement | Workspace archive did not fully define how a live app is intentionally taken out of service | Added deployed-product decommission lifecycle |
| 13 | Custom-domain safety | Domain/route ownership, fork and takeover semantics were implicit | Added domain verification/route ownership protections |
| 14 | Post-deploy observability | Assistant could coordinate development but lacked a minimum production-health projection contract | Added product health/drift/spend/compatibility projection and Attention escalation |
| 15 | Boundary regression | New controls risked becoming duplicate deployment/monitoring/secret authorities | Explicitly retained canonical subsystem ownership and Spec 269 projection-only boundaries |

No R2.3 finding requires reopening or modifying implemented Spec 224 or Spec 256.

---

# 178. R2.3 Definition of Done extension

Spec 269 R2.3 is not complete unless, in addition to all prior Definition-of-Done requirements:

- runtime/provider/model compatibility assumptions are versioned or otherwise auditable for verified releases;
- material desired-vs-observed deployment drift is visible and reconciled explicitly;
- production rollout can evaluate health before/while expanding exposure where the runtime supports staged rollout;
- scheduled/event-triggered work has deterministic release/version semantics;
- approvals are scoped, expiring/revalidatable and protected from cross-environment/changed-plan replay;
- offboarding/revocation propagates to active product-work authority, including local executor/session access;
- ownership transfer re-authorizes non-transferable secrets, billing, domains and external bindings;
- compute/storage/egress/concurrency limits can stop or throttle work independently of credit balance;
- compromised products/releases can be quarantined without deleting investigation evidence;
- durability/recovery guarantees are stated truthfully for local-only vs remotely durable projects;
- secret rotation/revocation freshness is enforced through canonical secret authority without storing raw secret bytes;
- live deployments can be intentionally decommissioned with auditable resource reconciliation;
- custom-domain activation requires valid ownership/route authority and prevents cross-tenant takeover;
- post-deploy health/drift/spend/compatibility state is visible without Spec 269 becoming the monitoring authority;
- R2.3 remains additive and leaves Specs 224 and 256 unchanged.

---

# 179. R2.4 hardening decision

R2.4 is an additive implementation-hardening revision produced by another independent fifteen-pass audit of R2.3. It does **not** reopen Spec 224 or Spec 256 and does not create a competing scheduler, deployment control plane, webhook gateway, security authority, privacy/retention authority, monitoring backend, billing ledger or backup subsystem.

The following invariants are additionally normative:

```text
DEPLOYMENT MUTATION REQUEST ≠ EXCLUSIVE AUTHORITY TO CHANGE PRODUCTION
NEWER WALL-CLOCK TIMESTAMP ≠ NEWER CAUSAL STATE
CALLBACK RECEIVED ≠ CALLBACK AUTHENTICATED
EVENT RECEIVED TWICE ≠ EVENT EXECUTED TWICE
TIMEOUT AFTER SIDE EFFECT ≠ SAFE TO RETRY
SCHEDULE "09:00" ≠ WELL-DEFINED WITHOUT TIMEZONE/CALENDAR POLICY
ROLLBACK RELEASE ≠ CONSISTENT RESTORE OF STATEFUL DATA
PUBLIC MINI APP ≠ CREATOR TENANT DATA/MEMORY ACCESS FOR EVERY CONSUMER
API/MCP/WEBHOOK CONTRACT CHANGE ≠ INTERNAL IMPLEMENTATION DETAIL
MORE ALERTS ≠ BETTER INCIDENT RESPONSE
BREAK-GLASS ≠ UNBOUNDED OR UNATTRIBUTED AUTHORITY
DELETE REQUESTED ≠ ALL DERIVED COPIES ALREADY DISPOSED
GIT COMMIT AUTHOR ≠ COMPLETE AI/HUMAN EXECUTION PROVENANCE
PRODUCTION USER INPUT ≠ DEVELOPMENT MEMORY
CREDIT AVAILABLE ≠ SCARCE COMPUTE CAPACITY RESERVED
AUTOMATION EVENT ≠ PERMISSION TO RECURSIVELY TRIGGER ITSELF
```

---

# 180. Deployment mutation generation, serialization and fencing

Section 47 requires deployment locks generally; R2.4 makes the product-level contract explicit because concurrent promotion, rollback, route mutation or decommission actions can otherwise race.

Any state-changing Production deployment action SHOULD carry or resolve a `DeploymentMutationGeneration` or equivalent canonical compare-and-set/fencing reference.

Logical projection:

```yaml
DeploymentMutationIntent:
  deployment_ref: ref
  environment: PREVIEW|PRODUCTION|OTHER
  desired_release_ref: ref|null
  desired_binding_set_ref: ref|null
  expected_observed_generation: integer|string|null
  mutation_generation: integer|string
  operation_id: string
  actor_ref: ref
  policy_snapshot_ref: ref
  approval_ref: ref|null
  created_at: timestamp
```

Required behavior:

- promotion, rollback, route switch and decommission MUST NOT silently overwrite a newer authorized deployment mutation;
- an executor holding a stale deployment generation MUST fail closed or reconcile before publishing a canonical Production change;
- repeated delivery of the same `operation_id` MUST be idempotent where the canonical deployment system supports it;
- a failed partial deployment does not authorize a second blind writer; reconciliation establishes observed state first;
- Spec 269 stores/project-level intent and generation references; the canonical deployment/control-plane subsystem remains authoritative for actual locking/CAS/fencing.

---

# 181. Authenticated trigger invocation envelope

Durable event-triggered work requires more than a schedule/event name. External triggers such as webhooks, provider callbacks, device events or partner-system events MUST be authenticated/replay-safe according to the canonical ingress/security layer before they authorize Assistant or Mini App execution.

A normalized product-level `TriggerInvocationEnvelope` SHOULD reference:

```yaml
TriggerInvocationEnvelope:
  trigger_binding_ref: ref
  source_principal_or_provider_ref: ref|null
  source_event_id: string|null
  ingress_auth_result_ref: ref
  dedupe_key: string
  occurred_at: timestamp|null
  received_at: timestamp
  ordering_key: string|null
  source_sequence: integer|string|null
  causation_chain_ref: ref|null
  payload_ref: ref
  policy_snapshot_ref: ref
```

Rules:

- unsigned/untrusted external payloads MUST NOT become execution authority merely because they contain a known project/task identifier;
- duplicate source events MUST deduplicate before creating duplicate side effects or economic operations;
- authentication truth comes from the canonical ingress/security subsystem, not from LLM interpretation;
- event payload and authentication material MUST be stored/retained according to data classification and retention policy;
- provider callback authentication, event-trigger authentication and ordinary data ingestion MUST remain distinguishable concepts.

---

# 182. Schedule timezone, calendar and misfire semantics

A recurring/scheduled Assistant or Workflow activation MUST be reproducible across devices, regions and daylight-saving transitions.

Schedule intent SHOULD include or reference:

```text
timezone: IANA timezone identifier
calendar_semantics: WALL_CLOCK|ELAPSED_INTERVAL|PROVIDER_NATIVE
dst_gap_policy: SKIP|RUN_AT_NEXT_VALID_TIME|REQUIRE_REVIEW
dst_repeat_policy: RUN_ONCE|RUN_TWICE|REQUIRE_REVIEW
misfire_policy: SKIP|RUN_ONCE_ASAP|CATCH_UP_BOUNDED|REQUIRE_REVIEW
max_lateness
schedule_version
```

Requirements:

- the UI MUST show the effective timezone for wall-clock schedules;
- changing tenant/user timezone MUST NOT silently reinterpret a pinned schedule unless its policy says to follow timezone changes;
- missed runs after outage/offline periods MUST follow the explicit misfire policy rather than replaying an unbounded backlog;
- the canonical scheduler remains responsible for actual timing; Spec 269 owns the Assistant/product intent and user-visible binding semantics.

---

# 183. Event causality and monotonic projection state

Distributed callbacks, Runner reconnects, queues and provider polling can deliver events late or out of order. Workboard/Assistant projections MUST therefore not rely on wall-clock timestamps alone to decide which state wins.

Where supported, event/projection correlation SHOULD preserve:

```text
entity_ref
source_authority
source_revision / sequence / generation
event_id
causation_id
correlation_id
observed_at
received_at
```

Rules:

- a stale `RUNNING` callback MUST NOT regress an already-authoritative terminal `COMPLETED`, `FAILED`, `CANCELLED` or `QUARANTINED` state;
- terminal-state reopening requires an explicit new run/generation, not merely a late event;
- projection stores MAY rebuild from canonical events/reconciliation but MUST identify uncertainty if ordering cannot be proven;
- user-visible freshness indicators SHALL prefer authoritative generation/revision information over device clock time where available.

---

# 184. Indeterminate external side-effect outcome

Network timeout does not prove that an external side effect failed. This is critical for email/message sending, payment-like commitments, publication, external deployment mutations, destructive operations and provider jobs.

Spec 269 SHALL support an explicit state such as:

```text
COMMIT_UNKNOWN
RECONCILIATION_REQUIRED
```

when the platform cannot determine whether an externally committed side effect occurred.

Required behavior:

- do not blindly retry a non-idempotent side effect after ambiguous timeout;
- query/reconcile provider state where supported;
- use provider idempotency keys or stable SmartAIHub operation correlation where available;
- if outcome cannot be established automatically, create Attention with the known facts and safe options;
- economic settlement MUST remain correlated to the logical operation and avoid double charging merely because reconciliation/retry occurs.

---

# 185. Consistent RecoveryPointSet for stateful products

For stateful applications, restoring source code alone is insufficient. Recovery MAY require a mutually compatible set of release, environment bindings, durable data, object artifacts and migration position.

A `RecoveryPointSet` SHOULD reference, where applicable:

```yaml
RecoveryPointSet:
  product_ref: ref
  release_ref: ref
  environment_binding_set_ref: ref
  database_recovery_ref: ref|null
  schema_migration_position: string|null
  object_manifest_ref: ref|null
  vector/index_rebuild_ref: ref|null
  secret_binding_generation_requirements_ref: ref|null
  created_at: timestamp
  consistency_status: VERIFIED|PARTIAL|UNVERIFIED
  restore_verification_ref: ref|null
```

Rules:

- a rollback UI MUST NOT imply that code rollback alone restores a stateful product when compatible data state is also required;
- canonical database/object-storage/backup systems remain authoritative for snapshots and restore mechanics;
- derived indexes such as semantic/search indexes MAY be rebuildable rather than snapshot-restored when declared;
- restore evidence SHOULD verify release/data/schema compatibility before declaring recovery complete.

---

# 186. Public/shared Mini App consumer isolation

A public, Marketplace or shared Mini App introduces a second identity boundary: the **product creator/owner** and the **consumer invoking the product** are not the same principal.

Each runtime invocation SHOULD resolve a `ConsumerExecutionContext` containing/reference:

```text
product/release
consumer principal and tenant/scope where applicable
creator/product owner scope
consumer data namespace
authorized shared/public resources
consumer-specific memory policy
creator-owned service credential capability refs
consumer/tenant rate and resource quota refs
runtime budget/funding attribution
data retention/classification policy
```

Required rules:

- a consumer MUST NOT gain creator tenant private memory, project source, private artifacts or unrestricted secrets merely by invoking the Mini App;
- creator-owned service credentials MAY be used only through the specific capability/destination policy intended by the product;
- consumer inputs/results MUST be namespaced and authorized independently from the creator's development workspace;
- public/shared runtime MUST preserve tenant/caller identity through job, audit, billing and evidence correlation;
- application analytics MAY aggregate only according to privacy/data policy and MUST NOT silently become Assistant/Development memory.

---

# 187. External API, MCP and webhook contract compatibility

A deployed SmartAIHub product may expose APIs, MCP tools/resources or outgoing/incoming webhook schemas used by external clients. Breaking those contracts can damage users even when the internal application passes its own tests.

Externally consumable interfaces SHOULD have a versioned `ExternalContractSet` or equivalent reference containing:

```text
contract type: HTTP_API|MCP|WEBHOOK|EVENT|OTHER
schema/version
compatibility policy
authentication requirements
deprecation status
sunset date where applicable
consumer/migration documentation ref
contract test evidence ref
```

Rules:

- a breaking contract change MUST NOT be treated as an ordinary invisible implementation update;
- Production readiness SHOULD include contract tests for supported external interfaces;
- scheduled/deployed integrations pinned to an old contract version SHALL block or require migration when that version becomes unavailable;
- contract deprecation/migration SHOULD surface in Workboard/Needs You before forced removal where advance notice exists;
- Spec 269 owns product-level compatibility visibility, not the underlying API gateway or MCP transport implementation.

---

# 188. Attention and incident deduplication / flapping control

Needs You and incident escalation can themselves become unusable if one failing dependency produces hundreds of repeated alerts.

Attention/incident projection SHOULD support:

```text
incident/attention fingerprint
first_seen_at
last_seen_at
occurrence_count
severity
current_state
suppression/cooldown policy
escalation policy
related task/deployment/provider refs
```

Requirements:

- repeated equivalent events SHOULD coalesce while retaining occurrence count/evidence;
- health flapping MAY use hysteresis/cooldown before repeatedly notifying the user;
- suppression MUST NOT hide a severity escalation, new affected scope or materially changed required decision;
- resolution/reopen state must remain auditable;
- notification transport remains owned by the canonical notification/Attention system.

---

# 189. Audited break-glass and manual intervention boundary

Production incidents may require an authorized human/operator to intervene outside normal autonomous policy. Such access MUST be explicit rather than implemented as an undocumented bypass.

A break-glass request SHOULD require/reference:

```text
requesting principal
reason/incident ref
target resource/scope
requested action classes
maximum duration
approval policy
credential/access elevation ref
start/end/revoke timestamps
post-action reconciliation requirement
```

Break-glass:

- MUST be time-bounded and least-privilege;
- MUST be auditable and visibly distinguishable from normal Assistant authority;
- MUST NOT silently grant cross-tenant access, export secret bytes, remove audit requirements or create permanent new authority;
- SHOULD force post-action desired-vs-observed reconciliation and, where relevant, re-verification;
- is enforced by canonical IAM/security/approval systems; Spec 269 records the product/Assistant relationship and incident workflow.

---

# 190. DataDispositionPlan and deletion/retention truth

Archive, decommission and user deletion requests may touch multiple canonical stores and external processors. `DELETE_REQUESTED` MUST NOT be presented as fully erased until the applicable disposition obligations are reconciled.

A product/workspace MAY reference a `DataDispositionPlan` with classes such as:

```text
source repositories
project/development memory
runtime consumer data
PostgreSQL records
R2/object artifacts
Vector/search indexes
logs/audit
billing/legal records
provider-side artifacts/jobs
backups/snapshots
shared/deduplicated artifacts
```

Each class SHOULD resolve to a canonical disposition status:

```text
NOT_APPLICABLE
PENDING
DELETED
RETAINED_BY_POLICY
LEGAL_HOLD
SHARED_REFERENCE_RETAINED
PROVIDER_CONFIRMATION_PENDING
UNVERIFIABLE_EXTERNAL
```

Spec 269 does not own retention law or physical erasure mechanisms. It SHALL avoid falsely claiming complete deletion when canonical storage/provider evidence is still pending or policy requires retention.

---

# 191. ChangeSet provenance and mutation attribution

Future maintenance requires knowing not only what changed but also which human/Assistant/harness/policy caused the change.

A material source/configuration mutation SHOULD be attributable through a `ChangeSetProvenance` reference containing, as available:

```text
workspace/product
base revision
result revision/artifact digest
human principal
AssistantProfile
Task Agent / external harness/provider
goal/delegation/development-run refs
policy snapshot
approval refs
tool/runtime binding
verification/test evidence
timestamp
```

This is complementary to Git author/commit metadata; it MUST NOT require rewriting canonical Git history.

AI-assisted edits and human terminal takeovers SHOULD remain distinguishable in audit/provenance so later reviewers can reconstruct responsibility and verification context.

---

# 192. Runtime user-data boundary vs Assistant/Development memory

Production consumer/user data is not automatically development context.

Unless an explicit policy authorizes it:

- consumer prompts, uploaded files, sales records, customer PII, runtime logs and production database rows MUST NOT be copied into developer Assistant memory or DevelopmentWorkspace memory merely because they may help debugging;
- debugging access to production-derived data requires appropriate authorization, minimization and environment policy;
- representative samples SHOULD prefer masking, synthetic fixtures or scoped evidence references where practical;
- runtime conversation memory for a consumer SHALL remain scoped to that consumer/product policy and MUST NOT silently merge into creator/team memory;
- data selected for durable learning/memory MUST preserve provenance, classification and consent/retention semantics from the canonical memory/data authorities.

---

# 193. Scarce-resource admission and reservation

Known credit availability does not guarantee that scarce runtime capacity is available.

Before expensive or capacity-sensitive work starts, the planning layer SHOULD obtain or reference admission status for resources such as:

```text
GPU/runtime slot
container concurrency
sandbox quota
browser/computer-use slot
provider concurrency/rate quota
large temporary storage
high-egress operation
```

User-visible states MAY include:

```text
RESOURCE_AVAILABLE
RESOURCE_RESERVATION_PENDING
WAITING_FOR_CAPACITY
RESOURCE_RESERVATION_EXPIRED
RESOURCE_CLASS_UNAVAILABLE
```

Rules:

- do not start irreversible/expensive upstream work that depends on a known-unavailable critical resource without an explicit plan;
- a capacity reservation is not a financial settlement and MUST NOT become a second quota authority;
- expiry/loss of resource reservation follows no-silent-fallback and budget/funding-source policy;
- canonical scheduler/provider/runtime systems enforce actual capacity; Spec 269 projects admission and continuation state.

---

# 194. Automation/event feedback-loop prevention

Delegation cycle protection does not by itself prevent automation loops across event boundaries.

Example:

```text
App A update → webhook → Assistant B
Assistant B writes resource → event → App A
→ repeats indefinitely
```

Durable trigger execution SHOULD propagate a causation/origin chain or equivalent loop-detection fingerprint.

Policies SHOULD support:

```text
maximum trigger-chain depth
same-trigger recurrence threshold
same-resource/action cycle fingerprint
cooldown window
explicit allowlist for intentional feedback controllers
```

When a suspected loop exceeds policy, new activations SHALL pause/block rather than continue consuming credits/resources indefinitely. The original events/evidence remain inspectable for diagnosis.

---

# 195. R2.4 additional acceptance tests

In addition to all earlier acceptance suites, implementation MUST prove at least:

1. two concurrent Production promotion attempts cannot silently overwrite each other;
2. a stale deployment generation cannot publish after a newer promotion/rollback wins;
3. duplicate trigger event IDs create one logical activation under dedupe policy;
4. an unauthenticated external webhook cannot authorize Assistant side effects;
5. out-of-order provider callbacks cannot regress a terminal task/deployment projection;
6. schedule UI exposes effective IANA timezone for wall-clock schedules;
7. DST/misfire behavior follows the stored policy rather than runtime default guesswork;
8. outage recovery does not replay an unbounded schedule backlog when policy says bounded catch-up/skip;
9. ambiguous timeout after a non-idempotent side effect enters reconciliation-required state instead of blind retry;
10. a reconciled already-committed external action is not executed twice;
11. stateful rollback surfaces when release and database recovery points are incompatible;
12. RecoveryPointSet verification can detect mismatched artifact/schema/data references;
13. public Mini App consumer A cannot read consumer B's private runtime data;
14. public consumer cannot read creator project memory/source merely by invoking the app;
15. creator service credential is usable only through its authorized capability/destination;
16. a breaking public API/MCP contract change is blocked or explicitly migrated according to policy;
17. deprecated contract version produces visible compatibility action before removal when notice exists;
18. repeated identical production incidents coalesce instead of creating notification storms;
19. incident severity escalation bypasses ordinary duplicate suppression;
20. break-glass access expires and cannot silently become permanent authority;
21. break-glass activity is attributable and triggers post-action reconciliation where configured;
22. deletion UI distinguishes pending provider/backups/legal-hold state from confirmed deletion;
23. a shared artifact retained by policy is not falsely reported as physically erased;
24. an AI edit and a human terminal edit are separately attributable in ChangeSet provenance;
25. production consumer data does not enter creator Development memory without explicit authorized policy;
26. scoped masked/synthetic debugging data can be used without changing canonical production data;
27. known unavailable scarce capacity results in waiting/admission state rather than hidden runtime switch;
28. expired capacity reservation does not authorize a costlier provider automatically;
29. event causation chain can detect and stop a recursive cross-app automation loop;
30. all R2.4 hardening remains additive and requires no modification to implemented Specs 224/256.

---

# 196. R2.4 fifteen-pass gap review record

The R2.4 audit applied fifteen independent implementation lenses to R2.3:

| Pass | Lens | Gap found | R2.4 remediation |
|---:|---|---|---|
| 1 | Concurrent production mutation | General deployment locks existed but promotion/rollback/decommission race fencing was not explicit | Added deployment mutation generation/operation fencing |
| 2 | External trigger trust | Event-triggered work lacked a normalized authenticated replay-safe invocation envelope | Added `TriggerInvocationEnvelope` |
| 3 | Schedule clock semantics | Recurring activation did not define timezone/DST/misfire/catch-up behavior | Added explicit schedule clock/calendar semantics |
| 4 | Distributed event ordering | Late callbacks could regress user-visible projection without causal revision rules | Added monotonic event/projection causality |
| 5 | Ambiguous side effects | Timeout after external commit could be blindly retried | Added `COMMIT_UNKNOWN` / reconciliation-required behavior |
| 6 | Stateful disaster recovery | Release rollback and backup references lacked one consistent recovery-point abstraction | Added `RecoveryPointSet` |
| 7 | Public Mini App consumers | Creator-vs-consumer identity/data/memory boundary was underspecified | Added `ConsumerExecutionContext` isolation |
| 8 | External integration evolution | Public API/MCP/webhook schema compatibility was not first-class | Added versioned external contract policy |
| 9 | Attention operability | Repeated/flapping incidents could flood Needs You | Added dedupe, hysteresis/cooldown and escalation semantics |
| 10 | Emergency operations | Manual emergency intervention had no explicit bounded/audited contract | Added break-glass boundary |
| 11 | Deletion truth | Archive/decommission existed but multi-store/external deletion completion truth was incomplete | Added `DataDispositionPlan` projection |
| 12 | Mutation provenance | Git/audit references did not fully attribute human vs Assistant vs harness changes | Added `ChangeSetProvenance` |
| 13 | Production-data leakage into memory | Runtime consumer data could be over-ingested into development/team memory | Added explicit runtime-data/memory boundary |
| 14 | Capacity admission | Credit/quota limits did not model reservation/admission for scarce runtime capacity | Added resource admission/reservation projection |
| 15 | Cross-event automation loops | Delegation cycle guards did not stop webhook/event feedback loops | Added causation-chain feedback-loop prevention |

No R2.4 remediation requires reopening implemented Spec 224 or Spec 256.

---

# 197. R2.4 Definition of Done extension

Spec 269 R2.4 is not complete until all earlier Definition-of-Done requirements plus the following are demonstrated:

- Production mutations are serialized/fenced against stale concurrent promotion/rollback actors;
- external trigger execution is authenticated, deduplicated and causally traceable;
- durable schedules have explicit timezone/calendar/misfire semantics;
- projections resist stale/out-of-order callback regression;
- indeterminate external side effects reconcile before unsafe retry;
- stateful recovery can reference a compatible RecoveryPointSet;
- public/shared Mini Apps isolate creator, consumer and tenant data/authority;
- externally consumed API/MCP/webhook contracts have explicit compatibility/deprecation semantics;
- Attention/incident routing is operationally bounded against duplicate/flapping storms;
- break-glass access is time-bounded, least-privilege, auditable and reconciled;
- deletion/retention UI reports disposition truth rather than optimistic erasure;
- meaningful mutations have human/Assistant/harness provenance;
- production consumer data cannot silently become developer/Assistant memory;
- scarce capacity admission is explicit and obeys no-silent-fallback;
- trigger causation loops are bounded before runaway execution;
- Specs 224 and 256 remain implemented consume-only dependencies with no required modification.

---

# 198. R3.0 executive extension — Personal Intelligence, Chief of Staff & Adaptive Work

R3.0 upgrades the Assistant layer from a durable coworker/delegation runtime into a **relationship-aware Personal Intelligence and Adaptive Work layer**.

The R3 North Star is:

> **SmartAIHub SHALL learn the person, understand what matters, distinguish the user's words from the possible underlying outcome, prepare useful work ahead of time, bring multiple perspectives when judgment benefits from them, and convert repeated work into simpler deterministic software surfaces instead of forcing permanent prompt-driven interaction.**

R3 does **not** replace the canonical authorities already defined by R2.4. It adds interpretation, initiative, deliberation, adaptation and user-facing work strategy above them.

Canonical R3 boundaries:

```text
Spec 268  = canonical memory/context storage, recall, retention and learning authority
Spec 266  = canonical knowledge/evidence authority
Spec 256  = canonical Skill/capability discovery authority (consume-only; implemented)
Spec 269  = Assistant identity/responsibility + human-intent/initiative/deliberation/work-surface strategy
Spec 270  = canonical design artifact / UI design-intelligence authority
Spec 224  = canonical development orchestrator (consume-only; implemented)
Spec 261  = canonical portable application/package/product boundary
worker_jobs/control plane = canonical durable execution truth
```

R3 MUST NOT create a second memory store, second capability registry, second development orchestrator, second job source of truth or second UI design authority.

---

# 199. R3 product doctrine

The controlling product doctrine is:

```text
CHAT FOR AMBIGUITY
UI FOR REPETITION
LLM FOR JUDGMENT
SOFTWARE FOR ROUTINE
```

Additional invariants:

```text
USER WORDS ≠ ALWAYS THE UNDERLYING GOAL
INFERRED GOAL ≠ CONFIRMED GOAL
RECOMMENDATION ≠ DECISION
PREDICTED NEED ≠ AUTHORITY TO ACT
PROACTIVITY ≠ AUTONOMY
MULTI-AGENT ≠ MULTI-PERSPECTIVE VALUE
CONSENSUS ≠ EVIDENCE
REPEATED TASK ≠ MINI APP REQUIRED
CHAT ≠ REQUIRED SURFACE FOR EVERY ROUTINE
LLM CAN DO IT ≠ LLM SHOULD BE CALLED FOR IT
```

SmartAIHub SHALL prefer real outcomes over accumulation of prompts, bots, Skills or workflows as ends in themselves.

---

# 200. HumanIntentFrame

Spec 256 remains the capability/intent-to-action authority for executable capability selection. R3 adds a higher-level **HumanIntentFrame** used before solution strategy is chosen.

Conceptual contract:

```ts
interface HumanIntentFrame {
  frameId: string;
  principalId: string;
  scopeRef?: string;
  surfaceContext: InteractionSurfaceContext;

  statedRequest: string;
  literalIntent: string;
  behaviorMode: 'DO' | 'DELEGATE' | 'TEACH' | 'BUILD' | 'PRODUCTIZE';

  underlyingGoalHypotheses: GoalHypothesis[];
  decisionMaturity: 'EXPLORE' | 'CONSIDER' | 'PREFERRED' | 'DECIDED' | 'MANDATED';

  ambiguityScore: number;
  consequenceClass: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reversibility: 'EASY' | 'BOUNDED' | 'DIFFICULT' | 'IRREVERSIBLE';

  shouldClarify: boolean;
  shouldChallengePremise: boolean;
  shouldConvenePerspectives: boolean;

  contextReceiptRef: string;
  generatedAt: string;
}
```

`HumanIntentFrame` is a runtime interpretation and MUST NOT silently overwrite the user's canonical memory, project decision or mandate.

---

# 201. Stated request vs underlying goal

A user message MAY express a candidate solution rather than the actual desired outcome.

Example:

```text
Stated request:
“Create AI-news Reels every morning.”

Possible underlying goals:
- grow audience;
- increase product awareness;
- establish authority;
- create leads;
- execute a previously approved content plan.
```

The Assistant MAY infer possible underlying goals from authorized context, but every inferred goal MUST remain explicitly typed as an inference until confirmed by user/context authority.

A high-value clarification SHOULD be asked when:

- different underlying goals would materially change the solution;
- the work is recurring, costly or strategic;
- the current direction has weak evidence;
- the user has not already declared the decision final.

The Assistant SHOULD NOT ask “why?” mechanically for low-cost reversible actions where doing the requested work is clearly useful.

---

# 202. GoalHypothesis

```ts
interface GoalHypothesis {
  hypothesisId: string;
  frameId: string;
  goal: string;
  confidence: number;
  scope: 'USER' | 'PROJECT' | 'TEAM' | 'TENANT' | 'TASK';
  basisRefs: string[];
  status: 'INFERRED' | 'CONFIRMED' | 'REJECTED' | 'SUPERSEDED';
  createdAt: string;
  updatedAt: string;
}
```

Rules:

- explicit user confirmation outranks model inference;
- rejected hypotheses MUST NOT continue to drive behavior as if confirmed;
- stale hypotheses SHOULD decay from active decision relevance;
- a private personal goal MUST NOT be promoted to project/team truth without policy/authority;
- underlying-goal inference MUST obey Spec 268 privacy and memory-mode policy.

---

# 203. Decision maturity

R3 defines a decision-maturity dimension independent from task type:

```text
EXPLORE    still understanding the problem
CONSIDER   candidate direction exists; alternatives welcome
PREFERRED  direction favored; strong evidence may change it
DECIDED    decision made; optimize execution
MANDATED   externally/organizationally fixed; do not reinterpret as optional
```

Rules:

- a `DECIDED` or `MANDATED` state SHOULD suppress unnecessary strategic reopening;
- materially new evidence MAY create a concise escalation/reconsideration proposal rather than silently changing the decision;
- user language such as “we already approved this”, “the customer requires this”, or “do not change the format” SHOULD be strong maturity evidence;
- maturity inference MUST remain correctable by the user.

---

# 204. InteractionSurfaceContext

The same words MAY reasonably imply different expected outcomes depending on the surface where they are expressed.

```ts
interface InteractionSurfaceContext {
  kind:
    | 'SMARTAIHUB_CHAT'
    | 'DEVELOPER_HARNESS'
    | 'PERSISTENT_BOT'
    | 'SPECIALIZED_WORKSPACE'
    | 'MINI_APP'
    | 'API_HEADLESS';
  providerOrHarnessRef?: string;
  workspaceRef?: string;
  appRef?: string;
}
```

Default priors MAY include:

```text
SMARTAIHUB_CHAT
→ outcome/operate/advise prior

DEVELOPER_HARNESS
→ build/author prior

PERSISTENT_BOT
→ delegate/own/learn-routine prior

SPECIALIZED_WORKSPACE
→ operate on visible structured state prior
```

Surface context is a prior only. Explicit user wording MUST override it.

---

# 205. Personal Operator / Chief-of-Staff interaction model

Primary Assistant SHALL support a Personal Operator / Chief-of-Staff behavior in which it can:

- understand goals and constraints;
- prepare options and examples;
- make recommendations;
- coordinate Specialists;
- synthesize disagreement;
- identify decisions that require the user;
- execute approved work;
- monitor outcomes;
- learn recurring patterns;
- proactively prepare future work.

Primary MUST NOT claim universal expertise merely because it is the relationship owner. When specialist judgment is materially useful, it SHOULD route to appropriate Specialist perspectives or external evidence sources.

---

# 206. Functional multi-perspective deliberation

SmartAIHub SHALL support **multi-perspective deliberation** distinct from ordinary parallel task execution.

Examples of functional objective templates:

```text
Sales       → conversion, buyer pain, lead quality
Marketing   → reach, attention, differentiation, CAC/retention
PR          → reputation, narrative, trust
Product     → product truth, value, feasibility
Finance     → ROI, affordability, sustainability
Legal       → rights, compliance, contractual/regulatory risk
Research    → evidence, market/trend verification
Operations  → repeatability, reliability, staffing/process impact
```

A deliberation MUST NOT merely duplicate the same prompt across multiple agents and call the result “diverse.”

Each selected perspective SHOULD receive:

- decision question;
- role objective;
- relevant context;
- evidence requirements;
- constraints;
- cost/round limit.

---

# 207. DeliberationPlan

```ts
interface DeliberationPlan {
  deliberationId: string;
  goalRef?: string;
  question: string;
  decisionOwnerPrincipalId: string;
  perspectiveRequests: PerspectiveRequest[];
  evidenceRequirements: string[];
  maxRounds: number;
  budgetRef?: string;
  synthesisMode: 'OPTIONS' | 'RECOMMENDATION' | 'EXPERIMENT_PLAN';
  status: 'PLANNED' | 'GATHERING' | 'SYNTHESIZING' | 'WAITING_DECISION' | 'DECIDED' | 'CANCELLED' | 'FAILED';
}
```

Primary SHOULD select the minimum useful set of perspectives rather than convene a large team by default.

The user MAY add/remove perspectives or question a specific role directly.

---

# 208. Evidence / inference / opinion separation

Deliberation output SHOULD distinguish at least:

```text
FACT
INFERENCE
OPINION
ASSUMPTION
HYPOTHESIS
```

Rules:

- multiple opinions agreeing does not convert an opinion into a fact;
- factual claims requiring current verification SHOULD use Spec 266 evidence references where available;
- conflicting recommendations MUST preserve the meaningful disagreement;
- Primary MUST NOT silently average incompatible recommendations;
- when uncertainty is testable, the synthesis SHOULD consider a bounded experiment.

---

# 209. Premise challenge and Challenge Budget

SmartAIHub SHOULD be capable of challenging a requested approach when there is material reason to believe the user may be optimizing the wrong solution.

Challenge priority factors MAY include:

```text
recurring cost
strategic/reputational impact
irreversibility
goal-solution mismatch
new contradictory evidence
high opportunity cost
user decision maturity
```

Default principle:

> **Low-cost reversible action → bias toward doing. High-cost recurring strategic action → bias toward understanding the goal first.**

A `ChallengeBudget` SHOULD prevent the system from reopening every decision or repeatedly nagging after the user has confirmed a choice.

A premise challenge SHOULD be concise and materially useful, for example:

> “I can do this, but if your real goal is page growth rather than publishing AI news itself, I think we should compare a few content strategies before automating the current one.”

---

# 210. PersonContextSnapshot projection

Spec 268 remains canonical memory/context authority. Spec 269 MAY create an authorized short-lived **PersonContextSnapshot** projection for Assistant reasoning.

```ts
interface PersonContextSnapshot {
  snapshotId: string;
  principalId: string;
  scopeRef?: string;
  activeGoalRefs: string[];
  confirmedPreferenceRefs: string[];
  recentDecisionRefs: string[];
  activeProjectRefs: string[];
  routineSignalRefs: string[];
  workingPatternSignalRefs: string[];
  currentConstraintRefs: string[];
  contextReceiptRef: string;
  generatedAt: string;
  expiresAt: string;
}
```

The snapshot MUST NOT become a second canonical personal-memory store.

Authorization MUST be resolved before referenced memories are hydrated.

---

# 211. Relationship intelligence and context compression

The Primary Assistant SHOULD learn how the person normally works, not only static facts.

Useful learned signals MAY include:

- repeated information-review sequences;
- common follow-up questions;
- preferred comparison frames;
- recurring approval behavior;
- repeated rejected suggestions;
- recurring project review patterns;
- common next actions after a trigger type.

The desired product effect is **context compression**: repeated tasks SHOULD require less re-explanation over time while preserving correctness.

R3 MUST NOT equate “shorter user prompt” with permission to take broader side effects.

---

# 212. PatternCandidate projection

Behavioral patterns SHALL be modeled as evidence-backed, scoped, correctable projections rather than permanent personality truth.

```ts
interface PatternCandidate {
  patternId: string;
  principalOrScopeRef: string;
  triggerClass: string;
  expectedNextNeeds: string[];
  observedCount: number;
  confidence: number;
  exceptionRate: number;
  evidenceRefs: string[];
  firstObservedAt: string;
  lastObservedAt: string;
  status: 'CANDIDATE' | 'CONFIRMED' | 'DISMISSED' | 'STALE' | 'SUPERSEDED';
}
```

Rules:

- pattern confidence SHOULD consider frequency, recency, consistency and exceptions;
- patterns MUST be scoped by context/domain where appropriate;
- one contradictory occurrence MUST NOT necessarily erase a stable pattern;
- stale patterns MUST stop dominating current behavior;
- user correction/dismissal MUST be respected;
- low-confidence observations SHOULD expire rather than accumulate forever;
- sensitive inferences require Spec 268 policy treatment and MAY be prohibited from durable pattern learning.

---

# 213. Prediction and anticipation boundary

The Assistant MAY predict likely next needs from context/patterns, but prediction is not execution authority.

Conceptual levels:

```text
REMEMBER
→ RECOGNIZE
→ ANTICIPATE
→ PREPARE
→ ACT (only within authority)
```

Examples:

- after repeated competitor-news reviews, prepare competitor comparison automatically;
- before a known meeting, prepare a briefing pack;
- when a tracked metric deteriorates, prepare a diagnosis/proposal;
- do not send external messages merely because the system predicts the user would probably want them sent.

---

# 214. Relevance / What Matters Now

SmartAIHub SHALL support a person-specific relevance layer capable of answering questions such as:

> “What should I know today?”

Relevance is not equivalent to recency. Ranking SHOULD consider, where available:

```text
relationship to current goals
urgency / deadline
novelty
material impact
known interests/responsibilities
active projects
risk/opportunity
confidence
attention cost
```

The same external event SHOULD be ranked differently for different authorized principals.

---

# 215. RelevanceSignal

```ts
interface RelevanceSignal {
  relevanceSignalId: string;
  principalScopeRef: string;
  signalRef: string;
  relevanceScore: number;
  urgencyScore: number;
  noveltyScore: number;
  confidence: number;
  reasonCodes: string[];
  createdAt: string;
  expiresAt?: string;
  suppressedUntil?: string;
}
```

Low-value RelevanceSignals SHOULD be ephemeral and SHOULD NOT require indefinite PostgreSQL retention.

---

# 216. Proactive initiative ladder

R3 defines a canonical initiative ladder:

```text
L1 OBSERVE
L2 INFORM
L3 DIAGNOSE
L4 RECOMMEND
L5 PREPARE
L6 PROPOSE_EXPERIMENT
L7 EXECUTE_WITH_AUTHORITY
```

An Assistant's authority mode and initiative level are related but not identical.

Examples:

- `PREPARE` may create a draft/mockup without publishing it;
- `PROPOSE_EXPERIMENT` may prepare a one-week pilot plan but still require approval;
- `EXECUTE_WITH_AUTHORITY` requires existing policy/grant for the relevant side effects.

A user/tenant SHOULD be able to configure initiative ceilings by domain/action class.

---

# 217. Proactive nuisance budget

A proactive Assistant MUST remain useful rather than become a notification generator.

Policies SHOULD support:

```text
maximum proactive cards per period
minimum confidence/value threshold
quiet hours
repeat-proposal cooldown
suppressed topics/actions
snooze/dismiss feedback
maximum strategic proposals per period
exception escalation bypass
```

A dismissed proposal SHOULD inform future ranking. One dismissal MUST NOT automatically become a permanent global prohibition unless the user expresses that intent.

---

# 218. Proactive Opportunity & Correction Engine

SmartAIHub SHALL support a bounded engine that compares observed outcomes against goals/routines and can prepare corrective or opportunity proposals.

Potential triggers include:

- performance degradation;
- repeated task failure;
- excessive cost/latency;
- declining engagement/conversion;
- unused capability that materially improves a recurring task;
- new market/technology signal relevant to an active goal;
- strong mismatch between current method and desired outcome;
- user correction history indicating the routine needs redesign.

The engine MUST produce a proposal/diagnosis before strategic mutation unless existing authority explicitly permits the change.

---

# 219. ProactiveProposal

```ts
interface ProactiveProposal {
  proposalId: string;
  ownerPrincipalId: string;
  goalRef?: string;
  triggerEvidenceRefs: string[];
  observedProblemOrOpportunity: string;
  diagnosis: string;
  alternatives: AlternativeSummary[];
  recommendationRef?: string;
  preparedArtifactRefs: string[];
  experimentPlanRef?: string;
  confidence: number;
  initiativeLevel: string;
  requiredAuthorityClass: string;
  status: 'DRAFT' | 'READY' | 'PRESENTED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'SUPERSEDED';
  createdAt: string;
  expiresAt?: string;
}
```

A useful proposal SHOULD answer:

- what changed;
- why it matters;
- what evidence supports the diagnosis;
- what alternatives exist;
- what the Assistant recommends and why;
- what has already been prepared;
- what decision/authority is needed;
- how success/failure will be measured.

---

# 220. Prepared artifacts before asking

When cost/risk permits, SmartAIHub SHOULD prepare concrete artifacts that reduce the cognitive burden of deciding.

Examples:

- current real examples instead of abstract categories;
- UI/video mockups;
- sample scripts;
- comparison tables;
- draft workflow;
- prototype;
- experiment plan;
- report with trend/metrics;
- briefing pack.

The platform SHOULD prefer “show me” over long configuration interviews when a small preview is cheaper than asking the user to imagine the result.

---

# 221. ExperimentProposal

When recommendations are uncertain and testable, the Assistant SHOULD prefer a bounded experiment over confident speculation.

```ts
interface ExperimentProposal {
  experimentId: string;
  hypothesis: string;
  variants: ExperimentVariant[];
  durationOrSampleSize: string;
  successMetrics: string[];
  guardrailMetrics: string[];
  estimatedCostRef?: string;
  stopConditions: string[];
  rollbackPlan?: string;
  requiredApprovalClass: string;
}
```

Experiment execution MUST follow ordinary approval, budget, publishing and external-side-effect controls.

---

# 222. Routine Crystallization

R3 introduces **Routine Crystallization**: repeated conversational work MAY be promoted into a more structured, cheaper and easier interaction surface.

Canonical evolution:

```text
Conversation
→ repeated task
→ learned/confirmed routine
→ reusable workflow/action
→ structured card/widget
→ dedicated workspace
→ specialized Mini App
→ optional SPAAS/white-label product
```

Promotion MUST remain reuse-first. A repeated task does not automatically justify a new Mini App.

The system SHOULD consider crystallization when:

- the task repeats materially;
- data/state must be browsed repeatedly;
- users repeatedly issue the same filters/searches/actions;
- there are stable approval stages;
- history/dashboard/search improves usability;
- deterministic software can replace repeated LLM calls;
- a team needs a shared operational surface;
- the current prompt-driven flow creates unnecessary friction/cost.

---

# 223. RoutineSurfaceRecommendation

```ts
interface RoutineSurfaceRecommendation {
  recommendationId: string;
  routineRef: string;
  currentSurface: string;
  recommendedLevel:
    | 'CHAT'
    | 'SAVED_ROUTINE'
    | 'STRUCTURED_CARD'
    | 'WIDGET'
    | 'WORKSPACE'
    | 'MINI_APP'
    | 'EXTERNAL_PRODUCT';
  reusableCapabilityRefs: string[];
  deterministicOperations: string[];
  llmOperations: string[];
  rationale: string;
  expectedInteractionReduction?: number;
  expectedCostReduction?: number;
  requiresUserApproval: boolean;
  status: 'CANDIDATE' | 'PROPOSED' | 'ACCEPTED' | 'DISMISSED' | 'IMPLEMENTING' | 'ACTIVE' | 'RETIRED';
}
```

Spec 270 owns design artifact generation. Spec 224 owns software implementation. Spec 261 owns portable package/productization when the solution crosses that boundary.

---

# 224. UI maturity ladder

The preferred surface ladder is:

```text
L0 Chat only
L1 Saved action/routine
L2 Chat + structured result/card
L3 Widget/panel
L4 Dedicated workspace
L5 Specialized Mini App
L6 External/white-label product
```

The Solution Strategy Resolver SHALL choose the least-complex surface that satisfies the recurring job.

A user MAY explicitly request a higher-customization level.

---

# 225. Deterministic software vs LLM boundary

R3 requires a deliberate boundary between ordinary software operations and intelligence calls.

The following SHOULD be deterministic when authoritative structured data already exists:

- list/filter/sort;
- pagination;
- direct field search/index lookup;
- status display;
- CRUD;
- known workflow state transitions;
- schedules/calendar rendering;
- dashboard/chart rendering;
- history/audit retrieval;
- permissions/authority checks;
- dedupe/idempotency.

LLM/Agent calls SHOULD be reserved for value-adding operations such as:

- ambiguous intent interpretation;
- summarization;
- semantic analysis;
- diagnosis;
- recommendations;
- creative generation;
- exception handling;
- complex ranking where rules/data alone are insufficient;
- deliberation/synthesis.

A mature routine SHOULD generally reduce LLM dependence for deterministic operations.

---

# 226. Hybrid Workspace + Assistant

A dedicated workspace SHOULD retain an embedded Assistant entry point.

Example:

```text
Content Workspace
├─ Candidates
├─ Drafts
├─ Scheduled
├─ Published
├─ Performance
└─ Ask Assistant
```

The embedded Assistant SHOULD receive authorized workspace context automatically and SHOULD NOT require the user to restate obvious visible state.

The UI remains a projection/control surface over canonical data, not a separate source of truth.

---

# 227. Morning Brief / What Matters Now experience

Primary SHOULD support a personalized “What should I know?” experience when the required sources and permissions exist.

The brief MAY combine:

- current project changes;
- relevant external/news/product signals;
- deadlines and calendar context;
- monitored KPIs;
- delegated-work blockers;
- recurring personal/professional interests;
- proactive proposals;
- time-sensitive reminders.

The brief SHOULD prioritize rather than dump all available information.

Each non-obvious item SHOULD be able to explain why it was considered relevant.

---

# 228. Morning Brief safety and restraint

Morning Brief MUST NOT imply access to data the user has not authorized.

It SHOULD:

- deduplicate repeated items;
- suppress low-novelty noise;
- respect quiet hours and sensitivity policy;
- distinguish live facts from remembered context;
- avoid speculative personal claims;
- avoid turning every remembered interest into a daily topic;
- allow users to say “less of this / more of this / stop showing this.”

---

# 229. Native harness and managed-bot delegation

SmartAIHub SHOULD preserve the intelligence of strong native execution environments.

When delegating to Codex/Claude/Hermes/Grok-class or another supported harness/bot, SmartAIHub SHOULD pass a thin execution contract containing:

```text
goal
constraints
authority ceiling
budget
required evidence
definition of done
result return contract
```

The provider/runtime MAY own its internal planning, subagents, context management, tool ordering and retries where policy permits.

SmartAIHub MUST NOT introduce redundant orchestration layers merely for architectural uniformity.

SmartAIHub remains responsible for:

- canonical task/user/tenant attribution;
- person/project context selection;
- policy/approval ceiling;
- budget/accounting integration;
- cross-provider routing;
- result/artifact integration;
- productization/workspace integration;
- user-visible continuity.

---

# 230. Cost-aware intelligence escalation

R3 SHOULD use the least-expensive sufficient computation path:

```text
deterministic query/cache/rules
→ local/small model
→ medium model
→ strong model
→ multi-perspective strong-model deliberation
```

Escalation SHOULD consider:

- uncertainty;
- consequence;
- novelty;
- complexity;
- expected user value;
- latency requirement;
- available local/user-owned subscriptions;
- budget policy.

A multi-agent meeting MUST NOT be the default response to ordinary tasks.

---

# 231. Suggested R3 projections and persistence

Implementation reconciliation MUST search for existing equivalent stores before creating new tables.

If no canonical equivalent exists, Spec 269 MAY own Assistant-layer projections such as:

```text
assistant_goal_hypotheses
assistant_pattern_candidates
assistant_proactive_proposals
assistant_deliberation_sessions
assistant_deliberation_contributions
assistant_experiment_proposals
assistant_routine_surface_recommendations
assistant_initiative_policies
assistant_proactive_feedback
```

`PersonContextSnapshot` and low-value `RelevanceSignal` records SHOULD normally be TTL/ephemeral projections unless audit/reproducibility policy requires retention.

Spec 269 MUST NOT duplicate raw memory items from Spec 268.

---

# 232. Suggested R3 services

Logical services/adapters MAY include:

```text
HumanIntentInterpreter
GoalHypothesisService
DecisionMaturityResolver
ContextExpansionPlanner
PersonContextProjector
PatternCandidateService
RelevancePlanner
AnticipationService
InitiativePolicyService
PremiseChallengeService
DeliberationDirector
ProactiveOpportunityService
ExperimentProposalService
RoutineCrystallizationService
SurfaceStrategyResolver
MorningBriefComposer
```

These are logical responsibilities. Implementations SHOULD merge them where simpler and MUST NOT create microservices solely because they are separately named here.

---

# 233. Suggested R3 APIs

Only add endpoints after G0 reconciliation with existing Assistant/Goal/Task APIs.

Conceptual surfaces:

```text
POST /assistant/interpret
GET  /assistant/proactive-proposals
POST /assistant/proactive-proposals/:id/accept
POST /assistant/proactive-proposals/:id/reject
POST /assistant/proactive-proposals/:id/snooze

POST /assistant/deliberations
GET  /assistant/deliberations/:id
POST /assistant/deliberations/:id/decide

GET  /assistant/routine-recommendations
POST /assistant/routine-recommendations/:id/accept
POST /assistant/routine-recommendations/:id/dismiss

GET  /assistant/morning-brief
POST /assistant/relevance-feedback
```

Where an existing Attention Inbox action can represent the same user decision, reuse it rather than invent a parallel approval system.

---

# 234. R3 events / observability

Suggested events:

```text
assistant.intent_frame.created
assistant.goal_hypothesis.confirmed
assistant.goal_hypothesis.rejected
assistant.pattern.candidate_created
assistant.pattern.confirmed
assistant.pattern.stale
assistant.deliberation.started
assistant.deliberation.completed
assistant.proactive_proposal.ready
assistant.proactive_proposal.accepted
assistant.proactive_proposal.rejected
assistant.routine_surface.proposed
assistant.routine_surface.accepted
assistant.morning_brief.generated
assistant.relevance_feedback.recorded
```

Metrics SHOULD include:

- repeated-prompt compression;
- proactive proposal acceptance/dismissal ratio;
- nuisance/suppression rate;
- clarification rate;
- premise-challenge acceptance rate;
- deliberation cost/time;
- routine crystallization acceptance rate;
- LLM cost before/after crystallization;
- deterministic operation ratio in mature workspaces;
- outcomes completed per recurring routine;
- user corrections after inferred goal/pattern use.

Metrics MUST NOT turn private content into globally visible analytics without policy.

---

# 235. User correction and transparency

Users MUST be able to correct materially wrong interpretations.

Examples:

```text
“That is not why I am doing this.”
“Do not challenge this decision again.”
“This is already approved.”
“I want more updates like this.”
“Stop showing me this topic.”
“This routine changed.”
```

Corrections SHOULD update the relevant projection/memory according to Spec 268 policy, while preserving audit/provenance where applicable.

The system SHOULD be able to explain, at an appropriate level, why a proactive recommendation appeared.

---

# 236. Privacy and sensitive inference

Relationship intelligence increases privacy risk and therefore MUST follow purpose and scope limits.

Requirements:

- do not infer or persist sensitive personal traits merely because they could improve personalization;
- do not combine household/team member contexts without explicit authorization;
- do not disclose private user patterns to shared/team/tenant surfaces by default;
- predictions and patterns MUST remain scoped;
- provider disclosure MUST be minimized;
- low-confidence behavioral observations SHOULD have bounded retention;
- memory-off / temporary modes MUST suppress durable pattern learning according to Spec 268;
- user deletion/forget semantics MUST propagate to dependent active projections where lineage requires it.

---

# 237. R3 implementation sequence

Recommended implementation order:

```text
R3-P1 HumanIntentFrame + decision maturity + context expansion
R3-P2 PersonContextSnapshot + GoalHypothesis + corrections
R3-P3 PatternCandidate + anticipation
R3-P4 Initiative ladder + proactive proposal object + nuisance budget
R3-P5 Deliberation Director + role objectives + evidence/opinion typing
R3-P6 Opportunity/Correction Engine + ExperimentProposal
R3-P7 Routine Crystallization + Surface Resolver + Spec 270/224 integration
R3-P8 Morning Brief / What Matters Now
R3-P9 Cost optimization + deterministic-workspace conversion metrics
```

Do not begin by creating dozens of always-running department Assistants. Correct context, role objectives, authority and synthesis are higher priority.

---

# 238. R3 migration / compatibility

R3 is additive to R2.4.

Existing Assistants, schedules, delegations, workflows, Mini Apps and provider bindings remain valid.

Default behavior for users without R3 state:

- ordinary Chat continues;
- no inferred goal is treated as confirmed;
- no proactive proposal is created without authorized trigger/data;
- no routine is converted to UI without explicit/authorized acceptance;
- existing authority ceilings remain unchanged;
- existing implemented Specs 224/256 require no modifications.

Feature flags SHOULD allow independent rollout of:

```text
human_intent_frame
pattern_learning
proactive_proposals
deliberation_director
routine_crystallization
morning_brief
```

---

# 239. R3 acceptance tests

Implementation MUST prove at least:

## Human intent / goal

1. the same phrase can produce different recommended handling when one context is `EXPLORE` and another is `DECIDED`;
2. an inferred underlying goal is never persisted/presented as user-confirmed without confirmation/equivalent authority;
3. user rejection of a goal hypothesis stops it from controlling subsequent decisions;
4. a mandated task is not repeatedly reopened by premise challenge;
5. a low-cost reversible request can proceed without unnecessary “why” interrogation;
6. a high-cost recurring strategic request can create one concise goal clarification before automation;

## Surface context

7. the same request from SmartAIHub Chat may default to outcome-oriented handling while a developer-harness surface may default to build-oriented handling;
8. explicit wording overrides the surface prior;
9. a specialized workspace operation uses current authorized workspace context without requiring the user to restate visible state;

## Relationship / patterns

10. repeated user workflow can produce a `PatternCandidate` with evidence, confidence and scope;
11. pattern confidence decreases/stales when observations stop matching over time;
12. one exception does not necessarily erase a stable confirmed pattern;
13. a dismissed pattern does not keep reappearing as confirmed truth;
14. private user pattern is not exposed to shared team context without authorization;
15. memory-off/temporary mode prevents prohibited durable pattern learning;

## Deliberation

16. a strategic question can convene Sales/PR/Product-style perspectives with distinct objectives;
17. two identical cloned prompts without distinct role objectives do not qualify as successful functional deliberation;
18. synthesis preserves meaningful disagreement;
19. factual evidence, inference and opinion remain distinguishable;
20. consensus is not reported as proof merely because multiple perspectives agree;
21. a testable disagreement can produce a bounded ExperimentProposal;

## Proactive preparation

22. monitored KPI degradation can create one deduplicated proactive proposal;
23. proposal includes evidence, diagnosis, alternatives, recommendation and required authority;
24. proposal may prepare a safe mockup/draft before approval when policy permits;
25. proposal cannot publish/change strategy without authority;
26. repeated rejected proposals are cooled down/suppressed according to policy;
27. emergency/high-severity conditions can bypass ordinary nuisance suppression when policy allows;

## Routine crystallization

28. repeated chat work can recommend a structured card/workspace without forcing a Mini App;
29. a simple saved action is preferred over a new Mini App when sufficient;
30. accepted workspace generation routes design through Spec 270 and implementation through Spec 224;
31. generated workspace uses deterministic list/filter/status operations without unnecessary LLM calls;
32. embedded Assistant can still analyze/advise using current workspace state;
33. promotion to Mini App/SPAAS preserves compatible configuration/artifacts where possible;

## Morning brief / relevance

34. “What should I know today?” produces different relevant briefs for principals with different authorized contexts;
35. brief prioritizes rather than dumps every monitored event;
36. user can give relevance feedback that affects future ranking without silently creating overbroad global preference;
37. stale remembered interest does not indefinitely dominate current brief;
38. current live state is not replaced by stale memory;

## Harness/bot / cost

39. delegation to a native harness can allow the harness to manage its internal plan while SmartAIHub preserves goal/authority/result contracts;
40. SmartAIHub does not add a redundant agent loop when the native runtime already satisfies the execution requirement;
41. deterministic query is preferred over an LLM call for a simple structured list when feasible;
42. multi-agent deliberation is not used for trivial tasks by default;
43. user-owned subscription/local model may be selected according to existing cost/routing policy without changing Assistant identity;

## Compatibility / authority

44. R3 implementation does not change canonical memory authority from Spec 268;
45. R3 implementation does not change capability authority from Spec 256;
46. R3 implementation does not change development authority from Spec 224;
47. R3 implementation does not change portable package authority from Spec 261;
48. proactive prediction never widens side-effect authority;
49. Attention Inbox remains reusable for human decisions rather than creating a second approval system;
50. existing R2.4 Assistant remains functional when all R3 feature flags are disabled.

---

# 240. R3 twenty-pass gap review record

R3.0 was reviewed against twenty independent product/implementation lenses:

| Pass | Lens | R3 resolution |
|---:|---|---|
| 1 | Literal intent vs real goal | Added HumanIntentFrame and GoalHypothesis |
| 2 | User already decided | Added Decision Maturity and challenge suppression |
| 3 | Over-questioning | Added consequence/reversibility-based clarification threshold |
| 4 | Surface expectation | Added InteractionSurfaceContext priors with explicit override |
| 5 | Relationship continuity | Added PersonContextSnapshot and context-compression goal |
| 6 | Behavioral memory overreach | Patterns are scoped projections with confidence/expiry/correction |
| 7 | Proactivity vs authority | Added initiative ladder and explicit authority boundary |
| 8 | Proactive notification spam | Added nuisance budgets/cooldowns/suppression |
| 9 | Strategy correction | Added Opportunity & Correction Engine and ProactiveProposal |
| 10 | Opinion without evidence | Added fact/inference/opinion typing and evidence references |
| 11 | Fake multi-agent diversity | Added functional role objectives and minimum useful team rule |
| 12 | Endless debate | Added bounded rounds and ExperimentProposal path |
| 13 | Chat-only product trap | Added Routine Crystallization and UI maturity ladder |
| 14 | LLM cost/latency | Added deterministic-vs-LLM boundary and cost-aware escalation |
| 15 | Mini App explosion | Reuse-first surface resolver keeps simple routines simple |
| 16 | Generated UI authority | Kept Spec 270/224/261 boundaries explicit |
| 17 | Native bot intelligence loss | Added thin delegation contract / no redundant orchestration |
| 18 | Morning brief irrelevance | Added person-specific relevance, novelty and attention controls |
| 19 | Privacy of inferred behavior | Added scope, sensitive-inference and memory-mode requirements |
| 20 | Backward compatibility | R3 feature flags, unchanged R2.4 authority and acceptance test |

No R3 remediation requires reopening implemented Spec 224 or Spec 256.

---

# 241. R3.0 Definition of Done extension

Spec 269 R3.0 is not complete until all R2.4 Definition-of-Done requirements remain satisfied and the platform demonstrates:

- a typed distinction between stated request, inferred/confirmed goal and decision maturity;
- SmartAIHub can stop challenging a decision after the user establishes it as decided/mandated;
- Primary can convene functionally distinct perspectives and synthesize disagreements without fabricating consensus;
- repeated working patterns can be learned as scoped, correctable projections without becoming universal personal truth;
- prediction can trigger preparation without granting execution authority;
- monitored outcomes can generate evidence-backed proactive proposals with prepared artifacts and bounded experiments;
- proactive assistance is limited by nuisance/attention policy;
- recurring work can be promoted from Chat into a deterministic structured surface when justified;
- ordinary list/filter/status operations in mature workspaces do not require LLM calls by default;
- the Assistant remains available inside structured workspaces for judgment/analysis/exceptions;
- “What should I know today?” can produce person-specific prioritized output from authorized context;
- strong native harnesses/bots can retain their internal execution intelligence without redundant SmartAIHub micro-orchestration;
- Spec 268/266/256/270/224/261/control-plane boundaries remain authoritative and non-duplicated;
- R3 can be disabled without breaking existing R2.4 Assistants.
---

# 242. Work Definition Artifact and scope maturity

SmartAIHub SHALL NOT force a full specification for every task. Once the system understands what work is requested, it SHALL choose the least-heavy durable work-definition artifact that still makes scope, acceptance and authority clear.

Canonical levels:

```text
QUICK_BRIEF
  small/reversible task; concise objective + expected output

EXECUTION_PLAN
  multi-step or recurring work; scope + steps + owners + acceptance

IMPLEMENTATION_SPEC
  software/workflow/Mini App/system change, strategic recurring operation,
  or another task whose complexity/risk/maintenance justifies a full spec
```

A work-definition artifact SHOULD include, as applicable:

```text
stated request
confirmed or explicitly-labeled inferred goal
scope / deliverables
non-goals / exclusions
assumptions
constraints / authority
reuse candidates
major design/solution choices
runtime/deployment implications
cost/budget estimates
acceptance criteria
UAT strategy proposal
risks / rollback / recovery
open decisions
```

The user MUST be able to open the full artifact, but ordinary execution MUST NOT require the user to read the entire artifact when a concise approval digest is sufficient.

A material change to approved scope SHALL create a versioned revision/delta rather than silently mutating the approved definition.

---

# 243. Scope hardening and multi-pass review

For `IMPLEMENTATION_SPEC` and other high-consequence work, SmartAIHub SHALL support an explicit scope/spec hardening process before commitment.

The review process SHALL be **lens-based**, not repeated identical prompting. Useful lenses include:

```text
scope completeness
user outcome / underlying goal
UX / human workflow
architecture boundaries
reuse vs new subsystem
security / privacy
permissions / authority
cost / quotas / resource admission
failure / recovery / rollback
concurrency / idempotency
provider/runtime portability
observability / support
UAT / acceptance / testability
data migration / compatibility
mobile / accessibility / localization
commercialization / deployment lifecycle
```

Recommended review profiles:

```text
QUICK       1-3 focused passes
STANDARD    4-8 focused passes
HARDENED    10-20 focused passes
CRITICAL    20-30+ passes and, where available, independent verifier/perspective
```

The chosen profile MUST be proportional to complexity, irreversibility, cost and risk. A trivial reversible task MUST NOT incur 20-30 LLM passes merely to satisfy a numeric ritual.

Each pass SHOULD record:

```yaml
ReviewPass:
  index: int
  lens: string
  findings: [ref]
  changes_made: [ref]
  residual_risks: [ref]
  reviewer_kind: SAME_MODEL|DIFFERENT_MODEL|SPECIALIST|DETERMINISTIC_CHECK|HUMAN
```

The final `ScopeHardeningReport` SHALL state:

- number and type of review passes;
- gaps found and closed;
- unresolved risks/unknowns;
- materially changed requirements;
- whether another review round is likely to add value.

SmartAIHub MAY offer:

> “I have completed 12 focused review passes and closed the identified gaps. The full spec is ready. Would you like another 10-pass independent hardening round, or proceed to approval?”

It MUST NOT imply that iteration count proves completeness. If additional identical passes are unlikely to add value, it SHOULD recommend proceeding or switching to an independent verifier/test instead.

---

# 244. Executive approval digest and immutable approval binding

After a full spec/plan is ready, SmartAIHub SHALL create a concise `ApprovalDigest` so the user can understand what will actually happen without reading the full artifact.

Minimum content:

```text
What you asked for / confirmed goal
What SmartAIHub will build/do
What is explicitly out of scope
Major user-visible behavior
Important technical/placement choices only when material
Expected deliverables
Estimated development cost/budget
Estimated UAT cost/budget when applicable
Major risks/constraints
Acceptance criteria summary
Decisions that still need the user
Link to full spec / plan / evidence
```

Recommended interaction:

```text
[Approve this scope]
[Ask a question]
[Edit scope]
[Review again]
[Open full spec]
```

Approval MUST bind to an immutable/versioned reference such as:

```yaml
ApprovalBinding:
  work_definition_id: uuid
  version: string
  digest: sha256
  approval_digest_id: uuid
  approving_principal: ref
  approved_at: timestamp
  budget_envelope_ref: ref|null
  authority_snapshot_ref: ref
```

A material post-approval scope change SHALL create a delta card and SHALL require re-approval when it changes cost, authority, user-visible outcome, data access, deployment target, irreversible side effects, or acceptance criteria beyond configured tolerance.

---

# 245. Multi-perspective / multi-bot presentation UX

SmartAIHub SHALL support more than one Specialist/Bot/Assistant participating in a discussion without degrading readability into an unstructured group chat.

The system SHALL support at least these presentation modes:

```text
SYNTHESIS_ONLY
  Primary/Chief of Staff presents the consolidated result; specialist detail is collapsed.

INLINE_ATTRIBUTED
  Specialist contributions appear in the existing Chat with clear role identity.

PERSPECTIVE_CARDS
  One compact card per role: position, reasons, evidence, concerns, recommendation.

MEETING_BOARD
  Expanded multi-column/stacked view for strategic deliberation, conflict map, evidence and final decision.
```

The resolver SHOULD choose the least-complex readable presentation based on:

- number of perspectives;
- disagreement intensity;
- evidence volume;
- device/screen size;
- decision consequence;
- user preference.

Mobile SHOULD default to synthesis plus expandable stacked cards rather than a forced multi-pane layout.

Each specialist presentation SHOULD expose concise decision-relevant output, for example:

```text
role / objective
position
key reasons
fact vs inference vs opinion labels
evidence refs
confidence/uncertainty
major concern
recommended action
```

Hidden chain-of-thought MUST NOT be exposed.

`Role` and `Harness/Model` remain separate. Multiple roles MAY be powered by the same or different authorized models/harnesses. Diversity of labels alone MUST NOT be presented as independent evidence.

Primary/Chief of Staff SHALL remain responsible for:

- preventing duplicate/noisy statements;
- surfacing material disagreements;
- summarizing consensus without converting it into proof;
- producing decision options;
- recording the user's final decision;
- delegating follow-up after the decision.

A user MAY move fluidly between the normal Chat and an expanded deliberation view without changing the underlying goal/team state.

---

# 246. UAT strategy, cost choice and user participation

User Acceptance Testing (UAT) is a distinct economic and authority decision from build/test implementation. SmartAIHub SHALL present a UAT strategy before incurring material incremental UAT cost or before claiming user acceptance.

Canonical UAT modes:

```text
SYSTEM_MANAGED
  SmartAIHub executes the approved UAT plan and captures evidence.

USER_MANAGED
  SmartAIHub supplies test cases/checklist/expected results; user performs UAT and records acceptance/evidence.

HYBRID
  SmartAIHub runs deterministic/repeatable checks; user validates subjective/business/real-world behavior.

SKIP_OPTIONAL_WITH_RISK_ACCEPTANCE
  optional UAT is skipped with explicit limitations and no false “UAT passed” claim.

NOT_APPLICABLE
  no meaningful UAT is required for this work class.
```

`UATStrategyContract` SHOULD include:

```yaml
UATStrategyContract:
  work_definition_ref: ref
  mode: SYSTEM_MANAGED|USER_MANAGED|HYBRID|SKIP_OPTIONAL_WITH_RISK_ACCEPTANCE|NOT_APPLICABLE
  acceptance_criteria_refs: [ref]
  test_case_refs: [ref]
  environment_ref: ref|null
  external_side_effects: [string]
  destructive_or_irreversible_cases: [ref]
  estimated_incremental_cost_range: ref|null
  budget_envelope_ref: ref|null
  estimated_duration_class: string|null
  human_steps: [ref]
  mandatory_policy_checks: [ref]
  evidence_requirements: [ref]
```

The UI SHOULD offer a clear choice such as:

```text
A. Let SmartAIHub run UAT
   Estimated extra cost: ...
   Best for: repeatable automated acceptance and captured evidence

B. I will test it myself
   SmartAIHub provides checklist/test data/expected results

C. Hybrid
   SmartAIHub tests deterministic parts; I review UX/business behavior

D. Skip optional UAT
   Show the risks/limitations before proceeding
```

UAT cost MUST be shown separately from development/build cost when material.

Expensive UAT SHOULD prefer cheaper safe strategies where they preserve confidence, including:

- mocks/sandboxes before paid live providers;
- deterministic contract tests;
- sample/canary cases;
- reusable test fixtures;
- limited media-generation samples;
- provider test modes where supported;
- human validation only for subjective criteria.

Skipping optional UAT MUST NOT bypass mandatory security, authorization, migration, data-integrity, deployment-readiness or other policy-required requirements. Failure of one of these requirements SHALL normally trigger autonomous diagnosis/remediation/retest rather than an immediate user-blocking stop. A skipped or partial UAT MUST result in truthful state such as:

```text
UAT_NOT_RUN
UAT_PARTIAL
UAT_PASSED
UAT_FAILED
USER_ACCEPTED_WITH_DECLARED_RISK
```

The system MUST NOT report `PRODUCTION_READY` solely because the user chose to skip UAT when other mandatory readiness requirements remain unsatisfied. It SHOULD attempt to satisfy those requirements autonomously within the approved authority/budget envelope before requesting human attention.

---

# 247. End-to-end definition-to-execution experience

For complex build/system work, the preferred user-facing lifecycle is:

```text
Understand stated request / underlying goal
  ↓
Choose Work Definition level
  ↓
Draft scope/plan/spec
  ↓
Multi-pass hardening using distinct lenses
  ↓
ScopeHardeningReport
  ↓
ApprovalDigest + full artifact link
  ↓
User approves / edits / asks / requests more review
  ↓
Implement / delegate / build
  ↓
Verification
  ↓
UAT strategy + incremental cost choice
  ↓
System-managed / user-managed / hybrid / explicit optional skip
  ↓
Acceptance / deployment / operation
```

For simple low-risk work, SmartAIHub SHALL collapse unnecessary stages rather than force the full lifecycle.

---

# 248. R3.1 additional acceptance tests

In addition to all R3.0 and inherited tests, implementation MUST prove at least:

1. a trivial reversible task can use `QUICK_BRIEF` without generating a full spec;
2. a complex app/system build produces an inspectable versioned `IMPLEMENTATION_SPEC`;
3. hardening uses distinct review lenses rather than ten identical prompts;
4. a HARDENED review can report at least ten review passes with findings/changes/residual risk traceability;
5. review count is not presented as mathematical proof of completeness;
6. user can request another review round without rewriting the approved history;
7. `ApprovalDigest` accurately summarizes the linked full spec and its exclusions;
8. approval binds to a specific work-definition version/digest;
9. a material scope change after approval creates a visible delta and re-approval condition;
10. normal Chat can show multiple attributed specialists without becoming unreadable;
11. user can expand the same deliberation into Perspective Cards/Meeting Board without changing goal/team state;
12. mobile renders multi-perspective discussion as synthesis + stacked expandable cards;
13. specialist cards distinguish fact/inference/opinion and preserve evidence refs;
14. same-model role diversity is not falsely presented as independent corroboration;
15. UAT strategy offers system-managed, user-managed, hybrid and explicit optional-skip paths where policy permits;
16. UAT incremental cost is separately visible from development cost when material;
17. user-managed UAT can receive generated checklist/test cases and return evidence/acceptance;
18. optional UAT skip cannot bypass mandatory security/readiness gates;
19. partial/skipped UAT cannot be mislabeled as `UAT_PASSED`;
20. an expensive UAT plan can substitute mocks/canaries/sampling where confidence and policy allow;
21. UAT test cases can be derived from the approved acceptance criteria without making the user restate them;
22. simple work does not require ApprovalDigest/UAT ceremony when consequence and policy do not justify it.

---

# 249. R3.1 twelve-pass hardening record

R3.1 was reviewed across twelve additional lenses focused on the definition/approval/UAT experience:

| Pass | Lens | Resolution |
|---:|---|---|
| 1 | Over-documentation | Added QUICK_BRIEF / EXECUTION_PLAN / IMPLEMENTATION_SPEC tiers |
| 2 | Review-loop cargo cult | Made reviews lens-based and risk-proportional; count is not completeness proof |
| 3 | User cannot inspect full scope | Full artifact remains directly accessible even when digest is used |
| 4 | Approval comprehension | Added concise ApprovalDigest with actions and exclusions |
| 5 | Scope drift after approval | Added immutable ApprovalBinding + material delta/re-approval |
| 6 | Multi-bot chat noise | Added synthesis/inline/cards/meeting-board presentation modes |
| 7 | Mobile readability | Added stacked expandable multi-perspective UX |
| 8 | Fake corroboration | Role/model/harness separation and no false independent-evidence claim |
| 9 | UAT cost surprise | Added distinct UAT cost/budget choice before material spend |
| 10 | UAT ownership ambiguity | Added system/user/hybrid/skip modes and evidence contract |
| 11 | Unsafe test skipping | Mandatory security/readiness requirements remain non-bypassable; failed checks route into autonomous remediation instead of default human blocking |
| 12 | Duplicate user input | UAT derives from approved acceptance criteria; no needless re-entry |

No R3.1 change creates a second test runner, approval engine, design engine, job SoT or memory authority. Spec 269 owns the user-facing decision/contract projection; execution remains with the existing canonical authorities.

---

# 250. R3.1 Definition of Done extension

R3.1 is not complete until the platform demonstrates all of the following:

- work-definition depth is proportional to work consequence/complexity;
- complex scopes can be hardened repeatedly with visible distinct review lenses and residual risks;
- users can inspect the full spec but can approve from an accurate concise digest;
- approval is version-bound and material drift is re-approved;
- specialist perspectives can be read in normal Chat or expanded into a dedicated readable deliberation surface;
- the same underlying decision state survives movement between those surfaces;
- UAT ownership and incremental cost are explicitly selectable before material UAT spend;
- user-managed and hybrid UAT are first-class, not fallback hacks;
- skipped/partial UAT remains truthfully represented;
- mandatory policy/readiness requirements cannot be bypassed under the label “skip UAT”, and recoverable failures are automatically remediated/retested before user escalation;
- no new authority is introduced for testing, memory, UI generation or durable jobs.

---

# 251. R3.2 completion-seeking autonomy

The default objective of accepted SmartAIHub work is **verified completion**, not merely successful dispatch, one model response, one build attempt, one test attempt, or first contact with a blocker.

Normative principle:

> **An accepted goal SHALL continue through repair, retry, replan, reroute, reconciliation and verification until its CompletionContract is satisfied, the user cancels it, or a true non-recoverable/human-exclusive boundary is reached.**

A recoverable failure MUST NOT be represented to the user as a terminal blocker merely because the first implementation path failed.

Preferred logical loop:

```text
UNDERSTAND
  ↓
PLAN
  ↓
EXECUTE / DELEGATE
  ↓
OBSERVE
  ↓
VERIFY CURRENT RESULT
  ├─ PASS ───────────────────────────────→ COMPLETE
  │
  └─ FAIL / BLOCKED / DEGRADED
          ↓
      DIAGNOSE
          ↓
      FIND VALID REMEDIATION
          ├─ repair code/config/security/data
          ├─ retry with bounded adaptation
          ├─ use alternate Skill/tool/provider/runtime
          ├─ reconcile external state
          ├─ rollback to known-good point
          ├─ rebuild/redeploy/retest
          ├─ revise implementation plan inside approved scope
          └─ wait durably for a resolvable dependency
          ↓
      EXECUTE REMEDIATION
          ↓
      RE-VERIFY
          ↓
      LOOP UNTIL COMPLETE OR TRUE TERMINAL BOUNDARY
```

The user SHOULD NOT be required to supervise this loop.

---

# 252. Guardrails are route constraints, not default stopping points

Security, authorization, data-integrity, deployment-readiness, secret-handling, migration-safety and other mandatory requirements remain enforceable.

However:

```text
MANDATORY REQUIREMENT FAILED
≠
ASK USER WHAT TO DO
```

The default meaning is:

```text
MANDATORY REQUIREMENT FAILED
→ determine why
→ identify compliant repair/alternate path
→ implement repair when authorized
→ rerun the requirement
→ continue
```

Examples:

```text
Missing CSP/security header
→ add compliant configuration
→ rerun security validation
→ continue

Migration precheck fails
→ create/fix migration or recovery plan
→ test in isolated environment
→ rerun readiness
→ continue

Secret found in artifact
→ remove/redact secret
→ rotate when within authorized credential-management capability
→ rebuild artifact
→ rescan
→ continue

Deployment readiness reports missing capability
→ resolve/install/bind an authorized compatible capability
→ rerun readiness
→ continue
```

A guardrail SHALL block an unsafe action, but it SHOULD redirect the system toward the best safe route that still satisfies the goal.

The platform MUST NOT treat “fail closed” as synonymous with “hand the unfinished problem back to the user.”

---

# 253. CompletionAuthorityContract

SmartAIHub SHALL support pre-authorization of bounded decision-making so users do not need to approve every implementation choice.

```yaml
CompletionAuthorityContract:
  goal_ref: ref
  work_definition_ref: ref
  mode: GUIDED|MINIMIZE_CONTACT|UNATTENDED_TO_COMPLETION

  plan_authority:
    may_replan_inside_objective: true
    may_change_non_material_implementation_details: true
    may_select_skills_tools_agents: true
    may_select_authorized_runtime_provider: true
    may_parallelize_or_serialize_work: true

  repair_authority:
    may_fix_code_tests_config: true
    may_refactor: true
    may_add_or_replace_compatible_dependency: policy
    may_create_sandbox_or_preview: true
    may_rollback_known_good: true
    may_repeat_build_test_review_uat: true
    may_apply_security_remediation: policy
    may_reconcile_external_state: policy

  economic_authority:
    budget_envelope_ref: ref
    auto_reforecast: true
    auto_choose_cheaper_authorized_path: true
    auto_extend_within_preapproved_limit: true|false

  execution_authority:
    allowed_side_effect_classes: [ref]
    allowed_providers_runtimes: [ref]
    data_egress_policy_ref: ref
    destructive_action_policy_ref: ref

  attention_policy:
    batch_nonurgent_questions: true
    ask_only_if_human_exclusive: true
    completion_only_notification: true|false
```

The user MAY grant this contract during scope approval, project setup, Assistant settings, or a one-time instruction such as:

> “Finish this by yourself. Choose the best route within this budget and only contact me if something truly requires me.”

Pre-authorization MUST remain bounded by higher-level tenant/platform/legal policy.

---

# 254. Goal-preserving plan changes do not require repeated approval

Implementation details frequently change during long-running work.

SmartAIHub SHOULD distinguish:

```text
NON_MATERIAL PLAN CHANGE
  implementation detail changes but objective, major deliverables,
  authority, data scope, external impact and budget envelope remain compatible

MATERIAL SCOPE CHANGE
  objective/deliverable changes, new sensitive data scope, materially greater
  external side effect, destructive action, unapproved spend, new legal/contractual commitment
```

Non-material changes MAY be executed automatically under `CompletionAuthorityContract`.

Examples:

- replacing one compatible library with another;
- fixing a failing test;
- changing an internal schema implementation without changing approved external contract;
- moving from one authorized model/runtime to another;
- adding a missing validation step;
- repeating implementation/review/test loops;
- generating missing configuration;
- changing an internal algorithm while preserving the accepted behavior.

Material changes still require the configured authority decision, but the platform SHOULD prepare the recommended delta and alternatives before asking.

---

# 255. Blocker Resolution Ladder

Every blocker SHALL be classified and run through a remediation ladder before human escalation.

```text
1. RETRY
2. REPAIR
3. REPLAN
4. SUBSTITUTE capability/tool/model/provider/runtime
5. RECONCILE external state
6. ROLLBACK / RESTORE known-good point
7. REDUCE OPTIONAL implementation complexity while preserving approved outcome
8. WAIT DURABLY for resolvable external dependency
9. USE PRE-AUTHORIZED FALLBACK
10. ESCALATE only when no authorized viable path remains
```

The resolver SHOULD score candidate remediations using:

- probability of satisfying the CompletionContract;
- safety/policy compliance;
- reversibility;
- compatibility with approved objective;
- incremental cost;
- latency;
- data/privacy implications;
- existing user/provider subscriptions;
- evidence strength;
- operational maintainability.

When several valid paths remain and `UNATTENDED_TO_COMPLETION` or equivalent pre-authorization is active, SmartAIHub SHALL choose the best policy-compliant path instead of waiting for the user merely because multiple choices exist.

---

# 256. Human-attention minimization

Human attention is a scarce resource.

SmartAIHub SHOULD optimize:

```text
minimum necessary user interruptions
subject to
correctness + authority + safety + cost policy
```

Non-urgent questions SHOULD be:

- inferred from existing context where confidence is adequate;
- resolved by an approved default;
- batched into one decision request;
- deferred until they materially affect completion;
- answered by a specialist/research step when the answer is discoverable;
- avoided entirely when a reversible authorized action can proceed.

The platform SHOULD track an `AttentionBudget` or equivalent policy.

Example:

```yaml
AttentionPolicy:
  mode: MINIMIZE_CONTACT
  batch_window: until_material_decision
  max_noncritical_interruptions: 0
  notify_on:
    - COMPLETE
    - TRUE_HUMAN_EXCLUSIVE_BOUNDARY
    - MATERIAL_BUDGET_OR_AUTHORITY_EXPANSION
    - USER_DEFINED_EVENT
```

A long-running goal MAY therefore complete with no intermediate user interaction.

---

# 257. UAT and mandatory-check auto-remediation

R3.1 UAT strategy remains valid, but failed UAT or mandatory checks SHALL normally enter a repair loop.

```text
Run UAT/check
  ↓
Failure
  ↓
Classify defect
  ↓
Can SmartAIHub fix within approved scope?
  ├─ YES → fix → rebuild/redeploy if needed → rerun affected tests
  │          ↓
  │       repeat until pass / bounded exhaustion
  │
  └─ NO  → try alternate compliant solution
              ↓
           rerun tests
```

Examples:

```text
Functional UAT failure
→ diagnose implementation
→ repair
→ rerun

Accessibility failure
→ fix UI
→ rerun accessibility test

Security requirement failure
→ remediate configuration/code/dependency
→ rescan

Migration safety failure
→ revise migration / backup / rollback strategy
→ rehearse
→ rerun readiness

Data-integrity test failure
→ repair transaction/schema/migration behavior
→ restore test data
→ rerun
```

The user SHOULD be asked only when:

- acceptance is inherently subjective and no prior preference/policy resolves it;
- a business requirement is genuinely ambiguous and materially changes output;
- a human-only real-world validation is unavoidable;
- remediation requires authority/spend/side-effect beyond the pre-approved envelope.

---

# 258. Unattended-to-completion / sleep mode

SmartAIHub SHALL support a first-class unattended operating mode whose product goal is:

> **The user can close the UI, leave the device, or go to sleep; the accepted work continues durably and the preferred next interaction is the completed result.**

`UNATTENDED_TO_COMPLETION` requires:

- durable goal/task/job identity;
- durable continuation and reconciliation;
- server/cloud/authorized-runner execution independent of browser lifetime;
- approved fallback behavior for executor/provider loss;
- bounded budget;
- recovery checkpoints;
- automatic verification/retest;
- batched attention policy;
- final evidence-backed completion report.

Closing Chat, losing a browser tab, or putting a phone/tablet to sleep MUST NOT cancel an accepted durable goal.

Local-only execution that physically requires the user's machine MUST be represented truthfully. If an authorized cloud/alternate runtime is pre-approved, the system MAY continue there according to policy.

---

# 259. Budget, executor and provider continuity

Waiting is appropriate when a real dependency must wait, but `WAITING_FOR_USER` SHOULD NOT be the default fallback for ordinary resource/runtime problems.

Completion-oriented policies SHOULD support:

```text
AUTO_CHOOSE_AUTHORIZED_ALTERNATE
AUTO_CHOOSE_CHEAPER_PATH
AUTO_RETRY_AFTER_QUOTA_RESET
AUTO_MOVE_TO_PREAUTHORIZED_RUNTIME
AUTO_REDUCE_NONESSENTIAL_TEST_SAMPLE_COST
AUTO_REFORECAST_INSIDE_BUDGET
AUTO_ROLLBACK_AND_RETRY
ASK_ONLY_IF_NO_AUTHORIZED_PATH
```

A user who explicitly pins an executor/provider for a material reason MAY prohibit substitution.

Otherwise, if multiple runtimes are already authorized and economically compatible, runtime failure SHOULD trigger continuation on an appropriate alternate rather than unnecessary human interruption.

Budget exhaustion behavior SHOULD first evaluate:

1. cheaper compatible execution;
2. reuse/cache/deterministic substitution;
3. reduced optional test/sample cost without weakening mandatory confidence;
4. user-owned subscription/local compute;
5. pre-authorized extension;
6. only then request additional budget when no acceptable authorized route remains.

The platform MUST NOT hide material economic impact.

---

# 260. True terminal and human-exclusive boundaries

SmartAIHub MAY request user attention before completion only when at least one of the following materially applies and no valid pre-authorized alternative exists:

```text
HUMAN_EXCLUSIVE_CREDENTIAL
  A secret/login/passkey/physical token is required and cannot be obtained through an authorized connected credential flow.

NON_DELEGABLE_CONSENT_OR_LEGAL_ACT
  Law, contract, policy or provider requires a human's explicit consent/attestation/signature.

UNAPPROVED_IRREVERSIBLE_HIGH_IMPACT_ACTION
  The next necessary action is destructive or externally consequential beyond granted authority.

MATERIAL_OBJECTIVE_CONFLICT
  Two interpretations change the business outcome and existing context cannot resolve which is intended.

AUTHORITY_OR_BUDGET_EXHAUSTED
  No compliant solution fits remaining authority/budget and no pre-authorized extension/fallback exists.

UNAVAILABLE_EXTERNAL_DEPENDENCY_WITH_NO_SUBSTITUTE
  Completion physically depends on an external event/resource that cannot be substituted; use durable wait when possible.

REQUIRED_SUBJECTIVE_ACCEPTANCE
  The user must personally judge a subjective result and no delegated reviewer/preference/policy is authorized to decide.
```

Even then, SmartAIHub MUST NOT merely say “blocked.”

It SHALL present:

```text
What remains
Why it genuinely requires the user
What SmartAIHub already tried
What work is already complete
Recommended choice
Alternative choices
Cost/risk of each
The smallest exact action needed from the user
What will automatically resume afterward
```

All independent work that can still proceed SHOULD continue before or while waiting.

---

# 261. Completion-first escalation UX

The default escalation message SHOULD be decision-complete.

Bad:

```text
Deployment readiness failed. Please fix the database migration.
```

Preferred:

```text
I found the production migration cannot currently be rolled back safely.

I already:
✓ generated a corrected migration
✓ tested it against a disposable copy
✓ generated a pre-migration backup/restore plan
✓ reran schema and data-integrity checks

Two valid paths remain:

A. Recommended — use the corrected reversible migration
   Extra cost: ...
   Downtime: ...
   I can continue automatically.

B. Keep the original migration
   Requires accepting irreversible rollback risk.

[Use A and continue]
[Use B]
[Open details]

If you pre-authorized automatic safe choices, I will select A without interrupting you.
```

When `completion_only_notification=true`, a decision that is already covered by pre-authorization MUST NOT generate an interrupting prompt.

---

# 262. R3.2 additional acceptance tests

In addition to all inherited tests, implementation MUST prove at least:

1. a failed mandatory security check triggers authorized remediation and automatic retest;
2. a failed migration-readiness check triggers a generated repair/recovery strategy instead of a generic stop;
3. a failed UAT case can cause repair → rebuild → rerun until passing;
4. a recoverable build failure does not create `WAITING_FOR_USER`;
5. an authorized alternate runtime can be selected automatically after executor loss;
6. a pinned executor remains pinned when policy explicitly forbids substitution;
7. `CompletionAuthorityContract` can pre-authorize tool/agent/runtime selection without per-step prompts;
8. non-material internal replanning proceeds without scope re-approval;
9. material objective/authority/budget expansion still creates a delta decision;
10. multiple valid pre-authorized repair paths can be ranked and one selected without user contact;
11. the user can choose `UNATTENDED_TO_COMPLETION`;
12. browser/tab closure does not stop durable unattended work;
13. app/device disconnect does not lose goal/continuation state;
14. final completion can be the only notification under configured attention policy;
15. noncritical questions are batched or inferred instead of interrupting the user;
16. `AttentionPolicy` can set zero noncritical interruptions;
17. budget pressure tries cheaper compatible routes before asking for more money;
18. quota exhaustion can wait for reset or use an authorized alternate without user prompting;
19. a secret leak found during build is removed and rescanned before continuation;
20. data-integrity test failure enters repair/retest rather than being waived;
21. mandatory checks remain truthful and cannot be falsely marked passed;
22. no security/safety requirement is bypassed merely to satisfy completion;
23. true human-exclusive credential requirement creates one concise actionable request;
24. all independent work continues before asking for a human-only missing action;
25. an escalation includes attempted remediations and recommended next choice;
26. completion resumes automatically after the user supplies the minimum missing human action;
27. a rejected repair path does not erase prior evidence/history;
28. repeated repair loops are bounded against infinite cost/resource consumption;
29. bounded exhaustion triggers alternate strategy before terminal failure where one exists;
30. task cannot be marked complete until CompletionContract and required verification evidence are satisfied.

---

# 263. R3.2 fifteen-pass hardening record

R3.2 was reviewed through additional completion/autonomy lenses:

| Pass | Lens | R3.2 resolution |
|---:|---|---|
| 1 | Guardrail dead-end | Reframed mandatory requirements as route constraints plus autonomous remediation |
| 2 | User babysitting | Added unattended-to-completion mode and durable continuation |
| 3 | Excess approval friction | Added bounded CompletionAuthorityContract |
| 4 | Recoverable blocker escalation | Added Blocker Resolution Ladder |
| 5 | UAT failure behavior | Added repair/rebuild/retest loop |
| 6 | Security failure behavior | Remediate and rescan; never silently bypass |
| 7 | Budget interruption | Try cheaper/owned/pre-authorized routes before asking |
| 8 | Executor/provider loss | Auto-use authorized fallback or durable wait |
| 9 | Scope drift | Non-material replanning is automatic; material change remains controlled |
| 10 | Attention overload | Added AttentionPolicy and batching |
| 11 | Human-exclusive boundary | Defined narrow terminal escalation classes |
| 12 | Sleep/offline UX | Browser/device lifetime separated from durable goal lifetime |
| 13 | Infinite-loop risk | Retain cost/time/retry/resource bounding plus alternate-strategy selection |
| 14 | Truthfulness | Completion/readiness cannot be fabricated even under finish-first policy |
| 15 | Recovery continuity | Escalation resumes automatically after minimum missing human action |

R3.2 does not remove security, authorization, budget, privacy or safety boundaries. It changes the product behavior around them from **“stop and hand back”** to **“find a compliant path and keep going.”**

---

# 264. R3.2 Definition of Done extension

R3.2 is not implemented until all of the following are demonstrated:

- accepted durable work can continue without the user watching the screen;
- recoverable failures cause autonomous remediation rather than default user escalation;
- mandatory readiness/security requirements remain enforced and are actively satisfied where possible;
- the Assistant can choose among pre-authorized tools/agents/providers/runtimes;
- non-material plan changes do not repeatedly interrupt the user;
- UAT failures can loop through repair and rerun;
- user attention is requested only at a true human-exclusive/material authority boundary;
- attention requests are concise, decision-complete, and resume work automatically afterward;
- cost/resource loops are bounded and cannot consume indefinitely;
- completion remains evidence-backed and truthful;
- a fully pre-authorized goal can produce **one final completion notification and no intermediate prompts**.

---

# 265. R3.3 ConvergencePolicy and autonomous recovery circuit breaker

Completion-seeking autonomy requires proof that repeated repair attempts are making progress.

SmartAIHub SHALL support a `ConvergencePolicy` or equivalent for long-running repair/retry loops.

```yaml
ConvergencePolicy:
  goal_ref: ref
  max_total_repair_iterations: integer
  max_same_fingerprint_repeats: integer
  max_elapsed_time_class: string|null
  max_incremental_cost_ref: ref|null
  progress_metric_refs: [ref]
  minimum_progress_delta: object|null
  repeated_failure_window: object
  alternate_strategy_threshold: integer
  circuit_breaker_state: CLOSED|OPEN|HALF_OPEN
```

The platform SHOULD compute a stable failure/remediation fingerprint using relevant fields such as:

```text
failure class
artifact/component
test/check identifier
provider/runtime
error signature
remediation strategy
source/config generation
```

Required behavior:

```text
same failure + same remedy + no measurable progress
→ do NOT loop indefinitely
→ change strategy
→ independent diagnosis/reviewer when useful
→ alternate provider/tool/runtime when authorized
→ rollback/reconstruct from known-good point where appropriate
→ only then consider human escalation
```

Opening the recovery circuit breaker MUST NOT automatically mark the goal failed. It means the current strategy family is exhausted and a materially different remediation route is required.

---

# 266. SideEffectSafetyFence for completion loops

Completion loops MUST NOT convert ambiguous external outcomes into duplicate side effects.

Before retrying a side effect that may already have committed, SmartAIHub SHALL apply a `SideEffectSafetyFence`:

```text
Did provider confirm idempotent failure?
  YES → retry may proceed according to policy

Outcome unknown?
  → reconcile/query provider state
  → inspect SmartAIHub correlation/idempotency receipts
  → determine committed/not-committed where possible
  → retry only when duplicate-risk is acceptably fenced

Cannot determine?
  → choose non-duplicating alternate if possible
  → otherwise human-exclusive escalation with exact known state
```

This applies especially to:

- publish/post operations;
- email/message sending;
- payment-like or purchase commitments;
- DNS/domain/deployment changes;
- destructive deletion;
- external ticket/order creation;
- external job submission that lacks safe dedupe.

The completion goal does not authorize duplicate external consequences.

---

# 267. Goal and Instruction Freshness Fence

An unattended task may continue for hours or days while the user issues newer instructions elsewhere.

Before materially consequential steps and before final completion, the platform SHALL check whether a newer authoritative goal/instruction/decision exists for the same scope.

`InstructionFreshnessFence` SHOULD compare:

```text
goal revision / plan generation
approval binding generation
relevant project decision revision
user cancellation/redirection epoch
policy epoch
deployment desired-state generation
```

If a newer instruction is compatible, the work MAY rebase automatically.

If it materially conflicts:

```text
old unattended plan
≠
permission to ignore newer user intent
```

The platform SHALL stop the conflicting action, preserve completed work, reconcile the new direction, and continue under the newest authoritative goal where policy permits.

A casual unrelated Chat message MUST NOT accidentally invalidate active work; conflict must be scope- and intent-aware.

---

# 268. EvidenceFreshnessPolicy

Long-running work may rely on external facts that become stale before completion.

Where freshness materially affects the result, SmartAIHub SHALL associate a freshness policy with evidence/factual assumptions.

```yaml
EvidenceFreshnessPolicy:
  evidence_scope_ref: ref
  max_age: duration|null
  refresh_before:
    - FINAL_RECOMMENDATION
    - PRODUCTION_ACTION
    - PUBLICATION
    - COMPLIANCE_ASSERTION
  source_volatility_class: LOW|MEDIUM|HIGH|REALTIME
  stale_behavior: REFRESH|MARK_UNCERTAIN|BLOCK_CONSEQUENTIAL_ACTION
```

Examples:

- product availability/pricing;
- provider quota/limits;
- security advisories;
- deployment/runtime compatibility;
- market/news facts used in a morning brief;
- legal/regulatory state;
- service health/outage state;
- current route/transport/weather-like live constraints where applicable.

Final verification MUST NOT rely on known-stale evidence while presenting it as current.

---

# 269. RepairMutationLease and concurrent autonomous repair

Multiple Specialists/agents may diagnose the same defect in parallel, but canonical repair mutation MUST remain coordinated.

Before mutating the same source/config/deployment/data scope, repair actors SHALL use existing workspace/resource concurrency controls or an explicit `RepairMutationLease`.

Rules:

- parallel diagnosis is allowed;
- parallel proposed patches are allowed when isolated;
- one canonical writer per protected resource/generation unless domain-specific merge/CAS is safe;
- stale repair actors cannot publish after a newer repair generation wins;
- test evidence MUST identify which candidate/generation it verified;
- merging two independently generated repairs requires re-verification of the merged result.

Autonomous repair MUST NOT create split-brain source or deployment state.

---

# 270. QualityFloorContract and no silent degradation

Cost/time pressure MUST NOT silently reduce the accepted quality of the requested outcome.

A `QualityFloorContract` SHOULD capture:

```yaml
QualityFloorContract:
  goal_ref: ref
  required_acceptance_criteria_refs: [ref]
  required_verification_level: ref
  required_artifact_properties: [ref]
  optional_enhancements: [ref]
  degradation_policy:
    allow_optional_reduction: boolean
    require_user_for_required_change: true
```

Examples:

```text
Allowed automatically:
- generate 5 representative paid-media UAT samples instead of 20
  IF deterministic/cheap tests cover the remaining cases and confidence target remains satisfied

Not allowed silently:
- remove authentication
- skip required languages
- lower required resolution
- omit required data validation
- publish unverified output
- drop a user-approved core deliverable
```

Cheaper execution routes may change **how** the work is accomplished, not silently redefine **what success means**.

---

# 271. Background resource fairness and completion priority

`UNATTENDED_TO_COMPLETION` does not grant unlimited platform priority.

Long-running work SHALL participate in canonical resource admission/fairness policies.

Priority SHOULD consider:

```text
user-visible interactive work
deadline/time-critical work
production incident/recovery
paid/reserved capacity
ordinary unattended completion
speculative/proactive preparation
maintenance/backfill
```

Requirements:

- unattended repair loops MUST NOT starve interactive work from the same or other tenants;
- a single goal MUST NOT monopolize all available subagents/containers/GPU/browser slots;
- resource reservation and concurrency caps remain enforced;
- throttled unattended work SHALL preserve durable state and resume automatically;
- low-priority proactive work SHOULD yield before accepted user work.

Resource throttling is a scheduling condition, not a reason to abandon the goal.

---

# 272. Resume revalidation after long waits and platform/environment drift

Before resuming after a material wait, restart, executor loss, provider reset or platform upgrade, SmartAIHub SHALL revalidate assumptions that may have changed.

Checks MAY include:

```text
goal/instruction freshness
policy/approval freshness
credential/secret generation
executor trust state
provider/model/tool capability
build/runtime environment compatibility
dependency lock availability
resource admission
evidence freshness
deployment desired-state generation
```

A checkpoint is a continuation anchor, not proof that all old assumptions remain valid.

Where drift is compatible, the system MAY migrate/rebind automatically and continue.

Where drift invalidates the previous plan, the system SHALL replan inside the authorized objective before escalating.

---

# 273. Production-safe remediation boundary

Autonomous remediation SHOULD diagnose and validate fixes in the least consequential environment that can provide meaningful evidence.

Default preference:

```text
static/deterministic analysis
→ local isolated test
→ sandbox
→ Preview/staging
→ canary
→ Production
```

Direct Production mutation MAY occur only when:

- the action is explicitly authorized for Production;
- lower-risk validation is insufficient or incident urgency requires it;
- rollback/recovery is defined where feasible;
- mutation generation/fencing is valid;
- required verification/health checks run afterward.

A desire to “finish automatically” MUST NOT turn Production into the default debugging environment.

---

# 274. Autonomous dependency/provider substitution gate

When SmartAIHub replaces a dependency, package, Skill, provider, model or runtime automatically, compatibility MUST include more than functional similarity.

Before substitution, policy SHOULD evaluate as applicable:

```text
API/behavior compatibility
security posture
license/provenance
data-egress/privacy implications
region/residency
cost/funding source
model/tool quality class
rate/quota behavior
deployment/runtime compatibility
rollback/reversibility
```

Auto-substitution MUST NOT introduce a disallowed license, untrusted package source, weaker security boundary, new sensitive egress path or materially lower quality tier merely to keep work moving.

---

# 275. Cancellation and redirect responsiveness

User control remains immediate even in unattended mode.

When the authoritative goal is cancelled or materially redirected:

- no new child work should be dispatched under the obsolete generation;
- cancellable queued/running work SHOULD receive cancellation promptly;
- external non-cancellable actions SHALL enter reconciliation;
- stale continuations MUST be fenced;
- obsolete repairs MUST NOT publish after a newer goal generation;
- already-valid independent artifacts MAY be retained if useful and policy allows.

The platform SHOULD define measurable cancellation propagation targets for its own schedulers/runners.

“Finish the work” never overrides a newer explicit human cancellation.

---

# 276. Completion Deviation Ledger

Unattended work may make many authorized implementation decisions. The user should not be interrupted for them, but significant changes must remain reviewable.

A `CompletionDeviationLedger` SHOULD record material-but-preauthorized deviations such as:

```text
runtime/provider changed
library/dependency substituted
rollback performed
architecture implementation detail changed
UAT sample strategy changed
repair iterations exceeded ordinary threshold
deployment strategy changed within approved envelope
```

The final completion report SHOULD summarize only decision-relevant deviations:

```text
What you asked for
What was delivered
Important route changes I made
Verification/UAT result
Remaining limitations
Actual cost/usage
```

Detailed audit remains available without forcing the user to watch intermediate steps.

---

# 277. Batched human-only requests and parallel progress

If human-exclusive input becomes necessary, SmartAIHub SHOULD continue all independent work that does not depend on that input.

Before contacting the user, the system SHOULD determine whether other likely human-only inputs can be batched into the same request.

Example:

```text
Need:
- login to Provider A
- choose final subjective hero image

Can continue without them:
- finish backend tests
- prepare deployment manifest
- generate remaining image candidates
- run security scan

Preferred:
continue independent work
→ ask once when both human-only decisions are ready
→ resume automatically after response
```

Batching MUST NOT delay genuinely urgent user action when delay creates material harm.

---

# 278. UnattendedProgressWatchdog and stuck-work SLO

Long-running work MUST NOT disappear into an apparently active state indefinitely.

The platform SHALL monitor for:

```text
no heartbeat
no state transition
no new evidence
same failure fingerprint repeating
provider callback missing
resource wait beyond expected window
continuation not resumed
repair loop with no progress
child/parent terminal mismatch
```

`UnattendedProgressWatchdog` SHOULD trigger:

```text
reconcile
restart/rebind
alternate authorized route
restore checkpoint
independent diagnosis
open recovery circuit
human escalation only when truly unavoidable
```

The product SHOULD expose a truthful high-level status such as:

```text
WORKING
WAITING_EXTERNAL
RECOVERING
THROTTLED
NEEDS_HUMAN
COMPLETED
```

without requiring the user to inspect logs.

---

# 279. Context-purpose minimization for proactive and unattended work

Anticipation and proactive preparation MUST NOT become a reason to hydrate every available memory, document, account or connected source.

Each autonomous operation SHALL derive a purpose-limited context scope from:

```text
goal
current phase
required capabilities
approved data scope
relevant memory/project scope
minimum evidence needed
```

Rules:

- semantic relevance alone does not authorize data access;
- unrelated personal memory MUST NOT be fetched merely because the Assistant is the user's Primary;
- proactive opportunity analysis SHOULD prefer aggregate/performance data over sensitive raw content where sufficient;
- context expansion that introduces materially new sensitive data scope follows existing approval/policy semantics;
- final output SHOULD not expose private context that was only needed internally unless appropriate.

This preserves “knows me well” without equating intimacy with unrestricted data access.

---

# 280. R3.3 additional acceptance tests

Implementation MUST prove at least:

1. repeated identical repair attempts with no progress open a recovery circuit and change strategy;
2. recovery circuit opening does not falsely mark the goal complete;
3. an ambiguous publish timeout is reconciled before any retry;
4. duplicate external post/email/order is prevented by idempotency/reconciliation where supported;
5. a newer user goal revision fences an obsolete unattended plan;
6. unrelated user Chat does not spuriously cancel active work;
7. stale high-volatility evidence is refreshed before final consequential action;
8. known-stale evidence is not presented as current;
9. two repair agents cannot concurrently publish to one exclusive source generation;
10. stale repair candidate cannot overwrite a newer verified repair;
11. cheaper execution cannot silently weaken a required acceptance criterion;
12. optional UAT sample reduction preserves declared confidence/quality floor;
13. unattended work yields/throttles under canonical resource fairness rules;
14. throttling preserves durable continuation and resumes automatically;
15. resume after long wait revalidates policy, goal, credentials and environment;
16. environment drift triggers migration/replan instead of blind resume;
17. autonomous remediation validates in sandbox/Preview before Production when feasible;
18. Production emergency remediation remains fenced and health-verified;
19. dependency substitution fails when license/security/privacy policy is incompatible;
20. compatible dependency substitution can proceed without user interruption;
21. cancellation prevents new child dispatch under the obsolete goal generation;
22. cancel/redirect fences stale continuations and repair writers;
23. final report summarizes important preauthorized deviations;
24. detailed deviation/audit history remains inspectable;
25. multiple human-only actions can be batched while independent work continues;
26. urgent human-exclusive action is not delayed merely to batch;
27. watchdog detects no-progress/stuck execution and attempts recovery;
28. no-heartbeat active work cannot remain silently “WORKING” forever;
29. proactive work retrieves only purpose-authorized context;
30. Primary Assistant role alone does not grant unrelated private-memory access;
31. platform upgrade during wait does not silently discard durable work;
32. resumed legacy record either migrates, uses backward-compatible reader, or surfaces explicit incompatibility while preserving evidence;
33. evidence/test receipts identify the exact repair/source/deployment generation verified;
34. completion cannot use evidence produced for a superseded generation without explicit compatibility proof;
35. recovery iteration/cost/time bounds are enforced without defaulting immediately to user interruption;
36. after bounded strategy exhaustion, alternate strategy is attempted before `NEEDS_HUMAN` where available.

---

# 281. R3.3 fifteen-pass gap review record

R3.3 hardening review:

| Pass | Lens | Gap found | Resolution |
|---:|---|---|---|
| 1 | Recovery convergence | R3.2 could repeat non-improving fixes | Added ConvergencePolicy + recovery circuit breaker |
| 2 | External side-effect retry | Finish-first retry could duplicate publish/send/order | Added SideEffectSafetyFence + reconciliation-first retry |
| 3 | User intent freshness | Sleep-mode work could continue after a newer decision | Added InstructionFreshnessFence |
| 4 | Evidence freshness | Long-running research could finish with stale facts | Added EvidenceFreshnessPolicy |
| 5 | Parallel repair concurrency | Multiple repair agents could race canonical mutations | Added RepairMutationLease/fencing |
| 6 | Quality under cost pressure | Cheaper fallback could silently degrade deliverables | Added QualityFloorContract |
| 7 | Resource fairness | Completion loops could starve other work | Added priority/fairness admission semantics |
| 8 | Resume drift | Checkpoint resume could trust obsolete environment/provider assumptions | Added resume revalidation |
| 9 | Production repair safety | Finish-first behavior could encourage direct Production debugging | Added least-consequential remediation boundary |
| 10 | Supply-chain substitution | Auto dependency replacement could introduce license/security/privacy risk | Added substitution compatibility gate |
| 11 | Cancellation/redirect | Unattended work needed stronger stale-generation fencing after user changes direction | Added cancellation/redirect responsiveness |
| 12 | Explainability without babysitting | Autonomous route changes could become invisible | Added Completion Deviation Ledger |
| 13 | Human-attention efficiency | Human-only blockers could still arrive one-by-one | Added batching + parallel-progress behavior |
| 14 | Stuck-work detection | Durable work could remain alive but make no progress | Added UnattendedProgressWatchdog |
| 15 | Proactive privacy | “Know the user” could over-expand context access | Added purpose-limited autonomous context scope |

All fifteen passes found either a direct gap or a boundary that benefited from explicit hardening; all identified gaps were incorporated into R3.3.

---

# 282. R3.3 Definition of Done extension

R3.3 is not complete until:

- repair loops demonstrate convergence control and strategy change on repeated no-progress failures;
- ambiguous side effects are reconciled before unsafe retry;
- newer authoritative user intent can preempt unattended obsolete work;
- long-running factual work refreshes stale evidence when required;
- concurrent repair writers are fenced;
- quality floors remain stable under cost/runtime optimization;
- unattended work obeys platform fairness/resource admission;
- resumed work revalidates stale assumptions;
- autonomous repair defaults to lower-consequence validation environments;
- dependency/provider substitution remains security/license/privacy compatible;
- cancellation and redirection propagate across the autonomous work graph;
- material autonomous deviations are reviewable without intermediate user interruption;
- human-only requests are minimized/batched when safe;
- stuck unattended work is automatically detected and recovered where possible;
- proactive context access remains purpose-limited;
- a user can still close the screen and reasonably expect **completed, verified work rather than a hidden infinite loop**.

---

# 283. R3.4 Definition-to-Done Closure Model

SmartAIHub SHALL treat every complex accepted goal as a closure problem across four linked stages:

```text
DEFINITION / SPECIFICATION
        ↓
PLANNING
        ↓
IMPLEMENTATION
        ↓
VERIFICATION / UAT
        ↓
DONE
```

A later phase MUST NOT be assumed complete merely because execution reached that phase.

The platform SHALL reconcile adjacent phases:

```text
Spec ↔ Plan
Plan ↔ Implementation
Implementation ↔ Verification
Verification ↔ CompletionContract
```

Normative invariant:

> **A discovered in-scope gap that SmartAIHub can act on is work to be completed by SmartAIHub, not a terminal message to the user.**

---

# 284. RequirementCoverageGraph

Complex work SHOULD receive stable requirement identifiers so completeness can be checked mechanically and semantically.

```yaml
RequirementCoverageNode:
  requirement_id: string
  source_ref: ref
  source_type: SPEC|APPROVED_BRIEF|ACCEPTANCE_CRITERION|POLICY
  applicability: APPLICABLE|NOT_APPLICABLE|SUPERSEDED|EXPLICITLY_EXCLUDED
  criticality: LOW|MEDIUM|HIGH|CRITICAL

  plan_task_refs: [ref]
  implementation_evidence_refs: [ref]
  verification_evidence_refs: [ref]

  state:
    UNPLANNED|
    PLANNED|
    IMPLEMENTED_UNVERIFIED|
    VERIFIED_SATISFIED|
    PARTIAL|
    BLOCKED_HUMAN_EXCLUSIVE|
    EXCLUDED_WITH_AUTHORITY|
    REOPENED
```

A requirement is not closed merely because:

- it appears in prose;
- a plan mentions it;
- code was written near it;
- a test exists but did not run;
- an LLM says it “looks complete.”

`VERIFIED_SATISFIED` requires evidence appropriate to the requirement.

---

# 285. PlanCompletenessGate

After planning and before material implementation, SmartAIHub SHALL reconcile the plan against the current approved definition/spec.

```text
Approved requirements
        ↓
Coverage analysis
        ↓
Missing / partial plan items?
        ├─ NO → continue
        └─ YES
             ↓
         create/repair plan tasks
             ↓
         review dependencies/order/owners
             ↓
         rerun PlanCompletenessGate
```

The normal response to:

```text
“Plan covers 87/100 applicable requirements.”
```

is NOT:

```text
“User, 13 items are missing.”
```

It is:

```text
create 13 missing plan tasks
→ integrate into plan
→ review interactions/regressions
→ continue
```

User contact is required only when a missing item creates a material objective/authority/budget decision outside the existing envelope.

---

# 286. ImplementationCompletenessGate

After an implementation pass, SmartAIHub SHALL reconcile actual artifacts against both:

- the approved/current specification; and
- the current plan.

The gate SHALL detect as applicable:

```text
requirement not implemented
requirement partially implemented
planned task never executed
task marked complete without evidence
route/UI/API declared but missing
configuration absent
migration declared but unapplied/unverified
feature implemented only behind unintended disabled flag
error/recovery path missing
required permission/auth check missing
required mobile/accessibility path missing
stub/placeholder implementation
TODO/FIXME representing accepted-scope unfinished work
skipped/disabled required test
generated artifact missing
deployment binding missing
documentation/operator contract required by scope but absent
```

A discovered AI-actionable item SHALL automatically create closure work and re-enter implementation/review.

The platform MUST NOT mark the overall goal DONE while such applicable closure work remains open.

---

# 287. VerificationCompletenessGate

Implementation existence does not prove behavioral completion.

Before DONE, each applicable requirement SHALL resolve to one of:

```text
VERIFIED_SATISFIED
EXPLICITLY_EXCLUDED
NOT_APPLICABLE
BLOCKED_HUMAN_EXCLUSIVE
```

For ordinary successful completion, there SHALL be no remaining `BLOCKED_HUMAN_EXCLUSIVE` requirement.

Evidence may include:

- deterministic tests;
- integration/E2E tests;
- artifact inspection;
- deployment health;
- security/access checks;
- data-integrity checks;
- visual/UI verification;
- UAT evidence;
- evidence-grounded research validation;
- authorized human acceptance where inherently required.

Missing verification is work, not success.

---

# 288. Gap-as-Work invariant

Every detected finding SHALL be classified:

```text
AI_ACTIONABLE
HUMAN_EXCLUSIVE
EXTERNAL_WAIT
NOT_APPLICABLE
DUPLICATE
ACCEPTED_EXCLUSION
```

Default handling:

```text
AI_ACTIONABLE
→ create closure task
→ assign owner
→ execute
→ verify
→ close

EXTERNAL_WAIT
→ durable continuation
→ resume automatically

HUMAN_EXCLUSIVE
→ continue all independent work
→ ask for smallest necessary human action
→ auto-resume

NOT_APPLICABLE / DUPLICATE
→ record rationale
→ no execution

ACCEPTED_EXCLUSION
→ require appropriate authority/provenance
```

A gap list is therefore an internal execution queue by default.

---

# 289. ClosureLedger

SmartAIHub SHALL maintain a durable closure ledger for non-trivial work.

```yaml
ClosureItem:
  id: uuid
  goal_ref: ref
  requirement_ref: ref|null
  finding_source: PLAN_REVIEW|IMPLEMENTATION_REVIEW|TEST|UAT|SECURITY|DEPLOYMENT|HUMAN_REVIEW|HARNESS_RESULT|OTHER
  summary: string
  severity: LOW|MEDIUM|HIGH|CRITICAL
  classification: AI_ACTIONABLE|HUMAN_EXCLUSIVE|EXTERNAL_WAIT|NOT_APPLICABLE|DUPLICATE|ACCEPTED_EXCLUSION
  state: DETECTED|TRIAGED|ASSIGNED|IN_PROGRESS|VERIFYING|VERIFIED_CLOSED|REOPENED|WAITING_EXTERNAL|WAITING_HUMAN
  owner_ref: ref|null
  remediation_refs: [ref]
  verification_refs: [ref]
  supersedes_ref: ref|null
  reopened_from_ref: ref|null
```

Finding lifecycle:

```text
DETECTED
→ TRIAGED
→ ASSIGNED
→ IN_PROGRESS
→ VERIFYING
→ VERIFIED_CLOSED

Regression/new evidence
→ REOPENED
→ IN_PROGRESS
→ ...
```

`DETECTED` is not a final state.

---

# 290. HarnessPartialResultInterceptor

External harnesses such as Codex/Claude/Hermes-class executors may return useful but incomplete results.

SmartAIHub SHALL distinguish:

```text
HARNESS CALL FINISHED
≠
GOAL FINISHED
```

If a harness reports language such as:

```text
remaining items
not yet implemented
follow-up required
known gaps
blocked tasks
tests still failing
TODO
partial completion
unable to finish all requested work
```

or structured equivalents, SmartAIHub SHALL:

1. parse/normalize those findings;
2. map them into `ClosureItem`s;
3. determine which are AI-actionable;
4. schedule/continue closure work;
5. prevent the partial harness response from becoming the final user completion message.

The originating harness MAY be reused, or SmartAIHub MAY choose another authorized executor.

The user SHOULD NOT need to reply “continue” merely because a provider/harness ended one session.

---

# 291. No-report-only completion behavior

The following final response is prohibited when unresolved items are AI-actionable and remain within approved scope:

```text
“I reviewed the implementation. 10 items remain incomplete.”
```

Preferred internal behavior:

```text
10 items remain
→ create 10 closure items
→ prioritize/dependency-order
→ implement
→ verify
→ rerun completeness checks
```

Only after closure may the user receive:

```text
“Completed. During final reconciliation I found 10 missing items and closed all 10.
Here is the final result and verification summary.”
```

If true human-exclusive work remains, the user message SHALL request only that unavoidable input and explain what will resume automatically.

---

# 292. Cross-session and cross-harness closure ownership

An unfinished closure item SHALL survive:

- model response termination;
- harness process exit;
- provider quota reset;
- session/context rollover;
- browser closure;
- executor replacement;
- service restart.

Closure ownership belongs to the durable SmartAIHub goal/work graph, not to the lifetime of one LLM/harness conversation.

A new executor SHALL be able to recover:

```text
requirement
current plan
current implementation generation
open closure items
attempted remedies
verification evidence
known regressions
next recommended action
```

without requiring the user to restate the unfinished work.

---

# 293. Closure discovery after each major phase

SmartAIHub SHALL run explicit phase reconciliation:

## 293.1 After specification/definition

Check:

- requirement completeness;
- hidden assumptions;
- conflicting requirements;
- missing acceptance criteria;
- missing failure/recovery behavior;
- missing authority/cost/data constraints.

Detected gaps are repaired in the definition/spec where authorized.

## 293.2 After planning

Check:

- every applicable requirement has executable plan coverage;
- dependencies/order are viable;
- verification/UAT is planned;
- rollback/recovery is represented where needed;
- no requirement was silently dropped during decomposition.

## 293.3 After implementation

Check:

- every planned task has actual execution/evidence;
- every applicable requirement has implementation evidence;
- unfinished blocks/stubs/skips are reconciled;
- implementation deviations remain compatible with approved goal;
- newly discovered technical requirements are incorporated.

## 293.4 After verification/UAT

Check:

- all required evidence ran against the current implementation generation;
- failed checks produced and closed repair work;
- no superseded/stale evidence is used;
- residual limitations are truly out-of-scope/accepted rather than forgotten work.

---

# 294. Closure debt and orphan-work discovery

SmartAIHub SHOULD proactively scan for indicators of incomplete accepted-scope work.

Signals MAY include:

```text
TODO / FIXME / XXX / HACK markers
NotImplemented / placeholder exceptions
empty handlers
mock-only production path
disabled/skipped tests
commented-out required logic
feature flags that leave accepted functionality unreachable
unwired UI controls
dead routes
missing migrations
unreferenced generated artifacts
stubbed provider adapters
hardcoded temporary values
tests marked expected-fail for accepted functionality
task/plan items with no evidence
requirements with no implementation mapping
```

These are signals, not proof.

Each finding MUST be evaluated for applicability before becoming closure work.

The system MUST avoid “closing” legitimate future/backlog TODOs that were never part of the accepted goal.

---

# 295. Closure coverage metrics

For complex work, internal/project views SHOULD expose metrics such as:

```text
Applicable requirements: 128
Plan-covered:             128 / 128
Implemented:              128 / 128
Verified:                 128 / 128
Open closure items:       0
Reopened regressions:     0
Human-exclusive blockers: 0
```

A user-facing summary MAY be much simpler.

Coverage numbers MUST NOT replace semantic review; they are traceability aids.

---

# 296. Completion Certificate

Before emitting terminal success for complex work, SmartAIHub SHOULD generate a `CompletionCertificate`.

```yaml
CompletionCertificate:
  goal_ref: ref
  approved_definition_ref: ref
  final_plan_ref: ref
  implementation_generation_ref: ref
  requirement_coverage_summary_ref: ref
  closure_ledger_ref: ref
  verification_summary_ref: ref
  uat_summary_ref: ref|null
  open_applicable_ai_actionable_count: 0
  open_human_exclusive_count: 0
  residual_limitations: [ref]
  completion_contract_result: PASS
  issued_at: timestamp
```

Normative rule:

```text
CompletionCertificate cannot be PASS
if any applicable AI-actionable closure item remains unresolved.
```

---

# 297. User communication policy for closure work

Ordinary internal closure discovery SHOULD NOT interrupt the user.

Examples that normally remain internal:

- plan omitted 7 spec requirements;
- implementation missed 4 planned tasks;
- 3 tests fail;
- one UI route is not wired;
- security scan finds a fixable dependency issue;
- final review finds another recoverable edge case.

SmartAIHub should fix them.

The user MAY inspect progress/closure ledgers on demand.

Default communication for `MINIMIZE_CONTACT` / `UNATTENDED_TO_COMPLETION`:

```text
start/approval if needed
→ work silently
→ completion
```

or, only if unavoidable:

```text
start
→ one batched human-exclusive request
→ auto-resume
→ completion
```

---

# 298. Plan/spec evolution and newly discovered requirements

Implementation may reveal requirements that were not knowable at initial planning.

SmartAIHub SHALL distinguish:

```text
DERIVED_IMPLEMENTATION_REQUIREMENT
  necessary to satisfy an already approved requirement safely/correctly

NEW_PRODUCT_REQUIREMENT
  materially changes requested business behavior/scope
```

`DERIVED_IMPLEMENTATION_REQUIREMENT` SHOULD be added to the coverage graph and executed automatically when within authority/budget.

`NEW_PRODUCT_REQUIREMENT` follows material scope-change policy.

This prevents the harness from stopping merely because the original plan did not predict every technical detail.

---

# 299. Closure-first external harness contract

When SmartAIHub delegates to an external coding/agent harness, the contract SHOULD request structured completion status:

```yaml
HarnessResult:
  execution_status: SUCCESS|PARTIAL|FAILED|WAITING
  claimed_completed_requirement_ids: [string]
  uncompleted_requirement_ids: [string]
  discovered_gap_items: [object]
  failed_checks: [object]
  generated_artifact_refs: [ref]
  evidence_refs: [ref]
  recommended_continuation: object|null
```

SmartAIHub MUST independently reconcile this result against its canonical coverage/closure state.

Provider self-report is evidence, not final authority.

---

# 300. R3.4 additional acceptance tests

Implementation MUST prove at least:

1. a plan omitting accepted spec requirements is automatically repaired before implementation proceeds;
2. missing plan coverage does not become a terminal user message when AI-actionable;
3. after implementation, unimplemented accepted requirements become closure tasks automatically;
4. planned tasks marked done without evidence are reopened;
5. a required stub/placeholder is detected and closed before DONE;
6. an out-of-scope TODO does not incorrectly block completion;
7. a required skipped test prevents verified completion and creates closure work;
8. a harness returning “10 remaining items” results in continuation rather than final success;
9. user does not need to type “continue” after a provider/harness partial result;
10. open closure items survive model/session/harness termination;
11. another authorized executor can resume closure work from durable state;
12. requirement-to-plan-to-implementation-to-verification traceability is queryable;
13. implementation evidence for a superseded generation does not close the current requirement;
14. failed verification reopens the corresponding requirement/closure item;
15. a repaired requirement is not closed until verification passes;
16. final DONE is rejected while any applicable AI-actionable closure item is open;
17. `CompletionCertificate` cannot pass with unresolved AI-actionable work;
18. a derived technical requirement is incorporated automatically when it does not materially expand product scope;
19. a new business requirement triggers normal material-scope semantics instead of hidden expansion;
20. plan completion is rechecked after a material spec revision;
21. implementation completeness is rechecked after plan revision;
22. regression discovered late reopens earlier closed work;
23. all reopened work must be reverified against the final generation;
24. AI-actionable security findings are repaired instead of reported as final blockers;
25. AI-actionable deployment-readiness findings are repaired/retested;
26. closure items have durable owner/state/evidence;
27. duplicate gap findings deduplicate without losing evidence;
28. dependent closure items are ordered so downstream work is not repeatedly invalidated;
29. user communication can remain silent while internal closure debt is being eliminated;
30. final report may state how many gaps were discovered/closed without asking the user to manage them;
31. human-exclusive blocker continues independent closure work before asking the user;
32. after the human supplies the missing action, closure resumes automatically;
33. coverage metrics cannot falsely close a semantically unsatisfied requirement;
34. external harness SUCCESS claim is rejected if canonical coverage still has gaps;
35. final verification scans for unfinished accepted-scope stubs/skips/placeholders;
36. complex goal can survive multiple planning/implementation/review cycles and finish with zero open applicable AI-actionable items.

---

# 301. R3.4 fourteen-pass closure hardening review

| Pass | Lens | Gap found | R3.4 resolution |
|---:|---|---|---|
| 1 | Spec → Plan loss | Decomposition could silently omit requirements | Added PlanCompletenessGate + RequirementCoverageGraph |
| 2 | Plan → Implementation loss | Planned tasks could be forgotten after coding sessions | Added ImplementationCompletenessGate |
| 3 | Implementation → Evidence loss | Code existence could be mistaken for completion | Added VerificationCompletenessGate |
| 4 | Gap reporting behavior | Harness could report known gaps and stop | Added Gap-as-Work invariant + no-report-only rule |
| 5 | Harness session boundary | Provider ending a session could become accidental project stop | Added HarnessPartialResultInterceptor |
| 6 | Durable unfinished work | Gap list could live only in Chat text | Added ClosureLedger |
| 7 | Hidden partial implementation | Stubs/TODO/skipped tests/disabled paths could survive final review | Added applicability-aware orphan-work discovery |
| 8 | False closure | “done” claim could rely on prose/model confidence | Added CompletionCertificate + evidence coverage |
| 9 | Regression reopening | Previously closed work could break after later fixes | Added REOPENED lifecycle and final-generation verification |
| 10 | Multi-session ownership | New harness might not know what remains | Bound closure ownership to durable goal/work graph |
| 11 | Newly discovered technical needs | Original plan can never predict every implementation requirement | Added derived-implementation-requirement semantics |
| 12 | User babysitting | Internal gap debt could generate repeated messages | Added closure communication suppression |
| 13 | Out-of-scope false positives | TODO scanning could inflate scope | Added applicability/exclusion classification |
| 14 | Provider self-report trust | Harness SUCCESS/PARTIAL claims could be inaccurate | Canonical coverage reconciliation remains final authority |

All identified gaps were incorporated into R3.4.

---

# 302. R3.4 Definition of Done extension

R3.4 is not complete until the platform demonstrates:

- specification/definition completeness can be iteratively hardened;
- plan completeness is reconciled against the approved specification;
- implementation completeness is reconciled against both specification and plan;
- verification completeness is reconciled against the final implementation generation;
- AI-actionable gaps automatically become owned closure work;
- external harness partial results cannot prematurely terminate the parent goal;
- unfinished closure work survives sessions/providers/restarts;
- stubs/placeholders/skipped required tests are found and evaluated before completion;
- regressions reopen previously closed items and are reverified;
- newly discovered derived technical requirements can be incorporated automatically;
- users are not asked to supervise ordinary gap closure;
- terminal success requires zero unresolved applicable AI-actionable closure items;
- the default morning experience after unattended work is **the finished deliverable**, not a list of problems the AI already knows how to fix.

---

# 303. R3.5 Cross-session dependency and self-reactivation principle

SmartAIHub MUST NOT require the user to act as the coordinator between concurrent sessions, harnesses, worktrees, runners or long waits.

Normative principles:

> **If Session A depends on work owned by Session B, SmartAIHub owns the dependency relationship, readiness detection, handoff coordination, waiting, and automatic resume.**

> **A checkpoint is a durable resume point, not a terminal stop.**

> **Any recoverable wait SHALL have a machine-readable wake condition and a way to reactivate automatically.**

The following is prohibited as normal terminal behavior:

```text
“I cannot continue because another session is still working.
Please come back when it is finished.”
```

Preferred behavior:

```text
Dependency identified
→ determine exact required subset
→ check whether enough already exists
→ request/use partial handoff if possible
→ otherwise checkpoint consumer
→ subscribe to readiness event
→ schedule next readiness recheck
→ release unnecessary resources
→ wake automatically when event/schedule fires
→ revalidate
→ resume
→ repeat until DONE
```

---

# 304. CrossSessionDependencyContract

A durable dependency SHALL be representable independently of any Chat transcript.

```yaml
CrossSessionDependencyContract:
  id: uuid
  consumer_goal_ref: ref
  consumer_task_ref: ref
  producer_goal_ref: ref|null
  producer_task_ref: ref|null
  producer_session_ref: ref|null
  producer_workspace_ref: ref|null

  dependency_kind:
    SOURCE_REVISION|
    CHECKPOINT|
    BUILD_ARTIFACT|
    SCHEMA_MIGRATION|
    API_CONTRACT|
    RUNNER_CAPABILITY|
    TEST_FIXTURE|
    DEPLOYMENT_BINDING|
    OTHER

  required_scope:
    paths: [string]
    requirement_refs: [ref]
    artifact_refs: [ref]
    capability_refs: [ref]

  sufficiency_predicate_ref: ref

  acceptable_source_states:
    - CANONICAL_COMMIT
    - PEER_BRANCH_COMMIT
    - VERIFIED_CHECKPOINT
    - IMMUTABLE_SNAPSHOT
    - ISOLATED_PATCH_BUNDLE

  state:
    DISCOVERING|
    READY|
    PARTIALLY_READY|
    WAITING_ON_PEER|
    WAITING_EXTERNAL|
    CONSUMING|
    SATISFIED|
    SUPERSEDED|
    FAILED

  continuation_ref: ref
  wakeup_policy_ref: ref
  timeout_recovery_policy_ref: ref
```

The dependency MUST describe the **smallest required subset**, not merely “wait for Session B.”

---

# 305. DependencySufficiencyResolver

Before waiting for another session to finish, SmartAIHub SHALL determine:

> **What exact artifact/behavior is needed for my next step, and do I already have enough to perform it safely?**

Example:

```text
Consumer need:
Verify that Chat can dispatch a Runner command.

Do we need:
- all of Spec 224 complete?                  NO
- unrelated Runner workflows complete?       NO
- minimum Chat→Runner dispatch path?          YES
- compatible DB/schema state?                YES
- source revision containing that path?       YES
```

The resolver SHALL evaluate:

```text
required files/contracts/capabilities
current source revisions
peer branches/worktrees/checkpoints
schema state
runtime compatibility
test preconditions
known missing pieces
whether missing producer work is relevant to this exact validation
```

If an older or partial revision is sufficient, SmartAIHub SHOULD use it in an isolated traceable test rather than waiting for unrelated work.

---

# 306. SourceFreshnessResolver — latest is not always required

A stale `main`/`origin/main` does not automatically mean the consumer is blocked.

SmartAIHub SHALL distinguish:

```text
LATEST_CANONICAL
LATEST_AVAILABLE
MINIMUM_SUFFICIENT
LOCAL_AHEAD
UNKNOWN
```

`MINIMUM_SUFFICIENT` MAY be selected when:

- the current operation does not require the producer's newest unrelated changes;
- compatibility is proven;
- testing is isolated;
- evidence records the exact tested revision;
- final verification will rerun against the final canonical generation.

This avoids unnecessary serialization.

---

# 307. PartialHandoffProtocol

A producer session MAY have completed the exact subset another consumer needs while still continuing unrelated work.

SmartAIHub SHOULD support machine-to-machine requests such as:

```text
Consumer needs paths/contracts X/Y and migration state Z.
Are these stable enough to hand off now?
If yes, publish a safe checkpoint/commit/snapshot for that completed subset.
```

Valid handoff forms MAY include:

```text
dedicated peer-branch commit
checkpoint commit
immutable source snapshot
isolated patch bundle
build artifact + source digest
verified interface contract
```

The protocol MUST NOT force the producer to:

- merge incomplete work to `main`;
- expose unrelated dirty state;
- break its current worktree;
- commit secrets;
- publish an inconsistent subset.

When a clean partial commit is unsafe, an isolated checkpoint/snapshot SHOULD be preferred.

---

# 308. PeerSessionCoordinator

SmartAIHub SHALL provide coordination above individual harness sessions.

Capabilities SHOULD include:

```text
query peer session/task status
query branch/worktree/source generation
query completed requirement/artifact subset
request checkpoint/handoff
request producer to prioritize exact dependency
receive handoff-ready event
receive producer terminal/partial result
detect producer stall/abandonment
transfer/take over remaining transferable work
```

The coordinator MAY use canonical task/job/event infrastructure, provider adapters, or supported harness messaging.

The user is not the message bus.

---

# 309. Dependency minimization

The consumer SHALL NOT wait for an entire peer goal when only one subset is required.

Example:

```text
Session B:
- Runner dispatch path          ← needed
- dashboard refactor            ← unrelated
- telemetry enhancement         ← unrelated
- documentation                 ← unrelated
```

If Runner dispatch is handoff-safe:

```text
handoff Runner subset
→ Session A continues smoke test
→ Session B continues unrelated work
```

Dependency edges SHOULD target artifacts/requirements/capabilities rather than actor/session identity.

---

# 310. CheckpointAndReactivateContract

Whenever SmartAIHub must pause recoverable work, it SHALL write a checkpoint **and** create a durable continuation.

```yaml
CheckpointAndReactivateContract:
  goal_ref: ref
  task_ref: ref
  checkpoint_ref: ref
  wait_reason:
    PEER_DEPENDENCY|
    EXTERNAL_RESOURCE|
    EXECUTOR_UNAVAILABLE|
    PROVIDER_QUOTA|
    RATE_LIMIT|
    SCHEDULED_TIME|
    TEMPORARY_POLICY_WINDOW|
    OTHER_RECOVERABLE

  wake:
    event_topics: [string]
    condition_ref: ref
    next_recheck_at: timestamp|null
    recheck_backoff_policy_ref: ref|null
    max_recheck_interval: duration|null

  resume:
    handler_ref: ref
    revalidation_policy_ref: ref
    auto_resume: true

  state:
    ARMED|WAITING|READY|RESUMING|RESUMED|SUPERSEDED|CANCELLED
```

Core invariant:

```text
RECOVERABLE WAIT
=
CHECKPOINT
+
WAKE CONDITION
+
DURABLE REACTIVATION
```

A checkpoint without a wake path is insufficient for unattended completion.

---

# 311. Event-first wakeup with scheduled fallback

Preferred wakeup uses events:

```text
checkpoint.ready
artifact.ready
requirement.verified
source.published
task.completed
executor.online
quota.available
provider.recovered
```

When an event is received:

```text
evaluate wake condition
→ if satisfied, mark continuation READY
→ dispatch resume
```

Because events may be unavailable or lost, SmartAIHub SHALL also schedule periodic reconciliation.

Example:

```text
event subscription
+
next_recheck_at = 5 minutes
+
adaptive backoff 5m → 15m → 30m → 60m
+
watchdog reconciliation
```

The schedule exists to reactivate the work, not merely to send a reminder.

---

# 312. Recursive wait-resume loop until completion

If a scheduled recheck wakes the task and the dependency is still not ready:

```text
wake
→ recheck
→ still blocked
→ refresh checkpoint if needed
→ calculate next_recheck_at
→ arm continuation again
→ release resources
```

If ready:

```text
wake
→ revalidate goal/policy/source/environment
→ consume dependency
→ resume work
```

This loop MAY repeat many times without user involvement.

It ends only on:

```text
dependency satisfied and work progresses
goal complete
goal cancelled/superseded
true human-exclusive boundary
non-recoverable terminal state after authorized alternatives exhausted
```

---

# 313. Automatic resume at any hour

Durable continuation SHALL be independent of the user's active session.

Example:

```text
23:00 Consumer reaches peer dependency
23:01 checkpoint + continuation armed
02:00 Producer publishes required checkpoint
02:00 ready event fires
02:01 Consumer resumes automatically
02:20 tests run
02:40 repair loop runs
03:10 final verification continues
morning user opens SmartAIHub
→ sees completed work or truthful active progress
```

The browser, phone, tablet and original Chat session MAY all be closed.

---

# 314. Peer completion is not required if the predicate is ready

The consumer SHOULD wake when its dependency predicate becomes true, not only when the producer task is terminal.

Examples:

```text
producer still RUNNING
but required commit exists
→ wake consumer

producer PARTIAL
but required API contract verified
→ wake consumer

producer FAILED overall
but usable checkpoint exists
→ consumer may continue

producer COMPLETED
but required artifact absent
→ dependency remains unsatisfied
```

This prevents coarse task status from creating unnecessary blockers.

---

# 315. Peer stall, termination and takeover

If the producer session stalls, loses quota, terminates or is abandoned:

1. check whether required subset already exists;
2. check whether another authorized executor can finish only the dependency;
3. check whether consumer can take over transferable work;
4. check alternate implementation satisfying the same dependency;
5. wait durably only when genuinely necessary.

Transfer MUST respect mutation leases/fencing.

The system SHOULD prefer completing the dependency over asking the user to manually restart another session.

---

# 316. Cross-session source safety

When consuming peer work:

- do not assume `main` is latest merely because it is checked out;
- compare branch/worktree/remote/checkpoint generations;
- do not merge/cherry-pick dirty incomplete producer state blindly;
- use isolated worktree/branch/snapshot for provisional validation;
- record exact source digest/revision in evidence;
- final verification reruns against intended final canonical revision;
- stale consumer writes remain fenced from producer-owned canonical mutation.

---

# 317. WAITING_* states are active responsibilities

The following states MUST represent active durable responsibilities, not abandoned work:

```text
WAITING_ON_PEER
WAITING_EXTERNAL
WAITING_FOR_EXECUTOR
WAITING_FOR_QUOTA
WAITING_FOR_PROVIDER
WAITING_FOR_TIME
```

Each SHOULD have:

```text
owner
checkpoint
wait condition
last check
next check
event subscription
recovery policy
automatic resume enabled
```

A work item in a `WAITING_*` state without an armed continuation SHOULD be treated as an operational defect.

---

# 318. User-facing waiting communication

When useful, SmartAIHub MAY tell the user:

> “ขั้นตอนนี้ต้องใช้ส่วน Runner ที่อีก session กำลังทำอยู่ ผมตรวจแล้ว code ที่มีตอนนี้ยังไม่พอสำหรับ test นี้ ผมผูก dependency และตั้ง auto-recheck ไว้แล้ว ถ้าส่วนที่ต้องใช้พร้อมเมื่อไร ผมจะ resume งานต่อเองทันที ไม่ต้องกลับมาสั่งใหม่ครับ”

The message MUST NOT imply that the user must:

- chase the other session;
- ask it to commit;
- remember to return;
- type “continue”;
- keep a device/browser open.

If SmartAIHub can request a partial handoff itself, it SHOULD do so before waiting.

---

# 319. Workboard projection for durable waits

Workboard SHOULD expose inspectable state:

```text
Task: Chat→Runner smoke test
State: WAITING_ON_PEER
Needs: Runner dispatch contract + compatible source checkpoint
Producer: Spec 224 task/session …
Latest usable source: …
Partial handoff requested: YES
Event subscription: ACTIVE
Last recheck: 01:45
Next recheck: 02:00
Auto-resume: ENABLED
```

This is status, not a required user action.

---

# 320. Early handoff evidence and final reconciliation

Early continuation may use a minimum-sufficient peer revision.

```text
early test against revision A
→ useful development evidence

producer later finishes revision B
→ compatibility check
→ rerun impacted final verification
→ final completion only against intended final generation
```

This improves throughput without weakening final correctness.

---

# 321. Cross-session dependency watchdog

The watchdog SHALL detect:

```text
WAITING_ON_PEER with no armed continuation
next_recheck_at missed
event subscription lost
producer completed but consumer not resumed
producer emitted ready artifact but dependency state stale
producer stalled beyond threshold
consumer checkpoint missing/corrupt
dependency predicate satisfiable but state still waiting
```

Recovery SHOULD include:

```text
re-arm schedule
re-subscribe event
reconcile producer state
reconstruct checkpoint
dispatch resume
transfer dependency work
```

The user SHOULD not be the recovery mechanism.

---

# 322. R3.5 additional acceptance tests

Implementation MUST prove at least:

1. consumer identifies exact required subset from another session;
2. consumer does not wait for unrelated producer work;
3. stale `main` does not block when a safe minimum-sufficient revision exists;
4. evidence records the exact peer revision used;
5. final verification reruns if final producer changes may affect early evidence;
6. consumer can request partial handoff without user involvement;
7. producer can expose safe checkpoint/snapshot without merging incomplete work;
8. dirty unrelated producer changes are excluded;
9. `WAITING_ON_PEER` survives browser/service restart;
10. every recoverable waiting state has an armed continuation;
11. checkpoint without wake condition is rejected for unattended mode;
12. event-ready signal resumes consumer automatically;
13. lost event is recovered by scheduled recheck;
14. scheduled recheck while still blocked re-arms itself automatically;
15. scheduled recheck when ready resumes implementation automatically;
16. consumer resumes at 02:00 without user/browser activity;
17. producer RUNNING can still satisfy consumer dependency early;
18. producer COMPLETED does not satisfy dependency if artifact is absent;
19. producer stall triggers takeover/alternate dependency completion strategy;
20. session termination does not lose dependency ownership;
21. another executor can complete transferable dependency work;
22. peer worktree/source generation is compared before consumption;
23. provisional peer code is tested in isolated source context;
24. stale consumer cannot overwrite producer canonical source;
25. Workboard shows next automatic recheck and auto-resume state;
26. user never needs to type “continue” after dependency becomes ready;
27. `WAITING_ON_PEER` with no schedule/event is detected as defect;
28. watchdog re-arms a missed continuation;
29. quota reset can wake work by event or schedule and resume automatically;
30. executor reconnect can wake waiting development automatically;
31. temporary provider outage can use durable backoff continuation;
32. automatic wake always revalidates goal/policy/source/environment before mutation;
33. cancelled/superseded goal prevents stale scheduled resume;
34. duplicate wake events do not resume the same continuation twice;
35. recheck cadence backs off to control cost while preserving bounded liveness;
36. dependency remains durable until satisfied/superseded/cancelled/terminal.

---

# 323. R3.5 twelve-pass hardening review

| Pass | Lens | Gap found | R3.5 resolution |
|---:|---|---|---|
| 1 | Session dependency ownership | User could become coordinator between sessions | Added CrossSessionDependencyContract |
| 2 | Over-waiting | Consumer could wait for whole peer goal | Added DependencySufficiencyResolver + dependency minimization |
| 3 | Stale main assumption | `main` lag could create false blocker | Added SourceFreshnessResolver |
| 4 | Partial work reuse | Completed subset could be trapped in active peer worktree | Added PartialHandoffProtocol |
| 5 | Session-to-session messaging | No explicit machine coordinator | Added PeerSessionCoordinator |
| 6 | Checkpoint dead stop | Checkpoint alone did not guarantee future activation | Added CheckpointAndReactivateContract |
| 7 | Event loss | Event-only continuation could stall forever | Added scheduled periodic fallback |
| 8 | Poll-only latency | Schedule-only continuation could resume too late | Event-first immediate wake |
| 9 | Sleep-mode dependency | Waiting task might still require user reopening Chat | Added browser-independent auto-resume |
| 10 | Peer terminal-state coupling | Consumer could wait for producer completion unnecessarily | Wake on dependency predicate |
| 11 | Peer abandonment | Stalled session could cause infinite waiting | Added takeover/alternate completion |
| 12 | Waiting liveness | Durable wait could exist with no active wake path | Added watchdog and `WAITING_*` armed-continuation invariant |

All identified gaps were incorporated into R3.5.

---

# 324. R3.5 Definition of Done extension

R3.5 is not complete until:

- users never need to manually coordinate normal dependencies between SmartAIHub sessions;
- peer dependency waits persist durably;
- checkpointed recoverable waits always have event/schedule-based reactivation;
- the system checks whether existing source is already sufficient before waiting;
- partial handoff can unblock consumers safely;
- unrelated producer work does not unnecessarily serialize consumers;
- event readiness can wake work immediately;
- scheduled rechecks recover lost/missing events;
- scheduled rechecks re-arm themselves while the dependency remains unavailable;
- work resumes automatically at any hour when the dependency becomes ready;
- source/worktree/commit safety is preserved;
- stalled peer sessions can be recovered/taken over where authorized;
- final verification still reconciles early partial evidence against final canonical source;
- a user can go to sleep while work is `WAITING_ON_PEER` and wake to automatically resumed/finished work rather than a stale blocker.

---

# 325. R3.6 Subagent Execution Fabric

Subagents are a first-class execution optimization for work that benefits from parallelism, independent context, specialization, alternate strategies, or independent verification.

The Subagent Execution Fabric SHALL sit above the canonical durable job/event plane:

```text
Goal / Parent Task
        ↓
ParallelismPlanner
        ↓
Subagent Work Units
        ↓
worker_jobs / approved canonical execution plane
        ↓
Worker / Container / PC-Mac / External Harness / Provider Agent
        ↓
Progress / Evidence / Artifacts
        ↓
Fan-in / Selection / Synthesis / Verification
        ↓
Parent Goal
```

Spec 269 MUST NOT create a second scheduler or job source of truth.

Normative principle:

> **Subagent delegation is not fire-and-forget. The parent owns progress, recovery, result quality and closure.**

---

# 326. ParallelismPlanner

Before spawning subagents, SmartAIHub SHALL decide whether parallelism is beneficial.

Inputs SHOULD include:

```text
task dependency graph
critical path
independent subproblems
context size
estimated serial time
estimated parallel speedup
fanout cost
provider/runtime capacity
resource fairness
deadline
quality benefit from independent approaches
merge/synthesis complexity
side-effect risk
```

The planner SHALL distinguish at least:

```text
SERIAL_REQUIRED
PARALLEL_INDEPENDENT
PARALLEL_RESEARCH
PARALLEL_IMPLEMENTATION_ISOLATED
PARALLEL_SPECULATIVE
PARALLEL_VERIFY
HEDGED_EXECUTION
```

Parallelism SHOULD be preferred when expected benefit materially exceeds coordination and compute cost.

Parallelism MUST NOT be used merely to create the appearance of multi-agent sophistication.

---

# 327. SubagentWorkUnit

Each subagent SHALL receive a bounded work contract.

```yaml
SubagentWorkUnit:
  id: uuid
  parent_goal_ref: ref
  parent_task_ref: ref
  delegation_ref: ref
  objective: string

  input_context_packet_ref: ref
  required_capabilities: [ref]
  allowed_tools: [ref]
  allowed_data_scopes: [ref]
  authority_ceiling_ref: ref
  budget_ref: ref

  dependency_refs: [ref]
  expected_artifacts: [ref]
  success_criteria_refs: [ref]
  evidence_requirements: [ref]

  execution_policy:
    preferred_runtime_refs: [ref]
    fallback_runtime_refs: [ref]
    timeout_policy_ref: ref
    retry_policy_ref: ref

  merge_policy_ref: ref|null
  result_selection_group_ref: ref|null
```

A child subagent SHALL NOT receive broader authority, data scope or budget than necessary for its bounded objective.

---

# 328. ContextPacket and context isolation

Subagents SHOULD receive compact task-specific context instead of the entire parent Chat/history.

```yaml
ContextPacket:
  goal_summary: string
  subtask_objective: string
  relevant_requirement_refs: [ref]
  relevant_artifact_refs: [ref]
  relevant_decision_refs: [ref]
  relevant_memory_refs: [ref]
  constraints: [ref]
  acceptance_criteria_refs: [ref]
  prior_attempt_summary_ref: ref|null
  token_budget_hint: integer|null
```

Required behavior:

```text
parent context
→ relevance/projector
→ smallest sufficient ContextPacket
→ subagent
```

Benefits:

- lower token/context cost;
- less distraction;
- reduced cross-scope leakage;
- better specialization;
- easier retry/replacement;
- more deterministic handoff.

Context isolation MUST still preserve all constraints required for correctness and policy compliance.

---

# 329. Subagent state model and ProgressReceipt

Subagent progress SHALL be inspectable without reading its hidden reasoning.

Minimum state model:

```text
QUEUED
ADMITTED
STARTING
RUNNING
WAITING_DEPENDENCY
WAITING_PROVIDER
WAITING_RATE_LIMIT
THROTTLED
RETRYING
RECOVERING
STALLED
PARTIAL
SUCCEEDED
FAILED
CANCELLED
SUPERSEDED
```

`SubagentProgressReceipt` SHOULD include:

```yaml
SubagentProgressReceipt:
  subagent_work_unit_ref: ref
  state: string
  phase: string|null
  progress_fraction: number|null
  current_action_summary: string|null
  completed_milestone_refs: [ref]
  artifact_refs: [ref]
  evidence_refs: [ref]
  wait_reason_ref: ref|null
  provider_runtime_ref: ref|null
  attempt_number: integer
  heartbeat_at: timestamp
  expected_next_heartbeat_at: timestamp|null
  next_recovery_action_ref: ref|null
```

The receipt is operational status, not chain-of-thought.

---

# 330. Heartbeat and StallDetector

Every non-trivial long-running subagent SHOULD have heartbeat/staleness semantics appropriate to its runtime.

A subagent MAY be considered stalled when signals indicate no expected progress, for example:

```text
heartbeat overdue
provider stream silent beyond policy
no job/state transition
no new artifact/evidence
same error loop
child process exited without terminal receipt
external harness disconnected
resource lease expired
```

The StallDetector SHALL trigger recovery rather than merely mark `STALLED`.

Recovery order MAY include:

```text
query/reconcile actual provider state
resume from provider job id
restart same worker from checkpoint
retry with bounded backoff
rebind another equivalent executor
transfer work to another subagent
split remaining scope
switch authorized provider/runtime
use alternate research route
independent diagnosis
```

User attention is a last resort.

---

# 331. ResearchPathFallback and temporary saturation

Research tasks commonly fail temporarily due to:

- provider bandwidth saturation;
- rate limits;
- queue congestion;
- search API limits;
- site/server outage;
- transient network failure;
- regional route degradation.

SmartAIHub SHALL classify transient capacity failure separately from permanent incapability.

```yaml
ResearchPathState:
  route_ref: ref
  status: READY|DEGRADED|SATURATED|RATE_LIMITED|UNAVAILABLE
  retry_after: timestamp|null
  confidence: LOW|MEDIUM|HIGH
  alternate_route_refs: [ref]
```

Preferred response:

```text
route A saturated
→ respect trustworthy Retry-After/reset
→ schedule durable retry
AND/OR
→ launch authorized alternate route B/C
→ continue unaffected research branches
→ reconcile results when available
```

The parent MUST NOT stop merely because one research path is temporarily unavailable.

---

# 332. HedgedExecution

For high-latency or unreliable idempotent work, SmartAIHub MAY use hedged execution.

Example:

```text
Start route A
→ no useful progress by hedge threshold
→ launch route B
→ first acceptable verified result wins
→ cancel/release loser where safe
```

Hedging SHOULD be used only when:

- side effects are absent or safely isolated;
- duplicate economic cost is acceptable under budget policy;
- latency benefit justifies additional resource use;
- result selection criteria are defined.

Hedging MUST NOT be used for non-idempotent external mutations unless execution is independently isolated from commitment.

---

# 333. Speculative multi-approach execution

Some tasks benefit from trying multiple approaches in parallel.

Examples:

```text
three implementation architectures
multiple bug hypotheses
different UI layouts
different research strategies
multiple optimization algorithms
alternative content concepts
different migration strategies
```

SmartAIHub MAY create a `ResultSelectionGroup`.

```yaml
ResultSelectionGroup:
  id: uuid
  parent_task_ref: ref
  strategy: BEST_OF_N|FIRST_ACCEPTABLE|QUORUM|SYNTHESIZE|PARETO_SELECT
  candidate_work_unit_refs: [ref]
  evaluation_contract_ref: ref
  stop_policy_ref: ref
```

Parallel candidates SHOULD be intentionally diverse where diversity increases information value.

Simply cloning the same prompt across identical contexts MUST NOT be treated as meaningful independent exploration.

---

# 334. ResultSelectionContract

Result selection SHALL be explicit for parallel alternatives.

```yaml
ResultSelectionContract:
  required_criteria:
    - correctness
    - requirement_coverage
    - evidence_quality
    - compatibility
    - security_policy
    - quality_floor

  weighted_criteria:
    maintainability: number
    cost: number
    latency: number
    simplicity: number
    performance: number
    novelty: number

  disqualifiers: [ref]
  verifier_policy_ref: ref
  tie_break_policy_ref: ref
```

Selection MUST NOT rely only on:

- model self-confidence;
- response verbosity;
- majority vote among correlated models;
- first completion when quality requirements are unmet.

Where possible, use deterministic tests/evidence and an independent evaluator.

---

# 335. Fan-in modes

The parent SHALL choose an appropriate fan-in strategy.

```text
FIRST_ACCEPTABLE
  return the first candidate that passes all required gates.

BEST_OF_N
  wait for enough candidates, score them, choose the strongest.

QUORUM
  use multiple independently grounded results for factual confidence.

SYNTHESIZE
  combine complementary partial results into one output.

PARETO_SELECT
  retain multiple non-dominated options when tradeoffs are real.

MERGE_IMPLEMENTATION
  merge isolated source changes under explicit merge ownership and reverify.
```

The selected result becomes parent evidence only after required verification.

---

# 336. Early stopping and loser cancellation

Parallel execution SHALL support early stopping.

Examples:

```text
FIRST_ACCEPTABLE winner verified
→ cancel redundant candidates

BEST_OF_N
→ evaluator proves remaining candidate cannot materially beat current winner
→ cancel remaining expensive runs where policy allows

research quorum achieved
→ cancel duplicate low-value searches
```

Cancellation MUST preserve already-created useful evidence/artifacts when retention policy permits.

The system SHOULD avoid paying for full fanout after the decision is already sufficiently supported.

---

# 337. Straggler mitigation

A slow subagent MUST NOT unnecessarily hold the entire fan-in barrier.

The parent SHOULD determine whether the straggler is:

```text
REQUIRED
OPTIONAL_FOR_QUALITY
REDUNDANT
REPLACEABLE
```

Possible responses:

```text
wait with durable continuation
hedge/duplicate on alternate route
replace executor
split remaining work
proceed without optional straggler
lower its priority
cancel after sufficient result obtained
```

A barrier SHALL wait only for required contributions.

---

# 338. Parallel research evidence diversity

Research fanout SHOULD diversify along meaningful dimensions when useful:

```text
different sources
different search queries
different jurisdictions/languages
primary vs secondary sources
technical vs business perspective
current-news vs historical evidence
different provider search stacks
```

The parent SHALL deduplicate repeated evidence.

Ten subagents quoting the same source are not ten independent confirmations.

---

# 339. Parallel implementation isolation

Coding subagents SHALL NOT share an unfenced mutable working tree by default.

Supported isolation MAY include:

```text
independent Git branches
worktrees
sandbox snapshots
patch bundles
module/path ownership leases
generated candidate diffs
```

Each candidate SHALL identify:

```text
base revision
owned mutation scope
result revision/patch
tests run
evidence
conflicts
```

One explicit merge/synthesis owner SHALL integrate candidates.

After merge:

```text
merge
→ build
→ affected tests
→ integration tests
→ completeness reconciliation
→ final verification
```

Passing tests on isolated branches does not prove the merged result.

---

# 340. Work stealing and subagent takeover

If a subagent fails or stalls, another authorized subagent MAY take over transferable work.

The takeover packet SHOULD include:

```text
objective
ContextPacket
checkpoint/artifacts
completed milestones
failed attempts
failure fingerprint
remaining scope
verification state
```

The replacement SHOULD NOT repeat known-failed work blindly.

Work stealing MAY also redistribute queued subtasks from overloaded executors to idle compatible executors.

---

# 341. Dynamic fanout control

Fanout SHALL be dynamic.

The system MAY increase parallelism when:

- independent work remains;
- deadline pressure increases;
- diverse exploration has high expected value;
- spare resources exist;
- one route becomes degraded.

The system SHOULD reduce fanout when:

- resource pressure rises;
- candidates converge on equivalent result;
- marginal information gain falls;
- current winner is already strong enough;
- budget approaches its envelope;
- merge/synthesis complexity exceeds expected benefit.

This prevents uncontrolled subagent storms.

---

# 342. Semantic duplicate-work suppression

Before spawning a new subagent, the planner SHOULD check whether equivalent work is already:

```text
queued
running
waiting
completed recently
available in cache/evidence
owned by another peer session
```

Equivalent work MAY join/subscribe to an existing work result instead of creating another subagent.

Deduplication SHALL account for scope/inputs/version so distinct required variants are not collapsed incorrectly.

---

# 343. Parent accountability for child failure

A child state of:

```text
PARTIAL
FAILED
STALLED
WAITING_RATE_LIMIT
WAITING_PROVIDER
```

is normally an input to parent recovery.

It MUST NOT automatically become a user-facing blocker.

Parent behavior:

```text
child issue
→ classify
→ recover/retry/replace/reroute
→ update fan-in plan
→ continue
```

Only a true human-exclusive/material boundary may propagate to user attention.

---

# 344. Subagent observability UX

The user MAY inspect subagent execution without being required to manage it.

A compact projection SHOULD support:

```text
Researching launch options
  6 subagents
  ✓ 3 complete
  ↻ 1 running
  ⏳ 1 rate-limited; retry 10:20
  ↪ 1 rerouted to alternate source
  Current best candidate: B
  Auto-select: enabled
```

Expanded details MAY show:

```text
role/subtask
state
phase
attempt
provider/runtime
heartbeat
wait reason
next retry/recovery
artifact/evidence refs
estimated cost
selection-group membership
```

Default UX SHOULD emphasize parent outcome, not operational noise.

---

# 345. Best-result provenance

When SmartAIHub chooses among parallel approaches, the final result SHOULD provide concise provenance when useful:

```text
3 approaches evaluated
Selected: Approach B
Why:
- passes all 42 required tests
- lowest operational complexity
- 18% lower estimated runtime cost
- no new external dependency
Rejected:
- A failed migration rollback criterion
- C passed but required higher ongoing cost
```

This explains the decision without exposing hidden chain-of-thought.

---

# 346. Subagent cost and context accounting

Subagent fanout can reduce wall-clock time and parent-context pressure while increasing aggregate compute.

Metrics SHOULD track:

```text
wall-clock speedup
aggregate inference/runtime cost
parent context saved
subagent context tokens
fanout width
useful-result ratio
cancelled speculative cost
retry/recovery cost
selection quality
```

Optimization SHOULD target user outcome, not minimum token use in isolation.

---

# 347. Subagent event and recovery semantics

Events SHOULD include:

```text
subagent.created
subagent.started
subagent.progress
subagent.heartbeat
subagent.waiting
subagent.rate_limited
subagent.stalled
subagent.retrying
subagent.rerouted
subagent.partial
subagent.succeeded
subagent.failed
subagent.cancelled
selection.candidate_ready
selection.winner_selected
selection.synthesis_started
selection.completed
```

All events SHALL correlate to canonical goal/task/delegation/job identifiers.

Duplicate/out-of-order events MUST NOT regress terminal state.

---

# 348. R3.6 additional acceptance tests

Implementation MUST prove at least:

1. independent subtasks can execute concurrently;
2. dependent subtasks are not incorrectly parallelized;
3. subagents receive bounded ContextPackets instead of full parent conversation by default;
4. ContextPacket still contains all required constraints;
5. parent can inspect every active child state without chain-of-thought;
6. heartbeat loss triggers reconciliation/stall recovery;
7. stalled child can be restarted from checkpoint;
8. stalled child can be transferred to another compatible executor;
9. research route rate limit creates durable retry-after continuation;
10. unaffected research routes continue while one route waits;
11. authorized alternate research route can start automatically;
12. lost Retry-After event is recovered by scheduled recheck;
13. hedged execution can launch a second route after threshold;
14. first acceptable verified result cancels redundant hedge;
15. non-idempotent side effects are excluded from unsafe hedging;
16. speculative implementations can use isolated branches/worktrees;
17. parallel writers cannot mutate same exclusive source scope without fencing;
18. merge owner integrates candidate patches and reruns tests;
19. isolated passing branches do not bypass merged-result verification;
20. BEST_OF_N chooses by explicit evaluation contract;
21. FIRST_ACCEPTABLE refuses a candidate that fails a required criterion;
22. same-source research duplicates do not count as independent quorum;
23. synthesis can combine complementary partial results;
24. straggler classified optional does not block final fan-in;
25. required straggler receives retry/hedge/replacement before user escalation;
26. early stopping cancels unnecessary expensive subagents;
27. dynamic fanout shrinks under resource pressure;
28. dynamic fanout can grow when independent critical-path work exists;
29. semantic duplicate subtask is suppressed/joined;
30. child PARTIAL becomes parent closure/recovery work;
31. child FAILED does not become user blocker while an authorized recovery exists;
32. subagent retry preserves prior attempt evidence;
33. takeover packet prevents blind repetition of known-failed approach;
34. result selection records why winner satisfied criteria;
35. final user result does not expose hidden reasoning;
36. parent can survive service restart with active subagents;
37. child terminal state resumes parent exactly once;
38. provider callback loss is reconciled;
39. subagent quota wait auto-reactivates after reset;
40. resource fairness prevents one parent from monopolizing all subagent slots;
41. context/token accounting is attributable by subagent;
42. speculative extra cost is bounded by policy;
43. selection can favor a slower but materially better result under BEST_OF_N;
44. first completion is not treated as winner when quality gates fail;
45. all losing source mutations remain isolated from canonical source;
46. cancellation of losing agents does not discard already-retained useful evidence;
47. final CompletionCertificate only references selected/synthesized verified generation;
48. subagent fabric introduces no second canonical job SoT.

---

# 349. R3.6 sixteen-pass hardening review

| Pass | Lens | Gap found | R3.6 resolution |
|---:|---|---|---|
| 1 | Parallel speed | Existing delegation allowed subagents but lacked explicit critical-path/fanout planning | Added ParallelismPlanner |
| 2 | Context efficiency | Children could inherit excessive parent context | Added bounded ContextPacket |
| 3 | Progress visibility | Heartbeat existed but not rich child progress receipts | Added SubagentProgressReceipt |
| 4 | Stalled child | Watchdog could surface stall without full takeover/reroute semantics | Added StallDetector recovery ladder |
| 5 | Research saturation | Generic retry lacked route-level saturation/fallback model | Added ResearchPathFallback |
| 6 | Tail latency | No explicit hedge/straggler policy | Added HedgedExecution + straggler mitigation |
| 7 | Multi-approach quality | Parallel exploration lacked formal winner/synthesis contract | Added ResultSelectionGroup/Contract |
| 8 | False consensus | Multiple correlated answers could be mistaken for evidence | Added evidence diversity/dedupe rule |
| 9 | Parallel coding safety | Multiple coding subagents needed explicit isolation/merge ownership | Added branch/worktree/patch fencing |
| 10 | Waste after winner | Fanout could continue spending after sufficient answer | Added early stopping/cancellation |
| 11 | Resource storms | Static fanout could overload platform | Added dynamic fanout controls |
| 12 | Duplicate subwork | Equivalent tasks could be spawned repeatedly | Added semantic duplicate suppression |
| 13 | Child failure leakage | Child failure could propagate prematurely to user | Parent owns recovery |
| 14 | Takeover quality | Replacement child could repeat failed path | Added takeover packet with failure history |
| 15 | Explainability | Winner choice could be opaque | Added best-result provenance |
| 16 | Architecture boundary | Risk of new scheduler/job truth | Explicitly retained canonical worker_jobs/event plane |

All identified gaps were incorporated into R3.6.

---

# 350. R3.6 Definition of Done extension

R3.6 is not complete until:

- SmartAIHub can decompose suitable work into independently executable subagent work units;
- parallelism shortens critical-path latency in measured representative cases;
- each subagent receives a purpose-limited context packet;
- child progress/heartbeat/wait/recovery state is observable;
- stalled children are automatically reconciled/retried/rebound/taken over;
- temporary research saturation can wait and/or reroute automatically;
- multiple approaches can run concurrently under bounded cost/resource policy;
- winner/synthesis selection uses explicit quality/evidence criteria;
- slow/redundant children do not block when their contribution is no longer required;
- coding subagents remain isolated until explicit merge and re-verification;
- child failures remain parent recovery responsibilities;
- dynamic fanout and dedupe prevent subagent storms;
- the user can inspect subagents but does not need to coordinate them;
- the parent returns the best verified outcome, not merely the first child response;
- subagent execution remains a projection over the existing canonical durable job/control plane.

---

# 351. R3.7 Git Development Lifecycle Auto-Orchestration

For Git-backed development work, SmartAIHub SHALL own the normal repository lifecycle end-to-end.

The user SHOULD NOT need to manually remember or invoke:

```text
session-finish
integration-controller
canonical-checkout-sync
```

when the system can determine that those transitions are due.

Existing Skills remain valuable as deterministic/reusable **action handlers**. R3.7 adds the missing lifecycle authority that decides **when** to call them.

Normative principle:

> **Skill discovery answers “how can this action be performed?” Lifecycle state answers “what action is due now?”**

---

# 352. Canonical Git lifecycle

The preferred Git-backed development lifecycle is:

```text
IMPLEMENTING
    ↓
SESSION_CLOSURE_CHECK
    ↓
SESSION_FINALIZING
    ↓
READY_FOR_INTEGRATION
    ↓
INTEGRATION_QUEUED
    ↓
INTEGRATING
    ↓
MAIN_VALIDATED
    ↓
CANONICAL_SYNC_PENDING
    ↓
CANONICAL_PREPARING
    ↓
BUILD_SOURCE_CERTIFIED
    ↓
BUILDING
    ↓
DEPLOYING / RESTARTING
    ↓
RUNTIME_SMOKE_VERIFYING
    ↓
DONE
```

Waiting/recovery states MAY appear between any phases, but every recoverable wait requires durable reactivation under R3.5.

---

# 353. GitLifecycleState

Lifecycle state SHALL be derived from durable facts rather than inferred only from natural-language conversation.

```yaml
GitLifecycleState:
  workspace_ref: ref
  goal_ref: ref

  repository:
    remote_provider: GITHUB|GITLAB|OTHER
    remote_ref: ref
    canonical_checkout_ref: ref|null
    integration_workspace_ref: ref|null

  implementation:
    session_refs: [ref]
    active_worktree_refs: [ref]
    active_branch_refs: [ref]
    closure_state_ref: ref
    child_job_refs: [ref]

  integration:
    ready_branch_refs: [ref]
    integration_queue_ref: ref|null
    integration_lock_ref: ref|null
    validated_main_sha: string|null

  promotion:
    canonical_head_sha: string|null
    certified_build_sha: string|null
    build_ref: ref|null
    deployment_ref: ref|null
    smoke_verification_ref: ref|null

  phase: string
  phase_generation: integer
  next_action: string|null
  next_action_policy_ref: ref|null
  wake_continuation_ref: ref|null
  updated_at: timestamp
```

The controller SHOULD reconstruct state after restart from repository refs, READY markers, checkpoints, worker jobs, evidence and prior lifecycle events.

---

# 354. Lifecycle truth sources

The lifecycle controller SHALL reconcile at least:

```text
git remote refs / origin/main
local branches
worktrees and their dirty state
session branch tips
durable READY markers from session-finish
session ClosureLedger / RequirementCoverageGraph
active worker_jobs / child subagents
integration-controller evidence
validated main SHA
canonical-checkout certification evidence
build/deploy/smoke evidence
resource-admission state
```

Chat text is informative but MUST NOT be the sole truth for lifecycle phase.

---

# 355. Automatic session-finish trigger

A development session SHOULD transition to `SESSION_FINALIZING` automatically when all required predicates hold.

Typical predicates:

```text
session goal/assigned scope known
no open required AI-actionable closure items for the session scope
no required child/subagent work still active
valuable changes are attributable to this session
worktree/branch identity is known
required scoped implementation checks have run or are explicitly deferred by policy
session is not currently mutating source
```

When true:

```text
LifecycleController
→ invoke session-finish action handler
→ make changes durable
→ reconcile latest main according to Skill policy
→ run scoped resource-aware verification
→ push session branch
→ emit durable READY_FOR_INTEGRATION evidence
```

The user SHOULD NOT need to type `session-finish`.

---

# 356. Session finalization recovery

If `session-finish` cannot complete, the lifecycle controller SHALL classify the cause.

Examples:

```text
uncommitted task files
untracked task files
baseline moved
scoped test failure
resource-heavy check deferred
branch collision
mixed unrelated changes
remote unavailable
```

AI-actionable issues route to closure/recovery.

Temporary issues route to checkpoint + reactivation.

A material ambiguous ownership conflict may require human input, but only after the system has attempted classification, isolation and preservation.

---

# 357. Persistent IntegrationControllerService

`integration-controller` SHOULD normally run as a persistent serialized service/job responsibility rather than a user-created Chat session.

It SHALL react to:

```text
session.ready_for_integration
remote READY marker discovered
integration retry time reached
origin/main advanced
dependency prerequisite integrated
resource capacity available
```

Behavior:

```text
discover ready candidates
→ classify/order
→ acquire integration lease
→ integrate one candidate
→ verify
→ promote through authorized Git path
→ reconcile latest main
→ continue next candidate
```

No user command is required between ready session and integration attempt.

---

# 358. Integration queue ordering

Candidate ordering SHOULD consider:

```text
explicit dependency edges
shared-file overlap
spec/task dependency
base SHA age
critical path
blocked downstream consumers
risk
verification class
```

The controller MUST re-evaluate after every promotion because integration of one branch may make another:

```text
ALREADY_IN_MAIN
PATCH_EQUIVALENT
CONFLICTING
NEEDS_REBASE_OR_ADAPTATION
READY
```

---

# 359. Integration conflict recovery

A merge/conflict does not automatically become a user blocker.

Preferred behavior:

```text
conflict
→ semantic conflict analysis
→ create isolated repair/integration candidate
→ preserve both intents
→ run affected verification
→ re-evaluate requirement coverage
→ promote if valid
```

If multiple repair approaches are plausible, R3.6 subagents MAY explore them in parallel and select the best verified candidate.

Human input is reserved for a true product-intent conflict that cannot be resolved from specification/decisions/evidence.

---

# 360. Automatic canonical-checkout-sync trigger

When integration produces a validated main SHA:

```text
main.validated(sha)
→ freeze target SHA
→ invoke canonical-checkout-sync handler
```

The controller SHOULD use the current canonical-checkout-sync semantics, including:

- dirty-state preservation;
- rescue branch creation/push/verification;
- local-only commit rescue;
- divergence recovery;
- safe local main realignment;
- exact build-source certification.

A dirty/diverged canonical checkout is therefore normally a recovery task, not a reason to ask the user what to do.

---

# 361. Frozen validated SHA semantics

The lifecycle controller SHALL distinguish:

```text
LATEST_ORIGIN_MAIN
VALIDATED_BUILD_TARGET
CURRENT_CANONICAL_HEAD
```

A build MAY use a frozen validated target even if `origin/main` advances afterward, provided repository/deployment policy permits and the target remains in valid main history.

This prevents perpetual chasing of a moving main during build/deploy.

---

# 362. Build/deploy continuation

After `BUILD_SOURCE_CERTIFIED`, SmartAIHub SHOULD continue the approved lifecycle automatically:

```text
resource admission
→ build
→ package
→ deploy/restart
→ runtime smoke verification
→ completion reconciliation
```

Build/deploy remain separate actions/authorities from Git integration, but the lifecycle controller MAY dispatch them automatically when the `CompletionAuthorityContract` permits.

---

# 363. Resource-aware lifecycle admission

The controller MUST NOT trigger heavy repository-wide verification/build merely because the prior phase completed.

Before heavy work:

```text
inspect host/global resource admission
parallel active session load
RAM/CPU/GPU/container pressure
required verification class
deadline
available cloud/CI alternatives
```

Then:

```text
safe now
→ run

unsafe now
→ checkpoint
→ reserve/schedule later
→ optionally use authorized alternate CI/cloud path
→ auto-resume
```

This preserves the resource-aware principles already encoded in `session-finish`.

---

# 364. GitLifecycleEvent

Lifecycle transitions SHOULD emit typed durable events.

```text
implementation.started
implementation.closure_candidate
session.finish_started
session.ready_for_integration
session.finish_blocked
integration.candidate_discovered
integration.started
integration.promoted
integration.repair_started
main.validated
canonical.sync_started
canonical.prepared
build.admitted
build.started
build.completed
deployment.started
deployment.completed
runtime_smoke.started
runtime_smoke.passed
runtime_smoke.failed
lifecycle.completed
```

Events SHALL carry canonical repository/workspace/goal/task/job correlation identifiers.

---

# 365. Transition idempotency and lifecycle lease

Every lifecycle transition SHALL be idempotent.

The controller SHOULD use:

```text
workspace lifecycle generation
transition id
expected source SHA
target SHA
transition lease
dedupe key
```

to prevent:

- two controllers integrating the same branch;
- duplicate `session-finish`;
- duplicate canonical rescue/sync;
- duplicate build/deploy dispatch;
- stale controller actions after a newer generation.

---

# 366. Lifecycle watchdog

A watchdog SHALL detect missing forward progress such as:

```text
session closure complete but session-finish never dispatched
READY marker exists but no integration candidate queued
integration promoted but main.validated not emitted
main.validated emitted but canonical sync absent
canonical prepared but build never admitted
build completed but deployment not started when authorized
deployment completed but smoke verification absent
transition lease expired
phase unchanged beyond expected threshold
```

Recovery SHALL dispatch/reconcile the missing next action automatically.

The user SHOULD not be the watchdog.

---

# 367. Git lifecycle and cross-session dependencies

R3.5 peer-session coordination integrates with R3.7.

Example:

```text
Session A requires Runner code from Session B
→ partial handoff may unblock A before B finishes

Later B reaches session closure
→ auto session-finish
→ READY marker
→ integration controller promotes B
→ main.validated
→ canonical sync/build/smoke continue
```

The lifecycle controller SHALL not require all development sessions to finish before integrating an independent ready session unless resource/dependency policy requires serialization.

---

# 368. Git lifecycle and subagents

R3.6 subagents MAY assist lifecycle work:

```text
conflict analysis
independent integration repair
scoped verification
test triage
baseline comparison
release verification
```

However, canonical mutation remains fenced and serialized where required.

Subagents advise/prepare candidates; the lifecycle transition owner remains explicit.

---

# 369. Skill Registry role

Skills such as:

```text
session-finish
integration-controller
canonical-checkout-sync
```

SHOULD expose machine-readable lifecycle metadata:

```yaml
lifecycle_action:
  action_id: string
  valid_from_phases: [string]
  success_phase: string
  retryable_failures: [string]
  terminal_failures: [string]
  evidence_outputs: [string]
  resource_class: LIGHT|MEDIUM|HEAVY
  mutation_scope: string
```

This lets the lifecycle controller select/invoke Skills without hard-coding every implementation detail.

Skill content remains reusable procedural know-how.

---

# 370. Manual invocation policy

Manual commands remain supported for:

```text
debugging
recovery
operator override
testing Skill behavior
explicit user control
```

But normal UX SHOULD be:

```text
user: "implement this"
SmartAIHub: owns lifecycle to verified completion
```

not:

```text
user:
implement
session-finish
integration-controller
canonical-checkout-sync
build
deploy
smoke
```

---

# 371. User-facing Development Timeline

Users MAY inspect a simplified lifecycle:

```text
Spec 224
✓ Implementation
✓ Session finalized
↻ Waiting for integration slot
○ Canonical sync
○ Build
○ Deploy
○ Smoke test

Next action:
Integration Controller will run automatically when the serialized integration lease is available.

No action required from you.
```

When a recoverable wait exists, the UI MUST show the next automatic action/wakeup rather than implying user intervention is needed.

---

# 372. Git-host-neutral architecture

GitHub is the primary expected personal-development integration, but lifecycle contracts SHOULD remain compatible with:

```text
GitHub
GitLab
self-hosted Git remotes
other providers exposing equivalent branch/commit/PR/status semantics
```

Provider adapters may differ; lifecycle semantics remain stable.

---

# 373. R3.7 additional acceptance tests

Implementation MUST prove at least:

1. completed implementation scope automatically triggers session finalization;
2. user does not need to type `session-finish`;
3. session-finish is not dispatched while required child work remains active;
4. session finalization survives service restart;
5. READY marker automatically becomes integration candidate;
6. user does not need to type `integration-controller`;
7. integration controller serializes promotions with a lease;
8. two controller replicas do not integrate the same branch twice;
9. candidate ordering honors prerequisites;
10. independent ready branch does not wait for unrelated active sessions;
11. semantic merge conflict triggers automated repair attempt;
12. repair candidate is verified before promotion;
13. true product-intent conflict can escalate after automated analysis;
14. successful integration emits `main.validated`;
15. `main.validated` automatically triggers canonical checkout preparation;
16. user does not need to type `canonical-checkout-sync`;
17. dirty canonical checkout uses rescue/recovery automatically;
18. local-only canonical commit history is preserved before realignment;
19. canonical build source equals validated target;
20. advancing origin/main does not invalidate an already-frozen allowed target;
21. heavy build waits for resource admission instead of exhausting shared host;
22. build auto-resumes when resource capacity becomes available;
23. authorized alternative CI/cloud verification can be selected automatically;
24. build completion triggers deployment when policy authorizes;
25. deployment triggers smoke verification;
26. smoke failure becomes repair/recovery work rather than false DONE;
27. lifecycle watchdog notices READY branch with no integration dispatch;
28. lifecycle watchdog notices validated main with no canonical sync;
29. lifecycle watchdog notices canonical-prepared state with no build;
30. duplicate lifecycle events remain idempotent;
31. controller reconstructs lifecycle after process restart;
32. Chat history loss does not lose repository lifecycle phase;
33. Workboard/Timeline shows current phase and next automatic action;
34. manual Skill invocation remains possible without corrupting lifecycle state;
35. Skill metadata can map successful action to next phase;
36. lifecycle can manage multiple parallel implementation sessions;
37. integration promotion can wake downstream peer dependencies;
38. stale READY evidence is revalidated against current main;
39. branch already patch-equivalent in main is not merged redundantly;
40. branch protection/required-PR policy is honored through authorized promotion path;
41. no force push is used as automatic shortcut;
42. user-owned GitHub repository remains canonical when configured;
43. one accepted development goal can progress from implementation through smoke verification without intermediate manual lifecycle commands;
44. completion notification is emitted only after the configured lifecycle CompletionContract passes.

---

# 374. R3.7 fourteen-pass hardening review

| Pass | Lens | Gap found | R3.7 resolution |
|---:|---|---|---|
| 1 | Skill invocation gap | Skills existed but required user commands | Added GitDevelopmentLifecycleController |
| 2 | State awareness | No durable “where am I in Git lifecycle?” model | Added GitLifecycleState |
| 3 | Session auto-close | Implementation completion did not trigger session-finish | Added automatic closure predicate |
| 4 | Integration activation | READY branches still depended on a controller session being invoked | Added persistent serialized IntegrationControllerService |
| 5 | Promotion handoff | Validated main did not automatically trigger canonical sync | Added event-driven canonical sync |
| 6 | Build continuity | Canonical prep could still become a manual boundary | Added build/deploy continuation under authority |
| 7 | Duplicate transitions | Multiple workers could trigger same lifecycle action | Added transition lease/idempotency |
| 8 | Shared-host safety | Automatic lifecycle could accidentally trigger heavy checks at bad time | Added resource-aware lifecycle admission |
| 9 | Main movement | Moving origin/main could cause churn/incorrect stale assumptions | Added frozen validated target semantics |
| 10 | Canonical dirty state | Dirty checkout could regress into manual blocker behavior | Reuse automatic rescue/recovery semantics |
| 11 | Lifecycle stalls | Missing transition dispatch might remain unnoticed | Added lifecycle watchdog |
| 12 | User visibility | Automation could become opaque | Added Development Timeline/next-action projection |
| 13 | Architecture boundary | Risk of making Skills into another scheduler | Skills remain action handlers; controller owns state/transitions; worker_jobs owns execution truth |
| 14 | Provider coupling | GitHub-first implementation could hard-code provider semantics | Added Git-host-neutral lifecycle contract |

All identified gaps were incorporated into R3.7.

---

# 375. R3.7 Definition of Done extension

R3.7 is not complete until:

- SmartAIHub can determine the current Git development lifecycle phase without asking the user;
- normal phase transitions automatically invoke the appropriate existing lifecycle Skill/action handler;
- `session-finish`, `integration-controller`, and `canonical-checkout-sync` are no longer required user commands in ordinary autonomous development;
- repository state, READY markers, jobs and evidence can reconstruct lifecycle state after restart;
- integration remains serialized and safe under parallel development;
- resource-heavy gates/builds are admitted safely and auto-resume later when needed;
- dirty/diverged canonical checkout recovery is automated without discarding work;
- validated main automatically flows into canonical preparation and onward authorized build/deploy/smoke;
- lifecycle watchdog repairs missing transitions;
- users can inspect progress/next action but do not need to operate the Git lifecycle manually;
- one instruction such as **“implement this and finish it”** can carry the work through the entire Git lifecycle to verified completion.

---

# 376. R3.8 Research Strategy Intelligence

SmartAIHub SHALL treat research as a reasoning capability that can be initiated from sparse natural-language goals, not merely as a tool the user must explicitly request.

Examples:

```text
"/goal ทำระบบคล้ายโปรเจกต์สมองแมลงวัน แต่ต้องเร็วและใช้งานได้จริง"

"/goal อยากได้การทำงานแบบ Grokbot แต่ต้นทุนถูกกว่า
หน้าตาแบบ Cue ก็ดี สวย สะอาด เข้าใจง่าย"
```

The Assistant SHOULD infer that successful completion may require:

```text
identify what the referenced thing actually is
discover comparable references
verify current facts
decompose strengths/weaknesses
compare alternative patterns
map them to user/project constraints
prepare concrete options/mockups
recommend what to reuse, reimplement, adapt or ignore
then flow the selected direction into specification/planning/execution
```

Normative principle:

> **When the goal depends on external examples, current market reality, unfamiliar technology, comparative judgment or design inspiration, research is part of doing the work—not an optional report requested separately by the user.**

---

# 377. Research intent expansion

The Assistant SHALL distinguish:

```text
LiteralRequest
ResearchObjective
UnderlyingGoal
DecisionMaturity
```

Example:

```yaml
LiteralRequest:
  "make something like Grokbot"

ResearchObjective:
  "understand what user actually values in Grokbot/Cue and find better/cheaper alternatives"

PossibleUnderlyingGoal:
  "build a practical always-on bot product users prefer over current competitors"

DecisionMaturity:
  EXPLORE
```

The system MUST NOT assume that named reference products are mandatory dependencies.

---

# 378. ResearchTriggerPolicy

Research SHOULD be triggered automatically when one or more of the following materially applies:

```text
CURRENTNESS_REQUIRED
  price, availability, product release, trend, regulation, current capability

REFERENCE_DRIVEN_GOAL
  "make it like X", "similar to Y", "use the idea from Z"

UNKNOWN_OR_AMBIGUOUS_ENTITY
  nickname, typo, unfamiliar project/product/term

COMPETITIVE_DECISION
  compare competitors, positioning, feature gap, cost advantage

DESIGN_DISCOVERY
  UI/UX/look-and-feel inspiration is central

MARKET_OR_USER_BEHAVIOR
  recommendation depends on what people currently use/prefer

TECHNICAL_FEASIBILITY_UNKNOWN
  user asks for a solution whose architecture/options are uncertain

HIGH_IMPACT_DECISION
  expensive recurring build, strategic product direction, hard-to-reverse architecture

KNOWN_PATTERN_FROM_USER
  prior behavior strongly indicates the user expects verify→compare→project-impact analysis
```

Research MAY remain lightweight when the answer is stable/common and additional evidence would not materially improve the outcome.

---

# 379. Entity and alias resolution before deep research

Before deep research on a vague reference, SmartAIHub SHOULD identify likely candidate entities.

Example:

```text
"โปรเจกต์สมองแมลงวัน"
```

could refer to:

- a known project nickname;
- an article headline;
- a GitHub repository;
- a research project;
- an incorrectly remembered product name.

The system SHOULD:

```text
search likely variants/aliases
inspect contextual clues
rank plausible matches
continue with high-confidence match
or present a compact disambiguation if multiple materially different matches remain
```

It MUST NOT silently anchor an entire project on the first superficially matching search result.

---

# 380. ReferencePortfolio

Reference-driven goals SHOULD normally discover a **portfolio** of materially distinct references rather than one reference.

```yaml
ReferencePortfolio:
  goal_ref: ref
  references:
    - reference_ref
      role: PRIMARY_REFERENCE|ALTERNATIVE|COUNTEREXAMPLE|DESIGN_REFERENCE|TECHNICAL_REFERENCE
      relevance_summary: string
      evidence_refs: [ref]
  coverage_dimensions: [string]
```

Typical portfolio dimensions:

```text
best functional reference
best UX reference
best low-cost architecture
best open-source technical reference
best commercial competitor
best counterexample / known limitation
```

The number of references SHOULD be driven by decision coverage and marginal value, not an arbitrary count.

---

# 381. ReferenceDecomposition

Each important reference SHOULD be decomposed into reusable dimensions.

```yaml
ReferenceDecomposition:
  reference_ref: ref
  product_or_project_identity: string

  strengths:
    capability: [string]
    ux: [string]
    performance: [string]
    architecture: [string]
    distribution: [string]
    business_model: [string]

  constraints:
    cost: [string]
    complexity: [string]
    lock_in: [string]
    maturity: [string]
    missing_capabilities: [string]
    operational_risks: [string]

  adoption_surface:
    ideas_to_borrow: [string]
    components_maybe_reusable: [string]
    components_not_recommended: [string]
    evidence_refs: [ref]
```

The decomposition MUST distinguish observed facts from interpretation.

---

# 382. ConceptExtraction and PatternHarvesting

Research SHOULD extract useful **patterns** separately from implementation artifacts.

Examples:

```text
persistent background agent pattern
multi-bot group conversation pattern
progressive disclosure UI
task/activity timeline
side panel with status
3D/animated visual shell
low-context subagent delegation
provider failover
approval minimization
```

Pattern harvesting allows SmartAIHub to say:

> “This project has a useful interaction model, but installing the whole project would add unnecessary architecture. We should reimplement the pattern using existing SmartAIHub capabilities.”

This is a first-class successful research result.

---

# 383. AdoptStrategy

For each external reference/component, SmartAIHub SHOULD select an adoption strategy:

```text
INSPIRE_ONLY
  use only product/UX/architectural idea

REIMPLEMENT_PATTERN
  rebuild the behavior using existing SmartAIHub architecture

ADAPTER
  integrate through API/MCP/plugin/provider boundary

DEPENDENCY
  add the package/library as a managed dependency

FORK
  fork external code because modification/control is justified

INSTALL
  deploy/use the external project substantially as-is

IGNORE
  do not adopt
```

Default preference for a mature platform SHOULD be:

```text
reuse existing SmartAIHub capability
→ reimplement useful pattern
→ adapter
→ dependency
→ fork/install
```

unless evidence shows another route is materially better.

The system MUST NOT recommend installation merely because an open-source project is interesting.

---

# 384. UserProjectFitEvaluator

A recommendation SHALL be evaluated against the current user/project rather than generic internet popularity.

Relevant fit dimensions MAY include:

```text
current SmartAIHub architecture
existing capabilities
current Specs/roadmap
maintenance complexity
user's device environment
mobile/tablet needs
local/cloud constraints
budget sensitivity
latency targets
privacy/data locality
existing subscriptions
white-label/multi-tenant goals
marketplace/productization needs
prior accepted/rejected approaches
current stage of the project
```

The fit evaluator consumes authorized context from Spec 268 and project state; it does not create a second memory store.

---

# 385. Personalization without overfitting

Research recommendations SHOULD use relevant learned preferences/patterns when confidence is adequate.

Examples:

```text
user repeatedly prefers reuse over adding subsystem
→ rank reimplementation/adapter above full install when otherwise comparable

user prioritizes mobile/tablet
→ penalize desktop-only reference UX

user values low operating cost
→ surface recurring provider/runtime cost early

user has explicitly decided an architecture
→ do not reopen it without material contradictory evidence
```

However:

- a past preference is not a permanent rule;
- current explicit request outranks learned pattern;
- sensitive personal inference is not required for technical personalization;
- project/team shared contexts MUST NOT inherit unrelated personal preferences silently.

---

# 386. ResearchDepthProfile

Research depth SHOULD be chosen by decision need.

Suggested profiles:

```text
FACT_CHECK
  verify a narrow current fact

REFERENCE_SCAN
  identify likely references and key traits

COMPARATIVE_RESEARCH
  compare multiple candidates against explicit dimensions

DESIGN_DISCOVERY
  research visual/product interaction patterns and produce concrete alternatives

DEEP_DECISION
  evidence-rich multi-source research for strategic/expensive decisions

CONTINUOUS_MONITOR
  keep a research frontier alive and refresh on new signals
```

These are behavior profiles, not fixed source counts.

The planner SHOULD escalate depth when:

- contradictions remain;
- important unknowns can flip the decision;
- initial references are low quality;
- currentness matters;
- architecture/cost consequences are material.

---

# 387. Research adequacy and stopping

Research MUST NOT equate:

```text
more searches
=
better research
```

The Assistant SHOULD evaluate adequacy on:

```text
decision-critical fact coverage
alternative diversity
source independence
source quality
freshness
contradiction resolution
entity/variant certainty
fit to the user's actual context
known blind spots
ability to change the recommendation with remaining unknowns
```

Before a material recommendation, perform a bounded blind-spot challenge:

> What missing reference, assumption, stakeholder, failure mode, current fact, or alternative mechanism could materially change this recommendation?

Research may stop when remaining uncertainty is unlikely to change the decision enough to justify more time/cost.

---

# 388. Research result UX

The default user output SHOULD prioritize decision usefulness over raw research volume.

Preferred structure:

```text
What I found
────────────
Project A
  strengths...
  weaknesses...

Project B
  strengths...
  weaknesses...

Project C
  useful counterexample...

What fits your goal
──────────────────
- take A's execution model
- take B's UI pattern
- avoid C's costly dependency model

My recommendation
─────────────────
Build on existing SmartAIHub architecture.
Do not install A/B directly.
Reimplement patterns X/Y and adapt provider Z only where needed.

Options
───────
A. clean/simple
B. richer/premium
C. familiar competitor-like layout

[View mockups]
[Compare details]
[Use recommendation]
[Research more]
```

Detailed evidence and sources SHOULD remain inspectable without overwhelming the default view.

---

# 389. Research-to-Design bridge

When visual/product interaction is material, SmartAIHub SHOULD turn research into concrete design artifacts through Spec 270.

Example:

```text
Reference findings
→ extract layout/interaction patterns
→ build 2–4 distinct design directions
→ generate mockups
→ explain strengths/tradeoffs
→ learn user's preference from concrete examples
```

Possible directions:

```text
Simple / clean / familiar
Premium / cinematic / animated
Competitor-familiar with SmartAIHub simplification
Mobile-first compact
```

The generated design MUST NOT be a pixel-for-pixel unauthorized copy of a protected product UI.

---

# 390. Competitor familiarity vs differentiation

The Assistant MAY deliberately use familiar interaction conventions when that reduces learning cost.

It SHOULD distinguish:

```text
familiar mental model
from
literal visual copying
```

Example:

> “Use Grokbot-like conversation/task visibility so users understand it immediately, but keep SmartAIHub's own navigation, visual identity and specialized workspaces.”

The system SHOULD also challenge competitor imitation when a different interaction better satisfies the user's real goal.

---

# 391. Research-to-Plan bridge

Research is not complete merely because a report exists.

When the user goal is to build/change something, findings SHOULD flow into:

```text
research findings
→ candidate product/architecture decisions
→ selected direction
→ scope/spec changes
→ planning
→ implementation
→ verification
```

A selected research insight SHOULD be traceable to the requirement/decision it influenced.

Example:

```text
Finding:
Competitor's always-on model is useful;
its provider-specific runtime is unnecessary.

Decision:
adopt persistent-task UX pattern,
retain SmartAIHub provider-neutral worker_jobs runtime.

Spec impact:
add progress/continuation UI;
no new Grokbot dependency.
```

---

# 392. Reference code/open-source boundary

When external code is inspected, SmartAIHub SHALL distinguish:

```text
IDEA/PATTERN LEARNING
API/INTERFACE COMPATIBILITY
PERMITTED CODE REUSE
DEPENDENCY USE
FORK
```

Before code reuse/install/fork, evaluate as applicable:

```text
license
attribution
provenance
security
dependency health
maintenance activity
supply-chain risk
compatibility
data/privacy implications
```

If only the idea is needed, prefer clean implementation using SmartAIHub contracts rather than copying unnecessary code.

---

# 393. Research currentness and refresh

Current claims MUST carry observation/freshness context.

Before consequential recommendation/action, refresh volatile facts such as:

```text
product availability
pricing
provider limits
current features
repository activity
security status
trend/market evidence
terms/licensing when decision-relevant
```

An old research packet may seed the next search but MUST NOT be represented as current without refresh when volatility matters.

---

# 394. Research failure continuation

Research path failure uses R3.5/R3.6 semantics.

```text
search/provider route fails
→ classify transient/permanent
→ retry-after continuation if useful
→ alternate provider/source/query
→ parallel unaffected branches continue
→ checkpoint/reawaken
→ synthesize available evidence
```

The default result of one unavailable research provider is NOT “research blocked.”

---

# 395. Research subagent portfolio

For substantial research, R3.6 subagents MAY split along meaningful roles:

```text
entity resolution
primary-source finder
open-source/code inspector
UX/reference analyst
cost/operations analyst
competitor analyst
skeptical/counterexample researcher
user-fit evaluator
```

Fanout SHOULD maximize independent information value, not repeat identical searches.

The parent Research/Chief-of-Staff Assistant owns synthesis and final recommendation.

---

# 396. Research and Spec 244 / Spec 266 boundary

R3.8 does not create a second evidence/research store.

Architecture boundary:

```text
Spec 269
  owns:
    when research is needed
    research intent expansion
    depth/profile selection
    user/project fit
    recommendation framing
    research-to-design/plan handoff

Continuous Research & Adaptive Solution Orchestration
(working Spec 244 where registered/available)
  owns:
    continuous research task/alternative-branch contracts
    research frontier / scoped re-research execution semantics

Spec 266
  owns:
    evidence/provenance/knowledge authority

Spec 268
  owns:
    memory/user/project context authority

Spec 270
  owns:
    design-intelligence/mockup authority

Spec 224
  owns:
    development implementation runtime
```

If the working Spec 244 identifier changes during canonical registration, R3.8 SHALL bind to the registered Continuous Research capability by contract rather than hard-coded numeric ID.

---

# 397. `/goal` research-first behavior

A `/goal` entry SHOULD be interpreted as an outcome request, not a literal sequence of implementation commands.

Example:

```text
/goal อยากได้ฟังก์ชั่นแบบ Grokbot แต่ถูกกว่า เร็ว ใช้จริงได้
หน้าตาแบบ Cue ก็ดี
```

Preferred behavior:

```text
1. understand goal and existing SmartAIHub context
2. research current Grokbot-like products and relevant UI references
3. identify 2–5 materially distinct references
4. decompose capabilities/UX/cost/limitations
5. determine what SmartAIHub already has
6. recommend patterns to borrow and things not to install
7. produce concrete design directions/mockups if visual choice matters
8. show concise recommendation to user
9. once direction is sufficiently resolved, harden spec/plan
10. implement through normal autonomous lifecycle
```

The system SHOULD NOT jump directly from the named competitor to cloning or installing it.

---

# 398. Research-first exception

Research SHOULD NOT become ceremony.

The Assistant MAY skip/limit external research when:

- the user explicitly mandates an already-decided implementation and current facts are not needed;
- the task is deterministic and well-specified;
- the reference has already been researched recently and evidence remains fresh;
- research cost/latency exceeds expected decision value;
- the user explicitly asks for immediate execution using a fixed known design.

Even then, required safety/compatibility facts remain subject to applicable checks.

---

# 399. R3.8 additional acceptance tests

Implementation MUST prove at least:

1. vague named project triggers entity/alias resolution before deep research;
2. ambiguous entity does not silently lock to first search result;
3. reference-driven goal can discover multiple materially distinct candidates;
4. portfolio includes a counterexample when useful;
5. each major reference has strengths and limitations separated;
6. observed facts remain distinguishable from interpretation;
7. system can recommend INSPIRE_ONLY rather than installing interesting open source;
8. system can recommend REIMPLEMENT_PATTERN using existing SmartAIHub architecture;
9. dependency/fork/install path requires compatibility/license/security evaluation;
10. recommendation explicitly maps to user's current project constraints;
11. prior preference can influence ranking without overriding current explicit request;
12. mobile/tablet constraint can reject desktop-centric reference pattern;
13. cost sensitivity can affect architecture recommendation;
14. research depth escalates when decision-critical contradiction remains;
15. arbitrary fixed source count is not required for adequacy;
16. blind-spot challenge can reopen research when a material gap is found;
17. old volatile evidence refreshes before consequential recommendation;
18. one failed search/provider route does not stop overall research;
19. rate-limited route schedules retry and alternate route continues;
20. research subagents receive different meaningful scopes;
21. duplicate evidence does not count as independent confirmation;
22. result UX can summarize A/B/C references without exposing all raw research;
23. user can inspect detailed evidence on demand;
24. visual-reference goal can create multiple mockup directions through Spec 270;
25. mockup preference can become new typed intent evidence;
26. design inspiration does not require pixel-identical copying;
27. competitor familiarity can be retained while SmartAIHub differentiation remains explicit;
28. selected research finding changes scope/spec/plan traceably;
29. research report alone does not complete a build goal;
30. selected direction automatically flows into planning when authority permits;
31. `/goal` competitor-like request does not immediately clone/install competitor;
32. current SmartAIHub capability inventory is checked before adding a subsystem;
33. recommendation can say “we already have this; borrow only concept X”;
34. recommendation can say “external adapter is better than rebuilding” when evidence supports it;
35. recommendation can reject a popular project because maintenance/lock-in does not fit;
36. project reference research records exact version/date where relevant;
37. open-source code reuse records license/provenance policy outcome;
38. clean-room pattern reimplementation does not claim copied source;
39. research adequacy considers user-fit, not generic popularity;
40. deep research is avoided for low-value deterministic tasks;
41. fixed/mandated user decision is not repeatedly reopened by research;
42. research can resume from durable checkpoint after provider outage;
43. final recommendation explains what to take from each reference;
44. final recommendation explains what not to take and why;
45. alternative designs can be presented as meaningful tradeoffs;
46. user can choose “research more” without losing current candidate decisions;
47. research outputs remain evidence-linked through implementation;
48. R3.8 introduces no second evidence, memory, design or job authority.

---

# 400. R3.8 sixteen-pass hardening review

| Pass | Lens | Gap found | R3.8 resolution |
|---:|---|---|---|
| 1 | Sparse-goal interpretation | Research existed but user had to ask too explicitly | Added ResearchStrategyIntelligence / trigger policy |
| 2 | Ambiguous names | First-result anchoring could misidentify reference | Added Entity/Alias Resolution |
| 3 | Single-reference bias | One project could dominate design | Added ReferencePortfolio |
| 4 | Shallow comparison | References lacked structured capability/UX/cost/constraint decomposition | Added ReferenceDecomposition |
| 5 | Install bias | Interesting open source could be mistaken for adoption recommendation | Added AdoptStrategy |
| 6 | Mature-platform fit | External project analysis could ignore existing SmartAIHub capability | Added UserProjectFitEvaluator |
| 7 | Personal relevance | Generic internet “best” answer could ignore user/project priorities | Added scoped personalization |
| 8 | Research depth | No first-class decision for how deeply to investigate | Added ResearchDepthProfile |
| 9 | Endless research | “More pages” could replace decision adequacy | Added coverage/blind-spot stopping policy |
| 10 | UI inspiration | Research could stop before producing concrete visual alternatives | Added Research-to-Design bridge |
| 11 | Competitor copying | Familiarity could drift into clone behavior | Added familiarity-vs-copy distinction |
| 12 | Report dead end | Research output could fail to affect planning | Added Research-to-Plan traceability |
| 13 | Rights/provenance | Concept borrowing vs source reuse needed explicit boundary | Added open-source/reference boundary |
| 14 | Stale facts | Old product/current-market knowledge could drive new build | Added currentness refresh |
| 15 | Research provider failure | Deep research could still depend on one route | Bound to R3.5/R3.6 fallback/continuation |
| 16 | Authority overlap | Risk of duplicating Continuous Research / Spec 266 | Defined R3.8 strategy layer and consume-only execution/evidence boundaries |

All identified gaps were incorporated into R3.8.

---

# 401. R3.8 Definition of Done extension

R3.8 is not complete until SmartAIHub can:

- infer when research is required from a short `/goal`;
- resolve ambiguous external references before committing to them;
- discover and compare materially distinct reference projects/products;
- extract useful product/UX/architecture patterns independently from code adoption;
- decide whether to inspire, reimplement, adapt, depend, fork, install or ignore;
- evaluate findings against the actual user's/project's architecture, cost and interaction needs;
- produce concise research-driven options and recommendations;
- generate concrete mockup directions when visual choice is material;
- refresh current facts before consequential decisions;
- continue research across provider/rate-limit failures;
- flow selected findings into hardened scope/spec/plan/implementation rather than ending at a research report;
- avoid unnecessary new subsystems when SmartAIHub already has the required foundation;
- return a result that feels like **“I researched what you probably meant, found the best ideas, filtered them for your situation, and brought back practical options”** rather than **“I searched the named thing and summarized it.”**

---

# 402. R3.9 ResearchBrief and QuestionGraph

Substantial research SHALL begin from a structured decision-oriented brief rather than a single broad prompt copied to every research subagent.

```yaml
ResearchBrief:
  goal_ref: ref
  research_objective: string
  decision_to_support: string
  user_project_fit_context_ref: ref
  hard_constraints: [ref]
  current_assumptions: [ref]
  known_evidence_refs: [ref]
  excluded_scope: [string]
  budget_envelope_ref: ref|null
  freshness_policy_ref: ref|null
  expected_outputs: [string]
```

The planner SHOULD decompose this into a `ResearchQuestionGraph`.

```text
What is the referenced product/project?
        ↓
What does it actually do today?
        ↓
What are the strongest alternatives?
        ↓
Which capabilities are proven vs marketing claims?
        ↓
What UX patterns are valuable?
        ↓
What does SmartAIHub already provide?
        ↓
What should be borrowed / adapted / rejected?
        ↓
What remains uncertain enough to prototype/test?
```

Research subagents SHOULD receive distinct bounded questions, not duplicated generic prompts.

---

# 403. ResearchReusePolicy

SmartAIHub SHOULD reuse prior valid research when the same or substantially overlapping question reappears.

Before launching new deep research, evaluate:

```text
existing research packet / evidence
entity/version match
scope match
user/project context match
freshness
source revocation/invalidation
decision compatibility
```

Possible outcomes:

```text
REUSE_AS_IS
REUSE_AND_REFRESH_VOLATILE
REUSE_STRUCTURE_RESEARCH_NEW_FACTS
PARTIAL_REUSE
RESEARCH_FRESH
```

This reduces latency/cost and avoids repeatedly rediscovering stable facts.

Reuse MUST NOT present stale volatile claims as current.

---

# 404. ReferenceVersionSnapshot

Research SHALL pin materially relevant reference versions.

```yaml
ReferenceVersionSnapshot:
  reference_ref: ref
  observed_at: timestamp
  product_version: string|null
  repository_commit_or_tag: string|null
  app_release: string|null
  pricing_or_plan_version: string|null
  documentation_revision_ref: ref|null
  source_refs: [ref]
```

The system MUST NOT silently combine:

```text
old UI
new pricing
different repository version
future roadmap claim
```

as though they describe one coherent current product state.

---

# 405. MultiModalReferenceInspection

Text search alone is insufficient for many product/reference decisions.

When relevant, SmartAIHub SHOULD inspect authorized available evidence such as:

```text
official webpages
screenshots
product UI
demo videos
release videos
documentation
API references
GitHub/GitLab repository
README/changelog/releases/issues
architecture diagrams
public presentations
benchmark results
user-provided images/videos
live product behavior through authorized access
```

Examples:

- UI/UX recommendation SHOULD inspect actual visual surfaces when available;
- repository architecture recommendation SHOULD inspect source/docs rather than infer only from marketing pages;
- interaction claims SHOULD prefer demonstrated/live behavior where feasible;
- performance claims SHOULD use measured/credible evidence rather than screenshots alone.

---

# 406. ClaimTruthClassification

Material claims SHALL distinguish source/evidence strength.

Suggested classifications:

```text
VENDOR_CLAIM
REPOSITORY_CLAIM
DOCUMENTED_BEHAVIOR
DEMONSTRATED_BEHAVIOR
INDEPENDENT_OBSERVATION
MEASURED_RESULT
USER_PROVIDED_FACT
MODEL_INFERENCE
UNKNOWN
```

Example:

```text
"supports background agents"
```

may be:

```text
VENDOR_CLAIM
```

until confirmed by documentation/demo/observed behavior.

Recommendations SHOULD not silently elevate marketing language into verified capability.

---

# 407. DecisionImpactMatrix

Reference comparison SHOULD use explicit common dimensions where possible.

```yaml
DecisionImpactMatrix:
  decision_ref: ref
  dimensions:
    - capability_fit
    - user_experience_fit
    - implementation_effort
    - operating_cost
    - latency
    - maintenance_burden
    - vendor_lock_in
    - privacy_data_fit
    - mobile_tablet_fit
    - white_label_fit
    - marketplace_productization_fit
    - evidence_strength
  candidate_refs: [ref]
```

The matrix is not required to collapse all dimensions into one synthetic score.

It SHOULD prevent selective comparison such as praising candidate A only for UX and candidate B only for cost without exposing the tradeoff.

---

# 408. RecommendationRobustnessCheck

Before a material recommendation, the Assistant SHOULD answer internally:

```text
What evidence most strongly supports this recommendation?
What evidence most strongly contradicts it?
Which assumption is most fragile?
What new fact would change the recommendation?
Is the recommendation still good if cost/latency/adoption assumptions move?
Is there a simpler option with nearly equal outcome?
```

The output SHOULD preserve meaningful uncertainty and may recommend a small experiment rather than false certainty.

---

# 409. ProgressiveResearchEnvelope

Research SHALL be bounded by an explicit or derived envelope.

```yaml
ProgressiveResearchEnvelope:
  max_time_class: string|null
  max_cost_ref: ref|null
  max_parallelism: integer|null
  preferred_source_classes: [string]
  deep_research_allowed: boolean
  paid_provider_policy_ref: ref|null
  escalation_policy:
    start_profile: FACT_CHECK|REFERENCE_SCAN|COMPARATIVE_RESEARCH
    deepen_when: [condition]
    stop_when: [condition]
```

Preferred behavior:

```text
cheap reference scan
→ enough for decision?
  YES → stop
  NO
→ targeted comparison
→ enough?
  YES → stop
  NO
→ deep research on decision-flipping unknowns
```

Do not begin with maximum-cost research by default.

---

# 410. DecisionAuthorityBridge for research outcomes

Research often produces multiple viable choices.

The Assistant SHALL apply the existing authority model rather than automatically asking the user to choose.

Possible policies:

```text
RECOMMEND_ONLY
USER_CHOOSES
AUTO_SELECT_BEST_WITHIN_ENVELOPE
AUTO_SELECT_REVERSIBLE_ONLY
AUTO_RUN_EXPERIMENT_THEN_SELECT
```

If `CompletionAuthorityContract` permits autonomous choice and the choice is non-material/reversible:

```text
research
→ compare
→ select best supported option
→ record ResearchDecisionReceipt
→ continue to design/spec/plan
```

If the decision is subjective/material and reserved to the user, present concise concrete choices.

This prevents research from becoming a new user-interruption boundary.

---

# 411. PrivacySafeResearchQuery

External research providers SHOULD receive only the minimum context necessary to answer the research question.

```text
internal project context
→ sanitize/minimize
→ research query context
```

The query builder SHOULD remove or abstract:

- private customer names;
- proprietary source code;
- unreleased product secrets;
- credentials;
- unrelated personal memory;
- tenant-confidential details;

unless explicitly necessary and authorized.

Personalization can occur after evidence returns inside SmartAIHub.

---

# 412. UntrustedSourceInstructionFence

External research content SHALL be treated as untrusted content/evidence.

Text found in:

```text
web pages
README files
issues/comments
documents
repository source
search snippets
forum posts
```

MUST NOT directly modify:

- system policy;
- tool permissions;
- research scope;
- credentials;
- execution authority;
- deployment behavior;

merely because the content contains instructions to the agent.

Source content may suggest hypotheses/actions, but those must pass normal planning/authority/policy resolution.

---

# 413. Locale, language and jurisdiction expansion

Research SHOULD consider the user's/project's relevant locale when applicability can differ.

Possible dimensions:

```text
country/jurisdiction
language
regional product availability
regional pricing
payment/provider availability
local regulation
local cultural/UX conventions
local market competitors
local infrastructure constraints
```

The planner MAY search both local-language and global sources.

Generic US/global evidence MUST NOT be represented as locally applicable when localization materially matters.

---

# 414. Research-to-Experiment bridge

Some uncertainties cannot be resolved reliably by reading more sources.

When expected value justifies it, SmartAIHub SHOULD propose or autonomously execute a bounded experiment under authority.

Examples:

```text
quick integration spike
benchmark
mock API adapter
small UI prototype
sandbox deployment
latency measurement
cost sample
A/B mockup
limited user-flow simulation
```

Flow:

```text
research uncertainty
→ cheap experiment available?
→ build/run in sandbox
→ collect evidence
→ update comparison/recommendation
```

The experiment result becomes evidence; it does not automatically become production architecture.

---

# 415. ResearchExecutionOverlapPolicy

Research and implementation preparation MAY overlap when safe.

Example:

```text
Research A/B/C references
        │
        ├─ while running:
        │   create isolated mockup/prototype
        │
        └─ do not commit irreversible architecture choice yet
```

Allowed overlap SHOULD be limited to reversible work such as:

- mockups;
- sandbox prototypes;
- benchmark harnesses;
- isolated adapters;
- proof-of-concept branches.

Irreversible/expensive commitment waits for sufficient evidence or pre-authorized policy.

This preserves speed without sacrificing research quality.

---

# 416. ResearchDecisionReceipt

A material research-driven choice SHOULD create a structured receipt.

```yaml
ResearchDecisionReceipt:
  goal_ref: ref
  decision_ref: ref
  selected_strategy: string
  selected_reference_refs: [ref]
  rejected_reference_refs: [ref]
  key_user_fit_factors: [string]
  key_evidence_refs: [ref]
  key_uncertainties: [string]
  recommendation_robustness_ref: ref
  authority_basis_ref: ref
  downstream_requirement_refs: [ref]
  decided_at: timestamp
```

This gives downstream planning a stable rationale without storing hidden chain-of-thought.

---

# 417. ResearchPreferenceLearning

When the user selects/rejects reference styles, mockups, architecture options or recommendation dimensions, SmartAIHub MAY emit scoped preference evidence to Spec 268.

Examples:

```text
prefers clean compact UI over cinematic 3D for operational tools
accepts premium visual treatment for public-facing marketing surfaces
prefers native reimplementation over new platform dependency when outcome is equivalent
```

These remain scoped, correctable patterns—not permanent personality facts.

Future research MAY use them to rank candidates more intelligently.

---

# 418. ResearchInvalidationCascade

If a material source/version/fact changes, the system SHOULD identify downstream decisions that depended on it.

```text
source/version invalidated
→ evidence impacted
→ reference decomposition impacted
→ recommendation impacted?
→ ResearchDecisionReceipt impacted?
→ requirement/spec/plan impacted?
```

Possible actions:

```text
NO_MATERIAL_IMPACT
REFRESH_RESEARCH
REOPEN_DECISION
REVERIFY_IMPLEMENTATION
```

The system MUST NOT silently preserve a recommendation whose decisive evidence is known invalid.

---

# 419. Research status UX

The user MAY inspect research state without needing to manage it.

Example:

```text
Researching agent-platform references

Coverage:
✓ Product capabilities
✓ UX patterns
✓ Open-source alternatives
↻ Operating cost
↻ Thai availability
! 1 contradiction under review

6 research workers
✓ 3 complete
↻ 2 active
⏳ 1 rate-limited; retry scheduled

Next:
Compare fit against SmartAIHub architecture automatically.

No action required.
```

The default view SHOULD emphasize progress, evidence coverage and next automatic action—not raw searches or hidden reasoning.

---

# 420. R3.9 additional acceptance tests

Implementation MUST prove at least:

1. research begins from a structured ResearchBrief for non-trivial goals;
2. subagents receive distinct ResearchQuestionGraph nodes instead of duplicate broad prompts;
3. recent matching research can be reused without full rerun;
4. volatile claims are refreshed while stable analysis is reused;
5. mismatched product/repository versions are not silently combined;
6. UI-driven recommendation can inspect screenshots/demo evidence where available;
7. code architecture recommendation can inspect repository/docs where authorized;
8. vendor marketing claim remains labeled as such until independently supported;
9. demonstrated/measured behavior can outrank unsupported marketing;
10. candidates are compared on a common DecisionImpactMatrix;
11. comparison does not hide tradeoffs by using different favorable dimensions for each candidate;
12. robustness check identifies at least one fact that could change a material recommendation;
13. research starts shallow and deepens only when needed;
14. research respects time/cost envelope;
15. deep research can be avoided when scan-level evidence is sufficient;
16. pre-authorized reversible recommendation can auto-select and continue without asking user;
17. subjective/material choice reserved to user still presents concrete options;
18. external research query omits unrelated sensitive project context;
19. credentials/secrets are never inserted into research queries;
20. prompt injection text in source cannot expand tool authority;
21. repository README instructions cannot alter orchestration policy;
22. locale-relevant goal searches appropriate local-language/regional sources;
23. global availability is not assumed to imply local availability;
24. unresolved feasibility can trigger a bounded sandbox experiment;
25. prototype result can update research recommendation;
26. prototype cannot silently become production architecture;
27. research and reversible mockup work can run in parallel;
28. irreversible decision waits for adequate evidence/authority;
29. selected recommendation creates ResearchDecisionReceipt;
30. downstream requirements link back to research decision evidence;
31. user rejection of a visual direction can become scoped preference evidence;
32. future research can use scoped preference evidence without treating it as universal truth;
33. source/version invalidation can reopen dependent research decision;
34. invalidated research can trigger targeted plan/spec reverification;
35. research status UI shows coverage and next automatic action;
36. user does not need to supervise individual search queries/subagents;
37. duplicate historical evidence does not inflate source independence;
38. reused research preserves source provenance and freshness metadata;
39. same reference at different versions can yield different decomposition;
40. multiple languages can be searched without confusing duplicated translations as independent evidence;
41. research result can recommend a simpler internal solution over all external references;
42. recommendation can change after sandbox benchmark evidence contradicts web claims;
43. recommendation robustness can retain two Pareto options when no single winner dominates;
44. autonomous selection records authority basis;
45. user can inspect why a recommendation won without chain-of-thought;
46. research budget exhaustion tries reuse/targeted queries before requesting expansion;
47. research plan remains resumable after provider outage;
48. R3.9 introduces no second evidence/memory/job/design authority.

---

# 421. R3.9 sixteen-pass gap review record

| Pass | Lens | Gap found | R3.9 resolution |
|---:|---|---|---|
| 1 | Research coordination | Parallel researchers could receive duplicate broad prompts | Added ResearchBrief + ResearchQuestionGraph |
| 2 | Reuse/cost | Same topic could be researched from scratch repeatedly | Added ResearchReusePolicy |
| 3 | Version coherence | Evidence could mix old UI/new docs/new repo state | Added ReferenceVersionSnapshot |
| 4 | Multimodal truth | Text-only research could misread UX/product behavior | Added MultiModalReferenceInspection |
| 5 | Marketing-vs-reality | Vendor claims could become assumed capabilities | Added ClaimTruthClassification |
| 6 | Apples-to-apples comparison | Candidate praise could cherry-pick different dimensions | Added DecisionImpactMatrix |
| 7 | Recommendation fragility | Best option could depend on one weak assumption | Added RecommendationRobustnessCheck |
| 8 | Cost/time runaway | Deep research had adequacy logic but no explicit progressive envelope | Added ProgressiveResearchEnvelope |
| 9 | User interruption | Research could end by asking user to choose despite pre-authorized autonomy | Added DecisionAuthorityBridge |
| 10 | Privacy | Personalized research could over-share internal context externally | Added PrivacySafeResearchQuery |
| 11 | Source prompt injection | Web/repo content could be mistaken for agent instructions | Added UntrustedSourceInstructionFence |
| 12 | Locale applicability | Global evidence could be wrongly generalized to Thai/local conditions | Added locale/language/jurisdiction expansion |
| 13 | Evidence cannot answer feasibility | More web search may not validate actual runtime behavior | Added Research-to-Experiment bridge |
| 14 | Speed | Deep research could serialize all prototyping | Added ResearchExecutionOverlapPolicy |
| 15 | Learning continuity | User's concrete reference choices were not fed back into future research | Added ResearchPreferenceLearning |
| 16 | Evidence drift | Changed source/version could leave stale downstream decisions alive | Added ResearchInvalidationCascade |

All identified gaps were incorporated into R3.9.

---

# 422. R3.9 Definition of Done extension

R3.9 is not complete until SmartAIHub can demonstrate:

- structured decision-oriented research decomposition;
- selective reuse of prior research with freshness-aware refresh;
- coherent reference versioning;
- multimodal inspection when product/UI behavior requires it;
- explicit distinction between claims, observations and measurements;
- apples-to-apples candidate comparison;
- recommendation robustness against fragile assumptions;
- bounded progressive research spend/time;
- autonomous recommendation selection where pre-authorized;
- privacy-minimized research queries;
- untrusted external content cannot alter orchestration authority;
- locale/language/jurisdiction applicability where relevant;
- bounded experiments can resolve research uncertainties;
- research and reversible prototype work can overlap safely;
- research decisions remain traceable into requirements/spec/plan;
- user selections improve future research relevance through scoped memory evidence;
- changed evidence can invalidate/reopen downstream recommendations;
- the user can ask a short goal and receive **researched, verified, context-fit, concrete options that continue into real work without having to supervise the research process**.

---

# 423. R3.10 Stage/Handoff Control Artifact Standard

R3.10 standardizes explicit machine-readable control artifacts for long-running work.

For every non-trivial durable goal/workspace, SmartAIHub SHOULD be able to materialize:

```text
stage.json
handoff.json
resume.json
```

Their roles are intentionally different:

```text
stage.json
  = Where are we now?

handoff.json
  = What is being transferred, what is already done,
    what remains, and what should the next actor do?

resume.json
  = If work is waiting/suspended, what checkpoint and
    wake condition will reactivate it?
```

Normative principle:

> **A new session/harness should be able to recover operationally useful state without rereading the entire Chat history.**

---

# 424. Canonical state vs control artifacts

The control artifacts MUST NOT become a second source of truth.

Canonical truth remains with the existing authorities, including as applicable:

```text
worker_jobs / worker_job_events
goal/task state
ClosureLedger
RequirementCoverageGraph
Git refs/worktrees
Spec 224 development state/evidence
Spec 268 memory/context
Spec 266 evidence/provenance
deployment/runtime state
```

`stage.json`, `handoff.json`, and `resume.json` are versioned **projections/manifests** over canonical truth.

Rules:

- manifests MAY be regenerated;
- stale manifests MUST be detected;
- canonical state wins conflicts;
- manifest import MUST reconcile, not blindly overwrite;
- manifests MUST carry generation/version/freshness identifiers.

---

# 425. Recommended control-artifact layout

A logical workspace MAY expose:

```text
.smartaihub/
  control/
    stage.json
    handoff.json
    resume.json
    evidence-index.json        optional
```

However, these files are runtime/control artifacts and SHOULD NOT dirty normal product source history by default.

Acceptable persistence includes:

```text
R2/object storage
workspace control store
durable local control directory
encrypted remote workspace state
exported handoff bundle
```

A local file projection MAY exist inside the workspace for inspectability, but SHOULD be Git-ignored unless a repository explicitly adopts a committed-control-manifest policy.

---

# 426. Stage taxonomy

Top-level `stage` SHOULD use a stable compact taxonomy:

```text
DISCOVER
RESEARCH
DEFINE
SPEC
PLAN
IMPLEMENT
VERIFY
UAT
INTEGRATE
CANONICALIZE
BUILD
DEPLOY
OPERATE
COMPLETE
```

`substage` provides detailed runtime state, for example:

```text
RESEARCH:
  REFERENCE_SCAN
  COMPARATIVE_RESEARCH
  DEEP_DECISION
  WAITING_PROVIDER

SPEC:
  DRAFTING
  HARDENING
  CANDIDATE
  IMPLEMENTATION_READY

PLAN:
  DECOMPOSING
  COVERAGE_RECONCILIATION
  READY_TO_IMPLEMENT

IMPLEMENT:
  CODING
  REPAIRING
  WAITING_ON_PEER
  WAITING_FOR_EXECUTOR
  SESSION_FINALIZING

VERIFY:
  TARGETED_TEST
  REGRESSION
  SECURITY
  FINAL_VERIFY

INTEGRATE:
  READY_FOR_INTEGRATION
  INTEGRATION_QUEUED
  INTEGRATING
  MAIN_VALIDATED

BUILD:
  RESOURCE_WAIT
  BUILD_SOURCE_CERTIFIED
  BUILDING

DEPLOY:
  PREVIEW
  CANARY
  PRODUCTION
  SMOKE_VERIFYING
```

Detailed substages MAY evolve without breaking the top-level taxonomy.

---

# 427. stage.json schema

Minimum recommended form:

```json
{
  "schema": "smartaihub.stage/v1",
  "generated_at": "2026-10-04T03:30:00Z",
  "manifest_generation": 42,

  "goal_ref": "goal:...",
  "workspace_ref": "workspace:...",
  "task_ref": "task:...",

  "stage": "IMPLEMENT",
  "substage": "WAITING_ON_PEER",
  "state": "WAITING",

  "stage_entered_at": "2026-10-04T03:10:00Z",
  "transition_reason": "runner dispatch dependency not yet sufficient",

  "source": {
    "repository_ref": "repo:...",
    "branch": "codex/spec-269-...",
    "worktree_ref": "worktree:...",
    "head_sha": "abc123",
    "origin_main_sha": "def456",
    "validated_target_sha": null
  },

  "definition": {
    "spec_ref": "spec:269-r3.10",
    "plan_ref": "plan:...",
    "requirement_coverage_ref": "coverage:..."
  },

  "progress": {
    "requirements_total": 120,
    "requirements_verified": 82,
    "open_closure_items": 7,
    "active_subagents": 3
  },

  "dependencies": [
    {
      "dependency_ref": "dep:...",
      "state": "WAITING_ON_PEER",
      "required_artifact_ref": "artifact:runner-dispatch"
    }
  ],

  "next_action": {
    "action_id": "RECHECK_PEER_DEPENDENCY",
    "automatic": true,
    "handler_ref": "continuation:..."
  },

  "continuation_ref": "resume:...",
  "handoff_ref": "handoff:...",
  "authority_ref": "authority:...",
  "budget_ref": "budget:...",
  "evidence_refs": ["evidence:..."],

  "freshness": {
    "canonical_state_generation": 318,
    "policy_epoch": 17,
    "goal_generation": 9
  }
}
```

This example is illustrative; implementation MAY serialize refs differently while preserving semantics.

---

# 428. Stage transition contract

Every material stage transition SHOULD emit:

```yaml
StageTransition:
  goal_ref: ref
  workspace_ref: ref
  from_stage: string
  from_substage: string|null
  to_stage: string
  to_substage: string|null
  reason: string
  triggering_event_ref: ref|null
  evidence_refs: [ref]
  prior_manifest_generation: integer
  new_manifest_generation: integer
  occurred_at: timestamp
```

After a successful transition:

```text
canonical state commits
→ event emitted
→ stage.json regenerated
→ Workboard/Timeline projection updates
→ next-action resolver runs
```

---

# 429. handoff.json purpose

`handoff.json` is created when responsibility or execution context is transferred, including:

```text
session → another session
parent → subagent
subagent → parent
harness A → harness B
local runner → cloud runner
implementation session → integration controller
stalled executor → takeover executor
```

A handoff MUST be sufficient to prevent “start over and rediscover everything” behavior.

---

# 430. handoff.json schema

Recommended minimum:

```json
{
  "schema": "smartaihub.handoff/v1",
  "handoff_id": "handoff:...",
  "created_at": "2026-10-04T03:30:00Z",

  "goal_ref": "goal:...",
  "workspace_ref": "workspace:...",
  "task_ref": "task:...",

  "from": {
    "actor_ref": "assistant:...",
    "session_ref": "session:...",
    "runtime_ref": "codex:..."
  },

  "to": {
    "mode": "AUTO_NEXT_OWNER",
    "actor_ref": null,
    "required_capability_refs": ["capability:..."]
  },

  "stage_snapshot_ref": "stage:42",

  "objective": "Finish Runner dispatch validation",
  "completed": [
    "API contract added",
    "scoped tests 18/18 pass"
  ],

  "remaining": [
    {
      "closure_ref": "closure:91",
      "summary": "runtime smoke test against Runner"
    }
  ],

  "source": {
    "repository_ref": "repo:...",
    "branch": "codex/...",
    "worktree_ref": "worktree:...",
    "head_sha": "abc123",
    "base_sha": "def456",
    "dirty_state": "CLEAN"
  },

  "artifacts": ["artifact:..."],
  "evidence": ["evidence:..."],
  "requirements": {
    "coverage_ref": "coverage:...",
    "verified": 82,
    "total": 120
  },

  "known_failures": [
    {
      "fingerprint": "failure:...",
      "summary": "Provider A rate limited",
      "last_attempt_ref": "attempt:..."
    }
  ],

  "must_not_repeat": [
    "do not rerun full monorepo build while parallel sessions are active",
    "do not retry Provider A before retry-after timestamp"
  ],

  "dependencies": ["dep:..."],

  "next_recommended_action": {
    "action_id": "RUN_RUNNER_SMOKE_TEST",
    "precondition_refs": ["dep:runner-ready"]
  },

  "resume_ref": "resume:...",
  "authority_ref": "authority:...",
  "budget_ref": "budget:...",

  "integrity": {
    "manifest_generation": 42,
    "content_digest": "sha256:..."
  }
}
```

The handoff SHOULD contain summaries and references, not hidden chain-of-thought.

---

# 431. Attempt history and must_not_repeat

Replacement sessions frequently waste time by repeating failed actions.

A handoff SHALL preserve enough attempt history to answer:

```text
What has already been tried?
Why did it fail?
What evidence was produced?
What retry-after or condition applies?
What approach should not be repeated without new evidence?
```

Suggested structure:

```yaml
AttemptSummary:
  attempt_ref: ref
  action: string
  result: PASS|FAIL|PARTIAL|WAITING
  failure_fingerprint_ref: ref|null
  evidence_refs: [ref]
  retry_after: timestamp|null
  repeat_policy: ALLOWED|ONLY_WITH_NEW_EVIDENCE|DO_NOT_REPEAT
```

This integrates with R3.3 convergence controls and R3.6 subagent takeover.

---

# 432. resume.json purpose

Every recoverable stop/wait SHOULD have `resume.json` or equivalent materialized projection.

Examples:

```text
WAITING_ON_PEER
WAITING_PROVIDER
WAITING_FOR_QUOTA
WAITING_FOR_EXECUTOR
RESOURCE_WAIT
SCHEDULED_TIME
```

`resume.json` describes how work wakes itself.

---

# 433. resume.json schema

Recommended form:

```json
{
  "schema": "smartaihub.resume/v1",
  "continuation_id": "continuation:...",
  "goal_ref": "goal:...",
  "task_ref": "task:...",
  "checkpoint_ref": "checkpoint:...",

  "wait_reason": "WAITING_ON_PEER",

  "wake": {
    "event_topics": [
      "artifact.ready",
      "task.completed"
    ],
    "condition_ref": "condition:runner-dispatch-ready",
    "next_recheck_at": "2026-10-04T03:45:00Z",
    "backoff_policy_ref": "backoff:..."
  },

  "resume": {
    "handler_ref": "handler:runner-smoke-continuation",
    "revalidation_policy_ref": "revalidate:goal-policy-source-env",
    "automatic": true
  },

  "freshness": {
    "goal_generation": 9,
    "policy_epoch": 17,
    "source_generation": 31
  },

  "state": "ARMED"
}
```

A recoverable waiting task without an armed resume manifest/continuation is an operational defect.

---

# 434. Handoff bundle

A portable handoff MAY be represented as:

```text
handoff-bundle/
  stage.json
  handoff.json
  resume.json              optional when not waiting
  evidence-index.json      optional
  artifacts/               optional references or materialized subset
```

The bundle MAY be exchanged between supported harnesses/runtimes.

Large artifacts SHOULD remain in durable storage and be referenced by URI/ref/digest rather than copied unnecessarily.

---

# 435. Consumer acknowledgement

A handoff SHOULD have explicit producer/consumer lifecycle:

```text
CREATED
PUBLISHED
CLAIMED
ACKNOWLEDGED
ACTIVE
COMPLETED
SUPERSEDED
```

The receiving actor SHOULD acknowledge:

```text
handoff id
manifest generation
source SHA
accepted scope
ownership/lease generation
```

Only after successful claim/fencing should canonical mutation ownership move when exclusive ownership is required.

---

# 436. Stage freshness and stale-session fencing

Before acting from a handoff/stage manifest, the consumer SHALL reconcile freshness fields against canonical state.

If:

```text
manifest goal generation < current goal generation
manifest source generation < required source generation
policy epoch changed materially
ownership lease is stale
```

then:

```text
DO NOT BLINDLY RESUME
→ reconcile
→ refresh stage/handoff
→ replan if necessary
```

This prevents a session restored from an old `stage.json` from overwriting newer work.

---

# 437. Secret-free control artifacts

Control manifests MUST NOT contain:

```text
API keys
passwords
access tokens
private keys
raw session cookies
unnecessary sensitive memory
```

They MAY contain secure references/handles to authorized secret stores.

Portable handoff/export SHOULD minimize personal/project-sensitive content and preserve authorization boundaries.

---

# 438. Integrity and tamper evidence

Manifest artifacts SHOULD include:

```text
schema version
generation
created_at/generated_at
canonical-state generation refs
content digest
producer identity/provenance ref
```

High-trust cross-runtime handoffs MAY additionally use signatures/attestations where supported.

A modified manifest MUST NOT gain additional authority merely because its JSON field says so.

Authority is re-resolved from canonical policy.

---

# 439. Automatic manifest regeneration

`stage.json` SHOULD regenerate after material events such as:

```text
research stage change
spec candidate/ready
plan closure complete
implementation start
checkpoint
wait/resume
subagent takeover
session-finish
READY_FOR_INTEGRATION
integration promotion
main validated
canonical sync
build start/pass/fail
deploy
smoke verification
completion
```

This ensures inspectability without requiring a human to maintain the file.

---

# 440. stage.json and Git lifecycle

R3.7 Git lifecycle SHOULD project into `stage.json`.

Example:

```json
{
  "stage": "INTEGRATE",
  "substage": "READY_FOR_INTEGRATION",
  "next_action": {
    "action_id": "INTEGRATE_READY_BRANCH",
    "automatic": true
  }
}
```

After promotion:

```json
{
  "stage": "CANONICALIZE",
  "substage": "MAIN_VALIDATED",
  "next_action": {
    "action_id": "PREPARE_CANONICAL_CHECKOUT",
    "automatic": true
  }
}
```

The user does not need to name the next Skill.

---

# 441. stage.json and closure semantics

`stage.json` SHOULD expose concise closure truth:

```json
{
  "progress": {
    "requirements_total": 140,
    "requirements_planned": 140,
    "requirements_implemented": 138,
    "requirements_verified": 136,
    "open_closure_items": 4
  }
}
```

This is a projection over RequirementCoverageGraph / ClosureLedger.

It MUST NOT allow numeric progress to override semantic completion rules.

---

# 442. stage.json and subagents

The parent stage MAY summarize children:

```json
{
  "subagents": {
    "active": 5,
    "waiting": 1,
    "stalled": 0,
    "failed_recovering": 1,
    "completed": 8
  }
}
```

Detailed child state remains in canonical job/subagent records.

The stage manifest is an overview, not a replacement scheduler.

---

# 443. Context-loss recovery

If an LLM/harness session loses conversational context, the replacement SHOULD bootstrap from:

```text
stage.json
handoff.json
resume.json
relevant spec/plan refs
current source/worktree refs
open closure items
required evidence
```

rather than requesting the user to reconstruct the project history.

The replacement MAY fetch deeper context only as needed.

---

# 444. User-facing Stage Timeline

The user-facing Development/Work timeline SHOULD derive from the same stage projection.

Example:

```text
✓ Research
✓ Spec hardened
✓ Plan complete
↻ Implement
  136 / 140 verified
  4 closure items being repaired
○ Integration
○ Build
○ Deploy

Next automatic action:
Finish closure items, then run session-finalization automatically.

No action required.
```

This avoids divergence between internal state and user-visible progress.

---

# 445. R3.10 additional acceptance tests

Implementation MUST prove at least:

1. a non-trivial durable goal can materialize valid `stage.json`;
2. `stage.json` contains stage, substage, generation and next action;
3. a handoff can materialize valid `handoff.json`;
4. waiting work can materialize valid `resume.json`;
5. manifests can be regenerated from canonical state after deletion;
6. stale `stage.json` does not overwrite newer canonical state;
7. manifest import performs reconciliation before mutation;
8. stage taxonomy remains stable while substages evolve;
9. stage transition increments manifest generation;
10. stage manifest records exact Git/worktree/source refs when development is Git-backed;
11. handoff records completed and remaining work;
12. handoff records open closure/requirement evidence refs;
13. handoff records known failures and retry-after data;
14. replacement harness does not blindly repeat `must_not_repeat` work;
15. handoff records next recommended automatic action;
16. handoff can be claimed by a different authorized harness;
17. exclusive mutation ownership transfers only after fencing/claim;
18. recoverable wait without resume continuation is detected as defect;
19. resume event wake can reactivate work;
20. scheduled fallback can reactivate when event is lost;
21. duplicate wake cannot run continuation twice;
22. stale goal generation blocks blind resume;
23. policy epoch change triggers revalidation;
24. source generation change triggers reconciliation;
25. control manifests contain no raw secrets;
26. secure secret references may be resolved only by authorized runtime;
27. local projected manifests are excluded from normal Git commits by default;
28. committed-manifest policy can be explicitly enabled for a repository that wants it;
29. large artifacts remain refs/digests rather than copied into JSON;
30. context-loss replacement can resume from the handoff bundle without user restatement;
31. user-facing timeline matches canonical stage projection;
32. stage summary can show subagent counts without becoming the subagent SoT;
33. session-finish transition updates stage automatically;
34. integration promotion updates stage automatically;
35. validated main stage can name canonical sync as next automatic action;
36. build/deploy/smoke stages project accurately;
37. CompletionCertificate can reference final stage manifest generation;
38. completed work has no active resume continuation unless explicitly scheduled for operation/monitoring;
39. superseded handoff cannot reclaim ownership;
40. handoff bundle export/import preserves evidence and source identity;
41. tampering with a manifest cannot increase authority;
42. stage/handoff/resume schemas are versioned;
43. old supported schema can migrate/read compatibly;
44. unsupported schema fails explicitly without losing canonical state;
45. dynamic manifest regeneration does not create noisy Git commits;
46. user never has to maintain stage.json manually;
47. ordinary session/harness transition does not require rereading full Chat history;
48. R3.10 introduces no second job/state/evidence authority.

---

# 446. R3.10 twelve-pass gap review

| Pass | Lens | Gap found | R3.10 resolution |
|---:|---|---|---|
| 1 | Explicit stage artifact | Runtime had stage concepts but no standard `stage.json` | Added StageManifest |
| 2 | Portable handoff | Handoff existed as contracts/events but lacked a canonical portable manifest | Added `handoff.json` |
| 3 | Resume clarity | Continuation existed but no explicit human/machine-readable resume artifact | Added `resume.json` |
| 4 | SoT duplication | JSON files could become accidental second database | Defined them as derived projections |
| 5 | Cross-harness bootstrap | Replacement executor might still need Chat history | Added HandoffBundle bootstrap |
| 6 | Git/source identity | Handoff could omit exact revision/worktree | Required source identity |
| 7 | Repeated failed work | Replacement harness could repeat known failures | Added attempt history / `must_not_repeat` |
| 8 | Stale resume | Old manifest could mutate newer work | Added generation/freshness fencing |
| 9 | Security | Portable JSON could leak secrets | Added secret-free manifest rule |
| 10 | Ownership | Two actors could believe they own mutation after handoff | Added claim/ack/fencing lifecycle |
| 11 | UX divergence | Workboard could disagree with runtime | User timeline derives from same stage projection |
| 12 | Git noise | Dynamic state files could dirty source branches | Default runtime/control storage + Git-ignore semantics |

All identified gaps were incorporated into R3.10.

---

# 447. R3.10 Definition of Done extension

R3.10 is not complete until:

- `stage.json` can truthfully describe current durable work stage and next automatic action;
- `handoff.json` can transfer enough bounded context for a new authorized actor to continue without asking the user to reconstruct history;
- `resume.json` can describe every recoverable wait and its automatic wake path;
- all three manifests remain derived from canonical state rather than becoming a second source of truth;
- stale manifests are fenced by generation/freshness checks;
- Git/source identity, closure state, evidence and next action survive handoff;
- known failed attempts are carried forward so new actors do not blindly repeat them;
- control artifacts remain secret-free and integrity-verifiable;
- dynamic stage state does not pollute normal Git history;
- session, harness and runtime transitions can regenerate/import/export the control bundle automatically;
- the user can inspect one clear stage view while SmartAIHub continues to own the next action.

---

# 448. R3.11 Multi-scope Control Manifest Model

R3.10 introduced `stage.json`, `handoff.json`, and `resume.json`. R3.11 hardens them for real concurrent work.

A single workspace MAY have:

- multiple goals;
- multiple sessions;
- multiple subagents;
- parallel research and implementation;
- more than one active handoff;
- more than one waiting continuation.

Therefore, one mutable file at `.smartaihub/control/stage.json` MUST NOT be assumed sufficient as the only materialized projection.

Recommended logical layout:

```text
.smartaihub/
  control/
    index.json

    goals/
      <goal-id>/
        stage.json

    tasks/
      <task-id>/
        stage.json

    sessions/
      <session-id>/
        stage.json

    handoffs/
      <handoff-id>.json

    resumes/
      <continuation-id>.json
```

A convenience `.smartaihub/control/stage.json` MAY exist as a pointer/summary for the currently selected goal, but MUST NOT overwrite concurrent goal state.

---

# 449. ControlArtifactIndex

The workspace SHOULD expose a compact active-control index.

```json
{
  "schema": "smartaihub.control-index/v1",
  "workspace_ref": "workspace:...",
  "generated_at": "2026-10-04T04:20:00Z",
  "canonical_state_generation": 901,
  "active_goal_stage_refs": [
    "control:goal-a/stage:42",
    "control:goal-b/stage:19"
  ],
  "active_handoff_refs": [
    "handoff:123",
    "handoff:124"
  ],
  "active_resume_refs": [
    "continuation:77"
  ],
  "projection_health": "CURRENT"
}
```

The index is a discovery projection, not a second scheduler or work queue.

On restart/context loss, a controller MAY use the index to discover active work, then reconcile each item with canonical state.

---

# 450. NonLinearStageProjection

Real work is often not strictly linear.

Example:

```text
RESEARCH ──────────────┐
                      ├─→ PLAN
PROTOTYPE / IMPLEMENT ─┘
        │
        └──── VERIFY in parallel
```

A goal-level `stage.json` SHOULD support:

```yaml
stage: IMPLEMENT
substage: CODING

primary_stage: IMPLEMENT

active_fronts:
  - stage: RESEARCH
    substage: TARGETED_REFRESH
    task_refs: [ref]
  - stage: IMPLEMENT
    substage: CODING
    task_refs: [ref]
  - stage: VERIFY
    substage: TARGETED_TEST
    task_refs: [ref]

parallel_tracks:
  - track_id: backend
    stage: IMPLEMENT
  - track_id: ui
    stage: VERIFY
  - track_id: research
    stage: RESEARCH
```

`primary_stage` is a user-facing summary. `active_fronts` preserves operational truth.

A system MUST NOT claim “research complete” merely because the primary stage advanced to implementation while a required research refresh remains active.

---

# 451. Stage re-entry and reopened work

Stage order is not permanently monotonic.

Examples:

```text
VERIFY
→ finds missing requirement
→ re-enter IMPLEMENT

DEPLOY
→ smoke failure
→ re-enter IMPLEMENT / REPAIRING

IMPLEMENT
→ new current evidence invalidates design
→ re-enter RESEARCH / PLAN
```

Required behavior:

- history remains append-only/auditable;
- current stage MAY move backward/re-enter an earlier phase;
- prior completed-stage evidence is not erased;
- requirements/closure items that remain valid MAY stay closed;
- only affected downstream evidence is invalidated/reopened.

The UI SHOULD say “reopened for repair” rather than falsely implying the earlier work never happened.

---

# 452. AtomicProjectionProtocol

Canonical state is authoritative, but control manifests must not silently drift after crashes.

Preferred transition order:

```text
1. validate transition
2. atomically commit canonical state / event
3. obtain committed canonical generation
4. project manifests for that generation
5. publish projection-health=CURRENT
```

If the process crashes after step 2:

```text
canonical state is correct
manifest may lag
→ projection_health = LAGGING/UNKNOWN
→ projector/watchdog rebuilds manifest
```

Manifest generation MUST NOT be used as proof that canonical mutation committed unless canonical event/state confirms it.

---

# 453. ProjectionHealth

Each control projection SHOULD expose health:

```text
CURRENT
LAGGING
REBUILDING
CONFLICT
UNKNOWN
```

Examples:

```text
CURRENT
  manifest generation reconciles with canonical source generation

LAGGING
  canonical state advanced but manifest not yet regenerated

REBUILDING
  projector is reconstructing from canonical state/events

CONFLICT
  two materializations claim incompatible current state that cannot yet be reconciled

UNKNOWN
  required authoritative state is temporarily unreachable
```

User-facing progress MUST avoid presenting LAGGING/UNKNOWN projection as guaranteed current truth.

---

# 454. OfflineLocalAheadReconciliation

R3.10 says canonical state wins manifest conflicts. R3.11 clarifies offline authorized local work.

A local executor MAY contain legitimate work newer than the cloud-visible projection.

Therefore:

```text
cloud projection older
+
authorized local writer has valid newer checkpoint/source generation
≠
discard local state
```

Required reconciliation:

```text
detect LOCAL_AHEAD
→ freeze competing cloud mutation if necessary
→ authenticate local executor/write lease history
→ inspect source/checkpoint lineage
→ import/merge/rebase according to workspace policy
→ create a new canonical generation
→ regenerate manifests
```

If local state cannot be proven, state remains `UNKNOWN/CONFLICT`, not silently promoted.

---

# 455. HandoffClaimLease

A handoff claim MUST NOT live forever if the receiving session disappears.

```yaml
HandoffClaimLease:
  handoff_ref: ref
  claimant_ref: ref
  claim_generation: integer
  claimed_at: timestamp
  heartbeat_at: timestamp
  expires_at: timestamp
  state: CLAIMED|ACTIVE|EXPIRED|RELEASED|SUPERSEDED
```

If heartbeat/lease expires:

```text
reconcile consumer state
→ if work still active, renew through authenticated controller
→ otherwise release claim
→ requeue/reassign/take over automatically
```

The user MUST NOT need to notice that a claimed handoff was abandoned.

---

# 456. Nested handoff lineage

Handoffs MAY form chains:

```text
Parent
→ Research Subagent
→ Specialist Verifier
→ Replacement Harness
→ Parent
```

Each handoff SHOULD record:

```text
parent_handoff_ref
root_goal_ref
lineage_depth
causation_ref
previous_owner_ref
```

Cycle protection SHALL prevent:

```text
A → B → C → A → B → ...
```

without new work/evidence.

A nested handoff MUST NOT accidentally widen authority beyond the original delegated ceiling.

---

# 457. Cancellation and supersession cascade

When a goal/task is cancelled or superseded:

```text
mark current stage cancelled/superseded
→ fence old mutation generations
→ invalidate stale next_action dispatch
→ cancel/revoke applicable child jobs
→ supersede outstanding handoffs
→ disarm resume continuations
→ release claims/leases
→ preserve required audit/evidence
```

A stale `resume.json` MUST NOT reactivate cancelled work.

A handoff created for generation N MUST NOT reclaim ownership after generation N+1 materially supersedes it.

---

# 458. ManifestCompletenessGate

Before publishing a handoff or allowing a new actor to claim it, SmartAIHub SHOULD validate at least:

```text
schema is supported
goal/workspace/task refs resolve
source identity is sufficient
required artifact refs resolve or declare portability requirement
open closure references are reachable
known failure/attempt history is present when applicable
next action or terminal state is explicit
authority/budget refs exist where required
freshness generations exist
secret scan passes
sensitive-context minimization passes
content digest is valid
```

A handoff failing this gate remains `DRAFT/INVALID`, not claimable.

---

# 459. Schema and capability negotiation

Schema version compatibility alone is insufficient.

A producer MAY rely on a capability the consumer does not implement.

Each bundle SHOULD declare:

```yaml
ManifestCapabilities:
  required:
    - checkpoint_resume_v1
    - git_source_identity_v1
    - closure_ledger_refs_v1
  optional:
    - signed_attestation_v1
    - local_dirty_snapshot_v2
```

Consumer behavior:

```text
all required capabilities supported
→ claim allowed

required capability unsupported
→ try compatible adapter/migrator
→ otherwise refuse claim and reroute to capable executor
```

The system MUST NOT silently drop required semantics during downgrade.

---

# 460. Sensitive-context minimization for control artifacts

Secret-free is necessary but not sufficient.

Control manifests MAY still leak:

- customer names;
- proprietary project titles;
- private source paths;
- confidential architecture details;
- sensitive user decisions.

Portable/exportable bundles SHOULD include classification:

```yaml
data_classification: INTERNAL|CONFIDENTIAL|RESTRICTED
export_scope: LOCAL_ONLY|TENANT_ONLY|AUTHORIZED_PROVIDER|PORTABLE
redaction_profile_ref: ref|null
```

External harness handoff SHOULD receive the minimum useful context and references necessary for the task.

---

# 461. Cross-environment portability classification

A handoff reference MAY be:

```text
PORTABLE
TENANT_BOUND
ENVIRONMENT_BOUND
DEVICE_BOUND
NON_PORTABLE
```

Examples:

```text
Git commit SHA                → generally portable
R2 object ref                 → tenant/environment bound
local dirty snapshot path     → device bound
secret handle                 → environment/authority bound
localhost service endpoint    → non-portable outside device
```

Before moving work to another runtime, SmartAIHub SHALL resolve/rebind portable dependencies and explicitly handle non-portable ones.

---

# 462. Manifest retention, compaction and garbage collection

Control manifests can accumulate rapidly.

Retention SHOULD follow canonical audit/workspace policy.

Suggested behavior:

```text
active/current manifests
  keep hot

superseded intermediate stage manifests
  compact or move to audit/event history

completed handoff/resume manifests
  retain according to task/audit policy

unreferenced exported bundles
  GC after retention window when safe
```

GC MUST respect:

- legal/audit retention;
- shared artifact refs;
- active recovery points;
- unresolved disputes/incidents;
- final CompletionCertificate references.

Deleting a transient manifest MUST NOT delete canonical work evidence it merely referenced.

---

# 463. Monotonic ordering independent of wall clock

Distributed devices may have clock skew.

State ordering SHALL prefer:

```text
canonical generation
source revision
lease/fencing generation
event sequence
```

over wall-clock timestamps.

Timestamps remain useful for UX/audit but MUST NOT decide ownership or freshness alone.

---

# 464. CheckpointCadencePolicy

Waiting events are not the only time checkpoints matter.

Long-running mutation work SHOULD checkpoint periodically based on risk/cost.

```yaml
CheckpointCadencePolicy:
  mode: EVENT_ONLY|TIME_BOUNDED|WORK_BOUNDED|HYBRID
  max_uncheckpointed_duration: duration|null
  max_uncheckpointed_work_units: integer|null
  checkpoint_on:
    - material_source_change
    - phase_transition
    - before_external_side_effect
    - before_executor_handoff
    - before_high_risk_operation
```

Checkpoint frequency SHOULD balance durability against storage/overhead.

The objective is bounded recovery loss, not checkpoint spam.

---

# 465. Crash recovery from partial manifest publication

Manifest publication SHOULD be atomic where storage allows:

```text
write temporary object
→ validate digest/schema
→ publish immutable/versioned object
→ update current pointer/index
```

If a crash leaves a temporary/incomplete object:

- it MUST NOT be treated as current;
- projector/watchdog MAY remove it after safe reconciliation;
- current pointer remains at last complete generation.

---

# 466. Completion finalization

When a goal reaches terminal successful completion:

```text
final stage = COMPLETE
→ issue CompletionCertificate
→ disarm ordinary resume continuations
→ supersede open non-operational handoffs
→ release task/session claim leases
→ retain final stage/handoff/evidence refs per policy
→ GC transient projections later
```

Operational monitoring/schedules that are part of the delivered product remain separate active responsibilities and MUST NOT be accidentally cancelled.

---

# 467. R3.11 additional acceptance tests

Implementation MUST prove at least:

1. two concurrent goals in one workspace do not overwrite one `stage.json`;
2. control index discovers both active goals;
3. one goal can expose multiple active fronts simultaneously;
4. primary stage does not hide a required active research/verification front;
5. verification failure can re-enter implementation without deleting stage history;
6. only affected evidence/requirements reopen after stage regression;
7. crash after canonical commit but before manifest update yields LAGGING and self-rebuilds;
8. lagging manifest is not presented as guaranteed current;
9. authorized local-ahead state is not discarded merely because cloud projection is older;
10. unverifiable local-ahead state becomes UNKNOWN/CONFLICT;
11. claimed handoff expires and is automatically reassignable when consumer disappears;
12. active valid consumer can renew claim safely;
13. nested handoff preserves root goal and authority ceiling;
14. handoff cycles are detected and bounded;
15. cancellation supersedes handoffs and disarms resumes;
16. stale resume cannot reactivate cancelled generation;
17. incomplete handoff fails ManifestCompletenessGate;
18. handoff with unresolved required artifact ref cannot be claimed unless portability/rebind policy permits;
19. consumer missing required manifest capability cannot silently accept degraded handoff;
20. compatible migration/adapter can bridge supported schema/capability version;
21. portable bundle redacts unnecessary sensitive context;
22. control artifact classification prevents unauthorized external export;
23. device-bound reference is detected before cloud handoff;
24. environment-bound secret handle is rebound or causes capability-aware reroute;
25. superseded manifests can be compacted without losing canonical event/audit history;
26. GC does not delete evidence still referenced by CompletionCertificate;
27. clock skew does not allow stale actor to win ownership;
28. generation/fencing order dominates timestamps;
29. long-running source mutation checkpoints before configured maximum uncheckpointed loss;
30. checkpoint cadence does not create uncontrolled storage churn;
31. partial manifest file/object is never treated as current;
32. current pointer switches only to a validated complete manifest;
33. completed goal disarms ordinary continuation;
34. product operational monitoring survives development-goal finalization;
35. control index can be rebuilt from canonical active state;
36. deleted transient manifest can be regenerated when canonical state remains;
37. multi-agent child stages aggregate without replacing child job truth;
38. reopening a completed substage produces explicit REOPENED history;
39. completion cannot occur while a required active front remains unresolved;
40. final manifest generation is referenced by CompletionCertificate;
41. handoff claim ownership cannot transfer through stale lease;
42. takeover actor receives latest valid handoff generation;
43. privacy minimization applies even when no raw secret is present;
44. cross-tenant handoff cannot dereference tenant-bound refs without explicit authorized rebind;
45. manifest schema downgrade cannot drop `must_not_repeat` or fencing semantics when marked required;
46. controller restart can discover all active handoffs/resumes from index/canonical state;
47. stage/handoff/resume cleanup never becomes a user-maintenance task;
48. R3.11 introduces no second canonical scheduler/job/state/evidence authority.

---

# 468. R3.11 sixteen-pass gap review

| Pass | Lens | Gap found | R3.11 resolution |
|---:|---|---|---|
| 1 | Multi-goal collision | One workspace-level file could be overwritten by concurrent goals/sessions | Added scoped layout + ControlArtifactIndex |
| 2 | Non-linear work | One stage could misrepresent parallel research/implementation/verification | Added primary stage + active fronts/tracks |
| 3 | Crash consistency | Canonical state could commit while manifest stayed stale | Added AtomicProjectionProtocol + ProjectionHealth |
| 4 | Offline local-ahead | “canonical wins” could discard valid newer local work | Added authorized LOCAL_AHEAD reconciliation |
| 5 | Abandoned claim | Claimed handoff could remain stuck after consumer death | Added HandoffClaimLease/expiry/reassignment |
| 6 | Nested delegation | Multi-hop handoffs lacked explicit lineage/cycle bounds | Added nested lineage + cycle prevention |
| 7 | Cancellation | Old resume/handoff could resurrect superseded work | Added cancellation/supersession cascade |
| 8 | Handoff quality | A syntactically valid manifest could still be operationally incomplete | Added ManifestCompletenessGate |
| 9 | Capability mismatch | Consumer may parse JSON but not support required semantics | Added capability negotiation |
| 10 | Privacy | Secret-free bundle could still leak confidential context | Added classification/minimization/export scope |
| 11 | Portability | Device/tenant/environment-bound refs could fail after runtime move | Added portability classification/rebinding |
| 12 | Retention/GC | Control artifacts could accumulate forever | Added compaction/GC linked to canonical retention |
| 13 | Clock skew | Timestamp ordering could pick stale state | Added generation/sequence-first ordering |
| 14 | Reopened work | Stage regression after failed verification lacked explicit semantics | Added stage re-entry/reopen model |
| 15 | Crash-loss window | Long work might only checkpoint at waits/transfers | Added CheckpointCadencePolicy |
| 16 | Partial publication/finalization | Torn manifests and stale continuations could survive completion | Added atomic publication + completion retirement |

All identified gaps were incorporated into R3.11.

---

# 469. R3.11 Definition of Done extension

R3.11 is not complete until:

- concurrent goals/tasks/sessions have collision-free control manifests;
- a goal can represent multiple simultaneous active fronts truthfully;
- stale/lagging projection state is detectable and automatically rebuildable;
- valid offline local-ahead work can reconcile without being silently discarded;
- handoff ownership expires/reassigns when consumers disappear;
- nested handoffs remain lineage-bound and cycle-safe;
- cancellation/supersession cannot be undone by stale resume artifacts;
- handoff publication is completeness-validated;
- producer/consumer schema and capability compatibility is negotiated explicitly;
- portable bundles minimize sensitive context and classify non-portable refs;
- manifests have bounded retention/compaction/GC behavior;
- generation/fencing semantics determine freshness instead of device clock alone;
- long-running work checkpoints often enough to bound crash-loss;
- partial manifest writes cannot become current;
- completion retires stale development continuations while preserving required operational schedules and audit evidence;
- a new session/harness can discover the correct active control state even in a workspace with many simultaneous goals.

---

# 470. R3.12 Presentation Output Integration

Spec 269 owns assistant/workforce reasoning, delegation, lifecycle, completion and control-state semantics. It does **not** own Chat rendering.

All rich answer rendering SHALL delegate to Spec 240.

Architecture:

```text
Spec 269 Assistant / Subagent / Research / Lifecycle
                    │
                    ▼
          Result + PresentationIntent
                    │
                    ▼
               Spec 240
    ChatPresentationEnvelope / GenUI
                    │
                    ▼
              Chat / Mini App
```

---

# 471. PresentationIntent

Agents MAY attach a bounded presentation hint:

```yaml
PresentationIntent:
  purpose:
    EXPLAIN|
    COMPARE|
    SHOW_PROGRESS|
    SHOW_ARCHITECTURE|
    SHOW_RESEARCH|
    SHOW_ARTIFACTS|
    REQUEST_DECISION
  preferred_semantics:
    - markdown
    - mermaid
    - graph
    - comparison
    - timeline
    - stage
    - artifact
  detail_level: COMPACT|STANDARD|EXPANDED
```

It is a hint only.

Spec 240 chooses certified components.

No agent may emit trusted React/HTML/JS component code as a way to gain presentation capability.

---

# 472. Stage / handoff / resume presentation

R3.11 control manifests MAY be projected into Chat through Spec 240 semantic blocks.

Examples:

```text
stage.json
→ StageBlock

handoff status
→ Status/Timeline block

resume.json
→ Waiting/Next-Wake block

subagent execution
→ Progress + expandable worker summary
```

The Chat view is never canonical control state.

A stale Chat card MUST NOT override a newer control-manifest generation.

---

# 473. Research presentation

R3.9 research output SHOULD map naturally to:

```text
summary              → markdown
ReferencePortfolio   → comparison/cards
DecisionImpactMatrix → comparison/table
evidence             → citations/source list
architecture pattern → Mermaid/graph
mockup/artifact       → artifact/media block
ResearchDecisionReceipt → expandable rationale/provenance
```

The default user view SHOULD emphasize the recommendation and decision-relevant evidence, not every raw subagent trace.

---

# 474. Subagent presentation

R3.6 subagent status MAY be rendered as:

```text
progress
timeline
status
stage
```

The UI SHOULD summarize:

```text
active
complete
waiting
rerouted
recovering
failed-but-recovering
```

without requiring the user to manage workers.

Hidden chain-of-thought remains hidden.

Operational details may be expandable.

---

# 475. Completion-first presentation

Presentation MUST reinforce completion-seeking behavior.

Bad:

```text
10 gaps remain.
```

Preferred:

```text
Repairing 10 remaining closure items automatically.
Next automatic step: final verification.
No action required.
```

When a true human-exclusive boundary exists, the renderer SHOULD present the smallest exact user action, recommendation and auto-resume promise.

---

# 476. Presentation failure is not goal failure

If Mermaid/graph/chart/generated UI fails to render:

```text
rich renderer fails
→ fallback text/structured result
→ continue goal execution
```

A presentation-layer failure MUST NOT convert a successfully completed canonical task into a failed task.

Conversely, a beautiful card MUST NOT falsely mark an incomplete task as complete.

---

# 477. R3.12 acceptance tests

Implementation MUST prove at least:

1. assistant can return plain text with no Spec 240 dependency failure;
2. architecture explanation can request Mermaid/graph semantics;
3. presentation hint cannot force unapproved component code;
4. stage manifest can project into a StageBlock;
5. stale StageBlock cannot mutate canonical state;
6. subagent status can project without exposing chain-of-thought;
7. research comparison can project into comparison/citation blocks;
8. renderer failure falls back to readable text;
9. renderer failure does not fail canonical goal;
10. canonical goal failure cannot be hidden by successful presentation;
11. user-facing waiting card states next automatic action when available;
12. human-exclusive boundary card contains minimal required action and auto-resume behavior;
13. rich presentation introduces no second state/job/evidence/action authority.

---

# 478. R3.13 Cross-cutting reliability hardening decision

R3.13 closes failure modes that emerge only after autonomous completion, subagents, cross-session waits, lifecycle automation, stage manifests and rich research all operate together.

The central principle is:

> **Parallelism, retries, waits and automation MUST remain composable. A parent goal is not complete merely because every individual component appears locally healthy.**

R3.13 adds explicit semantics for dependency cycles, unstable verification, nested goal completion, stale child instructions, irreversible commit points, deadlines, priority inversion, speculative economics, multi-system partial commits and completion finality.

---

# 479. GoalGraph and SubgoalCompletionContract

A complex goal SHALL be representable as an explicit goal/subgoal graph rather than only a flat set of delegations.

```yaml
GoalNode:
  goal_ref: ref
  parent_goal_ref: ref|null
  objective: string
  requirement_refs: [ref]
  completion_contract_ref: ref
  owner_ref: ref
  generation: integer
  state: OPEN|RUNNING|WAITING|VERIFYING|COMPLETED|FAILED|CANCELLED|SUPERSEDED
  required_child_goal_refs: [ref]
  optional_child_goal_refs: [ref]
```

A parent's completion SHALL compose from child outcomes according to declared semantics:

```text
ALL_REQUIRED
ANY_VALIDATED
QUORUM
CUSTOM_PREDICATE
```

Rules:

- child success does not automatically imply parent success;
- child failure does not automatically fail the parent when an alternate path exists;
- a child marked optional MUST NOT silently carry a requirement that is actually mandatory;
- parent requirement coverage remains authoritative;
- goal split/merge/replan SHALL preserve lineage and generation history;
- a subgoal transferred to another Assistant remains inside the original parent's finality accounting unless explicitly detached/superseded.

This formalizes parent-child completion independently from provider/harness session structure.

---

# 480. DependencyWaitGraph

All durable waits SHOULD project into a dependency wait graph.

Nodes MAY include:

```text
goal
task
subgoal
subagent
peer session
resource reservation
mutation lease
external provider job
artifact/checkpoint
human-exclusive action
scheduled time
```

Edges express:

```text
A WAITING_FOR B
A REQUIRES artifact X
A HOLDS resource R
A BLOCKS B
```

The graph SHALL correlate with canonical jobs/leases/dependencies rather than becoming a second scheduler.

It enables the platform to distinguish:

```text
ordinary wait
critical-path wait
cyclic wait
resource deadlock
priority inversion
stale dependency edge
```

---

# 481. Deadlock and livelock detection/recovery

Delegation-cycle prevention alone is insufficient because deadlocks can occur without recursive delegation.

Example:

```text
Task A holds source lease X, waits for artifact from B
Task B holds integration lease Y, waits for source update from A
```

The platform SHALL detect wait-for cycles and no-progress livelock patterns.

Possible recovery sequence:

```text
detect cycle/no-progress loop
→ validate whether an edge is stale
→ release/expire nonessential reservation if safe
→ checkpoint and relinquish safely preemptible resource
→ reorder dependency
→ transfer work
→ choose alternate artifact/provider/runtime
→ rollback to safe point
→ replan
→ human escalation only when no compliant automatic break exists
```

The system MUST NOT simply keep scheduling periodic wakeups for a dependency cycle that can never become ready.

A detected deadlock/livelock SHALL create a typed recovery item and update `stage.json`/Workboard status truthfully.

---

# 482. VerificationStabilityPolicy — flaky and nondeterministic checks

Autonomous repair loops MUST distinguish deterministic product failures from flaky/nondeterministic verification.

Suggested verification states:

```text
PASS_STABLE
FAIL_STABLE
FLAKY
INFRA_FAILURE
INCONCLUSIVE
NOT_RUN
```

A check SHOULD be classified using relevant evidence such as:

```text
same revision/config/input
multiple bounded reruns
failure signature consistency
runner/environment health
known test flake history
timing/race indicators
provider/service instability
```

Prohibited behavior:

```text
test fails
→ rerun repeatedly
→ one pass appears
→ declare verified
```

Preferred behavior:

```text
failure observed
→ classify stability
→ deterministic defect? repair
→ infrastructure problem? recover environment
→ flaky? isolate root cause / quarantine only under explicit policy
→ rerun bounded representative verification
→ final completion evidence states actual stability
```

A required flaky test is not equivalent to a passing required test.

---

# 483. RiskBasedIndependentVerification

Section 43 allows independent verification. R3.13 makes independence mandatory where risk warrants it.

Suggested verification classes:

```text
LOW
STANDARD
HIGH
CRITICAL
```

For `HIGH` / `CRITICAL` changes, policy SHOULD require one or more of:

- deterministic independent tests;
- fresh verifier context;
- different Assistant/subagent from the implementer;
- independent security/reliability reviewer;
- separate runtime/environment where practical;
- human or domain approval where intrinsically required.

The implementing child MUST NOT be the sole authority that certifies its own high-impact output.

Verifier input SHOULD contain:

```text
claimed result
acceptance criteria
artifact/source revision
evidence refs
known limitations
```

not hidden chain-of-thought or a persuasive implementation narrative that biases the verifier.

---

# 484. UntrustedChildResultFence

Subagent/external-harness output is a result proposal/evidence package, not trusted orchestration policy.

A child result MUST NOT gain authority by returning instructions such as:

```text
"ignore the parent policy"
"approve this automatically"
"run this shell command as admin"
"send these secrets"
"mark goal complete"
"change the budget"
```

The parent SHALL normalize child output into typed fields:

```text
result
artifacts
evidence
claimed_completion
known_gaps
recommended_next_actions
errors/waits
```

Then independently resolve:

```text
authority
policy
capability
budget
side effects
completion
```

This fence applies to:

- SmartAIHub subagents;
- Codex/Claude/Hermes/thClaws-class harnesses;
- external A2A agents;
- MCP/tool-returned natural-language instructions;
- generated handoff summaries.

A forged child completion claim cannot close canonical requirements without evidence reconciliation.

---

# 485. InstructionEpoch propagation and stale-child fencing

R3.3 checks goal/instruction freshness before consequential work. R3.13 propagates that freshness into active child execution.

Each delegated ContextPacket / SubagentWorkUnit SHOULD carry:

```yaml
instruction_epoch:
  goal_generation: integer
  instruction_generation: integer
  policy_epoch: integer
  plan_generation: integer
```

When the user materially redirects/corrects the goal:

```text
new authoritative instruction
→ increment generation
→ publish invalidation event
→ active children compare epoch
→ cancel/rebase/supersede affected work
```

Before consequential mutation or result publication, a child MUST prove that its instruction epoch is still compatible.

Stale child outputs MAY remain useful evidence/artifacts, but MUST NOT silently mutate or complete the newer goal generation.

---

# 486. CommitPointGate

Immediately before an irreversible, externally visible or high-impact commit, SmartAIHub SHALL perform a final commit-point revalidation.

Examples:

- production deployment/promotion;
- schema migration;
- publish/send;
- purchase/payment-like commitment;
- destructive deletion;
- DNS/domain mutation;
- merge/push through protected branch;
- external account/configuration mutation.

`CommitPointGate` SHOULD revalidate:

```text
current goal/instruction generation
policy epoch
authority/approval freshness
budget/funding availability
source/artifact revision
required verification evidence
external target identity
side-effect idempotency/reconciliation state
resource/lease ownership
```

Passing an earlier planning or approval gate does not guarantee the commit point is still valid hours later.

This gate does not replace existing domain security/deployment checks; it composes them into a last responsible moment.

---

# 487. DeadlinePolicy and late-work semantics

A timestamp alone is insufficient to describe time behavior.

Goals/delegations SHOULD support a deadline policy such as:

```yaml
DeadlinePolicy:
  target_at: timestamp|null
  mode:
    SOFT_TARGET|
    HARD_EXPIRY|
    DELIVER_BEST_VERIFIED_BY_TARGET|
    STOP_SIDE_EFFECTS_AFTER_EXPIRY
  after_target:
    CONTINUE_TO_COMPLETION|
    CONTINUE_BACKGROUND|
    STOP_NEW_WORK|
    REQUIRE_REPLAN
  notification_policy_ref: ref|null
```

Semantics:

- `SOFT_TARGET`: optimize critical path; missing target does not abandon the goal.
- `HARD_EXPIRY`: work/authority genuinely expires.
- `DELIVER_BEST_VERIFIED_BY_TARGET`: produce the best verified subset/status by target and continue only if policy permits.
- `STOP_SIDE_EFFECTS_AFTER_EXPIRY`: analysis may continue, but expired mutations cannot commit.

If a deadline is missed, the system SHOULD reforecast/replan automatically rather than wait for the user to rediscover the late task.

A stale result arriving after a hard expiry MUST NOT be committed merely because the child eventually succeeded.

---

# 488. Priority inversion, starvation and safe preemption

Resource fairness does not by itself solve priority inversion.

Example:

```text
low-priority background goal holds an exclusive integration/resource lease
high-priority incident recovery waits behind it
```

Canonical resource systems SHOULD support or expose enough semantics for:

```text
priority inheritance
safe preemption
lease yield/checkpoint
bounded starvation detection
reservation downgrade
critical-path admission
```

Spec 269 SHALL project the priority/urgency intent without becoming the resource scheduler.

Rules:

- never preempt during an unsafe/non-checkpointable mutation unless the domain supports it;
- low-priority work SHOULD checkpoint/yield when safely preemptible;
- inherited priority MUST be bounded and released after dependency clears;
- repeated preemption MUST NOT starve ordinary accepted user goals indefinitely;
- user-visible urgency cannot bypass security/authority policy.

---

# 489. SpeculativeEconomicReconciliation

Hedged/speculative execution can incur real cost even when losing candidates are cancelled.

Each speculative group SHOULD correlate:

```text
selection_group_id
candidate_work_unit_id
economic_operation_id
reservation_id
attempt_id
actual_usage_ref
cancellation_ref
```

At fan-in/selection:

```text
winner chosen
→ cancel unnecessary candidates where possible
→ collect actual usage for every candidate
→ release unused reservations
→ reconcile late provider usage/callbacks
→ attribute speculative overhead
→ prevent duplicate settlement
```

Cancellation MUST NOT pretend consumed provider/runtime work was free.

Conversely, an unstarted/reserved losing candidate MUST NOT remain as an orphan reservation.

The user-facing cost summary MAY aggregate speculative overhead, while detailed attribution remains auditable.

---

# 490. MultiSystemCommitPlan and compensation

Complex goals may span systems that do not share one atomic transaction:

```text
Git
database migration
deployment platform
DNS
external provider/API
billing/resource reservations
```

Before a high-impact multi-system sequence, SmartAIHub SHOULD define a `MultiSystemCommitPlan`.

```yaml
MultiSystemCommitPlan:
  logical_operation_ref: ref
  ordered_steps: [ref]
  commit_points: [ref]
  reversible_steps: [ref]
  compensation_actions: [ref]
  reconciliation_actions: [ref]
  irreversible_boundary_ref: ref|null
  recovery_point_ref: ref|null
```

On partial failure:

```text
determine committed steps
→ do not blindly restart from step 1
→ compensate reversible committed steps where policy allows
→ reconcile unknown outcomes
→ restore known-good state when feasible
→ continue forward with repaired plan
```

Compensation is not guaranteed rollback; some real-world side effects are irreversible. Those must be explicitly classified before commitment.

---

# 491. ExecutionAttemptFingerprint

For reproducibility, debugging, selection and later audit, significant agent/harness attempts SHOULD produce a non-chain-of-thought execution fingerprint.

```yaml
ExecutionAttemptFingerprint:
  attempt_ref: ref
  goal_generation: integer
  plan_generation: integer
  source_revision_ref: ref|null
  context_packet_digest: string|null
  skill_versions: [ref]
  tool_capability_versions: [ref]
  model_provider_ref: ref|null
  model_version_or_alias: string|null
  runtime_environment_ref: ref|null
  policy_snapshot_ref: ref
  authority_ref: ref
  input_artifact_digests: [string]
  output_artifact_refs: [ref]
  started_at: timestamp
  ended_at: timestamp|null
```

The fingerprint MUST NOT store hidden chain-of-thought.

It supports answering:

```text
Why did two attempts differ?
Which environment/model/tool version produced this artifact?
Can this verification evidence be applied to the final generation?
```

A mutable provider alias alone is insufficient provenance for high-risk reproducibility.

---

# 492. SharedWorkReuseContract

Equivalent work MAY be joined/reused across goals only when scope and authorization are compatible.

Before reusing another task's in-flight/completed result, verify:

```text
same semantic objective/input version
compatible source/artifact generation
evidence freshness
required verification level
tenant/project/data authorization
privacy purpose
policy/region constraints
consumer quality floor
```

Possible reuse modes:

```text
JOIN_IN_FLIGHT
REUSE_ARTIFACT
REUSE_EVIDENCE
REUSE_RESEARCH
REUSE_NOT_ALLOWED
```

Reuse MUST NOT:

- expose another tenant/user's private inputs;
- inherit broader authority;
- treat a weaker verification level as stronger;
- keep a consumer blocked forever on an unrelated producer;
- create shared mutable output ownership accidentally.

The consumer retains responsibility for applicability to its own CompletionContract.

---

# 493. CompletionFinalityBarrier

Before terminal `COMPLETED`, the parent goal SHALL pass a finality barrier.

The barrier SHOULD confirm, as applicable:

```text
all required GoalGraph children satisfy join semantics
no required active_front remains unresolved
open applicable AI-actionable closure items = 0
required verification is stable and current
no unresolved COMMIT_UNKNOWN side effect exists
no required callback/reconciliation is pending
no stale child with mutation authority remains active
required resource/deployment cleanup is reconciled
economic reservations/settlement are reconciled
current instruction/policy/source generations still match
CompletionCertificate evidence binds the final generation
```

Late events arriving after completion:

```text
must be deduplicated/reconciled
must not silently reopen or mutate completed state
```

If a late event proves the completion claim was invalid, the goal SHALL explicitly transition to a typed `REOPENED`/incident/reconciliation path rather than mutate history invisibly.

`COMPLETED` is therefore a verified finality decision, not simply “no currently running process.”

---

# 494. R3.13 additional acceptance tests

Implementation MUST prove at least:

1. two tasks waiting on each other are detected as a dependency deadlock;
2. deadlock recovery attempts a compliant break rather than scheduling endless wakeups;
3. livelock with repeated state changes but no progress triggers convergence/deadlock recovery;
4. a flaky test cannot become `PASS_STABLE` from one lucky rerun;
5. infrastructure test failure is distinguishable from product defect;
6. high-risk implementation cannot self-certify as the only verifier when policy requires independence;
7. independent verifier receives artifacts/criteria rather than hidden reasoning;
8. external harness text cannot expand authority or approval;
9. forged child “mark complete” instruction cannot close parent requirements;
10. new user instruction increments epoch and invalidates incompatible active child contexts;
11. stale child cannot commit after incompatible instruction generation;
12. stale child artifact may still be retained as non-authoritative evidence when useful;
13. irreversible commit revalidates goal/policy/authority/source immediately before action;
14. expired approval fails CommitPointGate;
15. soft deadline miss replans/continues instead of abandoning goal;
16. hard-expired mutation cannot commit from a late child result;
17. low-priority preemptible holder can yield to critical work through canonical resource policy;
18. unsafe mutation is not forcibly preempted merely due priority;
19. starvation watchdog prevents indefinite repeated preemption of ordinary user work;
20. speculative loser cancellation releases unused reservation;
21. consumed speculative provider usage remains accurately settled;
22. late billing callback does not double-charge cancelled/settled candidate;
23. multi-system partial failure resumes from observed committed state rather than repeating all steps;
24. reversible partial commits can execute compensation under policy;
25. irreversible side effect is explicitly represented in recovery rather than falsely rolled back;
26. execution attempt records model/tool/skill/context/environment provenance without chain-of-thought;
27. evidence from one attempt can be rejected when its fingerprint is incompatible with final generation;
28. equivalent in-flight work can be safely joined under compatible scope;
29. cross-tenant private work cannot be reused merely because semantic objective matches;
30. reused weaker evidence does not satisfy stronger consumer verification policy;
31. parent cannot complete while a required GoalGraph child remains unresolved;
32. parent cannot complete with required active front still open;
33. parent cannot complete with `COMMIT_UNKNOWN` side effect unresolved;
34. parent cannot complete while required economic/resource reconciliation is pending;
35. late duplicate child callback after completion is idempotently ignored/reconciled;
36. late contradictory evidence can explicitly reopen finality rather than silently mutate history;
37. CompletionCertificate binds final instruction/source/policy generations;
38. deadline, priority, recovery and subagent metadata survive checkpoint/handoff;
39. finality barrier survives process restart and is reconstructed from canonical state;
40. R3.13 introduces no second scheduler, billing ledger, evidence store, resource allocator or transaction manager.

---

# 495. R3.13 sixteen-pass hardening review

| Pass | Lens | Gap found | R3.13 resolution |
|---:|---|---|---|
| 1 | Dependency liveness | Cycle prevention covered delegation ancestry but not wait/resource deadlocks | Added DependencyWaitGraph + deadlock/livelock recovery |
| 2 | Verification stability | Retry loops could accidentally “rerun until green” | Added VerificationStabilityPolicy |
| 3 | Verifier independence | Independent verifier was optional even for critical work | Added risk-based separation-of-duties |
| 4 | Child-result trust | Research sources were fenced, but subagent/harness natural-language outputs could still inject orchestration directives | Added UntrustedChildResultFence |
| 5 | Nested goal finality | Delegations existed but parent/subgoal completion composition was under-specified | Added GoalGraph/SubgoalCompletionContract |
| 6 | Instruction propagation | Freshness was checked at parent boundaries, but already-running children could retain stale ContextPackets | Added InstructionEpoch propagation/fencing |
| 7 | Last-moment safety | Earlier approvals/checks could become stale before an irreversible commit | Added CommitPointGate |
| 8 | Deadline behavior | A deadline timestamp did not define what to do after it is missed/expired | Added DeadlinePolicy |
| 9 | Priority inversion | Fairness did not address urgent work blocked by low-priority lease holders | Added priority inheritance/preemption/starvation semantics |
| 10 | Speculative economics | Fanout cost was measured but loser reservation/settlement lifecycle was incomplete | Added SpeculativeEconomicReconciliation |
| 11 | Partial cross-system commit | Recovery/rollback existed per domain but no composed multi-system compensation plan | Added MultiSystemCommitPlan |
| 12 | Attempt reproducibility | Artifact/source provenance did not fully capture model/tool/skill/context versions | Added ExecutionAttemptFingerprint |
| 13 | Cross-goal reuse | Duplicate suppression lacked a full privacy/verification contract for shared reuse | Added SharedWorkReuseContract |
| 14 | Completion finality | Parent could theoretically reach DONE while late required callbacks/reconciliation remained | Added CompletionFinalityBarrier |
| 15 | Late event safety | Post-completion late child/provider events needed explicit reopen/dedupe behavior | Bound late events to finality/reopen semantics |
| 16 | Authority boundaries | New reliability controls could drift into owning schedulers/billing/transactions | Explicitly kept all controls as policy/projection over canonical authorities |

All identified gaps were incorporated into R3.13.

---

# 496. R3.13 Definition of Done extension

R3.13 is not complete until:

- dependency cycles and livelocks are detectable and recoverable without user babysitting;
- nondeterministic/flaky verification cannot be mistaken for stable success;
- high-risk work uses policy-required independent verification;
- child/harness outputs are treated as untrusted result proposals rather than authority;
- nested subgoals compose into parent completion deterministically;
- material user corrections propagate to active child instruction epochs;
- irreversible actions pass a last-moment CommitPointGate;
- deadlines have explicit post-target/expiry behavior;
- priority inversion/starvation can be surfaced and mitigated through canonical resource controls;
- hedged/speculative costs and reservations reconcile correctly;
- partial multi-system commits have explicit forward/compensation recovery semantics;
- significant attempts carry reproducibility fingerprints without hidden reasoning;
- shared-work reuse is authorization/verification compatible;
- terminal completion passes a finality barrier over children, active fronts, side effects, callbacks, economics, resources and current generations;
- late events cannot silently invalidate or mutate a completed goal;
- the user can still delegate one goal and expect SmartAIHub to coordinate these reliability mechanics internally until a verified outcome is reached.

---

# 497. R3.14 Semantic integrity and operational survivability decision

R3.14 hardens the system against failure modes that arise after many successful review/repair cycles.

The new principle is:

> **Autonomous completion must preserve the meaning of the goal, the authority of each requirement, and the truth of recovery guarantees—not merely keep moving state machines forward.**

A system can be operationally active yet still fail the user if:

- the original goal gradually changes during repeated replanning;
- an assumption becomes treated as a confirmed fact;
- non-goals/prohibitions disappear during decomposition;
- multiple controllers believe they are authoritative during a partition;
- a worker and controller interpret protocol fields differently;
- “recovery supported” exists only on paper and has never survived a real fault;
- repeated review keeps inventing optional improvements and prevents convergence.

R3.14 addresses these directly.

---

# 498. GoalInvariantLedger

Each non-trivial goal SHOULD preserve a compact set of semantic invariants across all transformations.

```yaml
GoalInvariantLedger:
  goal_ref: ref
  goal_generation: integer

  desired_outcomes:
    - invariant_ref
  required_properties:
    - invariant_ref
  prohibited_outcomes:
    - invariant_ref
  explicit_non_goals:
    - invariant_ref
  fixed_user_decisions:
    - decision_ref

  flexible_dimensions:
    - implementation_detail
    - provider
    - internal_algorithm

  source_refs:
    - user_request_ref
    - approved_scope_ref
    - decision_ref
```

Examples:

```text
Goal:
"Build a Grokbot-like experience, cheaper and faster."

Invariant:
- persistent autonomous work experience
- lower recurring operating cost than selected benchmark
- practical production usability

Not necessarily invariant:
- use Grokbot code
- use Grokbot runtime
- copy Grokbot UI literally
```

The ledger is not a second spec. It is a semantic preservation projection.

---

# 499. SemanticPreservationCheck

At major transformations, SmartAIHub SHALL check that meaning remains compatible.

Required checkpoints SHOULD include:

```text
user goal
→ research interpretation
→ approved/derived definition
→ hardened spec
→ plan
→ implementation candidate
→ final verified result
```

The check SHOULD detect:

```text
required outcome disappeared
non-goal became deliverable
prohibited behavior became allowed
optional preference became mandatory
derived technical detail became mistaken for user objective
cost/latency/quality constraint silently weakened
```

A semantic mismatch becomes closure/replan work.

The user should be contacted only when the mismatch reflects a genuine material ambiguity that cannot be resolved from authoritative context.

---

# 500. RequirementProvenance

Every material requirement/constraint SHOULD carry origin/provenance.

```yaml
RequirementProvenance:
  requirement_ref: ref
  origin:
    USER_EXPLICIT|
    USER_CONFIRMED|
    POLICY_REQUIRED|
    SPEC_DERIVED|
    TECHNICALLY_DERIVED|
    RESEARCH_RECOMMENDED|
    ASSISTANT_PROPOSED
  source_ref: ref
  authority_rank: integer
  introduced_generation: integer
  mutable_without_user: boolean
```

Rules:

- `USER_EXPLICIT` and policy-required constraints cannot be silently downgraded by later model-generated text;
- `ASSISTANT_PROPOSED` improvement does not become mandatory merely because it appeared in a later draft;
- technically derived requirements may be auto-added when necessary to satisfy an existing approved requirement;
- contradictory lower-authority requirement is resolved against higher-authority source or escalated if genuinely ambiguous.

This prevents requirement drift through repeated rewriting.

---

# 501. ConstraintCoverageGraph — verify the negative space

Positive requirement coverage is not enough.

The system SHALL also represent relevant:

```text
MUST NOT
SHALL NOT
NON_GOAL
EXCLUDED
DENIED
LIMIT
BOUNDARY
```

as verifiable constraints.

Example:

```yaml
ConstraintCoverageNode:
  constraint_ref: ref
  kind: PROHIBITION|NON_GOAL|EXCLUSION|BOUNDARY|LIMIT
  source_ref: ref
  applicability: APPLICABLE|NOT_APPLICABLE|SUPERSEDED
  verification_refs: [ref]
  state: UNVERIFIED|SATISFIED|VIOLATED|WAIVED_WITH_AUTHORITY
```

Examples:

```text
"do not install external project"
"do not create a second job scheduler"
"do not expose private tenant data"
"do not force-push main"
"do not require user babysitting"
```

A completion claim SHALL fail if an applicable mandatory negative constraint is known violated.

---

# 502. AssumptionLedger

Assumptions used to plan/implement work SHALL be explicit when they can materially affect success.

```yaml
AssumptionRecord:
  assumption_ref: ref
  statement: string
  source_ref: ref|null
  status:
    UNVALIDATED|
    SUPPORTED|
    CONFIRMED|
    REFUTED|
    EXPIRED|
    SUPERSEDED
  consequence_if_false: LOW|MEDIUM|HIGH|CRITICAL
  validation_plan_ref: ref|null
  expiry_or_refresh_policy_ref: ref|null
  dependent_decision_refs: [ref]
```

Examples:

```text
"Runner API supports operation X"
"provider quota will reset within the hour"
"migration is backward compatible"
"user values visual richness more than minimal bundle size"
```

High-consequence assumptions SHOULD be validated before irreversible commitment.

An assumption MUST NOT silently transition from `UNVALIDATED` to `CONFIRMED` because multiple agents repeated it.

---

# 503. DecisionDebt and unknown closure

Some decisions can proceed temporarily with bounded uncertainty.

SmartAIHub MAY record `DecisionDebt`:

```yaml
DecisionDebt:
  debt_ref: ref
  decision_ref: ref
  unresolved_assumption_refs: [ref]
  temporary_choice: string
  reversal_cost: LOW|MEDIUM|HIGH
  must_resolve_before:
    - PRODUCTION_DEPLOY
    - PURCHASE
    - PUBLIC_RELEASE
  owner_ref: ref
  next_resolution_action_ref: ref
```

Decision debt SHALL NOT become forgotten debt.

Before its declared boundary, the system SHALL:

```text
validate
experiment
research
replace assumption
or reopen decision
```

A finality barrier MUST fail if unresolved decision debt crosses a mandatory resolution boundary.

---

# 504. MaterialGapPolicy — convergence without silent scope growth

Repeated reviews can discover:

```text
actual defects
missing mandatory requirements
important hardening
optional optimization
future enhancement
```

These are not equivalent.

Each finding SHOULD classify:

```text
MUST_FIX_BEFORE_DONE
SHOULD_FIX_IF_WITHIN_ENVELOPE
OPTIONAL_OPTIMIZATION
FUTURE_BACKLOG
NOT_APPLICABLE
```

Classification considers:

```text
approved scope
requirement provenance
severity
quality floor
security/policy
user outcome
reversibility
cost/time envelope
```

Rules:

- `MUST_FIX_BEFORE_DONE` enters closure and blocks completion;
- `SHOULD_FIX_IF_WITHIN_ENVELOPE` may be completed autonomously when economical;
- `OPTIONAL_OPTIMIZATION` MUST NOT silently become completion debt;
- `FUTURE_BACKLOG` remains visible but does not block current goal;
- the system SHOULD prefer shipping the fully satisfied approved goal over endlessly expanding it with newly imagined nice-to-haves.

This does **not** permit downgrading an existing mandatory requirement to make completion easier.

---

# 505. ChangeImpactGraph and BlastRadiusGate

Before mutating shared assets, SmartAIHub SHOULD identify dependent active/production consumers.

Shared assets MAY include:

```text
core repository modules
database schemas
shared API contracts
shared Skill/tool contracts
authentication/policy components
deployment/runtime infrastructure
tenant-shared templates
shared queues/job tables
```

`ChangeImpactGraph` SHOULD answer:

```text
who consumes this?
which active goals touch it?
which deployed products depend on it?
which tests/contracts can detect breakage?
what rollback/forward path exists?
```

For material shared mutations, a `BlastRadiusGate` SHOULD validate:

```text
affected consumers known
compatibility strategy defined
concurrent mutation conflicts fenced
required regression scope chosen
rollout/rollback/forward recovery defined
```

This gate does not become a second dependency registry; it projects existing source/deployment/contract relationships.

---

# 506. Concurrent shared-resource mutation collision

Two individually valid goals may conflict when they mutate the same shared resource.

Examples:

```text
Goal A changes shared auth middleware
Goal B changes same middleware differently

Goal C changes DB enum/schema
Goal D generates migration from older schema

Goal E upgrades common package
Goal F verifies against previous lockfile
```

Before commit, SmartAIHub SHALL reconcile shared mutation ownership/generation.

Possible resolution:

```text
serialize
merge/adapt
rebase
split ownership
supersede one candidate
create coordinated combined change
```

Passing isolated tests is insufficient when another active goal modifies the same shared dependency.

---

# 507. ControlPlanePartitionPolicy

Multiple controllers/runners may lose connectivity to each other while remaining individually alive.

During network/control-plane partition, SmartAIHub MUST prevent split-brain canonical mutation.

A partition policy SHOULD define:

```yaml
ControlPlanePartitionPolicy:
  canonical_write_authority: LEASED_QUORUM|SINGLE_REGION|OTHER_CANONICAL_POLICY
  disconnected_executor_behavior: READ_ONLY|CHECKPOINT_LOCAL|CONTINUE_ISOLATED_NONCANONICAL
  stale_lease_behavior: FENCE
  reconnection_behavior: RECONCILE_BEFORE_WRITE
```

Required invariant:

```text
cannot prove current write authority
→ cannot perform canonical mutation
```

A disconnected worker MAY continue safe isolated analysis/checkpoint work when policy permits, but must not publish canonical writes using stale fencing tokens.

On reconnect:

```text
compare generations
→ reconcile
→ import useful isolated work
→ reacquire authority
→ then mutate
```

---

# 508. RuntimeCompatibilityEnvelope

Long-running work can span rolling upgrades where controller, runner, harness, Skills or tool adapters are on different versions.

Each execution edge SHOULD negotiate a compatibility envelope.

```yaml
RuntimeCompatibilityEnvelope:
  controller_version: string
  worker_protocol_version: string
  harness_adapter_version: string|null
  skill_contract_versions: [ref]
  tool_contract_versions: [ref]
  required_features: [string]
  optional_features: [string]
  compatibility_result:
    COMPATIBLE|
    COMPATIBLE_WITH_ADAPTER|
    DEGRADED|
    INCOMPATIBLE
```

Rules:

- required semantics MUST NOT be silently dropped;
- unsupported optional features may degrade with explicit behavior;
- `INCOMPATIBLE` work should migrate/reroute to a compatible runtime if available;
- rolling upgrade MUST preserve durable queued/waiting work or migrate it explicitly;
- final evidence records the runtime compatibility set actually used.

This complements manifest capability negotiation by covering live execution behavior.

---

# 509. CanonicalStateIntegrityAudit

Durable state can be logically corrupt even when storage is available.

Integrity audits SHOULD detect as applicable:

```text
parent/child job mismatch
terminal child with nonterminal parent dependency edge
missing event sequence
duplicate conflicting terminal event
lease owner without live/valid generation
closure item referencing missing requirement
manifest pointer to missing canonical object
economic reservation without logical operation
source/evidence digest mismatch
impossible lifecycle transition
```

States MAY be classified:

```text
HEALTHY
DEGRADED
REPAIRABLE
CONFLICT
CORRUPT
UNKNOWN
```

Repair MAY use:

```text
event replay
authoritative snapshot
provider reconciliation
Git/source truth
artifact digests
economic ledger truth
manual/operator evidence where truly necessary
```

The system MUST NOT invent a clean state when authority cannot be proven.

---

# 510. Event replay and repair semantics

Event replay SHALL be deterministic with respect to supported schema generations where feasible.

Required properties:

- idempotent event application;
- duplicate-event tolerance;
- explicit unsupported-event/schema failure;
- no silent omission of security/authority-critical events;
- replay result digest/checkpoint where useful;
- projection rebuild can be compared against current projection;
- disagreement creates `CONFLICT/REPAIRABLE` state rather than choosing arbitrarily.

Replay does not authorize re-executing external side effects.

---

# 511. RecoveryDrill and FaultInjectionPolicy

A documented recovery path is not sufficient evidence for critical unattended operation.

SmartAIHub SHOULD support safe drills/fault injection for representative recovery paths.

Examples:

```text
kill worker during long task
drop callback/event
simulate provider timeout
expire lease
lose event subscription
restart controller
make one research provider unavailable
inject stale manifest
simulate quota exhaustion
simulate integration conflict
interrupt build between phases
```

High-risk/critical claims SHOULD have evidence that relevant recovery has been exercised in:

```text
test
sandbox
staging
or controlled canary
```

Production destructive fault injection requires separate policy and is not implied.

---

# 512. RecoveryClaimEvidence

Claims such as:

```text
"survives restart"
"auto-resumes after provider outage"
"handoff takeover works"
"rollback restores service"
```

SHOULD reference actual verification evidence for production certification.

```yaml
RecoveryClaimEvidence:
  claim_ref: ref
  scenario_ref: ref
  environment: TEST|SANDBOX|STAGING|CANARY|PRODUCTION_OBSERVED
  fault_ref: ref
  expected_behavior_ref: ref
  observed_result: PASS|FAIL|PARTIAL
  evidence_refs: [ref]
  verified_at: timestamp
```

A spec statement alone is not production evidence.

---

# 513. ActiveExecutionContainment / EmergencyBrake

Post-release quarantine is not enough for an actively running compromised or runaway autonomous task.

The platform SHALL support emergency containment at appropriate scopes:

```text
subagent
task
goal
workspace
provider/runtime binding
capability/tool
release
tenant
```

Containment MAY:

- fence new canonical writes;
- revoke/rotate applicable temporary credentials/tokens;
- cancel queued dispatch;
- request running worker cancellation;
- disable external side-effect bindings;
- preserve immutable evidence/log references;
- quarantine newly produced artifacts pending review;
- prevent stale scheduled resume;
- keep read-only diagnostics available.

Containment MUST NOT depend on the compromised child voluntarily obeying a text instruction.

A privileged emergency brake remains governed and audited.

---

# 514. Compromised child/tool/provider recovery

When compromise is suspected:

```text
contain
→ identify affected authority/data/artifacts
→ revoke/fence
→ determine trusted recovery point
→ reverify unaffected artifacts
→ discard/quarantine contaminated outputs
→ rotate/rebind credentials where required
→ resume on trusted runtime/adapter
```

A successful task result produced after suspected compromise is not automatically trusted.

The recovery process SHOULD minimize unnecessary invalidation of unrelated clean work.

---

# 515. DegradedModePolicy

Partial outages should not force either total shutdown or dishonest “everything is fine.”

A goal/workspace MAY operate in:

```text
NORMAL
DEGRADED
READ_ONLY
RECOVERY
CONTAINED
```

`DegradedModePolicy` SHOULD define:

```text
which capabilities remain safe
which writes are disabled
which jobs may continue
which research/providers can reroute
which quality guarantees are reduced
what user-visible truth must be shown
```

Examples:

```text
Vector/search unavailable
→ continue direct source work if sufficient
→ mark semantic retrieval unavailable

noncritical renderer unavailable
→ text fallback

secondary research provider down
→ reroute

canonical write authority unavailable
→ checkpoint/read-only; do not pretend writes succeeded
```

Reduced capability MUST NOT silently lower mandatory output quality below the QualityFloorContract.

---

# 516. Assumption and decision invalidation cascade

When an assumption becomes `REFUTED` or `EXPIRED`, the system SHOULD traverse affected decisions.

```text
assumption
→ decision
→ research conclusion
→ requirement
→ plan task
→ implementation artifact
→ verification evidence
→ completion claim
```

Possible impact:

```text
NO_EFFECT
REFRESH_EVIDENCE
REPLAN
REIMPLEMENT
REVERIFY
REOPEN_GOAL
```

Only affected downstream work should reopen.

This composes with R3.9 ResearchInvalidationCascade and R3.13 CompletionFinalityBarrier.

---

# 517. NegativeConstraintVerification

Mandatory prohibitions/limits SHOULD have verification strategies.

Examples:

```text
"must not create second scheduler"
→ architecture/static dependency inspection

"must not send secrets externally"
→ egress/secret-leak tests

"must not require manual continue after recoverable wait"
→ unattended continuation test

"must not mutate canonical source from stale worker"
→ fencing negative test

"must not install external project"
→ dependency/repository manifest inspection
```

A negative constraint without any feasible verification SHOULD be marked accordingly rather than assumed satisfied.

---

# 518. Operational survivability profile

Long-running unattended goals SHOULD declare the survivability conditions expected for their class.

```yaml
OperationalSurvivabilityProfile:
  survives_chat_disconnect: boolean
  survives_browser_close: boolean
  survives_controller_restart: boolean
  survives_worker_restart: boolean
  survives_provider_retryable_outage: boolean
  survives_network_partition_without_split_brain: boolean
  survives_rolling_upgrade: boolean
  max_expected_uncheckpointed_loss_ref: ref|null
  evidence_refs: [ref]
```

The profile describes expected behavior and evidence.

It MUST NOT claim guarantees stronger than the underlying canonical infrastructure can provide.

---

# 519. R3.14 additional acceptance tests

Implementation MUST prove at least:

1. a user-explicit outcome cannot silently disappear between goal and plan;
2. an assistant-proposed enhancement does not become mandatory solely by being copied into a later spec revision;
3. a non-goal cannot silently become required implementation work;
4. a mandatory prohibition can block completion when violated;
5. high-consequence unvalidated assumption cannot cross an irreversible commit point unnoticed;
6. repeated agreement by agents does not change assumption status to confirmed;
7. decision debt reaches its mandatory resolution boundary and reopens/validates automatically;
8. optional optimization does not keep an otherwise completed approved goal open forever;
9. mandatory requirement cannot be downgraded to optional by MaterialGapPolicy;
10. shared schema mutation detects concurrent dependent goal impact before commit;
11. isolated branch tests do not prove compatibility after another goal mutates shared dependency;
12. disconnected stale controller/worker cannot perform canonical write during partition;
13. isolated checkpoint work can be reconciled after connectivity returns when policy permits;
14. controller/runner protocol mismatch is detected before dispatch/mutation;
15. rolling upgrade can route work to compatible runtime without losing durable goal state;
16. required feature cannot silently disappear during compatibility downgrade;
17. integrity audit detects impossible parent/child state mismatch;
18. missing/duplicate conflicting event produces repair/conflict state instead of fabricated clean state;
19. replay does not re-execute external side effects;
20. worker-kill recovery drill proves checkpoint/resume on supported class;
21. lost callback drill proves reconciliation path;
22. expired lease drill proves takeover/fencing behavior;
23. critical recovery claim cannot be production-certified solely from prose/spec claim;
24. emergency brake can fence new writes from a compromised child;
25. contained child cannot reactivate itself through stale resume continuation;
26. temporary credentials/bindings can be revoked during active containment;
27. contaminated artifacts can be quarantined without deleting investigation evidence;
28. degraded mode can preserve safe reads/analysis while canonical writes are unavailable;
29. degraded mode does not silently lower mandatory quality floor;
30. refuted assumption reopens only affected downstream decisions/artifacts;
31. negative constraint "no secret egress" has executable/inspectable verification;
32. negative constraint "no second scheduler" is architecture-verifiable;
33. operational survivability profile does not overclaim unsupported RPO/RTO-like behavior;
34. controller restart survivability evidence can be linked to a real drill/test;
35. network partition survivability prevents split-brain mutation;
36. runtime version skew survives supported rolling-upgrade matrix;
37. MaterialGapPolicy can send future enhancement to backlog without hiding current limitation;
38. GoalInvariantLedger remains stable across replanning while allowed implementation details change;
39. finality barrier verifies mandatory negative constraints and unresolved high-impact assumptions;
40. R3.14 introduces no second spec store, scheduler, policy engine, evidence authority, resource manager or deployment control plane.

---

# 520. R3.14 sixteen-pass hardening review

| Pass | Lens | Gap found | R3.14 resolution |
|---:|---|---|---|
| 1 | Semantic drift | Repeated research/spec/plan rewrites could preserve syntax while changing the user's goal | Added GoalInvariantLedger + SemanticPreservationCheck |
| 2 | Requirement authority | Later assistant-generated requirements could look equal to explicit user requirements | Added RequirementProvenance |
| 3 | Negative space | Positive requirement coverage did not fully verify non-goals/prohibitions | Added ConstraintCoverageGraph + NegativeConstraintVerification |
| 4 | Hidden assumptions | Assumptions existed in prose but lacked lifecycle/impact tracking | Added AssumptionLedger |
| 5 | Temporary uncertainty | Reversible temporary decisions could become permanent forgotten architecture | Added DecisionDebt |
| 6 | Endless hardening | Every new review idea could become new completion debt | Added MaterialGapPolicy |
| 7 | Shared blast radius | Per-goal correctness could still break other active/deployed consumers | Added ChangeImpactGraph / BlastRadiusGate |
| 8 | Shared mutation race | Different goals could mutate the same schema/module from different baselines | Added shared-resource collision reconciliation |
| 9 | Network partition | Leases/fencing existed but partition behavior was not explicit enough | Added ControlPlanePartitionPolicy |
| 10 | Runtime version skew | Manifest capability negotiation did not cover live controller/runner/harness execution protocol skew | Added RuntimeCompatibilityEnvelope |
| 11 | Logical state corruption | Backup/restore existed but inconsistent event/state relationships lacked a first-class audit/repair contract | Added CanonicalStateIntegrityAudit + replay semantics |
| 12 | Recovery proof | Recovery was richly specified but not systematically required to be exercised | Added RecoveryDrill/FaultInjectionPolicy + RecoveryClaimEvidence |
| 13 | Active compromise | Release quarantine existed, but compromised running agent/tool required immediate scoped containment | Added ActiveExecutionContainment |
| 14 | Partial outage | Retry/fallback existed, but system-wide degraded/read-only behavior was under-specified | Added DegradedModePolicy |
| 15 | Invalidation propagation | Research invalidation existed, but general assumption/decision invalidation across implementation needed one bridge | Added assumption/decision invalidation cascade |
| 16 | Survivability truth | “Unattended” could be assumed to survive every infrastructure failure without class-specific proof | Added OperationalSurvivabilityProfile |

All identified gaps were incorporated into R3.14.

---

# 521. R3.14 Definition of Done extension

R3.14 is not complete until:

- goal meaning and explicit/non-goal boundaries survive research, specification, planning, implementation and verification transformations;
- material requirements retain source authority/provenance;
- assumptions and temporary decision debt are visible, bounded and invalidatable;
- optional hardening does not silently grow approved scope forever;
- shared mutation blast radius and concurrent-goal collision are checked before material commits;
- network partition cannot produce split-brain canonical mutation;
- controller/runner/harness rolling-version skew is negotiated explicitly;
- durable state integrity can be audited and repaired without fabricating certainty;
- key recovery claims are exercised through safe fault/drill evidence appropriate to their risk;
- active compromised/runaway execution can be contained independently from the child itself;
- partial outages can enter truthful degraded/read-only modes rather than either lying or stopping everything;
- refuted/expired assumptions propagate only to affected downstream work;
- mandatory negative constraints are verified along with positive requirements;
- unattended survivability claims are evidence-backed and bounded by actual infrastructure;
- final completion means not only that the system reached the end of a workflow, but that it **preserved the user's intended outcome and boundaries while surviving the failure conditions it claims to handle**.

---

# 522. R3.15 Completion truth after delivery

R3.15 closes a critical class of false-completion failure:

> **The system may finish building and deploying correctly while the real goal is not yet proven successful.**

Examples:

- deployment API returns success, but async jobs fail 20 minutes later;
- smoke test passes, but production queue backs up under real load;
- all tests pass, but the tests do not cover the user-critical scenario;
- three agents agree because all three relied on the same source/model family;
- rollout looks healthy only because telemetry is missing;
- the implementation budget is exhausted before final verification/recovery;
- a marketing/product change is delivered, but the intended business outcome needs days/weeks of observation.

R3.15 therefore distinguishes **delivery**, **stabilization**, **verified completion**, and **outcome observation**.

---

# 523. FinalResultClass

A goal/result SHOULD expose one of the following result classes when useful:

```text
DELIVERED
  requested artifact/system/change exists in the intended target

STABILIZING
  delivery exists, but delayed/production health evidence is still being observed

VERIFIED_COMPLETE
  technical/acceptance CompletionContract is satisfied with current stable evidence

OUTCOME_MONITORING
  technical delivery is complete; longer-horizon business/behavioral outcome is still being measured

OUTCOME_OBSERVED
  specified outcome metric/observation contract has enough evidence to classify result
```

Rules:

- `DELIVERED` MUST NOT be described as `VERIFIED_COMPLETE` merely because deployment succeeded;
- `VERIFIED_COMPLETE` MUST NOT imply a business metric changed because of the implementation unless attribution is supported;
- `OUTCOME_MONITORING` MAY continue after the development/build goal is technically complete;
- a user asking “is it deployed?” may be satisfied by `DELIVERED`;
- a user asking “did it solve the problem?” may require `VERIFIED_COMPLETE` or `OUTCOME_OBSERVED`, depending on the goal.

This avoids keeping every long-horizon business goal permanently “unfinished” while still preserving truth.

---

# 524. StabilizationWindow and DelayedFailureBarrier

Some failures only appear after time passes.

A production-impacting delivery SHOULD support a stabilization contract when relevant.

```yaml
StabilizationWindow:
  delivery_ref: ref
  start_at: timestamp
  minimum_observation_duration: duration|null
  required_signal_refs: [ref]
  delayed_job_refs: [ref]
  queue_drain_conditions: [ref]
  acceptable_health_threshold_refs: [ref]
  rollback_asset_ref: ref|null
  state:
    OBSERVING|
    HEALTHY|
    DEGRADED|
    FAILED|
    INCONCLUSIVE
```

The `DelayedFailureBarrier` SHOULD ensure that required delayed evidence is reconciled before the strongest completion class is emitted.

Examples:

```text
deploy succeeds
→ wait for canary observation
→ confirm async migration/backfill jobs
→ confirm queue/worker health
→ confirm error/latency thresholds
→ then VERIFIED_COMPLETE
```

A stabilization window MUST be risk-based; trivial local/non-production tasks do not need ceremonial waiting.

---

# 525. ObservabilitySufficiencyGate

A health claim is only as strong as the visibility behind it.

Before declaring health/stability, SmartAIHub SHOULD verify that required signals are:

```text
available
fresh
correctly scoped
not known-broken
not silently sampled below required confidence
not blocked by permission/telemetry outage
```

Suggested state:

```text
OBSERVABILITY_SUFFICIENT
OBSERVABILITY_PARTIAL
OBSERVABILITY_UNAVAILABLE
OBSERVABILITY_CONFLICTING
```

If required telemetry is unavailable:

```text
do not say "healthy"
→ say "health cannot yet be proven"
→ attempt alternate signals/manual synthetic checks/other authoritative evidence
→ repair observability when AI-actionable
→ continue monitoring/reverification
```

Missing telemetry is not the same as zero errors.

---

# 526. VerificationOracleProfile

Passing tests do not prove much when the oracle is weak.

For material verification, SmartAIHub SHOULD track evidence/oracle quality.

```yaml
VerificationOracleProfile:
  verification_ref: ref
  requirement_refs: [ref]

  oracle_types:
    - DETERMINISTIC_ASSERTION
    - CONTRACT_TEST
    - PROPERTY_TEST
    - DIFFERENTIAL_TEST
    - GOLDEN_REFERENCE
    - INTEGRATION_TEST
    - END_TO_END
    - SECURITY_NEGATIVE_TEST
    - MANUAL_OR_SUBJECTIVE_ACCEPTANCE
    - OBSERVATIONAL_HEALTH

  coverage_confidence: LOW|MEDIUM|HIGH
  known_blind_spots: [string]
  evidence_independence_ref: ref|null
  representative_scenario_ref: ref|null
```

The exact test technique is domain-specific.

The system SHOULD ask internally:

```text
Could this implementation be wrong while all current tests still pass?
What important behavior has no strong oracle?
Are we testing implementation details rather than user-visible invariants?
```

A large pass count does not automatically imply high verification confidence.

---

# 527. RepresentativeScenarioPortfolio

Verification/UAT SHOULD cover representative conditions, not only convenient fixtures.

Possible scenario dimensions include:

```text
happy path
boundary/edge input
error/retry path
empty/large data
mobile/tablet/desktop
slow/unreliable network
different tenant/project scopes
authorization denied/expired
locale/timezone/language
concurrent requests
realistic load
provider outage/fallback
upgrade/migration compatibility
accessibility interaction
```

```yaml
RepresentativeScenarioPortfolio:
  goal_ref: ref
  scenario_refs: [ref]
  selection_rationale: string
  uncovered_material_dimensions: [string]
  risk_acceptance_ref: ref|null
```

The portfolio SHOULD be risk-based rather than requiring every dimension for every task.

---

# 528. EvidenceIndependenceGraph

R3.6 already rejects simple majority vote among correlated models. R3.15 makes correlation explicit.

Evidence/agent outputs MAY share hidden common causes:

```text
same source article
same provider search index
same model family
same prompt/context
same benchmark fixture
same generated test oracle
same underlying API
```

A lightweight `EvidenceIndependenceGraph` SHOULD identify material correlation.

Possible classifications:

```text
INDEPENDENT
PARTIALLY_CORRELATED
HIGHLY_CORRELATED
UNKNOWN
```

Rules:

- three agents citing the same primary source count as one source for factual independence;
- multiple models trained/served through correlated provider behavior MAY still add useful perspective, but not independent proof;
- quorum confidence SHOULD discount correlated evidence;
- deterministic independent runtime/test evidence can outweigh model consensus.

---

# 529. EvidenceAuthenticityReceipt

Model narration such as:

> “All 42 tests passed.”

is not sufficient verification evidence by itself.

Material verification SHOULD reference trusted receipts from the system that actually executed/observed the check.

```yaml
EvidenceAuthenticityReceipt:
  evidence_ref: ref
  producer_kind:
    TEST_RUNNER|
    BUILD_SYSTEM|
    DEPLOYMENT_PLATFORM|
    PROVIDER_API|
    OBSERVABILITY_SYSTEM|
    GIT|
    HUMAN_ATTESTATION|
    OTHER_TRUSTED_ADAPTER
  producer_ref: ref
  artifact_or_source_generation_ref: ref
  command_or_check_ref: ref|null
  result_digest: string|null
  observed_at: timestamp
  trust_class: string
```

A harness may summarize the receipt, but cannot manufacture the receipt by prose.

Where no trusted adapter exists, evidence quality SHALL be marked weaker rather than fabricated.

---

# 530. RecoveryAssetRetentionLease

Rollback/recovery can fail if the assets needed for recovery are garbage-collected too early.

Recovery-critical assets MAY include:

```text
last-known-good release
container/image/artifact
database backup/snapshot
migration rollback/forward script
checkpoint
source revision
provider configuration snapshot
temporary rescue branch
```

A `RecoveryAssetRetentionLease` SHOULD keep necessary assets available through:

```text
deployment
stabilization window
rollback window
required incident/reconciliation period
```

GC/retention policy MUST NOT delete an asset still referenced by an active recovery lease.

After the recovery window closes, normal retention/GC policy resumes.

---

# 531. RetryBudget, backpressure and bulkheads

Autonomous retry can become a system-wide failure amplifier.

Each retryable operation class SHOULD have bounded retry semantics.

```yaml
RetryBudget:
  scope_ref: ref
  max_attempts: integer|null
  max_retry_cost_ref: ref|null
  max_retry_rate: number|null
  backoff_policy_ref: ref
  jitter_enabled: boolean
  circuit_breaker_ref: ref|null
```

Under overload/outage:

```text
do not let every goal wake/retry simultaneously
→ apply backoff + jitter
→ respect provider Retry-After
→ bulkhead per provider/runtime/tenant class where appropriate
→ shed/defer optional speculative work first
→ preserve critical accepted work
```

The system SHOULD prevent:

- thundering herd after provider recovery;
- retry storms after transient outage;
- one failing provider consuming all worker slots;
- speculative fanout multiplying outage load.

Retry budgets compose with ConvergencePolicy; neither replaces the other.

---

# 532. CompletionBudgetReserve

An autonomous goal SHOULD avoid consuming its entire budget before verification/recovery.

A budget MAY reserve portions for:

```text
implementation
verification/UAT
recovery/retry
final reconciliation
contingency
```

```yaml
CompletionBudgetReserve:
  goal_ref: ref
  total_budget_ref: ref
  protected_reserves:
    verification: ref|null
    recovery: ref|null
    final_reconciliation: ref|null
```

Rules:

- implementation SHOULD NOT consume protected verification reserve without reforecast/policy authorization;
- speculative research/fanout SHOULD yield before consuming recovery reserve;
- if reserve is no longer needed, it may be released;
- if mandatory verification cannot be funded, the goal is not allowed to claim verified completion.

This reduces the pattern:

```text
build everything
→ budget exhausted
→ cannot test
→ ask user for more money
```

when better budgeting could have avoided it.

---

# 533. SuccessMetricContract

Some goals specify a measurable real-world outcome.

```yaml
SuccessMetricContract:
  goal_ref: ref
  baseline_window_ref: ref|null
  target_metric_refs: [ref]
  target_thresholds: [ref]
  guardrail_metric_refs: [ref]
  observation_window_ref: ref|null
  minimum_sample_ref: ref|null
  attribution_mode:
    DESCRIPTIVE|
    EXPERIMENTAL|
    CAUSAL_EVIDENCE_REQUIRED|
    NOT_APPLICABLE
  decision_rule_ref: ref
```

Examples:

```text
reduce task latency
reduce cost per completed job
increase successful completion rate
increase conversion
reduce manual user interruptions
```

The metric contract SHOULD distinguish:

```text
technical metric
product behavior metric
business metric
```

A technical deployment cannot honestly claim a business outcome before the observation contract allows it.

---

# 534. GoodhartGuard and metric gaming

Optimizing one metric can damage the actual goal.

Example:

```text
goal: reduce user interruptions

bad optimization:
never ask the user anything
→ wrong high-impact decisions increase
```

Every success metric SHOULD be evaluated against relevant guardrails:

```text
quality
safety
correctness
user satisfaction
cost
latency
reliability
policy/compliance
```

The system MUST NOT mark an outcome successful when the target metric improves by violating a mandatory guardrail.

When metric optimization materially diverges from GoalInvariantLedger, the invariant wins.

---

# 535. Attribution honesty

Observed improvement after deployment does not automatically prove causation.

Result language SHOULD distinguish:

```text
OBSERVED_ASSOCIATION
EXPERIMENTALLY_SUPPORTED_EFFECT
CAUSAL_CLAIM_SUPPORTED
ATTRIBUTION_UNKNOWN
```

For example:

```text
"conversion increased 8% after deployment"
```

is different from:

```text
"the deployment caused an 8% increase"
```

unless experiment/design evidence supports that claim.

SmartAIHub SHOULD prefer honest uncertainty over fabricated business attribution.

---

# 536. PostDeliveryWatcher

Long-horizon outcome monitoring SHOULD NOT keep the development session/job artificially open forever.

When technical work is `VERIFIED_COMPLETE` but outcome observation continues:

```text
development/build goal
→ complete
→ create/bind durable PostDeliveryWatcher
→ monitor SuccessMetricContract
→ notify/propose correction only when material
```

The watcher SHOULD reuse canonical monitoring/scheduling/automation systems rather than create a second monitoring backend.

Possible watcher outcomes:

```text
OUTCOME_TARGET_MET
OUTCOME_TARGET_NOT_MET
INCONCLUSIVE
GUARDRAIL_BREACH
OBSERVATION_CONTINUES
```

If the outcome misses target, SmartAIHub MAY create a new corrective goal/proposal rather than rewriting history to say the original delivery never happened.

---

# 537. ConfidenceCalibration and UnknownCoverage

Even strong verification has limits.

A final report MAY state:

```text
Verification confidence: HIGH
Known blind spots:
- real-world peak load above tested range
- provider behavior outside observed region
```

This is not an invitation to dump uncertainty on the user.

The purpose is to prevent:

```text
all observed checks passed
→ therefore every possible failure is impossible
```

`UnknownCoverage` SHOULD become user-visible only when it is decision-relevant.

For unattended work, the system should still fix/expand verification automatically when the blind spot is AI-actionable and material.

---

# 538. Completion semantics with stabilization/outcome observation

Suggested technical lifecycle:

```text
IMPLEMENTED
→ DELIVERED
→ STABILIZING
→ VERIFIED_COMPLETE
```

Optional longer-horizon outcome lifecycle:

```text
VERIFIED_COMPLETE
→ OUTCOME_MONITORING
→ OUTCOME_OBSERVED
```

These states MUST NOT force all products to use the longest lifecycle.

Examples:

```text
generate a Markdown spec
→ VERIFIED_COMPLETE may be immediate after validation

deploy a worker with async jobs
→ stabilization window likely useful

launch a conversion improvement
→ technical completion + post-delivery outcome monitoring
```

---

# 539. R3.15 additional acceptance tests

Implementation MUST prove at least:

1. deployment success alone does not automatically produce VERIFIED_COMPLETE when stabilization is required;
2. delayed async failure during stabilization can reopen repair work automatically;
3. stabilization window does not unnecessarily delay low-risk local artifact completion;
4. missing required telemetry prevents a false "healthy" claim;
5. observability outage can use alternate authoritative checks when available;
6. observability absence is not interpreted as zero errors;
7. 100 passing weak unit tests do not automatically imply high coverage confidence;
8. VerificationOracleProfile can identify a material requirement with a weak/no oracle;
9. representative scenario selection includes risk-relevant non-happy paths;
10. uncovered material scenario dimension is surfaced/repaired or explicitly accepted;
11. three agents using the same source are not counted as three independent confirmations;
12. evidence quorum discounts highly correlated model/source paths;
13. model prose cannot fabricate a trusted test receipt;
14. trusted test/build/deploy receipt binds to the exact source/artifact generation;
15. rollback artifact remains retained through active stabilization/recovery window;
16. GC cannot remove an active recovery-lease asset;
17. retry storm is rate-limited/backed off with jitter;
18. provider Retry-After is respected across many waiting goals;
19. optional speculative work is shed before critical accepted work under outage pressure;
20. one failing provider does not consume all worker capacity;
21. verification reserve cannot be silently consumed by implementation fanout;
22. goal cannot claim VERIFIED_COMPLETE when mandatory verification is unfunded/unrun;
23. unused reserve can be released after finality;
24. SuccessMetricContract freezes/records a usable baseline where applicable;
25. improved target metric with guardrail regression is not classified as successful outcome;
26. GoalInvariantLedger outranks gamed metric optimization;
27. observed business improvement is not described as causal without supporting attribution design;
28. verified technical delivery can complete while PostDeliveryWatcher continues outcome monitoring;
29. watcher outcome can create a corrective goal without rewriting prior delivery history;
30. technical-only task does not require business-outcome watcher;
31. final user report distinguishes DELIVERED/STABILIZING/VERIFIED_COMPLETE when materially relevant;
32. known blind spots are not dumped as noise when immaterial;
33. material unknown coverage can trigger additional automatic verification;
34. post-deploy health evidence is bound to the deployed revision/binding set;
35. late health degradation can transition STABILIZING to repair/recovery;
36. outcome monitoring uses canonical monitoring/scheduling authority rather than creating a second backend;
37. SuccessMetricContract can include cost and interruption reduction, not only revenue/conversion;
38. completion certificate references required stabilization/observability evidence where applicable;
39. finality cannot rely on telemetry known stale beyond its required freshness;
40. R3.15 introduces no second monitoring backend, test runner, metrics store, billing ledger or deployment authority.

---

# 540. R3.15 sixteen-pass hardening review

| Pass | Lens | Gap found | R3.15 resolution |
|---:|---|---|---|
| 1 | Delivery vs goal outcome | Technical delivery could be confused with proven user/business outcome | Added FinalResultClass + SuccessMetricContract |
| 2 | Delayed production failure | Smoke/deploy success could precede async/queue/runtime failure | Added StabilizationWindow + DelayedFailureBarrier |
| 3 | Observability blind spot | Missing telemetry could look like health | Added ObservabilitySufficiencyGate |
| 4 | Weak test oracle | High pass count could hide poor verification power | Added VerificationOracleProfile |
| 5 | Scenario representativeness | Tests could cover only convenient fixtures | Added RepresentativeScenarioPortfolio |
| 6 | Correlated consensus | Multiple agents/sources could share the same evidence/model failure | Added EvidenceIndependenceGraph |
| 7 | Evidence authenticity | Harness prose could overstate tests/benchmarks without trusted execution receipt | Added EvidenceAuthenticityReceipt |
| 8 | Recovery asset expiry | Rollback/checkpoint assets could be GC'd before delayed failure appears | Added RecoveryAssetRetentionLease |
| 9 | Retry amplification | Autonomous recovery could cause retry storms/thundering herd | Added RetryBudget/backpressure/bulkhead semantics |
| 10 | Budget exhaustion before proof | Implementation/speculation could consume funds needed for mandatory verification | Added CompletionBudgetReserve |
| 11 | Metric definition | Outcome success could be vague or measured against moving baseline | Added SuccessMetricContract |
| 12 | Goodhart/metric gaming | Optimizing one KPI could violate actual goal/quality guardrails | Added GoodhartGuard |
| 13 | Attribution | Post-deploy improvement could be falsely claimed as caused by the change | Added attribution honesty classes |
| 14 | Long-horizon monitoring | Business outcome observation could keep development goal open indefinitely | Added PostDeliveryWatcher handoff |
| 15 | Overconfidence | Passing observed checks could be phrased as exhaustive certainty | Added ConfidenceCalibration/UnknownCoverage |
| 16 | Completion vocabulary | "Done" lacked enough distinction between delivered, stabilizing, verified and outcome-observed states | Added explicit lifecycle classes |

All identified gaps were incorporated into R3.15.

---

# 541. R3.15 Definition of Done extension

R3.15 is not complete until:

- technical delivery, stabilization, verified completion and longer-horizon outcome observation are represented honestly;
- delayed failures can surface before strong finality claims where risk requires an observation window;
- health claims are impossible when required observability is missing/stale without explicit degraded truth;
- verification quality considers oracle strength and representative scenarios, not only pass count;
- correlated agents/sources do not inflate evidence confidence;
- material test/build/deploy claims bind to trusted execution receipts;
- rollback/recovery assets survive the period in which they may still be needed;
- autonomous retries cannot create system-wide retry storms;
- verification/recovery budget remains available through finality;
- success metrics include guardrails and cannot be gamed against the user's real goal;
- business/outcome attribution remains evidence-honest;
- long-horizon outcome monitoring can continue after technical completion without forcing user babysitting;
- final reports calibrate confidence and material blind spots without overwhelming the user;
- the user receives the strongest completion claim that the available evidence actually supports—no weaker, and no stronger.

---

# 542. R3.16 Multi-principal autonomy and learning integrity decision

R3.16 hardens SmartAIHub for projects where:

- more than one authorized human can issue instructions;
- many goals execute concurrently;
- nested subagents consume shared budgets;
- the system learns from repeated work;
- external capabilities drift over time;
- notifications/attention requests can fail in transit.

The core principle is:

> **Autonomy must preserve who is authorized to decide, what scope their decision applies to, how much total authority/spend is inherited by children, and what evidence is allowed to become long-term learning.**

Spec 269 does not become the canonical authorization, memory, capability, billing, scheduler or notification backend. It consumes those authorities and defines orchestration behavior.

---

# 543. MultiPrincipalInstructionResolver

A team/project/tenant MAY have multiple authorized principals.

Examples:

```text
product owner
project owner
developer
tenant admin
finance approver
security approver
collaborator
external client
```

Spec 220 or the current canonical authorization system remains authoritative for **who may perform which class of action**.

Spec 269 SHALL resolve how multiple valid instructions interact operationally.

Possible instruction relations:

```text
COMPATIBLE
MORE_SPECIFIC
SUPERSEDES
CONFLICTS
INDEPENDENT
OUT_OF_SCOPE
UNAUTHORIZED
```

The resolver SHOULD consider:

```text
principal authorization
goal/task ownership
scope specificity
instruction generation/time ordering
explicit decision authority
project/tenant policy
fixed user decisions / GoalInvariantLedger
```

It MUST NOT resolve a material conflict merely by:

- whichever message arrived last;
- majority vote;
- higher organizational title without relevant authority;
- whichever agent saw the instruction first.

---

# 544. AuthorityWeightedInstructionEnvelope

A material instruction SHOULD be normalized to an envelope such as:

```yaml
AuthorityWeightedInstructionEnvelope:
  instruction_ref: ref
  principal_ref: ref
  authorization_ref: ref

  scope:
    tenant_ref: ref|null
    project_ref: ref|null
    goal_ref: ref|null
    task_ref: ref|null

  command_class:
    OBJECTIVE|
    REQUIREMENT|
    PRIORITY|
    BUDGET|
    DEPLOY|
    CANCEL|
    APPROVE|
    SECURITY|
    PREFERENCE|
    INFORMATION

  instruction_generation: integer
  source_timestamp: timestamp
  effective_from: timestamp|null
  expires_at: timestamp|null

  authority_class: string
  supersedes_refs: [ref]
```

The envelope is not an auth grant. `authorization_ref` must resolve through the canonical authorization system at use time.

---

# 545. Multi-principal conflict behavior

When two authorized instructions materially conflict:

```text
detect conflict
→ freeze only the affected decision/commit surface
→ continue independent safe work
→ search existing GoalInvariantLedger / approved decision records / policy for resolution
→ apply deterministic authority/scope rule if available
→ otherwise create one compact human decision request to the correct decision owner
→ auto-resume after resolution
```

Example:

```text
Product owner:
"ship feature this week"

Security approver:
"production deployment is denied until finding X is fixed"
```

The system may continue fixing/testing, but production commit remains blocked by the applicable security authority.

The conflict MUST NOT freeze unrelated goals.

---

# 546. GoalPortfolioConflictGraph

Two goals can conflict even when they edit different files.

Examples:

```text
Goal A: minimize recurring cost
Goal B: adopt premium always-on provider everywhere

Goal C: freeze API contract for partner release
Goal D: redesign same external contract

Goal E: delete dataset after project completion
Goal F: continue long-term training/monitoring on that dataset
```

SmartAIHub SHOULD project active materially related goals into a `GoalPortfolioConflictGraph`.

Conflict types MAY include:

```text
OBJECTIVE_CONFLICT
CONSTRAINT_CONFLICT
RESOURCE_CONFLICT
SCHEDULE_CONFLICT
DATA_LIFECYCLE_CONFLICT
RELEASE_CONFLICT
POLICY_CONFLICT
```

Resolution SHOULD prefer:

```text
compatible synthesis
goal sequencing
scope split
shared decision update
explicit supersession
policy-required outcome
```

Only material unresolved conflicts require human attention.

This graph is a planning/orchestration projection, not a second project database.

---

# 547. HierarchicalDelegationBudget

A child/subagent MUST inherit budget from a parent envelope; it cannot mint new spend authority by delegation.

```yaml
HierarchicalDelegationBudget:
  goal_ref: ref
  parent_budget_ref: ref|null
  total_authorized_ref: ref

  reserved_for_direct_work_ref: ref|null
  reserved_for_children_ref: ref|null
  verification_reserve_ref: ref|null
  recovery_reserve_ref: ref|null

  active_child_reservation_refs: [ref]
  actual_usage_ref: ref
```

Invariant:

```text
sum(active child reservations)
+ parent direct reservation
+ protected reserves
<= current authorized goal envelope
```

unless the canonical economic authority explicitly extends it.

Nested delegation:

```text
parent
→ child A
   → grandchild A1/A2
```

MUST remain inside A's inherited sub-envelope and therefore inside the root goal envelope.

---

# 548. Delegation amplification guard

Before fanout expansion, the planner SHOULD evaluate aggregate impact:

```text
number of descendants
reserved spend
expected actual spend
worker/container slots
provider concurrency
context/token use
recovery reserve
verification reserve
```

A child MAY propose more fanout but cannot authorize it beyond inherited limits.

When aggregate pressure rises:

```text
reduce speculative fanout
cancel low-value candidates
reuse existing evidence/work
serialize noncritical branches
move to cheaper compatible route
```

before requesting additional budget.

This complements R3.6 dynamic fanout and R3.15 CompletionBudgetReserve.

---

# 549. LearningWriteGate

Execution output SHALL NOT automatically become long-term memory/learning.

Before emitting a learning candidate to Spec 268, SmartAIHub SHOULD classify the source:

```text
USER_EXPLICIT_PREFERENCE
USER_CONFIRMED_DECISION
REPEATED_OBSERVED_PATTERN
VERIFIED_SUCCESSFUL_PROCEDURE
FAILED_ATTEMPT
SPECULATIVE_CANDIDATE
AUTONOMOUS_DEFAULT
MODEL_INFERENCE
```

Suggested learning eligibility:

```text
USER_EXPLICIT_PREFERENCE
→ eligible, scoped

USER_CONFIRMED_DECISION
→ eligible, scoped and versioned

REPEATED_OBSERVED_PATTERN
→ eligible with confidence/decay

VERIFIED_SUCCESSFUL_PROCEDURE
→ candidate procedural learning

FAILED_ATTEMPT
→ may become negative procedural evidence,
  NOT a user preference/fact

SPECULATIVE_CANDIDATE
→ not durable preference/fact

AUTONOMOUS_DEFAULT
→ not user preference unless later confirmed

MODEL_INFERENCE
→ hypothesis only unless validated
```

Spec 268 remains the canonical memory authority.

---

# 550. LearningCandidateReceipt

A learning proposal SHOULD include provenance.

```yaml
LearningCandidateReceipt:
  candidate_ref: ref
  proposed_memory_scope:
    PERSONAL|PROJECT|TEAM|TENANT|PROCEDURAL

  learning_kind:
    PREFERENCE|
    DECISION|
    PROCEDURE|
    NEGATIVE_PROCEDURE|
    WORKING_PATTERN|
    FACT_HYPOTHESIS

  source_refs: [ref]
  evidence_refs: [ref]
  originating_goal_ref: ref
  verification_state: string
  confidence: number|null
  expiry_or_decay_policy_ref: ref|null
  privacy_purpose_ref: ref
```

The candidate does not become durable memory merely because Spec 269 emitted it.

---

# 551. ScopedLearningPolicy

Learning MUST respect scope boundaries.

Examples:

```text
one user's UI preference
≠ team preference

project-specific provider choice
≠ personal permanent preference

tenant security decision
≠ another tenant's procedural rule

failed experiment
≠ global "never use this technique"
```

Cross-scope promotion requires explicit canonical memory policy/evidence.

Shared procedural lessons SHOULD remove private/customer-specific content before broader reuse.

---

# 552. DefaultDecisionReceipt

Autonomous systems often need to choose reasonable defaults.

A default choice SHOULD remain distinguishable from an explicit user preference.

```yaml
DefaultDecisionReceipt:
  decision_ref: ref
  goal_ref: ref
  choice: string
  basis:
    PLATFORM_DEFAULT|
    PROJECT_POLICY|
    PRIOR_SCOPED_PREFERENCE|
    COST_OPTIMIZATION|
    SAFEST_REVERSIBLE_OPTION|
    BEST_EVIDENCE
  reversibility: LOW|MEDIUM|HIGH
  user_confirmation_required: boolean
  expires_or_reconsider_at: timestamp|null
  learning_eligible: boolean
```

Rules:

- using a default does not imply “the user prefers this”;
- reversible defaults may proceed under autonomy;
- material defaults must respect decision authority;
- final report SHOULD mention only materially relevant defaults;
- repeated autonomous defaults MUST NOT train the system into a fake user preference without suitable evidence.

---

# 553. CapabilityHealthSnapshot

Capability presence in a registry does not prove current executability.

Before dispatching material work, SmartAIHub SHOULD consume a current health/certification snapshot from Spec 256 / provider adapters / canonical capability runtime.

```yaml
CapabilityHealthSnapshot:
  capability_ref: ref
  contract_version_ref: ref
  provider_runtime_ref: ref|null

  state:
    HEALTHY|
    DEGRADED|
    RATE_LIMITED|
    AUTH_REQUIRED|
    DEPRECATED|
    QUARANTINED|
    UNKNOWN

  last_verified_at: timestamp|null
  health_evidence_refs: [ref]
  known_limitations: [string]
  retry_or_refresh_ref: ref|null
```

Spec 269 does not own the capability registry.

It uses the snapshot to choose/retry/reroute.

---

# 554. CapabilityContractDrift

External APIs/tools/models can change behavior without a clean version bump.

Potential signals:

```text
schema mismatch
new required field
removed response field
behavioral canary failure
authentication behavior change
latency/cost class shift
model/tool quality regression
provider endpoint migration
unexpected side-effect semantics
```

On suspected drift:

```text
quarantine affected adapter/capability path where needed
→ refresh capability metadata
→ run compatibility canary
→ use alternate authorized provider/runtime
→ migrate active waits/queued work where safe
→ reverify affected result
```

Do not repeatedly retry a contract that is structurally incompatible.

---

# 555. ProviderDeprecationMigrationPolicy

Long-running goals/workflows/watchers may outlive a provider/model/tool.

When a dependency becomes:

```text
DEPRECATED
SUNSET_SCHEDULED
REMOVED
MATERIALLY_DEGRADED
```

the system SHOULD:

```text
identify affected active/durable work
→ find compatible replacement through capability resolver
→ compare quality/cost/privacy/region/license/authority
→ migrate checkpoint/config where possible
→ run targeted verification/canary
→ switch
```

If no compatible replacement exists, affected work becomes a true dependency problem, not silent failure.

A provider deprecation notice SHOULD NOT require the user to manually find every workflow using it.

---

# 556. NotificationDeliveryReceipt

A completed goal remains complete even if a notification transport fails.

However, the system SHOULD know whether important communication was delivered.

```yaml
NotificationDeliveryReceipt:
  notification_ref: ref
  goal_ref: ref|null
  attention_item_ref: ref|null

  purpose:
    COMPLETION|
    HUMAN_ACTION_REQUIRED|
    MATERIAL_FAILURE|
    USER_DEFINED_EVENT

  channel_ref: ref
  state:
    QUEUED|
    SENT|
    DELIVERED|
    FAILED_RETRYABLE|
    FAILED_FINAL|
    UNKNOWN

  attempt_count: integer
  next_retry_at: timestamp|null
  evidence_refs: [ref]
```

The receipt uses the canonical notification/messaging subsystem if available; Spec 269 does not create another one.

---

# 557. AttentionDeliveryPolicy

For `HUMAN_ACTION_REQUIRED`:

```text
create durable Attention Inbox item first
→ attempt preferred authorized notification channel
→ retry transport failures with backoff
→ optionally use authorized fallback channel
→ preserve item for next app open
```

The work remains durably waiting with auto-resume semantics.

A failed push/email notification MUST NOT cause:

```text
attention item lost
goal forgotten
wait continuation disarmed
```

Nor should the platform spam every channel for nonurgent issues.

Urgency and channel escalation remain policy-controlled.

---

# 558. Completion communication reliability

For ordinary completion:

```text
canonical completed result
→ persist in originating Chat/Task/Workboard
→ attempt completion notification if configured
```

If notification delivery fails:

- the completed result remains available;
- retry according to policy;
- surface unread completion on next authenticated app open;
- do not reopen the goal merely because transport failed.

This preserves the desired morning experience even if push/email transport was unavailable overnight.

---

# 559. Cross-goal work reuse and learning compatibility

R3.13 SharedWorkReuseContract SHALL additionally consider:

```text
principal/team scope
purpose compatibility
memory/learning scope
active goal conflict
current capability health
```

Example:

```text
Research result from Project A
may be reusable by Project B
```

only if authorization and purpose permit.

A shared work artifact may be reusable while its associated user preference is not.

Artifact/evidence reuse and learning/personalization reuse are separate decisions.

---

# 560. Multi-principal cancellation and supersession

Cancellation is a command with authority and scope.

If Principal A owns one task but not the whole project:

```text
"cancel this"
```

MUST NOT automatically cancel sibling goals owned/authorized elsewhere.

A project-wide cancellation requires appropriate authority.

Conflicting cancellation vs continuation instructions SHALL use the MultiPrincipalInstructionResolver.

Stale lower-authority continuation cannot resurrect work cancelled by an authorized higher-scope command.

---

# 561. R3.16 additional acceptance tests

Implementation MUST prove at least:

1. two authorized principals with compatible instructions do not create unnecessary conflict;
2. material conflicting team instructions are detected explicitly;
3. unrelated work continues while one decision is awaiting conflict resolution;
4. security/deploy authority can block only the action class it governs without taking ownership of unrelated product decisions;
5. lower-scope principal cannot cancel an entire project without authority;
6. project-wide authorized cancellation fences stale continuation from another principal;
7. GoalPortfolioConflictGraph detects objective conflict even when files/resources do not overlap;
8. compatible conflicting goals can be sequenced/split automatically;
9. root goal budget caps aggregate nested child/grandchild reservations;
10. nested subagent cannot mint independent spend authority;
11. speculative fanout shrinks before consuming verification/recovery reserves;
12. child reservation is released/reconciled after cancellation/completion;
13. failed speculative candidate does not become a user preference;
14. verified successful procedure may become a procedural learning candidate;
15. autonomous default does not become durable preference merely through repetition;
16. explicit user preference can be proposed to the correct scoped memory;
17. one user's preference does not silently become team/tenant preference;
18. project provider decision does not silently become global personal preference;
19. negative procedural lesson can be retained without converting failure into user preference;
20. DefaultDecisionReceipt records why a reversible default was chosen;
21. material autonomous default can be inspected in final decision history;
22. registered capability with stale/unknown health is not blindly treated as healthy;
23. rate-limited capability can route to retry/fallback policy;
24. schema/contract drift stops structural retry loops and triggers compatibility handling;
25. deprecated provider triggers migration analysis for affected durable work;
26. replacement provider must satisfy privacy/cost/quality/authority constraints;
27. provider sunset does not require user to manually locate all affected active goals;
28. human-required Attention item exists durably before transport notification;
29. failed push/email notification does not lose the Attention item;
30. retryable notification failure schedules another delivery attempt;
31. ordinary goal completion remains complete if notification transport fails;
32. completed result appears on next authenticated app open even if push failed;
33. notification retries do not spam nonurgent channels beyond policy;
34. cross-project artifact reuse does not imply cross-project preference reuse;
35. private project learning cannot be promoted across tenant boundary without memory authority approval;
36. multi-principal instruction envelope is reauthorized at consequential use time;
37. expired instruction does not continue to govern a later commit;
38. cross-goal conflict resolution preserves GoalInvariantLedger requirements;
39. team conflict and provider drift survive checkpoint/restart without losing resolution state;
40. R3.16 introduces no second authorization service, memory store, capability registry, scheduler, billing ledger or notification backend.

---

# 562. R3.16 sixteen-pass hardening review

| Pass | Lens | Gap found | R3.16 resolution |
|---:|---|---|---|
| 1 | Multi-user/team authority | Spec handled user/agent hierarchy but not enough explicit conflict semantics among multiple authorized humans | Added MultiPrincipalInstructionResolver |
| 2 | Instruction provenance | Authorized commands needed normalized principal/scope/class/generation metadata | Added AuthorityWeightedInstructionEnvelope |
| 3 | Cross-goal objective conflict | Shared-resource collision did not cover goals that conflict semantically without touching same files | Added GoalPortfolioConflictGraph |
| 4 | Nested budget amplification | Per-child budget controls could still multiply aggregate spend through deep delegation | Added HierarchicalDelegationBudget |
| 5 | Fanout economics | Dynamic fanout needed aggregate descendant/resource guard before expanding | Added DelegationAmplificationGuard |
| 6 | Memory contamination | Successful/failed/speculative/default outcomes could be learned too similarly | Added LearningWriteGate |
| 7 | Learning provenance | Memory candidate lacked explicit source/verification/scope receipt in Spec 269 behavior | Added LearningCandidateReceipt |
| 8 | Scope leakage in learning | Personal/project/team/tenant lessons needed stronger separation | Added ScopedLearningPolicy |
| 9 | Silent defaults | System-selected defaults could later look like explicit user preference | Added DefaultDecisionReceipt |
| 10 | Capability readiness | Capability registry presence did not guarantee current usable/healthy path | Added CapabilityHealthSnapshot consumption |
| 11 | External contract drift | Provider/tool behavior may change without version bump and cause futile retries | Added CapabilityContractDrift |
| 12 | Provider sunset | Durable work/watchers could outlive selected provider/model/tool | Added ProviderDeprecationMigrationPolicy |
| 13 | Notification reliability | Completion/human attention could be persisted but transport delivery status was under-specified | Added NotificationDeliveryReceipt |
| 14 | Human-attention liveness | A necessary user request could wait forever after a failed notification channel | Added AttentionDeliveryPolicy with durable inbox + retry/fallback |
| 15 | Reuse vs personalization | Artifact reuse could accidentally imply preference/memory reuse across scopes | Explicitly separated work/evidence reuse from learning reuse |
| 16 | Authority boundaries | New policies risked duplicating Spec 220/268/256 or notification/billing backends | Defined all as orchestration projections/consumers of canonical authorities |

All identified gaps were incorporated into R3.16.

---

# 563. R3.16 Definition of Done extension

R3.16 is not complete until:

- conflicting instructions from multiple authorized principals are resolved by scope/authority semantics rather than arrival order or majority vote;
- only the affected decision/commit pauses while independent work continues;
- concurrent goals can detect objective conflicts beyond shared-resource collisions;
- nested subagents cannot amplify total authorized spend beyond the root goal envelope;
- learning candidates distinguish explicit preference, verified procedure, failed attempt, speculation and autonomous defaults;
- learning remains correctly scoped across personal/project/team/tenant boundaries;
- autonomous defaults remain auditable and do not masquerade as user preference;
- dispatch considers current capability health, not only registry existence;
- external capability contract drift can trigger quarantine/refresh/reroute instead of futile retry;
- provider deprecation can migrate affected durable work automatically where a compatible authorized path exists;
- completion and true-human-exclusive attention have durable delivery receipts/retry behavior without making notification transport part of goal truth;
- failed notification cannot cause a completed result or required Attention item to disappear;
- work/evidence reuse and memory/personalization reuse remain separate authorization decisions;
- the user can still delegate one goal while SmartAIHub correctly manages teams, budgets, learning, capabilities and communication underneath.

---

# 564. R3.17 Cumulative-spec execution integrity decision

R3.17 addresses an increasingly important property of Spec 269 itself and of any large SmartAIHub work definition:

> **A specification can be complete in prose yet fail in implementation because the executing agent sees only an incomplete slice, resolves supersession incorrectly, or verifies a different behavioral/environmental configuration from the one that actually ships.**

Spec 269 is intentionally cumulative. That creates advantages for audit history, but also introduces execution risks:

- old and new clauses may overlap;
- later amendments may refine rather than fully replace older behavior;
- requirements can split/merge across revisions;
- a subagent's compact context can omit a mandatory negative constraint;
- tests may run on the correct source revision but wrong prompt/profile/feature-flag/configuration;
- canonical DB mutation may succeed while required derived indexes/caches are still stale;
- a checkpoint ref may exist before its bytes are actually durable/retrievable;
- a fallback path may share the same hidden failure domain as the primary;
- implementer-generated tests may reproduce the same mistaken interpretation as the implementation.

R3.17 closes these gaps without introducing duplicate authorities.

---

# 565. NormativeSpecIndex

Large/cumulative implementation specifications SHOULD expose a derived machine-readable index.

Illustrative model:

```yaml
NormativeSpecIndex:
  spec_ref: ref
  spec_revision: string
  source_digest: string

  sections:
    - section_ref: ref
      heading: string
      revision_origin: string
      normative_status:
        NORMATIVE|
        HISTORICAL|
        SUPERSEDED|
        INFORMATIVE
      owner_spec_ref: ref|null
      requirement_refs: [ref]
      constraint_refs: [ref]
      acceptance_test_refs: [ref]
      supersedes_section_refs: [ref]
      refined_by_section_refs: [ref]

  precedence_policy_ref: ref
  generated_at: timestamp
```

The index MAY be materialized as a file/artifact such as:

```text
.smartaihub/spec/
  normative-index.json
```

but it is always a **derived projection** from the approved work-definition/spec corpus.

The Markdown/spec corpus and canonical approval/version history remain authoritative.

Deleting the index MUST NOT lose requirements; it can be rebuilt.

---

# 566. NormativePrecedencePolicy

Implementation MUST NOT resolve conflicting spec clauses by:

```text
whichever section entered the context window
whichever clause appears later in a truncated prompt
whichever wording is easier to implement
```

A precedence policy SHOULD consider:

```text
explicit supersedes/refines relation
revision authority
requirement provenance
user-confirmed decision
policy/security authority
section normative status
scope specificity
```

Default rule:

```text
later text does NOT automatically erase earlier requirements
unless it explicitly supersedes them or semantic reconciliation proves incompatibility
```

Where two mandatory clauses appear irreconcilable:

```text
attempt semantic reconciliation
→ inspect provenance/decision history
→ run ConstraintSatisfiabilityGate
→ isolate exact conflicting decision
→ request human decision only when materially irresolvable
```

The conflict MUST NOT be silently hidden by implementation choice.

---

# 567. RequirementLineageGraph

Stable requirement IDs are necessary but insufficient when a requirement evolves.

Supported lineage relations SHOULD include:

```text
REWORDED_FROM
SPLIT_FROM
MERGED_FROM
REFINES
SUPERSEDES
EQUIVALENT_TO
DERIVED_FROM
```

Illustrative model:

```yaml
RequirementLineageEdge:
  from_requirement_ref: ref
  to_requirement_ref: ref
  relation:
    REWORDED_FROM|
    SPLIT_FROM|
    MERGED_FROM|
    REFINES|
    SUPERSEDES|
    EQUIVALENT_TO|
    DERIVED_FROM
  rationale_ref: ref
  generation: integer
```

Rules:

- splitting requirement R into R1/R2 MUST NOT leave R falsely verified because old evidence covered only one child;
- merging requirements MUST preserve all mandatory source constraints;
- rewording alone SHOULD preserve valid evidence when semantics remain equivalent;
- superseded requirements remain auditable but no longer block current completion;
- requirement lineage updates SHALL reconcile RequirementCoverageGraph and ConstraintCoverageGraph.

---

# 568. ContextSliceCompletenessContract

R3.6 intentionally sends subagents compact context. R3.17 adds a completeness proof obligation.

Each task-specific context slice SHOULD include or reference:

```yaml
ContextSliceCompletenessContract:
  work_unit_ref: ref
  goal_generation: integer
  spec_revision_ref: ref|null
  normative_index_digest: string|null

  required_requirement_refs: [ref]
  required_constraint_refs: [ref]
  required_goal_invariant_refs: [ref]
  required_decision_refs: [ref]
  required_policy_refs: [ref]

  intentionally_omitted_context_classes: [string]
  omission_reason: string|null

  completeness_state:
    COMPLETE_FOR_SCOPE|
    NEEDS_EXPANSION|
    UNKNOWN
```

Core invariant:

> **Small context is good only when omitted context is irrelevant to correctness.**

Before consequential mutation, a child SHOULD verify that its packet still resolves every required reference for its assigned scope.

Missing relevant context triggers context expansion/rebase, not guessing.

---

# 569. BehavioralConfigurationSnapshot

Source code/runtime version alone does not fully determine AI-system behavior.

A consequential attempt MAY also depend on:

```text
AssistantProfile revision
system/developer prompt template revision
Skill instructions
model-routing policy
model-selection policy
feature flags
experiment/cohort assignment
tenant configuration
tool adapter configuration
retrieval configuration
temperature/decoding class where relevant
```

SmartAIHub SHOULD bind material attempts to a behavioral snapshot.

```yaml
BehavioralConfigurationSnapshot:
  snapshot_ref: ref
  assistant_profile_ref: ref|null
  prompt_template_refs: [ref]
  skill_instruction_refs: [ref]
  routing_policy_ref: ref|null
  model_selection_policy_ref: ref|null
  feature_flag_snapshot_ref: ref|null
  experiment_cohort_refs: [ref]
  tenant_config_generation_ref: ref|null
  retrieval_config_ref: ref|null
  created_at: timestamp
```

This snapshot SHOULD be referenced by `ExecutionAttemptFingerprint` for attempts whose output can materially change based on these settings.

It contains configuration provenance, not hidden chain-of-thought.

---

# 570. BehaviorDriftPolicy

Behavioral configuration may change while a goal is active.

Possible changes:

```text
AssistantProfile updated
prompt template changed
routing policy changed
feature flag rolled out
model preference changed
Skill instruction upgraded
tenant policy/config updated
```

The goal SHOULD classify the change:

```text
NON_MATERIAL
COMPATIBLE
REVERIFY_REQUIRED
REPLAN_REQUIRED
INVALIDATES_ACTIVE_CHILD
```

Rules:

- cosmetic/non-material flag changes need not restart work;
- material behavior change SHOULD increment applicable configuration generation;
- active children using stale material configuration SHALL be fenced before consequential commit;
- completed evidence MAY remain usable when compatibility is demonstrated;
- a production candidate verified under configuration A MUST NOT be silently deployed under materially different configuration B.

---

# 571. DataPurposeEpoch and PrivacyRevocationFence

Permission to use data can change while autonomous work is running.

Examples:

```text
user disables memory
user asks to forget a data class
project access is revoked
consent/purpose changes
tenant policy narrows allowed processing
external-provider egress permission is withdrawn
```

Affected ContextPackets/data bindings SHOULD carry a purpose/authorization generation reference:

```yaml
DataPurposeEpoch:
  scope_ref: ref
  purpose_ref: ref
  authorization_ref: ref
  generation: integer
  status: ACTIVE|RESTRICTED|REVOKED
```

On material revocation:

```text
publish invalidation
→ fence new use/egress
→ stop or rehydrate affected child contexts
→ invalidate incompatible cached context
→ revoke applicable provider/tool binding
→ continue with reduced authorized data when feasible
→ bind deletion/disposition to canonical privacy systems
```

Already-sent external data cannot be magically recalled; provider-side disposition follows the canonical DataDispositionPlan/privacy authority.

Spec 269 does not become the consent or retention authority.

---

# 572. DerivedProjectionConvergenceBarrier

Canonical mutation may complete before derived systems converge.

Examples:

```text
PostgreSQL updated
→ outbox pending
→ Vectorize/search index stale
→ KV/cache stale
→ CDN old
→ materialized projection not rebuilt
```

For goals where a derived projection is required for the user-visible outcome, completion SHOULD include a convergence barrier.

```yaml
DerivedProjectionConvergenceBarrier:
  canonical_generation_ref: ref
  required_projection_refs:
    - projection_ref
  optional_projection_refs:
    - projection_ref

  states:
    - projection_ref: ref
      state:
        CURRENT|
        LAGGING|
        REBUILDING|
        FAILED|
        NOT_REQUIRED
      evidence_ref: ref|null
```

Rules:

- canonical data remains truth;
- required projection lag blocks only the completion claim that depends on it;
- optional/noncritical cache lag does not ceremonially block unrelated completion;
- stale projection SHOULD be repaired/rebuilt automatically when AI-actionable;
- a search/index result MUST NOT claim freshness beyond its acknowledged source generation.

---

# 573. ConstraintSatisfiabilityGate

A goal can contain individually valid but mutually impossible constraints.

Example:

```text
must use external Provider X
+
must send zero data outside local device
+
Provider X requires cloud data transfer
```

Before expensive implementation—and after material requirement changes—the system SHOULD evaluate satisfiability.

Possible states:

```text
SATISFIABLE
SATISFIABLE_WITH_DERIVED_CHANGES
CONDITIONALLY_SATISFIABLE
UNSATISFIABLE
UNKNOWN
```

Recovery:

```text
find alternative technical path
→ relax only mutable/derived constraint if authorized
→ preserve higher-authority user/policy constraints
→ isolate minimal conflicting set
→ request decision only if no authorized automatic resolution exists
```

The gate prevents spending hours implementing a plan that cannot possibly satisfy the CompletionContract.

---

# 574. CheckpointDurabilityReceipt

A checkpoint reference does not prove the checkpoint is durable.

Before releasing an executor/lease or depending on a checkpoint for automatic resume, the platform SHOULD obtain a durability receipt appropriate to the storage class.

```yaml
CheckpointDurabilityReceipt:
  checkpoint_ref: ref
  storage_ref: ref
  content_digest: string
  persisted_generation: string|integer
  retrievability_check_ref: ref|null
  integrity_state:
    VERIFIED|
    PARTIAL|
    UNKNOWN|
    FAILED
  created_at: timestamp
```

Requirements:

- manifest metadata alone is insufficient when bytes/artifacts are still uploading;
- checkpoint handoff SHOULD wait for required durable persistence acknowledgement;
- if remote persistence fails, local source MAY remain held/checkpointed while retry/recovery proceeds;
- executor/lease SHOULD NOT be relinquished in a way that knowingly destroys the only valid copy;
- restore/resume SHOULD verify digest/integrity before trusting checkpoint state.

---

# 575. RecoveryFailureDomainProfile

A configured fallback is not necessarily independent.

Examples of hidden correlation:

```text
primary and fallback models share the same provider account/quota
two workers run on the same physical host
backup and primary data live in the same failure domain
two notification channels depend on the same upstream provider
two research routes use the same search index
```

Resilience-critical paths SHOULD describe meaningful failure domains.

```yaml
RecoveryFailureDomainProfile:
  primary_path_ref: ref
  fallback_path_refs: [ref]

  domains:
    provider: [string]
    account: [string]
    region: [string]
    host_or_cluster: [string]
    credential_root: [string]
    network_dependency: [string]
    storage_dependency: [string]

  independence:
    INDEPENDENT|
    PARTIALLY_CORRELATED|
    HIGHLY_CORRELATED|
    UNKNOWN
```

The system SHOULD NOT represent a highly correlated fallback as independent redundancy.

Where independence matters materially, choose a more diverse path or state the reduced guarantee honestly.

---

# 576. EvaluationLeakageFence and HoldoutVerification

Independent verifier identity is not enough when the verifier receives the same flawed assumptions/tests generated by the implementer.

For risk-relevant work, verification SHOULD include one or more sources of independent oracle information such as:

```text
acceptance criteria derived before candidate implementation
holdout fixtures
independently generated edge cases
property/invariant checks
external contract fixtures
production-like replay/synthetic traces
security negative tests
independent domain reference
```

The verifier MAY inspect implementation after defining/locking appropriate holdout checks.

Prohibited confidence inflation:

```text
implementer writes code
→ implementer/model generates matching test from same interpretation
→ test passes
→ call this independent verification
```

The system SHOULD record whether evaluation evidence is:

```text
IMPLEMENTATION_COUPLED
PARTIALLY_INDEPENDENT
INDEPENDENT_HOLDOUT
```

This composes with `EvidenceIndependenceGraph` and `VerificationOracleProfile`.

---

# 577. EnvironmentParityReport

Preview/Staging and Production SHOULD intentionally differ in secrets/data access, but material verification needs to know which differences affect validity.

Before promoting high-impact work, generate or resolve a parity report where relevant:

```yaml
EnvironmentParityReport:
  verified_environment_ref: ref
  target_environment_ref: ref
  release_digest_match: boolean

  compared_dimensions:
    runtime_version: SAME|COMPATIBLE|DIFFERENT|UNKNOWN
    schema_generation: SAME|COMPATIBLE|DIFFERENT|UNKNOWN
    feature_flags: SAME|COMPATIBLE|DIFFERENT|UNKNOWN
    behavior_config: SAME|COMPATIBLE|DIFFERENT|UNKNOWN
    network_dependencies: SAME|COMPATIBLE|DIFFERENT|UNKNOWN
    provider_bindings: SAME|COMPATIBLE|DIFFERENT|UNKNOWN
    region: SAME|COMPATIBLE|DIFFERENT|UNKNOWN
    data_shape: SAME|REPRESENTATIVE|DIFFERENT|UNKNOWN

  material_differences: [ref]
  additional_verification_refs: [ref]
```

A difference is not automatically a defect.

The question is whether existing verification remains applicable.

Material differences require targeted Production/canary verification or a compatible evidence argument.

---

# 578. VerificationTargetBindingSet

Verification evidence SHOULD bind to the state it actually verified.

```yaml
VerificationTargetBindingSet:
  evidence_ref: ref

  source_revision_ref: ref|null
  release_digest: string|null
  schema_generation_ref: ref|null
  migration_position_ref: ref|null
  behavioral_config_ref: ref|null
  runtime_dependency_binding_ref: ref|null
  environment_ref: ref|null
  feature_flag_snapshot_ref: ref|null
  data_fixture_or_scenario_ref: ref|null

  observed_at: timestamp
```

Before using old evidence for final completion:

```text
compare evidence binding
with final candidate binding
→ equivalent/compatible?
   YES: reuse evidence
   NO: targeted reverify
```

This prevents:

```text
"tests passed"
```

when the tests actually ran against a materially different code/config/schema/environment combination.

---

# 579. Derived Spec Execution Index generation

When a large approved spec/work definition changes materially:

```text
new approved spec generation
→ regenerate NormativeSpecIndex
→ reconcile RequirementLineageGraph
→ update RequirementCoverageGraph / ConstraintCoverageGraph
→ identify affected plan/context slices
→ invalidate only incompatible child contexts/evidence
```

The generation process SHOULD be deterministic enough that missing index entries can be detected.

An implementation agent MUST NOT treat an absent requirement from a compact index/context as evidence that the requirement was removed unless lineage/precedence says so.

---

# 580. R3.17 additional acceptance tests

Implementation MUST prove at least:

1. a cumulative spec with overlapping sections can generate a NormativeSpecIndex;
2. explicitly superseded historical clause does not remain a completion blocker;
3. later amendment does not silently erase an older still-compatible mandatory requirement;
4. irreconcilable mandatory clauses produce a typed conflict rather than arbitrary implementation choice;
5. splitting one verified requirement into two children re-evaluates child coverage;
6. rewording an equivalent requirement can retain compatible evidence;
7. merging requirements preserves all mandatory source constraints;
8. compact ContextPacket missing a required negative constraint fails completeness and expands/rebases;
9. irrelevant omitted context does not force the entire full spec into every child prompt;
10. implementation attempt records the material behavioral configuration used;
11. material feature-flag/prompt/profile change fences incompatible stale child mutation;
12. non-material visual/config change does not unnecessarily restart verified work;
13. production candidate verified under behavior config A cannot silently ship under incompatible config B;
14. privacy/purpose revocation prevents new affected child egress;
15. memory/consent revocation invalidates incompatible active ContextPacket use;
16. provider-side already-sent data is handled through disposition policy rather than falsely claimed recalled;
17. canonical DB update with required stale Vectorize/search projection remains LAGGING rather than falsely complete;
18. optional noncritical cache lag does not block unrelated goal completion;
19. derived projection repair/rebuild can satisfy convergence barrier automatically;
20. mutually impossible requirements are detected before expensive execution;
21. satisfiability resolution preserves higher-authority user/policy constraints;
22. checkpoint manifest written before artifact upload completion does not count as VERIFIED durable checkpoint;
23. executor is not safely released when it holds the only valid unpersisted checkpoint copy;
24. checkpoint digest mismatch blocks resume and triggers recovery;
25. fallback using same provider/account quota is classified as correlated;
26. correlated fallback is not advertised as independent resilience;
27. recovery planner can prefer a genuinely independent path when policy/cost permits;
28. verifier using only implementer-coupled tests does not claim independent holdout verification;
29. independently derived holdout/negative/property check can raise verification independence;
30. Preview and Production differences are explicitly compared for high-impact promotion;
31. expected secret/data differences do not automatically fail environment parity;
32. material runtime/schema/feature-flag difference triggers targeted verification;
33. final test evidence is bound to exact or compatible source/config/schema/runtime/environment target;
34. evidence for an incompatible target generation is rejected or reverified;
35. spec index regeneration identifies affected plan/context slices after material amendment;
36. unchanged requirement slices are not unnecessarily invalidated;
37. NormativeSpecIndex deletion can be rebuilt from canonical spec corpus;
38. derived spec index cannot override user-approved source text/decision authority;
39. finality barrier can require constraint coverage, target binding and required projection convergence where applicable;
40. R3.17 introduces no second spec source of truth, privacy authority, cache/index authority, test runner, configuration service or recovery backend.

---

# 581. R3.17 sixteen-pass hardening review

| Pass | Lens | Gap found | R3.17 resolution |
|---:|---|---|---|
| 1 | Cumulative-spec precedence | 17k+ line cumulative spec could be interpreted differently depending on which amendment reaches context | Added NormativeSpecIndex + NormativePrecedencePolicy |
| 2 | Requirement evolution | Stable requirement IDs did not define split/merge/reword lineage | Added RequirementLineageGraph |
| 3 | Context compression safety | ContextPacket required sufficient context but did not prove slice completeness against the normative corpus | Added ContextSliceCompletenessContract |
| 4 | AI behavior reproducibility | Source/model provenance omitted prompt/profile/routing/flag configuration that can materially change output | Added BehavioralConfigurationSnapshot |
| 5 | Mid-goal behavior drift | Active work could continue under stale prompt/profile/feature-flag semantics | Added BehaviorDriftPolicy |
| 6 | Privacy revocation during execution | Deletion/offboarding existed, but active purpose/consent generation propagation into child context was under-specified | Added DataPurposeEpoch / PrivacyRevocationFence |
| 7 | Eventual consistency | Canonical mutation could be done while required Vectorize/cache/outbox/search projection remained stale | Added DerivedProjectionConvergenceBarrier |
| 8 | Impossible requirement set | Individual requirements could all look valid while the combined goal was unsatisfiable | Added ConstraintSatisfiabilityGate |
| 9 | Checkpoint false durability | Checkpoint ref/manifest could exist before durable bytes were retrievable | Added CheckpointDurabilityReceipt |
| 10 | Correlated recovery | Multiple fallback paths could share one hidden provider/host/account/storage failure domain | Added RecoveryFailureDomainProfile |
| 11 | Evaluation leakage | Independent verifier could still reuse implementation-coupled tests/assumptions | Added EvaluationLeakageFence / HoldoutVerification |
| 12 | Preview-to-production validity | Preview was securely defined but verification applicability across environment differences was not explicit enough | Added EnvironmentParityReport |
| 13 | Evidence target ambiguity | Test receipt proved execution but not always exact code/config/schema/environment equivalence to final candidate | Added VerificationTargetBindingSet |
| 14 | Large-spec update propagation | A material amendment needed deterministic index→coverage→context invalidation flow | Added derived Spec Execution Index generation |
| 15 | Convergence risk | New correctness checks could make optional caches/parity ceremonial blockers | Made convergence/parity explicitly risk- and requirement-based |
| 16 | Authority boundaries | New indexes/gates risked creating duplicate spec/privacy/config/index/test/recovery authorities | Explicitly retained all canonical owners and projection-only semantics |

All identified gaps were incorporated into R3.17.

---

# 582. R3.17 Definition of Done extension

R3.17 is not complete until:

- a large cumulative specification can be navigated through an auditable derived normative/precedence index;
- requirement split/merge/reword/supersession preserves correct coverage lineage;
- compact subagent context can prove it contains every requirement/invariant/constraint needed for its assigned scope;
- consequential AI attempts record the behavioral configuration that materially shaped their output;
- material behavior-config changes invalidate or reverify affected stale work instead of silently changing semantics;
- consent/purpose/privacy revocation propagates into active autonomous data use;
- required derived projections converge before outcome claims that depend on them;
- mutually unsatisfiable constraints are discovered before wasting large implementation budgets;
- checkpoint durability is proven before the system relies on that checkpoint for handoff/resume;
- fallback/recovery guarantees account for common-mode failure domains;
- high-risk verification can use independent holdout/oracle evidence rather than implementation-coupled tests alone;
- Preview/Staging evidence is applied to Production only when environment differences are understood and compatible;
- final verification evidence binds to the actual code/schema/config/runtime/environment generations being completed;
- these controls remain selective and risk-based so they improve correctness without turning every small task into ceremony;
- the user can continue issuing a short goal while SmartAIHub handles the complexity of a very large cumulative specification without silently dropping meaning.



# R3.18 Additive Shared Conversation Runtime, App Surfaces, and Project-Aware Memory Contract — 2026-10-07

## A. Authority and stale-reference errata

SPEC-269 remains the canonical assistant/team/delegation contract. It consumes SPEC-302 for canonical project identity, SPEC-268 for memory scope/authority, SPEC-266 for knowledge/evidence, and the existing canonical Chat runtime. This amendment does not create a second Chat backend or Memory authority. Normative/current references to `SPEC-282 Work Context` map to `SPEC-292`; Portable Mini App Knowledge Runtime authority is `SPEC-281`. Historical quotations and prior receipts are retained as evidence and MUST NOT be mass-rewritten.

## B. One runtime, many spaces and surfaces

The architecture is `ONE Conversation Runtime → many Conversation Spaces → many app-specific Chat Surfaces/skins`. Existing Chat routers/services, `chatInferenceGateway`, `memoryService`, and conversations/messages schema are the implementation candidates to extend; their existence is not proof of every integration requirement. A new Chat backend MUST NOT be created while the existing canonical runtime can be extended. A Mini App embedding Chat supplies `hostAppId` for the embedding App (for example, a Financial App remains the host identity), optional `canonicalProjectId` and `workContextId`, `conversationSpaceId`, `memoryProfile`, `knowledgeBindings`, `billingContext`, and `permissionCeiling`. Runtime provider identity MUST NOT overwrite host app identity.

Default integrations are Level 1 shared Chat UI plus custom skin/profile, or Level 2 custom Chat UI over the shared Conversation Runtime API. Level 3 custom conversation runtime is restricted to advanced/external use and MUST declare capability compatibility. Apps MUST NOT clone the canonical conversation runtime.

## C. Memory scope and context handoff

SPEC-268 R2.5 has been recovered with byte-verified provenance, and its additive R2.6 amendment is the normative memory-context contract. This consumer clause preserves the runtime boundary: memory resolution MUST NOT use `userId` alone. Scope dimensions include `USER_GLOBAL`, `APP_USER`, `PROJECT_SHARED`, `USER_PROJECT`, `APP_PROJECT`, `USER_APP_PROJECT`, `SESSION`, `CONVERSATION`, `ASSISTANT`, and `EXECUTION_EXPERIENCE`. A minimum runtime `MemoryContext` contains `tenantId`, `userId`, optional `hostAppId`, `appInstallationId`, `canonicalProjectId`, `workContextId`, `workspaceId`, `conversationSpaceId`, `conversationId`, `sessionId`, and `environment`. Runtime implementation and acceptance remain separately unverified.

Project binding is resolved under SPEC-302. Explicit selection and verified object/task/conversation bindings outrank recency and semantic candidates. Similarity MAY retrieve/rank candidates but MUST NOT alone select a durable project destination. Resolution states include `RESOLVED_EXPLICIT`, `RESOLVED_CONTEXTUAL`, `RESOLVED_INFERRED`, `AMBIGUOUS`, `UNRESOLVED`, `NO_PROJECT`, and `SESSION_PENDING_SCOPE`. Ephemeral reads MAY accept lower confidence when authorized and labeled. Personal durable writes require stronger scope confidence; project-shared durable writes and high-impact actions require authoritative binding plus current ACL. Ambiguous/unresolved context MUST remain session/pending and cannot be written as durable Project Memory.

`App ownership transfer ≠ transfer of user memory`. `App clone/fork ≠ clone user private memory`. Shared/project data transfer requires a separate rights/ACL contract. Legacy Chat memory follows inventory → bridge → migrate → reconcile → retire; one logical scope has one memory authority throughout cutover.

## E. Retired custom workflow-engine boundary

The R3.17 source contains historical clauses describing reusable Workflow/Automation as an executable solution strategy. Those clauses MUST NOT be interpreted as restoring or extending the retired `/workflows` route, legacy custom workflow engine, or any retired workpack intake/discovery/ROI system. This R3.18 amendment supersedes executable use of those historical clauses. A `WORKFLOW` asset label, template, or portable configuration may exist as catalog metadata only when it is consumed by an explicitly approved runtime; it does not define a second agent runtime, durable job ledger, queue, or workflow engine. The OpenAI Agents API on the Python backend is the agent runtime; long-running execution is admitted through canonical `worker_jobs` plus outbox; risky isolation uses the approved Cloudflare Container runtime.

## D. Acceptance scenarios

At minimum cover: one user across two apps/projects; two users in one authorized shared project; same conversation changing Project A→B; no project and ambiguous project; near-equal semantic candidates; picker confirmation; pending memory promotion after confirmation; Chat embedded in two apps with distinct host IDs; App clone, transfer, and lease; ACL revocation during a conversation; and legacy memory cutover with replay/idempotency. Tests must prove no cross-app/project/tenant private-memory leakage and bind evidence to the exact implementation SHA.
