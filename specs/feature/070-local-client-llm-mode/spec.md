# 070 - Local / Client LLM Mode with Safe Cloud Fallback

Version: 1.0
Date: 2026-04-04
Status: Proposed
Audience: Chat, Settings, Runtime, Platform, Tauri, QA

---

## 1. Executive summary

SmartSpecPro will add an optional Local / Client LLM Mode so the product can use on-device or client-side small models for lightweight work such as:

- general chat
- summarization
- context compaction
- structured extraction
- privacy-oriented preprocessing before cloud submission

The design center for this feature is not "run local everywhere".

The design center is:

- add a local-first path where it is actually useful
- keep the current cloud path fully intact
- avoid regressions for machines that are not ready for local inference
- require explicit user or tenant opt-in before any heavy local runtime work begins

For v1, SmartSpecPro must remain fully usable on devices that:

- do not support WebGPU
- do not have enough memory or storage
- are running in insecure browser contexts
- are blocked by tenant policy
- do not have a desktop-native runtime available

On those devices, the product must continue to behave as a normal cloud/server LLM product with no broken chat flow, no forced model downloads, no startup slowdown caused by local runtime bootstrapping, and no requirement for Docker or manual end-user runtime setup.

---

## 2. Problem statement

SmartSpecPro can benefit from local inference for cost, privacy, and responsiveness, but client-side AI is inherently uneven across devices and platforms.

The same feature that is useful on a modern GPU-capable browser can become a source of regressions on another machine if it:

- eagerly imports heavy runtime bundles
- assumes WebGPU exists
- assumes storage is available
- assumes model downloads are acceptable
- makes cloud chat depend on local readiness

The platform therefore needs a local AI architecture that is explicitly compatibility-first.

The local path must be additive, isolated, lazy-loaded, capability-gated, and easy to disable at tenant, user, conversation, and request levels.

---

## 3. Goals

1. Add an optional Local / Client LLM Mode for lightweight chat, short voice-to-text chat entry, and preprocessing of memory/context artifacts and attachments.
2. Guarantee that machines not ready for local inference continue to use the current cloud/server flow without regression.
3. Keep local AI fully opt-in for the initial rollout.
4. Reuse existing SmartSpecPro chat, settings, and model-selection architecture where practical.
5. Support shared routing concepts across browser and the current Tauri shell path at `apps/tauri-shell`.
6. Separate best-effort local vision/OCR from document-grade OCR, which should remain backend-mediated.
7. Preserve privacy and cost-saving opportunities without exposing secrets in the client.
8. Let users choose whether the chat mic uses the existing server-mediated STT path or a capability-gated local Gemma 4 voice path when available.

---

## 4. Non-goals

1. This feature does not make local inference the default behavior in v1.
2. This feature does not require every browser or device to support local AI.
3. This feature does not require Docker, manual container setup, or local service orchestration by end users.
4. This feature does not promise multimodal parity across browser, desktop, and future mobile runtimes in the first phase.
5. This feature does not treat local vision models as production-grade OCR for high-stakes documents by default.
6. This feature does not allow client applications to call OCR or cloud providers with exposed API keys.
7. This feature does not introduce an always-listening background microphone or a silent voice assistant that bypasses visible user interaction.

---

## 5. Locked product decisions

### 5.1 Safe rollout defaults

- New and existing users default to `localAi.enabled = false` and `localAi.mode = "off"`.
- Tenant rollout must be gated by a new tenant feature flag, recommended name: `localClientLlmMode`, default `false`.
- If the tenant flag is off, the product must behave exactly like today's cloud/server flow.

### 5.2 Persistence strategy

- Per-user preferences should extend the existing `users.userPreferences` JSON document rather than requiring a new first-phase table.
- `users.userPreferences.localAi` must store only cross-device user intent and safe sync preferences.
- Device-local install, download, cache, and storage state must not be stored in `users.userPreferences`.
- Browser device-local state should live in browser-managed storage such as IndexedDB / localStorage as appropriate.
- Tauri device-local state should live in app-local storage under the Tauri shell runtime.
- Missing `localAi` preferences must resolve to safe defaults without migration failures.

### 5.3 Platform scope

- Browser MVP is text-first.
- Browser may expose an optional mic flow for short dictation or short voice commands, but browser-local voice must remain capability-gated and must not replace the legacy STT path by default.
- Desktop work should target the existing Tauri surface at `apps/tauri-shell`, not a new `apps/desktop` path.
- Tauri is the preferred path for fuller local voice support, including short push-to-talk dictation and voice-command-driven chat entry.
- Android and other native clients remain future-ready targets only.

### 5.3.1 Gemma 4-first model stance

- Local AI v1 should be curated around the Gemma 4 family rather than a generic "any local model" promise.
- Gemma 4 native modality assumptions in this product are:
  - text and image understanding are available across the family
  - audio input is considered available only on the smaller Gemma 4 profiles that support it, specifically the E2B and E4B line
