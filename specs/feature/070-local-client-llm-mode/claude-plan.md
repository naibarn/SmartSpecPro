# Local / Client LLM Mode Implementation Plan

## 1. Goal

Implement a compatibility-first Local / Client LLM Mode for SmartSpecPro that adds browser and Tauri text-local execution for selected workloads without regressing the existing cloud/server chat path.

The finished system should let supported, opted-in users run lightweight local tasks such as short general chat, summarization, context compaction, structured extraction, and local preprocessing of memory/context artifacts, while every unsupported or policy-disabled environment continues to work like today's cloud flow.

## 2. Locked planning assumptions

This plan follows the synthesized spec and interview decisions:

- rollout is disabled by default for tenants and users
- browser v1 is text-first, but not preprocessing-only; it includes short general chat on supported devices
- durable v1 chat badges are `Hybrid` and `Cloud`
- true device-only `Local` chat is out of scope for v1
- Gemma 4 is the anchored local-model family for this rollout instead of a generic open-model marketplace
- browser-local Gemma 4 starts with `gemma4-e2b-web-fast`; `gemma4-e4b-web-balanced` is a later allowlisted addition only after runtime validation and telemetry review
- Gemma 4 26B / 31B profiles are excluded from browser-local v1
- desktop v1 uses the existing `apps/tauri-shell` app and includes real on-demand download/remove UX for one curated local profile
- desktop/Tauri should treat `gemma4-e4b-tauri-balanced` as the primary profile and `gemma4-e2b-tauri-fast` as the fallback profile
- document OCR remains backend-mediated, with Typhoon OCR as the preferred document-grade provider path

## 3. Design principles

- Additive, not replacement: the current cloud chat stack remains canonical.
- Lazy by default: local runtime packages, downloads, and workers appear only after feature enablement and capability eligibility.
- Truthful metadata: client claims never become authoritative billing, audit, or privacy records on their own.
- Clear persistence boundaries: synced user intent lives on the server; install/cache/runtime state lives per device.
- Control-plane safety: local assist may optimize memory/context artifacts or produce optional user-facing drafts, but it must not silently rewrite routing or orchestration inputs.
- Compatibility-first rollout: unsupported-device behavior is a first-class requirement, not an edge case.

## 4. Current architecture and why it matters

SmartSpecPro already has the essential surfaces needed for this work:

- `apps/web/server/routers/users.ts` manages synced user preferences
- `apps/web/shared/featureFlags.ts` and tenant flag services gate rollout behavior
- `apps/web/server/routers/chat.ts` and `apps/web/server/_core/llmRoutes.ts` persist conversations and stream assistant messages
- `apps/web/server/routers/memory.ts` and `apps/web/server/services/memoryService.ts` assemble context, compact history, and run post-turn memory maintenance
- `conversations.skillSettings` already carries conversation-scoped model-selection state
- `apps/web/client/src/pages/Settings.tsx` and `apps/web/client/src/pages/Chat.tsx` provide the primary user-facing integration points
- `apps/web/client/src/pages/Teams.tsx`, `apps/web/client/src/components/orchestrator/TeamRoomView.tsx`, `apps/web/client/src/components/orchestrator/RoomWorkflowPanel.tsx`, and `apps/web/client/src/components/orchestrator/RunMonitorPanel.tsx` provide the collaborative UI surfaces that also need parity
- `apps/web/server/routers/teamRoom.ts`, `apps/web/server/services/promptComposer.ts`, `apps/web/server/services/executors/contextBuilder.ts`, and `apps/web/server/services/roomService.ts` already form a second context-and-message pipeline for Team Rooms
- `apps/web/server/services/teamService.ts` plus `assistantTeams.defaultModelId`, `assistantProfiles.preferredModelId`, and team/member `memoryPolicyJson` already define server-side orchestration policy that Local AI must not silently repurpose in v1
- `apps/tauri-shell` already exists and exposes filesystem/dialog capabilities suitable for app-local storage

The important consequence is that the local-AI work should extend these surfaces instead of creating a second chat architecture. The main architectural changes are new contracts, new routing decisions, one durable message metadata surface, and new client adapters.

## 5. Shared contracts and persistence changes

This phase establishes the data boundaries that every later phase relies on.

### 5.1 User preference contract

Extend `users.userPreferences` in `apps/web/drizzle/schema.ts` to include a `localAi` object with safe defaults. `apps/web/server/routers/users.ts` must validate partial updates without requiring older clients to send the new block.

Recommended type shape:

```ts
type LocalAiPreferences = {
  enabled: boolean;
  mode: "off" | "auto" | "prefer_local" | "local_only" | "cloud_only";
  defaultModelId: string | null;
  useForGeneralChat: boolean;
  useForSummaries: boolean;
  useForImageTasks: boolean;
  useForOcrCleanup: boolean;
  documentOcrProvider: "typhoon_ocr_1_5" | "disabled";
  fallbackPolicy: "cloud_on_failure" | "fail_request";
  showRuntimeBadge: boolean;
};
```

This data is server-synced and intentionally limited to cross-device intent. It must not contain download consent, storage budgets, install state, or runtime-health cache.

Migration note:

- no new table is required for synced preferences in v1
- the work is a schema/type extension plus router validation/default shaping
- older rows without `localAi` must continue to deserialize safely

