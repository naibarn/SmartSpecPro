I now have all the context needed. Let me generate the section content.

# Section 13: F01-C -- Slack + Discord Adapters

## Overview

This section implements two new channel adapters -- Slack and Discord -- that plug into the ChannelAdapter interface and ChannelAdapterRegistry established by section-05. Both adapters allow tenants to connect their Slack workspaces or Discord guilds to SmartSpecPro, enabling users to interact with chat and agency pipelines from these platforms.

**Feature flag:** Gated by `tenants.settings.featureFlags.multiChannel` (same flag as all channel features from F01).

### Dependencies

| Dependency | What It Provides |
|---|---|
| **section-01-database** | `channel_connections` and `channel_credentials` tables with CHECK constraints for `'slack'` and `'discord'` channel types |
| **section-05-channel-adapter** | `ChannelAdapter` interface, `ChannelAdapterRegistry`, generalized webhook route `POST /webhooks/:channelType/:connectionId`, adapter-aware `deliveryQueue.ts`, updated `channelGateway.ts` |
| **section-14-feature-flags** | `multiChannel` feature flag enforcement at tRPC/Express/UI levels |

### Files to Create

| File | Purpose |
|---|---|
| `apps/web/server/services/channelAdapters/slack.ts` | Slack adapter implementing ChannelAdapter |
| `apps/web/server/services/channelAdapters/discord.ts` | Discord adapter implementing ChannelAdapter |
| `apps/web/server/services/channelAdapters/__tests__/slack.test.ts` | Slack adapter tests |
| `apps/web/server/services/channelAdapters/__tests__/discord.test.ts` | Discord adapter tests |

### Files to Modify

| File | Change |
|---|---|
| `apps/web/shared/channelTypes.ts` | Add `'slack'` and `'discord'` to channel type unions |
| `apps/web/server/services/channelAdapters/registry.ts` | Register Slack and Discord adapters |
| `apps/web/server/services/deliveryQueue.ts` | Ensure adapter-aware delivery works with Slack/Discord job types |

### NPM Dependencies to Install

| Package | Version | Purpose |
|---|---|---|
| `@slack/bolt` | `^3.x` (pin exact) | Slack app framework with OAuth, event handling, signing secret verification |
| `discord.js` | `^14.x` (pin exact) | Discord bot library with Gateway WebSocket, slash commands, guild management |

---

## Tests (Write First)

### File: `apps/web/server/services/channelAdapters/__tests__/slack.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Slack Channel Adapter Tests
 *
 * Tests cover:
 * - HMAC-SHA256 signing secret verification using timingSafeEqual
 * - Multi-tenant OAuth installationStore (save/fetch/delete)
 * - Block Kit rich message formatting
 */

// Mock dependencies
const mocks = vi.hoisted(() => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
  decrypt: vi.fn((v: string) => `decrypted_${v}`),
  encrypt: vi.fn((v: string) => `encrypted_${v}`),
  auditLogger: { log: vi.fn() },
  timingSafeEqual: vi.fn(),
}));

vi.mock("../../../db", () => ({ db: mocks.db }));
vi.mock("../../crypto", () => ({
  decrypt: mocks.decrypt,
  encrypt: mocks.encrypt,
}));
vi.mock("../../auditLogger", () => ({ auditLogger: mocks.auditLogger }));