- Browser-local rollout should treat `gemma4-e2b-web-fast` as the first supported Gemma 4 web profile.
- `gemma4-e4b-web-balanced` may be introduced only after SmartSpecPro validates download size, warm-up time, WebGPU stability, and short-voice success telemetry on real supported browsers.
- Gemma 4 26B / 31B class profiles are out of scope for browser-local execution in v1.
- Tauri rollout should target Gemma 4 more aggressively:
  - `gemma4-e4b-tauri-balanced` is the primary desktop-local profile
  - `gemma4-e2b-tauri-fast` is the lower-spec fallback profile
- A profile may expose `gemma4_local` voice only if that exact profile declares audio support; voice UI must stay hidden for text-only profiles.
- Browser availability must depend on a SmartSpecPro-shipped and validated Gemma 4 web runtime path, not only on theoretical device capability. If the build does not yet include the approved Gemma 4 web runtime stack, `gemma4_local` must remain unavailable even on capable hardware.

### 5.4 OCR stance

- Local LLM OCR is best-effort only.
- Document-grade OCR must route through a backend OCR provider path, with Typhoon OCR 1.5 as the recommended default provider when enabled.
- Client code must never call Typhoon OCR directly with tenant secrets.

### 5.5 Loading strategy

- Local runtime libraries and model-download logic must be loaded lazily only after feature enablement and capability checks.
- The main chat and settings experience must not synchronously depend on browser-local LLM packages.

### 5.6 Authoritative runtime metadata

- Client-reported local-runtime metadata is advisory only unless the server can validate it.
- Billing, quotas, tenant policy enforcement, compliance, and audit records must remain server-authoritative.
- Runtime badges and saved message metadata must be derived from server-authored events or server-validated write paths.

### 5.7 Voice input posture

- The existing chat mic path remains supported and configurable as the compatibility fallback.
- Users should be able to select a mic provider mode such as:
  - `legacy_stt`
  - `gemma4_local`
  - `auto`
- Browser rollout should default to `legacy_stt` unless the tenant, user, device capability, and selected local profile all allow a local Gemma 4 voice path.
- Tauri rollout may prefer local Gemma 4 voice on supported machines, but the legacy/server STT path must remain available as fallback.
- Voice input in v1 is limited to short dictation and short voice commands that resolve into text or server-validated actions; it is not an always-on assistant mode.
- Any token-saved estimate is informational analytics only and must never drive billing or entitlements.

### 5.8 Truthful runtime labels

- `Local` must be reserved for paths where the relevant raw input did not traverse the SmartSpecPro backend before inference.
- Under the current chat persistence flow, where user messages are stored server-side before assistant completion, the truthful durable label is normally `Hybrid` or `Cloud`, not `Local`.
- MVP chat rollout should therefore target durable `Hybrid` and `Cloud` badges first.
- A true `Local` chat badge requires a distinct device-only request path and must not be implied by local preprocessing alone.

---

## 6. Current-codebase fit

This feature should extend the existing architecture rather than introduce a parallel chat system.

Primary integration points in the current repo:

- `apps/web/client/src/pages/Settings.tsx`
- `apps/web/client/src/pages/Chat.tsx`
- `apps/web/server/routers/users.ts`
- `apps/web/server/routers/chat.ts`
- `apps/web/server/services/chatModelSelection.ts`
- `apps/web/server/services/intelligentModelSelector.ts`
- `apps/web/server/services/appRuntimeConfig.ts`
- `apps/web/shared/featureFlags.ts`
- `apps/tauri-shell/src-tauri/*`

Recommended front-end organization:

```text
apps/web/client/src/features/local-ai/
  components/
  hooks/
  state/
  workers/
  adapters/
  routing/
  model-registry/
  types/
```

Recommended shared logic surface:

```text
packages/local-ai-core/
  capability/
  routing/
  runtime-types/
  structured-output/
```

---

## 7. User-facing execution modes

The product must support these execution modes:

1. `off`
   - local runtime is disabled
   - current cloud/server behavior remains unchanged
2. `auto`
   - system chooses local or cloud based on capability, task class, and policy
3. `prefer_local`
   - try local first, then fall back to cloud
4. `local_only`
   - use only local runtime for eligible tasks; if not possible, fail the task with clear messaging
5. `cloud_only`
   - allow local assets to remain installed, but do not route requests to them

For v1 rollout, effective default behavior must remain equivalent to `off`.

---

## 8. Compatibility and non-regression guardrails

This section is normative and takes precedence over convenience optimizations.

### 8.1 Off-by-default and tenant kill switch

1. The feature MUST be disabled by default for all existing tenants and users.
2. Tenant policy MUST be able to force cloud-only behavior.
3. If tenant policy disables the feature, client code MUST not attempt local runtime initialization.

### 8.2 No startup regression

1. Opening `/chat` or `/settings` on a machine that never uses local AI MUST not trigger model downloads.
2. Opening `/chat` or `/settings` on a machine that never uses local AI MUST not initialize a local worker.
3. Browser-local runtime packages MUST be dynamically imported only after both:
   - the feature is enabled for the tenant/user
   - cheap capability checks indicate the device may be eligible
4. A failure to import or initialize local runtime code MUST NOT break page rendering or normal cloud chat.

### 8.3 No forced install or download

1. End users MUST NOT be required to install Docker.
2. End users MUST NOT be required to run a sidecar service manually.
3. Model download MUST require explicit user consent in the UI.
4. The system MUST NOT silently prefetch multi-GB model assets for users who have not opted in.

