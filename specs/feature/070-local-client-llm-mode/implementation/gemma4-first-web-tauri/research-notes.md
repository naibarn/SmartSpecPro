# Research Notes

Date: 2026-04-05

## 1. Current codebase state

### 1.1 Browser-local runtime is intentionally not implemented yet

- [`apps/web/client/src/features/local-ai/adapters/browserLocalRuntime.ts`](/home/dev/projects/SmartSpecPro/apps/web/client/src/features/local-ai/adapters/browserLocalRuntime.ts) always returns unavailable with `browser_runtime_adapter_not_implemented`.
- [`apps/web/client/src/features/local-ai/hooks/useLocalAiCapability.ts`](/home/dev/projects/SmartSpecPro/apps/web/client/src/features/local-ai/hooks/useLocalAiCapability.ts) probes secure context and WebGPU adapter availability, but still ends in fail-closed unsupported capability.
- This means the next real implementation step must add a concrete browser runtime and model-loading path before any `gemma4_local` browser mode can become truthful.

### 1.2 Tauri shell exists, but has no Local AI runtime module yet

- [`apps/tauri-shell/src-tauri/src/lib.rs`](/home/dev/projects/SmartSpecPro/apps/tauri-shell/src-tauri/src/lib.rs) registers Docker, file, git, PTY, and video-editor commands only.
- There is currently no `local_ai` module, no Tauri command for model install/remove, and no desktop local inference bridge.
- This strongly suggests Tauri implementation must begin with a new native module boundary instead of trying to squeeze desktop-local behavior into existing web-only hooks.

### 1.3 Chat voice path still uses the current server STT route

- [`apps/web/client/src/hooks/usePushToTalk.ts`](/home/dev/projects/SmartSpecPro/apps/web/client/src/hooks/usePushToTalk.ts) records audio and sends it to `/api/stt/transcribe`.
- [`apps/web/server/services/sttService.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/services/sttService.ts) still routes transcription through backend providers.
- This means `gemma4_local` voice is currently only a settings/runtime contract, not a real inference path.

### 1.4 Shared contracts already exist and can be extended

- [`packages/local-ai-core/src/capability/index.ts`](/home/dev/projects/SmartSpecPro/packages/local-ai-core/src/capability/index.ts) already defines catalog entries, capability results, and runtime families.
- [`packages/local-ai-core/src/runtime-types/index.ts`](/home/dev/projects/SmartSpecPro/packages/local-ai-core/src/runtime-types/index.ts) already defines execution modes, task classes, and voice modes.
- [`apps/web/server/services/localAiCatalog.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/services/localAiCatalog.ts) already contains placeholder Gemma 4 web/Tauri profiles.

### 1.5 Existing provider surfaces remain useful for fallback and coexistence

- [`apps/web/server/services/modelSyncService.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/services/modelSyncService.ts) supports OpenAI-compatible model listing and Ollama listing.
- [`python-backend/app/models/provider_config.py`](/home/dev/projects/SmartSpecPro/python-backend/app/models/provider_config.py) supports `base_url` and providers such as Ollama or OpenAI-compatible gateways.
- These surfaces are useful fallback or coexistence points, but they do not replace the need for an actual in-app web/Tauri Gemma 4 runtime.

### 1.6 Skill execution is already policy-driven and server-authoritative

- [`apps/web/server/services/skillExecutionPolicy.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/services/skillExecutionPolicy.ts) already resolves model policy, provider pinning, and capability-aware fallback for skill execution.
- [`apps/web/server/services/skillOrchestrator.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/services/skillOrchestrator.ts) already treats skill routing and execution as a server-owned orchestration concern.
- [`apps/web/server/services/skillParamExtractor.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/services/skillParamExtractor.ts) already performs schema-driven extraction from free-text user requests, which makes it a strong candidate for `local_preprocess_only`.
- Many repository skills under `apps/web/skills/*` are `execution_mode: llm-only`, but others are `media-generate`, automation-oriented, or otherwise side-effectful. This means LiteRT-LM/Gemma 4 can reasonably cover a selected subset of skills, but not the entire skill surface.

