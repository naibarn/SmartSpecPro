# Decision Log

## Planning depth

- Decision: `standard`
- Reason: The request is architecture-heavy and cross-domain, but it is still bounded to an implementation-planning deliverable rather than immediate multi-month delivery.

## Core product decisions

### 1. Preserve review-before-run

- Decision: Keep `Work Request` creation separate from execution launch.
- Why: The existing UI pattern correctly protects users from accidental long-running and costly runs.
- Codebase fit: This matches `WorkRequest.tsx` and `workOs.createAutomationRun`.

### 2. Make chat and memory first-class intake sources

- Decision: The new architecture will treat linked conversations, conversation summaries, project memory, and related chat artifacts as structured intake sources.
- Why: The data model already supports `linkedConversationIds`, but the main UX and planning path do not use it well enough.

### 3. Reuse Workpack governance rather than inventing a new learning stack

- Decision: Workpack replay, readiness, learning proposals, and promotion logic become the learning/governance backbone for repeated orchestrator flows.
- Why: The repo already has durable primitives for replay, readiness, promotion, and improvement briefs.

### 4. Introduce a preflight planning layer before Team launch

- Decision: Add an explicit `Compiled Work Brief -> Capability Plan -> Execution Plan` pipeline between `Work Request` review and `createAutomationRun`.
- Why: Team planning currently begins from room goal text plus work items, which is not enough to coordinate the whole platform.

### 5. Keep LLM planning, but constrain it with capability structure

- Decision: Do not remove the LLM planner from `runEngine`; instead feed it a constrained execution plan and surface allowlist.
- Why: The current plan-generation UX is valuable, but it should refine a governed plan rather than select tools from scratch.

### 6. Expand automation surfaces

- Decision: Extend the automation surface model to include at least `workflow` and `skill_studio`.
- Why: The platform already has workflow and skill-maintenance runtimes, but `workAutomationPolicyService` cannot route to them as first-class surfaces yet.

### 7. Prefer phased persistence

- Decision: Phase 1 may persist preflight artifacts in existing JSON/snapshot storage, while Phase 2 normalizes them into dedicated tables if the product proves stable.
- Why: This reduces rollout risk while leaving room for stronger queryability later.

### 8. Privileged surfaces are review-gated by default

- Decision: `workflow` and `skill_studio` are planner-visible but not auto-executable by default in v1.
- Why: These surfaces can create broad or privileged side effects and need explicit governance before autonomous dispatch.

### 9. Approval-time source snapshots are mandatory

- Decision: launch approval must bind to immutable source snapshots rather than live mutable upstream data.
- Why: This prevents review/launch drift and strengthens replay and auditability.

### 10. Team resolution must fail closed

- Decision: if no target team can be resolved confidently, kickoff enters review-required state instead of silently returning null.
- Why: The current kickoff path can stop without launching when no queue/team is available, and the new architecture must make that state explicit.

### 11. Budget forecasts must become enforced runtime caps

- Decision: preflight cost estimates become `ExecutionBudgetEnvelope` constraints at runtime.
- Why: Preview-only budget information is not sufficient for an automation system that may consume tokens, tools, media jobs, and side-effecting retries.

### 12. Preflight preview must have requester-safe access

- Decision: requesters can review a redacted preflight preview for their own request, while privileged diagnostics stay admin/domain-admin only in v1.
- Why: The product goal requires requester review before launch, but the current plan-inspection surface is too admin-oriented to serve as the final UX contract.

### 13. New surfaces need explicit contract migration before runtime dispatch

- Decision: `workflow` and `skill_studio` may be planner-visible before they are runtime-dispatchable, but launch must block them with compatibility diagnostics until shared types, router schemas, and persistence contracts are migrated.
- Why: Current Work OS automation contracts and persisted step enums do not yet represent those surfaces safely.

### 14. Skill Studio governance must be action-specific

- Decision: split `skill_studio` governance into create, improve, auto-apply, and publish/widen-visibility actions instead of one blanket rule.
- Why: The current system already allows some non-admin create/improve paths, while auto-apply and publishing remain more privileged.

### 15. Request edits invalidate preview approval

- Decision: the system will compute a `PreflightRevisionFingerprint` and force regenerate-and-reapprove whenever request fields, linked sources, or approval inputs change after preview.
- Why: Approval drift can happen even when upstream source documents do not change, because the request itself is editable until launch.

### 16. Team resolution must be deterministic

- Decision: team resolution follows an explicit precedence order and emits stable resolution codes.
- Why: The current kickoff logic already implies an order, but the product needs that behavior exposed as a testable contract.

### 17. Approved-plan storage requires an explicit rollout gate

