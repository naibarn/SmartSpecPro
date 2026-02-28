# Chat Bridge — Usage Guide

## Overview

The Chat Bridge feature enables bidirectional communication between the SmartSpecPro web application and Telegram. Users can link their Telegram accounts, bind conversations (both chat and agency), and receive/send messages through Telegram while maintaining a unified conversation history.

## Architecture

```
Telegram Bot API
      │
      ▼
POST /webhooks/telegram/:botId  (telegramWebhook.ts)
      │
      ├── Command routing (/help, /status, /resume, /unlink, /start)
      │     └── telegramCommands.ts
      │
      └── Text message → channelGateway.ingest()
            │
            ├── Chat pipeline (processMessageServerSide)
            │     └── LLM call → save response → emitEgress()
            │
            └── Agency pipeline (agencyBridge.executeRun)
                  └── Save response → emitEgress()
                        │
                        └── deliveryQueue.enqueueDelivery()
                              └── BullMQ → Telegram sendMessage
```

## Key Files

### Schema (Section 01)
- `apps/web/drizzle/schema.ts` — 5 new tables: `telegram_connections`, `conversation_channels`, `channel_messages`, `telegram_link_tokens`, `telegram_updates`. Plus column extensions on `messages` and `conversations`.

### Webhook Handler (Section 02)
- `apps/web/server/routes/telegramWebhook.ts` — Express router for `POST /webhooks/telegram/:botId`. Validates secrets, deduplicates via Redis, routes commands/messages.

### I18n (Section 03)
- `apps/web/server/services/telegramI18n.ts` — Bilingual message strings (EN/TH) for all bot commands and error messages.
- `apps/web/shared/channelTypes.ts` — Shared TypeScript types for channels and egress events.

### Link Flow (Section 04)
- `apps/web/server/services/telegramLinkService.ts` — Handles `/start <token>` command: validates token, creates `telegram_connections` record, optionally creates `conversation_channels` binding.

### Channel Gateway (Section 05)
- `apps/web/server/services/channelGateway.ts` — Core routing module: `ingest()` for inbound messages, `emitEgress()` for outbound delivery, `hasActiveChannels()` for checking bindings.

### Delivery Queue (Section 06)
- `apps/web/server/services/deliveryQueue.ts` — BullMQ-based delivery queue with retry, DLQ, and `channel_messages` tracking.

### Server-Side Chat (Section 07)
- `apps/web/server/services/channelGateway.ts` — `processMessageServerSide()` function handles the full chat pipeline when messages arrive from Telegram.

### Pipeline Hooks (Section 08)
- `apps/web/server/services/telegramRendering.ts` — Converts markdown to Telegram-safe HTML with 4096-char splitting.
- `apps/web/server/routers/chat.ts` — Hook in `saveAssistantMessage` calls `emitEgress()`.
- `apps/web/server/routers/agency.ts` — Hook in `sendMessage` calls `emitEgress()`.

### Telegram Commands (Section 09)
- `apps/web/server/routes/telegramCommands.ts` — Bot command handlers: `/help`, `/status`, `/resume`, `/unlink`, `/start` (no token), callback queries.

### Router Extensions (Section 10)
- `apps/web/server/routers/telegram.ts` — Extended with 5 new tRPC endpoints: `getConversationChannelStatus`, `bindConversation`, `unbindConversation`, `adminListConnections`, `adminRevokeConnection`. Extended existing endpoints: `checkTelegramStatus`, `unlinkTelegram`.

### Tests (Section 11)
- `apps/web/server/routes/__tests__/telegramWebhook.integration.test.ts` — Architecture validation + round-trip test placeholders.
- `apps/web/server/routers/__tests__/telegram.compat.test.ts` — Backward compatibility tests.

## tRPC API Reference

### User Endpoints

| Endpoint | Type | Description |
|----------|------|-------------|
| `telegram.generateTelegramLink` | mutation | Generate Telegram deep link (optionally with conversationId) |
| `telegram.checkTelegramStatus` | query | Check linking status, connection details, bound count |
| `telegram.unlinkTelegram` | mutation | Revoke connection + channels + legacy fields |
| `telegram.updateTelegramPreferences` | mutation | Set notification level |
| `telegram.getConversationChannelStatus` | query | Check if a conversation has an active Telegram binding |
| `telegram.bindConversation` | mutation | Bind a conversation to Telegram |
| `telegram.unbindConversation` | mutation | Unbind a conversation from Telegram |

### Admin Endpoints

| Endpoint | Type | Description |
|----------|------|-------------|
| `telegram.adminListConnections` | query | List all Telegram connections for tenant (paginated) |
| `telegram.adminRevokeConnection` | mutation | Revoke a connection and all its channel bindings |

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start <token>` | Link account with verification token |
| `/start` (no token) | Show welcome/status for linked user |
| `/help` | Show available commands |
| `/status` | Show active conversation info |
| `/resume` | Switch active conversation (inline keyboard) |
| `/unlink` | Unlink Telegram account (with confirmation) |

## Test Summary

| Test File | Tests | Status |
|-----------|-------|--------|
| `telegramBridge.schema.test.ts` | 14 | Pass |
| `telegramWebhook.test.ts` | 6 | Pass |
| `telegramI18n.test.ts` | 6 | Pass |
| `telegramWebhook.link.test.ts` | 13 | Pass |
| `channelGateway.test.ts` | 18 | Pass |
| `deliveryQueue.test.ts` | 15 | Pass |
| `telegramRendering.test.ts` | 18 | Pass |
| `telegramCommands.test.ts` | 18 | Pass |
| `telegram.bridge.test.ts` | 20 | Pass |
| `telegramWebhook.integration.test.ts` | 9 + 26 todo | Pass |
| `telegram.compat.test.ts` | 6 | Pass |
| **Total** | **143 + 26 todo** | **All pass** |

## Commits

| Section | Commit | Description |
|---------|--------|-------------|
| 01 | 515ee84 | Schema migration — 5 tables + column extensions |
| 02+03 | 739d779 | Webhook handler + i18n + types |
| 04 | b6e9463 | Link flow (/start token → connection + binding) |
| 05 | a8a8d8b | Channel gateway (ingest, emitEgress, processMessageServerSide) |
| 06 | 45ad633 | Delivery queue (BullMQ + channel_messages tracking) |
| 07 | f4ab5d7 | Server-side chat pipeline integration |
| 08 | fbe1dab | Pipeline hooks + Telegram rendering |
| 09 | 6b9735b | Telegram bot commands |
| 10 | 17dbb02 | Router extensions (5 new + 3 extended endpoints) |
| 11 | a5165cd | Integration tests + backward compat tests |

## Next Steps

1. **Frontend UI**: Build the conversation binding UI component that calls `bindConversation`/`unbindConversation`.
2. **Admin Dashboard**: Build the admin connections panel using `adminListConnections`/`adminRevokeConnection`.
3. **Environment Config**: Set up Telegram bot token and webhook secret in `system_settings`.
4. **Webhook Registration**: Use `telegram.registerWebhook` admin endpoint to register with Telegram.
5. **Production Deployment**: Ensure BullMQ Redis connection is configured for the delivery queue.
6. **Monitoring**: Add alerts for delivery queue failures and DLQ buildup.
