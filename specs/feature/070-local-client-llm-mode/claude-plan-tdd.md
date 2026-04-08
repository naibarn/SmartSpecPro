# Local / Client LLM Mode TDD Plan

Test command for the primary web surface: `npm --prefix apps/web test`

This document mirrors the implementation plan and lists the tests that should be written before implementation in each area.

## 5. Shared contracts and persistence changes

### 5.1 User preference contract

- Test: `users.getPreferences` returns safe `localAi` defaults when the JSON block is absent.
- Test: `users.updatePreferences` accepts partial `localAi` updates without requiring older fields.
- Test: unrelated preference fields survive `localAi` updates unchanged.
- Test: invalid execution modes or document OCR provider values are rejected by server validation.

### 5.2 Device-local state contract

- Test: browser device-local state keys are namespaced by tenant and user.
- Test: clear-cache removes derived local artifacts and install visibility for the active scope.
- Test: sign-out or tenant switch does not expose another scope's consent state.
- Test: a shared-browser sign-out hides cached install visibility until the next scope revalidates or re-authorizes it.

### 5.3 Tenant policy contract

- Test: `localClientLlmMode` is recognized by typed flag validation and defaults to `false`.
- Test: unknown local-AI flag keys are stripped or rejected consistently with current tenant flag behavior.
- Test: force-cloud-only policy overrides user `prefer_local` intent.

### 5.4 Conversation override contract

- Test: updating `localAiConversation` merges without clobbering `llmSelection` or unrelated `skillSettings`.
- Test: invalid conversation override payloads are rejected.
- Test: non-members cannot mutate another conversation's local-AI override.

### 5.5 Durable runtime metadata

- Test: legacy messages with `runtimeMetadata = null` still render as cloud-safe history.
- Test: the persisted runtime metadata shape is stable across streaming and non-streaming save paths.
- Test: client-attempted `source = "local"` is rewritten or rejected in v1.

## 6. Server-side policy, catalog, and metadata plumbing

### 6.0 Authenticated API surfaces

- Test: authenticated users can fetch policy/catalog only for their own tenant context.
- Test: tenant-admin-only policy writes reject non-admin callers.
- Test: client-supplied tenant or user IDs are ignored in favor of session-derived identity.

### 6.1 Dedicated local model catalog

- Test: local profiles never appear in generic cloud model list responses by default.
- Test: local profiles do not silently appear in team `defaultModelId` or member `preferredModelId` selectors in v1.
- Test: tenant allowlist filters local profiles correctly.
- Test: revoked profiles are omitted or marked unusable on refresh.

### 6.2 Capability and routing contracts

- Test: unknown capability fields do not silently alter router behavior.
- Test: router defaults to cloud when capability data is absent or malformed.
- Test: local-only requests fail per request instead of breaking page state.
- Test: unknown `voiceInputMode` values are rejected or normalized to safe defaults.
- Test: voice-command intents are constrained to the allowlisted route/action vocabulary.

### 6.3 Runtime metadata validator

- Test: server-resolved provider/model fields overwrite client advisory values.
- Test: malformed advisory metadata falls back to cloud-safe metadata.
- Test: billing-related fields ignore `tokenSavedEstimate`.

### 6.4 Chat route integration

- Test: SSE `message_saved` emits the same runtime metadata shape as non-streaming assistant save.
- Test: runtime badges survive reload from persisted message metadata.
- Test: retry with cloud preserves the conversation when local fallback occurs.
- Test: mic-derived text enters the same chat pipeline as typed input rather than a parallel save path.
- Test: `legacy_stt` chat mode wraps the existing push-to-talk chat path rather than the separate realtime voice-session flow.

### 6.5 Memory, context, and compaction integration

- Test: `memory.getChatContext` preserves current context assembly when Local AI is absent.
- Test: `processConversationMemory` falls back to the existing server summarization path when local assist is unavailable.
- Test: manual `compactConversation` remains functional on unsupported devices.
- Test: locally assisted summaries or fact candidates are server-validated before persistence.

### 6.6 Collaborative surface API and policy parity

- Test: Team Room message save paths persist only server-authored runtime disclosure metadata.
- Test: Team Room user message mutations ignore or sanitize malformed local advisory metadata.
- Test: Team Room user message mutations reject direct client attempts to write `runtimeDisclosure` or other server-owned metadata fields.
- Test: `teamRoom.create`, `listByTeam`, `getMessages`, `viewerState`, and `markViewed` remain cloud-stable when Local AI is off.

## 7. Client feature area and settings integration

### 7.1 Feature module structure

- Test: local-AI state helpers can be imported without triggering heavy runtime package evaluation.

### 7.2 Settings UI

