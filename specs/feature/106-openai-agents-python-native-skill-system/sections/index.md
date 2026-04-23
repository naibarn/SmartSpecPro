<!-- PROJECT_CONFIG
runtime: python-uv
test_command: uv run pytest
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-isc-native-bundle
section-02-native-runtime-supervisor
section-03-node-registry-compatibility
section-04-maintenance-migration
section-05-security-tests-rollout
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-isc-native-bundle | - | section-02, section-03, section-04 | No |
| section-02-native-runtime-supervisor | section-01 | section-03, section-04, section-05 | No |
| section-03-node-registry-compatibility | section-01 | section-04, section-05 | Yes |
| section-04-maintenance-migration | section-01, section-02, section-03 | section-05 | No |
| section-05-security-tests-rollout | section-01, section-02, section-03, section-04 | - | No |

## Execution Order

1. section-01-isc-native-bundle
2. section-02-native-runtime-supervisor
3. section-03-node-registry-compatibility
4. section-04-maintenance-migration
5. section-05-security-tests-rollout

## Section Summaries

### section-01-isc-native-bundle
Build the native ISC target, exporter, evaluator, and migration entrypoints.

### section-02-native-runtime-supervisor
Build the Python native runtime path, sandbox-agent integration, phase supervisor, and persistence.

### section-03-node-registry-compatibility
Update skill resolution, registry behavior, compatibility snapshots, and router exposure for native bundles.

### section-04-maintenance-migration
Implement safe maintenance, upgrade policy, and legacy-to-native migration workflows.

### section-05-security-tests-rollout
Add end-to-end security and compatibility tests, plus rollout checks for finalize gating and redaction.
