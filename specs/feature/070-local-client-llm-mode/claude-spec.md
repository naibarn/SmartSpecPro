# Claude Spec - 070 Local / Client LLM Mode

Date: 2026-04-04
Mode: self_review
Source files:

- `spec.md`
- `claude-research.md`
- `claude-interview.md`

## 1. Product objective

SmartSpecPro will add an optional Local / Client LLM Mode that can run lightweight AI work on the user's device when the device, tenant policy, and user settings allow it. The feature is intended to reduce cloud-token usage for selected tasks, improve responsiveness for small workloads, and support privacy-oriented preprocessing of memory/context artifacts and attachments before third-party provider submission.

This feature must be implemented under a compatibility-first rule:

- machines that are not ready for local inference must continue to behave like today's cloud/server product
- local runtime work must remain lazy, isolated, and opt-in
- unsupported-device safety takes priority over expanding local capability

## 2. Scope and rollout decisions

### 2.1 Locked v1 scope

V1 includes:

- browser text-first local execution
- short general chat on supported devices
- optional short voice-to-text dictation and short voice-command entry for chat
- summarization
- context compaction
- structured extraction / lightweight JSON shaping
- server-mediated hybrid preprocessing for attachments, OCR text, redacted variants, or compacted context packets before cloud-provider submission
- explicit model download UX
- truthful runtime badges
- desktop/Tauri support for one curated on-demand local profile
- Teams / Team Room UI parity for local-aware composer, status, runtime disclosure, room lifecycle flows, workflow panels, and run-monitor surfaces

V1 excludes:

- true device-only chat path
- default-on local routing
- production-grade local OCR for high-stakes documents
- exposed client-side OCR/provider credentials
- multimodal parity across all platforms
- always-on background microphone behavior

### 2.2 Browser decision

Browser v1 must support local text execution for eligible devices, but local general chat remains opt-in and must not silently become the default route. The product may encourage local summaries and compaction first, yet the architecture must support short-form local general chat so the runtime router, message metadata, and fallback behavior are validated end to end.

Browser may also expose a mic entry point for short dictation and short voice commands, but browser-local Gemma 4 voice remains capability-gated and must not replace the existing server-mediated STT path by default.
For Gemma 4 specifically, browser rollout should begin with a single validated E2B web profile before allowing any broader E4B rollout. Browser capability alone must not imply that every web-converted Gemma 4 profile is product-ready.

### 2.3 Desktop decision

Desktop v1 targets the existing `apps/tauri-shell` app and includes real on-demand install/remove behavior for at least one curated local profile. It must not require Docker, prebundle large assets by default, or introduce a parallel desktop app path.

Desktop is also the preferred path for fuller local voice support, including push-to-talk Gemma 4 voice input when supported, while preserving a configurable fallback to the legacy/server STT path.
For Gemma 4 specifically, desktop should anchor on an E4B primary profile with an E2B fallback profile for lower-capability machines.

### 2.4 Runtime label decision

Durable v1 runtime labels are:

- `Hybrid`
- `Cloud`

`Local` is reserved for a future device-only path where the relevant raw input does not traverse SmartSpecPro backend infrastructure before inference.

## 3. Product constraints

### 3.1 Defaults

- Tenant feature flag `localClientLlmMode` defaults to `false`.
- User preference `localAi.enabled` defaults to `false`.
- User preference `localAi.mode` defaults to `off`.
- User preference `localAi.voiceInputMode` defaults to `legacy_stt`.
- If either tenant or user enablement is absent, the system behaves like today's cloud-only flow.

### 3.2 Compatibility requirements

The feature must not:

- eagerly import heavy browser-local runtime packages on ordinary chat/settings page load
- start worker initialization when the feature is off
- trigger silent model downloads
- make cloud chat depend on local runtime readiness
- regress machines without WebGPU, secure context, sufficient storage, or tenant permission

### 3.3 Security and trust-boundary requirements

- SmartSpecPro backend remains authoritative for billing, quotas, persistent runtime labels, and policy enforcement.
- Client metadata about local execution is advisory unless validated server-side.
- Model assets must come from allowlisted or signed sources with integrity metadata.
- OCR and asset-processing backends must not fetch arbitrary user-supplied third-party URLs by default.

## 4. Platform model

### 4.1 Browser web app

Browser support is text-first and capability-gated. The system must check:

- secure context
- `navigator.gpu` / WebGPU readiness
- storage availability
- lightweight capability eligibility before any expensive initialization

Browser-local runtime code should run behind dynamic import boundaries and a worker-based execution model.

Browser voice input may reuse the existing mic surface, but local Gemma 4 audio must only activate after explicit user gesture, capability success, and profile availability. Unsupported browsers must continue to use text chat and, if enabled by user choice, the existing legacy STT path.
When local Gemma 4 voice is used, it should stay within short-clip limits and normalize audio for the selected profile instead of pretending to be a long-form transcription system.
V1 should treat Gemma 4 local voice as E2B/E4B-only, with normalized mono 16 kHz float32 audio and a clip budget of 30 seconds or less.

### 4.2 Tauri shell