- Test: settings render a disabled/locked state when tenant policy turns the feature off.
- Test: unsupported-device reasons display without breaking the page.
- Test: opening settings does not start worker init or model download when the feature is off.
- Test: voice input mode defaults to `legacy_stt` for backward-compatible users.
- Test: settings disclosure copy changes correctly between `legacy_stt`, `gemma4_local`, and `auto`.

### 7.3 User preference queries and mutations

- Test: settings save succeeds when only a subset of `localAi` fields is edited.
- Test: missing `localAi` from the response hydrates to safe defaults in the client store.

### 7.4 Conversation override UI

- Test: conversation override controls call the dedicated mutation with the expected payload.
- Test: force-cloud-only policy disables local-first controls in the UI.

### 7.5 Teams, Team Room, and workflow UI parity

- Test: `/teams` remains usable when Local AI is unsupported or disabled.
- Test: `TeamRoomView` renders persisted runtime/source disclosure without depending on transient client state.
- Test: room/workflow composer actions do not initialize heavy local runtime code when the feature is off.
- Test: room creation dialogs, team detail panes, and member-management dialogs do not initialize heavy local runtime code until an explicit assist action is requested.
- Test: team-management model selectors do not include Local AI profiles by default.

## 8. Browser capability detection, download lifecycle, and runtime adapter

### 8.1 Capability detector

- Test: missing `navigator.gpu` marks browser-local unsupported.
- Test: insecure context marks browser-local unsupported.
- Test: `navigator.gpu` present but `requestAdapter()` returns null marks browser-local unsupported.
- Test: `requestDevice()` failure marks the selected browser-local profile unsupported.
- Test: selected-profile WebGPU limits/features mismatch marks browser-local unsupported rather than partially ready.
- Test: cheap capability checks do not require dynamic runtime imports.

### 8.2 Download manager

- Test: install requires explicit consent before download begins.
- Test: manifest checksum/version failure leaves the profile unusable.
- Test: concurrent install requests from multiple tabs collapse to one active install per scoped profile.
- Test: storage-full errors do not block ordinary cloud chat.
- Test: partial or corrupt downloads remain quarantined/non-routable until repair or removal.

### 8.3 Worker-based runtime adapter

- Test: worker bootstrap is lazy and not created on ordinary chat mount.
- Test: runtime prepare/run errors surface typed fallback reasons.
- Test: worker-side WebGPU init failure surfaces a typed fallback reason even when main-thread probing passed.
- Test: WebGPU-only profiles do not silently fall back to CPU execution in browser mode.
- Test: worker disposal frees runtime state when the feature is turned off or cache is cleared.

### 8.4 Runtime health and fallback

- Test: `prefer_local` falls back to cloud with `fallbackReason` when the adapter is unavailable.
- Test: `local_only` fails the request without deleting the draft or conversation.

### 8.5 Browser voice input

- Test: browser `auto` voice mode falls back to legacy/server STT when local Gemma 4 voice capability is unavailable.
- Test: explicit browser `gemma4_local` mode shows a clear unsupported error without breaking text chat when local voice is unavailable.
- Test: explicit browser `gemma4_local` mode does not silently downgrade to third-party STT.
- Test: browser `gemma4_local` voice is offered only for Gemma 4 E2B/E4B profiles that explicitly advertise native audio support.
- Test: browser capability remains fail-closed when WebGPU probing succeeds but the approved Gemma 4 browser runtime stack is not present in the build.
- Test: browser local voice normalizes audio to mono 16 kHz float32 and rejects clips beyond the configured short-clip limit.
- Test: browser voice commands can open only allowlisted first-party routes and reject arbitrary URLs.
- Test: browser voice-command flows that create reminders, notifications, OCR/workflow actions, or other existing writes still require the existing server mutation and confirmation path.
- Test: unknown browser voice actions fall back to normal chat text instead of speculative direct execution.

## 9. Tauri support

### 9.1 Shared router, separate adapter

- Test: Tauri adapter consumes the same routing/task-class contracts as the browser adapter.

### 9.2 Real v1 desktop download UX

- Test: desktop install writes to app-local storage and removal clears the scoped install state.
- Test: insufficient disk or permission failures surface actionable errors without corrupting install state.
- Test: revoked installed profiles are not reused on next startup.
- Test: desktop catalog defaults to `gemma4-e4b-tauri-balanced` and can fall back to `gemma4-e2b-tauri-fast` on lower-capability machines without widening scope to 26B / 31B profiles.

### 9.3 Desktop local voice path

