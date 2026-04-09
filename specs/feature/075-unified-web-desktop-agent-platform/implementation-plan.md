# Implementation Plan

## Objective

Deliver a concrete implementation roadmap for Feature 075 so SmartSpecPro can evolve from:

- a capable web control plane
- a permissive Tauri local shell
- a separate external worker fabric

into a unified web + desktop product with:

- a governed desktop host
- signed package sync and materialization
- device identity and offboarding
- Pi and Agency Swarm desktop runtimes
- local file intelligence
- gateway-only managed execution

## Current-codebase fit

Primary integration points:

- desktop shell baseline
  - `apps/tauri-shell/src-tauri/src/lib.rs`
  - `apps/tauri-shell/src-tauri/src/file_commands.rs`
  - `apps/tauri-shell/src-tauri/src/docker_commands.rs`
  - `apps/tauri-shell/src-tauri/src/local_skill_runtime.rs`
  - `apps/tauri-shell/src-tauri/src/terminal_pty.rs`
- web control plane and gateway
  - `apps/web/server/_core/llmRoutes.ts`
  - `apps/web/server/_core/responsesRoutes.ts`
  - `apps/web/server/_core/mcpPublicServer.ts`
  - `apps/web/server/routes/publicDocsApi.ts`
- skill and local execution policy
  - `apps/web/server/services/localAiSkillPolicy.ts`
  - `apps/web/server/services/skillCompatibilityGate.ts`
  - `apps/web/server/services/skillFiles.ts`
- worker-runtime family
  - `apps/web/shared/workerRuntime.ts`
  - `apps/web/server/routes/workerRuntime.ts`
  - `apps/web/server/services/workerRegistryService.ts`
  - `apps/web/server/services/workerDelegationService.ts`
  - `apps/web/server/services/workerFleetService.ts`
- likely UI integration points
  - `apps/web/client/src/pages/Chat.tsx`
  - `apps/web/client/src/pages/Settings.tsx`
  - admin and monitoring pages that already surface worker and local AI state

## Recommended implementation order

### 1. Canonical contracts, device identity, and rollout flags

- add device registry schema and shared desktop-host contracts
- add package/trust enums and capability-manifest vocabulary for desktop-syncable artifacts
- add tenant/org feature flags for desktop-host rollout phases and advanced local mode
- define server-authoritative run labels for surface, runtime, trust, locality, and workspace
- publish a small supersession matrix so implementers know which 004-era desktop assumptions are compatibility-only

### 2. Desktop-host command surface hardening

- keep existing Tauri primitives, but move them behind:
  - managed roots
  - workspace profiles
  - policy-checked file APIs
  - audit wrappers
- treat current raw file and Docker commands as low-level host internals, not direct product contracts
- add a machine-readable approval model for destructive writes, non-default mounts, shell escalation, and unverified package execution

### 3. Package registry, signing, sync, and materialization

- introduce package manifests that wrap today's skill/agency bundle structure
- add signing, compatibility, revocation, and desktop download endpoints
- implement desktop package sync cache and local materializer
- enforce local-unverified vs organization-verified package rules
- define artifact provenance and trust-taint rules for outputs produced by local-unverified or project-local packages

### 4. Local file intelligence and workspace manager

- add consented local roots, metadata catalog, preview cache, full-text index, and optional vector index
- add staged attachment APIs for runtimes
- add managed workspace provisioning on top of Docker
- enforce mount allowlists, network egress classes, and output/writeback policies
- define retention, purge, and storage-protection rules for derived local-file stores such as preview and index data

### 5. Pi runtime host and execution router

- introduce Pi runtime adapter and policy-controlled tool registration, with sidecar/RPC as the managed default boundary
- define router rules for Platform Skill vs Pi vs Agency Swarm vs OpenClaw vs Cloud Agent
- keep all managed model routing gateway-only
- add runtime-specific run telemetry and failure mapping
- define the runtime-reconciliation rule that Desktop Host may project into worker fabric as `desktop_zeroclaw_managed`, while Pi and Agency Swarm remain internal runtime labels

### 6. Agency Swarm desktop runtime and connector runtime

- add agency pack materialization for local execution
- enforce gateway-only provider injection and fail-closed startup for managed Agency Swarm runs
- add connector-runtime adapters with device-scoped secret injection
- define hybrid flows where Pi can do discovery and Agency Swarm can execute orchestrated work
- keep server access HTTP-first and MCP-second from the Desktop Host adapter layer

### 7. Unified UX and cross-surface handoff

- add "Open in Desktop" and "View on Web" contract surfaces
- align run cards, trust badges, package cards, and object detail pages
- add first-run desktop bootstrap UX for sign-in, policy check, roots, package sync, and runtime health

### 8. Security, governance, and offboarding

