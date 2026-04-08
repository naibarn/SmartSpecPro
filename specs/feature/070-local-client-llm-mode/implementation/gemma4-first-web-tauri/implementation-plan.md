# Gemma 4-First Web/Tauri Implementation Plan

## Objective

Turn the existing Local AI feature into an implementation-ready Gemma 4-first rollout for web and Tauri, using the current feature contracts while making the runtime path concrete enough for engineering to start.

This package is not a replacement for the parent feature spec. It is the execution-focused slice for:

- browser Gemma 4 runtime
- Tauri Gemma 4 runtime
- chat/memory/voice integration around those runtimes
- selected Tauri skill execution on top of those runtimes
- security and regression protection for the narrowed rollout

## Current-codebase fit

The codebase already has the right contract scaffolding:

- `packages/local-ai-core` defines runtime and capability vocabulary
- `apps/web/server/services/localAiCatalog.ts` already names Gemma 4 E2B/E4B profiles
- `apps/web/client/src/features/local-ai/*` already owns settings, browser capability probing, runtime stubs, and voice selection helpers
- `apps/web/client/src/hooks/usePushToTalk.ts` and `apps/web/server/services/sttService.ts` already form the compatibility mic path
- `apps/tauri-shell/src-tauri` is already the desktop-native shell entry point

What is missing is not product definition. What is missing is a real runtime path.

## Implementation approach

### 1. Keep one Gemma 4 family, but split artifacts by platform

Use one conceptual profile family and two technical deployment paths:

- web:
  - start with `gemma4-e2b-web-fast`
  - later add `gemma4-e4b-web-balanced`
  - use official browser-compatible `.web.task` artifacts through the MediaPipe / LLM Inference Engine path
- Tauri:
  - primary target `gemma4-e4b-tauri-balanced`
  - fallback target `gemma4-e2b-tauri-fast`
  - use `.litertlm` desktop artifacts through a bundled native helper / sidecar

This keeps the user-facing family coherent while respecting the actual runtime differences.

### 2. Do not change the browser strategy to E4B-first

The LiteRT E4B research is useful, but it should not overturn the existing E2B-first browser decision.

Why:

- browser runtime is currently nonexistent in the repo
- the E4B web artifact is very large
- published browser memory numbers imply a high-end device requirement
- unsupported-device stability remains the parent requirement

So the correct browser implementation order is:

1. build the real browser runtime path with E2B
2. validate download, init, fallback, and badge behavior
3. add E4B web.task as an advanced profile

### 3. Make Tauri the first full Gemma 4 implementation target

Tauri should be the first platform where Gemma 4 is treated as a real local runtime rather than an experimental capability.

That means:

- real install/remove behavior
- real local inference bridge
- real readiness state
- real audio support for bounded push-to-talk flows

The Tauri implementation should not wait for the browser runtime to be perfect before it becomes useful.

### 4. Keep chat and memory server-authoritative

Gemma 4 local should improve:

- local general chat
- local summarization
- memory/context compaction
- short dictation
- short voice command

But it must not:

- bypass server routing
- create a second conversation system
- silently rewrite orchestration inputs
- replace durable metadata with client claims

### 5. Keep voice implementation bounded and truthful

Voice implementation must be staged:

- default path:
  - `legacy_stt`
- web Gemma 4 local voice:
  - experimental
  - E2B/E4B only
  - short clips only
  - fail-closed when runtime is absent
- Tauri Gemma 4 local voice:
  - preferred production local path
  - same `voiceInputMode` contract
  - same action allowlist and confirmation rules

### 6. Cover selected skills through execution tiers, not a blanket switch

Gemma 4 on Tauri can reasonably cover a meaningful subset of the skill system, but only if the plan stays policy-driven.

V1 skill tiers:

- `cloud_required`
  - default for every skill until reviewed
  - includes `media-generate`, workflow, automation, side-effectful skills, skills with external tool use, shared-state dependencies, public API usage, scheduler/background paths, and anything that depends on cloud-only provider features
- `local_preprocess_only`
  - local Gemma 4 may assist with prompt cleanup, schema filling, long-input summarization, JSON drafting, or OCR/text normalization
  - the final skill execution still goes through the current server skill pipeline
