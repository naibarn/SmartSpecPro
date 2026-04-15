# Research Notes

## Existing spec lineage

### `004-desktop-app`

Key findings:

- the repo already has a desktop/Tauri product line
- the older spec frames the desktop app mainly as a local shell plus localhost proxy path
- that spec does not define a governed desktop-host control plane, package sync, local-file intelligence, or enterprise device lifecycle

Implication:

- the new feature should extend the existing desktop shell into a first-class desktop host instead of treating desktop as only a terminal and proxy wrapper

### `052-agency-swarm-full-capability`

Key findings:

- Agency Swarm is already a defined SmartAIHub runtime family on the web side
- the spec is deep on agency capabilities, but not on bundled desktop materialization or local runtime governance

Implication:

- the new feature can reuse Agency Swarm as the complex orchestration runtime while adding the missing desktop-host packaging and security model

### `064-skill-maintenance-lifecycle`

Key findings:

- the repo already works with skill bundle structure, manifests, compatibility gates, and migration guidance
- that feature improves skill quality, but it is not yet a signed desktop package lifecycle

Implication:

- the new feature should build on the existing bundle/manifest world rather than replacing it, then add package manifests, signatures, trust labels, and revocation around it

### `070-local-client-llm-mode`

Key findings:

- SmartAIHub already has a local AI track for Gemma 4 browser and Tauri inference
- Feature 070 is intentionally compatibility-first and off-by-default
- it focuses on lightweight local inference, not full local agent execution

Implication:

- Feature 075 should treat Local AI as a supporting model/runtime substrate, not as a substitute for Pi or Agency Swarm

### `071-074` worker-runtime family

Key findings:

- the codebase now includes worker registration, delegated worker access, MCP posture, budgets, and fleet monitoring
- the current runtime taxonomy already includes `openclaw_gateway` and `desktop_zeroclaw_managed`

Implication:

- the new desktop-host feature must coexist with the external worker fabric
- the desktop host may later project managed capabilities into the worker system, but it should not collapse into "just another worker"

## Current codebase touchpoints

### Tauri shell baseline

Files:

- `apps/tauri-shell/src-tauri/src/lib.rs`
- `apps/tauri-shell/src-tauri/src/file_commands.rs`
- `apps/tauri-shell/src-tauri/src/docker_commands.rs`
- `apps/tauri-shell/src-tauri/src/local_skill_runtime.rs`
- `apps/tauri-shell/src-tauri/src/terminal_pty.rs`

Findings:

- the Tauri shell already exposes local Docker, Git, file, PTY, video, and local skill runtime commands
- this is a strong execution baseline for a future desktop host
- the current command surface is still low-level and permissive compared with the requested enterprise-governed product model

Implication:

- Feature 075 should reuse these primitives under a policy-governed host layer instead of exposing them directly as the main product abstraction

### Raw file access posture

File:

- `apps/tauri-shell/src-tauri/src/file_commands.rs`

Findings:

- `validate_path()` requires an absolute path and rejects `..`, but it does not yet enforce managed roots, trust classes, consented indexes, or DLP-aware scope boundaries
- `fs_search_files()` is depth-limited recursive filename matching, not a true local file intelligence service

Implication:

- the requested local file intelligence platform does not exist yet and must become a first-class subsystem

### Docker sandbox posture

File:

- `apps/tauri-shell/src-tauri/src/docker_commands.rs`

Findings:

- `docker_create_sandbox()` passes through ports, volumes, env vars, CPU, and memory directly to `docker run`
- there is no managed workspace policy profile, network egress class, mount allowlist contract, or org policy reconciliation

Implication:

- Feature 075 needs a workspace manager and container policy layer above the raw Docker commands

### Local skill execution posture

Files:

- `apps/tauri-shell/src-tauri/src/local_skill_runtime.rs`
- `apps/web/server/services/localAiSkillPolicy.ts`
- `apps/web/server/services/skillCompatibilityGate.ts`
- `packages/local-ai-core/src/*`

Findings:

- the repo already supports reviewed local script bundles and Gemma 4 local runtime capabilities
- there are existing manifest concepts such as `localExecution`, `reviewedEntry`, `artifactDigestSha256`, and permission profiles
- this is stronger than a blank-slate local runtime, but it is still not an org-signed package sync and revocation model

Implication:

- Feature 075 should preserve these manifest contracts and wrap them inside a broader package/signing/materialization lifecycle

### Worker control plane and delegated platform access

Files:

- `apps/web/server/routes/workerRuntime.ts`
- `apps/web/server/services/workerRegistryService.ts`
- `apps/web/server/services/workerDelegationService.ts`
- `apps/web/server/services/workerFleetService.ts`
- `apps/web/shared/workerRuntime.ts`

Findings:

- the repo now has a real external worker registry, delegated session model, budgets, and fleet operations
- the worker fabric already supports truthful HTTP-first platform access and MCP readiness constraints

Implication:

- the desktop-host plan should reuse this when desktop-local execution needs control-plane registration or delegated platform access, but it should stay a richer product surface than the external worker abstraction

## Confirmed gaps relative to the requested master spec

- no canonical desktop device registry or offboarding lifecycle
- no signed package registry for skills/agencies targeted at desktop sync
- no local package materializer that converts server-authored skills/agencies into trusted local runtime bundles
- no Pi runtime integration
- no desktop-owned Agency Swarm bundle/runtime host
- no desktop local file intelligence platform with metadata, full-text, preview, and vector indexing by consented roots
- no managed local connector runtime contract for Telegram / Discord / LINE style connectors
- no desktop secret lifecycle tied to device identity, runtime scope, and org revocation
- no canonical desktop run router that chooses platform skill vs Pi vs Agency Swarm vs hybrid
- no end-to-end enterprise trust model that unifies local-unverified packages, signed org packages, revocation, and quarantine

## Recommended scope from research

Keep this feature focused on the platform-level integration layer that turns current pieces into one coherent product:

- unify web and desktop semantics
- elevate the existing Tauri shell into SmartAIHub Desktop Host
- define package trust, device identity, runtime routing, and local-file intelligence
- integrate Pi and Agency Swarm as desktop runtimes
- preserve and integrate the existing OpenClaw worker family instead of replacing it