### 8.4 Unsupported-device behavior

Machines that are not ready for local inference must degrade gracefully:

| Condition | Required behavior |
|---|---|
| No `navigator.gpu` / no WebGPU | hide or disable browser-local execution; keep chat cloud-first |
| `navigator.gpu` exists but adapter/device/profile requirements fail | mark browser-local unsupported for that profile; keep cloud path canonical |
| Insecure browser context | mark local browser mode unsupported; keep normal chat working |
| Insufficient storage budget | block download; show actionable message; keep cloud path available |
| Insufficient runtime capability or failed warm-up | mark local runtime unavailable and fall back automatically unless `local_only` |
| Tenant policy disables local AI | hide or lock controls and keep cloud path canonical |
| Desktop adapter unavailable | keep web/cloud path working; do not expose broken desktop-local options |

### 8.5 Server compatibility

1. Existing chat requests that know nothing about local AI MUST continue to work unchanged.
2. Server routes MUST treat local-runtime metadata as optional advisory input.
3. The server MUST NOT assume that a client can execute local preprocessing.
4. Cloud fallback MUST remain the canonical production path for unsupported devices.

### 8.6 Local-only isolation

1. `local_only` MUST fail only the affected request, not the entire conversation or page.
2. A local-runtime error MUST NOT delete conversation state or message draft state.
3. The user MUST be able to retry the same message with cloud execution.

### 8.7 No hidden resource tax

1. Telemetry collection for this feature MUST stay lightweight when the feature is off.
2. Capability checks in browser must begin with cheap checks before any expensive probing.
3. The first-phase implementation SHOULD avoid mandatory database migrations for per-user preferences.

### 8.8 Trust boundary and authoritative records

1. The client MAY send provisional metadata such as:
   - attempted local runtime
   - candidate local profile
   - estimated token savings
2. The server MUST treat those fields as untrusted advisory input unless independently validated.
3. The system MUST NOT use raw client-reported values for:
   - billing
   - quota deduction
   - compliance evidence
   - tenant policy decisions
   - persistent privacy claims
4. A saved message must only be labeled `Local`, `Hybrid`, or `Cloud` durably if that label was emitted or confirmed by a trusted server write path.

### 8.9 Device-local isolation and cleanup

1. Device-local local-AI state MUST be scoped by at least:
   - tenant identity
   - user identity when signed in
   - platform/runtime namespace
2. Signing out, switching account, or switching tenant MUST NOT expose another account's local-AI consent or history-derived state.
3. The implementation MUST either:
   - partition device-local state by scoped keys
   - or clear sensitive state on account/tenant transitions
4. Model blobs MAY be physically reused on disk across accounts on the same device, but consent state, install state visibility, runtime history, and derived text artifacts MUST remain logically isolated.

---

## 9. Functional requirements

### 9.1 User settings

The existing user settings flow in `apps/web/client/src/pages/Settings.tsx` and `apps/web/server/routers/users.ts` must gain a new `localAi` preferences block under the existing user-preferences JSON contract.

Required controls:

- `Enable Local AI`
- `Execution Mode`
- `Default Local Model`
- `Use Local Model for General Chat`
- `Use Local Model for Summaries / Compression`
- `Use Local Model for Image Tasks when supported`
- `Allow model download on this device`
- `Download only on Wi-Fi / unmetered` where supported
- `Storage budget`
- `Delete local models / clear cache`
- `Fallback behavior on local failure`
- `Show runtime badge`

Required behavior:

1. If tenant policy disallows local AI, the settings UI MUST not encourage the user to enable it.
2. If the current machine is unsupported, the settings UI MUST show why and preserve cloud behavior.
3. Saving preferences MUST succeed even if the `localAi` block is absent or partially filled.
4. The settings UI MUST clearly distinguish:
   - account-wide synced preferences
   - device-local storage/download settings

### 9.2 Tenant/admin controls

Recommended rollout controls:

- tenant feature flag `localClientLlmMode` default `false`
- optional tenant allowlist of local model profiles
- optional tenant policy to force `cloud_only`
- optional tenant policy to disable local vision/OCR independently

The tenant feature flag should be wired through `apps/web/shared/featureFlags.ts` and resolved through the existing tenant feature-flag service.

Implementation requirement:

1. The rollout is incomplete unless the new flag is added consistently to:
   - `TenantFeatureFlags`
   - `ALLOWED_FEATURE_FLAGS`
   - `FEATURE_FLAG_DEFAULTS`
   - tenant feature-flag validation and admin editing surfaces
2. Unknown flag keys must not be relied on, because the current flag service strips unrecognized keys.

### 9.3 Capability detector

The capability detector must compute a runtime-readiness result before enabling local routing.

Required signals:

- platform type
- secure-context availability
- WebGPU availability for browser mode
- WebGPU adapter/device readiness for the selected profile
- storage availability and budget
- whether model assets are present
- basic memory/performance suitability
- modality support

Required properties:

1. Capability detection MUST support a cheap first pass and a deeper optional second pass.
2. Cheap detection MUST be safe to run on any device.
3. Deep detection MUST remain lazy and isolated from initial page load.