### 5.2 Device-local state contract

Define a client-side state shape inside the new local-AI feature area for:

- download consent
- Wi-Fi-only preference where supported
- storage budget
- consented/installed model IDs
- last capability check
- derived local artifact retention

The browser implementation can split this between IndexedDB and a thin `localStorage` key for cheap flags, but every key must be namespaced by tenant and signed-in user. The Tauri implementation should persist the same logical state under app-local storage.

The sign-out and tenant-switch behavior must be explicit:

- clear or logically hide consent/history-derived device-local state when identity scope changes
- allow model blobs to remain physically present only if the new scope cannot see them as installed or reusable until revalidation under the new tenant/user scope
- include derived local text artifacts in clear-cache behavior
- browser sign-out should default to hiding install visibility and requiring re-authorization before any cached bundle is considered usable again

### 5.3 Tenant policy contract

Add `localClientLlmMode` to the typed tenant-flag system, including:

- `TenantFeatureFlags`
- `ALLOWED_FEATURE_FLAGS`
- `FEATURE_FLAG_DEFAULTS`
- tenant feature-flag validation
- tenant admin editing/readback surfaces

Add optional policy fields for:

- force-cloud-only behavior
- local profile allowlist
- disable local vision/OCR
- disable document OCR provider usage

These values should resolve through the same server-side feature-flag services that current tenant policy uses, so client logic consumes one authoritative runtime-policy object.

### 5.4 Conversation override contract

Store conversation-scoped override state in `conversations.skillSettings.localAiConversation`. The server update path in `apps/web/server/routers/chat.ts` must validate only this namespaced subdocument and merge it additively with existing `llmSelection` and other conversation settings.

Recommended shape:

```ts
type LocalAiConversationOverride = {
  modeOverride: "prefer_local" | "cloud_only" | null;
  disableLocal: boolean;
  updatedAt: string;
};
```

### 5.5 Durable runtime metadata

Add `messages.runtimeMetadata` as a nullable server-owned JSON column, or an equivalent side table if the team prefers keeping `messages` slimmer. A nullable JSON column is the simpler v1 path and supports backward-compatible reads.

Recommended shape:

```ts
type MessageRuntimeMetadata = {
  source: "hybrid" | "cloud";
  localProfileId: string | null;
  resolvedCloudModelId: string | null;
  resolvedProviderName: string | null;
  fallbackReason: string | null;
  selectionMode: "off" | "auto" | "prefer_local" | "local_only" | "cloud_only";
  validatedByServer: true;
  tokenSavedEstimate: number;
};
```

Migration strategy:

- add the new column as nullable
- default existing rows to `null`
- keep current `modelUsed` behavior untouched for compatibility
- update read models so missing `runtimeMetadata` implies legacy cloud behavior

### 5.6 Team-room runtime disclosure

Teams and Team Room UI need a durable runtime contract parallel to chat history. Reuse the existing `team_room_messages` JSON surfaces instead of forcing a first-pass table redesign:

- keep `tokenUsageJson` for usage numbers
- extend `metadataJson` with a typed `runtimeDisclosure` subdocument for source badge, local profile, resolved model, provider, and fallback reason

Recommended shape:

```ts
type TeamRoomRuntimeMetadata = {
  source: "hybrid" | "cloud";
  localProfileId: string | null;
  resolvedModelId: string | null;
  resolvedProviderName: string | null;
  fallbackReason: string | null;
  validatedByServer: true;
};
```

This disclosure data is needed so Team Room history and workflow comments can render truthful runtime/source information after reload.

Important naming boundary:

- reserve `metadataJson.runtimeDisclosure` for server-owned UI/audit disclosure
- keep executor- or run-engine-specific raw metadata in a separate key such as `metadataJson.executorRuntimeMetadata`, or normalize it before persistence
- do not treat existing arbitrary `runtimeMetadata` payloads as trusted disclosure without a server-owned mapper

### 5.7 Team orchestration policy boundary

Keep Local AI profiles separate from team orchestration policy fields that already exist in the database and services:

- `assistantTeams.defaultModelId`
- `assistantTeams.memoryPolicyJson`
- `assistantProfiles.preferredModelId`
- `assistantProfiles.modelSelectionPolicy`
- `assistantProfiles.memoryPolicyJson`

In v1 these fields continue to mean server/cloud-orchestrated model and memory policy. The dedicated Local AI catalog must not silently populate or overwrite these selectors, because doing so would blur human interactive assist with server-run team execution.

## 6. Server-side policy, catalog, and metadata plumbing

This phase keeps the server authoritative while making local-AI decisions understandable to the client.

### 6.0 Authenticated API surfaces

Add a dedicated Local AI server surface through authenticated tRPC procedures or equivalent server-owned endpoints. The exact procedure names may vary, but the plan needs these contracts:

- `localAi.getPolicyAndCatalog`
  - returns tenant-filtered rollout policy plus curated local profiles
- `localAi.recordCapabilitySnapshot`
  - optional, stores or logs advisory device capability information only when explicitly needed
- `chat.updateLocalAiConversation`
  - updates only `conversations.skillSettings.localAiConversation`
- existing assistant save paths
  - accept optional advisory runtime metadata and persist only the server-validated result

Authorization rules:

- user-scoped procedures must derive tenant and user identity from the authenticated session, not client-supplied IDs
- conversation override updates must reuse existing conversation ownership/membership checks
- tenant policy editing remains behind the existing tenant-admin authorization path
- no client should be allowed to widen its own local-model allowlist or bypass force-cloud-only policy

### 6.1 Dedicated local model catalog

Create a server-owned local-model catalog endpoint rather than extending `trpc.llmProviders.availableModels`. This catalog should live alongside existing runtime-config or model-registry services, but remain separate so cloud-only pickers do not accidentally inherit local profiles.

The catalog should expose:

- curated profile IDs
- display names and family metadata
- exact Gemma 4 variant such as `E2B` or `E4B`
- supported platforms
- runtime family such as `mediapipe-webgpu` or `tauri-local`
- minimum runtime requirements such as required WebGPU limits/features when the profile is browser-local
- modality flags, including whether the profile supports Gemma 4 native audio input
- short-audio contract metadata such as maximum supported clip length and expected normalized audio format
- download requirement and approximate size
- integrity manifest version and checksum
- allowlisted / denied / revoked status
- rollout maturity such as `validated`, `experimental`, or `disabled`

This catalog must be filtered by tenant policy before reaching the client.

It must also remain separate from the team-management model fields already used by orchestration:

- `assistantTeams.defaultModelId`
- member `preferredModelId`
- team/member `modelSelectionPolicy` flows

Those selectors continue to represent server-run model choices in v1.

Catalog refresh and revocation behavior should be explicit:

- refresh catalog/policy when the Local AI settings panel opens
- refresh before install attempts
- refresh at app start for Tauri if a local profile is already installed
- if a selected or installed profile is now revoked, mark it unusable immediately and route cloud until the user removes it or installs a replacement

The first curated Gemma 4 profile set should be explicit:

- browser candidate profile 1: `gemma4-e2b-web-fast`
- browser candidate profile 2: `gemma4-e4b-web-balanced` only after successful E2B rollout review
- desktop primary profile: `gemma4-e4b-tauri-balanced`
- desktop fallback profile: `gemma4-e2b-tauri-fast`

Planning constraint:

- browser must not auto-expose every web-converted Gemma 4 variant that exists upstream; only SmartSpecPro-validated profiles become selectable
- Gemma 4 audio input is considered in scope only for E2B/E4B profiles
- browser-local voice remains unavailable if the shipped build does not yet include the approved Gemma 4 web runtime and model bundle path, even on theoretically capable hardware

### 6.2 Capability and routing contracts

Create shared runtime types under `packages/local-ai-core` for:

- capability results
- runtime decision envelopes
- runtime metadata
- task classes
- voice input modes
- voice command intent envelopes

These shared types should be imported by both server and client routing code so the same vocabulary is used in capability UI, routing logs, and persisted message metadata.

Voice-specific contracts should include:

- `voiceInputMode`: `legacy_stt`, `gemma4_local`, `auto`
- short voice task classes such as `voice_dictation` and `voice_command`
- allowlisted in-app route intents
- server-validated action intents that still require existing mutation paths after transcription
- Gemma 4 audio capability metadata:
  - `supportsAudioInput`
  - `maxClipSeconds`
  - `expectedAudioFormat`
  - `profileValidatedForBrowserVoice`

### 6.3 Runtime metadata validator

Add a server helper, likely under `apps/web/server/services/`, that accepts:

- user prefs
- tenant policy
- optional client advisory metadata
- resolved provider/model data
- fallback outcome

and produces the authoritative `MessageRuntimeMetadata` object for persistence and SSE emission.

This helper must enforce:

- no durable `Local` label in v1
- no billing or entitlement decisions from raw client token-saved estimates
- no persistence of unvalidated privacy claims
- stable field names across streaming and non-streaming save paths

### 6.4 Chat route integration

Update the chat save/stream flow so both `saveAssistantMessage` and the SSE `message_saved` path use the same runtime metadata validator. The implementation should either call a shared helper from both paths or funnel both through one authoritative write method.

The saved metadata must survive reload so `ChatView` can render server-owned runtime badges from persisted state rather than from transient client memory.

Validation rules at this boundary:

- reject unknown runtime metadata keys from clients
- clamp `source` to the server-supported v1 values: `hybrid` or `cloud`
- overwrite client-provided provider/model fields with server-resolved values
- treat missing or malformed advisory metadata as non-fatal and continue with cloud-safe defaults

The chat integration must also treat voice input as an alternate entry point into the same chat pipeline rather than a second chat system. That means:

- the existing Chat mic surface should become provider-selectable instead of external-STT-only
- in v1 chat, `legacy_stt` should wrap the existing `usePushToTalk` composer path rather than the separate realtime voice-session flow
- short dictation should resolve into ordinary composer text
- short voice commands should resolve into either composer text or a small allowlisted action intent
- side-effectful intents in v1 should be limited to flows that already exist and are clearly owned in the current product, such as reminders, notifications, and existing OCR/workflow actions
- no voice path may bypass the canonical server routing and persistence rules once text/action submission occurs
- unknown or unsupported command intents should fall back to normal chat text rather than speculative direct actions
- explicit `gemma4_local` mode must not silently fall through to third-party STT providers; only `auto` may do that with clear disclosure
- v1 `gemma4_local` voice should target Gemma 4 E2B/E4B only and normalize audio into mono 16 kHz float32 before inference
- voice routing must remain disabled for any profile that does not explicitly advertise Gemma 4 native audio support

