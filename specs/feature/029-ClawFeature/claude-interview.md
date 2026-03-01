# Interview Transcript: 02-ClawFeature Implementation

## Q1: Implementation Priority
**Q:** Which features do you want to implement first? The spec suggests F08 (Persona) + F07 (Cost Display) as Phase 1 foundations.
**A:** Follow spec's Phase 1-3 order (Persona + Cost Display → Canvas → Channel refactor → Voice → Browser → Channels → Widget → Webhooks → Router, 9 weeks)

## Q2: Messaging Platform API Accounts
**Q:** Which messaging platform API accounts do you already have set up or plan to set up first?
**A:** All four (WhatsApp, LINE, Slack, Discord) — all platform API credentials available or in progress

## Q3: Browser Automation Sandbox Infrastructure
**Q:** Do you have an OpenSandbox or similar container sandbox infrastructure available?
**A:** No sandbox yet — need to set up as part of implementation (Docker/container sandbox setup included in plan)

## Q4: Canvas Artifact Isolation Strategy
**Q:** For Canvas/Artifacts, do you want a separate sandbox subdomain or blob URLs?
**A:** Separate subdomain (Recommended) — sandbox.smartaihub.app for strongest security isolation, following Claude Artifacts pattern

## Q5: Voice Provider Preferences
**Q:** Which STT/TTS providers should we prioritize?
**A:** Support all providers — build abstraction layer supporting Groq, OpenAI, and ElevenLabs from the start

## Q6: Scale Design Target
**Q:** What scale should we design for?
**A:** Medium (20-100 tenants, 1K-10K concurrent) — growing platform needing proper connection pooling and caching strategies

## Q7: Webhook Triggers UX
**Q:** Should we build a UI for testing/debugging webhooks?
**A:** Yes — full test UI with request inspector, test endpoint, payload preview, and delivery logs

## Q8: Persona Seed Data Language
**Q:** Should platform-scope persona seed data be Thai-focused or multilingual?
**A:** English-primary — English defaults, Thai available as a separate persona

## Q9: Cross-Agency Communication Limits
**Q:** Are the spec's default limits (max depth 3, 500 credit cap, max 2 concurrent sub-calls) appropriate?
**A:** Defaults are fine

## Q10: Telegram Migration Strategy
**Q:** How should we handle the Telegram data migration to channelConnections?
**A:** Migrate immediately — copy data to channelConnections + dual-write from day 1, deprecate old table in Phase 3

## Q11: Widget Build Strategy
**Q:** Should the widget chat UI be a separate Vite build or share the main app's component library?
**A:** Separate Vite build (Recommended) — independent bundle (~50KB gzipped) for embed performance

## Q12: Performance Constraints
**Q:** What are the specific performance or resource constraints?
**A:** Both RAM and CPU constrained — single server with limited resources, need efficient resource management across all features

### Impact of Resource Constraints:
- **Browser automation:** Conservative concurrent session limits (1/user, 2/tenant max)
- **Voice chat:** Limit concurrent WebSocket voice sessions
- **Discord bot:** WebSocket connection pooling, shared process
- **Widget:** Connection multiplexing, lazy initialization
- **Workers:** Share BullMQ workers across features, avoid dedicated worker processes per feature