describe("SlackAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validateWebhook (signing secret)", () => {
    it("should verify request signature with HMAC-SHA256 and timingSafeEqual", async () => {
      /**
       * Slack sends X-Slack-Signature header as v0=<hex HMAC-SHA256>
       * Computed over: v0:{timestamp}:{rawBody}
       * Must use crypto.timingSafeEqual for comparison.
       */
    });

    it("should reject request with invalid signature", async () => {
      /**
       * When the computed HMAC does not match the header value,
       * validateWebhook must return { valid: false }.
       */
    });

    it("should reject request with stale timestamp (>5 min)", async () => {
      /**
       * Slack recommends rejecting requests where X-Slack-Request-Timestamp
       * is more than 5 minutes old (replay protection).
       */
    });
  });

  describe("installationStore (multi-tenant OAuth)", () => {
    it("should save installation data to channel_credentials keyed by team_id", async () => {
      /**
       * storeInstallation receives Slack installation data (bot token, team_id, etc.).
       * Must encrypt bot_token and store in channel_credentials with
       * channelType='slack' and metadata containing team_id.
       */
    });

    it("should fetch installation by team_id from channel_credentials", async () => {
      /**
       * fetchInstallation receives { teamId }.
       * Must query channel_credentials where channelType='slack'
       * and metadata.team_id matches, then decrypt the credentials.
       */
    });

    it("should delete installation and revoke associated connections", async () => {
      /**
       * deleteInstallation must remove the channel_credentials row
       * and set all related channel_connections to status='revoked'.
       */
    });
  });

  describe("formatMessage (Block Kit)", () => {
    it("should format plain text as Block Kit section block", async () => {
      /**
       * Simple text should be wrapped in a Block Kit section with mrkdwn.
       * Output: { blocks: [{ type: "section", text: { type: "mrkdwn", text: "..." } }] }
       */
    });

    it("should split messages exceeding 3000 chars into multiple blocks", async () => {
      /**
       * Slack Block Kit text blocks have a 3000-char limit.
       * Long messages must be split across multiple section blocks.
       */
    });

    it("should escape Slack mrkdwn special characters", async () => {
      /**
       * Characters &, <, > must be escaped for Slack mrkdwn format.
       */
    });
  });

  describe("sendMessage", () => {
    it("should call Slack Web API chat.postMessage with correct channel and blocks", async () => {
      /**
       * sendMessage must resolve the Slack bot token from channel_credentials,
       * format the message as Block Kit, and call chat.postMessage.
       */
    });

    it("should handle rate limiting gracefully with retry", async () => {
      /**
       * Slack returns 429 with Retry-After header.
       * Adapter should respect rate limits and retry after the specified delay.
       */
    });
  });

  describe("parseInbound", () => {
    it("should parse Slack event_callback message into ChatIngressEvent", async () => {
      /**
       * Given a Slack Events API payload with type=event_callback and
       * event.type=message, parseInbound must return a valid ChatIngressEvent
       * with the correct text, userId, and channel metadata.
       */
    });

    it("should ignore bot messages to prevent loops", async () => {
      /**
       * Messages with event.bot_id or event.subtype=bot_message
       * must return null (no processing).
       */
    });
  });
});
```

### File: `apps/web/server/services/channelAdapters/__tests__/discord.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Discord Channel Adapter Tests
 *
 * Tests cover:
 * - Gateway connection with correct intents
 * - Slash command routing to guild handler
 * - Per-guild configuration from database
 */

const mocks = vi.hoisted(() => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
  decrypt: vi.fn((v: string) => `decrypted_${v}`),
  encrypt: vi.fn((v: string) => `encrypted_${v}`),
  auditLogger: { log: vi.fn() },
  discordClient: {
    login: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
    guilds: { cache: new Map() },
    user: { id: "bot-id" },
  },
}));

vi.mock("../../../db", () => ({ db: mocks.db }));
vi.mock("../../crypto", () => ({
  decrypt: mocks.decrypt,
  encrypt: mocks.encrypt,
}));
vi.mock("../../auditLogger", () => ({ auditLogger: mocks.auditLogger }));

