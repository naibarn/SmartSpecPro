Now I have a comprehensive understanding of all the context needed. Let me generate the section content.

# Section 9: F01-B -- WhatsApp + LINE Adapters

## Overview

This section implements two new channel adapters -- WhatsApp and LINE -- that plug into the ChannelAdapter interface and ChannelAdapterRegistry established in Section 5 (Channel Adapter Refactor). Each adapter handles inbound webhook verification, message parsing, and outbound message delivery for its respective platform.

**Dependency:** Section 05 (Channel Adapter Refactor) must be completed first. This section assumes the following exist:
- `apps/web/server/services/channelAdapters/types.ts` -- the `ChannelAdapter` interface
- `apps/web/server/services/channelAdapters/registry.ts` -- the `ChannelAdapterRegistry` singleton
- `apps/web/server/routes/channelWebhook.ts` -- the generalized `POST /webhooks/:channelType/:connectionId` route
- `channel_connections` and `channel_credentials` tables in the database (from Section 01)

**Dependency:** Section 01 (Database Foundation) must be completed first. The `channel_connections` table with channel_type CHECK constraint including `'whatsapp'` and `'line'`, and the `channel_credentials` table for storing encrypted API keys, must exist.

**Feature flag:** Both adapters are gated by `tenants.settings.featureFlags.multiChannel` (F01, default: false).

---

## Files to Create

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/channelAdapters/whatsapp.ts` | WhatsApp adapter implementing ChannelAdapter |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/channelAdapters/line.ts` | LINE adapter implementing ChannelAdapter |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/channelAdapters/__tests__/whatsapp.test.ts` | WhatsApp adapter tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/channelAdapters/__tests__/line.test.ts` | LINE adapter tests |

## Files to Modify

| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/shared/channelTypes.ts` | Expand `channel.type` union to include `'whatsapp'` and `'line'` |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/channelAdapters/registry.ts` | Register WhatsApp and LINE adapters on startup |

---

## Tests First

All tests use Vitest with hoisted mocks, following the existing project test conventions seen in files like `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/channelGateway.test.ts`.

### WhatsApp Adapter Tests

File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/channelAdapters/__tests__/whatsapp.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks for crypto, db, and audit logger
const { mockDecrypt, mockAuditLog } = vi.hoisted(() => ({
  mockDecrypt: vi.fn(),
  mockAuditLog: vi.fn(),
}));

vi.mock("../../crypto", () => ({ decrypt: mockDecrypt }));
vi.mock("../../auditLogger", () => ({ auditLogger: { log: mockAuditLog } }));

