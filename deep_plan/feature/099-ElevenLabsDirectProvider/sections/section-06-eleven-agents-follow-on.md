# Section 06: ElevenAgents Follow-On

## Goal

Plan ElevenAgents integration without mixing it into one-shot media generation.

## Findings

ElevenAgents is a session/conversation platform combining:

- speech-to-text
- LLM reasoning
- text-to-speech
- turn-taking
- tools, knowledge base, widgets, SDKs, analytics

This is not just another `media_models` row.

## Recommended Architecture

Add a separate `voice_agents` or `agent_providers` capability layer later:

- Admin provider config can reuse ElevenLabs key.
- New entities:
  - `eleven_agent_configs`
  - `eleven_agent_sessions`
  - `eleven_agent_transcripts`
- UI surfaces:
  - Admin: agent config/agent ID mapping.
  - Chat/Work OS: start voice agent session.
  - Team Rooms: use ElevenAgent as a voice worker.
- Runtime:
  - WebSocket/session endpoints for browser voice.
  - Optional widget embedding.
  - Tool-calling bridge to SmartSpec actions.

## Out of Scope for Feature 099

- Real-time voice agent sessions.
- Tool-calling bridge.
- Knowledge base sync.
- Telephony/SIP/Twilio.

## TDD for Later Feature

1. Can create an agent session with a configured ElevenLabs agent ID.
2. Can stream transcript events into SmartSpec conversation history.
3. Can receive tool calls and dispatch through SmartSpec automation policy.

