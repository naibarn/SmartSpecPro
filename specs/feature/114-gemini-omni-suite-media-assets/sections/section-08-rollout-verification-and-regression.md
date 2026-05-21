# Section 08: Rollout, Verification, and Regression

## Goal

Ship safely behind flags and prove existing media flows still work.

## What This Section Must Change

- Add feature flags for:
  - Gemini Omni suite UI
  - provider asset creation
  - director skill
  - prompt QA
  - video QA
  - auto-learning recommendations
  - Production/Director tab
  - ProductionGoal visual canvas
  - Production Storyboard Planner
  - Production Plan Verifier
  - cross-modal asset orchestration
  - final provider selection
  - production quality loop and final render
  - dual Storyboard Review / Video Edit output
  - optional Agency Swarm reviewer packs
  - optional LangGraph batch runtime
- Add rollout docs or admin notes.
- Add regression tests for non-Gemini media models.
- Add migration/backfill safety checks for existing Gemini Omni configs.
- Add feature-flag off-state tests for every new surface.
- Add QA-disabled fallback tests so generation can still work when QA flags are off.
- Add callback/polling deduplication and recovery regression tests.
- Add result re-hosting and provider URL redaction regression tests.
- Add rate-limit/deferred retry regression tests.
- Add sanitized audit/observability checks for lifecycle events.
- Add RBAC regression tests for provider asset list/use/create/delete/restore/purge.
- Add budget/concurrency/rate-limit preflight regression tests.
- Add retention/purge regression tests for provider assets.
- Add policy/consent acknowledgment regression tests for character/voice asset creation.
- Add readiness diagnostics for env/config/storage/pricing/skill state.
- Add migration verification, seed idempotency, and rollback-preflight checks.
- Add provider contract drift fixture tests.
- Add visual/responsive/a11y smoke checks.
- Add admin runbook and user help documentation checks.
- Add reconciliation lifecycle regression tests.
- Add stable reason-code contract tests.
- Add no-live-provider CI guardrails and opt-in live smoke test docs.
- Add SLO/alert checks for provider submit failures, callback duplicates, orphan reconciliation, re-host failures, refund failures, and storyboard partial failures.
- Add production quality gate release tests for validators, reviewer verdict aggregation, loop limits, credit reservation blocking, and human override audit.
- Add helper-script offline verification checks for every Gemini Omni skill package.
- Add Production Director release tests for planning-only runs, asset readiness, Storyboard Review handoff, and final-provider preflight.
- Add Video Edit handoff release tests for edit project creation, idempotent reopen/update, and source-of-truth boundaries.
- Add Production persistence release tests for goal versions, plan versions, verifier results, approvals, and output projection mappings.
- Add feature-flag dependency tests so batch execution cannot be enabled without persistence, planner, verifier, and approval gates.
- Add planner/verifier prompt-injection, evidence minimization, redaction, retention, and cost-accounting tests.
- Add Seedance 2/future provider regression tests only through mocked provider-capability fixtures, unless live smoke flags explicitly opt in.

## Verification Commands

- `npm --prefix apps/web test`
- `npm --prefix apps/web run check`
- `cd python-backend && DEBUG=false PYTEST_ADDOPTS=--no-cov uv run pytest tests/unit/llm_proxy/test_kie_ai_provider_model_resolution.py`
- focused UI tests for Media Studio Gemini Omni panel
- skill verification scripts for all new Gemini Omni skills
- migration and seed idempotency checks
- provider asset tenant isolation checks
- Media Studio feature-flag off-state checks
- callback/polling terminal dedup checks
- result re-hosting checks
- audit/log redaction checks
- asset RBAC checks
- budget/rate/concurrency denial checks
- asset retention/purge checks
- consent/policy acknowledgment checks
- readiness diagnostics checks
- migration verification checks
- provider contract fixture checks
- visual/responsive/a11y checks
- docs/runbook completeness checks
- reconciliation lifecycle checks
- stable reason-code checks
- no-live-provider CI checks
- SLO/alert threshold checks
- production quality gate checks
- human override audit checks
- helper-script offline/machine-readable output checks
- Production Director planning-only checks
- cross-modal asset plan readiness checks
- final provider selection fixture checks
- Storyboard Review production handoff checks
- Video Edit production handoff checks
- Production persistence/resume checks
- feature-flag dependency checks
- planner/verifier prompt-injection hardening checks
- production artifact retention/redaction checks
- planner/verifier cost accounting checks

## Delivery Slice Gates

Do not release this work as one monolithic feature. Each slice must be independently testable, releasable, observable, and rollbackable.

