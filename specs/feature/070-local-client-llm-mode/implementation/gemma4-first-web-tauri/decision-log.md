# Decision Log

Date: 2026-04-05

## Planning depth

Chosen depth: `standard`

Reason:

- the task is narrower than the parent feature and already has a full spec
- it still crosses browser runtime, Tauri native work, chat/voice integration, selected skill execution, and security boundaries
- a compact 5-section execution package is enough and does not justify promotion back to full `deep-plan`

## Key decisions

### 1. Keep Gemma 4 anchored, but not uniform across web and Tauri

- Web and Tauri both stay Gemma 4-first.
- The concrete artifact and rollout order differ by platform.

### 2. Prefer the canonical LiteRT source over the duplicate

- Treat `litert-community/gemma-4-E4B-it-litert-lm` as the canonical upstream for artifact metadata.
- Treat `huggingworld/gemma-4-E4B-it-litert-lm` as an informative duplicate, not the source of truth for checksums or rollout gating.

### 3. Web stays E2B-first, even after researching the E4B LiteRT model

Why:

- the current codebase has no actual browser runtime yet
- the E4B web artifact is large (`2.96 GB`)
- the published benchmark footprint is high for normal browser rollout
- the parent spec already established E2B-first browser rollout

Decision:

- Web implementation target 1: `gemma4-e2b-web-fast`
- Web implementation target 2: `gemma4-e4b-web-balanced` using the `.web.task` artifact, behind allowlist and capability review

### 4. Tauri becomes the first real E4B implementation target

Why:

- the `.litertlm` E4B artifact is aligned with LiteRT-LM desktop usage
- Tauri gives better storage, permission, and lifecycle control
- the user specifically asked for a Gemma 4-first path that can become more complete

Decision:

- Tauri primary profile: `gemma4-e4b-tauri-balanced`
- Tauri fallback profile: `gemma4-e2b-tauri-fast`

### 4.1 Concrete runtime choices

To keep the package implementable without reopening core runtime choices:

- Browser v1 runtime choice:
  - use the official browser path around `@mediapipe/tasks-genai` / LLM Inference Engine
  - use `.web.task` assets for browser profiles
- Tauri v1 runtime choice:
  - use a bundled native helper / sidecar process launched from Tauri
  - use `.litertlm` artifacts for desktop profiles

Reason:

- the web contracts and current `mediapipe-webgpu` runtime-family name already point toward the MediaPipe / LLM Inference Engine browser stack
- the Tauri shell already has a sidecar/binary pattern in the FFmpeg area, so a tightly scoped local-AI helper matches current architecture better than inventing a general daemon protocol

### 5. Use platform-specific artifacts from the same model family

- Web should consume `gemma-4-E4B-it-web.task` when E4B browser rollout happens.
- Tauri should consume `gemma-4-E4B-it.litertlm`.
- Do not try to force `.litertlm` directly into the browser path.

### 6. Voice remains bounded

- `legacy_stt` stays the default.
- `gemma4_local` is a runtime-backed mode, not a UI-only promise.
- Web local voice remains experimental.
- Tauri local voice is the preferred production path for Gemma 4 audio.

### 7. Skill coverage is allowed, but only through explicit execution tiers

- Do not treat LiteRT-LM/Tauri as a universal replacement for the server skill system.
- Introduce a policy layer that distinguishes:
  - `local_safe`
  - `local_preprocess_only`
  - `cloud_required`
- Default every skill to `cloud_required` until it is reviewed.
- Allow Tauri local execution first for selected text-only skills with no side effects and no server tool dependencies.
- Keep browser local skill usage narrower in v1 and focused on preprocessing or bounded chat-adjacent skill assists.

### 7.1 Reviewed scripted local skills are in scope for Tauri

- The repo already has real Python and packaged JS skill assets, so the plan should not artificially forbid them.
- The same logic extends to JS/TS/JSX/TSX-authored bundles, provided Tauri runs the reviewed compiled entrypoint rather than raw source files.
- However, scripted local skills are riskier than text-only local skills.
- Decision:
  - keep scripted skills inside the `local_safe` family only when they pass stricter review
  - Tauri only in v1
  - packaged runtime only
  - compiled reviewed entrypoint only for JS/TS/JSX/TSX bundles
  - no arbitrary shell exposure
  - network deny by default
  - filesystem scope and output schema must be explicitly bounded

### 7.2 Reuse existing skill metadata, but extend it with a local-script contract