- `local_safe`
  - Tauri-first in v1
  - reviewed interactive skills only
  - may be either:
    - text-only Gemma 4 skills
    - reviewed packaged Python/JS/TS/JSX/TSX local script skills
  - no side effects beyond bounded local file/output generation explicitly allowed by policy
  - no server tool dependency
  - no scheduler/background execution
  - no public API / channel / team automation dependency
  - no arbitrary shell passthrough
  - network deny by default for scripted variants

Initial candidate pool for `local_safe` review should come from text-only `llm-only` or prompt-enhancement style skills such as:

- prompt writers
- storyboard and prompt-drafting skills
- article/story drafting skills
- translation/rewrite skills
- schema-bound evaluator/classifier skills that return text or JSON only

Additional candidate pool for reviewed scripted `local_safe` rollout:

- packaged Python skills that already consume structured JSON input and return structured JSON/text output
- packaged JS/TS bundle skills with an explicit `skill.manifest.json` entry point
- JSX/TSX-authored bundles only when they compile to a reviewed entry artifact consumed by the Tauri runner
- local layout/planning/transformation skills that operate only on user-provided local inputs and bounded output files

Non-candidate scripted classes in v1:

- skills needing arbitrary shell commands
- skills requiring unrestricted network access
- skills depending on server callbacks, cloud secrets, or shared backend state
- skills that modify workspace or system files outside an explicit app-owned sandbox root

Even for `local_safe`, server validation and persistence rules remain authoritative whenever the user is online.

## Affected modules

Primary modules:

- `apps/web/client/src/features/local-ai/adapters/browserLocalRuntime.ts`
- `apps/web/client/src/features/local-ai/hooks/useLocalAiCapability.ts`
- `apps/web/client/src/features/local-ai/hooks/useModelDownload.ts`
- `apps/web/client/src/features/local-ai/workers/local-llm.worker.ts`
- `apps/web/client/src/components/chat/ChatView.tsx`
- `apps/web/client/src/hooks/usePushToTalk.ts`
- `apps/web/client/src/features/local-ai/skills/tauriSkillRuntime.ts`
- `apps/web/client/src/features/local-ai/skills/skillLocalExecutionPolicy.ts`
- `apps/web/server/services/localAiCatalog.ts`
- `apps/web/server/services/localAiRuntimeRouter.ts`
- `apps/web/server/services/localAiRuntimeMetadata.ts`
- `apps/web/server/services/skillExecutionPolicy.ts`
- `apps/web/server/services/skillOrchestrator.ts`
- `apps/web/server/services/skillParamExtractor.ts`
- `apps/web/server/services/skillExecutor.ts`
- `apps/web/server/services/skillFiles.ts`
- `apps/web/server/services/skillRegistry.ts`
- selected reviewed skill manifests under `apps/web/skills/*/skill.md`
- selected reviewed bundle manifests under `apps/web/skills/*/*/skill.manifest.json`
- `apps/tauri-shell/src-tauri/src/lib.rs`
- new Tauri local runtime module under `apps/tauri-shell/src-tauri/src/local_ai/`
- new Tauri packaged-script runner under `apps/tauri-shell/src-tauri/src/local_ai/skill_runner/`

## Platform-specific execution plan

### Web

Deliverables:

- add the real browser runtime dependency and bundle-loading path
- support one validated E2B profile first
- make `gemma4_local` browser mode truthful
- keep E4B web.task behind advanced rollout gates

Implementation boundary:

- the web path uses `@mediapipe/tasks-genai` or the same official browser LLM Inference Engine stack behind the current `mediapipe-webgpu` runtime family
- the web path uses the browser-compatible task artifact
- it does not use the `.litertlm` desktop artifact directly

### Tauri

Deliverables:

- add a native Local AI command module
- manage app-local model storage
- install/remove E4B `.litertlm`
- add capability reporting and runtime invocation commands
- add bounded local voice support
- add a reviewed packaged-script execution surface for selected Tauri local skills

Implementation boundary:

- implement desktop local inference behind a bundled helper / sidecar launched from Tauri commands
- keep the helper surface narrow: install, remove, probe, infer, dispose
- do not expose a general-purpose local daemon surface wider than needed for this feature
- keep scripted skill execution behind a separate reviewed command path, not arbitrary shell execution

## Skill execution plan

### Tauri-first local skill coverage

Deliverables:

- define a skill-level local execution tier resolved alongside existing skill execution policy
- add a Tauri local skill runner for `local_safe` skills
- add a Tauri/local preprocessing assist path for `local_preprocess_only` skills
- keep every non-reviewed skill on the current server/cloud path

Implementation boundary:

- do not replace the server skill system
- do not make browser local skill execution broader than chat-adjacent preprocessing in v1
- do not route scheduler, public API, channel, workflow, or background executions to Tauri
- do not bypass schema validation, audit, or skill persistence flows
- do not treat “runs code locally” as sufficient by itself; scripted local execution needs stricter runtime controls than text-only local skills
- do not treat source-language support as runtime support; JSX/TSX must compile into a reviewed local bundle first

### Skill-tier rules

`local_safe`:

- Tauri only in v1
- output must be text, JSON, or explicitly approved app-owned files
- user-present invocation only
- no side effects beyond explicitly approved local file writes under app-owned paths
- no external tools or server toolchain dependency
- no team/background automation path
- no hard dependency on cloud-only model capabilities
- scripted variants must use:
  - a packaged Python or Node runtime owned by the Tauri app
  - reviewed entrypoints only
  - compiled reviewed entry artifacts for JS/TS/JSX/TSX sources
  - network deny by default
  - filesystem allowlist
  - bounded timeout and output-size limits

`local_preprocess_only`:

- web or Tauri may use local Gemma 4 to normalize the user request, draft structured params, or compact large context before final skill execution
- server still chooses the effective skill executor and owns durable result persistence

`cloud_required`:

- anything with media generation, automation, workflow execution, external I/O, shared-state dependence, credits-sensitive tool use, or non-interactive/background execution

### Local-script manifest contract

For reviewed scripted `local_safe` skills, `skill.manifest.json` should be extended with a `localExecution` block rather than relying on `entry` alone.

Required fields for reviewed local-script bundles:

- `runtimeKind`
  - `python`
  - `node_bundle`
- `reviewedEntry`
  - relative path to the reviewed compiled entry artifact
- `artifactDigestSha256`
  - digest of the reviewed executable artifact or bundle payload
- `permissionProfile`
  - named profile resolved by the Tauri runner
- `inputRoots`
  - staged read-only roots visible to the script
- `outputRoots`
  - staged write-only or write-scoped roots visible to the script
- `maxOutputMb`
  - hard output bound enforced by the runner
- `provenance`
  - builder/release metadata sufficient for audit and revocation

Recommended fields:

- `sourceLanguage`
  - for audit only, for example `python`, `js`, `ts`, `jsx`, `tsx`
- `requiresCompiledArtifact`
  - `true` for JS/TS/JSX/TSX bundles
- `supportedOutputKinds`
  - `text`, `json`, `files`

The plan should reuse existing frontmatter metadata as base policy signals where possible:

- `requires_network`
- `sandbox_profile`
- `max_runtime_seconds`
- `max_input_mb`

The local-script contract adds trust and runtime-control details that those existing fields do not cover.

### Local execution envelope and secret boundary

Reviewed local scripts should receive a bounded execution envelope only:

- sanitized skill params
- staged input file descriptors rooted inside the app-owned execution sandbox
- non-secret execution metadata such as `localExecutionId`, tenant/user visibility scope, and output contract

Reviewed local scripts must not receive:

- `userToken`
- provider API keys
- refresh/session tokens
- raw backend connection secrets
- unrestricted filesystem paths outside staged roots

If a skill requires reusable backend credentials or live backend callbacks to function, it is not `local_safe`.

### Offline, audit, and credit semantics

Offline behavior is allowed for reviewed `local_safe` skills on Tauri, but sync remains app-owned:

- local execution creates a `localExecutionId`
- results and metadata are stored in an app-owned local outbox
- when connectivity and auth are available, the Tauri app syncs the result through normal product APIs
- the local script never performs authenticated sync directly

