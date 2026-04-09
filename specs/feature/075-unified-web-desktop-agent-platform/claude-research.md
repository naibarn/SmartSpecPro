# Claude Research

## Scope

This research supports Feature 075, which defines SmartSpecPro as a unified web + desktop agent platform with:

- a governed Desktop Host built on the existing Tauri shell
- signed package sync and materialization
- local execution via Pi and Agency Swarm
- local file intelligence
- gateway-only managed LLM routing
- stronger enterprise trust, device, and offboarding controls

The goal of this note is to ground the planning work in:

- the current SmartSpecPro codebase
- the current feature-spec lineage
- current official documentation for the third-party runtime and desktop update surfaces that materially affect design
- the real test setup already used in the repo

## Research Decision

Auto-decision for this planning run:

- Codebase research: yes
  - This is an existing multi-surface product with active desktop, worker, and local-execution code paths.
- Web research: yes
  - The spec depends on current behavior of Tauri updater/signing and Agency Swarm runtime expectations.
- Testing research: yes
  - The plan needs to mirror the existing mixed TypeScript, Rust, and Python test setup rather than inventing a new one.

## Existing Spec Lineage

### Feature 004 - Desktop App

Key finding:

- The older desktop line is real and still matters, but it centers on a localhost proxy-era mental model and not a fully governed desktop-host control plane.

Planning implication:

- Feature 075 should extend and narrow 004 rather than pretending it never existed.
- The 004 localhost `python-backend` path must be treated as compatibility-only until migration is complete.

### Feature 052 - Agency Swarm Full Capability

Key finding:

- Agency Swarm is already part of SmartSpecPro's runtime vocabulary, but the prior spec focuses more on capability than on desktop packaging, signed distribution, or device-governed local execution.

Planning implication:

- Feature 075 can build on that runtime investment, but it must add the missing desktop-local packaging, security, and lifecycle story.

### Feature 064 - Skill Maintenance Lifecycle

Key finding:

- The repo already uses bundle and manifest concepts for skills, compatibility gates, and local execution review.

Planning implication:

- Feature 075 should wrap that bundle reality with a stronger package envelope instead of replacing the current structure outright.

### Feature 070 - Local Client LLM Mode

Key finding:

- Feature 070 already establishes truthful locality rules and a compatibility-first local inference posture for Gemma 4.

Planning implication:

- Feature 075 must inherit Feature 070's `Local` vs `Hybrid` truthfulness model.
- Local AI remains a supporting substrate, not the main desktop-host runtime identity.

### Features 071-074 - Worker Runtime Family

Key finding:

- The worker-fabric direction is already substantial, including runtime registration, fleet operations, platform access, budgets, and HTTP-first gateway posture.

Planning implication:

- Feature 075 must integrate with this family carefully.
- Desktop Host is not "just another worker," but when it needs worker-fabric projection it should do so through the existing `desktop_zeroclaw_managed` identity.

## Codebase Research

### Desktop Baseline Is Strong but Still Low-Level

Relevant files:

- `apps/tauri-shell/src-tauri/src/lib.rs`
- `apps/tauri-shell/src-tauri/src/file_commands.rs`
- `apps/tauri-shell/src-tauri/src/docker_commands.rs`
- `apps/tauri-shell/src-tauri/src/local_skill_runtime.rs`
- `apps/tauri-shell/src-tauri/src/terminal_pty.rs`

Findings:

- The Tauri shell already exposes Docker, file, Git, PTY, video, and local-skill runtime commands.
- The command surface is usable as an implementation substrate, but it is still closer to "privileged local shell" than to a governed desktop host.
- `lib.rs` exposes these low-level commands directly through Tauri invoke handlers.

Planning implication:

- Feature 075 should preserve these primitives as internal building blocks.
- Managed mode should route through Desktop Host services and policies instead of exposing raw command primitives as the primary product contract.

### File Access Is Absolute-Path Based, Not Root-Governed

Relevant file:

- `apps/tauri-shell/src-tauri/src/file_commands.rs`

Findings:

