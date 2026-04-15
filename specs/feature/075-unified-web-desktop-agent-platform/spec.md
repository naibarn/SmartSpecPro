# 075 - Unified Web + Desktop Agent Platform

Version: 1.0
Date: 2026-04-08
Status: Proposed
Depends-on: 004-desktop-app, 052-agency-swarm-full-capability, 064-skill-maintenance-lifecycle, 070-local-client-llm-mode, 071-openclaw-external-runtime-integration, 072-claw-worker-platform-access, 074-claw-worker-mcp-platform-completion
Supersedes: conflicting desktop-local runtime positioning inside 004-desktop-app and partial local-runtime assumptions in 059-external-worker-provider-framework where this feature defines the canonical desktop-host model
Audience: Product, Web Control Plane, Desktop/Tauri, Runtime, Skills, Agency, Security, DevOps, QA, Admin

---

## 1. Executive summary

SmartAIHub should behave as **one product with two execution surfaces**:

- **Web** is the universal surface and control plane
- **Desktop** is the local execution-rich surface

This feature turns the current Tauri shell into **SmartAIHub Desktop Host** and defines how it works with:

- gateway-only managed LLM routing
- local execution through **Pi**
- complex multi-agent orchestration through **Agency Swarm**
- local file intelligence without upload-first requirements
- signed package sync and trust labeling
- Docker-backed workspaces
- device registration, revocation, and offboarding
- the existing OpenClaw external worker family when external runtimes are still the better fit

The product outcome is not "a SaaS plus a separate local tool."

The product outcome is:

- one object model
- one trust model
- one run-history model
- one mental model
- two surfaces with different runtime strengths

---

## 2. Problem statement

SmartAIHub already has important pieces of the future architecture, but they are still fragmented:

- the Tauri shell can run local Docker, PTY, file, Git, video, and local skill commands
- Feature 070 adds local Gemma 4 inference for lightweight work
- Features 071-074 add a real external worker control plane for OpenClaw and delegated platform access
- the web app already manages skills, agencies, billing, and public gateway contracts

What is still missing is a **canonical desktop-host architecture** that unifies those pieces into one enterprise product.

Initial gaps this feature addresses:

- desktop has no canonical device identity or offboarding lifecycle
- local file access is still closer to raw command surfaces than a governed file-intelligence subsystem
- local skill execution has reviewed-bundle concepts but not org-signed desktop package lifecycle, revocation, or materialization
- there is no runtime router that explains when work should use platform skill, Pi, Agency Swarm, or external worker runtime
- desktop and web do not yet share one complete trust-and-label model for runs, packages, and locality

Without this feature, SmartAIHub risks shipping:

- a strong web control plane
- a strong but permissive local shell
- a separate external worker system

instead of a coherent unified product.

---

## 3. Goals

1. Define SmartAIHub as one product with web and desktop surfaces.
2. Elevate the existing Tauri shell into a governed Desktop Host.
3. Introduce a canonical desktop device identity, policy, and offboarding model.
4. Add signed package sync and materialization for desktop-local skills and agencies.
5. Introduce Pi as the primary desktop-local agent runtime.
6. Introduce Agency Swarm as the bundled desktop-local multi-agent runtime.
7. Add a consented local file intelligence subsystem instead of relying on raw filesystem discovery by runtimes.
8. Keep all managed LLM traffic gateway-only.
9. Preserve compatibility with the existing OpenClaw worker-runtime family.
10. Provide enterprise-grade trust, revocation, audit, and quarantine controls across web and desktop.

---

## 4. Non-goals

1. This feature does not replace Features 071-074.
2. This feature does not make OpenClaw the default desktop-local runtime.
3. This feature does not make Local AI from Feature 070 the primary desktop-agent path.
4. This feature does not promise unrestricted host access in managed mode.
5. This feature does not require upload-first RAG for large local file estates.
6. This feature does not make terminal UI the main desktop experience.
7. This feature does not require users to install Pi, Python, Agency Swarm, or Docker manually in the managed flow.

---

## 5. Current-codebase fit

### 5.1 Existing desktop baseline

Current files:

- `apps/tauri-shell/src-tauri/src/lib.rs`
- `apps/tauri-shell/src-tauri/src/file_commands.rs`
- `apps/tauri-shell/src-tauri/src/docker_commands.rs`
- `apps/tauri-shell/src-tauri/src/local_skill_runtime.rs`
- `apps/tauri-shell/src-tauri/src/terminal_pty.rs`