### 9.3.1 Capability API contract

The feature should define a dedicated capability contract instead of relying on ad hoc client booleans.

Example response shape:

```json
{
  "supported": false,
  "platform": "web",
  "secureContext": true,
  "webgpu": true,
  "webgpuAdapterAvailable": false,
  "webgpuProfileRequirementsMet": false,
  "eligibleProfiles": [],
  "reasons": ["webgpu_adapter_unavailable"],
  "storage": {
    "estimateAvailableMb": null
  }
}
```

Required rules:

1. Capability results used for UI gating MUST come from a typed contract.
2. Unknown capability fields must not silently change routing semantics.
3. Browser runtime readiness MUST NOT be inferred from `navigator.gpu` alone.

Browser-local profile metadata SHOULD declare any minimum WebGPU limits/features needed so capability checks can reject unsupported profiles before worker/runtime boot.

### 9.4 Model registry and profile curation

The system must separate model family from model profile.

Example profiles:

- `gemma4-e2b-web-fast`
- `gemma4-e4b-web-balanced`
- `gemma4-e2b-tauri-fast`
- `gemma4-e4b-tauri-quality`
- `typhoon-ocr-1_5-api-document`

Selection rules:

1. Users may choose only from a curated profile list.
2. Profiles that the current platform cannot use MUST be hidden or marked unavailable.
3. If a stored profile becomes unavailable, the runtime must degrade gracefully to cloud behavior.
4. Local model profiles MUST come from a dedicated local-model catalog endpoint or namespaced registry.
5. Local model profiles MUST NOT be injected into generic cloud model lists such as `llmProviders.availableModels` by default.
6. Existing cloud-only pickers such as translation or provider auto-selection MUST remain unaffected unless explicitly upgraded to understand local profiles.

### 9.4.1 Local model catalog API contract

The local model catalog should have a dedicated typed contract.

Example shape:

```json
{
  "profiles": [
    {
      "id": "gemma4-e2b-web-fast",
      "family": "gemma4",
      "variant": "E2B",
      "platforms": ["web"],
      "runtime": "mediapipe-webgpu",
      "modalities": {
        "text": true,
        "image": true,
        "audio": true
      },
      "voice": {
        "supportsShortAudio": true,
        "maxClipSeconds": 30,
        "expectedAudioFormat": "mono_16khz_float32_normalized"
      },
      "downloadRequired": true,
      "sizeMbApprox": 2004,
      "integrity": {
        "manifestVersion": "2026-04-04",
        "sha256": "..."
      }
    }
  ]
}
```

Required rules:

1. The catalog MUST support allowlisting and denylisting by server policy.
2. Installed clients MUST be able to learn that a profile was revoked or superseded.
3. The catalog MUST declare whether a profile supports Gemma 4 native audio input so the mic provider UI can hide `gemma4_local` for non-audio profiles.
4. Browser catalog entries MUST declare whether SmartSpecPro has validated that profile/runtime combination for browser rollout, rather than assuming all web-converted Gemma 4 variants are equally production-ready.

### 9.5 Runtime router

The runtime router should extend existing chat model-selection logic rather than replace it.

It must consider:

- user `localAi` mode
- tenant policy
- task class
- capability readiness
- model availability
- prompt length and context size
- current runtime health

Recommended eligible local-first tasks:

- general chat
- summarization
- context compaction
- JSON extraction
- short voice-to-text dictation that becomes normal chat input
- short voice-command transcription before safe action routing
- redaction / scrubbing before cloud submit
- light OCR cleanup after backend OCR

Constraints:

- local preprocessing in v1 is intended for memory/context artifacts, attachments, and explicit user-invoked draft helpers
- local preprocessing MUST NOT silently rewrite primary control text such as routing inputs, team-run objectives, agency/swarm requests, or workflow execution fields

Recommended cloud/server tasks:

- long reasoning
- large code generation
- multi-step orchestration
- high-fidelity multimodal reasoning
- document-grade OCR
- high-risk finance/legal document extraction

### 9.5.1 Device-only vs hybrid semantics

1. A request MUST NOT be labeled `device_only`, `fully local`, or equivalent if raw input has already been sent to the SmartSpecPro backend.
2. Under the current chat write path, where the user message is persisted server-side before assistant completion, local execution should be described as:
   - `Hybrid` when a local model contributed but SmartSpecPro still handled the request path
   - `Cloud` when only server/provider execution was used
3. The UI MUST distinguish:
   - not sent to third-party provider
   - not sent to SmartSpecPro backend
4. A true device-only mode requires a separate execution path and persistence design and is out of MVP scope unless explicitly implemented.

### 9.6 Chat UX requirements

The existing chat page in `apps/web/client/src/pages/Chat.tsx` must stay recognizable and usable.

Required behavior:

1. Show a runtime badge for each answer:
   - `Hybrid`
   - `Cloud`
   and reserve `Local` for future or explicitly implemented device-only paths
2. Allow `Retry with Cloud` on local answers.
3. Allow conversation-level override:
   - use local first for this conversation
   - disable local for this conversation