- add device disable / revoke / re-auth / cleanup flows
- define device enrollment bootstrap, token classes, proof-of-possession binding, rotation, and stolen-device recovery
- add package quarantine and revocation freshness enforcement
- add outbound policy classes, DLP-aware confirmations, and audit events
- harden document ingestion and parser isolation where desktop indexing is introduced
- add signed updater, runtime-bundle integrity verification, and signer rotation / key-compromise response

### 9. Rollout and migration

- migrate the Tauri shell from raw command-first posture to desktop-host posture without removing current useful local capabilities overnight
- preserve compatibility with the existing worker-runtime family
- document what remains external-runtime-only versus what becomes native desktop-host behavior
- define explicit phase exit gates before enabling broader tenant rollout

## Recommended file and module additions

- shared contracts
  - `apps/web/shared/desktopHost.ts`
  - `packages/desktop-runtime-contracts/*`
- server control-plane modules
  - `apps/web/server/routes/desktopHost.ts`
  - `apps/web/server/services/deviceRegistryService.ts`
  - `apps/web/server/services/deviceEnrollmentService.ts`
  - `apps/web/server/services/desktopPackageRegistryService.ts`
  - `apps/web/server/services/packageSigningService.ts`
  - `apps/web/server/services/revocationFeedService.ts`
  - `apps/web/server/services/desktopRunRouter.ts`
  - `apps/web/server/services/desktopPolicyService.ts`
  - `apps/web/server/services/desktopUpdateService.ts`
- desktop host modules
  - `apps/tauri-shell/src-tauri/src/device_identity.rs`
  - `apps/tauri-shell/src-tauri/src/device_enrollment.rs`
  - `apps/tauri-shell/src-tauri/src/policy_bridge.rs`
  - `apps/tauri-shell/src-tauri/src/package_sync.rs`
  - `apps/tauri-shell/src-tauri/src/package_materializer.rs`
  - `apps/tauri-shell/src-tauri/src/local_file_service.rs`
  - `apps/tauri-shell/src-tauri/src/local_file_index.rs`
  - `apps/tauri-shell/src-tauri/src/workspace_manager.rs`
  - `apps/tauri-shell/src-tauri/src/pi_runtime.rs`
  - `apps/tauri-shell/src-tauri/src/agency_swarm_runtime.rs`
  - `apps/tauri-shell/src-tauri/src/connector_runtime.rs`
  - `apps/tauri-shell/src-tauri/src/secret_store.rs`
  - `apps/tauri-shell/src-tauri/src/audit_sink.rs`
  - `apps/tauri-shell/src-tauri/src/updater_bridge.rs`
- web UI / shared UI
  - `apps/web/client/src/features/desktop-host/*`
  - run-detail and package-detail components that surface the new labels consistently

## Risks and mitigations

### Risk: the current Tauri shell is more permissive than the target desktop-host model

Mitigation:

- layer policy-governed services above existing commands
- deprecate raw command exposure in managed mode gradually
- keep advanced local mode explicit and opt-in

### Risk: package lifecycle becomes disconnected from the current skill bundle reality

Mitigation:

- preserve current bundle manifests and schemas
- add an outer package/trust envelope instead of replacing bundle format abruptly

### Risk: Pi and Agency Swarm duplicate each other or cause routing confusion

Mitigation:

- lock runtime roles clearly
- make router decisions inspectable
- require explicit run labels everywhere

### Risk: desktop-host work conflicts with the external worker family

Mitigation:

- keep the desktop host and external worker as separate abstractions
- reuse worker contracts only where control-plane registration or delegated access is truly shared

### Risk: local file intelligence introduces privacy and parser risk

Mitigation:

- require explicit root consent
- isolate parsing/indexing workers
- enforce sensitive-root deny/default-warning rules
- keep all sync/cloud upload paths explicit

### Risk: labels and runtime identities drift between desktop, worker, and local AI systems

Mitigation:

- inherit Feature 070 locality truthfulness rules
- reconcile Desktop Host and `desktop_zeroclaw_managed` explicitly
- centralize label rendering in shared contracts rather than per-surface heuristics

## Security and boundary concerns

- device identity must be server-authoritative and revocable
- enrollment and runtime tokens must be short-lived, audience-bound, and device-bound
- package execution must fail closed on signature, compatibility, or revocation mismatch
- binary and runtime support bundle updates must fail closed on signature or downgrade mismatch
- secrets must be device-scoped, runtime-scoped, and short-lived where possible
- managed workspaces must enforce egress and mount policy
- local file indexing must not silently expand beyond approved roots

## Deliverable quality bar

Before implementation begins in earnest, the team should be able to answer:

- which device is running this?
- which package trust class is involved?
- which runtime was selected and why?
- what local files were in scope?
- what outbound routes were allowed?
- how can the run be revoked, audited, or offboarded later?

If any of those remain unclear for a user-visible flow, the implementation is not yet ready.
