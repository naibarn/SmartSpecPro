<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-schema-migration
section-02-webhook-handler
section-03-i18n-types
section-04-link-flow
section-05-channel-gateway
section-06-delivery-queue
section-07-server-side-chat
section-08-pipeline-hooks
section-09-telegram-commands
section-10-router-extensions
section-11-integration-tests
END_MANIFEST -->

# 028-Chat-Bridge: Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-schema-migration | - | 02, 03, 04, 05, 06, 07, 08, 09, 10, 11 | Yes |
| section-02-webhook-handler | 01 | 04, 09, 11 | Yes |
| section-03-i18n-types | 01 | 02, 04, 05, 09 | Yes |
| section-04-link-flow | 01, 02, 03 | 09, 11 | No |
| section-05-channel-gateway | 01, 03 | 07, 08, 11 | Yes |
| section-06-delivery-queue | 01 | 05, 08, 11 | Yes |
| section-07-server-side-chat | 01, 05 | 08, 11 | No |
| section-08-pipeline-hooks | 05, 06, 07 | 11 | No |
| section-09-telegram-commands | 02, 03, 04 | 11 | No |
| section-10-router-extensions | 01 | 11 | Yes |
| section-11-integration-tests | all | - | No |

## Execution Order

1. **Batch 1**: section-01-schema-migration (no dependencies — foundation tables + columns)
2. **Batch 2**: section-02-webhook-handler, section-03-i18n-types, section-06-delivery-queue, section-10-router-extensions (parallel after 01)
3. **Batch 3**: section-04-link-flow, section-05-channel-gateway (after 02+03 and 01+03 respectively)
4. **Batch 4**: section-07-server-side-chat (after 05)
5. **Batch 5**: section-08-pipeline-hooks, section-09-telegram-commands (after 05+06+07 and 02+03+04)
6. **Batch 6**: section-11-integration-tests (final, after all)

## Section Summaries

### section-01-schema-migration
**Plan refs**: Section 3 (Data Model), Section 12 (Data Safety)
**TDD refs**: Data Model tests

Create all 5 new Drizzle tables (`telegram_connections`, `conversation_channels`, `channel_messages`, `telegram_link_tokens`, `telegram_updates`) with correct FK types (split conversation IDs for chat vs agency). Add nullable columns to `messages` and `conversations`. Create Alembic migration for `agency_messages` columns. Run migrations. Verify row counts.

### section-02-webhook-handler
**Plan refs**: Section 4.1 Steps 1-5, Section 6 (Webhook Endpoint), Section 9 (Security)
**TDD refs**: Webhook validation, dedupe, command routing tests

Create `apps/web/server/routes/telegramWebhook.ts` Express route. Implement secret validation, Redis dedupe (with `getCacheClient()`), `telegram_updates` audit insertion, immediate 200 OK response, and async processing dispatch. Register route in `_core/index.ts` before tRPC middleware. Update `setWebhook` URL format and `allowed_updates`.

### section-03-i18n-types
**Plan refs**: Section 10 (Localization), Spec ChatIngressEvent/ChatEgressEvent
**TDD refs**: Localization tests

Create `apps/web/server/services/telegramI18n.ts` with ~20 bilingual strings (Thai + English). Create `apps/web/shared/channelTypes.ts` with `ChatIngressEvent`, `ChatEgressEvent`, and `DeliveryJob` interfaces.

### section-04-link-flow
**Plan refs**: Section 4.3 (/start command), Section 7 (generateTelegramLink extension), Section 13 (Backward Compatibility)
**TDD refs**: Link token security tests, generateTelegramLink tests, compat tests

Implement `/start <token>` handler: validate token, create `telegram_connections` record, optionally create `conversation_channels` binding, set `users.telegramVerified = true`, dual-write old fields. Extend `generateTelegramLink` to accept optional conversation binding and create `telegram_link_tokens` record.

### section-05-channel-gateway
**Plan refs**: Section 2 (Architecture), Section 4.1 Steps 8-11 (Inbound/Outbound flow)
**TDD refs**: channelGateway.test.ts (ingest, emitEgress)

Create `apps/web/server/services/channelGateway.ts`. Implement `ingest(event)` — validate connection, resolve conversation from `activeChannelId`, route to chat or agency pipeline. Implement `emitEgress(event)` — query active channel bindings, enqueue BullMQ jobs for Telegram targets. Handle non-text messages with i18n error. Implement `sendTypingLoop()` helper.

### section-06-delivery-queue
**Plan refs**: Section 5 (Delivery Queue)
**TDD refs**: deliveryQueue.test.ts

Create `apps/web/server/services/deliveryQueue.ts`. Set up BullMQ queue with `getRealtimeClient()`, worker with concurrency 10 and rate limit 25/sec. Implement custom backoff (permanent vs transient vs rate-limited). Implement DLQ handler. Track delivery status in `channel_messages`. Register init/shutdown in `_core/index.ts`.

### section-07-server-side-chat
**Plan refs**: Section 4.1 "Architecture Note: Server-Side Chat Processing", Section 8 (chat.ts Integration)
**TDD refs**: processMessageServerSide tests

Implement `processMessageServerSide()` in the channel gateway. Extract chat context-building and non-streaming LLM call patterns from existing `chat.ts` and `/api/llm/stream`. Save user message → build context → call LLM (non-streaming) → save assistant message → deduct credits → emit egress. Handle errors gracefully.

### section-08-pipeline-hooks
**Plan refs**: Section 8 (Chat and Agency Pipeline Integration), Section 4.2 (Outbound flow)
**TDD refs**: chat.bridge.test.ts, agency.bridge.test.ts

Add `channelGateway.emitEgress()` hook to `chat.ts` `saveAssistantMessage` mutation. Add hook to `agency.ts` `sendMessage` after response save. Both hooks are conditional — only fire if conversation has active channel bindings. Create Telegram message rendering function (HTML formatting, splitting at 4096 chars).

### section-09-telegram-commands
**Plan refs**: Section 4.3 (Command Handling)
**TDD refs**: Resume, unlink, status, help command tests

Implement `/resume` (list conversations, update `activeChannelId`), `/unlink` (inline keyboard confirmation + callback_query handler), `/status`, `/help`, `/start` (no token) commands. All commands use i18n for responses.

### section-10-router-extensions
**Plan refs**: Section 7 (Telegram Router Extensions)
**TDD refs**: telegram.bridge.test.ts

Add new tRPC endpoints to `telegram.ts` router: `getConversationChannelStatus`, `bindConversation`, `unbindConversation`, `adminListConnections`, `adminRevokeConnection`. Extend `checkTelegramStatus` to include connection details and bound conversation count. Extend `unlinkTelegram` to revoke connections and channels.

### section-11-integration-tests
**Plan refs**: Section 14 (Post-Change Validation), Section 11 (Impact and Regression)
**TDD refs**: Integration tests, rendering tests, regression checks

Full round-trip integration tests: Telegram inbound → pipeline → delivery → Telegram outbound. Test both chat and agency pipelines. Verify rendering (HTML, splitting, truncation). Run existing test suites to confirm no regressions. TypeScript check. Verify backward compatibility (old fields still work).
