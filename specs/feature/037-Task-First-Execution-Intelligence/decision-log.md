# Decision Log

## 2026-03-11

### Decision 1

- Topic: Planning depth
- Options considered:
  - quick plan with 1-2 execution notes
  - standard sectionized plan
  - promote to deep architecture plan
- Decision: promote to deep architecture plan
- Mode used: auto
- Rationale: Feature 037 spans chat runtime, skill routing, model metadata, billing, direct artifact execution, and AgencySwarm. A lightweight plan would under-specify dependencies and rollout risk.

### Decision 2

- Topic: First implementation slice
- Options considered:
  - start with planner and auto model selection
  - start with deterministic artifact routing
  - start with runtime correctness and billing correctness
- Decision: start with runtime correctness and billing correctness
- Mode used: auto
- Rationale: Advanced routing is unsafe until skill invocation policy and charge attribution are reliable.

### Decision 3

- Topic: Capability metadata storage
- Options considered:
  - pure JSON on models
  - all capability fields as columns
  - hybrid: query-critical fields as columns, richer hints as JSON
- Decision: hybrid
- Mode used: auto
- Rationale: query-critical fields must be filterable cheaply, while vendor-specific hints should remain flexible.

### Decision 4

- Topic: Direct artifact generation path
- Options considered:
  - replace deterministic pipelines with direct model completion
  - always use deterministic pipelines
  - choose between direct completion and deterministic pipelines per task type
- Decision: choose dynamically per task type
- Mode used: auto
- Rationale: Some tasks can now finish in one strong run, but presentation/media fidelity still benefits from deterministic pipelines.

### Decision 5

- Topic: Planner intelligence level for v1
- Options considered:
  - heuristics only
  - planner-judge LLM from day one
  - heuristics first with optional planner-judge later
- Decision: heuristics first with optional planner-judge later
- Mode used: auto
- Rationale: lowers billing risk, rollout complexity, and routing opacity in the first release.

### Decision 6

- Topic: Canonical execution plan completeness
- Options considered:
  - keep `TaskExecutionPlan` minimal and define billing/approval fields later
  - define a fuller canonical plan shape up front
- Decision: define a fuller canonical plan shape up front
- Mode used: auto
- Rationale: precedence, approval, and reservation semantics are cross-cutting runtime rules. Keeping them outside the canonical plan would create ambiguity during implementation.

### Decision 7

- Topic: Billing specification clarity
- Options considered:
  - leave reservation/settlement as abstract policy text
  - add a concrete retry billing timeline example
- Decision: add a concrete retry billing timeline example
- Mode used: auto
- Rationale: async retries are the highest-risk path for double charging and accounting drift, so the spec should include one concrete ledger narrative.

### Decision 8

- Topic: Skill model selection architecture
- Options considered:
  - let skills pin model names by default
  - let skills declare capability requirements and resolve concrete models at runtime
  - mixed default with both approaches equally weighted
- Decision: let skills declare capability requirements and resolve concrete models at runtime
- Mode used: auto
- Rationale: this scales across provider/model churn and avoids coupling long-lived skill logic to transient model names.

### Decision 9

- Topic: Resolution timing
- Options considered:
  - resolve model during planning and persist only the chosen name
  - plan with requirements, resolve during execution, and snapshot per started step attempt
- Decision: plan with requirements, resolve during execution, and snapshot per started step attempt
- Mode used: auto
- Rationale: it preserves flexibility before execution while keeping retry/resume/billing reproducible after execution starts.

### Decision 10

- Topic: Source of truth for resolved model state
- Options considered:
  - queue or worker memory owns the resolved model
  - persistent run/step state owns the resolved model snapshot
- Decision: persistent run/step state owns the resolved model snapshot
- Mode used: auto
- Rationale: queue transport is not durable enough for worker reclaim, audit, pricing reconciliation, or approval-gated resumes.

### Decision 11

- Topic: Run plan mutability
- Options considered:
  - allow `task_runs.planJson` to be enriched in place during execution
  - treat `task_runs.planJson` as immutable run intent and store execution enrichments elsewhere
- Decision: treat `task_runs.planJson` as immutable run intent and store execution enrichments elsewhere
- Mode used: auto
- Rationale: resume/replay compatibility is safer when the original planning contract is stable and execution-time details live in step-attempt or billing state.

### Decision 12

- Topic: Approval timing for premium fallback
- Options considered:
  - ask for approval before resolving any premium fallback candidate
  - resolve the candidate first, then apply approval/budget policy before opening the new attempt
- Decision: resolve the candidate first, then apply approval/budget policy before opening the new attempt
- Mode used: auto
- Rationale: approval decisions should be based on the actual candidate route, pricing snapshot, and budget impact rather than on an abstract possibility of escalation.

### Decision 13

- Topic: Run intent vs execution snapshot boundary
- Options considered:
  - keep resolved model fields inside the immutable run plan
  - keep the run plan intent-only and store resolved model snapshots only at step-attempt scope
- Decision: keep the run plan intent-only and store resolved model snapshots only at step-attempt scope
- Mode used: auto
- Rationale: this removes source-of-truth ambiguity and preserves a stable plan contract across replay and resume.

### Decision 14

- Topic: Catalog drift reproducibility
- Options considered:
  - rely on pricing snapshot only
  - persist catalog/capability snapshot identifiers along with the resolved model snapshot
- Decision: persist catalog/capability snapshot identifiers along with the resolved model snapshot
- Mode used: auto
- Rationale: pricing snapshots alone do not explain why route resolution changed when provider capability metadata or enabled-model catalogs drift over time.

### Decision 15

- Topic: Unsupported plan version handling
- Options considered:
  - silently rewrite old plans into the current shape
  - fail closed and require explicit regeneration or migration
- Decision: fail closed and require explicit regeneration or migration
- Mode used: auto
- Rationale: silent rewrites undermine replay safety and make historical execution contracts untrustworthy.

### Decision 16

- Topic: Approval threshold ordering
- Options considered:
  - compare profile/budget strings ad hoc in resolver code
  - define canonical ordering rules in the spec and use them everywhere
- Decision: define canonical ordering rules in the spec and use them everywhere
- Mode used: auto
- Rationale: approval escalation logic must not depend on inconsistent string comparisons across planner, resolver, and billing paths.

### Decision 17

- Topic: Meaning of preferred provider hints
- Options considered:
  - treat `preferredProviderId` as a weak hint
  - treat `preferredProviderId` as a partial lock unless explicitly overridden
- Decision: treat `preferredProviderId` as a weak hint
- Mode used: auto
- Rationale: capability fit, policy constraints, and route health must outrank provider preference in a capability-first runtime.