1. Foundation and persistence: additive validation, metadata, pricing, provider asset storage, production run/version records, feature flags, and readiness diagnostics. No new normal-user UI should submit provider jobs from this slice.
2. Gemini Omni base video: prompt, reference images, one source video, corrected Kie pricing, polling, callbacks, and result re-hosting. Character/audio asset creation remains hidden for broad users.
3. Gemini Omni Director skill and Prompt QA: skill package loading, schemas, prompt QA, and cost display. Video generation still works when QA is disabled.
4. ProductionGoal planning preview: visual goal canvas, templates, clarification, save/version/revision trail. This slice must not reserve provider credits, submit provider jobs, or create Storyboard Review/Video Edit output records.
5. Planner/verifier approval gate: planner and verifier create a reviewable package with approve/revise/lock actions and persisted approval records. Normal-user batch execution remains disabled until approval persistence and warning acceptance are proven.
6. Provider assets: Gemini Omni Character and Audio creation/selection, RBAC, consent, retention, reconciliation, and asset snapshots. Existing prompt/image/video-only Gemini Omni generation remains usable if this slice is disabled.
7. Cross-modal asset readiness: ProductionAssetPlan checklist and routing to existing Image, Video, and Audio tabs for missing assets. Final render stays disabled until required assets, product truth, quality gate, budget, and provider preflight pass.
8. Internal/admin batch execution: quality loop, credit reservation, provider submission, post-generation QA, targeted revisions, and learning capture for controlled tenants only.
9. Dual output projections: Storyboard Review and Video Edit handoffs, idempotent mapping, stale-write safety, no fake media URLs, and separate render/export cost labeling.
10. Marketplace/Feature 115 storytelling: product evidence handoff, claim support, image fidelity, customer journey alignment, and hard policy block handling.
11. Optional advanced orchestration: Agency reviewer packs and LangGraph batch runtime behind separate flags, after default deterministic state-machine behavior is stable.

Slice dependency tests must prove that later flags cannot unlock normal-user batch execution when any required earlier slice is disabled or failed readiness diagnostics.

## Rollback Rules

- Disabling suite UI hides new Gemini Omni panels.
- Stored provider assets remain intact.
- Existing generated media remains available.
- Non-Gemini Media Studio generation remains usable.
- Incomplete storyboard runs keep completed clip records and can be resumed or reviewed.
- Callback disablement or callback failure falls back to polling/recovery.
- Disabling asset creation does not hide existing usable assets unless selection is separately disabled.
- Soft-deleted assets remain hidden from normal pickers but can be inspected/restored by authorized admins where policy allows.
- Missing callback config falls back to polling/recovery.
- Disabling Director/QA flags follows documented fallback behavior without deleting skill packages.
- Reconciliation jobs can continue after rollback flags hide new UI.
- Disabling production quality gate should not be allowed in production unless a tenant emergency override flag is explicitly enabled and audited.
- Rolling back skill packages must keep the previous contract version available for in-flight Gemini Omni runs until they finish or are cancelled.
- Disabling Production/Director tab must leave standalone Image, Video, and Audio tabs usable.
- Disabling ProductionGoal canvas must not delete production run records or approved plans.
- Disabling planner/verifier prevents new normal-user batch starts but preserves existing approved runs for review/support.
- Disabling final provider selection must prevent new production final renders but keep completed and review-only storyboard records available.
- Rolling back cross-modal asset orchestration must not delete prepared library assets, provider assets, production runs, or historical asset snapshots.
- Disabling Video Edit handoff must not affect Storyboard Review access, existing edit projects, completed media, production runs, or provider asset snapshots.
- Disabling Agency reviewer packs or LangGraph batch runtime must fall back to default planner/verifier and deterministic state-machine behavior.
- Rolling back any slice must preserve durable records from earlier slices and must not delete provider assets, production runs, approved plans, storyboard review records, video edit projects, or generated media.
- Rolling back planning-only slices must leave existing Image, Video, Audio, Gemini Omni base video, Storyboard Review, and Video Edit flows usable through their existing paths.
- Rolling back dual output projections must stop new handoffs but keep existing Storyboard Review records and Video Edit projects accessible.

## Completion Criteria

- Feature can be enabled gradually.
- Rollback does not require deleting data.
- Regression tests protect existing media generation paths.
- Operators can verify the suite is disabled/enabled without editing raw model config manually.
- Support can diagnose provider lifecycle issues from sanitized audit/log events.
- Tenant admins can understand asset counts/status and pricing readiness without seeing raw provider secrets or IDs by default.
- Release cannot proceed without readiness diagnostics, rollback criteria, and docs/runbook coverage.
- CI remains deterministic and cost-safe because provider tests are mocked unless live smoke flags are explicitly enabled.
- Release cannot proceed if the production quality gate can be bypassed without audit or if failed preflight still reserves provider credits.
- Release cannot proceed if Production/Director planning can submit a final provider job before asset readiness and quality gate pass.
- Release cannot proceed if Production Director state exists only in browser/local storage or opaque unversioned JSON.
- Release cannot proceed if feature flags allow batch execution without planner/verifier approval gates.
- Release cannot proceed if untrusted marketplace/user evidence can override planner/verifier schema, permissions, budget, approval, provider choice, or output routing.
- Release cannot proceed if planner/verifier raw evidence or prompts are logged/persisted contrary to retention/redaction policy.
- Release cannot proceed if Video Edit handoff can mutate original provider submission, credit, provider asset, or historical generation records.
- Release cannot proceed if implementation slices are not independently flaggable, testable, and rollbackable.
- Release cannot proceed if a later slice can be enabled before its required prior slice readiness checks pass.
- Release cannot proceed if planning-only slices can reserve credits, submit provider jobs, create downstream projections, or mutate existing standalone tab behavior.
- Rollback preserves existing media tasks, production runs, storyboard review records, and provider asset snapshots.