Desktop support uses `apps/tauri-shell` and stores device-local state and model assets in app-local storage. Desktop should share capability, routing, and metadata contracts with web while providing stronger storage control and future room for multimodal support.

Desktop should also host the fuller local voice experience: short push-to-talk dictation, short voice commands for chat entry, and optional readback/TTS integration through a separate speech-output layer.

### 4.3 OCR and vision

- Local vision/OCR is optional and capability-gated.
- Browser MVP stays text-first.
- High-stakes document OCR defaults to backend-mediated Typhoon OCR 1.5 when enabled.
- Local LLM OCR must be labeled best-effort only.

## 5. Persistence model

### 5.1 Synced user preferences

The feature extends `users.userPreferences` with a `localAi` block for cross-device intent only.

Expected fields:

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

### 5.2 Device-local state

Download consent, installed model IDs, storage budgets, capability snapshots, runtime-health cache, and derived local artifacts must remain device-local.

Device-local state must be scoped by:

- tenant identity
- signed-in user identity
- platform/runtime namespace

Sign-out, account switch, and tenant switch must not leak consent state or derived artifacts between identities.

### 5.3 Conversation and message metadata

- Conversation-level local routing overrides should be stored in `conversations.skillSettings.localAiConversation`.
- Durable runtime badges require a new server-owned `messages.runtimeMetadata` field or equivalent side table.
- Server save paths must normalize runtime metadata so reload-safe badges and fallback reasons do not depend on transient client state.
- Team-room and workflow surfaces need a parallel durable contract, preferably a server-owned `teamRoomMessages.metadataJson.runtimeDisclosure` subdocument paired with existing `tokenUsageJson`.
- Local AI profiles must remain separate from existing team orchestration model-policy fields such as `assistantTeams.defaultModelId`, team/member `memoryPolicyJson`, and member `preferredModelId` unless a future phase explicitly extends those contracts.
- Existing executor/debug payloads in Team Room metadata must not reuse the same disclosure field name unless they are first normalized by a server-owned mapper.

## 6. Functional requirements

### 6.1 Settings and policy

The user settings surface must:

- expose Local AI enablement and execution mode
- distinguish synced preferences from device-local controls
- explain unsupported-device reasons
- allow model removal and cache clearing
- respect tenant-level force-cloud-only and profile allowlist policy

Tenant/admin capability in v1 must include:

- kill switch
- force-cloud-only override
- local profile allowlist
- ability to disable local vision/OCR or document OCR routing independently

### 6.1.1 Voice input settings

The settings surface should also expose:

- mic provider mode:
  - `legacy_stt`
  - `gemma4_local`
  - `auto`
- voice command enablement
- optional voice readback mode as a separate concern from ASR/local LLM mode

The UI must explain that Gemma 4 local voice is capability-gated and may become trustworthy on desktop before the web path is general-rollout ready.
The UI must also distinguish the privacy/consent semantics of:

- `legacy_stt`, where audio may traverse SmartSpecPro backend and third-party STT providers
- `gemma4_local`, where audio is intended for local-device processing
- `auto`, where unsupported cases may fall back to the legacy/server STT path

### 6.2 Local model catalog

Local profiles must be served from a dedicated catalog boundary and must not be merged into generic cloud model pickers by default. The catalog must support:

- curated profiles
- allowlist / denylist enforcement
- integrity metadata
- runtime requirement metadata such as minimum WebGPU limits/features for browser-local profiles
- exact Gemma 4 variant and modality flags, including whether native audio input is supported
- rollout maturity flags such as `validated` versus `experimental`
- revocation and supersession

### 6.3 Capability detector

The capability detector needs:

- a cheap first pass safe on every device
- a deeper optional pass for runtime readiness
- a typed result contract used by both UI and router
- browser deep readiness must verify more than `navigator.gpu`, including adapter/device acquisition and profile-specific WebGPU requirements

### 6.4 Runtime router

The runtime router combines:

- tenant policy
- user preferences
- conversation override
- capability readiness
- model availability
- task class
- runtime health

Recommended local-first tasks:

- short general chat
- summarization
- context compaction
- structured extraction
- short voice dictation converted into normal chat input
- short voice-command transcription before existing action/tool routing
- redaction / scrubbing
- OCR cleanup after backend OCR

Recommended cloud-first tasks:

- long reasoning
- large code generation
- multi-step tool orchestration
- document-grade OCR
- high-risk finance or legal extraction

### 6.5 Chat UX

The current chat experience remains the base UX. New behavior:

- durable runtime badge per answer
- retry with cloud
- conversation-level local override
- graceful fallback without message loss
- server-owned runtime metadata surviving reload

The existing mic entry point should become provider-selectable rather than hardcoded to one external STT path. In v1:

- `legacy_stt` remains the safe default
- `legacy_stt` for chat should map to the current push-to-talk composer transcription path rather than a new or ambiguous legacy voice stack
- `gemma4_local` may be offered when the device/profile supports local audio
- `auto` prefers local only when capability, policy, and installation state allow it
- short transcribed speech should feed the same chat/tool pipeline as typed text
- allowlisted no-side-effect route intents such as opening `/chat`, `/teams`, or `/notifications` may execute client-side
- side-effectful intents such as reminders, notifications, OCR/workflow actions, or other existing writes must still go through existing server validation, permissions, and confirmation flows
- unsupported or unmapped voice intents should fall back to normal chat text rather than inventing a direct action path
- explicit `gemma4_local` mode must not silently fall through to third-party STT without clear user-facing consent or confirmation

