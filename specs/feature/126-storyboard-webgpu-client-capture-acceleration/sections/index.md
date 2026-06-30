<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm run typecheck
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-capability-contracts-and-flags
section-02-storyboard-review-ui-and-job-metadata
section-03-client-draft-upload-and-server-verification
section-04-quality-security-and-rollout
END_MANIFEST -->

# Feature 126 Implementation Sections

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
| --- | --- | --- | --- |
| section-01-capability-contracts-and-flags | Feature 125 contracts | 02, 03, 04 | No |
| section-02-storyboard-review-ui-and-job-metadata | 01 | 03, 04 | No |
| section-03-client-draft-upload-and-server-verification | 01, 02 | 04 | No |
| section-04-quality-security-and-rollout | 01, 02, 03 | - | Yes after 03 |

## Execution Order

1. `section-01-capability-contracts-and-flags`
2. `section-02-storyboard-review-ui-and-job-metadata`
3. `section-03-client-draft-upload-and-server-verification`
4. `section-04-quality-security-and-rollout`

## Section Summaries

### section-01-capability-contracts-and-flags

Add shared acceleration preference/report contracts, client capability probe, and fail-closed feature flags.

### section-02-storyboard-review-ui-and-job-metadata

Add the opt-in WebGPU UI, disabled/fallback states, and job metadata plumbing while preserving server capture as the active path.

### section-03-client-draft-upload-and-server-verification

Design the later untrusted client candidate upload path and require Feature 125 verification before Library publish.

### section-04-quality-security-and-rollout

Define quality gates, privacy rules, rollout phases, telemetry, and promotion/removal criteria.