- Test: Tauri local voice uses the same `voiceInputMode` vocabulary as browser.
- Test: Tauri `auto` voice mode falls back to legacy/server STT when desktop local audio init fails.
- Test: Tauri local voice failure never blocks ordinary typed chat or cloud fallback.
- Test: desktop local voice is enabled only for Gemma 4 E2B/E4B profiles with native audio support.
- Test: desktop local voice normalizes audio to mono 16 kHz float32 and enforces the short-clip limit before inference.

### 9.4 Future-proofing for multimodal work

- Test: adapter request envelopes accept modality metadata even when only text execution is implemented.

## 10. Teams and Team Room execution parity

### 10.1 Prompt composer and room history

- Test: team-run prompt composition remains server-canonical when Local AI is disabled.
- Test: room-history compression and memory injection still follow `composePrompt` budgets after Local AI features are added.
- Test: team `defaultModelId`, member `preferredModelId`, and `memoryPolicyJson` semantics remain unchanged by Local AI rollout.

### 10.2 Room message persistence and badges

- Test: `team_room_messages.metadataJson.runtimeDisclosure` survives reload and drives Team Room badges.
- Test: server-orchestrated assistant turns cannot be mislabeled as local by a client.
- Test: existing executor/debug metadata does not collide with the Team Room disclosure contract.

### 10.3 Workflow and work-item interactions

- Test: locally assisted workflow comments still pass room/work-item permission checks and room sanitization.
- Test: locally assisted room goals or draft instructions still pass through the existing server mutation and validation path before persistence.
- Test: `localAiAdvisory` is the only accepted client hint path for Team Room local assist; free-form metadata injection is rejected.

### 10.4 Non-regression boundary

- Test: Team Room send/run/workflow flows stay operational when local adapter init fails.
- Test: Team Room viewer-state, unread markers, and mark-viewed flow stay operational when local adapter init fails.
- Test: team create/edit/archive flows stay operational when local adapter init fails.
- Test: `RunMonitorPanel` does not invent runtime/source badges when no dedicated server-owned contract is present.

## 11. OCR and hybrid preprocessing path

### 10.1 Backend OCR provider boundary

- Test: OCR backend rejects arbitrary external fetch targets.
- Test: client uploads or SmartSpecPro-managed storage references are accepted.

### 10.2 Local cleanup after OCR

- Test: OCR cleanup requests persist `Hybrid` runtime metadata, not `Local`.

### 10.3 Rate limiting and failure handling

- Test: OCR provider rate-limit responses trigger queue/retry handling or explicit failure paths.
- Test: local LLM is not silently promoted to document-grade OCR when the OCR provider is unavailable.

## 12. Security, privacy, and compliance implementation details

### 11.1 Asset origin and integrity

- Test: download requests are allowed only for configured asset origins.
- Test: revoked profiles are excluded from future routing even when files are present locally.

### 11.2 SSRF and untrusted URL handling

- Test: OCR or asset-processing routes reject arbitrary third-party URLs by default.

### 12.3 Truthful privacy semantics

- Test: persisted runtime labels never claim `Local` for the canonical v1 chat path.
- Test: UI copy paths distinguish SmartSpecPro backend processing from third-party provider use.

### 12.4 Accounting and audit safety

- Test: credits/billing logic remains unchanged by client-provided local-runtime metrics.
- Test: analytics payload builders exclude raw prompt text by default.

### 12.5 Chat and Team Room safety parity

- Test: Team Room local-preprocess paths still pass through `sanitizeRoomString`, `sanitizeRoomJsonValue`, and summary-view projection.
- Test: chat local-preprocess paths still pass through server-side history sanitization and memory safety filters.
- Test: Team Room local-preprocess paths still pass through `routeRoomIntent` using the final submitted content.
- Test: Local AI draft helpers for room goals, workflow comments, or team instructions require explicit user confirmation and do not silently replace submitted control text.
- Test: Local preprocessing never rewrites agency/swarm primary messages, team-run objectives, or other routing/orchestration inputs by default.
- Test: voice-command-derived actions still pass through the same authorization and confirmation boundaries as typed commands.

### 12.6 Request lifecycle summary

- Test: end-to-end local-eligible requests produce authoritative runtime metadata after server validation.
- Test: end-to-end unsupported-device requests stay cloud-stable.

## 12. Testing strategy

### 12.1 Server tests

- Test: new server-side local-AI tests follow existing Vitest + router/service patterns in `apps/web/server`.

### 12.2 Client tests

- Test: new client-side local-AI tests follow existing jsdom and React Testing Library patterns in `apps/web/client/src`.

### 12.3 Integration and regression tests

- Test: regression suite proves chat/settings remain functional when Local AI is never enabled.

### 12.4 Minimal observability

- Test: telemetry for Local AI does not capture raw prompt bodies by default.
- Test: when the feature is off, Local AI telemetry emits no heavy or repeated runtime events.
