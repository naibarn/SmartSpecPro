# Claude Research - 070 Local / Client LLM Mode

Date: 2026-04-04
Mode: self_review
Spec: `/home/dev/projects/SmartSpecPro/specs/feature/070-local-client-llm-mode/spec.md`

## Research decision (auto)

- Codebase: yes
  - Reason: this feature must extend existing chat, settings, feature-flag, and Tauri surfaces without regressions.
- Web topics: yes
  - Browser local inference with MediaPipe / Gemma
  - WebGPU capability and secure-context constraints
  - Tauri local storage options for desktop device-local state
  - Typhoon OCR provider behavior and limits
- Testing: existing setup
  - `apps/web` already uses Vitest with both node and jsdom environments.

## Codebase research

### 1. User preferences are server-synced JSON and currently narrow

Current per-user preferences are stored in `users.userPreferences` and currently typed mainly for translation, private vault, Telegram, and automation policy.

Relevant files:

- `apps/web/drizzle/schema.ts`
- `apps/web/server/routers/users.ts`
- `apps/web/client/src/pages/Settings.tsx`

Findings:

- `users.userPreferences` is a single JSON column, so adding `localAi` is feasible without a first-phase table migration.
- `users.getPreferences` and `users.updatePreferences` already exist, but `updatePreferences` currently only accepts:
  - `translationLanguage`
  - `translationModel`
  - `displayLocale`
- This means local-AI settings need:
  - schema extension in `apps/web/drizzle/schema.ts`
  - new router validation in `apps/web/server/routers/users.ts`
  - new UI bindings in `apps/web/client/src/pages/Settings.tsx`
- Because `userPreferences` is global per user, device-local install/cache/download state must stay out of this JSON and live in browser or Tauri storage.

Planning implication:

- Keep cross-device user intent in `users.userPreferences.localAi`.
- Keep model download state, installed bundles, capability snapshots, and storage usage in per-device storage only.

### 2. Tenant feature flags are closed-world and must be updated explicitly

Relevant files:

- `apps/web/shared/featureFlags.ts`
- `apps/web/server/services/tenantFeatureFlagService.ts`
- `apps/web/server/services/featureFlags.ts`

Findings:

- Tenant flags are strongly allowlisted through `TenantFeatureFlags`, `ALLOWED_FEATURE_FLAGS`, and `FEATURE_FLAG_DEFAULTS`.
- Unknown keys are stripped silently by `validateFeatureFlags()`.
- Redis sync only happens for an explicit subset of flags in `REDIS_SYNCED_FLAGS`.
- Current defaults are mostly `true`, so a rollout-sensitive flag like `localClientLlmMode` must be intentionally added with default `false`.

Planning implication:

- The feature flag work is not just "add JSON in tenant settings".
- The implementation plan must include:
  - shared type addition
  - default value
  - validation allowlist update
  - tenant service update
  - admin save/read path update
  - Redis sync decision only if backend guards need low-latency checks

### 3. Conversation-level model state already exists, but only for cloud/provider selection

Relevant files:

- `apps/web/drizzle/schema.ts`
- `apps/web/server/routers/chat.ts`
- `apps/web/server/services/chatModelSelection.ts`
- `apps/web/server/services/intelligentModelSelector.ts`
- `apps/web/client/src/components/chat/ChatView.tsx`

Findings:

- `conversations.skillSettings.llmSelection` already persists conversation model-selection state.
- `ChatView` reads model options from `trpc.llmProviders.availableModels.useQuery()`.
- `chatModelSelection` logic is provider/catalog aware and already distinguishes:
  - explicit model
  - auto-global
  - auto-provider
- `intelligentModelSelector` is already capability-oriented for cloud models.

Planning implication:

- Local execution routing should reuse the idea of capability-based selection, but should not be mixed directly into the existing cloud catalog in v1.
- A separate local-model catalog or namespace is safer than extending `llmProviders.availableModels` directly.
- Conversation-level override can likely reuse `skillSettings`, but local-runtime metadata fields are not there yet.

### 4. Current chat flow is server-first, which affects privacy semantics

Relevant files:

- `apps/web/server/routers/chat.ts`
- `apps/web/server/_core/llmRoutes.ts`

