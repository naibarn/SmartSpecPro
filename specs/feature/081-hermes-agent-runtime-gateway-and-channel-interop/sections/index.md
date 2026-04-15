<!-- PROJECT_CONFIG
runtime: mixed-node-rust-python
test_command: npm --prefix apps/web test && pytest python-backend/tests -q
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-runtime-identity-bridge-and-schema-foundation
section-02-delegated-platform-access-and-hermes-capability-profile
section-03-bound-worker-channel-handoff-and-callback-flows
section-04-rollout-governance-and-migration
END_MANIFEST -->

# Implementation Sections Index

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| section-01-runtime-identity-bridge-and-schema-foundation | - | section-02, section-03, section-04 | No |
| section-02-delegated-platform-access-and-hermes-capability-profile | section-01-runtime-identity-bridge-and-schema-foundation | section-03, section-04 | No |
| section-03-bound-worker-channel-handoff-and-callback-flows | section-01-runtime-identity-bridge-and-schema-foundation, section-02-delegated-platform-access-and-hermes-capability-profile | section-04 | Yes |
| section-04-rollout-governance-and-migration | section-01-runtime-identity-bridge-and-schema-foundation, section-02-delegated-platform-access-and-hermes-capability-profile, section-03-bound-worker-channel-handoff-and-callback-flows | - | No |

## Execution order

1. section-01-runtime-identity-bridge-and-schema-foundation
2. section-02-delegated-platform-access-and-hermes-capability-profile
3. section-03-bound-worker-channel-handoff-and-callback-flows
4. section-04-rollout-governance-and-migration

## Section summaries

### section-01-runtime-identity-bridge-and-schema-foundation

Add the Hermes runtime family, feature flag, metadata schema, and bridge registration contract.

### section-02-delegated-platform-access-and-hermes-capability-profile

Reuse delegated HTTP and MCP access for Hermes bridge sessions, keep billing and trace attribution in the existing delegated-worker path, and define truthful Hermes capability manifests.

### section-03-bound-worker-channel-handoff-and-callback-flows

Integrate Hermes into owner-bound external connector flows, callbacks, and channel-companion handoffs while reusing the existing worker callback ingress and trust boundaries.

### section-04-rollout-governance-and-migration

Define staged rollout gates, remote-endpoint operator policy, docs, OpenClaw-to-Hermes onboarding guidance, and regression coverage.