describe("WhatsAppAdapter", () => {
  describe("validateWebhook", () => {
    it("should verify webhook signature with HMAC-SHA256 + timingSafeEqual", async () => {
      // Construct a request with valid X-Hub-Signature-256 header
      // The adapter must compute HMAC-SHA256(app_secret, rawBody) and compare
      // using crypto.timingSafeEqual
    });

    it("should reject request with invalid signature", async () => {
      // Tampered body or wrong secret should cause validation to return false
    });

    it("should reject request with missing signature header", async () => {
      // No X-Hub-Signature-256 header should be rejected
    });
  });

  describe("parseInbound", () => {
    it("should parse inbound text message into ChatIngressEvent", async () => {
      // Given a Meta Cloud API webhook payload with messages[0].type === 'text'
      // Should return a properly structured ChatIngressEvent with:
      //   channel.type = 'whatsapp'
      //   message.text = the message body
    });

    it("should parse image message with caption", async () => {
      // messages[0].type === 'image' with caption
    });

    it("should handle status update webhooks gracefully (not a message)", async () => {
      // Statuses array present but no messages array -- should return null/skip
    });
  });

  describe("sendMessage", () => {
    it("should send free-form text within 24h window", async () => {
      // When last_inbound_at is within 24 hours, send text directly
    });

    it("should fall back to template message outside 24h window", async () => {
      // When last_inbound_at is older than 24 hours, must use template
    });
  });

  describe("formatMessage", () => {
    it("should truncate message to WhatsApp limit (4096 chars)", async () => {
      // Messages exceeding 4096 characters should be split into chunks
    });
  });
});
```

### LINE Adapter Tests

File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/channelAdapters/__tests__/line.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDecrypt, mockAuditLog } = vi.hoisted(() => ({
  mockDecrypt: vi.fn(),
  mockAuditLog: vi.fn(),
}));

vi.mock("../../crypto", () => ({ decrypt: mockDecrypt }));
vi.mock("../../auditLogger", () => ({ auditLogger: { log: mockAuditLog } }));

describe("LINEAdapter", () => {
  describe("validateWebhook", () => {
    it("should verify signature with HMAC-SHA256 using channel secret", async () => {
      // LINE uses X-Line-Signature header
      // HMAC-SHA256(channelSecret, rawBody) -> base64 comparison
      // Must use crypto.timingSafeEqual
    });

    it("should verify signature BEFORE body parsing/deserialization", async () => {
      // The adapter must accept raw body buffer and verify before JSON.parse
      // This prevents deserialization attacks on malformed payloads
    });

    it("should reject request with invalid signature", async () => {
      // Tampered body should fail verification
    });
  });

  describe("parseInbound", () => {
    it("should route by destination property for module channel support", async () => {
      // LINE module channels include a 'destination' field indicating which
      // LINE Official Account received the message. The adapter must use this
      // to route to the correct tenant/connection.
    });

    it("should parse text message event", async () => {
      // events[0].type === 'message', events[0].message.type === 'text'
    });

    it("should handle follow/unfollow events", async () => {
      // events[0].type === 'follow' or 'unfollow'
    });
  });

  describe("token refresh", () => {
    it("should refresh short-lived token when expired", async () => {
      // LINE channel access tokens are short-lived
      // The adapter must automatically refresh before making API calls
    });
  });

  describe("sendMessage", () => {
    it("should send reply message using replyToken", async () => {
      // LINE prefers reply tokens (free) over push messages (paid)
    });

    it("should fall back to push message when no replyToken", async () => {
      // When replyToken is expired or unavailable, use push API
    });
  });
});
```

---

## Implementation Details

### 9.1 WhatsApp Adapter

Create `/home/dev/projects/SmartSpecPro/apps/web/server/services/channelAdapters/whatsapp.ts`.

**Critical constraint:** Use ONLY the official Meta Cloud API (HTTP calls). The library `whatsapp-web.js` is BANNED -- it violates Meta's Terms of Service and risks account bans.

#### Webhook Verification

WhatsApp uses the `X-Hub-Signature-256` header containing `sha256=<hex-digest>`. The adapter must:

1. Retrieve the App Secret from `channel_credentials` (stored encrypted via `crypto.ts`).
2. Compute `HMAC-SHA256(appSecret, rawRequestBody)`.
3. Compare the computed hex digest with the header value using `crypto.timingSafeEqual()` -- this is mandatory to prevent timing attacks.
4. The raw request body must be available as a Buffer. The generalized webhook route from Section 05 should provide `req.rawBody` or use `express.raw()` middleware for webhook routes.

Signature structure:

```typescript
import crypto from "crypto";

function verifyWhatsAppSignature(
  rawBody: Buffer,
  signatureHeader: string,
  appSecret: string,
): boolean {
  const expectedSignature = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");
  const receivedSignature = signatureHeader.replace("sha256=", "");
  // Use timing-safe comparison
  const expected = Buffer.from(expectedSignature);
  const received = Buffer.from(receivedSignature);
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
}
```

#### Inbound Message Parsing

