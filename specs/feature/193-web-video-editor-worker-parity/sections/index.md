<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-shared-contracts
section-02-browser-analysis
section-03-smart-camera-ui
section-04-playback-and-cut-map
section-05-worker-routing
section-06-render-handoff
section-07-tests-and-rollout
END_MANIFEST -->

# Implementation Sections Index

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| section-01-shared-contracts | — | 02, 03, 04, 05, 06 | No |
| section-02-browser-analysis | 01 | 03, 04 | No |
| section-03-smart-camera-ui | 01, 02 | 04, 07 | No |
| section-04-playback-and-cut-map | 01, 02, 03 | 06, 07 | No |
| section-05-worker-routing | 01 | 06, 07 | Yes after 01 |
| section-06-render-handoff | 01, 03, 04, 05 | 07 | No |
| section-07-tests-and-rollout | 01–06 | — | No |

## Execution order

1. Shared contracts.
2. Browser analysis runtime and Worker routing can proceed after shared types;
   UI waits for the browser port.
3. Smart Camera UI and playback/cut-map integration.
4. Canonical render handoff.
5. Focused tests, browser evidence, migration, and rollout gates.

## Section summaries

### section-01-shared-contracts

Versioned five-point face/activity evidence, camera validation, source/edit time
cut map, media operation allowlist, and contract-version mapping.

### section-02-browser-analysis

Capability-gated browser face/activity/audio adapters, cancellation, budgets,
and evidence provenance.

### section-03-smart-camera-ui

Explicit modes, legacy mapping, capability/status UI, local Quick analysis, and
Full Scan request/promotion orchestration.

### section-04-playback-and-cut-map

Source-time plan evaluation in the player, seek/play parity, local Quick
Silence Cut, and timeline-wide time-map application.

### section-05-worker-routing

Composition scan, silence/proxy fallback, transport/nested contract versions,
checkpoint, idempotency, and server-owned routing policy.

### section-06-render-handoff

Saved revision enforcement, canonical `video.render`, compatibility aliases,
plan/cut-map validation, and render status/cancellation behavior.

### section-07-tests-and-rollout

TDD coverage, browser evidence, migration fixtures, feature flags, and five-pass
implementation/spec review gates.