Fit:

- the existing Tauri shell already provides strong local execution primitives
- Feature 075 should wrap these in a Desktop Host contract instead of discarding them

### 5.2 Existing local skill and local AI baseline

Current files:

- `apps/web/server/services/localAiSkillPolicy.ts`
- `apps/web/server/services/skillCompatibilityGate.ts`
- `packages/local-ai-core/src/*`

Fit:

- the repo already understands reviewed local script bundles and compatibility gates
- Feature 075 should extend these into signed package lifecycle, trust classes, and desktop materialization

### 5.3 Existing worker and gateway baseline

Current files:

- `apps/web/shared/workerRuntime.ts`
- `apps/web/server/routes/workerRuntime.ts`
- `apps/web/server/services/workerDelegationService.ts`
- `apps/web/server/services/workerFleetService.ts`
- `apps/web/server/_core/llmRoutes.ts`
- `apps/web/server/_core/responsesRoutes.ts`
- `apps/web/server/_core/mcpPublicServer.ts`

Fit:

- the external worker fabric and truthful gateway posture already exist
- Feature 075 should integrate with them, not re-solve them

### 5.4 Missing platform pieces

Confirmed gaps:

- no device registry for desktop installs
- no signed package registry for desktop skill/agency distribution
- no desktop package materializer
- no local file intelligence service with root consent, previews, and indexing
- no Pi runtime host
- no desktop Agency Swarm runtime host
- no connector runtime abstraction for managed local connectors
- no unified run-routing layer across platform skill, Pi, Agency Swarm, and external runtimes

### 5.5 Supersession matrix

The new desktop-host model supersedes or narrows prior documents as follows:

| Prior document | Prior assumption | Feature 075 rule |
|---|---|---|
| 004-desktop-app | `desktop-app/` path and localhost `python-backend` proxy are the main desktop truth | `apps/tauri-shell` is the canonical desktop foundation; the localhost proxy path becomes compatibility-only for older chat/media flows until explicitly retired |
| 004-desktop-app | desktop security is mostly "no embedded CP keys + proxy token" | desktop security expands to device identity, signed package sync, runtime policy, approval gates, revocation, and offboarding |
| 070-local-client-llm-mode | local AI provides truthful `Hybrid` vs `Cloud` semantics for current chat flows | Feature 075 must inherit those truthfulness rules rather than relabeling every desktop run as `Local` |
| 071-074 worker family | `desktop_zeroclaw_managed` is the future managed desktop-facing worker runtime in the worker registry | Feature 075 keeps that worker-runtime identity for optional worker-fabric projection, while Pi and Agency Swarm remain internal desktop-host runtime labels rather than new worker-runtime types |

---

## 6. Locked product decisions

### 6.1 One product, two surfaces

- Web is the control plane and universal surface.
- Desktop is the local execution-rich surface.
- Both must share naming, object semantics, trust labels, and run labels.

### 6.2 Desktop foundation

- The desktop product remains the existing Tauri shell path at `apps/tauri-shell`.
- Feature 075 renames the architecture role of that shell to **SmartAIHub Desktop Host**.

### 6.3 Runtime taxonomy

The canonical execution runtime labels should become:

| Product label | Backing runtime | Locality | Primary use |
|---|---|---|---|
| Platform Skill | platform/server execution | server | deterministic, bounded workflows |
| Pi | desktop-local managed runtime | local | interactive agent work, coding, file exploration |
| Agency Swarm | desktop-local managed runtime | local | multi-agent delegation and long-running orchestration |
| Cloud Agent | platform/server execution | server | approved cloud-side agent workloads |
| OpenClaw Gateway | external runtime from Features 071-074 | external | delegated external runtime work where desktop-local execution is not the right path |

Feature 070 local AI remains a model/runtime substrate that Pi, desktop UX, or preprocessing flows may use. It is not a separate primary runtime label for the unified agent platform.

Worker-fabric reconciliation rule:

- when the desktop host must appear inside the existing worker registry, it should project as `desktop_zeroclaw_managed` for backward-compatible worker-fabric semantics
- Pi and Agency Swarm remain **internal runtime labels inside Desktop Host**, not new external worker-runtime type names

### 6.4 Canonical object model

Server-canonical objects:

- User
- Organization
- Device
- Project
- Skill Package
- Agency Pack
- Pack Version
- Trust Class
- Capability Manifest
- Policy Set
- Run
- Run Step
- Artifact

Desktop-materialized objects:

- local package cache
- local runnable Pi skill bundle
- local runnable Agency Swarm bundle
- local workspace
- local file root
- local file index
- local connector session
- device-scoped secret reference

### 6.5 Package and trust model

Package classes:

- built-in verified
- organization-verified
- local-unverified desktop package
- project-local desktop package

Rules:

- server-authored packages must be signed
- capability manifests are required for all syncable packages
- local-unverified packages are desktop-only by default
- server execution must never silently run a local-unverified desktop package

### 6.6 Local file posture

- local roots are explicitly consented by the user and constrained by org policy
- desktop owns discovery, indexing, preview, and retrieval
- Pi and Agency Swarm consume governed file APIs and staged attachments instead of unconstrained whole-disk discovery by default
- managed web and desktop settings should surface the reported parser isolation mode, supported rich-document formats, bounded input size, and timeout posture for local file intelligence

### 6.6.1 Managed posture visibility

- the user-facing settings surface should show enrolled-device posture, including:
  - health status
  - last-seen timestamp
  - proof-of-possession algorithm and binding mode
  - attestation/storage mode reported by desktop
  - attestation provider, evidence digest, and reported claims when desktop exposes them
  - attestation support source, default mode, helper reachability, and supported modes when desktop exposes an external broker posture report
- the same settings surface should show local parser posture, including:
  - isolation mode
  - supported rich-document formats
  - OCR on/off state
  - PDF extraction backend, render backend, office renderer, and OCR provider when available
  - whether parser posture is text-extraction only, rendering without OCR, or render-plus-OCR capable
  - rendered preview formats when desktop exposes them
  - whether multi-page rendering is available and the maximum rendered page count
  - OCR layout mode for rendered extraction paths
  - whether macro inspection and embedded media inspection are available
  - layout analysis mode for rendered or structurally segmented extraction paths
  - bounded input and timeout limits

### 6.7 Workspace posture

- Docker-backed managed workspace is the default desktop execution model
- raw `docker run` pass-through is not the product abstraction
- workspace profiles must control mounts, network, environment injection, and isolation level

### 6.8 Managed-mode LLM posture

- managed desktop mode is gateway-only
- desktop cannot silently fall back to direct public-provider keys
- gateway catalog and policy remain server-authoritative

### 6.8.1 Desktop-to-platform transport posture

- Desktop Host is **HTTP-first, MCP-second** when talking to SmartAIHub platform services
- Pi and Agency Swarm should consume Desktop Host adapters, and those adapters should prefer durable HTTP contracts where they already exist
- MCP remains valid where tool/workspace semantics fit better, but it must not become a third undocumented platform surface

### 6.8.2 Truthful locality labels

- Feature 075 inherits Feature 070's rule that `Local` is reserved for flows where the relevant raw input did not traverse the SmartAIHub backend before inference or execution
- Desktop Host runs that still depend on server-persisted chat state, server-mediated tools, or platform-side completion should typically be labeled `Hybrid`, not `Local`
- the product must publish a run-label matrix so desktop, web, and worker runtimes render locality truthfully and consistently

### 6.9 OpenClaw relationship

- OpenClaw remains an external runtime family from Features 071-074
- it is not the replacement for Pi or desktop-host architecture
- desktop-host work may interoperate with worker registration later, but the desktop host is not reduced to "just another worker"

### 6.10 Advanced local mode

- advanced local mode is explicit, warning-bearing, and org-disableable
- it may relax writeback, mounts, or local package rules
- it does not change the managed-mode gateway-only rule

### 6.11 High-risk approval and step-up posture

- managed mode requires explicit approval policies for:
  - destructive local file writes/deletes outside approved output roots
  - connector outbound actions that leave the device or tenant boundary
  - execution of local-unverified packages
  - shell/process actions outside the default runtime/tool profile
  - non-default workspace mounts, egress profiles, or privileged runtime switches
- organizations may choose:
  - auto-block
  - warn + require user confirmation
  - admin-reviewed allowlist
  - advanced-local-mode only

### 6.12 Desktop update trust chain