### 6.5 Memory, context, and compaction integration

The local-AI rollout cannot stop at message routing because SmartSpecPro chat quality depends heavily on the existing memory pipeline. Integrate Local AI with the following surfaces:

- `memory.getChatContext`
- `buildChatContext` / `contextToMessages`
- `processConversationMemory`
- `checkSummarization`
- `compactConversation`
- `MemoryPanel` and conversation `memoryMode`

Rules for this integration:

- Server-side memory assembly remains canonical for unsupported devices and all non-browser callers such as widgets, API consumers, channel gateway traffic, background maintenance, and team-run orchestration.
- Browser/Tauri local execution may help with interactive summarization, compaction, redaction, or JSON cleanup only when the user is present on a supported device.
- A locally produced summary or extracted fact is advisory until the server validates and stores it.
- Local preprocessing in this section is for memory/context artifacts only; it must not silently rewrite control text used for routing or orchestration such as route hints, agency/swarm primary messages, run objectives, or workflow execution inputs.
- Local AI must never bypass existing context-budget enforcement, memory-mode behavior, or memory safety filters.
- If local summarization or compaction is unavailable, the memory pipeline must continue to use the existing server summarization path with no user-visible breakage.

### 6.6 Collaborative surface API and policy parity

Add a Local AI awareness layer for Team Room and workflow surfaces:

- authenticated Team Room message/read paths should be able to return persisted runtime disclosure for room messages
- Team Room mutations may accept, at most, a dedicated `localAiAdvisory` payload for user-authored messages
- no client may mark a server-orchestrated team-run assistant turn as `hybrid` or `local` without a server-authoritative execution path
- room-level policy reads should reuse the same tenant/user Local AI resolution used by chat
- Team Room lifecycle reads and writes such as `create`, `listByTeam`, `getMessages`, `viewerState`, and `markViewed` must remain fully functional when Local AI is disabled or unsupported
- Team-service model and memory policy reads remain cloud/orchestrator policy inputs and are not rewritten from Local AI profile choices
- clients must not send `metadataJson.runtimeDisclosure`, `intentRoute`, or other server-owned Team Room metadata fields directly

## 7. Client feature area and settings integration

This phase introduces the visible Local AI controls without activating heavy runtime behavior for normal users.

### 7.1 Feature module structure

Create a new feature area:

```text
apps/web/client/src/features/local-ai/
  adapters/
  components/
  hooks/
  model-registry/
  routing/
  state/
  types/
  voice/
  workers/
```

Keep capability, routing, and state code in this area rather than scattering browser-local logic through `Chat.tsx` and `Settings.tsx`.

Voice-specific ownership should be explicit rather than implicit. Add modules such as:

- `apps/web/client/src/features/local-ai/voice/chatMicProvider.ts`
- `apps/web/client/src/features/local-ai/voice/voiceCommandRouter.ts`
- `apps/web/client/src/features/local-ai/voice/voiceActionRegistry.ts`
- `apps/web/server/services/voiceActionResolver.ts`

These modules should own provider selection, allowlisted route mapping, and the boundary between direct client-safe navigation versus server-validated side effects.

### 7.2 Settings UI

Extend `apps/web/client/src/pages/Settings.tsx` so Local AI settings clearly separate:

- synced account-wide preferences
- device-local download/storage state
- voice input provider preferences

The page should be able to show these states:

- feature disabled by tenant policy
- unsupported on this device
- ready to download
- downloading / preparing
- ready
- error with actionable retry

The settings page must never trigger worker initialization or package import simply because the page was opened.

Voice-specific settings should include:

- mic provider mode:
  - `legacy_stt`
  - `gemma4_local`
  - `auto`
- voice command enablement
- optional voice readback preference kept separate from ASR/local-LLM routing

The initial browser-safe default should remain `legacy_stt` unless the user explicitly changes it.

Consent/disclosure expectations:

- `legacy_stt` should reuse the existing audio-to-server / third-party STT disclosure model
- `gemma4_local` should disclose local-device processing semantics
- `auto` should disclose that unsupported cases can fall back to the legacy/server STT path

### 7.3 User preference queries and mutations

Extend the existing preference query/mutation contract so older clients remain compatible. Input validation should accept missing `localAi`, and response shaping should supply defaults when the block is absent.

### 7.4 Conversation override UI

Add small chat-surface controls for:

- use local first for this conversation
- disable local for this conversation
- retry with cloud

The controls should update `conversations.skillSettings.localAiConversation` through a server-owned mutation, not through client-only state.

### 7.5 Teams, Team Room, and workflow UI parity

The collaborative UI under `/teams` should expose Local AI safely and truthfully without implying that server-side orchestration moved onto the device.

Add parity behavior for:

- `Teams.tsx`
- `TeamRoomView.tsx`
- `RoomWorkflowPanel.tsx`
- `RunMonitorPanel.tsx`
- team list/detail panes, room switching, and room creation dialogs
- team member/persona management dialogs where users author prompts or instructions
- run-monitor or room-detail panels that show generated work or statuses

Expected behavior:

- human-authored Team Room composer flows may use local preprocessing on supported devices for compaction, redaction, and explicit draft helpers for work-item or instruction editing, but they must not silently rewrite final submitted control text
- server-orchestrated assistant turns remain cloud/server-authoritative in v1
- any runtime badge shown in Team Room history comes from persisted server-owned metadata
- `RunMonitorPanel` may show runtime/source disclosure only when backed by a dedicated server-owned run-event or run-summary contract; otherwise it should omit that badge in v1
- unsupported devices see the existing Teams UX unchanged, with no local runtime startup or broken controls
- ordinary team browsing, search, archive, room switching, member editing, and run monitoring must not trigger worker startup or model download
- local profile choices must not leak into team default-model or member preferred-model pickers in v1
- if a Team Room mic surface is added later, it should reuse the same provider-selection and fallback vocabulary as chat instead of inventing a parallel voice stack

## 8. Browser capability detection, download lifecycle, and runtime adapter

This phase is the core of the browser MVP and must preserve page-load safety.

### 8.1 Capability detector

Implement a two-stage browser capability detector:

- cheap pass:
  - feature flag enabled?
  - user enabled?
  - secure context?
  - `navigator.gpu` present?
- deeper pass:
  - `requestAdapter()` / adapter acquisition
  - `requestDevice()` / device creation
  - profile-specific WebGPU limits/features validation
  - storage estimation
  - eligible profile availability
  - worker-side runtime-health checks after explicit user action

The cheap pass can run inside normal UI flow. The deeper pass should be deferred until the user opens Local AI settings, requests install, or starts a local-eligible action.

### 8.2 Download manager

The browser adapter needs a user-facing download manager that can:

- request consent
- show approximate size before download
- fetch from the allowlisted asset origin
- validate manifest metadata before marking install as complete
- store/remove cached assets
- surface storage-full and network failure states without breaking cloud chat

The implementation should keep manifest metadata separate from model blob state so revoked or superseded profiles can be invalidated later.

Failure-state rules:

- partial downloads must remain non-routable and never set the installed flag
- checksum or size failures must move the profile into a quarantined or invalid state until explicit repair/remove
- temporary fragments should be cleaned up or isolated so later routing cannot mistake them for a usable install

Concurrency rules:

- only one install, remove, or integrity-repair action should run per `tenant + user + profile` scope at a time
- multi-tab browser sessions should coordinate through a device-local lock or leader-election helper so duplicate downloads do not race
- if a second tab observes an active install, it should subscribe to progress state instead of starting a second fetch

### 8.3 Worker-based runtime adapter

Implement browser-local inference behind a worker boundary, likely in `features/local-ai/workers/local-llm.worker.ts`, so model initialization and inference do not block the main UI thread.

The browser adapter should expose a narrow interface such as:

```ts
type BrowserLocalRuntimeAdapter = {
  prepare(profileId: string): Promise<RuntimePreparationResult>;
  run(request: LocalRuntimeRequest): Promise<LocalRuntimeResponse>;
  dispose(): Promise<void>;
};
```

Heavy browser-local dependencies such as MediaPipe or task runtime libraries must be dynamically imported only inside this adapter or its worker bootstrap.

WebGPU-specific guardrails:

- Browser-local v1 should not offer a silent CPU fallback when a profile requires WebGPU; unsupported or degraded WebGPU environments should route cloud instead.
- The worker bootstrap must verify that WebGPU is actually usable in the execution context it runs in rather than trusting only the main-thread probe.
- Profile preparation should fail fast when browser/device limits do not satisfy the selected profile's declared minimum requirements.

### 8.4 Runtime health and fallback

Browser-local failures must produce explicit reasons like:

- `webgpu_unavailable`
- `webgpu_adapter_unavailable`
- `webgpu_device_init_failed`
- `webgpu_profile_requirements_not_met`
- `model_not_installed`
- `asset_integrity_failed`
- `worker_init_failed`
- `runtime_device_lost`
- `runtime_timeout`

The router uses these reasons to:

- decide cloud fallback when allowed
- write `fallbackReason` into runtime metadata
- render actionable UI

For `local_only`, the router must fail just the affected request with a clear explanation and preserve the unsent draft or conversation state for retry.

### 8.5 Browser voice input extension

Browser voice support should be limited to the parts that are immediately compatible and useful:

- short push-to-talk dictation
- short voice commands that resolve into ordinary chat text or allowlisted in-app route intents
- provider selection between `legacy_stt`, `gemma4_local`, and `auto`

Implementation rules:

- microphone permission must be requested only from explicit user interaction
- browser-local Gemma 4 voice must remain opt-in and capability-gated
- browser-local Gemma 4 voice should ship only for a specifically validated web profile, starting with `gemma4-e2b-web-fast`
- `gemma4-e4b-web-balanced` should remain behind allowlist or experimentation gates until SmartSpecPro validates startup time, memory pressure, and short-voice reliability on supported browsers
- the browser-local voice path should normalize audio into the format expected by the selected local profile before inference
- the browser-local Gemma 4 voice path should normalize to mono 16 kHz float32 data and cap v1 clips at 30 seconds or less
- the browser-local Gemma 4 voice path should stay within short-clip limits rather than pretending to be a general long-form transcription system
- long-form transcription, background listening, or always-on hot-mic behavior are out of scope
- `legacy_stt` should converge on the existing chat push-to-talk path for v1; the separate realtime voice-session stack is not the canonical chat mic implementation in this rollout
- if the local voice path is unavailable and mode is `auto`, the request should fall back to the existing server-mediated STT path without breaking text chat
- if the local voice path is explicitly selected and unavailable, the UI should explain why and leave the text composer usable rather than silently using third-party STT
- if the SmartSpecPro web build lacks the approved Gemma 4 browser runtime dependency or bundle pipeline, the capability layer must mark `gemma4_local` unavailable even when WebGPU probing passes