4. If local execution fails, the conversation must continue through fallback without message loss.
5. Conversation-level local-AI overrides MUST persist in `conversations.skillSettings` or an equivalent server-owned conversation settings store; ephemeral client state alone is not sufficient.
6. Durable runtime badges after reload MUST come from saved server-authored message metadata, not from temporary client memory only.
7. Streaming or completion save paths SHOULD emit server-authored runtime metadata in final events, similar to the current `message_complete` / `message_saved` pattern.

### 9.6.1 Runtime metadata API contract

Streaming and non-streaming assistant save flows should converge on one typed runtime-metadata shape.

Example shape:

```json
{
  "runtimeMetadata": {
    "source": "hybrid",
    "localProfileId": "gemma4-e2b-web-fast",
    "resolvedCloudModelId": null,
    "resolvedProviderName": null,
    "fallbackReason": null,
    "selectionMode": "prefer_local",
    "validatedByServer": true
  }
}
```

Required rules:

1. SSE events such as `message_complete` and `message_saved` MUST carry the same runtime metadata shape if they expose runtime-source information.
2. Non-streaming save paths MUST persist the same shape or call a shared server helper that derives it.
3. If a client sends a candidate runtime metadata object, it MUST be stored separately from the validated persisted shape or overwritten by the server-authoritative version.

### 9.6.2 Voice input, mic modes, and assistant actions

The existing chat mic surface should evolve into a provider-selectable voice entry point rather than a hardcoded external-STT-only feature.

Required behavior:

1. The user MUST be able to choose a voice input mode:
   - `legacy_stt`
   - `gemma4_local`
   - `auto`
1.1 In v1 chat, `legacy_stt` MUST map to the existing push-to-talk transcription path already used by the chat composer, not to a new or ambiguous voice stack.
1.2 The separate realtime voice-session stack, if kept in the product, MUST remain outside this Local AI rollout unless a later phase explicitly converges it with the provider-selectable chat mic.
2. Browser web support should ship only the parts that are safe and immediately useful:
   - short dictation into the chat composer
   - short voice commands converted into text and routed through the existing chat/tool pipeline
   - optional safe in-app navigation for allowlisted routes such as `/chat`, `/teams`, or `/notifications`
3. Browser local Gemma 4 voice MUST remain capability-gated and MUST NOT replace legacy STT by default.
4. If browser-local voice is not ready, the system MUST:
   - use `legacy_stt` when mode is `auto`
   - or explain the failure without breaking text chat when mode is explicitly `gemma4_local`
5. Tauri SHOULD be the preferred path for fuller local voice support with push-to-talk and short-command handling, while still preserving a configurable fallback to the legacy/server STT route.
6. Voice input in this feature is limited to short clips and short commands. The product MUST NOT imply long-form transcription, background listening, or always-on hot-mic behavior.
7. Local Gemma 4 voice paths SHOULD target only Gemma 4 E2B/E4B profiles in v1, stay within the short-clip envelope, and normalize audio to the format expected by the selected profile rather than assuming arbitrary browser recordings are directly usable.
8. For Gemma 4 local voice, implementations SHOULD normalize audio into mono 16 kHz float32 data in the range `[-1, 1]` before inference, and SHOULD cap v1 clips at 30 seconds or less.
9. Browser `gemma4_local` voice SHOULD be considered experimental until SmartSpecPro ships and validates its own browser runtime stack for the selected Gemma 4 web profile. The UI MUST NOT imply general browser availability just because the underlying device exposes WebGPU.
10. Voice input may help initiate tasks such as search, image generation, receipt/OCR workflows, reminder drafting, or notification lookup, but those actions MUST still go through existing permission, validation, and routing paths after transcription.
11. V1 supported side-effectful voice actions MUST be limited to actions that already have clear server-authorized flows in the current product, such as reminder or notification flows. Domains that do not yet have a clear backend write path, such as a dedicated personal-expense ledger, MUST be treated as future extensions rather than implied v1 scope.
12. Consent and disclosure MUST distinguish between:
   - `legacy_stt`, where audio may be processed by SmartSpecPro backend and third-party STT providers
   - `gemma4_local`, where audio is intended for local-device processing
   - `auto`, where the UI MUST disclose that unsupported cases can fall back to the legacy/server STT path
13. If the user explicitly selects `gemma4_local`, the product MUST NOT silently send audio to third-party STT providers; it should fail clearly or require an explicit mode change or confirmation.

### 9.6.3 Voice-command safety rules

1. A transcribed voice command MUST be treated as untrusted user input until the server validates the resulting action.
2. Allowlisted no-side-effect navigation actions such as opening first-party routes MAY execute directly in the client, but they MUST still honor route access control and must not open arbitrary URLs.
3. Side-effectful actions such as creating reminders, invoking existing OCR/workflow actions, sending notifications, or targeting another user MUST continue to use the existing server mutation paths with their current authorization checks.
4. Commands that target another user, create/update persistent records, or trigger external delivery SHOULD require explicit confirmation in the UI before submission.
5. Voice shortcuts MUST NOT bypass tenant restrictions, admin-only routes, billing controls, or other privileged surfaces.
6. If a requested voice action does not map to an existing v1-safe action registry entry, the system SHOULD fall back to inserting or sending the transcribed text through normal chat rather than inventing a new direct action path.

### 9.7 Image, vision, and OCR policy

