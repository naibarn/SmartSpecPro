<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-shared-contracts
section-02-scheduler-admission
section-03-hermes-mcp
section-04-executor-core
section-05-artifact-media-access
section-06-platform-packs
section-07-redis-security
section-08-e2e-rollout
section-09-remote-mcp-device-management
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-shared-contracts | — | 02, 03, 04, 05, 06, 07, 08 | No; foundation |
| section-02-scheduler-admission | 01 | 04, 08 | Yes with 03, 05, 07 |
| section-03-hermes-mcp | 01, existing auth/services | 08 | Yes with 02, 05, 07 |
| section-04-executor-core | 01, 02, Remotion package | 06, 08 | No after 02 |
| section-05-artifact-media-access | 01, existing ACL/storage/history | 03, 08 | Yes with 02, 03, 07 |
| section-06-platform-packs | 01, 04 | 08 | No after 04 |
| section-07-redis-security | 01, existing Redis topology | 08 | Yes with 02, 03, 05 |
| section-08-e2e-rollout | 01–07 | — | No; final gate |
| section-09-remote-mcp-device-management | 03, 04, existing Settings/auth | 08 | Yes with 05, 07 |

## Execution Order

1. `section-01-shared-contracts` — runtime identity, target/flag/scope contracts,
   additive enum migration.
2. `section-02-scheduler-admission`, `section-03-hermes-mcp`,
   `section-05-artifact-media-access`, and `section-07-redis-security` in
   parallel after section 01, with shared contract names kept identical.
3. `section-04-executor-core` after scheduler/admission interfaces are stable.
4. `section-06-platform-packs` after the executor doctor/loop exists.
5. `section-09-remote-mcp-device-management` after the MCP/auth seams and
   Settings route are stable; it does not depend on native pack release.
6. `section-08-e2e-rollout` only after all prior sections and security gates pass.

## Section Summaries

### section-01-shared-contracts

Adds `remotion_executor`, the resolved execution-target contract, capability and
readiness metadata, feature flag, scopes, and additive PostgreSQL enum migration.

### section-02-scheduler-admission

Implements target resolution before billing/insertion, strict claim admission,
lease/control behavior, and Worker App-compatible artifact lifecycle gates.

### section-03-hermes-mcp

Adds capability discovery, connection-control, Remotion, Hermes media, status/
cancel and typed Library/history MCP tools using existing server services and auth,
including Connector status and owner/device-bound agent pairing.

### section-04-executor-core

Creates the standalone Node executor package with doctor, OS credential stores,
Hermes existing-install discovery/adoption, signed auto-provisioning,
control-plane client, worker loop, Remotion runner and artifact client.

### section-05-artifact-media-access

Unifies ACL-checked download authorization for Library, R2, media history, render
inputs and published artifacts, including legacy Python tenant isolation.

### section-06-platform-packs

Defines and packages Windows native, WSL2, Linux, macOS arm64 and macOS x64 packs,
with signed manifests, architecture checks, existing-Hermes adoption, automatic
missing-component repair, install safety and no Xcode runtime.

### section-07-redis-security

Defines split Redis use, TTL/bounds/outage policies, observability, rate limits,
and threat-model tests across MCP (including pairing state), worker auth, storage
and executor boundaries.

### section-08-e2e-rollout

Provides deterministic and real platform acceptance, staged rollout/kill switch,
Worker App parity comparison, runbook evidence and rollback proof.

### section-09-remote-mcp-device-management

Makes Remote MCP the default no-download path and exposes an owner-scoped
Settings surface for SmartAIHub MCP sessions and optional local Remotion
executors. It records safe device/token metadata, shows approval and expiry
timestamps, and provides idempotent self-revocation without exposing secrets or
allowing one user to inspect another user's devices.
