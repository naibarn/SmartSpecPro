# Code Review Interview — Section 09: WhatsApp + LINE Adapters (F01-B)

## Auto-confirmation mode: User approved all fixes automatically.

## Findings Triage

### Asked User (skipped — auto-confirm mode)
None required. All items auto-triaged.

### Auto-Fixed Items

| # | Severity | Issue | Fix Applied |
|---|----------|-------|-------------|
| H1 | CRITICAL | rawBody never populated — HMAC always returns false in production | Added `verify` callback on express.json for /webhooks route + threaded rawBody through channelWebhook.ts |
| H2 | HIGH | Timing-safe comparison leaks timing info with early length check | Used padding approach (Math.max) matching Telegram adapter pattern |
| H3 | HIGH | WhatsApp lastInboundAt not validated — future timestamps bypass 24h policy | Added guard: reject future timestamps |
| M1 | MEDIUM | Self-registration adapters not imported in index.ts | Added import statements for whatsapp and line adapters |
| M3 | MEDIUM | No try/catch on fetch() in sendMessage | Added try/catch returning { ok: false } on network error |
| L1 | LOW | WhatsApp template fallback uses hardcoded 'hello_world' when no template configured | Returns { ok: false } when outside window and no templateName configured |
| L2 | LOW | LINE follow event test asserts wrong thing (wrapper not function) | Fixed to `expect(result).toBeNull()` |
| L3 | LOW | WhatsApp API version hardcoded at deprecated v18.0 | Updated to v21.0 |

### Let Go (Low Priority / Out of Scope)

| # | Severity | Reason |
|---|----------|--------|
| M2 | MEDIUM | LINE destination field for module channel routing — complex multi-tenant flow, deferred to follow-up section |
| M4 | MEDIUM | LINE replyToken lifetime enforcement (30s TTL) — deferred to follow-up; queue latency tracking required |