Local vision and OCR must be capability-gated and must not be implied just because a model family supports it in some environments.

Policy:

1. Browser MVP is text-first.
2. Local vision in browser is optional and experimental.
3. Tauri is the preferred future path for stronger local multimodal support.
4. Document OCR should default to backend-mediated Typhoon OCR 1.5 when available.
5. If a local vision model reads text from an image directly, the system should label the result as `Best-effort OCR`.
6. Client applications MUST NOT expose Typhoon OCR credentials.

### 9.8 Download and cache lifecycle

Required states:

- `not_supported`
- `disabled`
- `ready_to_download`
- `downloading`
- `preparing`
- `ready`
- `running`
- `fallback_to_cloud`
- `error`

Required behavior:

1. Browser model assets must be cacheable and removable.
2. Desktop asset storage must be managed under the Tauri shell path.
3. Cache clearing must be user-accessible.
4. Storage-full conditions must not block normal cloud chat.

---

## 10. Proposed architecture

Logical flow:

```text
User Input
  -> Capability Detector
  -> Runtime Router
      -> Local Runtime Adapter
      -> Hybrid Pre/Post Processor
      -> Cloud / Server LLM Adapter
  -> Unified Response Stream
  -> Conversation Store
```

Required layers:

### 10.1 Capability detector

- determines whether local runtime is even allowed to try
- must expose reasons for ineligibility

### 10.2 Runtime router

- chooses local, hybrid, or cloud
- must keep cloud routing authoritative when local is unavailable

### 10.3 Model registry

- stores curated local model profiles and their constraints
- maps profiles to browser or Tauri runtime adapters
- exposes a dedicated local-model catalog boundary separate from generic cloud provider catalogs

### 10.4 Local runtime adapter

- provides a shared interface for browser and Tauri execution
- isolates platform-specific loading and inference details

### 10.5 Local pre/post processor

- summarization
- compaction
- JSON extraction
- redaction
- OCR cleanup
- must not silently replace final submitted control text

### 10.6 Runtime metadata validator

- normalizes server-authored runtime source labels
- validates which metadata is safe to persist or display
- prevents client-only claims from becoming authoritative audit records

### 10.7 Profile revocation and cache invalidation manager

- consumes server-side denylist / revocation information
- marks revoked local profiles unusable even if files still exist on disk
- can force revalidation, re-download, or removal of unsafe model bundles

### 10.8 Voice input adapter

- captures push-to-talk audio only after explicit user gesture
- normalizes audio for the selected provider path
- routes between `legacy_stt`, `gemma4_local`, or `auto`
- produces text or structured advisory metadata for the existing chat/tool pipeline
- for v1 chat, `legacy_stt` should wrap the existing push-to-talk transcription path rather than introduce a second legacy implementation

### 10.9 Voice command and action router

- maps short transcribed voice commands into:
  - chat composer text
  - allowlisted in-app navigation
  - existing server-validated reminder / notification / OCR / workflow actions
- keeps side-effectful actions behind existing authorization and confirmation boundaries
- unknown or unsupported actions fall back to ordinary chat text rather than creating speculative direct side effects

---

## 11. Data model

### 11.1 Synced user preferences

The recommended MVP storage format extends `users.userPreferences`:

```json
{
  "localAi": {
    "enabled": false,
    "mode": "off",
    "defaultModelId": null,
    "useForGeneralChat": false,
    "useForSummaries": false,
    "voiceInputMode": "legacy_stt",
    "enableVoiceCommands": false,
    "voiceReadbackMode": "off",
    "useForImageTasks": false,
    "useForOcrCleanup": false,
    "documentOcrProvider": "typhoon_ocr_1_5",
    "fallbackPolicy": "cloud_on_failure",
    "showRuntimeBadge": true
  }
}
```

Safe-default rule:

- missing `localAi` means feature disabled
- this document stores synced user intent only
- device-local download/cache/storage settings must not be stored here

### 11.2 Device-local state

The following state should remain device-local and must not sync across the user's other devices by default:

```json
{
  "localAiDevice": {
    "allowDownloads": false,
    "wifiOnlyDownloads": true,
    "storageBudgetMb": 2048,
    "consentedModelIds": [],
    "installedModelIds": [],
    "cacheBytesApprox": 0,
    "lastCapabilityCheck": {
      "checkedAt": "2026-04-04T12:00:00.000Z",
      "platform": "web",
      "secureContext": true,
      "webgpu": false
    }
  }
}
```

Required rule:

- changing a device-local download/storage setting on machine A must not unexpectedly change machine B for the same user account
- device-local keys must be partitioned or namespaced so that one signed-in account cannot accidentally inherit another account's consent or derived local text artifacts
- sign-out and tenant-switch behavior must be explicitly defined for this state

### 11.3 Tenant policy and flag contract

Recommended rollout schema:

```json
{
  "localClientLlmMode": false
}
```

Optional later extensions may split local text and local vision into separate tenant controls.

Implementation note:

- because tenant flags are allowlisted in code today, this contract must be implemented in typed feature-flag code and not only as an example JSON shape

### 11.4 Conversation override and routing state