Safety rules:

- only a small allowlisted set of first-party route intents may execute directly from the client
- arbitrary external navigation is not allowed from voice commands
- actions that create reminders, send notifications, invoke existing OCR/workflow actions, or target other users must still go through existing server mutations and confirmation flows
- unknown or unsupported actions should fall back to normal chat text rather than speculative direct execution

## 9. Tauri support

Tauri support should mirror web semantics while taking advantage of stronger local storage.

### 9.1 Shared router, separate adapter

Reuse the same task classification, tenant policy, and runtime metadata contracts as web. The Tauri-specific work belongs in a dedicated adapter layer that handles:

- app-local storage paths
- install/remove lifecycle
- capability reporting for desktop-local runtime
- future runtime family upgrades

### 9.2 Real v1 desktop download UX

Desktop v1 must include real install/remove behavior for one curated profile. The flow should:

- show required disk space before install
- write assets under app-local data
- support removal from settings
- keep consent and install visibility scoped per account/tenant

Gemma 4 profile decision for desktop:

- primary shipped desktop profile: `gemma4-e4b-tauri-balanced`
- secondary fallback profile for lower-capability devices: `gemma4-e2b-tauri-fast`
- no 26B / 31B desktop profile is required for v1

The desktop rollout should not assume that every machine is more capable than the browser path; capability and policy still decide whether the local route is used.

Desktop-specific failure handling should include:

- insufficient disk space
- missing filesystem permission for the chosen app-local directory
- interrupted install cleanup
- revoked profile detection on next startup before reuse

### 9.3 Desktop local voice path

Tauri is the preferred environment for the fuller local voice experience. The desktop adapter should support:

- short push-to-talk dictation with Gemma 4 local audio when the selected E2B/E4B profile supports it
- short voice commands that feed the same chat/tool/action pipeline as typed text
- configurable fallback to the legacy/server STT path
- optional voice-response readback through a separate TTS/output layer without coupling TTS to Gemma 4 itself

Desktop voice rules:

- keep the same `voiceInputMode` vocabulary as the web path
- request microphone permission only on explicit user interaction
- normalize captured audio into mono 16 kHz float32 before local inference
- preserve text-chat usability when local voice init fails
- keep side-effectful actions behind the same server validation and authorization checks used for typed commands

### 9.4 Future-proofing for multimodal work

The Tauri adapter should be structured so image or audio support can be added later without changing the routing vocabulary. That means the adapter contract should already accept task modality metadata even if v1 uses text-only execution outside the scoped short-voice path above.

## 10. Teams and Team Room execution parity

Team Room is a separate prompting and persistence path from ordinary chat, so it needs explicit Local AI rules rather than informal reuse.

### 10.0 Team settings and lifecycle boundaries

`Teams.tsx` is broader than a room transcript. The plan must preserve:

- team list and detail browsing
- room creation and room switching
- team archive and management dialogs
- member/persona editing
- run monitoring and workflow panels
- unread/viewer-state behaviors

In v1, none of these lifecycle surfaces should require Local AI readiness to render, query, mutate, or recover from errors.

### 10.1 Prompt composer and room history

`promptComposer.ts` and `buildTeamContext` already manage:

- adaptive budget profiles
- scoped memory retrieval
- entity-memory injection
- rolling history compression

The Local AI plan must preserve those behaviors. In v1:

- local execution should not replace server-side `composePrompt` for orchestrated assistant turns
- local preprocessing may help human-authored room messages, notes, or editable instruction drafts only as an explicit user-invoked helper before submission
- history compression and prompt assembly for team runs remain canonical server behavior

### 10.2 Room message persistence and badges

Extend Team Room persistence so:

- `team_room_messages.metadataJson.runtimeDisclosure` stores server-owned runtime/source info
- `tokenUsageJson` continues to hold token/model usage data
- `TeamRoomView` can render truthful runtime disclosure after reload
- executor- or run-engine-specific debug metadata must remain in a separate namespaced key and must not be confused with UI disclosure

### 10.3 Workflow and work-item interactions

Local AI may assist the user in drafting:

- work-item titles
- follow-up comments
- revision requests
- approval notes
- room-goal draft suggestions shown for explicit user confirmation before save
- editable team/member instruction drafts before save

but any persisted workflow comment or room message must still pass through:

- `roomService` sanitization and summary projection
- work-item permission checks
- server-owned runtime metadata validation
- existing intent routing and room-message classification based on the final submitted text
- a dedicated `localAiAdvisory` input path rather than free-form client `metadataJson`

and the client must not:

- silently replace the final submitted text for workflow comments, room goals, or room messages with a local rewrite
- transform run objectives, agency/swarm primary messages, or routing-control fields implicitly as part of local preprocessing

### 10.4 Non-regression boundary

The `/teams` experience must remain fully operational when:

- Local AI is disabled
- the device is unsupported
- a local adapter fails to initialize
- a selected local profile is revoked

No Team Room message send, run control, or workflow panel should depend on local runtime readiness to stay functional.

### 10.5 Team-model policy separation

Local AI is an interactive client/runtime feature in v1, not a replacement for team orchestration policy. Therefore:

- `assistantTeams.defaultModelId` continues to resolve cloud/server orchestration defaults
- member `preferredModelId` and `modelSelectionPolicy` continue to control server-run assistants
- team/member `memoryPolicyJson` remains owned by existing team/orchestrator services
- the Local AI catalog must not be surfaced as a drop-in replacement in those selectors without a future explicit policy design

## 11. OCR and hybrid preprocessing path

Document-grade OCR is intentionally separate from local LLM routing.

### 10.1 Backend OCR provider boundary

Typhoon OCR should be integrated as a backend/provider path behind SmartSpecPro-controlled credentials. Client flows may upload files or reference SmartSpecPro-managed storage keys, but must not send raw third-party URLs for the backend to fetch arbitrarily.

### 10.2 Local cleanup after OCR

Local runtime may participate after OCR for:

- summarizing OCR output
- cleaning noisy text
- mapping results to lightweight JSON schemas

This is a hybrid path and must be labeled accordingly when persisted.

### 10.3 Rate limiting and failure handling

Because Typhoon OCR documents rate limits, the server integration should plan for queueing, retries, and backpressure instead of direct best-effort fire-and-forget calls. Local runtime must not be treated as a document-grade substitute when the OCR provider is unavailable; the request should either fall back to another approved OCR backend or fail explicitly.

## 12. Security, privacy, and compliance implementation details

This work has several security-sensitive edges and must address them directly.

### 11.1 Asset origin and integrity

The local model catalog must point only to allowlisted origins or SmartSpecPro-signed manifests. Install logic should validate manifest version, checksum, and expected size before treating a model as usable.

Add a revocation flow so the client can learn that an installed bundle is no longer allowed. Revocation should cause the runtime router to stop selecting that profile even if the files still exist on disk.

Wire the allowlist through server-owned runtime configuration so browser clients do not invent their own download origins. Where feasible, tighten CSP and outbound fetch policy in `apps/web/server/_core/index.ts` or equivalent config surfaces so model-asset origins are explicitly permitted rather than relying on the current broad `https:` allowance.

### 11.2 SSRF and untrusted URL handling

OCR and asset-processing server jobs must accept only:

- uploaded files
- SmartSpecPro-managed object keys
- SmartSpecPro-generated signed URLs

They should reject arbitrary external URLs by default. This closes the supply-chain and SSRF gap created by generic attachment URL acceptance elsewhere in the stack.

### 12.3 Truthful privacy semantics

The UI copy and runtime badges must distinguish:

- processed on-device before provider submission
- processed by SmartSpecPro backend
- processed by third-party provider

The system must not imply that content stayed on-device when raw input already traversed the SmartSpecPro backend.

### 12.4 Accounting and audit safety

Persist only server-authored or server-validated runtime metadata. Token-saved estimates may be kept for informational analytics, but they cannot affect credits, billing, quotas, or enterprise compliance reporting.

### 12.5 Chat and Team Room safety parity

Do not let Local AI bypass existing room and chat safety layers:

- `sanitizeForPrompt` and history sanitization in memory/prompt-composer paths
- `sanitizeRoomString`, `sanitizeRoomJsonValue`, and summary projection in `roomService`
- room/work-item authorization checks
- secret redaction and sensitivity-to-summary behavior for room updates
- `routeRoomIntent` and existing server-side classification on the final submitted room message

If local preprocessing is introduced into Team Room or chat composer UX, the server must still re-apply its own sanitization, routing, and safety rules before persistence or orchestration. The client must not submit hidden raw-draft copies, must not write `runtimeDisclosure` directly, and must not bypass the existing server-owned mutation path.

## 12.6 Request lifecycle summary

The main v1 request flow should be implemented as:

1. Client reads tenant policy, synced user preferences, and conversation override.
2. Client runs cheap capability detection and determines whether a local attempt is even eligible.
3. Client asks the runtime router for the selected path using task class, capability, policy, and install state.
4. If local/hybrid is selected:
   - ensure the chosen profile is installed and not revoked
   - run the local adapter or local preprocessor
   - collect advisory runtime details and any fallback reason
5. The canonical chat request still goes through SmartSpecPro backend in v1.
6. The backend resolves provider/model details, validates advisory runtime data, and persists authoritative message metadata.
7. Chat reloads use persisted message metadata to render badges and fallback context.

## 13. Testing strategy

Testing should stay within the repo's existing `apps/web` Vitest patterns and add coverage at the boundaries that can regress silently.

### 12.1 Server tests

Add tests for:

- `users.getPreferences` default shaping when `localAi` is absent
- `users.updatePreferences` partial updates and backward compatibility
- tenant feature flag validation and unknown-key rejection behavior
- force-cloud-only policy resolution
- `conversations.skillSettings.localAiConversation` merge semantics
- `messages.runtimeMetadata` persistence rules
- runtime metadata validator refusing durable `Local` labels in v1
- `memory.getChatContext`, `processConversationMemory`, and `compactConversation` preserving existing behavior when Local AI is absent
- Team Room `metadataJson.runtimeDisclosure` validation and persistence rules
- Team Room prompt-composer and room-service paths remaining cloud-safe when local features are disabled
- team-service model and memory policy fields remaining separate from Local AI profile choices
- Team Room `localAiAdvisory` input validation and rejection of direct client disclosure fields
- rejection of arbitrary external fetch targets in OCR/asset server paths

