# Orchestra Plan — Feature 201 Spec/Implementation Convergence Audit

# Current Audit — Specs 202/203 follow-up

## Task Classification
- Scope: large
- Risk: high
- Route: direct-inline-waves in standard-light mode; no sub-agents available
- Goal: run at least 10 independent spec/code/runtime audit rounds and immediately repair safe in-scope gaps
- SocratiCode: unavailable in current MCP tool set; use targeted shell discovery and record this fallback
- Worktree: already dirty; preserve unrelated changes and avoid destructive cleanup

## Acceptance
- 10+ independent audit rounds recorded
- no safe in-scope MUST_FIX or MUST_DO_NOW gap remains
- fresh focused tests and runtime/import checks pass after the final repair
- external browser/Windows/deployment/production evidence is classified as a gate, not inferred from local tests

## Task Classification
- Scope: large
- Risk: high
- Affected domains: shared contracts, Drizzle persistence/migration, API/auth/tenant scoping, worker runtime, compound/render pipelines, React UI/navigation, rights/evidence verification
- Estimated file count: >10 read; edits only when a concrete gap is proven
- Chosen route: direct-inline-waves — review/repair/convergence loop in standard light mode
- Bug route: false
- Classification notes: The user requested a spec-to-code completeness audit across an already implemented cross-domain feature, with immediate repair of any safe in-scope gap. The work includes tenant/user isolation, public review tokens, final artifact gating, DB migration, worker capability admission, and browser-visible UI, so it is large/high risk.

## Intent and Evidence
- Intent signals: "วนตรวจสอบ", "เปรียบเทียบกับ spec", "มี block/gap", and "ปรับปรุงทันที" explicitly require review plus execution.
- SocratiCode: unavailable in the current MCP tool set; use narrowed `rg`, targeted reads, symbol/call-path inspection, tests, and the existing Feature 201 audit artifact as fallback.
- Existing baseline: Feature 201 deep-plan and deep-implement artifacts report 10/10 sections and a prior 15-round audit. This session independently rechecks the current worktree and does not treat that report as sufficient by itself.

## Audit Acceptance
- Run at least 10 independent rounds; each round must record boundary, evidence, result, finding classification, and next action.
- Compare spec requirements to implementation and tests, including final compound integration, image/video/audio modality, UI navigation, permission controls, tenant isolation, and rollout gates.
- Fix every safe in-scope MUST_FIX or MUST_DO_NOW finding immediately.
- Rerun all stale focused gates after each code/config/schema change.
- Stop only after two consecutive clean convergence rounds in the standard-light high-risk review path, or report an explicit external/product blocker.

Follow-up audit target is 16 rounds so repaired code and documentation have two
fresh consecutive clean convergence rounds after the final change. The audit
records are under each spec's `implementation/audits/` folder.

# Current UI/UX Improvement Plan — Specs 202/203

- Target: active Web Video Editor (`/video-editor`) and `/worker-jobs` UI/UX
  convergence, not a new runtime or project model.
- Plan: six ordered sections under
  `specs/feature/202-ai_rough_cut_video_editor_unified/implementation/sections/`.
- Order: UI foundation/accessibility → revision/conflict safety → execution and
  capability/job truth → AI/change-set/transcript/QC review → responsive visual
  consistency → browser evidence and rollout.
- Planning quality gates: section manifest complete (6/6) and UI contracts
  complete (6/6); final self-review records are in `implementation/reviews/`.
- Implementation must preserve existing dirty worktree changes and keep
  browser/Windows/deployment/production checks as explicit evidence gates.

## Fresh 15-round convergence result — Specs 202/203

- The fresh session completed 15 rounds, including two clean convergence reads
  after the active runtime repair and documentation reconciliation.
- The repaired boundary is `editorMediaJobContract.resolveEditorRuntimeRouting`
  plus `editorMediaJobs.submit`: composition scan is Node-owned and fails closed
  before billing/job creation when the Node lane is disabled.
- The current Web route, revision pin, snapshot admission, capability claims,
  migration markers, and explicit external release gates were rechecked.
- Fresh records: `implementation/audits/15-round-audit-2026-09-18.md` under
  both Spec 202 and Spec 203.
