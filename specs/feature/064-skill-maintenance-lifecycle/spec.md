# 064 - Skill Maintenance Lifecycle, Safe Upgrade Advice, and GenJS Migration

Version: 1.0
Date: 2026-03-30
Status: Proposed
Audience: Admin, Platform, Skills Runtime, ISC, Sandbox, Scheduler, QA

---

## 1. Executive summary

SmartSpecPro already has:

- a large Admin Skills surface
- an ISC-powered proposal flow
- sandbox execution for `sandbox-command`
- skill sync and manifest utilities
- scheduling patterns for background work

What is missing is a governed maintenance lifecycle for existing skills.

Admins need to be able to:

1. select an existing skill
2. run an analysis pass
3. receive structured recommendations
4. understand whether a recommendation is safe and non-breaking
5. approve or reject the change
6. apply the upgrade through a controlled runner
7. verify that the skill still preserves its current contracts

This spec introduces that lifecycle and extends it to support:

- recurring maintenance sweeps across all skills
- recommendation queues for later review
- safe `migrate-to-genjs` upgrades
- bundle scaffolding with `skill.manifest.json + src/index.mjs`
- fixture tests and compatibility gates
- per-skill orchestration / handoff configuration in Admin > Skills

The core goal is to improve skill quality continuously without breaking existing callers.

---

## 2. Problem statement

Today, maintenance of skills is fragmented:

- admins can edit metadata but do not get structured upgrade advice
- ISC proposals exist, but the proposal queue is not a general maintenance system
- there is no durable recommendation history or quality score per skill
- there is no compatibility gate that blocks unsafe changes to input/output contracts
- `migrate-to-genjs` is not a governed path for older skills
- batch review and scheduled sweeps do not exist
- orchestration settings for downstream handoff or swarm execution are not configurable from Admin > Skills

This leads to:

- skill drift
- inconsistent manifests, schemas, and tests
- missed opportunities to modernize JSON-heavy skills into GenJS bundles
- manual review without durable records
- higher risk when improving public or shared skills that other systems already call

---

## 3. Goals

1. Add a maintenance analysis flow to Admin > Skills for a single selected skill.
2. Persist maintenance recommendations, quality scores, risks, and review status in the database.
3. Add a compatibility gate that prevents unsafe contract-breaking upgrades from being auto-applied.
4. Add batch and scheduled sweeps that scan skills and queue advice for admin review.
5. Reuse ISC / Skill Studio proposal mechanics where possible, but separate maintenance concerns from ad hoc creation flows.
6. Add a first-class `migrate-to-genjs` recommendation and upgrade path.
7. Ensure GenJS migration can provision bundle files, runtime manifests, package metadata, helper modules, and smoke/fixture tests.
8. Add orchestration configuration to the Admin Skills edit experience.
9. Provide a complete maintenance loop:
   - analyze
   - recommend
   - preview
   - approve
   - apply
   - verify
   - audit

---

## 4. Non-goals

1. This feature does not automatically rewrite every skill in one pass.
2. This feature does not allow auto-apply of breaking contract changes.
3. This feature does not replace the existing manual edit flow in Admin > Skills.
4. This feature does not bypass sandbox restrictions or install arbitrary host dependencies.
5. This feature does not let maintenance jobs silently change public skill behavior without admin approval.

---

## 5. Primary user stories

### 5.1 Single-skill maintenance review

An admin opens Admin > Skills, chooses one skill, clicks `Analyze`, and receives:

- quality score
- risks
- recommendations
- whether the skill is a `migrate-to-genjs` candidate
- what files would change
- whether the change is contract-safe

The admin can then:

- dismiss the advice
- save it for later
- apply it immediately if safe
- generate a proposal for manual review if not safe enough for direct apply

### 5.2 Scheduled fleet review

An admin creates a maintenance schedule that scans:

- all skills
- or a subset by category / runtime / visibility / owner / risk profile

The sweep stores per-skill recommendations. No changes are applied automatically unless the recommendation is explicitly classified as low-risk and the schedule allows safe auto-apply.

### 5.3 Safe GenJS migration

An admin sees that a skill is a strong GenJS candidate because it is:

- JSON-heavy
- pipeline-oriented
- artifact-oriented
- likely to benefit from Node.js libraries such as PptxGenJS