Findings:

- User messages are created on the server before LLM completion.
- `saveAssistantMessage` accepts client-provided `inputTokens`, `outputTokens`, and `modelUsed`.
- The streaming endpoint emits a server-authored `message_saved` SSE event with:
  - `resolvedModelId`
  - `resolvedProviderId`
  - `resolvedProviderName`
  - `routeFamily`
  - `selectionMode`

Planning implication:

- Under the current chat persistence path, most local-preprocess flows are truthfully `Hybrid`, not pure `Local`.
- Durable runtime badges should be derived from server-authored or server-validated metadata, not directly from client claims.
- If true device-only chat is desired later, it needs a separate request path, not just a UI badge change.

### 5. Security boundaries already highlight a few local-AI risks

Relevant files:

- `apps/web/server/_core/index.ts`
- `apps/web/server/routers/chat.ts`

Findings:

- CSP currently allows `connect-src 'self' https:` which is broad.
- Attachment URLs currently allow arbitrary `http://`, `https://`, or `/uploads/...`.
- This means model download and OCR ingress must be explicitly allowlisted in implementation, not left to generic fetch behavior.

Planning implication:

- The plan must include:
  - allowlisted model-asset origins
  - integrity manifest / checksum validation
  - no arbitrary backend fetch of user-supplied external URLs for OCR/model jobs
  - explicit client/server trust-boundary tests

### 6. Tauri shell exists today and already exposes filesystem primitives

Relevant files:

- `apps/tauri-shell/package.json`
- `apps/tauri-shell/src-tauri/Cargo.toml`
- `apps/tauri-shell/src-tauri/src/lib.rs`

Findings:

- The current desktop target is `apps/tauri-shell`.
- It already includes:
  - `tauri-plugin-fs`
  - `tauri-plugin-dialog`
  - `tauri-plugin-shell`
- This is enough for a first desktop adapter that manages device-local model/cache files without inventing a new desktop app path.

Planning implication:

- Desktop v1 can use the existing shell with app-local storage rather than a new runtime surface.

### 7. Test stack is already suitable for incremental rollout work

Relevant files:

- `apps/web/package.json`
- `apps/web/vitest.config.ts`
- existing `apps/web/server/**/*.test.ts`
- existing `apps/web/client/src/**/*.test.tsx`

Findings:

- `apps/web` uses Vitest as the main test runner.
- Client `*.test.tsx` files run in jsdom.
- Server tests already exist for feature flags, security boundaries, and routing-heavy behavior.

Planning implication:

- The first implementation can stay inside the repo's established testing model:
  - unit tests for routing/capability logic
  - server tests for preference + feature-flag + metadata validation
  - client tests for settings and unsupported-device behavior

## Web research

### 1. Browser-local Gemma path is real, but it is explicitly WebGPU-gated

Official Google docs:

- https://ai.google.dev/gemma/docs/integrations/web
- https://ai.google.dev/edge/mediapipe/solutions/genai/llm_inference/web_js

Key findings:

- Google documents a supported path to run Gemma on-device in browsers through the MediaPipe LLM Inference API.
- The browser guide says the Web LLM Inference API requires a browser with WebGPU support.
- The Web guide uses `@mediapipe/tasks-genai`.
- Google documents web-specific model assets and recommends using models with `-Web` in the name.
- The current guide explicitly calls out Gemma web-ready variants and shows web asset loading via `modelAssetPath`.

Planning implication:

- Browser MVP should capability-gate on WebGPU before attempting heavy runtime setup.
- Runtime code should be lazy-imported only after cheap checks pass.
- The browser local path should be treated as opt-in and best-effort, not assumed baseline.

### 2. WebGPU constraints align with the spec's "unsupported device" stance

Official MDN docs:

- https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API

Key findings:

- MDN marks WebGPU as "Limited availability", not Baseline.
- MDN states WebGPU is available only in secure contexts (HTTPS) in supporting browsers.
- MDN documents both `Navigator.gpu` and `WorkerNavigator.gpu`.
- MDN's feature-detection example explicitly checks `navigator.gpu` and adapter acquisition failure.

Planning implication:

- The spec's unsupported-device matrix is consistent with current platform reality.
- Browser capability detection should check at least:
  - secure context
  - `navigator.gpu`
  - adapter acquisition success
