# section-05-chat-admin-ui

## Goal

Build the browser UI for Chat voice-agent sessions and Admin voice-agent
configuration/session inspection.

## Depends On

- section-02-schema-contracts
- section-03-backend-services
- section-04-api-callbacks

## Files Owned

Chat UI:

- `apps/web/client/src/components/chat/voice/VoiceAgentPanel.tsx`
- `apps/web/client/src/components/chat/voice/VoiceAgentControls.tsx`
- `apps/web/client/src/components/chat/voice/VoiceAgentTranscript.tsx`
- `apps/web/client/src/components/chat/voice/VoiceAgentStatus.tsx`
- `apps/web/client/src/components/chat/voice/useVoiceAgentSession.ts`
- Relevant integration point in `apps/web/client/src/components/chat/ChatView.tsx`
- `apps/web/package.json` and the repository lockfile if `@elevenlabs/react`
  must be added during this section

Admin UI:

- Focused admin page/component and route/nav integration following existing
  admin/provider patterns.
- i18n keys in existing locale files where required.
- Tenant `voiceAgents` feature flag visibility checks for the admin entry and
  Chat panel.

Tests:

- `apps/web/client/src/components/chat/voice/__tests__/VoiceAgentPanel.test.tsx`
- Admin component tests in the colocated component/page test location.

## Chat UI Behavior

- Show compact start control when enabled configs exist.
- Show empty/setup state when provider or config is missing.
- Ask for microphone permission only after user action.
- Fetch connection material before SDK `startSession`.
- Start SDK session with `conversationToken` in MVP.
- Persist provider conversation ID returned by SDK start.
- Map SDK status/mode to UI states: idle, connecting, listening, speaking,
  muted, tool-running, ended, error.
- Send best-effort client events to `voiceAgents.ingestClientEvent`.
- Stop calls SDK `endSession` and `voiceAgents.stopSession`.
- Keep text chat usable while voice panel is open.
- Hide/fail closed when the tenant `voiceAgents` flag is disabled.

## Admin UI Behavior

- Clearly separate Voice Agents from Media Providers.
- List configs with enabled state, allowed surfaces, allowed tools, provider
  status, and last test result.
- Create/edit config with external agent ID, branch, environment, language,
  server location, retention policy, and allowed tools.
- Show missing ElevenLabs provider key setup path.
- Test config and display sanitized success/failure.
- Show recent sessions, transcript, and tool calls with redacted payloads.
- Hide/fail closed when the tenant `voiceAgents` flag is disabled.

## TDD

Chat component tests:

- Renders start control with configs.
- Renders empty states.
- Handles microphone permission failure.
- Does not expose API key in props/payload.
- Calls createSession, getConnectionMaterial, SDK start, and stop in order.
- Maps SDK status and mode to display states.
- Keeps text chat controls present.
- Hides when `voiceAgents` tenant feature flag is disabled.

Admin tests:

- Admin route/nav entry appears only when `voiceAgents` is enabled.
- Missing provider key state.
- Default allowed tool state.
- Sanitized test result rendering.
- Redacted payload display.

## Acceptance

- Chat voice panel is usable and restrained.
- Admin UI has complete MVP controls.
- UI does not introduce a landing page or marketing page.
- Component tests cover primary states and errors.