describe("DiscordAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initialize (gateway connection)", () => {
    it("should connect with GatewayIntentBits.Guilds and GuildMessages", async () => {
      /**
       * The Discord client must be created with intents:
       * [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
       *
       * MessageContent intent should NOT be requested unless explicitly
       * configured, as it requires verification for bots in 100+ guilds.
       */
    });

    it("should register message and interactionCreate event handlers", async () => {
      /**
       * On initialize, adapter must register handlers for:
       * - 'messageCreate' (for text messages in configured channels)
       * - 'interactionCreate' (for slash commands)
       */
    });
  });

  describe("slash command routing", () => {
    it("should route slash command interactions to correct guild handler", async () => {
      /**
       * When a slash command interaction is received, the adapter must:
       * 1. Look up guild config from channel_credentials by guildId
       * 2. Route to the correct conversation/agency based on config
       * 3. Call channelGateway.ingest with proper ChatIngressEvent
       */
    });

    it("should reply with error if guild is not configured", async () => {
      /**
       * If no channel_credentials row exists for the interaction's guildId,
       * respond with ephemeral message explaining the guild is not set up.
       */
    });
  });

  describe("per-guild configuration", () => {
    it("should load configuration from channel_credentials by guildId", async () => {
      /**
       * Guild config stored in channel_credentials.metadata as JSON:
       * { guild_id, channel_id, linked_conversation_id, ... }
       * Must be loadable per guild.
       */
    });

    it("should handle missing guild config gracefully", async () => {
      /**
       * When a message arrives from an unconfigured guild,
       * the adapter should ignore it (not crash).
       */
    });
  });

  describe("sendMessage", () => {
    it("should send message to correct Discord channel", async () => {
      /**
       * sendMessage must resolve the guild and channel from the connection,
       * then send the formatted text to the correct TextChannel.
       */
    });

    it("should split messages exceeding 2000 chars", async () => {
      /**
       * Discord has a 2000-char message limit.
       * Long messages must be split into multiple messages.
       */
    });
  });

  describe("parseInbound", () => {
    it("should parse Discord message into ChatIngressEvent", async () => {
      /**
       * Given a discord.js Message object, parseInbound must return
       * a valid ChatIngressEvent with text, userId (from connection lookup),
       * and channel metadata including guildId.
       */
    });

    it("should ignore messages from bots", async () => {
      /**
       * Messages where author.bot === true must return null.
       */
    });
  });

  describe("shutdown", () => {
    it("should destroy the Discord client gracefully", async () => {
      /**
       * shutdown() must call client.destroy() and clean up event listeners.
       */
    });
  });
});
```

---

## Implementation Details

### 13.1 Slack Adapter

Create `apps/web/server/services/channelAdapters/slack.ts`.

#### Architecture

The Slack adapter uses the `@slack/bolt` SDK for:
- **OAuth multi-tenant installation** via a custom `installationStore`
- **Event handling** via Events API (webhook-based)
- **HMAC-SHA256 signing secret verification** for webhook security
- **Block Kit** for rich message formatting

The adapter is NOT a standalone Bolt app server. Instead, it integrates with the existing Express webhook route established by section-05 (`POST /webhooks/slack/:connectionId`). The Bolt app instance is used for its OAuth flow and API client, while webhook verification and event routing happen through the ChannelAdapter interface.

#### Signing Secret Verification

Slack signs every webhook request with a signing secret using HMAC-SHA256. The adapter's `validateWebhook` method must:

1. Read `X-Slack-Request-Timestamp` header -- reject if older than 5 minutes (replay protection)
2. Construct the signing base string: `v0:{timestamp}:{rawBody}`
3. Compute HMAC-SHA256 using the tenant's signing secret (decrypted from `channel_credentials.credentials_encrypted`)
4. Compare against `X-Slack-Signature` header using `crypto.timingSafeEqual()`

```typescript
// Signature verification pseudocode (key logic, not full implementation)
function validateSlackSignature(
  rawBody: string,
  timestamp: string,
  signature: string,
  signingSecret: string,
): boolean {
  // Replay protection: reject timestamps older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  const baseString = `v0:${timestamp}:${rawBody}`;
  const computed = "v0=" + crypto
    .createHmac("sha256", signingSecret)
    .update(baseString)
    .digest("hex");

  // Timing-safe comparison
  const a = Buffer.from(computed);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
```

#### Multi-Tenant OAuth installationStore

Slack OAuth produces per-workspace installation data (bot token, team ID, bot user ID, etc.). The adapter implements a custom `installationStore` that persists to the `channel_credentials` table:

- **storeInstallation(installation)**: Encrypt the bot token and user token (if present) using `encrypt()` from `crypto.ts`. Store in `channel_credentials` with `channelType='slack'`, tenant scoping based on OAuth state parameter (which should encode the tenant ID).
- **fetchInstallation({ teamId })**: Query `channel_credentials` where `channelType='slack'` and `metadata->>'team_id' = teamId`. Decrypt the credentials. Return the Installation object.
- **deleteInstallation({ teamId })**: Delete the `channel_credentials` row. Update all `channel_connections` with matching team config to `status='revoked'`.

Credentials storage format in `channel_credentials.credentials_encrypted`:
```
encrypt(JSON.stringify({
  botToken: "xoxb-...",
  botId: "B0...",
  botUserId: "U0...",
  teamId: "T0...",
  teamName: "...",
  userToken: "xoxp-..." // optional, if user scopes requested
}))
```

#### Block Kit Message Formatting

The `formatMessage` method converts plain text to Slack Block Kit format:

- Wrap text in section blocks with `mrkdwn` type
- Split at 3000 characters per block (Slack's block text limit)
- Escape `&`, `<`, `>` for mrkdwn safety
- Support optional metadata (e.g., conversation link button via actions block)

```typescript
// formatMessage signature
formatMessage(text: string, options?: { webUrl?: string }): {
  blocks: Array<{ type: string; text?: { type: string; text: string }; [key: string]: unknown }>;
}
```

#### 2025 Rate Limit Awareness

Non-Marketplace Slack apps are limited to 1 request/minute for `conversations.history`. The adapter must:

- NOT call `conversations.history` for regular message processing
- Use Events API push model instead of polling
- If history fetch is needed (e.g., context loading), cache aggressively and respect rate limits
- Track rate limit headers (`X-RateLimit-Remaining`, `Retry-After`) and implement backoff

#### Inbound Event Processing

The Slack Events API sends events as HTTP POST to the webhook URL. Key event types to handle:

- `url_verification`: Return the challenge value (required for initial webhook setup)
- `event_callback` with `event.type = 'message'`: Parse into `ChatIngressEvent` and send to `channelGateway.ingest()`

Bot message filtering is critical to prevent infinite loops:
- Ignore messages where `event.bot_id` is set
- Ignore messages with `event.subtype` of `bot_message`, `message_changed`, `message_deleted`

#### Adapter Class Skeleton

```typescript
import type { ChannelAdapter, ChannelCapabilities } from "./types";

export class SlackAdapter implements ChannelAdapter {
  readonly channelType = "slack" as const;

  readonly capabilities: ChannelCapabilities = {
    maxMessageLength: 40000, // Block Kit total
    maxBlockTextLength: 3000,
    supportsButtons: true,
    supportsThreads: true,
    supportsFiles: true,
    supportsReactions: true,
  };

  async initialize(): Promise<void> { /* ... */ }
  async shutdown(): Promise<void> { /* ... */ }
  async validateWebhook(req: any): Promise<{ valid: boolean; reason?: string }> { /* ... */ }
  async parseInbound(body: any, headers: any): Promise<ChatIngressEvent | null> { /* ... */ }
  async sendMessage(connectionId: string, text: string, options?: any): Promise<void> { /* ... */ }
  formatMessage(text: string, options?: any): any { /* ... */ }
  async testConnection(credentialId: string): Promise<{ ok: boolean; error?: string }> { /* ... */ }
}
```

### 13.2 Discord Adapter

Create `apps/web/server/services/channelAdapters/discord.ts`.

#### Architecture

Discord uses a **persistent WebSocket connection** (Gateway) rather than HTTP webhooks for receiving messages. This is fundamentally different from Telegram/Slack/WhatsApp/LINE adapters.

Key design decisions:
- **Single bot instance** serves all guilds (tenants). Discord bots are inherently multi-guild.
- **Per-guild configuration** stored in `channel_credentials` with `metadata.guild_id` as the lookup key.
- **Shared BullMQ worker** process hosts the Discord client to minimize resource overhead (the server has limited RAM/CPU). Do NOT spawn a dedicated process.
- **Slash commands preferred** over message content parsing. This avoids needing the `MessageContent` privileged intent (required for bots in 100+ guilds and requires Discord verification).
- **Sharding-aware design**: Not needed until 2,500+ guilds, but the adapter should store `shardId` in metadata and use `client.options.shardCount` awareness so future sharding is a configuration change, not a code rewrite.

#### Gateway Intents

```typescript
import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    // DO NOT add MessageContent unless explicitly needed and configured
  ],
});
```

The `GuildMessages` intent allows receiving message events, but without `MessageContent` the message content will be empty for non-slash-command messages. This is intentional -- slash commands are the primary interaction model.

If a tenant explicitly enables message-based interaction (for small guild counts where verification is not needed), the `MessageContent` intent can be added conditionally.

#### Slash Command Registration

On startup (or when a guild is newly configured), register slash commands:

```typescript
// Commands to register per guild
const commands = [
  {
    name: "ask",
    description: "Send a message to the AI assistant",
    options: [
      {
        name: "message",
        description: "Your message",
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: "status",
    description: "Check your connection status",
  },
];
```

Commands are registered per-guild (not globally) using `guild.commands.set()` so they are available immediately without the 1-hour global propagation delay.

#### Per-Guild Configuration

Each configured guild has a row in `channel_credentials`:

```
channelType: 'discord'
tenantId: '<tenant UUID>'
credentials_encrypted: encrypt(JSON.stringify({ botToken: '...' }))
metadata: {
  guild_id: '123456789',
  channel_id: '987654321',       // Designated bot channel
  linked_agency_id: '...',       // Optional: default agency to route to
  linked_conversation_id: '...', // Optional: default chat conversation
  commands_registered: true,
  commands_registered_at: '2026-03-01T...'
}
```

The bot token is shared across all guilds (one bot application), but stored per-tenant credential row for isolation. If multiple tenants share the same bot, the bot token row is duplicated per tenant -- this is simpler and more secure than sharing credentials across tenants.

#### Message Flow (Slash Commands)

1. User runs `/ask message:Hello` in a configured Discord channel
2. `interactionCreate` event fires on the discord.js client
3. Adapter looks up guild config from `channel_credentials` by `interaction.guildId`
4. If guild not configured: reply with ephemeral error message
5. If configured: look up or create `channel_connections` for this Discord user + guild
6. Create `ChatIngressEvent` and call `channelGateway.ingest(event)`
7. Reply with "Processing..." (deferred reply), then edit with the response when available

#### Message Flow (Text Messages -- Optional)

If `MessageContent` intent is enabled and guild config allows it:
1. `messageCreate` event fires
2. Filter: ignore bot messages (`message.author.bot === true`)
3. Filter: only process messages in the configured `channel_id`
4. Same flow as slash commands from step 3 onward

#### Send Message (Egress)

When `deliveryQueue` dispatches a Discord delivery job:

1. Resolve the guild and channel from the connection's `channel_connections` record
2. Fetch the channel object: `client.channels.fetch(channelId)`
3. Split message at Discord's 2000-character limit
4. Send each chunk via `channel.send(chunk)`

The Discord character limit splitting logic:

```typescript
function splitForDiscord(text: string): string[] {
  const MAX_LEN = 2000;
  if (text.length <= MAX_LEN) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_LEN) {
      chunks.push(remaining);
      break;
    }
    const splitAt = remaining.lastIndexOf("\n", MAX_LEN);
    const cutPoint = splitAt > MAX_LEN * 0.5 ? splitAt : MAX_LEN;
    chunks.push(remaining.slice(0, cutPoint));
    remaining = remaining.slice(cutPoint);
  }
  return chunks;
}
```

#### Lazy Initialization

The Discord client is expensive (persistent WebSocket). The adapter follows lazy initialization:

1. On server startup, do NOT connect to Discord Gateway automatically
2. On first request to a Discord-related endpoint, or when the `multiChannel` feature flag is checked and Discord credentials exist, call `initialize()`
3. Connection is maintained for the lifetime of the server process
4. On shutdown, call `client.destroy()` to cleanly disconnect

#### Adapter Class Skeleton

```typescript
import type { ChannelAdapter, ChannelCapabilities } from "./types";
import { Client, GatewayIntentBits, Events } from "discord.js";