### 6.6 Memory, context, and compaction integration

Local AI must integrate with the existing server-owned memory system rather than creating a second context pipeline.

Required rules:

- `memory.getChatContext`, `buildChatContext`, and `contextToMessages` remain canonical context assembly paths for chat.
- `processConversationMemory`, `checkSummarization`, and manual compaction flows remain canonical persistence paths for summaries, extracted facts, and compacted history.
- Local/browser execution may assist with interactive summarization, compaction, or redaction only as an optional accelerator on supported devices.
- Server-side memory maintenance remains required for unsupported devices, API callers, widgets, channel gateways, background jobs, and team-run orchestration.
- Any locally produced summary, compacted context packet, or extracted fact that will be stored server-side must pass through server validation before persistence.
- Local preprocessing in v1 must not silently rewrite the primary control text used for chat/team routing, team-run objectives, agency/swarm requests, or workflow execution fields.

### 6.7 Teams / Team Room parity

The feature must also cover collaborative UI surfaces under `/teams`, not only `/chat`.

Required behavior:

- `Teams.tsx`, `TeamRoomView.tsx`, `RoomWorkflowPanel.tsx`, `RunMonitorPanel`, room-creation flows, room switching, and member-management dialogs must remain fully usable when Local AI is disabled or unsupported.
- Team-room composer features may use local preprocessing for human-authored room messages, compacted drafts, workflow comments, room-objective draft suggestions, or other explicit drafting actions on supported devices, but only as user-invoked helpers.
- Server-orchestrated assistant turns in Team Rooms remain cloud/server-authoritative in v1 unless a separate device-only or hybrid execution path is explicitly implemented.
- Team-room runtime/source disclosure must use server-owned metadata, not client-only claims.
- Team-room local features must not bypass existing room redaction, summary-view, or work-item safety rules.
- Any client advisory data for Team Room must travel in a dedicated server-validated field such as `localAiAdvisory`; clients must not write `metadataJson.runtimeDisclosure` directly.
- Team-room local features must not silently replace the final submitted text for room messages, workflow comments, room goals, or any other orchestration-control field.
- `RunMonitorPanel` should show runtime/source disclosure only when backed by a dedicated server-owned run-event or run-summary contract; otherwise it should omit the badge in v1.
- Room lifecycle procedures such as create, list, view, mark-viewed, and message history fetch must remain cloud-stable and must not require a ready local runtime.
- Team and member model-policy fields continue to mean server/orchestrator model selection in v1; the local profile catalog must not silently populate those selectors.
- Local assist entry points on `/teams` must be explicit user actions and must remain lazy so ordinary team browsing does not initialize workers or downloads.

### 6.8 Download and lifecycle

The feature must support these lifecycle states:

- `not_supported`
- `disabled`
- `ready_to_download`
- `downloading`
- `preparing`
- `ready`
- `running`
- `fallback_to_cloud`
- `error`

Cloud chat must remain usable even when download or warm-up fails.

## 7. Architecture requirements

The implementation extends existing SmartSpecPro systems rather than adding a separate chat stack.

Primary layers:

- capability detector
- runtime router
- local model registry / catalog
- browser runtime adapter
- Tauri runtime adapter
- local pre/post processor
- runtime metadata validator
- profile revocation and cache invalidation manager

Recommended code organization:

```text
apps/web/client/src/features/local-ai/
  adapters/
  components/
  hooks/
  model-registry/
  routing/
  state/
  types/
  workers/

packages/local-ai-core/
  capability/
  routing/
  runtime-types/
  structured-output/
```

## 8. Testing and acceptance expectations

Implementation is incomplete without tests for:

- backward-compatible preference reads and writes
- tenant flag validation and force-cloud-only policy
- capability gating on unsupported browser devices
- no eager runtime import when the feature is off
- runtime metadata validation and durable badge persistence
- conversation override persistence
- sign-out / tenant-switch device-local isolation
- model-catalog revocation behavior
- OCR/asset ingress safety rules
- mic provider selection and browser/Tauri voice fallback behavior
- `/teams` list/detail/workflow surfaces remaining usable on unsupported devices
- Team orchestration model selectors staying separate from the Local AI profile catalog
- Team Room disclosure fields not colliding with existing executor/debug metadata

## 9. Success criteria

The feature is ready for implementation when the system can:

- stay cloud-stable on unsupported devices
- run browser-local text tasks on supported, opted-in devices
- support short voice dictation and short voice commands without regressing text chat or unsupported machines
- expose truthful `Hybrid` or `Cloud` badges
- preserve server-authoritative metadata and billing behavior
- manage desktop-local model assets in the existing Tauri shell
- keep legacy STT available while adding a fuller local-voice path for Tauri
- route document-grade OCR through backend-mediated Typhoon OCR instead of claiming local OCR reliability
