<!-- PROJECT_CONFIG
runtime: mixed-node-rust-python
test_command: npm --prefix apps/web test && npm --prefix apps/tauri-shell test && pytest python-backend/tests -q
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-canonical-surface-device-and-contract-foundation
section-02-package-trust-sync-and-materialization
section-03-local-file-intelligence-and-workspace-manager
section-04-execution-router-and-pi-runtime-host
section-05-agency-swarm-and-connector-runtime
section-06-unified-ux-cross-surface-handoff-and-run-labels
section-07-security-governance-audit-and-offboarding
section-08-rollout-migration-and-regression-matrix
END_MANIFEST -->

# Implementation Sections Index

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| section-01-canonical-surface-device-and-contract-foundation | - | section-02, section-03, section-04, section-05, section-06, section-07, section-08 | No |
| section-02-package-trust-sync-and-materialization | section-01-canonical-surface-device-and-contract-foundation | section-04, section-05, section-06, section-07, section-08 | No |
| section-03-local-file-intelligence-and-workspace-manager | section-01-canonical-surface-device-and-contract-foundation | section-04, section-05, section-06, section-07, section-08 | Yes |
| section-04-execution-router-and-pi-runtime-host | section-01-canonical-surface-device-and-contract-foundation, section-02-package-trust-sync-and-materialization, section-03-local-file-intelligence-and-workspace-manager | section-05, section-06, section-07, section-08 | No |
| section-05-agency-swarm-and-connector-runtime | section-01-canonical-surface-device-and-contract-foundation, section-02-package-trust-sync-and-materialization, section-03-local-file-intelligence-and-workspace-manager, section-04-execution-router-and-pi-runtime-host | section-06, section-07, section-08 | No |
| section-06-unified-ux-cross-surface-handoff-and-run-labels | section-01-canonical-surface-device-and-contract-foundation, section-02-package-trust-sync-and-materialization, section-04-execution-router-and-pi-runtime-host, section-05-agency-swarm-and-connector-runtime | section-07, section-08 | Yes |
| section-07-security-governance-audit-and-offboarding | section-01-canonical-surface-device-and-contract-foundation, section-02-package-trust-sync-and-materialization, section-03-local-file-intelligence-and-workspace-manager, section-04-execution-router-and-pi-runtime-host, section-05-agency-swarm-and-connector-runtime, section-06-unified-ux-cross-surface-handoff-and-run-labels | section-08 | No |
| section-08-rollout-migration-and-regression-matrix | section-01-canonical-surface-device-and-contract-foundation, section-02-package-trust-sync-and-materialization, section-03-local-file-intelligence-and-workspace-manager, section-04-execution-router-and-pi-runtime-host, section-05-agency-swarm-and-connector-runtime, section-06-unified-ux-cross-surface-handoff-and-run-labels, section-07-security-governance-audit-and-offboarding | - | No |

## Execution order

1. section-01-canonical-surface-device-and-contract-foundation
2. section-02-package-trust-sync-and-materialization
3. section-03-local-file-intelligence-and-workspace-manager
4. section-04-execution-router-and-pi-runtime-host
5. section-05-agency-swarm-and-connector-runtime
6. section-06-unified-ux-cross-surface-handoff-and-run-labels
7. section-07-security-governance-audit-and-offboarding
8. section-08-rollout-migration-and-regression-matrix

## Section summaries

### section-01-canonical-surface-device-and-contract-foundation

Define the device, package, trust, runtime-label, and desktop-host shared contracts that make web and desktop speak the same language.

### section-02-package-trust-sync-and-materialization

Add signed package distribution, trust classes, revocation, sync, and local materialization for desktop-local skills and agencies.

### section-03-local-file-intelligence-and-workspace-manager

Create the governed local-file and managed-workspace layer that replaces raw path discovery and raw Docker configuration as the main product abstraction.

### section-04-execution-router-and-pi-runtime-host

Introduce the desktop execution router and Pi runtime host, with gateway-only provider injection and Desktop Host tool adapters.

### section-05-agency-swarm-and-connector-runtime

Add local Agency Swarm materialization/runtime hosting plus managed local connector adapters and hybrid orchestration flows.

### section-06-unified-ux-cross-surface-handoff-and-run-labels

Align web and desktop UX semantics, trust badges, run labels, and cross-surface handoff flows so the user experiences one product.

### section-07-security-governance-audit-and-offboarding

Enforce capability manifests, secret lifecycle, egress controls, device governance, quarantine, audit, and cleanup flows across the desktop host.

### section-08-rollout-migration-and-regression-matrix

Define the migration path from the current Tauri shell posture to the governed desktop-host model, plus rollout gates and regression coverage.