export class DiscordAdapter implements ChannelAdapter {
  readonly channelType = "discord" as const;
  private client: Client | null = null;
  private initialized = false;

  readonly capabilities: ChannelCapabilities = {
    maxMessageLength: 2000,
    supportsButtons: true,  // Discord buttons via ActionRow
    supportsThreads: true,  // Discord threads
    supportsFiles: true,
    supportsReactions: true,
    supportsSlashCommands: true,
  };

  async initialize(): Promise<void> {
    /** Create Client with intents, register event handlers, login. */
  }

  async shutdown(): Promise<void> {
    /** Call client.destroy(), set initialized = false. */
  }

  async validateWebhook(req: any): Promise<{ valid: boolean; reason?: string }> {
    /**
     * Discord does NOT use HTTP webhooks for bot events (uses Gateway WebSocket).
     * This method handles Discord Interactions endpoint verification if using
     * HTTP interactions (Ed25519 signature verification).
     * For Gateway-based bots, this is a no-op returning { valid: true }.
     */
  }

  async parseInbound(body: any, headers: any): Promise<ChatIngressEvent | null> {
    /**
     * For Gateway-based events, parsing happens in the event handlers.
     * This method is primarily for HTTP interaction endpoint payloads.
     */
  }

  async sendMessage(connectionId: string, text: string, options?: any): Promise<void> {
    /** Resolve channel, split text, send via client. */
  }

