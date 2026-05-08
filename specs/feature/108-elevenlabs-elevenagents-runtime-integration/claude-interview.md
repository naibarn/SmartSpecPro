# Feature 108 Interview Transcript

Interview mode: auto-minimized.

No user interview questions were required for MVP planning. The source spec
already resolved the domain decisions that would normally require stakeholder
input:

- MVP starts with web Chat.
- Team Room, Work OS, and Agency integrations are follow-on phases.
- Primary transport is ElevenLabs React SDK with WebRTC conversation token.
- Transcript durability uses browser callbacks plus post-call webhook or
  provider polling reconciliation.
- First server tool is `chat.create_message`.
- Tool callbacks are owned by `apps/web/server` for MVP.
- Final transcripts are persisted by default under `retention_policy`.
- Provider data residency defaults to tenant setting, then `us` if unset.
- Knowledge base sync is deferred beyond MVP.

## Auto-Decisions

1. Use tRPC for authenticated admin/user voice-agent procedures because the
   existing web app exposes product APIs through `apps/web/server/routers/*`.
2. Use an Express public route for ElevenLabs tool and post-call callbacks
   because provider callbacks already use public route registration and CSRF
   bypass patterns in `apps/web/server/_core/index.ts`.
3. Keep callback policy in TypeScript services so chat writes, credits, session
   state, and audit logging share one transactional boundary.
4. Use Drizzle schema plus migration SQL for persistent voice-agent tables.
5. Use existing credit idempotency patterns rather than creating a separate
   reservation ledger for MVP.
6. Use `@elevenlabs/react` granular hooks in a contained Chat voice component.
7. Run a provider research spike first because the external APIs are current and
   may differ by agent configuration, workspace settings, or SDK version.
