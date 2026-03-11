<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-runtime-correction
section-02-capability-registry-and-skill-policy
section-03-task-planner-and-billing
section-04-direct-artifact-execution
section-05-agency-integration-and-rollout
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-runtime-correction | - | 02, 03, 04, 05 | Yes (first) |
| section-02-capability-registry-and-skill-policy | 01 | 03, 04, 05 | No |
| section-03-task-planner-and-billing | 01, 02 | 04, 05 | No |
| section-04-direct-artifact-execution | 02, 03 | 05 | Yes (after 03) |
| section-05-agency-integration-and-rollout | 02, 03, 04 | - | No |

## Execution Order

1. **Batch 1**: section-01-runtime-correction
2. **Batch 2**: section-02-capability-registry-and-skill-policy
3. **Batch 3**: section-03-task-planner-and-billing
4. **Batch 4**: section-04-direct-artifact-execution
5. **Batch 5**: section-05-agency-integration-and-rollout

## Section Summaries

### section-01-runtime-correction

Fix current unsafe execution behavior so chat skill invocations follow skill policy rather than conversation model, and prepare the runtime for policy-based routing.

### section-02-capability-registry-and-skill-policy

Add normalized provider-route capability metadata and extend skills with capability-first execution policy metadata that defaults to requirements/profile-driven resolution.

### section-03-task-planner-and-billing

Introduce `TaskExecutionPlanner`, execution-time model resolution, immutable plan contracts, step-attempt snapshots, and unified billing metadata for planner-selected execution paths.

### section-04-direct-artifact-execution

Integrate artifact-oriented task completion flows for reports and presentations by choosing between direct completion and deterministic pipelines.

### section-05-agency-integration-and-rollout

Allow the planner to escalate tasks into AgencySwarm, propagate runtime policy and resolved snapshots into agencies, and add safe rollout controls and telemetry.