- `validate_path()` requires absolute paths and rejects `..`.
- The current implementation does not enforce managed roots, org policy, or consented file scopes.
- `fs_write_file()` and `fs_delete_file()` operate directly once the path passes that narrow validation.
- `fs_search_files()` is a recursive filename matcher with depth and count limits; it is not a metadata/full-text/vector retrieval subsystem.

Planning implication:

- Feature 075 still needs a first-class local file intelligence service.
- Managed-mode discovery should move away from raw path exploration toward consented roots, indexed retrieval, preview, staged attachments, and auditable writeback.

### Docker Support Exists but Is Not Yet a Workspace Policy Layer

Relevant file:

- `apps/tauri-shell/src-tauri/src/docker_commands.rs`

Findings:

- `docker_create_sandbox()` passes through ports, volumes, env vars, CPU, and memory directly to `docker run`.
- There is no built-in policy profile abstraction for mounts, egress, allowlists, or approval gates.

Planning implication:

- Feature 075 should create a workspace manager above the raw Docker wrapper.
- The product abstraction should be "workspace profile" rather than "free-form sandbox config."

### Local Skill Execution Already Has Trust Signals Worth Preserving

Relevant files:

- `apps/web/server/services/localAiSkillPolicy.ts`
- `packages/local-ai-core/src/skill-types/index.ts`
- `apps/tauri-shell/src-tauri/src/local_skill_runtime.rs`

Findings:

- The current local execution path already models:
  - local execution tiers
  - runtime kinds such as `gemma4_text` and `script_bundle`
  - reviewed entries
  - artifact digests
  - permission profiles
  - output contracts
  - provenance metadata
- The local skill runtime in Tauri already has managed-model and reviewed-bundle concepts.

Planning implication:

- Feature 075 should not throw away this manifest language.
- The right move is to introduce a stronger package envelope around these existing contracts:
  - org signing
  - compatibility rules
  - revocation
  - desktop sync
  - local materialization
  - provenance propagation into shared surfaces

### Worker Fabric Already Defines Shared Runtime Vocabulary

Relevant file:

- `apps/web/shared/workerRuntime.ts`

Findings:

- The runtime registry already includes:
  - `openclaw_gateway`
  - `desktop_zeroclaw_managed`
  - `nemoclaw_sandbox`
  - `hiclaw_cluster`
- The worker contracts already encode runtime type, file scope mode, resource profiles, compatibility metadata, and HTTP endpoint contracts.

Planning implication:

- Feature 075 must not create a conflicting second runtime registry.
- `desktop_zeroclaw_managed` should remain the projection identity when Desktop Host participates in worker-fabric semantics.
- Pi and Agency Swarm should remain internal desktop-host runtime labels.

### Updater Support Is Not Yet Integrated in the Current Desktop App

Relevant repo finding:

- No current `tauri-plugin-updater` integration was found under `apps/tauri-shell`.

Planning implication:

- Feature 075's signed update trust chain is not just a policy refinement; it is a missing implementation area that will need new wiring in the desktop shell and a server-side update metadata service.

## Official Web Research

### Tauri Updater and Signing

Primary sources:

- https://v2.tauri.app/ko/plugin/updater/
- https://v2.tauri.app/reference/javascript/updater/
- https://v2.tauri.app/fr/security/capabilities/

Findings:

- Tauri's updater requires signed updates and says this verification cannot be disabled.
- The updater model expects a public key on the app side and a private signing key on the release side.
- Tauri can consume either a static JSON manifest or a dynamic update server response.
- The update response must carry the signature content itself, not a path to a signature file.
- Downgrades are not the default. The docs describe explicit mechanisms such as `allowDowngrades` or custom version comparator behavior when a team intentionally wants rollback behavior.
- The updater plugin also participates in Tauri's capability system, which is relevant because Feature 075 already wants a stricter permissioned desktop posture.

Planning implication:

- Feature 075 should define a signed update trust chain as a real platform subsystem, not a documentation note.
- The default managed posture should forbid downgrades unless the server authorizes an emergency rollback path.
- Update checks should use server-issued metadata and headers, not public ad hoc endpoints.
- Desktop Host capability files should be part of the security design, not an afterthought.

### Agency Swarm Current Runtime Posture