- SmartAIHub Desktop Host binaries, bundled runtime support packs, and updater payloads must be signed
- the desktop host must verify binary/update provenance before applying upgrades
- rollback and downgrade protection must exist for the app bundle and for runtime support components where version skew can weaken policy enforcement
- the desktop host must maintain a trusted signer set / public-key set for update verification, with support for signed key rotation and emergency signer revocation
- update metadata must include a monotonic release identity so replayed or stale manifests cannot silently roll the device backward
- update policy remains server-authoritative in managed mode

---

## 7. High-level architecture

```text
SmartAIHub Server (Control Plane)
  ├─ Auth / SSO / Policy / Trust / Signing / Revocation
  ├─ Package Registry (skills, agencies, support packs)
  ├─ Signed Release Metadata / Update Policy
  ├─ Device Registry / Offboarding / Audit
  ├─ LLM Gateway + Model Catalog + MCP
  ├─ Run Metadata / Shared History / Admin Views
  └─ Web Product

SmartAIHub Desktop Host (Tauri)
  ├─ Unified Workbench UI
  ├─ Device Identity + Policy Bridge
  ├─ Package Sync + Materializer
  ├─ Local File Service + Indexers + Preview Cache
  ├─ Workspace Manager + Docker Profiles
  ├─ Pi Runtime Host
  ├─ Agency Swarm Runtime Host
  ├─ Local Connector Runtime
  ├─ Secret Store Adapter
  ├─ Updater Bridge
  └─ Audit/Event Sink
```

Control-plane truth:

- identities
- org policy
- model catalog
- package signatures
- revocation state
- signed release metadata and update policy
- shared run metadata

Desktop-host truth:

- materialized runtime bundles
- local workspace state
- local file indexes and preview cache, stored in OS-protected or encrypted-at-rest form where supported
- device-scoped secrets
- runtime health and local execution artifacts pending sync
- verified update state

---

## 8. Functional requirements

### 8.1 Device registration and policy

- each desktop install must register a device identity with the server
- the desktop host must fetch policy, trust, and revocation state during sign-in and refresh cycles
- admins must be able to disable a device, revoke package access, require re-auth, and trigger cleanup policies

### 8.1.1 Device enrollment and token model

- first-run enrollment must use a server-authorized bootstrap flow rather than implicit long-lived local secrets
- first-run enrollment must create or register a device-held keypair so later refresh and runtime token issuance can require proof-of-possession rather than bearer-only replay
- managed desktop enrollment should use asymmetric cryptographic proof-of-possession by default; shared-secret compatibility should remain migration-only or explicitly restricted
- the control plane must issue distinct credential classes for:
  - device enrollment/bootstrap
  - device session refresh
  - runtime-scoped short-lived execution tokens
  - connector-scoped or package-download-scoped temporary tokens where needed
- tokens should bind to device identity, user identity, tenant identity, audience, and expiry
- bootstrap secrets or enrollment challenges must be one-time and invalidated once the device is successfully bound
- refresh and runtime token minting must support device re-key, explicit re-enrollment, and cloned-device suspicion handling without trusting the old device secret forever
- the system must support re-enrollment, rotation, and stolen-device recovery without reusing old local secrets
- the control plane must expose a real device-disable action, and disabled devices must stop passing managed execution gates on the next policy refresh
- desktop secret storage should use OS keychain storage when available, falling back to protected file-backed storage only when the platform cannot satisfy the stronger path
- Desktop Host may cache policy and package metadata offline, but it may not cache unbounded evergreen credentials

### 8.2 Package sync, signing, and materialization

- the server must publish signed desktop-consumable packages for skills, agencies, and runtime support packs
- the desktop host must verify signature, compatibility, trust class, and revocation state before materialization
- materialization must preserve current skill bundle contracts where practical, adding package metadata rather than replacing the bundle format entirely
- the desktop host must clearly label local-unverified and project-local packages

### 8.2.1 Trust propagation for outputs

- every run artifact must retain provenance for:
  - package source
  - signer
  - trust class
  - runtime
  - device
- outputs from local-unverified or project-local packages must be marked as trust-tainted until an org policy explicitly allows wider publication
- trust-tainted outputs must not silently promote into organization-verified library, knowledge, or server-execution flows
- publication of trust-tainted outputs may require confirmation, admin review, or quarantine depending on policy

### 8.3 Execution router

- the platform must choose between Platform Skill, Pi, Agency Swarm, Cloud Agent, and OpenClaw based on task shape, policy, trust, file scope, and runtime availability
- routing decisions must be inspectable and logged
- every run must show:
  - surface
  - runtime
  - trust
  - locality
  - workspace