The recommended MVP should persist conversation-level overrides in the existing `conversations.skillSettings` JSON document rather than only in transient client state.

Example shape:

```json
{
  "localAiConversation": {
    "modeOverride": "prefer_local",
    "disableLocal": false,
    "updatedAt": "2026-04-04T12:00:00.000Z"
  }
}
```

Required rule:

- do not create a second unrelated conversation settings store if `conversations.skillSettings` can safely hold the override
- the server MUST validate only an allowlisted `localAiConversation` subdocument and preserve unrelated `skillSettings` fields during updates
- merge logic MUST be namespaced and additive so that `localAiConversation` updates do not clobber existing `llmSelection`, auto-detect, or skill preference state

### 11.5 Message runtime metadata

The current `messages` schema has `modelUsed` but does not have a durable home for runtime-source badges or fallback metadata.

For this feature to support durable badges, auditing, and reload-safe UX, the system MUST add a server-owned `messages.runtimeMetadata` JSON column or an equivalent side table.

Example shape:

```json
{
  "source": "hybrid",
  "localProfileId": "gemma4-e2b-web-fast",
  "resolvedCloudModelId": "openai/gpt-5-mini",
  "resolvedProviderName": "openrouter",
  "fallbackReason": "browser_local_not_ready",
  "selectionMode": "prefer_local",
  "validatedByServer": true,
  "tokenSavedEstimate": 0
}
```

Required rules:

- `modelUsed` alone is not enough for this feature's UX and audit requirements
- runtime metadata must be authored or validated by the server before durable persistence
- token-saved estimates must remain informational only

### 11.6 Local derived-data retention

If local runtime produces derived local artifacts such as:

- OCR markdown
- redacted text
- compacted context packets
- local summaries
- preprocessing debug traces

the implementation MUST define a retention policy for them.

Minimum policy requirements:

```json
{
  "localDerivedData": {
    "retentionMode": "ttl",
    "ttlHours": 24,
    "clearOnSignOut": true,
    "includedInClearCache": true
  }
}
```

Required rules:

- derived local text artifacts must be included in user-facing clear-cache flows
- sensitive derived artifacts should default to bounded retention rather than indefinite storage
- debug traces containing user content should be disabled by default outside explicit debug mode

### 11.7 Runtime decision envelope

```json
{
  "taskClass": "general_chat",
  "input": {
    "text": "Summarize this thread",
    "images": [],
    "audio": []
  },
  "device": {
    "platform": "web",
    "secureContext": true,
    "webgpu": false,
    "modelReady": false
  },
  "userPolicy": {
    "mode": "prefer_local"
  },
  "decision": {
    "selectedRuntime": "cloud",
    "reason": "browser_local_not_ready"
  }
}
```

---

## 12. Security, privacy, and reliability requirements

### 12.1 Security

1. Cloud provider keys and OCR secrets MUST remain server-side.
2. Cloud fallback MUST keep using the existing server/proxy path.
3. Download sources for local model assets SHOULD support integrity validation.
4. Local model assets MUST come from allowlisted origins or signed manifests controlled by SmartSpecPro policy.
5. Model asset manifests SHOULD include checksum, version, and size metadata before download.
6. Backend OCR or asset-processing jobs MUST NOT fetch arbitrary third-party URLs supplied by clients.
7. OCR and document-processing backends SHOULD accept:
   - uploaded files
   - SmartSpecPro-managed storage keys
   - SmartSpecPro-managed signed URLs
   and SHOULD reject raw arbitrary external fetch targets by default.
8. Voice-command-driven actions MUST continue to honor existing permission and authorization checks after transcription.
9. Client-side navigation from voice commands MUST be limited to an allowlisted set of first-party routes and MUST NOT open arbitrary external destinations.
10. Raw audio retention MUST remain bounded and disabled by default beyond the active transcription/session need unless the user explicitly opts into a separate recording feature.
11. The system MUST support revocation or denylisting of previously approved local model profiles.
12. If a profile is revoked for security reasons, the runtime MUST stop selecting it even if its files remain present on the device.
13. Browser-local Gemma 4 execution MUST require both runtime availability and product validation for the selected profile. Hardware capability alone MUST NOT unlock an unvalidated Gemma 4 browser profile.

### 12.2 Privacy

1. If local preprocessing is enabled, the product MAY reduce or scrub attachments, OCR text, or compacted context packets before third-party cloud-provider submission.
2. The product MUST NOT imply that data never left the device unless that is true for the entire request path.
3. The UI MUST disclose that some tasks may still pass through the SmartSpecPro backend even when third-party cloud usage is reduced.
4. The UI SHOULD distinguish:
   - processed locally
   - processed via hybrid path
   - processed via cloud/server
5. Device-local derived artifacts must obey the configured retention and clear-cache policy.

### 12.3 Reliability

1. Corrupted model assets must be recoverable by re-download.
2. Local runtime failures must not break the conversation store.
3. Unsupported devices must still pass normal chat smoke tests.
4. Revoked model bundles must fail closed and route away safely.

### 12.4 Authoritative telemetry and accounting

