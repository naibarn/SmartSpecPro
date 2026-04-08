<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contracts-and-policy-foundation
section-02-user-settings-and-device-state
section-03-local-model-catalog-and-capability-contracts
section-04-chat-routing-and-runtime-metadata
section-05-browser-download-and-runtime-adapter
section-06-tauri-adapter-and-device-storage
section-07-ocr-security-and-observability
section-08-teams-ui-and-team-room-parity
section-09-regression-tests-and-rollout
END_MANIFEST -->

# Implementation Sections Index

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| section-01-contracts-and-policy-foundation | - | section-02, section-03, section-04, section-05, section-06, section-07, section-08, section-09 | No |
| section-02-user-settings-and-device-state | section-01-contracts-and-policy-foundation | section-04, section-05, section-06, section-08, section-09 | No |
| section-03-local-model-catalog-and-capability-contracts | section-01-contracts-and-policy-foundation | section-04, section-05, section-06, section-07, section-08, section-09 | Yes |
| section-04-chat-routing-and-runtime-metadata | section-01-contracts-and-policy-foundation, section-02-user-settings-and-device-state, section-03-local-model-catalog-and-capability-contracts | section-05, section-06, section-07, section-08, section-09 | No |
| section-05-browser-download-and-runtime-adapter | section-03-local-model-catalog-and-capability-contracts, section-04-chat-routing-and-runtime-metadata | section-08, section-09 | Yes |
| section-06-tauri-adapter-and-device-storage | section-02-user-settings-and-device-state, section-03-local-model-catalog-and-capability-contracts, section-04-chat-routing-and-runtime-metadata | section-08, section-09 | Yes |
| section-07-ocr-security-and-observability | section-01-contracts-and-policy-foundation, section-03-local-model-catalog-and-capability-contracts, section-04-chat-routing-and-runtime-metadata | section-08, section-09 | Yes |
| section-08-teams-ui-and-team-room-parity | section-01-contracts-and-policy-foundation, section-03-local-model-catalog-and-capability-contracts, section-04-chat-routing-and-runtime-metadata, section-05-browser-download-and-runtime-adapter, section-07-ocr-security-and-observability | section-09 | No |
| section-09-regression-tests-and-rollout | section-01-contracts-and-policy-foundation, section-02-user-settings-and-device-state, section-03-local-model-catalog-and-capability-contracts, section-04-chat-routing-and-runtime-metadata, section-05-browser-download-and-runtime-adapter, section-06-tauri-adapter-and-device-storage, section-07-ocr-security-and-observability, section-08-teams-ui-and-team-room-parity | - | No |

## Execution order

1. section-01-contracts-and-policy-foundation
2. section-02-user-settings-and-device-state and section-03-local-model-catalog-and-capability-contracts
3. section-04-chat-routing-and-runtime-metadata
4. section-05-browser-download-and-runtime-adapter, section-06-tauri-adapter-and-device-storage, and section-07-ocr-security-and-observability
5. section-08-teams-ui-and-team-room-parity
6. section-09-regression-tests-and-rollout

## Section summaries

### section-01-contracts-and-policy-foundation

Extend typed feature flags, synced preference contracts, conversation/message persistence contracts, and shared runtime types so later sections build on one authoritative vocabulary.

### section-02-user-settings-and-device-state

Add the Settings UX, user preference read/write behavior, and device-local state isolation rules for browser and desktop surfaces.

### section-03-local-model-catalog-and-capability-contracts

Create the dedicated local model catalog, capability result contract, profile revocation rules, and shared routing inputs without polluting cloud model lists.

### section-04-chat-routing-and-runtime-metadata

Implement the runtime router, authenticated conversation override path, and server-authoritative runtime metadata persistence across chat save flows.

### section-05-browser-download-and-runtime-adapter

Implement browser capability probing, worker-based runtime loading, consented download/install lifecycle, and per-request fallback behavior.

### section-06-tauri-adapter-and-device-storage

Wire the same runtime contracts into `apps/tauri-shell` with app-local storage, on-demand install/remove UX, and scoped device-local state.

### section-07-ocr-security-and-observability

Define backend OCR boundaries, asset-origin and SSRF protections, privacy semantics, revocation handling, and minimal telemetry requirements.

### section-08-teams-ui-and-team-room-parity

Extend Local AI support across `/teams`, `TeamRoomView`, workflow/run-monitor panels, team-management flows, and room/run message persistence without implying that server-side orchestration moved on-device.

### section-09-regression-tests-and-rollout

Add the cross-cutting server, client, and integration coverage needed to prove unsupported devices and cloud-only tenants do not regress during rollout.