- Running local inference inside a worker is aligned with platform guidance because WebGPU is available via `WorkerNavigator.gpu`.

### 3. Tauri v2 supports app-local storage patterns that fit desktop-local model state

Official Tauri docs:

- https://v2.tauri.app/plugin/file-system/
- https://v2.tauri.app/plugin/store/

Key findings:

- Tauri's file-system plugin supports reading and writing under `BaseDirectory.AppLocalData`.
- Tauri documents explicit permission scopes for `$APPLOCALDATA`.
- The Store plugin supports `LazyStore`, which loads on first access.
- Tauri Store supports manual `save()` and autosave behavior.

Planning implication:

- Desktop device-local state can be stored under app-local storage without custom OS-specific code in v1.
- If the team wants simple key-value state, adding Tauri Store is reasonable; if not, the existing fs plugin is enough for a first pass.
- Desktop planning should include capability/permission handling instead of assuming unrestricted file access.

### 4. Typhoon OCR is clearly a server-side provider path, not a client-local path

Official Typhoon docs:

- https://docs.opentyphoon.ai/en/ocr/
- https://opentyphoon.ai/model/typhoon-ocr

Key findings:

- `typhoon-ocr` is documented as Typhoon OCR 1.5 (2B), latest and recommended.
- Rate limits are documented as 2 req/s and 20 req/min.
- Supported file types are PNG, JPEG, and PDF.
- The helper returns structured, layout-aware Markdown output.
- The docs explicitly support processing a specific PDF page with `page_num`.
- The product page emphasizes document parsing, layout-aware extraction, and structured outputs.

Planning implication:

- The spec is right to keep document-grade OCR on a backend/provider path.
- OCR orchestration should be server-mediated with queue/retry/rate-limit handling.
- Local LLM should be positioned as cleanup/post-processing, not as the high-stakes OCR truth source.

## Recommended planning constraints based on research

1. Browser MVP should be text-first and worker-first.
   - Gate on secure context and WebGPU before dynamic import.
   - Do not load MediaPipe or model assets on normal cloud-only sessions.

2. Local model catalog should be separate from cloud-provider model catalogs.
   - Avoid polluting `trpc.llmProviders.availableModels`.
   - Add a dedicated local-model catalog surface and keep routing explicit.

3. Persist only the right data in each layer.
   - server-synced: user intent and safe defaults
   - device-local: downloads, storage usage, capability snapshots, install state
   - server-authored: durable runtime metadata for conversations/messages

4. Keep truthful runtime semantics.
   - Current chat flow yields mostly `Hybrid` and `Cloud`.
   - Reserve durable `Local` for true device-only inference paths.

5. Desktop should target `apps/tauri-shell` directly.
   - Use app-local storage and existing Tauri plugins.
   - Do not create a parallel desktop app path.

6. Security work is first-class, not follow-up polish.
   - asset origin allowlists
   - integrity checking
   - no client-exposed OCR/provider secrets
   - no arbitrary URL fetch by backend jobs
   - server-authoritative metadata validation

## Testing approach to carry into the plan

- Server tests
  - `users.getPreferences/updatePreferences`
  - tenant feature-flag resolution and validation
  - local metadata validation and persistence rules
  - cloud fallback behavior when local flags/capabilities are absent
- Client tests
  - settings panel behavior when feature disabled vs enabled
  - unsupported-device behavior with missing `navigator.gpu`
  - no eager import / no download prompts on normal chat open
  - runtime badge rendering from server-authored metadata
- Integration tests
  - conversation override persistence
  - message save paths and SSE metadata handling
  - desktop adapter behavior where applicable

## Gaps to resolve in interview

1. For v1, should browser rollout expose any local general-chat path, or should browser be limited to summaries/compaction only?
2. Should desktop v1 include on-demand model download UX immediately, or first ship only the shared routing/settings scaffolding?
3. Does the team want a true device-only request path in v1.1+, or is truthful `Hybrid` labeling sufficient for the first rollout?
4. How much admin control is required in the first pass:
   - tenant kill switch only
   - curated local model allowlist
   - OCR provider toggle
   - telemetry opt-out
