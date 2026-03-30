<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --filter @smartspec/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-maintenance-data-model
section-02-analyzer-and-contract-snapshots
section-03-single-skill-advice-api
section-04-admin-skills-maintenance-ui
section-05-apply-runner-and-compatibility-gate
section-06-scheduled-sweeps-and-review-queue
section-07-genjs-migration-engine-and-bundle-layout
section-08-orchestration-config-in-admin-edit
section-09-fixture-tests-verification-and-rollout
END_MANIFEST -->

# Section Index — Feature 064: Skill Maintenance Lifecycle

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-maintenance-data-model | - | 02, 03, 05, 06 | Yes |
| section-02-analyzer-and-contract-snapshots | 01 | 03, 05, 06, 07, 09 | No |
| section-03-single-skill-advice-api | 01, 02 | 04, 05 | Yes |
| section-04-admin-skills-maintenance-ui | 03 | 08 | No |
| section-05-apply-runner-and-compatibility-gate | 01, 02, 03 | 06, 07, 09 | No |
| section-06-scheduled-sweeps-and-review-queue | 01, 02, 05 | 09 | Yes |
| section-07-genjs-migration-engine-and-bundle-layout | 02, 05 | 09 | Yes |
| section-08-orchestration-config-in-admin-edit | 04 | 09 | Yes |
| section-09-fixture-tests-verification-and-rollout | 02, 05, 06, 07, 08 | - | No |

## Execution Order

1. `section-01-maintenance-data-model`
2. `section-02-analyzer-and-contract-snapshots`
3. `section-03-single-skill-advice-api`
4. `section-04-admin-skills-maintenance-ui`
5. `section-05-apply-runner-and-compatibility-gate`
6. `section-06-scheduled-sweeps-and-review-queue`, `section-07-genjs-migration-engine-and-bundle-layout`, and `section-08-orchestration-config-in-admin-edit` in parallel where practical
7. `section-09-fixture-tests-verification-and-rollout`

## Section Summaries

### section-01-maintenance-data-model
Add recommendation, run, contract snapshot, and maintenance schedule tables plus shared types.

### section-02-analyzer-and-contract-snapshots
Create analyzer and compatibility snapshot services that inspect skill folders, schemas, runtime metadata, tests, and GenJS suitability.

### section-03-single-skill-advice-api
Add router procedures for single-skill analyze/list/detail/dismiss flows and store recommendation records.

### section-04-admin-skills-maintenance-ui
Extend Admin > Skills with Analyze, View Advice, Apply Upgrade actions and a new Maintenance tab.

### section-05-apply-runner-and-compatibility-gate
Implement apply orchestration, proposal/direct-apply mode, compatibility blocking, and maintenance run logging.

### section-06-scheduled-sweeps-and-review-queue
Add maintenance schedules, sweep execution, queued recommendation review, and admin notifications.

### section-07-genjs-migration-engine-and-bundle-layout
Add GenJS candidate scoring, migration planner, bundle scaffolding, package/runtime checks, and bundle smoke support.

### section-08-orchestration-config-in-admin-edit
Add downstream handoff / agency swarm / hybrid orchestration settings to the Admin Skills edit dialog and persist them safely.

### section-09-fixture-tests-verification-and-rollout
Add fixture tests, regression loops, rollout rules, audit trail checks, and final verification guidance.
