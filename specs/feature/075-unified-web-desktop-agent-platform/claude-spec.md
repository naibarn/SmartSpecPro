# Claude Spec

## Feature

Build Feature 075: a unified web + desktop agent platform for SmartAIHub where:

- Web remains the universal surface and control plane.
- Desktop becomes the governed local execution surface.
- Both surfaces share one object model, one trust model, one run-history model, and one user mental model.

## Why This Exists

SmartAIHub already has the raw ingredients of the target product:

- a Tauri desktop shell with local execution primitives
- a web control plane with gateway, skills, agencies, and runtime contracts
- a local AI path for lightweight inference
- an external worker-runtime family for delegated workloads

What is still missing is the canonical architecture that turns those pieces into one enterprise product instead of three parallel systems.

Without this feature, SmartAIHub risks:

- leaving desktop as a powerful but permissive shell
- leaving worker runtimes as a separate operational island
- leaving local execution, trust, and locality labels inconsistent across surfaces

## Product Outcome

The product should behave as a single SmartAIHub system with two surfaces:

- `Web`: governance, publishing, monitoring, lightweight execution, universal access
- `Desktop`: local execution, local files, Docker-backed workspaces, local connectors, high-resource jobs, advanced local automation

The user should understand where execution happened, what runtime was used, what trust class applied, and what data scope was permitted.

## Core Requirements

### 1. Desktop Host Foundation

The existing Tauri app at `apps/tauri-shell` becomes the canonical SmartAIHub Desktop Host.

It must stop being primarily a raw local command surface and instead become a governed host that owns:

- device identity
- runtime policy
- package sync and materialization
- workspace orchestration
- local file intelligence
- local connector access
- desktop audit and secret lifecycle

### 2. Runtime Model

The unified runtime taxonomy is:

- `Platform Skill`
  - server-side bounded workflows
- `Pi`
  - desktop-local interactive agent runtime
- `Agency Swarm`
  - desktop-local multi-agent orchestration runtime
- `Cloud Agent`
  - approved server-side agent execution
- `OpenClaw Gateway`
  - existing external runtime path from Features 071-074

Compatibility rule:

- if Desktop Host must appear in the worker registry, it projects as `desktop_zeroclaw_managed`
- Pi and Agency Swarm remain internal desktop-host runtime labels, not worker-runtime registry types

### 3. Gateway-Only Managed LLM Routing

In managed mode:

- all model access must route through the SmartAIHub gateway
- Desktop Host may not silently use unmanaged provider keys
- degraded or offline conditions must not trigger direct-provider fallback
- this gateway-only rule applies to Pi and Agency Swarm as well as any desktop-hosted helper runtimes

### 4. Package, Trust, and Materialization Model

Desktop must support:

- built-in verified packages
- org-verified signed packages
- local-unverified desktop packages
- project-local packages

Requirements:

- server-published desktop packages are signed
- all executable packages have capability manifests
- desktop verifies signature, compatibility, and revocation before materialization or execution
- local-unverified packages remain desktop-only by default
- outputs from local-unverified or project-local packages carry trust-taint until reviewed

### 5. Device Identity and Offboarding

Each desktop install requires a device identity with:

- enrollment bootstrap
- device-held key material for proof-of-possession during refresh and runtime token issuance
- device-bound refresh/session model
- runtime-scoped short-lived credentials
- server-side disable/re-auth/revoke controls
- re-key, re-enrollment, and cloned-device suspicion handling
- cleanup and offboarding behavior

### 6. Local File Intelligence

Desktop must own governed access to local files through a consented-root model.

This subsystem must provide:

- approved local roots
- metadata indexing
- full-text search
- preview/snippet extraction
- staged attachment flows into workspaces and runs
- optional semantic retrieval
- explicit retention and purge rules for derived preview, snippet, and index data

Raw absolute-path discovery must not remain the default managed user experience.

Derived local-file stores should be kept in OS-protected or encrypted-at-rest storage where supported and should be purged when roots are removed or devices are offboarded.

### 7. Managed Workspace Layer

Desktop execution should default to Docker-backed managed workspaces with:

- approved mount profiles
- controlled network egress classes
- environment injection rules
- writeback policy
- audit hooks

Raw `docker run` passthrough is an implementation primitive, not the product contract.

### 8. Unified Labels and Truthfulness

Runs must show:

- surface
- runtime
- trust class
- locality
- workspace type

Feature 075 must inherit Feature 070's truthfulness rules:

- `Local` only when raw user content and execution truly stay local
- `Hybrid` when Desktop Host still routes or persists meaningful state through server-side services

### 9. Desktop Update Trust Chain

Package signing alone is not enough.

Managed desktop rollout also requires:

- signed app releases
- signed or integrity-checked bundled runtime payloads
- update metadata verification
- downgrade protection by default
- emergency rollback only through explicit server-authorized policy
- signer rotation and compromised-signer response

### 10. Security and Governance

The feature must assume that:

- local packages can be malicious
- documents can be hostile
- connectors can exfiltrate data
- model outputs can attempt policy bypass
- devices can be lost or offboarded

Required controls:

- least-privilege capability manifests
- package trust classes
- approval and step-up policy for dangerous actions
- DLP-aware outbound controls
- secure secret storage
- document parsing isolation
- lifecycle controls for derived local-file stores
- auditability and quarantine

## Implementation Constraints from Research

### Existing codebase constraints

- The desktop shell already exposes direct file and Docker operations, so the feature must harden around live low-level capabilities rather than designing from scratch.
- The current local-skill stack already has meaningful manifest and provenance fields that should be reused.
- The worker-runtime family already contains `desktop_zeroclaw_managed`, so runtime identity must be reconciled instead of duplicated.

### Third-party runtime constraints

- Current Tauri updater guidance expects signed updates and public-key verification.
- Current Agency Swarm guidance assumes a modern Python runtime and application-owned persistence callbacks.
- No authoritative public contract was confirmed for the exact "Pi" runtime name used in the feature, so the integration must be expressed as an adapter boundary owned by SmartAIHub.

## Explicit Assumptions Used for This Plan

Until the user overrides them, the plan assumes:

1. The old localhost `python-backend` desktop path is migration-only compatibility, not the future canonical model.
2. Desktop Host projects into the worker fabric only when explicitly enabled by a team or admin.
3. Outputs from `local-unverified` packages remain local by default and cannot silently promote into shared verified surfaces.
4. Managed Pi integration starts with a sidecar or RPC-style boundary rather than embedded-first integration.

## Out of Scope

- Replacing the worker-runtime family from Features 071-074
- Making local Gemma 4 inference the main desktop-agent runtime identity
- Allowing unrestricted host access in managed mode
- Making terminal UX the primary product surface
- Requiring upload-first RAG for large local file estates
- Requiring users to manually install runtime dependencies in the standard managed flow

## Success Criteria

Feature 075 is successful when:

1. Desktop can be installed, enrolled, and used without manual runtime setup in the standard managed path.
2. Web and desktop show the same package, trust, and run-label semantics.
3. Managed model traffic stays gateway-only.
4. Desktop-local execution is powerful but policy-governed.
5. Local file access is consented, indexed, auditable, and not dependent on upload-first cloud ingestion.
6. Pi and Agency Swarm can run under Desktop Host governance.
7. Org admins can revoke packages, disable devices, and trust desktop state with real auditability.