The system can produce a migration preview and, after approval, create:

- `skill.manifest.json`
- `package.json`
- `src/index.mjs`
- modular helper files
- fixture tests
- compatibility snapshots

without breaking the previous contract.

### 5.4 Orchestration-aware skills

An admin can edit a skill and configure whether it is able to:

- run locally only
- hand off to another skill
- use agency swarm execution
- use hybrid orchestration

These settings should be explicit and auditable.

---

## 6. Current-codebase fit

This feature should extend, not replace, the existing system.

Key integration points:

- `apps/web/client/src/pages/AdminSkills.tsx`
- `apps/web/server/routers/skills.ts`
- `apps/web/server/services/skillStudioService.ts`
- `apps/web/server/services/skillExecutor.ts`
- `apps/web/server/services/skillFiles.ts`
- `apps/web/server/services/skillRegistry.ts`
- `apps/web/server/services/scheduler.ts`
- `apps/web/server/jobs/pendingApprovalAlert.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/skills/intelligence-skill-creator/*`

The maintenance system should reuse:

- skill folder resolution and manifest helpers
- existing ISC proposal application flow
- existing sandbox-command execution path
- existing admin skill editor
- existing scheduler / job patterns

---

## 7. Functional requirements

### 7.1 Maintenance analysis domain

The system must be able to analyze one skill and compute:

- current runtime profile
- current execution mode
- schema completeness
- manifest completeness
- tests presence and quality
- fixture coverage
- sandbox profile correctness
- suitability for GenJS migration
- suitability for downstream orchestration configuration
- stale docs or stale bundle files
- quality score
- recommendation list

### 7.2 Recommendation persistence

Recommendations must be stored durably and queryable by:

- skill
- status
- risk
- category
- recommendation type
- last analyzed time
- last applied time

### 7.3 Compatibility protection

Before apply, the system must compare against a stored or newly built contract snapshot.

The apply path must block if:

- required input fields are removed
- existing input types become incompatible
- required output fields are removed
- output structure becomes incompatible
- runtime changes would invalidate current execution assumptions
- existing tests or fixtures prove a regression

### 7.4 Admin review flow

The admin must be able to:

- analyze one skill
- view recommendations
- preview recommendation details
- apply a recommendation
- dismiss a recommendation
- rerun analysis
- compare before/after contract snapshots before approving
- see whether the recommendation is safe for auto-apply, proposal-only, or blocked

### 7.5 Scheduled maintenance flow

The system must support scheduled sweeps that:

- analyze all skills or a filtered subset
- persist one recommendation set per analyzed skill
- record a sweep run and child per-skill runs
- never auto-apply a breaking change
- optionally auto-apply only recommendations classified as safe, low-risk, and contract-compatible

### 7.6 GenJS migration flow

The system must be able to classify a skill as a GenJS migration candidate when the skill is strongly associated with:

- JSON-heavy input and output structures
- schema-driven behavior
- multi-stage parse/classify/normalize/plan/render workflows
- Node.js-native library usage
- artifact composition such as slide, document, storyboard, or report generation

The migration preview must include:

- target bundle structure
- runtime/tooling expectations
- files to create
- files to modify
- compatibility snapshot diff
- expected verification steps

### 7.7 Orchestration config flow

The admin edit experience must allow configuration for:

- `local`
- `skill-handoff`
- `agency-swarm`
- `hybrid`

The saved configuration must round-trip cleanly through the existing skill edit flow without altering unrelated fields.

---

## 8. Compatibility contract policy

This feature must treat existing skill contracts as production interfaces.

### 8.1 Inputs that must be protected

- `input.schema.json`
- `ui.schema.json`
- manifest/runtime entrypoints
- implied caller expectations from current execution mode
- fixture or sample inputs already in use by tests or verified examples

### 8.2 Outputs that must be protected

- required output fields
- response envelope shape
- file/artifact output contract
- JSON object structure relied on by other services

### 8.3 Safe changes

These may be auto-applied when verification passes:

- docs refreshes
- added fixture tests
- added manifests when behavior remains compatible
- added helper modules
- improved sandbox metadata
- non-breaking validation tightening
- non-breaking runtime annotations

### 8.4 Blocked changes

These must not auto-apply:

- removing required input fields
- changing input or output types incompatibly
- removing required output fields
- changing runtime mode in a way that breaks callers
- changing entrypoint assumptions without a migration plan
- altering artifact payload shapes without explicit approval

---

## 9. Data model requirements

The maintenance domain must persist:

1. recommendations
2. runs
3. contract snapshots
4. maintenance schedules

Each record must support audit-friendly timestamps and enough metadata to reconstruct:

- who initiated the action
- what was proposed
- what verification ran
- whether compatibility passed or blocked
- which skill version/runtime profile was involved

---

## 10. Admin UX requirements

### 10.1 Skill table actions

Each skill row in Admin > Skills should eventually expose:

- `Analyze`
- `View Advice`
- `Apply Upgrade`

### 10.2 Maintenance queue

The `Maintenance` tab should support:

- queue listing
- risk filtering
- recommendation type filtering
- GenJS candidate filtering
- status filtering
- stale-analysis filtering
- detail preview

### 10.3 Edit dialog orchestration section

The edit dialog must include an `Orchestration & Handoff` section with:

- mode selector
- downstream target config
- endpoint config
- parallel vs sequential preference
- fallback behavior
- explicit opt-in warning

---

## 11. Delivery slices

### Slice 1

Foundations:

- maintenance enums
- maintenance tables
- shared types
- migration SQL
- schema tests

### Slice 2

Analyzer and contract snapshots:

- analyzer service
- quality score
- GenJS candidate scoring
- snapshot hashing
- compatibility diff primitives

### Slice 3

Single-skill review APIs:

- analyze
- list
- detail
- dismiss

### Slice 4

Admin review UI:

- new actions
- maintenance tab
- detail panel

### Slice 5

Apply runner and verification loop:

- compatibility gate
- proposal/direct-apply routing
- run logging

### Slice 6

Scheduled sweeps:

- schedule CRUD
- sweep runner
- review queue integration

### Slice 7

GenJS migration and tooling bootstrap:

- migration planner
- bundle scaffolding
- fixture generation
- smoke metadata

### Slice 8

Orchestration config and final verification:

- admin edit support
- persistence
- regression coverage

---

## 12. Acceptance criteria

The feature is considered complete only when:

1. an admin can analyze a single skill and receive persisted recommendations
2. recommendations include risk, compatibility state, affected files, and quality score
3. blocked recommendations cannot be auto-applied
4. the system can run scheduled sweeps and persist queue items for later review
5. the admin can view and manage the maintenance queue
6. GenJS migration recommendations can preview a bundle layout and required tooling
7. the admin edit dialog can save orchestration config without breaking existing edit flows
8. verification tests prove that existing skill input/output contracts remain intact for safe upgrades
9. audit records exist for analysis, approval, apply, verify, and failure outcomes

---

## 13. Risks and mitigations

### Risk: over-eager upgrades break skill callers

Mitigation:

- compatibility snapshots
- hard blocks on breaking diffs
- safe auto-apply limited to low-risk recommendations

### Risk: maintenance queue becomes noisy

Mitigation:

- recommendation dedupe rules
- quality/risk filters
- stale-analysis markers

### Risk: GenJS migration creates incomplete Node.js bundles

Mitigation:

- canonical ISC GenJS scaffold reuse
- manifest/package/tool bootstrap checks
- fixture tests plus sandbox smoke verification

### Risk: orchestration config becomes too permissive

Mitigation:

- explicit opt-in UI
- validation rules
- endpoint/mode compatibility checks

---

## 14. Success metrics

- single-skill analysis returns a durable recommendation set
- maintenance queue supports practical admin triage
- safe recommendations can be applied with passing verification
- blocked recommendations surface clear reasons
- GenJS candidate detection highlights the right JSON-heavy / artifact-heavy skills
- no existing skill edit/import/proposal flow regresses
- inspect previous apply runs

### 7.5 Scheduled sweeps

The system must support scheduled maintenance sweeps with filters:

- all skills
- by category
- by execution mode
- by visibility
- by owner
- GenJS candidates only
- skills missing tests
- skills with stale recommendation dates

### 7.6 GenJS migration path

When a skill is a strong candidate, the system must be able to produce a migration plan that:

- preserves current input/output contract
- upgrades the skill into a bundle layout
- verifies tooling/runtime requirements
- generates helper modules and support files
- adds fixture tests and smoke tests

### 7.7 Orchestration configuration

Admin > Skills edit mode must expose downstream orchestration settings:

- default orchestration mode
- skill handoff enablement
- agency swarm enablement
- hybrid mode enablement
- default endpoints / target ids
- parallelism policy
- fallback behavior

### 7.8 Audit trail

Every maintenance run must record:

- who triggered it
- what recommendation was produced
- whether apply was attempted
- what diff or proposal was produced
- what verification passed or failed

---

## 8. Data model

### 8.1 New tables

#### `skill_improvement_recommendations`

Stores the latest actionable recommendations per skill.

Suggested fields:

- `id`
- `skillId`
- `recommendationType`
- `status`
- `riskLevel`
- `qualityScore`
- `summary`
- `detailsJson`
- `compatibilityStatus`
- `isGenjsCandidate`
- `proposedRuntime`
- `createdAt`
- `updatedAt`
- `createdBy`
- `dismissedAt`
- `dismissedBy`
- `appliedAt`
- `appliedBy`

#### `skill_improvement_runs`

Stores each analyze/apply/verify attempt.

Suggested fields:

- `id`
- `skillId`
- `runType` (`analyze`, `apply`, `verify`, `sweep`)
- `status`
- `recommendationId`
- `summary`
- `diffPath`
- `proposalFile`
- `logJson`
- `metricsBeforeJson`
- `metricsAfterJson`
- `startedAt`
- `finishedAt`
- `triggeredBy`

#### `skill_contract_snapshots`

Stores non-breaking compatibility baselines.

Suggested fields:

- `id`
- `skillId`
- `snapshotType`
- `inputSchemaHash`
- `outputSchemaHash`
- `manifestHash`
- `testsHash`
- `sampleInputJson`
- `sampleOutputJson`
- `snapshotJson`
- `createdAt`
- `createdBy`

#### `skill_maintenance_schedules`

Stores maintenance sweep schedules.

Suggested fields:

- `id`
- `name`
- `scopeJson`
- `cronExpression`
- `isEnabled`
- `allowSafeAutoApply`
- `lastRunAt`
- `nextRunAt`
- `createdBy`
- `createdAt`
- `updatedAt`

### 8.2 Existing tables to extend

#### `skills`

The existing `skills` table should remain the source of truth for runtime metadata.

It may be extended with optional maintenance-related pointers only if needed, but recommendation history should not be collapsed into `configJson`.

#### `skills.configJson` / `executionPolicyJson`

These should store runtime configuration, not historical recommendations.

Use them for:

- orchestration defaults
- preferred upgrade policy flags
- bundle/runtime preferences

but not as the primary store for recommendation history.

---

## 9. Recommendation taxonomy

The analyzer should support at least these recommendation types:

- `schema-tightening`
- `missing-tests`
- `missing-fixtures`
- `manifest-hardening`
- `runtime-hardening`
- `sandbox-profile-fix`
- `docs-refresh`
- `output-contract-normalization`
- `orchestration-config`
- `migrate-to-genjs`
- `bundle-layout-upgrade`
- `artifact-pipeline-modernization`

---

## 10. Compatibility rules

### 10.1 Safe changes

These may be auto-applied if a schedule allows it:

- docs updates
- fixture additions
- missing test additions
- internal helper modules
- manifest enrichment
- non-breaking sandbox metadata fixes

### 10.2 Breaking or potentially breaking changes

These must be blocked from auto-apply:

- removing required input fields
- changing field types incompatibly
- removing required output fields
- changing output structure incompatibly
- changing execution mode in a way that invalidates callers
- removing trigger patterns or manifest identity fields used operationally

### 10.3 Required verification loop

For each apply attempt:

1. capture baseline snapshot
2. generate patch / proposal / migration plan
3. run compatibility diff
4. run unit/integration tests
5. run fixture tests
6. run sandbox smoke test if relevant
7. record run result

If any mandatory check fails, the apply is rejected.

---

## 11. GenJS migration requirements

When migrating a skill to GenJS, the upgrade path must provision:

