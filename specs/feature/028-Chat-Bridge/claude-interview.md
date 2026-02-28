# 028-Chat-Bridge Interview Transcript

## Q1: Message Routing from Telegram

**Q**: When a user sends a message from Telegram, should the system route it to their most recent active conversation automatically, or always require explicit conversation selection (via /resume or deep link)?

**A**: Require explicit selection — User must use /resume or deep link to target a conversation.

**Impact**: The webhook handler will NOT auto-route messages. Unbound messages (no active conversation binding) will prompt the user to use /resume or generate a new deep link from the web UI. This prevents accidental message routing to wrong conversations.

---

## Q2: Delivery Queue Strategy

**Q**: For Phase 1, should we implement the BullMQ delivery queue immediately, or start with the existing fire-and-forget pattern?

**A**: BullMQ from Phase 1 — Reliable delivery with retry from the start.

**Impact**: Create `apps/web/server/services/deliveryQueue.ts` using existing Redis realtime client. Configure exponential backoff, dead letter queue, and rate limiting (25/sec). This adds ~150 lines of infrastructure code but provides reliable delivery from day one.

---

## Q3: Expected Scale

**Q**: What scale should the system handle at launch?

**A**: Small (< 100 users, < 1K msg/day)

**Impact**: Redis-backed dedupe is sufficient (no need for distributed solutions). In-process rate limiting acceptable as supplement to BullMQ limiter. Single worker instance sufficient. Can simplify monitoring to basic logging + audit events.

---

## Q4: Webhook Endpoint Path

**Q**: Should we use `/api/webhook/telegram` or `/webhooks/telegram/:botId`?

**A**: `/webhooks/telegram/:botId` — Multi-bot ready, cleaner separation from tRPC routes.

**Impact**: Register Express route at `/webhooks/telegram/:botId`. The `:botId` parameter allows future multi-bot support. Admin `setWebhook` endpoint must generate the correct URL format.

---

## Q5: Web Chat Sync Mechanism

**Q**: How should web chat receive updates when a Telegram message is processed?

**A**: TanStack Query invalidation — Simplest approach, invalidate conversation query cache.

**Impact**: After processing a Telegram inbound message and generating a response, the server invalidates the relevant TanStack Query cache key. Web clients auto-refetch on next poll cycle. No SSE infrastructure needed for Phase 1. Latency: up to TanStack Query's `refetchInterval` (typically 5-30 seconds).

---

## Q6: Localization

**Q**: Should Telegram bot messages support Thai language?

**A**: Thai + English — Match existing SmartSpecPro UI which has Thai labels.

**Impact**: Bot responses (confirmations, errors, help text) will be bilingual. Use Telegram user's `language_code` to detect preference, default to Thai for `th` locale, English for all others. Create a small i18n map for bot system messages (~20 strings). LLM-generated content language is controlled by the conversation/skill settings, not the channel.

---

## Summary of Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Routing | Explicit selection | Prevent accidental routing |
| Delivery | BullMQ from Phase 1 | Reliable from day one |
| Scale | Small (<100 users) | Simplifies infrastructure |
| Webhook path | `/webhooks/telegram/:botId` | Multi-bot ready |
| Web sync | TanStack Query invalidation | Simplest, sufficient for Phase 1 |
| Localization | Thai + English | Match existing UI |
