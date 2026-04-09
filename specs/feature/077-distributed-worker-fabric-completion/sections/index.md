<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-runtime-generalization-and-rollout-foundation
section-02-desktop-zeroclaw-managed-runtime-foundation
section-03-local-workspaces-video-assembly-and-media-adapters
section-04-nemoclaw-and-hiclaw-runtime-profiles
section-05-admin-docs-and-migration-truthfulness
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-runtime-generalization-and-rollout-foundation | - | section-02, section-03, section-04, section-05 | Yes |
| section-02-desktop-zeroclaw-managed-runtime-foundation | section-01 | section-03, section-05 | Yes |
| section-03-local-workspaces-video-assembly-and-media-adapters | section-01, section-02 | section-05 | No |
| section-04-nemoclaw-and-hiclaw-runtime-profiles | section-01 | section-05 | Yes |
| section-05-admin-docs-and-migration-truthfulness | section-01, section-02, section-03, section-04 | - | No |

## Execution Order

1. `section-01-runtime-generalization-and-rollout-foundation` (establish runtime handlers, compatibility, and rollout rules)
2. `section-02-desktop-zeroclaw-managed-runtime-foundation`, `section-04-nemoclaw-and-hiclaw-runtime-profiles` (parallel after section 01)
3. `section-03-local-workspaces-video-assembly-and-media-adapters` (after sections 01 and 02)
4. `section-05-admin-docs-and-migration-truthfulness` (after sections 01-04)

## Verification Matrix

`PROJECT_CONFIG.test_command` remains the primary web-control-plane check for deep-plan automation, but Feature 077 implementation must verify the additional runtime surfaces below before rollout.

| Surface | Verification command | Why it matters |
|---------|----------------------|----------------|
| Web control plane | `npm --prefix apps/web test` | Validates worker registry, scheduler, auth, routes, workflow router, and admin UI integration inside the existing web test suite |
| Python media adapters | `uv run --project python-backend pytest` | Validates reused media-pipeline behavior and adapter contracts for local worker execution |
| Desktop/Tauri contracts | `cargo test --manifest-path apps/tauri-shell/src-tauri/Cargo.toml` | Validates desktop-host and Rust/Tauri media worker contracts |

The implementation should not treat a passing web test run as sufficient evidence that desktop-local worker support is safe to enable.

## Section Summaries

### section-01-runtime-generalization-and-rollout-foundation

Generalizes the worker control plane beyond OpenClaw-only assumptions, including runtime-family feature flags and compatibility-matrix checks.

### section-02-desktop-zeroclaw-managed-runtime-foundation

Defines SmartSpec Desktop as the machine host, ZeroClaw as the managed runtime, and the service-identity rules for shared and dedicated desktop workers.

### section-03-local-workspaces-video-assembly-and-media-adapters

Locks the first desktop-local execution slice with workspace/file policy, canonical `video_assembly` contracts, and artifact publication safety reuse.

### section-04-nemoclaw-and-hiclaw-runtime-profiles

Defines truthful metadata and routing semantics for secure sandbox pools and collaborative clusters without collapsing them into desktop-worker behavior.

### section-05-admin-docs-and-migration-truthfulness

Aligns fleet admin, docs, workflow-surface messaging, and migration guidance with the runtime capabilities that are actually implemented.