- `skill.manifest.json`
- `package.json`
- `src/index.mjs`
- `src/parse.mjs`
- `src/classify.mjs`
- `src/normalize.mjs`
- `src/planner.mjs`
- `src/renderer.mjs`
- `src/orchestration.mjs` when relevant
- `examples/demo.input.json`
- `tests/fixtures/*`

The migration planner must also determine:

- required sandbox profile
- whether network access is required
- whether browser access is required
- expected Node / package dependencies
- whether PptxGenJS or other bundle-time libraries are needed

The runtime must verify that declared tooling can run through the current sandbox-command path.

---

## 12. Admin UI requirements

### 12.1 Skills table actions

Each eligible skill row should gain:

- `Analyze`
- `View Advice`
- `Apply Upgrade`

### 12.2 Maintenance tab

Admin > Skills should gain a `Maintenance` tab with:

- recommendation queue
- filters by risk / status / category / type / GenJS candidate
- quality score summary
- last analyzed timestamp
- compatibility status

### 12.3 Recommendation detail view

Each recommendation detail should show:

- summary
- risk
- compatibility result
- affected files
- migration target if any
- verification requirements
- diff / proposal preview

### 12.4 Edit dialog orchestration config

The existing edit dialog should gain a section for:

- local / handoff / swarm / hybrid
- default downstream skill targets
- default agency targets
- endpoint configuration
- execution parallelism
- fallback behavior

---

## 13. API and service requirements

### 13.1 New tRPC procedures

The `skills` router should gain procedures such as:

- `analyzeUpgrade`
- `listUpgradeRecommendations`
- `getUpgradeRecommendationDetail`
- `applyUpgradeRecommendation`
- `dismissUpgradeRecommendation`
- `runMaintenanceSweep`
- `listMaintenanceSchedules`
- `createMaintenanceSchedule`
- `updateMaintenanceSchedule`

### 13.2 New services

Suggested new services:

- `skillMaintenanceAnalyzer.ts`
- `skillCompatibilityGate.ts`
- `skillUpgradePlanner.ts`
- `skillUpgradeApplier.ts`
- `skillMaintenanceScheduler.ts`

These services should integrate with the existing:

- `skillStudioService.ts`
- `skillExecutor.ts`
- `skillFiles.ts`
- `skillRegistry.ts`

---

## 14. Security and safety requirements

1. No upgrade may silently expand host-level file access.
2. No maintenance runner may bypass sandbox restrictions.
3. Relative endpoint resolution for orchestration settings must be explicit and validated.
4. GenJS migration must not install arbitrary dependencies on the host machine.
5. Public skills must never be auto-upgraded in a breaking way.
6. Scheduled maintenance must default to recommendation-only mode unless explicitly configured otherwise.

---

## 15. Acceptance criteria

1. Admins can analyze a single skill and receive structured maintenance advice.
2. The system stores recommendation history and quality scores.
3. The system blocks apply attempts that would break current input/output contracts.
4. Admin > Skills includes recommendation review and apply actions.
5. The system can run scheduled maintenance sweeps and queue advice for later review.
6. The system can classify and preview `migrate-to-genjs` candidates.
7. Approved GenJS migrations can generate bundle layout, tooling metadata, and fixture tests.
8. The Admin skill edit view exposes orchestration configuration.
9. Every apply path has a verification loop and audit trail.

---

## 16. Phased delivery

### Phase 1 - Foundations

- DB schema for recommendations, runs, snapshots, schedules
- maintenance analyzer service
- compatibility snapshot model

### Phase 2 - Single skill review

- analyze single skill
- store recommendations
- admin review UI

### Phase 3 - Controlled apply

- apply runner
- compatibility gate
- verify loop

### Phase 4 - Batch and schedule

- maintenance sweeps
- scheduling
- notifications

### Phase 5 - GenJS migration

- migration planner
- tool/bootstrap checks
- fixture tests
- bundle verification

### Phase 6 - Orchestration config

- edit dialog configuration
- runtime wiring
- audit coverage

---

## 17. Open questions resolved by this spec

1. Recommendation history belongs in new maintenance tables, not only in `configJson`.
2. Compatibility protection is mandatory and must block unsafe auto-apply.
3. GenJS migration is allowed only through a governed preview/apply flow.
4. Scheduled sweeps default to analyze-only behavior.
5. Orchestration config is part of skill runtime configuration and should be editable in Admin > Skills.
