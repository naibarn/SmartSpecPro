<!-- PROJECT_CONFIG
runtime: rust-cargo
test_command: cargo test --manifest-path apps/runner-app/Cargo.toml
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contracts-and-profile-boundary
section-02-backend-registry-and-gateway
section-03-runner-foundation-and-local-journal
section-04-local-discovery-and-control-channel
section-05-job-execution-and-adapters
section-06-shared-container-runner
section-07-ui-task-control-and-connection
section-08-manual-release-workflow
section-09-platform-and-rollout-evidence
section-10-runner-release-catalog-and-storage
section-11-github-release-sync-and-admin-build-control
section-12-runner-version-and-verified-self-update
section-13-dashboard-runner-download-and-version-ui
section-14-release-integration-and-evidence
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-contracts-and-profile-boundary | - | 02, 03, 04, 05, 06, 07, 08 | No |
| section-02-backend-registry-and-gateway | 01 | 04, 05, 06, 07 | No |
| section-03-runner-foundation-and-local-journal | 01 | 04, 05, 06 | Yes after 01 |
| section-04-local-discovery-and-control-channel | 01, 02, 03 | 05, 07 | No |
| section-05-job-execution-and-adapters | 01, 02, 03, 04 | 06, 07 | No |
| section-06-shared-container-runner | 01, 02, 03, 05 | 08, 09 | No |
| section-07-ui-task-control-and-connection | 01, 02, 04, 05 | 09 | Yes after dependencies |
| section-08-manual-release-workflow | 01, 03, 06 | 09 | Yes after dependencies |
| section-09-platform-and-rollout-evidence | 01–08 | - | No |
| section-10-runner-release-catalog-and-storage | 01, 02, 08 | 11, 12, 13 | No |
| section-11-github-release-sync-and-admin-build-control | 08, 10 | 14 | Yes after 10 |
| section-12-runner-version-and-verified-self-update | 01, 02, 03, 04, 10 | 13, 14 | No |
| section-13-dashboard-runner-download-and-version-ui | 07, 10, 12 | 14 | Yes after dependencies |
| section-14-release-integration-and-evidence | 10–13 | - | No |

## Execution Order

1. section-01-contracts-and-profile-boundary
2. section-02-backend-registry-and-gateway and
   section-03-runner-foundation-and-local-journal
3. section-04-local-discovery-and-control-channel
4. section-05-job-execution-and-adapters
5. section-06-shared-container-runner, section-07-ui-task-control-and-connection
   and section-08-manual-release-workflow where their dependencies are complete
6. section-09-platform-and-rollout-evidence
7. section-10-runner-release-catalog-and-storage
8. section-11-github-release-sync-and-admin-build-control and
   section-12-runner-version-and-verified-self-update
9. section-13-dashboard-runner-download-and-version-ui
10. section-14-release-integration-and-evidence

## Section Summaries

### section-01-contracts-and-profile-boundary

Freeze the additive versioned Runner protocol, execution-node/profile model,
compatibility fixtures and ownership decision without changing Worker meaning.

### section-02-backend-registry-and-gateway

Implement server-side enrollment, registry projection, control gateway and
canonical Job/lease/fence/outbox assignment boundary.

### section-03-runner-foundation-and-local-journal

Create the standalone Rust package, configuration, identity storage,
diagnostics, bounded journal and lifecycle primitives.

### section-04-local-discovery-and-control-channel

Implement local capability discovery, authenticated WSS/HTTPS control,
reconnect, replay and reconciliation.

### section-05-job-execution-and-adapters

Implement the supervised execution envelope, workspace policy, provider
adapters, event/result/artifact mapping and recovery semantics.

### section-06-shared-container-runner

Implement the non-Tauri shared Container entrypoint, per-Job isolation,
external durability, graceful replacement and Feature 204 adapter boundary.

### section-07-ui-task-control-and-connection

Project local Runner and shared Container state through the existing combined
Feedback/Chat launcher, Task Control panel, /chat and /workers/connect.

### section-08-manual-release-workflow

Add the manual-only GitHub native/Container artifact workflow with deterministic
manifests, checksums, optional signing and explicit deployment handoff.

### section-09-platform-and-rollout-evidence

Run focused proof, native/Cloudflare environment gates, security checks,
feature-gate rollout and rollback evidence, then update completion/review docs.

### section-10-runner-release-catalog-and-storage

Add a dedicated Runner release schema, migration, validated asset model,
server-owned catalog, same-origin download streaming and public latest APIs.

### section-11-github-release-sync-and-admin-build-control

Make the manual workflow produce real publishable Runner releases and add the
admin dispatch/status/sync path that imports and validates assets without
exposing GitHub to normal Dashboard users.

### section-12-runner-version-and-verified-self-update

Report the binary version, add durable authenticated update command delivery,
drain/apply/restart/rollback semantics and focused Rust/server proof.

### section-13-dashboard-runner-download-and-version-ui

Add the Dashboard Runner card and admin release controls with platform-aware
download, version check, safe update states, redaction and accessibility.

### section-14-release-integration-and-evidence

Run cross-section audits, workflow/static checks, focused tests and evidence
updates while keeping Cloudflare deployment and native host proof explicit.

## Global constraints

- Never run a whole-repository TypeScript typecheck.
- Do not modify Worker App package identity or its release workflows.
- Do not add retired execution systems or a second Job ledger/control plane.
- A failed or unavailable native/Cloudflare environment gate must be recorded
  as unverified, not represented as passing evidence.
