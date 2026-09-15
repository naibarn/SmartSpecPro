<!-- PROJECT_CONFIG
runtime: mixed-typescript-rust-python
test_command: focused tests only; do not run npm typecheck
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-shared-contract
section-02-planner-geometry
section-03-player-modes-marks
section-04-vision-quick-full-scan
section-05-rust-render-parity
section-06-feature186-job-boundary
section-07-verification-rollout
END_MANIFEST -->

# Implementation Sections Index

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| 01 shared contract | - | 02, 03, 04, 05 | Yes |
| 02 planner geometry | 01 | 03, 05 | No |
| 03 player modes/marks | 01, 02 | 07 | No |
| 04 vision/Quick/Full Scan | 01, 02 | 06, 07 | Yes after 02 |
| 05 Rust/render parity | 01, 02 | 07 | Yes after 02 |
| 06 Feature 186 boundary | 04 | 07 | No |
| 07 verification/rollout | 03, 04, 05, 06 | - | No |

## Execution order

1. Shared contract.
2. Planner geometry.
3. Player, vision, and Rust work can proceed from the planner contract.
4. Feature 186 job binding.
5. Verification, rollout evidence, and ten-round completeness review.

## Section summaries

### section-01-shared-contract
Versioned Face + Activity evidence and plan types with backward-compatible
validation and fingerprints.

### section-02-planner-geometry
Pure target selection, crop feasibility, smoothing, occlusion, and Mark rules.

### section-03-player-modes-marks
Quick/Full Scan UI state and existing Mark-point compatibility.

### section-04-vision-quick-full-scan
Capability-aware evidence extraction, bounded keyframes, and resumable scans.

### section-05-rust-render-parity
Rust validation, local command admission, segment remapping, and parity.

### section-06-feature186-job-boundary
Canonical job lifecycle, checkpoint/promotion fencing, and duplicate safety.

### section-07-verification-rollout
Focused tests, static checks, rollout gates, and completion evidence.