### 1.7 Scripted skills already exist and are not hypothetical

- [`apps/web/server/services/skillExecutor.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/services/skillExecutor.ts) already supports:
  - `executionMode: "python"` via local subprocess execution
  - `sandbox-*` execution modes via secure dispatch
  - packaged JS/TS bundle skills discovered through `skill.manifest.json`
- The repository already contains real Python and JS/bundled skill assets, for example:
  - `apps/web/skills/intelligence-skill-creator/python/skill.py`
  - `apps/web/skills/video-prompt-engineer/python/skill.py`
  - `apps/web/skills/modern-editorial-slide/modern_editorial_slide_skill/skill.manifest.json`
  - `apps/web/skills/editorial-layout-planner/editorial_layout_planner_skill/skill.manifest.json`
- This means Tauri local runtime should not assume the skill universe is text-only. A realistic local rollout should plan for selected reviewed scripted skills as well, including bundles authored in JS/TS/JSX/TSX as long as they ship a compiled reviewed entrypoint.

### 1.8 The current skill metadata is useful, but not sufficient for local-script trust

- [`apps/web/server/services/skillFiles.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/services/skillFiles.ts) already supports frontmatter metadata such as:
  - `execution_mode`
  - `sandbox_profile`
  - `requires_network`
  - `max_runtime_seconds`
  - `max_input_mb`
- Existing command-bundle manifests such as [`modern_editorial_slide_skill/skill.manifest.json`](/home/dev/projects/SmartSpecPro/apps/web/skills/modern-editorial-slide/modern_editorial_slide_skill/skill.manifest.json) currently expose:
  - `entry`
  - schema paths
  - output types
  - ratio support
- The current manifest shape is enough to locate a bundle entrypoint, but not enough to safely authorize Tauri local execution of reviewed scripted skills.

Practical consequence:

- the plan should reuse the existing metadata fields where possible
- but it still needs an explicit local-script contract for permission profile, artifact digest, reviewed compiled entrypoint, staged file roots, and provenance

## 2. External research: Gemma 4 and LiteRT

### 2.1 Official Gemma 4 capabilities

Official and primary-source facts:

- Gemma 4 E2B/E4B support native audio input in addition to text and image.
- Gemma 4 audio usage is appropriate for ASR / speech-to-text scenarios.
- The smaller Gemma 4 models are the audio-capable on-device candidates.

Sources:

- Google audio docs: https://ai.google.dev/gemma/docs/capabilities/audio
- Gemma 4 model card: https://huggingface.co/google/gemma-4-E4B

### 2.2 Official LiteRT positioning

Official Google LiteRT docs currently state:

- LiteRT supports on-device GenAI deployment across mobile, desktop, and web.
- LiteRT provides a dedicated GenAI stack via LiteRT-LM.
- LiteRT.js exists for web, while LiteRT-LM is the specialized orchestration layer for LLM pipelines.

Sources:

- LiteRT overview: https://ai.google.dev/edge/litert/overview
- LiteRT for Web: https://ai.google.dev/edge/litert/web
- Deploy GenAI Models with LiteRT: https://ai.google.dev/edge/litert/genai/overview

### 2.3 Research on `huggingworld/gemma-4-E4B-it-litert-lm`

The requested Hugging Face repo is explicitly marked as:

- duplicated from `litert-community/gemma-4-E4B-it-litert-lm`

Important details from the model card:

- `.litertlm` desktop/mobile artifact size: about `3.65 GB`
- sibling web artifact: `gemma-4-E4B-it-web.task`
- web artifact size: about `2.96 GB`
- the model is positioned as deployable on Android, iOS, Desktop, IoT, and Web
- the Web section says Gemma inference on web is currently supported through the `LLM Inference Engine` and uses the `gemma-4-E4B-it-web.task` file
- benchmark example for web shows roughly `1.1 GB` CPU memory and `3.3 GB` GPU memory in Chrome on a high-end machine
- the LiteRT-LM model can support up to `32k` context in the benchmarked setup

Sources:

- Requested model repo: https://huggingface.co/huggingworld/gemma-4-E4B-it-litert-lm
- Canonical upstream duplicate target: https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm
- Web artifact page: https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/blob/main/gemma-4-E4B-it-web.task

### 2.4 Practical interpretation for SmartSpecPro

This LiteRT research changes the plan in one important way:

- for web, the relevant artifact is **not** the `.litertlm` file
- for web, the relevant artifact is the sibling `.web.task` file and the official web inference stack around it
- for Tauri, the `.litertlm` artifact is the more relevant one

So the model family is useful for both platforms, but through different deployment artifacts.

## 3. Implementation consequences

### 3.1 Web

Web should not treat the `huggingworld` / `litert-community` E4B asset as the first rollout default because:

- the current codebase has no real browser inference runtime yet
- the E4B web artifact is still very large
- the benchmarked GPU memory footprint is high for ordinary browsers
- the current feature spec already prefers E2B-first browser rollout

Practical conclusion:

- web keeps `gemma4-e2b-web-fast` as the first validated implementation target
- `gemma-4-E4B-it-web.task` becomes the advanced/allowlisted follow-up target

### 3.2 Tauri

Tauri is the stronger fit for the E4B LiteRT model because:

- desktop-local storage is easier to control
- model install/remove flows can be explicit
- runtime and permission behavior is easier to keep deterministic
- the `.litertlm` artifact is directly aligned with desktop/mobile LiteRT-LM positioning

Practical conclusion:

- Tauri should use the E4B LiteRT model as the primary local profile
- E2B remains the fallback for lower-capability desktops

### 3.3 Voice

Gemma 4 native audio support still does not mean voice is automatically done. SmartSpecPro still needs:

- explicit mic capture
- clip-length limits
- audio normalization
- provider selection rules
- safe fallback behavior

The current repo already has push-to-talk and voice-mode contracts, so the voice task is mostly a runtime implementation problem rather than a product-definition problem.

### 3.4 Skills

The skill system is a better fit for local execution on Tauri than on web, but only when the skill is:

- text-only
- user-present and interactive
- free of side effects
- not dependent on server tools or shared tenant state

Practical conclusion:

- Tauri can add a `local_safe` execution tier for selected text-only skills such as prompt writing, article drafting, rewriting, translation, and schema-bound evaluation tasks.
- Tauri can also add a stricter reviewed local-script path for selected packaged Python/JS/TS/JSX/TSX skills that run entirely on the user device and do not require cloud tools.
- Web should stay narrower in v1 and use local runtime mainly for chat, memory, and `local_preprocess_only` skill assistance.
- `media-generate`, `python`, workflow, automation, background, and public API skill paths remain `cloud_required`.

Refinement:

- `python`, `command/js`, or source-level `jsx/tsx` usage alone is not enough to make a skill locally eligible.
- Scripted local skills need additional review for:
  - packaged runtime availability on Tauri
  - build/output entrypoint availability for JSX/TSX-authored bundles
  - network policy
  - filesystem scope
  - deterministic input/output contract
  - secret handling
  - absence of unsafe shell escalation

## 4. Security and boundary implications

- Browser-local rollout still must remain fail-closed when runtime dependencies or approved model bundles are missing.
- Tauri-local rollout should keep model assets under app-local storage and never widen visibility across tenant/user scopes.
- Voice actions must continue to use the existing route/action allowlist and server authorization rules.
- The duplicated `huggingworld` model should not be treated as more authoritative than `litert-community`; planning should prefer the canonical source for checksums and revocation metadata.
- Tauri local skill execution must not bypass schema validation, audit logging, credits/policy checks, or current server-side persistence rules when the user is online.
- Server/background surfaces such as scheduler, public API, and non-Tauri clients must never become dependent on the presence of a user-local runtime.
- Scripted local skills need stronger controls than text-only local skills:
  - no arbitrary shell passthrough
  - reviewed allowlist only
  - packaged Python/Node runtimes only
  - compiled reviewed entry artifacts for JS/TS/JSX/TSX bundles
  - filesystem allowlist
  - network deny by default
  - output schema validation before the result is trusted