### 8.4 Pi runtime integration

- Pi is the primary desktop-local interactive agent runtime
- the managed default is an isolated sidecar/RPC integration so Desktop Host can preserve crash isolation, policy boundaries, and cleaner secret injection
- embedded SDK integration may be introduced later only if it reaches security and operability parity with the managed sidecar path
- desktop host controls Pi provider registration, gateway base URL, auth injection, mounted tools, working directory, and policy hooks
- Pi should access local files through Desktop Host APIs and staged attachments, not through default whole-disk access

### 8.5 Agency Swarm integration

- Agency Swarm is the desktop-local runtime for complex multi-agent orchestration
- server-authored agencies must materialize into local runnable agency bundles with capability and policy descriptors
- default packaging should prefer managed Docker runtime for enterprise installs
- Agency Swarm must receive gateway-only provider configuration in managed mode and must fail closed if only unmanaged provider keys are available
- Agency Swarm must use desktop-host adapters for local file service, connectors, server APIs, and secrets
- Desktop Host owns thread persistence, recovery callbacks, and policy-scoped tool injection for Agency Swarm sessions

### 8.6 Local file intelligence

- users explicitly choose local roots
- the desktop host maintains metadata, full-text, preview, thumbnail, and optional vector indexes per root
- retrieval must support:
  - search
  - metadata inspection
  - preview/snippets
  - related file suggestions
  - staged attachment into workspace/run
- writeback must be separately governed from read/search
- derived local-file stores such as preview cache, snippet cache, full-text index, and vector index must have explicit lifecycle policy for retention, purge on root removal, and purge on offboarding
- where the OS supports it, those derived stores should be kept in OS-protected or encrypted-at-rest storage rather than plain unmanaged cache directories
- local parsing may opportunistically use trusted external extractors such as `pdftotext` or `tesseract` when available, but managed behavior must remain bounded and fail closed when those tools are missing or error

### 8.7 Workspace and Docker management

- managed workspaces must use policy-controlled container profiles
- default network posture is restricted:
  - SmartAIHub server allowed
  - SmartAIHub gateway allowed
  - approved connector endpoints allowed
  - all else denied unless policy permits
- mounts must be generated from approved roots and workspace policy, not direct user-provided Docker volume strings in managed mode

### 8.7.1 Approval matrix for workspace escalation

- switching from standard managed workspace to advanced local workspace must be explicit and logged
- non-default mounts, broader egress, host-process spawn, or privileged tool access must evaluate against the high-risk approval posture in section 6.11
- the platform must preserve a machine-readable reason for every approval, denial, override, and emergency block

### 8.8 Connector runtime and secrets

- local connectors must run through a SmartAIHub-managed connector runtime
- runtimes consume connector actions through host APIs, not arbitrary SDK use in managed mode
- connector credentials are device-scoped and stored in the desktop secure store
- secrets must be runtime-scoped and short-lived where practical

### 8.9 Security and governance

- capability manifests are required for desktop-syncable packages
- server-published packages are signed and revocable
- desktop must support quarantine, block, revoke, and requires-review states
- suspicious document parsing must happen in isolated workers or containers
- audit logs must cover package sync, trust verification, run lifecycle, outbound policy decisions, and governance actions

### 8.9.1 Binary and runtime update security

- desktop-host installers and auto-update payloads must be signed and versioned
- runtime support bundles for Pi, Agency Swarm, and local indexing/parser workers must have integrity metadata and compatibility checks
- the desktop host must detect downgrade attempts, signature mismatches, and unsupported version skew between app, runtime bundles, and control-plane policy
- the update system must support signer rotation, signer revocation, and emergency key-compromise response without requiring unsafe manual bypass
- updater policy must define whether rollback is blocked, admin-authorized, or emergency-only and that policy must be logged

### 8.10 Offline and degraded behavior

- desktop may continue to browse local files, packages, and draft workspaces while offline
- managed LLM execution may not proceed without gateway connectivity unless policy explicitly allows an offline mode
- stale trust or revocation metadata must eventually fail closed after freshness TTL expires

---

## 9. API and contract requirements

### 9.1 Server-side contracts

- device registration and refresh
- device enrollment challenge / bootstrap
- desktop policy snapshot
- package catalog and package download
- signature and revocation feed
- update policy and signed release metadata
- model catalog and gateway metadata
- run metadata upload / sync
- connector capability metadata

