# Decision Log

## 2026-03-09

### Step 5 - Decision mode
- Options considered: `ask_every_choice`, `smart_auto`, `auto_by_default`
- Decision taken: `smart_auto`
- Mode used: `asked`
- Rationale: user explicitly selected the balanced mode that keeps high-impact choices interactive while allowing low-impact planning choices to proceed automatically.

### Step 6 - Recon scope
- Options considered: limit recon to raw browser route only; inspect raw browser route plus automation copilot; inspect raw browser route, automation copilot, approval stack, tenant controls, schema, and tests
- Decision taken: inspect the end-to-end browser automation stack plus approval, tenant, schema, and test surfaces
- Mode used: `auto`
- Rationale: the feature spans Node routing, Python execution, approvals, tenant governance, and storage. Narrower recon would miss integration risks that materially affect the plan.

### Step 7 - Web research selection
- Options considered: skip web research; select a subset of topic proposals; research all proposed topics
- Decision taken: research all proposed topics
- Mode used: `asked`
- Rationale: user selected `apply_all`, so the plan can incorporate external guidance for approvals, classifiers, trust boundaries, partitioning, rollout metrics, and multitenant config patterns.
## 2026-03-10 - Step 4.1 Planning Intent

- options considered: `resume_progress`, `improve_existing_plan`, `rebuild_from_spec`
- decision taken: `resume_progress`
- mode used: `asked`
- rationale: Existing artifacts already include the core plan outputs, and the user chose to continue from the current progress rather than regenerating or refreshing the plan.

## 2026-03-10 - Step 12 Context Check

- options considered: `Continue`, `/clear + re-run`
- decision taken: `Continue`
- mode used: `asked`
- rationale: User chose to proceed with the current context and keep the resume flow moving into automated review.

## 2026-03-10 - Step 13 Automated Review

- options considered: `external_llm`, `self_review`
- decision taken: `self_review`
- mode used: `auto`
- rationale: External review credentials were unavailable in the environment, so the workflow required self review.

## 2026-03-10 - Step 14 Review Integration

- options considered: apply low-impact review suggestions automatically; stop for per-item review decisions
- decision taken: apply all low-impact review suggestions automatically
- mode used: `auto`
- rationale: All iteration-1 review findings were low-impact clarifications that strengthened verification and operational safety without changing the agreed architecture, so `smart_auto` allowed direct integration.

## 2026-03-10 - Step 15 User-requested Plan Hardening

- options considered: patch only the narrow review findings; reconcile the plan fully against the broader spec requirements
- decision taken: reconcile the plan fully against the broader spec requirements
- mode used: `asked`
- rationale: The user explicitly requested a more complete patch. The plan was updated to add the missing workflow entitlement layer, explicit data-handling and bulk guardrails, audit and forensic requirements, incident controls, and safer rollout semantics so the implementation plan now matches the approved spec more closely.

## 2026-03-10 - Step 15 Spec/Plan Consistency Pass

- options considered: leave minor inconsistencies for later TDD drafting; reconcile plan/spec artifacts immediately
- decision taken: reconcile plan/spec artifacts immediately
- mode used: `asked`
- rationale: The user requested another pass. The plan now locks the dedicated browser decision enum, explicit fail-closed fallback semantics for unknown and low-confidence contexts, and a synchronized implementation spec so downstream TDD and section splitting start from one consistent design.

## 2026-03-10 - Step 15 Final Residual Gap Closure

- options considered: keep remaining operational constants implicit in the source spec; promote them into plan/spec artifacts now
- decision taken: promote remaining operational constants into the plan/spec artifacts now
- mode used: `asked`
- rationale: The final consistency pass surfaced three remaining gaps: explicit approval TTL bounds, the approved three-tier iframe trust model, and rollout gate thresholds. These are now carried into the planning artifacts so downstream implementation and verification steps do not have to infer them from the long-form source spec.

## 2026-03-10 - Step 15 Approval Contract Alignment

- options considered: leave approval invalidation and payload details implied by the source spec; make them normative in the plan/spec artifacts
- decision taken: make approval invalidation and payload details normative in the plan/spec artifacts
- mode used: `asked`
- rationale: The final review identified two spec-alignment gaps that could create Node/Python drift: execution-time approval invalidation semantics and the exact approval payload/data-model contract. The planning artifacts now carry the 20 percent DOM drift threshold, context-hash re-check, `approval_context_changed` audit reason, and the explicit approval payload/model fields needed for consistent implementation.

## 2026-03-10 - Step 16 TDD Plan

- options considered: infer new testing conventions for this feature; mirror the repo's existing Vitest and pytest patterns
- decision taken: mirror the repo's existing Vitest and pytest patterns
- mode used: `auto`
- rationale: The codebase already has strong test conventions on both the web and Python sides, so the TDD plan should reuse those paths and naming patterns rather than inventing new structure.

## 2026-03-10 - Step 17 Context Check Before Section Splitting

- options considered: `Continue`, `/clear + re-run`
- decision taken: `Continue`
- mode used: `asked`
- rationale: User chose to continue in the current context and proceed directly into section generation.

## 2026-03-10 - Steps 18-20 Section Planning

- options considered: a smaller section count with broad mixed responsibilities; a more granular section split aligned to storage, policy, approvals, enforcement, trust controls, audit, and rollout
- decision taken: a seven-section split aligned to implementation boundaries
- mode used: `auto`
- rationale: The feature spans Node, Python, approvals, audit, and rollout operations. Seven sections kept each unit self-contained and implementation-ready without creating artificial fragmentation.

## 2026-03-10 - Step 21 Section Validation

- options considered: stop after writing section files; validate section completeness with the workflow checker
- decision taken: validate section completeness with the workflow checker
- mode used: `auto`
- rationale: The deep-plan workflow requires final section validation. `check-sections.py` returned `state: complete` with `progress: 7/7`.

## 2026-03-10 - Step 22 Implement Readiness Constant Alignment

- options considered: leave constant-level contract details implicit in the section/spec artifacts; make them explicit before implementation starts
- decision taken: make them explicit before implementation starts
- mode used: `asked`
- rationale: The final implementation-readiness review found two remaining drift risks: `payload_preview_hash` needed to be treated more clearly as part of the approval verification contract, and cross-site iframe handling needed the explicit `cross_site_iframe` reason code carried into implementation artifacts. Those constants are now locked in the implementation handoff.