  formatMessage(text: string, options?: any): string {
    /** Discord uses Markdown natively. Minimal transformation needed. */
  }

  async testConnection(credentialId: string): Promise<{ ok: boolean; error?: string }> {
    /** Verify bot token is valid and can access the configured guild. */
  }

  /** Register slash commands for a specific guild */
  async registerGuildCommands(guildId: string): Promise<void> { /* ... */ }
}
```

---

### Shared Type Updates

Update `apps/web/shared/channelTypes.ts` to include Slack and Discord in the channel type unions:

- `ChatIngressEvent.channel.type`: Add `'slack'` and `'discord'` to the union: `"web" | "telegram" | "slack" | "discord"`
- `ChatEgressTarget.channelType`: Same union update
- `DeliveryJob`: Add optional `channelType` field (already planned in section-05, but ensure `'slack'` and `'discord'` are included)

### Adapter Registration

In `apps/web/server/services/channelAdapters/registry.ts` (created by section-05), register the new adapters:

```typescript
import { SlackAdapter } from "./slack";
import { DiscordAdapter } from "./discord";

// Lazy registration — adapters initialize on first use
registry.register(new SlackAdapter());
registry.register(new DiscordAdapter());
```

The registry should support lazy initialization: adapters are registered but their `initialize()` method is NOT called until first use. This is especially important for Discord since its WebSocket connection is resource-intensive.

### Delivery Queue Integration

The `deliveryQueue.ts` (modified by section-05) routes delivery jobs through the adapter registry. Ensure:

- `DeliveryJob.channelType` is set to `'slack'` or `'discord'` for the respective adapters
- The worker calls `adapterRegistry.get(job.channelType).sendMessage()` instead of `sendTelegramMessage()` directly
- Rate limiting respects per-platform limits (Slack: 1 req/sec per method per workspace; Discord: 5 req/sec per channel)
- DLQ and retry logic remains adapter-agnostic

### Resource Considerations

Given the constrained server environment (single server, limited RAM/CPU):

- **Slack**: Stateless HTTP-based (Events API). Minimal resource overhead. Each webhook request is independent.
- **Discord**: Persistent WebSocket. The `discord.js` client maintains a heartbeat and caches guild/channel data. Memory usage grows with guild count. For the target scale (20-100 tenants), a single unsharded client is sufficient.
- **Shared worker**: The Discord client should run within the existing BullMQ worker process, not as a dedicated process. Initialize it when the first Discord credential is detected.
- **Lazy initialization**: Both adapters should only connect/initialize when credentials exist and the `multiChannel` feature flag is enabled for at least one tenant.

### Security Considerations

1. **Slack signing secret**: Store encrypted in `channel_credentials.credentials_encrypted`. Decrypt only during webhook validation. Never log the secret value.
2. **Discord bot token**: Store encrypted. The token grants full bot permissions -- treat with the same care as API keys.
3. **OAuth tokens (Slack)**: Bot tokens (`xoxb-`) and user tokens (`xoxp-`) must be encrypted before storage. Never include in logs or audit trails.
4. **Bot message filtering**: Both adapters MUST filter out messages from bots (including their own) to prevent infinite message loops.
5. **Tenant isolation**: Slack team_id and Discord guild_id must be mapped to exactly one tenant. Cross-tenant access is prevented by the `channel_credentials.tenant_id` FK constraint.
6. **Feature flag gating**: All Slack/Discord endpoints and event handlers must check `multiChannel` feature flag before processing.