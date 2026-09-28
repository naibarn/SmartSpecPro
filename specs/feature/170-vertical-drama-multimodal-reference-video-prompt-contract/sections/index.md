<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test --
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-bundle-persistence
section-02-provider-capabilities
section-03-skills-prompt-finalizer
section-04-server-worker-integration
section-05-storyboard-multimodal-ui
section-06-integration-gap-review
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
| --- | --- | --- | --- |
| section-01-bundle-persistence | - | 02, 03, 04, 05 | No |
| section-02-provider-capabilities | 01 | 03, 04, 05 | Yes after 01 |
| section-03-skills-prompt-finalizer | 01, 02 | 04, 05 | No |
| section-04-server-worker-integration | 01, 02, 03 | 05, 06 | No |
| section-05-storyboard-multimodal-ui | 01, 02, 03, 04 | 06 | No |
| section-06-integration-gap-review | 01–05 | - | No |

## Execution Order

1. `section-01-bundle-persistence` establishes shared contracts and media truth.
2. `section-02-provider-capabilities` adds mode/profile mapping after the bundle.
3. `section-03-skills-prompt-finalizer` connects inspection and terminal prompt ownership.
4. `section-04-server-worker-integration` threads the bundle through all server/runtime paths.
5. `section-05-storyboard-multimodal-ui` consumes the stable API and capability response.
6. `section-06-integration-gap-review` performs cross-section proof and ten required gap loops.

## Section Summaries

### section-01-bundle-persistence

Implement the versioned image-only frame and mixed-modality reference bundle,
canonical resolver, revision/fingerprint, persistence projection, migration,
and backward-compatible worker schema foundation.

### section-02-provider-capabilities

Implement runtime capability profiles, generic provider mode adapters, and
Omni/Seedance/MiniMax H3 compatibility rules without version-specific branches.

### section-03-skills-prompt-finalizer

Implement attachment inspection, derived/unavailable evidence, grounded
authoring, terminal final optimization, hash equality, and prompt immutability.

### section-04-server-worker-integration

Thread one bundle and terminal prompt through prompt generation, bulk, render,
retry, repair, worker dispatch, credits, tasks, and recovery.

### section-05-storyboard-multimodal-ui

Implement separate image-only Start/Stop slots and a multimodal local/Library
reference drop zone with previews, ordering, states, accessibility, and
capability readiness.

### section-06-integration-gap-review

Run cross-section tests, browser evidence, security/operational checks, and ten
explicit gap-review rounds. Fix all MUST_FIX findings before handoff.
