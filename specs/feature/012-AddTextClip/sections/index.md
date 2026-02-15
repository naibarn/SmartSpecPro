<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: bash -lc "cd apps/web && npm test && cd ../python-backend && uv run pytest"
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contract-validation-foundation
section-02-editor-timeline-t1
section-03-text-authoring-keyframes
section-04-preview-parity-engine
section-05-render-pipeline-ass
section-06-compatibility-font-fallback
section-07-verification-hardening
section-08-rollout-observability-runbook
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-contract-validation-foundation | - | 02, 04, 05, 06, 07 | No |
| section-02-editor-timeline-t1 | 01 | 03, 04, 07 | No |
| section-03-text-authoring-keyframes | 02 | 04, 07 | No |
| section-04-preview-parity-engine | 01, 02, 03 | 06, 07 | No |
| section-05-render-pipeline-ass | 01 | 06, 07 | No |
| section-06-compatibility-font-fallback | 01, 04, 05 | 07, 08 | No |
| section-07-verification-hardening | 01, 02, 03, 04, 05, 06 | 08 | No |
| section-08-rollout-observability-runbook | 06, 07 | - | No |

## Execution Order

1. section-01-contract-validation-foundation
2. section-02-editor-timeline-t1
3. section-03-text-authoring-keyframes
4. section-04-preview-parity-engine
5. section-05-render-pipeline-ass
6. section-06-compatibility-font-fallback
7. section-07-verification-hardening
8. section-08-rollout-observability-runbook

## Section Summaries

### section-01-contract-validation-foundation
Introduce text-track validation/defaulting, capability matrix policy, and explicit contract versioning baseline.

### section-02-editor-timeline-t1
Finalize T1 timeline lifecycle behavior for adding/selecting/moving/trimming/deleting text clips.

### section-03-text-authoring-keyframes
Complete text style/transform authoring model and keyframe persistence semantics.

### section-04-preview-parity-engine
Implement deterministic preview rendering for text clips with parity-safe ordering and easing behavior.

### section-05-render-pipeline-ass
Implement canonical ASS/libass backend rendering plus strict drawtext fast-path gating and escaping safety.

### section-06-compatibility-font-fallback
Enforce mixed-version behavior and deterministic missing-font policy across preview and render paths.

### section-07-verification-hardening
Add the parity, compatibility, security, and performance verification matrix for regression prevention.

### section-08-rollout-observability-runbook
Finalize rollout, monitoring, alerting, ownership, and rollback operational readiness artifacts.