Meta Cloud API webhook payloads have this structure:

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "<WABA_ID>",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": { "display_phone_number": "...", "phone_number_id": "..." },
        "contacts": [{ "profile": { "name": "..." }, "wa_id": "..." }],
        "messages": [{
          "from": "<sender_phone>",
          "id": "<message_id>",
          "timestamp": "...",
          "type": "text",
          "text": { "body": "Hello" }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

The adapter's `parseInbound()` must:
- Extract the first message from `entry[0].changes[0].value.messages[0]`.
- Handle status-only webhooks (where `messages` is absent but `statuses` is present) by returning `null`.
- Support message types: `text`, `image`, `audio`, `video`, `document`, `location`.
- Map the sender's phone number (`from` field) to `externalUserId`.
- Map `message.id` to `externalMessageId`.
- Return a `ChatIngressEvent` with `channel.type = 'whatsapp'`.

#### 24-Hour Customer Service Window

WhatsApp enforces a 24-hour window from the customer's last inbound message. Outside this window, businesses can only send pre-approved template messages.

The adapter must:
1. Track the `lastInboundAt` timestamp per connection in `channel_connections.connection_config` JSONB field.
2. Update `lastInboundAt` on every inbound message.
3. In `sendMessage()`, check if `Date.now() - lastInboundAt < 24 * 60 * 60 * 1000`.
4. If within window: send free-form text via the Messages API.
5. If outside window: send a pre-approved template message instead. The template name and language should be configurable per tenant in `channel_credentials.metadata`.

#### Outbound Messages

Send messages via the Meta Cloud API:

```
POST https://graph.facebook.com/v18.0/{phone_number_id}/messages
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "messaging_product": "whatsapp",
  "to": "<recipient_phone>",
  "type": "text",
  "text": { "body": "..." }
}
```

For template messages (outside 24h window):

```json
{
  "messaging_product": "whatsapp",
  "to": "<recipient_phone>",
  "type": "template",
  "template": {
    "name": "<approved_template_name>",
    "language": { "code": "en" },
    "components": [{ "type": "body", "parameters": [{ "type": "text", "text": "..." }] }]
  }
}
```

#### Rate Limiting

Start at Tier 1 (1,000 unique users/day). The adapter should track daily unique recipients per tenant in Redis:

```
Key: whatsapp:daily:{tenantId}:{YYYY-MM-DD}
Type: SET (phone number hashes)
TTL: 86400 (auto-expire at end of day)
```

If the set size reaches 1,000, reject outbound sends with an appropriate error.

#### Phone Number Privacy (NEW-SEC-16)

External user IDs for WhatsApp are phone numbers. Consider hashing them before storage to minimize PII exposure:

```typescript
function hashPhoneNumber(phone: string): string {
  return crypto.createHash("sha256").update(phone).digest("hex");
}
```

Store the hash as `external_user_id` in `channel_connections`. When sending outbound messages, the actual phone number must be stored encrypted in `connection_config` (encrypted at rest via the JSONB field in `channel_connections`).

#### Adapter Class Structure

```typescript
import type { ChannelAdapter, ChannelCapabilities } from "./types";

export class WhatsAppAdapter implements ChannelAdapter {
  readonly channelType = "whatsapp" as const;
  readonly capabilities: ChannelCapabilities = {
    maxMessageLength: 4096,
    supportsButtons: true,
    supportsImages: true,
    supportsAudio: true,
    supportsVideo: true,
    supportsDocuments: true,
    supportsLocation: true,
  };

  async validateWebhook(req: any): Promise<boolean> { /* ... */ }
  async parseInbound(body: any, connectionId: string): Promise<ChatIngressEvent | null> { /* ... */ }
  async sendMessage(connectionId: string, text: string, options?: any): Promise<void> { /* ... */ }
  formatMessage(text: string): string[] { /* split at 4096 chars */ }
  async initialize(): Promise<void> { /* no-op for HTTP-only adapter */ }
  async shutdown(): Promise<void> { /* no-op */ }
}
```

---

### 9.2 LINE Adapter

Create `/home/dev/projects/SmartSpecPro/apps/web/server/services/channelAdapters/line.ts`.

**Dependency:** Install `@line/bot-sdk` with a pinned version in `apps/web/package.json`.

#### Webhook Verification

LINE uses `X-Line-Signature` header containing a Base64-encoded HMAC-SHA256 digest.

**Critical security requirement:** Signature MUST be verified BEFORE the body is parsed or deserialized. This prevents deserialization attacks where a malformed payload could exploit a parsing vulnerability. The generalized webhook route from Section 05 must pass the raw body buffer to the adapter.

```typescript
import crypto from "crypto";

function verifyLineSignature(
  rawBody: Buffer,
  signatureHeader: string,
  channelSecret: string,
): boolean {
  const expectedSignature = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");
  const expected = Buffer.from(expectedSignature);
  const received = Buffer.from(signatureHeader);
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
}
```

#### Module Channel Routing (Multi-Tenant)

LINE supports "module channels" where a single LINE Login channel can manage multiple LINE Official Accounts. This is how SmartSpecPro supports multi-tenant LINE integration with a single app.

Webhook payloads include a `destination` field at the top level:

```json
{
  "destination": "U1234567890abcdef...",
  "events": [
    {
      "type": "message",
      "replyToken": "...",
      "source": { "userId": "U...", "type": "user" },
      "message": { "type": "text", "text": "Hello" }
    }
  ]
}
```

The `destination` is the userId of the LINE Official Account (bot) that received the event. The adapter must:
1. Look up the `channel_credentials` row where `metadata->>'lineDestinationId'` matches the `destination` value.
2. This maps to the correct tenant.
3. Different tenants can have different LINE Official Accounts, all routing through one webhook URL.

**Important:** LINE user IDs differ per LINE Official Account. Never assume a userId is stable across tenants or channels. Always scope user lookups to the specific LINE Official Account.

#### Inbound Message Parsing

LINE webhook events have this structure. The adapter's `parseInbound()` must handle:

- **Message events** (`event.type === 'message'`):
  - `text` -- standard text messages
  - `image`, `video`, `audio` -- media messages (content retrieved via separate API call)
  - `sticker` -- map to a text description or skip
  - `location` -- lat/lng with address
  - `flex` -- rich interactive messages
- **Follow/unfollow events** (`event.type === 'follow'` / `'unfollow'`):
  - Follow: auto-create or reactivate `channel_connections` entry
  - Unfollow: set connection status to `'revoked'`
- **Postback events** (`event.type === 'postback'`):
  - Handle button clicks from rich menus or flex messages

Map to `ChatIngressEvent` with `channel.type = 'line'`.

#### Short-Lived Token Refresh

LINE channel access tokens are short-lived (30 days for v2.1 tokens, or configurable shorter durations). The adapter must:

1. Store the current token and its expiry in `channel_credentials.metadata` (encrypted): `{ token, expiresAt }`.
2. Before any API call, check if `Date.now() > expiresAt - 300000` (refresh 5 minutes before expiry).
3. If refresh needed, call the LINE OAuth endpoint:
   ```
   POST https://api.line.me/oauth2/v2.1/token
   Content-Type: application/x-www-form-urlencoded
   
   grant_type=client_credentials&client_id={channelId}&client_secret={channelSecret}
   ```
4. Store the new token and expiry.
5. Use a Redis lock (`line:token_refresh:{credentialId}`) with 10s TTL to prevent concurrent refresh races.

#### Outbound Messages

LINE has two sending mechanisms:

1. **Reply API** (free, preferred): Uses the `replyToken` from an inbound event. Tokens are valid for ~30 seconds.
   ```
   POST https://api.line.me/v2/bot/message/reply
   Authorization: Bearer {channelAccessToken}
   Content-Type: application/json
   
   {
     "replyToken": "...",
     "messages": [{ "type": "text", "text": "..." }]
   }
   ```

2. **Push API** (costs messaging credits): Used when no valid replyToken is available.
   ```
   POST https://api.line.me/v2/bot/message/push
   Authorization: Bearer {channelAccessToken}
   Content-Type: application/json
   
   {
     "to": "<userId>",
     "messages": [{ "type": "text", "text": "..." }]
   }
   ```

The adapter should:
1. Attempt reply first if a recent `replyToken` is cached (store in Redis with 25s TTL keyed by `line:reply:{eventSourceUserId}`).
2. Fall back to push if reply fails or no token available.
3. Support text messages, flex messages (for rich content), and quick replies.

LINE message limit: 5 messages per single API call, each text message max 5,000 characters.

#### Adapter Class Structure

```typescript
import type { ChannelAdapter, ChannelCapabilities } from "./types";

export class LINEAdapter implements ChannelAdapter {
  readonly channelType = "line" as const;
  readonly capabilities: ChannelCapabilities = {
    maxMessageLength: 5000,
    supportsButtons: true,      // via flex messages
    supportsImages: true,
    supportsAudio: true,
    supportsVideo: true,
    supportsDocuments: false,    // LINE doesn't support file sharing in the same way
    supportsLocation: true,
    supportsRichMenus: true,     // LINE-specific capability
    supportsQuickReplies: true,  // LINE-specific capability
  };

  async validateWebhook(req: any): Promise<boolean> { /* ... */ }
  async parseInbound(body: any, connectionId: string): Promise<ChatIngressEvent | null> { /* ... */ }
  async sendMessage(connectionId: string, text: string, options?: any): Promise<void> { /* ... */ }
  formatMessage(text: string): string[] { /* split at 5000 chars, max 5 per call */ }
  async initialize(): Promise<void> { /* no-op -- token refresh is lazy */ }
  async shutdown(): Promise<void> { /* no-op */ }
}
```

---

## Shared Type Updates

Update `/home/dev/projects/SmartSpecPro/apps/web/shared/channelTypes.ts`:

The `ChatIngressEvent.channel.type` union must be expanded from `"web" | "telegram"` to `"web" | "telegram" | "whatsapp" | "line"`. Similarly, `ChatEgressTarget.channelType` must include the new types.

```typescript
// In ChatIngressEvent
channel: {
  type: "web" | "telegram" | "whatsapp" | "line";
  connectionId?: string;
  externalChatId?: string;
  externalMessageId?: string;
};

// In ChatEgressTarget
channelType: "web" | "telegram" | "whatsapp" | "line";
```

The `DeliveryJob` interface should also gain a `channelType` field (this may already be done by Section 05's delivery queue refactor):

```typescript
export interface DeliveryJob {
  channelMessageId: string;
  chatId: string;
  text: string;
  parseMode: "HTML" | "plain";
  replyToMessageId?: string;
  conversationId: string;
  tenantId: string;
  channelType: "telegram" | "whatsapp" | "line";
}
```

---

## Adapter Registration

In `/home/dev/projects/SmartSpecPro/apps/web/server/services/channelAdapters/registry.ts`, add imports and registrations for both adapters:

```typescript
import { WhatsAppAdapter } from "./whatsapp";
import { LINEAdapter } from "./line";

// During registry initialization:
registry.register(new WhatsAppAdapter());
registry.register(new LINEAdapter());
```

Adapters self-register. The registry's `get("whatsapp")` and `get("line")` should then return the respective instances. Both adapters are lazy (HTTP-only, no persistent connections), so `initialize()` and `shutdown()` are no-ops.

---

## Credential Storage

Both adapters retrieve their credentials from the `channel_credentials` table. Credentials are stored encrypted via `crypto.ts` (AES-256-GCM).

**WhatsApp credentials** (stored in `credentials_encrypted`):
- `accessToken` -- Meta Cloud API permanent access token
- `appSecret` -- used for webhook signature verification
- `phoneNumberId` -- the WhatsApp Business phone number ID
- `wabaId` -- WhatsApp Business Account ID

**WhatsApp metadata** (stored in `metadata` JSONB, not encrypted):
- `templateName` -- default approved template name for out-of-window messages
- `templateLanguage` -- template language code (e.g., "en")
- `tier` -- current messaging tier (1, 2, 3, 4)

**LINE credentials** (stored in `credentials_encrypted`):
- `channelId` -- LINE channel ID
- `channelSecret` -- used for webhook signature verification
- `channelAccessToken` -- current access token (refreshed periodically)
- `tokenExpiresAt` -- ISO timestamp of token expiry

**LINE metadata** (stored in `metadata` JSONB, not encrypted):
- `lineDestinationId` -- the LINE Official Account userId (for module channel routing)
- `officialAccountName` -- display name

All credential reads go through `decrypt()` from `apps/web/server/services/crypto.ts`. All credential writes go through `encrypt()`. Credentials are cached per adapter instance with a short TTL (60 seconds, matching the pattern in `deliveryQueue.ts`).

---

## Security Considerations

1. **HMAC verification with timingSafeEqual** -- Both adapters MUST use `crypto.timingSafeEqual()` for all signature comparisons. Never use `===` for HMAC comparison as it leaks timing information.

2. **Raw body preservation** -- Both platforms require the raw request body (as a Buffer) for signature verification. The webhook route must use `express.raw({ type: 'application/json' })` or equivalent middleware, and pass the raw body to `adapter.validateWebhook()`.

3. **LINE: Verify BEFORE parse** -- The LINE adapter must verify the webhook signature against the raw body bytes BEFORE calling `JSON.parse()`. This prevents deserialization attacks.

4. **Phone number privacy (WhatsApp)** -- Store hashed phone numbers as `external_user_id`. Store the actual phone number encrypted in `connection_config` only when needed for outbound messaging.

5. **Token storage** -- LINE access tokens and WhatsApp access tokens are stored encrypted in `channel_credentials.credentials_encrypted`. Never log token values; log only credential IDs.

6. **Feature flag enforcement** -- Both adapters should check `tenants.settings.featureFlags.multiChannel` before processing. The generalized webhook route should perform this check before delegating to the adapter.

---

## Error Handling

Both adapters should follow the existing patterns from the Telegram adapter and channel gateway:

- **Webhook validation failure**: Return `false` from `validateWebhook()`. The webhook route returns 403.
- **Parse failure**: Return `null` from `parseInbound()`. Log an audit event with `eventType: "channel_adapter_parse_error"`.
- **Send failure (transient)**: Throw an error. The delivery queue's BullMQ retry logic handles retries with exponential backoff.
- **Send failure (permanent)**: Throw an `UnrecoverableError` (from BullMQ). The delivery queue moves the job to the dead-letter queue.
- **Rate limit exceeded**: Log and reject. For WhatsApp, return a 429-equivalent status. For LINE, respect the `X-RateLimit-*` response headers.

Permanent error patterns for WhatsApp:
- HTTP 400: Invalid request (bad phone number, expired template, etc.)
- HTTP 401: Invalid access token

Permanent error patterns for LINE:
- HTTP 400: Invalid request
- HTTP 401: Invalid channel access token (trigger refresh, then retry once)
- HTTP 429: Rate limited (respect `Retry-After` header)

---

## Testing Strategy

Tests mock external HTTP calls (Meta Cloud API, LINE API) and database queries. The test structure follows the existing patterns in `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/channelGateway.test.ts`:

1. Use `vi.hoisted()` for mock setup.
2. Mock `../../db` with `mockSelect`/`mockInsert`/`mockUpdate`.
3. Mock `../../crypto` with `mockDecrypt` returning test credentials.
4. Mock `../../auditLogger` to capture log calls.
5. Use `node:crypto` directly (not mocked) for HMAC computation in test fixtures to generate valid signatures.

The tests verify:
- Signature verification correctness (valid and invalid cases)
- Message parsing for each supported message type
- 24h window logic (WhatsApp)
- Module channel routing (LINE)
- Token refresh behavior (LINE)
- Proper error handling and audit logging