- Decision: Phase 1 may continue to store approved preflight bundles, source snapshots, budget envelopes, and team-resolution results in JSON metadata, but requester-visible launch enforcement cannot leave preview/beta until engineering records a storage decision.
- Why: JSON metadata is faster and safer for early rollout, but dashboards, audit, retention, Team ledger joins, and workpack learning may need normalized tables.
- Gate: keep JSON-only only for narrow run-scoped reads; add migrations first if cross-run queryability, independent retention, or reliable joins become product requirements.

### 18. Shared security policy must be decomposed before implementation

- Decision: `workOrchestratorSecurityPolicy` is a shared concept, but implementation should be split into small modules or clearly owned helper groups for surface governance, snapshot drift, budget enforcement, preflight redaction, contract compatibility, and team-resolution launch gates.
- Why: Section 02, Section 03, Section 04, Section 06, and Section 07 all consume security decisions. A monolithic file would create merge conflicts and make enforcement rules easier to bypass.
- Gate: before parallel `/deep-implement` work begins, section owners must agree which helper owns each stable reason-code family and which section is allowed to edit it.

### 19. Actor context is server-derived only

- Decision: source resolution, preview generation, approval, and launch consume a server-derived `WorkIntakeActorContext`.
- Why: Client payloads can request sources or teams, but they must never become the source of truth for tenant, role, permission, or private-vault unlock state.
- Gate: Section 01 and Section 02 tests must prove client-provided trusted actor fields are ignored.

### 20. Preflight approval has an explicit lifecycle and API contract

- Decision: `PreflightApprovalBundle` state transitions and APIs are part of the implementation contract, not UI-only behavior.
- Why: preview, regeneration, approval, invalidation, blocked launch, and final launch have different safety semantics and must remain idempotent under retries and double-clicks.
- Gate: requester-visible launch approval cannot enable until lifecycle transition tests and API contract tests pass.

### 21. Runtime dispatch policy governs long-running and side-effecting steps

- Decision: every executable plan step compiles a `RuntimeDispatchPolicy` immediately before dispatch.
- Why: media, workflow, agency, video, document, and skill-maintenance actions may be long-running or side-effecting; retry/cancel/dead-letter behavior must be explicit.
- Gate: privileged or long-running surface dispatch cannot enable until retry, timeout, cancellation, idempotency, budget-reservation, and dead-letter tests pass.

### 22. Observability uses one shared taxonomy

- Decision: Feature 105 telemetry uses a shared event envelope, event names, correlation fields, redaction mode, actor class, and primary reason code.
- Why: Work OS, Team ledger, monitoring, and UI need to explain the same decision path without leaking privileged diagnostics.
- Gate: dashboards, alerts, or rollout gates cannot depend on Feature 105 events until taxonomy contract tests pass.

### 23. Learning proposals have lifecycle governance

- Decision: generated workpack, workflow, and skill-improvement proposals move through explicit states before they can be applied or closed.
- Why: repeated automation should improve the system, but rejected/expired/superseded ideas must remain auditable without auto-reopening noisy work.
- Gate: automatic follow-up work is disabled until proposal lifecycle and action-specific governance tests pass.

### 24. Preflight UI must be accessible, localized, and progressively disclosed

- Decision: requester-safe preflight review must support keyboard/screen-reader usage, translation-key mapped reason summaries, and progressive disclosure of detail.
- Why: users need to understand expensive automation decisions without reading admin policy internals or inaccessible dense diagnostics.
- Gate: broad requester-visible UI rollout requires accessibility, i18n, and progressive-disclosure tests.

## Risks accepted during planning

- The initial version will still rely on some heuristics while migrating to capability-driven planning.
- The first release should optimize for explainability and safety, not maximal autonomy.
- Workflow and skill-maintenance surfaces should launch behind flags because they materially widen orchestration power.

## Review rounds summary

- Round 1: Added explicit `workflow` and `skill_studio` surface expansion after confirming the current policy schema cannot route to them.
- Round 2: Tightened the requirement that request review remains manual and distinct from launch.
- Round 3: Added workpack governance as a core reuse target instead of a side note.
- Round 4: Clarified that Team should consume a precomputed execution plan, not only a prompt.
- Round 5: Added phased persistence guidance to avoid overcommitting to schema churn too early.
- Round 6: No new material issues found; the plan stayed aligned with the current repo and rollout constraints.
- Round 7: Closed the remaining production gaps around privileged-surface governance, approval-source snapshots, team-resolution fail-closed rules, and runtime budget enforcement.
- Round 8: Closed the remaining gaps around surface-contract migration, requester-safe preview ACLs, dirty-state invalidation, deterministic team resolution, and `skill_studio` sub-action governance.
- Round 9: Canonicalized deep-plan outputs and added section-level interface/done-when criteria.
- Round 10: Promoted the optional JSON-vs-migration and security-policy-splitting suggestions into explicit implementation gates.
- Round 11: Promoted lifecycle/API contracts, runtime budget/dispatch policy, observability taxonomy, actor-context propagation, learning proposal lifecycle, and UI accessibility/i18n/progressive disclosure into explicit plan requirements and tests.