### 12.2 Client tests

Add jsdom tests for:

- settings rendering when Local AI is unsupported
- settings rendering when tenant policy disables the feature
- no download prompts or worker startup on normal chat open
- runtime badge rendering from persisted metadata
- conversation override controls calling the correct mutation
- sign-out / tenant-switch device-local state isolation helpers
- shared-browser sign-out requiring revalidation before cached installs appear usable again
- Team Room UI showing runtime/source disclosure from persisted metadata
- Teams / Team Room composer remaining fully usable on unsupported devices
- Teams list/detail and room-creation dialogs staying cheap to open when Local AI is off
- member-management forms not importing Local AI runtime code until an explicit assist action is requested
- local profile catalog not appearing inside team model-selection controls by default
- RunMonitorPanel source badge remaining hidden unless backed by a dedicated server-owned contract

### 12.3 Integration and regression tests

Add end-to-end style server/client integration coverage for:

- supported device local-eligible request falling back cleanly to cloud
- unsupported device remaining cloud-stable
- local model catalog staying separate from cloud model lists
- revoked profile routing away from stale installed bundles
- desktop adapter state management where practical
- Team Room sends, workflow comments, and room history reload staying stable when Local AI is off or unsupported
- Team Room viewer-state, mark-viewed, and room-list flows staying stable when Local AI is off or unsupported
- team create/edit/archive flows staying stable when Local AI is off or unsupported
- browser partial/corrupt install states remaining non-routable until repair
- channel/API/widget/background memory paths staying cloud/server-canonical

### 13.4 Minimal observability

Add low-risk telemetry for:

- feature enabled rate
- install started/completed/failed
- local attempt success/fallback rate
- profile revocation hits
- average local preparation and response latency

These metrics should:

- avoid raw prompt/body capture by default
- avoid storing derived local text artifacts in analytics payloads
- remain lightweight when the feature is off

## 13. Rollout order

### Phase 0: contracts and safety rails

Deliver:

- tenant flag and policy plumbing
- `localAi` synced preference contract
- device-local state contract
- conversation override contract
- durable runtime metadata contract
- local model catalog
- capability result types
- SSRF-safe OCR/asset rules

This phase should land with tests before any actual browser-local runtime import occurs in production code.

### Phase 1: browser text-first MVP

Deliver:

- settings UI
- capability detector
- browser download manager
- worker-based browser adapter
- router integration for short general chat and preprocessing tasks
- provider-selectable chat mic with `legacy_stt`, `gemma4_local`, and `auto`
- short browser dictation and short voice-command chat entry on supported devices
- allowlisted first-party navigation intents for voice commands
- chat memory/context and compaction parity
- Teams / Team Room user-composer parity with truthful runtime disclosure
- `Hybrid`/`Cloud` runtime badges

### Phase 2: Tauri shell support

Deliver:

- app-local storage adapter
- on-demand install/remove UX for the curated desktop profile
- shared routing integration with desktop capability reporting
- fuller desktop local voice path for short push-to-talk dictation and short voice commands
- configurable fallback to the legacy/server STT path

### Phase 3: OCR and multimodal expansion

Deliver:

- backend OCR provider routing
- OCR cleanup pipeline
- future local-vision capability registry

## 14. Failure modes and how the implementation handles them

- Unsupported browser: capability detector returns unsupported, UI explains why, router stays cloud.
- Dynamic import failure: log telemetry, set runtime error state, keep page functional, route cloud.
- Asset corruption: mark install invalid, prompt re-download, do not attempt local route.
- Microphone permission denied: leave text chat usable, surface a clear voice-specific explanation, and do not block the page.
- Local voice clip too long or unsupported for the selected profile: fail just the voice action, offer fallback or retry, and keep the composer intact.
- Shared browser sign-out: hide cached-install visibility and require per-scope revalidation before a later account can reuse it.
- Tenant disables feature after install: hide/lock local controls and route cloud without deleting local blobs automatically.
- Profile revoked: routing stops using it, settings prompt user to remove or re-download a replacement.
- Conversation override conflicts with tenant force-cloud-only: tenant policy wins and UI explains the lock.
- Sign-out on shared device: scoped local state is cleared or hidden before the next account session can see it.
- Local summarization assist unavailable: memory services fall back to the existing server summarization and compaction path.
- Team Room local composer unavailable: room messages and run controls still use the existing cloud/server path with no workflow interruption.
- Teams detail or management dialog opened on an unsupported machine: the page remains fully usable and does not trigger Local AI startup side effects.
- Voice command resolves to a privileged or side-effectful action: require the existing server authorization path and visible confirmation before execution.

## 15. Implementation-ready outcome

After these phases, SmartSpecPro will have a single routing architecture that can truthfully decide between hybrid-local and cloud execution, persist trustworthy runtime metadata, and preserve the existing user experience on machines that are not prepared for local inference. That outcome is more important than maximizing local capability in the first release.