Credit and accounting rules for v1:

- `local_safe` and `local_preprocess_only` do not consume cloud-token credits by themselves
- cloud fallback consumes normal cloud credits
- server audit records should distinguish:
  - local-only completed
  - local completed then synced
  - local attempted then cloud fallback

### Filesystem staging model

To avoid granting direct arbitrary host-file access:

- user-selected files are copied or staged into an app-owned per-execution input root
- scripts receive only staged paths
- outputs are written only into an app-owned per-execution output root
- the app then imports/previews/exports results back to user-visible destinations after validation

This means the local runner operates on copy-in/copy-out staging, not on arbitrary original host paths.

### Build provenance and revocation

Reviewed JS/TS/JSX/TSX bundles should not be built ad hoc on the user machine for trusted execution.

V1 trust model:

- reviewed compiled artifacts are produced in the SmartSpecPro-controlled build/review pipeline
- install uses shipped or catalog-approved artifact metadata
- runtime checks artifact digest before execution
- revocation can disable a reviewed digest/version even if files remain installed locally

This is separate from model-asset revocation and should be treated as part of the local-script trust story.

### Initial rollout guidance

- Review and opt in a small allowlist first rather than infer from `execution_mode` alone.
- Use `execution_mode: llm-only` and text-only prompt/output characteristics as a starting candidate filter, not as sufficient proof that a skill is safe.
- For `python`, `command/js`, and JSX/TSX-authored bundles, require a second review pass covering interpreter packaging, compiled entry artifacts, runtime permissions, and deterministic output contracts before allowlisting.
- Reuse existing skill metadata fields before introducing duplicate policy knobs; extend them only where local trust and provenance require more detail.
- Keep multimodal reviewer skills cloud-required until local image parity and validation are explicitly available.

## Risks and mitigations

### Risk: browser E4B is too heavy

Mitigation:

- do not make it the first browser rollout target
- keep it behind allowlist and telemetry review

### Risk: Tauri LiteRT-LM integration is operationally harder than expected

Mitigation:

- use the native helper/sidecar approach as the planned implementation strategy, not just as a fallback idea
- keep command boundaries narrow: install, remove, probe, infer, dispose

### Risk: local voice over-promises

Mitigation:

- preserve `legacy_stt`
- keep `gemma4_local` fail-closed when unavailable
- cap clip length and require profile-level audio capability

### Risk: security regressions from native runtime introduction

Mitigation:

- app-local storage only
- strict tenant/user scoping for logical visibility
- no arbitrary URL fetch for model or OCR work
- no direct client authority over runtime metadata or actions
- no arbitrary command passthrough for scripted local skills
- packaged interpreters and reviewed entrypoints only
- no reusable secrets passed into local scripts
- copy-in/copy-out staged filesystem model only
- digest/provenance checks for reviewed compiled bundles

### Risk: local skill execution drifts or bypasses current policy

Mitigation:

- default all skills to `cloud_required`
- require explicit reviewed allowlisting for `local_safe`
- preserve server schema validation, auth, audit, and persistence
- keep public API, scheduler, and background paths out of scope for local execution
- add stricter guardrails for scripted local skills than for pure Gemma 4 text skills
- make offline sync app-owned and outbox-based rather than script-owned

## Acceptance criteria

- an implementer can begin web runtime work without guessing which artifact family to use
- an implementer can begin Tauri runtime work without guessing whether desktop should target E2B or E4B first
- an implementer can begin selected Tauri local-skill work without guessing which skill classes are eligible
- the package clearly distinguishes `.web.task` from `.litertlm`
- the package keeps the chat/memory/voice flow aligned with the existing Local AI contracts
- the package defines clear skill tiers instead of implying a blanket local-skill switch
- unsupported devices and cloud-only users remain safe by design

## Rollout notes

- Web rollout order:
  1. real E2B runtime
  2. stable browser badges and fallback
  3. optional preprocess-only skill assists on top of the browser runtime
  4. optional E4B web.task rollout
- Tauri rollout order:
  1. native install/remove and probe
  2. E4B text runtime
  3. E2B fallback profile
  4. bounded local voice
  5. reviewed `local_safe` skill allowlist