Primary sources:

- https://github.com/VRSEN/agency-swarm
- https://agency-swarm.ai/additional-features/shared-state
- https://agency-swarm.ai/core-framework/agencies/overview
- https://agency-swarm.ai/core-framework/tools/mcp-integration
- https://agency-swarm.ai/migration/guide

Findings:

- Current Agency Swarm positions itself as a production-focused multi-agent orchestration framework built on the OpenAI Agents SDK and Responses API.
- Current compatibility guidance indicates Python 3.12+.
- The framework exposes:
  - structured agencies and communication flows
  - shared tools and shared MCP servers
  - thread persistence via `load_threads_callback` and `save_threads_callback`
  - local files and schemas/tool folders
- The migration guide emphasizes an architectural change in v1.x: conversation persistence is now the application's responsibility rather than an external managed thread primitive.

Planning implication:

- Feature 075 should treat Agency Swarm as a Python-based managed runtime with explicit persistence ownership.
- Desktop Host must own thread persistence, local policy, tool injection, and file access adapters rather than relying on Agency Swarm defaults.
- The managed packaging story must assume current Agency Swarm wants a modern OpenAI Agents SDK-compatible stack and not the older Assistants-era assumptions.
- Shared MCP and file options are useful, but in SmartSpecPro they should be mediated by Desktop Host policy and capability manifests.

### Pi Runtime Public Documentation Status

Finding:

- No authoritative public documentation set was identified during this planning pass that clearly defines the same "Pi" runtime named in Feature 075 as a stable external product dependency.

Planning implication:

- The plan should treat Pi as a SmartSpecPro-selected local agent engine integration target with an adapter contract to be defined by SmartSpecPro.
- Anything more specific than that should remain an implementation decision until the team locks the actual SDK/sidecar choice.

## Testing Research

### Existing test setup

Relevant files and commands:

- `apps/web/package.json`
  - `npm --prefix apps/web test`
  - runs `vitest`
- `apps/tauri-shell/package.json`
  - `npm --prefix apps/tauri-shell test`
  - runs `cargo test --manifest-path src-tauri/Cargo.toml`
- `python-backend/tests/*`
  - existing pytest suite under `python-backend/tests`

Observed conventions:

- Web/server code uses Vitest with `describe`, `it`, and `test`.
- Tauri desktop uses Cargo tests from the Rust manifest.
- Python backend uses pytest, including async tests and security-focused unit tests.

Planning implication:

- `claude-plan-tdd.md` should keep a mixed TDD posture:
  - Vitest for shared contracts, routing, policy, and UI label logic
  - Cargo tests for Tauri command/policy/host services
  - Pytest only where the legacy `python-backend` compatibility path still matters during migration

## Confirmed Gaps Relative to Feature 075

- No canonical device registry or enrollment flow for desktop installs
- No signed desktop package registry and revocation feed
- No package materializer for Pi/Agency runtime bundles
- No local-file intelligence subsystem with consented roots, preview cache, and governed retrieval APIs
- No workspace manager abstraction above raw Docker controls
- No integrated signed updater path in the current Tauri shell
- No Pi runtime integration
- No desktop-local Agency Swarm runtime host
- No managed local connector runtime
- No provenance propagation rules for outputs from local-unverified packages

## Research-Supported Planning Recommendations

1. Preserve the current Tauri shell, local-skill manifest language, and worker runtime vocabulary.
2. Insert a Desktop Host layer above the current low-level command surface before broadening capabilities.
3. Treat signed package sync and signed desktop updates as separate but equally mandatory trust chains.
4. Keep truthful runtime and locality labels centralized in shared contracts so desktop, web, and worker surfaces do not drift.
5. Use Desktop Host as the owner of:
   - device identity
   - runtime tokens
   - thread persistence
   - local-file mediation
   - capability enforcement
   - audit and offboarding
6. Treat Agency Swarm as a managed Python runtime whose persistence and tool surfaces must be controlled by SmartSpecPro.
7. Start managed Pi integration with a sidecar/RPC boundary, and revisit embedded integration only after it reaches equivalent isolation and policy guarantees.
