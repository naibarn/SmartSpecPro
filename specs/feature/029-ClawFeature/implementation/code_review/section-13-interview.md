# Code Review Interview — Section 13: Slack + Discord Adapters (F01-C)

**Date:** 2026-03-02
**Interviewer:** Senior Architect
**Implementer:** Claude (deep-implement)

---

## Review Findings & Decisions

### H1: Slack OAuth installationStore Omitted — USER DECISION

**Finding:** The section plan required `@slack/bolt` + multi-tenant OAuth installationStore (storeInstallation/fetchInstallation/deleteInstallation) backed by `channel_credentials` DB table. Neither the SDK nor the implementation was added.

**User decision:** "Add stub methods"

**Fix applied:** Added three stub methods to `SlackAdapter` that throw `Error` with clear messages:
- `storeInstallation()` — throws "not yet implemented (Phase 2)"
- `fetchInstallation()` — throws "not yet implemented (Phase 2)"
- `deleteInstallation()` — throws "not yet implemented (Phase 2)"

Rationale: Current credentials are passed via `config` at send time (pre-configured in Admin UI). The OAuth flow is Phase 2. The stubs prevent silent no-ops.

Implementation note: `@slack/bolt` was NOT installed. The adapter uses native `crypto` + `fetch`, matching the WhatsApp/LINE pattern.

---

### H2: `_handleMessage` connectionId Argument — AUTO-FIXED

**Finding:** `_handleMessage` passed `message.guildId` as both the `connectionId` and `guildId` args to `ingestCallback`. The channelGateway needs to look up `channel_connections` by `guildId`+`channelType='discord'` to find the real connection.

**Decision:** Auto-fix — clarify the callback signature.

**Fix applied:** Changed `IngestCallback` signature to `(guildId, externalChannelId, text)` — both guildId and channel ID are passed so the gateway can do the DB lookup. Added JSDoc comment explaining the routing intent.

---

### H3: `initialized` Flag Set Before `login()` — AUTO-FIXED

**Finding:** The `initialized = true` flag was set at the end of `initialize()` before `client.login()` was called (which happens in `connect()`). This made `initialized` an unreliable indicator of "connected to Gateway".

**Decision:** Auto-fix — split into two flags.

**Fix applied:** Introduced two separate flags:
- `handlersAttached` — set to `true` after event handlers are registered (in `initialize()`)
- `connected` — set to `true` in the `ClientReady` event handler (after successful `login()`)
`initialize()` is idempotent on `handlersAttached`.

---

### M2: Discord Slash Command Registration Missing — USER DECISION

**Finding:** `registerGuildCommands()` method was absent. Without it, the `/ask` command doesn't exist in any guild and `_handleInteraction` would never fire.

**User decision:** "Add minimal slash command registration"

**Fix applied:** Added `registerGuildCommands(botToken, guildId, clientId)` that uses `discord.js`'s `REST` + `SlashCommandBuilder` to register `/ask` (with required `message` option) and `/status` commands per-guild via `Routes.applicationGuildCommands()`.

---

### M3: `discord.js` Vite Bundle Risk — AUTO-FIXED (documentation)

**Finding:** `discord.js` was added to `dependencies` and uses Node.js-only APIs (`net`, `tls`, WebSocket). If Vite's client bundle imports any module that transitively requires the adapter barrel, the build would crash.

**Decision:** Auto-fix — documented risk in Discord adapter file. The adapter self-registers via `adapterRegistry.register()` only when imported on the server side. The `channelAdapters/index.ts` barrel does not export `discord.ts` directly, so client bundles won't import it.

---

### L1: `url_verification` Challenge Response — LET GO

**Finding:** The webhook route (from section-05) needs to detect `url_verification` payloads and return `{ challenge: payload.challenge }`. `parseInbound` returning `null` is correct, but the route handler needs to handle this before calling `parseInbound`.

**Decision:** Let go — the webhook route fix is outside section-13's scope (belongs to section-05 or a dedicated channel connection setup flow). Added a note in the adapter's JSDoc.

---

### L2: Registry Auto-Import — LET GO

**Finding:** The adapter self-registration (`adapterRegistry.register(new SlackAdapter())`) happens at module bottom, but the modules must be explicitly imported somewhere to trigger registration.

**Decision:** Let go — this is an existing pattern (WhatsApp and LINE use the same approach). The app startup code imports these adapters.

---

## Summary

| Finding | Action | Status |
|---------|--------|--------|
| H1: Slack OAuth omitted | User: Add stubs | ✅ Applied |
| H2: `_handleMessage` wrong args | Auto-fix: proper signature | ✅ Applied |
| H3: `initialized` flag incorrect | Auto-fix: split into 2 flags | ✅ Applied |
| M2: Slash commands missing | User: Add minimal registration | ✅ Applied |
| M3: Vite bundle risk | Auto-fix: document risk | ✅ Applied |
| L1: url_verification challenge | Let go (section-05 scope) | — |
| L2: Registry auto-import | Let go (existing pattern) | — |

All 27 tests passing after fixes (14 Slack + 13 Discord).