- Do not invent a disconnected second manifest system if the current skill metadata already captures runtime intent.
- Decision:
  - reuse existing frontmatter fields such as `requires_network`, `sandbox_profile`, `max_runtime_seconds`, and `max_input_mb` as the base policy vocabulary
  - extend `skill.manifest.json` for reviewed scripted local skills with a dedicated local-execution block that carries:
    - runtime kind
    - reviewed compiled entrypoint
    - artifact digest/signature metadata
    - filesystem staging roots
    - output contract
    - provenance metadata

### 7.3 Local scripts never receive reusable user or provider secrets

- Decision:
  - Tauri local scripts do not receive `userToken`, provider API keys, refresh tokens, or reusable backend credentials
  - they receive only sanitized input, reviewed local file handles staged into app-owned roots, and optional non-secret execution metadata
  - if a script needs live backend callbacks or cloud secrets, it is not `local_safe`

### 7.4 Offline behavior is allowed, but sync stays app-owned

- Decision:
  - reviewed `local_safe` skills may run offline on Tauri
  - local results are recorded into an app-owned local outbox with a local execution id
  - when the app is online again, the Tauri app, not the local script, performs authenticated sync through the normal product APIs
  - local execution itself does not consume cloud-token credits; cloud fallback does

### 8. Local skills remain user-present and non-background

- Tauri local skill execution is only for interactive user-present surfaces.
- Scheduler, public API, channel, workflow background, and other server-owned paths stay cloud/server-authoritative.
- Local skill output may reduce token cost, but it must not become a prerequisite for normal server operation.

## Risks that remain

- Tauri LiteRT-LM integration may need a sidecar/native helper rather than a pure Rust-only implementation.
- Browser E4B may still be too heavy for ordinary rollout even after the runtime is implemented.
- Audio-capable Gemma 4 does not remove the need for explicit ASR validation, clip-length enforcement, and fallback rules.
- Local skill execution may drift from cloud behavior if allowlisting is too broad or if schema validation is skipped.
- Local scripted skills may widen the attack surface unless the helper owns interpreter selection, permission boundaries, and I/O restrictions.
- Build provenance and artifact trust for reviewed JS/TS/JSX/TSX bundles must be explicit or bundle review becomes unenforceable.

## Quick-plan fitness check

This task remains suitable for quick-plan because:

- it narrows an existing, already-planned feature
- it does not redefine product scope from scratch
- the remaining work is implementation decomposition and platform-specific decision-making

## Review rounds

### Round 1

- Found that the first draft still left browser runtime choice too vague.
- [AUTO-FIX] Locked browser to the official MediaPipe / LLM Inference Engine path behind the existing `mediapipe-webgpu` runtime-family contract.

### Round 2

- Found that Tauri runtime strategy was still ambiguous between direct Rust integration and a helper process.
- [AUTO-FIX] Locked Tauri to a bundled helper / sidecar approach launched through narrow Tauri commands.

### Round 3

- Found that the LiteRT Hugging Face research needed a stronger artifact distinction.
- [AUTO-FIX] Clarified `.web.task` for browser and `.litertlm` for Tauri throughout the package.

### Round 4

- Found that the duplicate `huggingworld` model source needed explicit trust guidance.
- [AUTO-FIX] Recorded `litert-community` as the canonical metadata source and treated `huggingworld` as informative only.

### Round 5

- Checked section ownership, file existence, manifest integrity, and wording drift.
- [AUTO-FIX] Tightened section-01 and section-02 to align with the concrete runtime choices.

### Round 6

- Found that the package still treated chat/memory as the only meaningful consumer of the new runtime.
- [AUTO-FIX] Added a separate Tauri skill-execution section with explicit local execution tiers and server-boundary rules.

### Round 7

- Found that the first skill-tier draft was too text-only and did not acknowledge existing Python/JS skill assets in the repo.
- [AUTO-FIX] Expanded the Tauri skill section to include reviewed packaged script skills under stricter local-safe controls.

### Round 8

- Found that reviewed scripted skills still lacked concrete contracts for manifest schema, secret boundaries, offline sync, and bundle provenance.
- [AUTO-FIX] Added explicit local-script contract requirements and clarified that sync/auth stay app-owned rather than script-owned.

### Final stabilization result

- Two consecutive checks found no further meaningful auto-fix items after the runtime-strategy, skill-boundary, and local-script contract clarifications.