1. Client-generated token-saved estimates MUST NOT affect billing or credit deduction.
2. Server-side usage accounting remains authoritative even when local runtime is involved.
3. If the system records `runtimeSource`, `localProfileId`, or `fallbackReason`, those values must be server-authored or server-validated before persistence.
4. Audit and analytics pipelines must not treat an unvalidated client claim as proof of device-only processing.

---

## 13. Acceptance criteria

### 13.1 MVP acceptance

1. Users can see and save Local AI settings without breaking existing preferences.
2. Browser capability is checked before any local inference attempt.
3. Browser local runtime code is not eagerly loaded when the feature is off.
4. General chat and summarization can route locally on supported devices.
5. If local execution is unavailable, the system falls back to cloud automatically unless the user chose `local_only`.
6. Runtime badges are visible in chat responses.
7. Cache clearing and model removal are available.

### 13.2 Non-regression acceptance

1. A browser without WebGPU can still use chat normally with cloud execution.
2. A user who never enables Local AI never downloads local model assets.
3. A tenant with `localClientLlmMode = false` sees no broken local-runtime path.
4. A failed local runtime import or warm-up does not crash `/chat` or `/settings`.
5. `users.getPreferences` and `users.updatePreferences` remain backward-compatible when `localAi` is absent.
6. Existing chat requests to `apps/web/server/routers/chat.ts` continue to work without local metadata.
7. Device-local download/storage settings do not sync unexpectedly across the same user's second device.
8. Local model profiles do not appear in unrelated cloud-only pickers unless that surface is explicitly updated.
9. Conversation-level local overrides and runtime badges survive reload through server-owned persistence.
10. Signing out or switching tenant does not expose another account's device-local consent or derived data.

### 13.3 V1 desktop acceptance

1. Tauri integration targets `apps/tauri-shell`.
2. Desktop local asset storage is manageable and removable.
3. Browser-safe guardrails remain intact even after desktop support is added.

### 13.4 V2 OCR acceptance

1. Local vision stays capability-gated.
2. Document OCR routes through backend-mediated Typhoon OCR 1.5 when enabled.
3. High-stakes document OCR does not default to best-effort local vision.

### 13.5 Security acceptance

1. Billing and credits do not trust raw client-reported `tokenSavedEstimate` or equivalent local-runtime metrics.
2. Persisted `runtimeSource` labels come from server-authored or server-validated metadata only.
3. OCR and asset-download paths reject arbitrary external fetch targets unless explicitly allowlisted.
4. Model download manifests are integrity-checkable before installation.
5. Revoked model profiles are blocked from future routing and can be invalidated on installed clients.

---

## 14. Rollout plan

### Phase 0 - Compatibility foundations

- add tenant kill switch
- add `users.userPreferences.localAi` safe defaults for synced intent only
- add device-local state split for download/cache/storage controls
- add feature-flag plumbing in `apps/web/shared/featureFlags.ts` and related tenant flag services
- add capability detector contract
- add runtime router interface
- add dedicated local-model catalog boundary
- add conversation override persistence contract
- add durable message runtime metadata contract
- add lazy-load boundaries
- add server-side trust-boundary rules for runtime metadata
- add SSRF-safe OCR / asset-ingress rules
- add regression tests for unsupported devices

### Phase 1 - Browser text-first MVP

- add browser local text runtime adapter
- add explicit model download UX
- add local summarization and context compaction
- add provider-selectable mic mode with `legacy_stt`, `gemma4_local`, and `auto`
- add short browser voice dictation and short voice-command entry for supported devices
- add allowlisted in-app navigation intents for voice commands without breaking normal chat
- add automatic fallback to cloud
- add runtime badges

### Phase 2 - Tauri shell support

- wire the shared router to `apps/tauri-shell`
- add desktop asset storage controls
- add fuller local push-to-talk voice path with Gemma 4 audio support when capability/profile checks pass
- keep configurable fallback to the legacy/server STT path
- add desktop-focused voice-command routing for personal-assistant-style chat entry
- improve offline and warm-state handling

### Phase 3 - Multimodal and OCR

- add image capability registry
- add optional local vision path
- add Typhoon OCR backend integration
- add OCR cleanup pipeline

### Phase 4 - Voice-ready extension

- support richer audio envelope types
- add optional readback / TTS integration through a separate speech-output layer
- expand ASR and speech-understanding routing beyond short-command mode
- preserve the same compatibility-first policy

---

## 15. Open questions

1. Should `auto` ever become the default for brand-new tenants later, or should local AI remain opt-in indefinitely?
2. Should local vision require a separate tenant feature flag from local text?
3. Should token-saved estimates be shown only in UI, or also persisted server-side for analytics?
4. Which lightweight browser model profile should be the first officially supported default on supported hardware?

---

## 16. Recommended implementation stance

Implement this feature only under a compatibility-first rule set:

1. ship browser text-first local mode before multimodal ambitions
2. keep the feature disabled by default
3. make unsupported-device behavior a first-class acceptance target
4. preserve the current cloud path as the canonical fallback
5. keep Typhoon OCR server-mediated and separate from local best-effort OCR
6. ship browser voice input only as short-command / short-dictation capability, not as a background assistant
7. prefer Tauri for fuller local voice support while keeping mic provider selection configurable

If a design choice improves local capability but increases risk for unsupported machines, the unsupported-machine safety rule wins.