### 9.2 Desktop internal contracts

- package sync and materialization
- local root management
- local search and preview retrieval
- workspace provisioning and teardown
- runtime start / stop / health
- connector operations
- secret issue / revoke
- update verification and apply
- audit checkpoint upload

### 9.3 Shared contract direction

- Feature 075 should add a shared desktop-host contract package rather than duplicating JSON shape logic across web and Tauri
- it should reuse the worker-runtime and delegated-capability vocabulary where that improves consistency, without forcing the desktop host to masquerade as an external worker

---

## 10. Implementation phases

### Phase 1 - Foundation

- device registry
- desktop policy bridge
- signed package registry contract
- desktop package sync/materializer baseline
- managed workspace profile baseline
- unified run labels

Phase 1 exit gate:

- device enrollment uses one-time bootstrap plus device-held key material
- runtime-scoped tokens are short-lived and proof-of-possession capable
- signed package verification is enforced before any managed materialization path can run
- rollout flags default to fail-closed

### Phase 2 - Local power

- local file intelligence roots, metadata, full-text, and previews
- managed connector runtime baseline
- capability manifest enforcement for desktop packages
- advanced local mode switches and trust banners

Phase 2 exit gate:

- raw absolute-path discovery is no longer the default managed UX
- local index and preview stores purge correctly when a root is removed
- workspace policy blocks non-approved mounts and egress in managed mode

### Phase 3 - Runtime unification

- Pi runtime host
- execution router
- Agency Swarm desktop materialization and runtime host
- web/desktop handoff flows

Phase 3 exit gate:

- Pi and Agency Swarm both enforce gateway-only provider injection in managed mode
- unmanaged provider keys are rejected for managed runtime start
- run-label truthfulness is verified across local, hybrid, external, and server paths

### Phase 4 - Enterprise hardening

- revocation freshness enforcement
- quarantine and kill-switch flows
- DLP-aware outbound controls
- device offboarding automation
- privacy-mode and telemetry controls

Phase 4 exit gate:

- signed updater chain, signer rotation, and downgrade controls are live
- offboarding purges package cache and derived local-file stores according to policy
- high-risk approval matrix and DLP checks are enforced on the main outbound channels

---

## 11. Acceptance criteria

### 11.1 Product acceptance

- a user installs desktop, signs in, and receives policy without manual runtime setup
- web and desktop show the same package identities and trust labels
- desktop can run packaged skills through a governed runtime without exposing raw shell or Docker details as the default UX
- users can attach and search local roots without upload-first indexing
- runs clearly show surface, runtime, trust, locality, and workspace labels

### 11.2 Security acceptance

- unsigned server packages do not materialize
- revoked packages fail closed after freshness policy
- managed mode never silently falls back to direct public-provider keys
- local roots are consented and sensitive roots are blocked or discouraged by default
- raw absolute-path file access is not the primary discovery surface for managed runtimes
- workspace defaults are restricted and policy-driven

### 11.3 Operational acceptance

- runtime health is inspectable from the control plane
- package sync is resumable
- degraded and offline states are explicit to the user
- admin can disable a device and prevent new runs
- support teams can diagnose desktop-host state without requiring users to understand Pi or Agency Swarm internals

---

## 12. Open questions

1. Which desktop-local connector families ship in the first rollout?
2. What is the minimum desktop package manifest that cleanly wraps today's skill bundle format?
3. What revocation freshness TTL is acceptable when the desktop is offline?
4. How much writeback into user roots is allowed in standard managed mode?
5. What device attestation strength beyond keypair proof-of-possession is practical across supported desktop OSes?

---

## 13. Final decision statement

SmartAIHub should standardize on this end-state:

- Web is the control plane and universal surface.
- Desktop Host is the local execution-rich surface built on the existing Tauri shell.
- Pi is the primary desktop-local agent runtime.
- Agency Swarm is the desktop-local complex orchestration runtime.
- OpenClaw remains the external runtime family, not the default desktop-local runtime.
- Local file intelligence belongs to the Desktop Host, not to raw whole-disk runtime access.
- Server-authored packages are signed, revocable, and materialized locally under explicit trust rules.
- Managed LLM traffic is gateway-only across both surfaces.

This is the clearest practical path from the current codebase to the product direction described in the master spec.
