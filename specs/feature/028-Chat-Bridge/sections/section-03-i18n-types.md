Now I have enough context. Let me produce the section content.

# Section 03: i18n Strings and Shared Channel Types

## Goal

Create two new files that provide foundational shared contracts for the entire Chat Bridge feature:

1. **`/home/dev/projects/SmartSpecPro/apps/web/server/services/telegramI18n.ts`** -- Bilingual bot message strings (Thai + English) used by the webhook handler, command handlers, and channel gateway throughout later sections.
2. **`/home/dev/projects/SmartSpecPro/apps/web/shared/channelTypes.ts`** -- TypeScript interfaces (`ChatIngressEvent`, `ChatEgressEvent`, `DeliveryJob`) that define the message contracts flowing between the webhook handler, channel gateway, delivery queue, and pipeline hooks.

These two files have no runtime logic beyond a simple `getMessage()` lookup function. They are pure types and data, which is why they can be implemented in parallel with other Batch 2 sections.

## Dependencies

- **section-01-schema-migration** must be completed first. The types reference table column names and foreign key shapes defined in the schema (e.g., `conversationType: "chat" | "agency"`, `channelType: "web" | "telegram"`, `syncMode: "two_way" | "notify_only"`). No runtime dependency on the tables existing, but the types should be consistent with the schema.

## Files Created

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/telegramI18n.ts` | ~20 bilingual bot messages |
| `/home/dev/projects/SmartSpecPro/apps/web/shared/channelTypes.ts` | Shared TypeScript interfaces |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/telegramI18n.test.ts` | i18n unit tests |

## Files Modified

None. These are new standalone files.

---

## Tests (Write First)

### Test file: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/telegramI18n.test.ts`

This test file verifies the i18n module. It follows the project's Vitest conventions (see existing test files in `apps/web/server/services/__tests__/`).

```typescript
import { describe, it, expect } from "vitest";
import { getMessage, ALL_MESSAGE_KEYS } from "../telegramI18n";

describe("telegramI18n", () => {
  it("returns Thai text for language_code 'th'", () => {
    const result = getMessage("link_success", "th");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    // Verify it's actually Thai (contains Thai characters)
    expect(/[\u0E00-\u0E7F]/.test(result)).toBe(true);
  });

  it("returns English text for language_code 'en'", () => {
    const result = getMessage("link_success", "en");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    // Verify it's NOT Thai
    expect(/[\u0E00-\u0E7F]/.test(result)).toBe(false);
  });

  it("returns English text for unknown language_code", () => {
    const result = getMessage("link_success", "fr");
    const enResult = getMessage("link_success", "en");
    expect(result).toBe(enResult);
  });

  it("returns English text for undefined language_code", () => {
    const result = getMessage("link_success", undefined);
    const enResult = getMessage("link_success", "en");
    expect(result).toBe(enResult);
  });

  it("all message keys have both 'th' and 'en' translations", () => {
    for (const key of ALL_MESSAGE_KEYS) {
      const th = getMessage(key, "th");
      const en = getMessage(key, "en");
      expect(th, `Missing Thai translation for '${key}'`).toBeTruthy();
      expect(en, `Missing English translation for '${key}'`).toBeTruthy();
    }
  });

  it("no message string is empty", () => {
    for (const key of ALL_MESSAGE_KEYS) {
      const th = getMessage(key, "th");
      const en = getMessage(key, "en");
      expect(th.length, `Empty Thai string for '${key}'`).toBeGreaterThan(0);
      expect(en.length, `Empty English string for '${key}'`).toBeGreaterThan(0);
    }
  });
});
```

Key test design notes:
- Import `ALL_MESSAGE_KEYS` -- an exported array of all valid keys, so the completeness test does not need to hard-code the key list.
- The Thai character range `\u0E00-\u0E7F` is used to verify language correctness.
- No mocks needed -- this module is pure data with a simple lookup function.

---

## Implementation Details

### 1. Telegram i18n Module

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/telegramI18n.ts`

This is a simple object map with `th` and `en` keys. No i18n library is needed at this scale (~20 strings). Language detection uses the Telegram user's `language_code` field: `"th"` maps to Thai, everything else defaults to English.

#### Exported API

```typescript
/**
 * Returns a localized bot message string.
 *
 * @param key - Message key (e.g. "link_success", "help_text")
 * @param languageCode - Telegram user's language_code (e.g. "th", "en", undefined)
 * @returns The localized string. Falls back to English for unknown/undefined languages.
 */
export function getMessage(key: MessageKey, languageCode?: string): string;

/** All valid message keys, exported for test completeness checks. */
export const ALL_MESSAGE_KEYS: readonly MessageKey[];

/** Union type of all message key strings. */
export type MessageKey = keyof typeof messages;
```

#### Message Categories and Keys

The module must define translations for approximately 20 strings covering these categories:

**Link flow** (used by `/start` command handler and link flow in section-04):
- `link_success` -- "Connected! You can now send messages." / Thai equivalent
- `link_failed` -- "Link failed. The token may be expired or invalid." / Thai equivalent
- `link_expired` -- "This link has expired. Please generate a new one from the web app." / Thai equivalent
- `link_already_used` -- "This link has already been used." / Thai equivalent
- `link_already_linked` -- "Your account is already linked." / Thai equivalent

**Commands** (used by command handlers in section-09):
- `help_text` -- Multi-line help text listing all available commands (`/resume`, `/unlink`, `/status`, `/help`) with brief descriptions
- `status_active` -- Template showing active conversation info (name, message count, last activity)
- `status_no_conversation` -- "No conversation is currently active. Use /resume to select one."
- `unlink_confirm` -- "Are you sure you want to unlink your Telegram account?" (displayed with inline keyboard)
- `unlink_success` -- "Your Telegram account has been unlinked."
- `unlink_cancelled` -- "Unlink cancelled."
- `resume_list_header` -- "Select a conversation to resume:" / Thai equivalent
- `resume_no_conversations` -- "No conversations bound. Bind a conversation from the web app."
- `resume_success` -- "Switched to conversation: {name}" (with placeholder)

**Errors** (used by webhook handler and gateway):
- `error_no_connection` -- "Your Telegram account is not linked. Please link from the web app at {url}"
- `error_no_conversation` -- "No conversation is active. Use /resume to select a conversation, or bind one from the web app."
- `error_rate_limited` -- "You are sending messages too quickly. Please wait a moment."
- `error_text_only` -- "Sorry, only text messages are supported at this time." / Thai equivalent
- `error_generic` -- "An error occurred. Please try again later." / Thai equivalent

**System** (used internally):
- `start_no_token` -- Welcome/status message when user sends `/start` without a token

#### Implementation Pattern

```typescript
const messages = {
  link_success: {
    th: "เชื่อมต่อสำเร็จ! คุณสามารถส่งข้อความได้แล้ว",
    en: "Connected! You can now send messages.",
  },
  // ... all other keys follow same pattern
} as const;

export type MessageKey = keyof typeof messages;
export const ALL_MESSAGE_KEYS = Object.keys(messages) as MessageKey[];

export function getMessage(key: MessageKey, languageCode?: string): string {
  const lang = languageCode === "th" ? "th" : "en";
  return messages[key][lang];
}
```

Notes:
- Use `as const` on the messages object for type safety.
- The `getMessage` function is intentionally simple: ternary check for `"th"`, default to `"en"`.
- Some messages contain placeholders like `{name}` or `{url}`. Callers are responsible for replacing these via `string.replace()`. The i18n module itself does no interpolation -- it just returns raw strings. Document this in a JSDoc comment.
- Thai translations should be natural, conversational Thai -- not machine-translated.

---

### 2. Shared Channel Types

**File**: `/home/dev/projects/SmartSpecPro/apps/web/shared/channelTypes.ts`

This file defines the TypeScript interfaces for the message contracts that flow through the system. It is placed in `shared/` because both server services and potentially client code need access to these types.

The existing `shared/types.ts` re-exports from `drizzle/schema.ts` and `_core/errors.ts`. The new `channelTypes.ts` is a separate file, not merged into `types.ts`, to keep the channel-bridge types cleanly separated.

#### Interfaces to Define

**`ChatIngressEvent`** -- Normalized inbound message from any channel into the SmartSpecPro pipeline:

```typescript
/**
 * Normalized inbound event from an external channel (Telegram, future: LINE, WhatsApp).
 * Created by the webhook handler and consumed by channelGateway.ingest().
 */
export interface ChatIngressEvent {
  /** Unique event ID (UUID v4) */
  eventId: string;
  /** Event classification */
  eventType: "user_message" | "command" | "callback";
  /** Tenant context (from telegram_connections, not from conversation) */
  tenantId: string;
  /** SmartSpecPro user ID */
  userId: number;
  /** Target conversation ID (string for both chat integer IDs and agency UUID IDs) */
  conversationId: string;
  /** Which pipeline to route to */
  conversationType: "chat" | "agency";
  /** Channel metadata */
  channel: {
    type: "web" | "telegram";
    connectionId?: string;
    externalChatId?: string;
    externalMessageId?: string;
  };
  /** Message content */
  message: {
    text: string;
    attachments: Attachment[];
  };
  /** Idempotency key for deduplication (e.g., "tg:{botId}:{updateId}") */
  idempotencyKey: string;
}

/** Attachment placeholder -- Phase 1 supports text only, but the type is future-proof. */
export interface Attachment {
  type: "image" | "document" | "audio" | "video";
  url: string;
  mimeType?: string;
  fileName?: string;
}
```

**`ChatEgressEvent`** -- Outbound fan-out event after a response is saved. Created by `channelGateway.emitEgress()` and consumed by the delivery queue:

```typescript
/**
 * Outbound fan-out event. Created after a canonical message is saved,
 * triggers delivery to all active channel bindings for the conversation.
 */
export interface ChatEgressEvent {
  /** Unique event ID (UUID v4) */
  eventId: string;
  /** Conversation that generated the response */
  conversationId: string;
  /** Pipeline that produced the message */
  conversationType: "chat" | "agency";
  /** Canonical message ID (stored as string -- may be integer or bigint depending on pipeline) */
  messageId: string;
  /** Tenant for scoping */
  tenantId: string;
  /** Resolved delivery targets (from conversation_channels query) */
  targets: ChatEgressTarget[];
  /** Pre-rendered content for delivery */
  rendering: {
    /** Plain text version of the message */
    plainText: string;
    /** HTML-formatted version for Telegram */
    html?: string;
    /** URL for "View full message" link when content is truncated */
    truncatedWebUrl?: string;
  };
}

export interface ChatEgressTarget {
  channelType: "web" | "telegram";
  /** External reference (e.g., Telegram chat_id) */
  channelRefId: string;
  /** Delivery mode for this binding */
  syncMode: "two_way" | "notify_only";
}
```

**`DeliveryJob`** -- BullMQ job data shape for the Telegram delivery queue (section-06):

```typescript
/**
 * Data payload for a BullMQ job in the telegram-delivery queue.
 * Created by channelGateway, processed by the delivery worker.
 */
export interface DeliveryJob {
  /** channel_messages.id -- used for status tracking */
  channelMessageId: string;
  /** Telegram chat_id for delivery */
  chatId: string;
  /** HTML-formatted message content */
  text: string;
  /** Always "HTML" for Telegram */
  parseMode: "HTML";
  /** Optional: for threading replies */
  replyToMessageId?: string;
  /** For logging and tracing */
  conversationId: string;
  /** For tenant-scoped metrics */
  tenantId: string;
}
```

#### Design Notes

- `conversationId` is always a `string` in these interfaces, even though `conversations.id` is `serial` (integer). The gateway converts integer IDs to strings at the boundary. This simplifies the interface and avoids union types.
- `messageId` is always a `string` for the same reason -- `messages.id` is integer, `agency_messages.id` is bigint. The canonical form is string.
- The `channel.type` and `channelType` fields use the same union `"web" | "telegram"` -- this is extensible for future channels (LINE, WhatsApp, Slack) by widening the union.
- The `Attachment` interface is defined but unused in Phase 1 (text-only). It is included so the interface is stable when attachment support is added in Phase 3.
- These types have no runtime dependencies -- they are pure TypeScript interfaces. No Zod schemas needed (validation happens at the boundary in the webhook handler, not in the type definitions).

---

## Verification

After implementing both files:

1. Run the i18n tests:
   ```bash
   cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run server/services/__tests__/telegramI18n.test.ts
   ```

2. Run TypeScript check to ensure the shared types compile:
   ```bash
   cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check
   ```

3. Verify that `channelTypes.ts` is importable from both server and shared contexts:
   ```bash
   cd /home/dev/projects/SmartSpecPro && grep -r "channelTypes" apps/web/shared/ apps/web/server/
   ```
   (Will only show the file itself until later sections import it.)

## Consumers (Later Sections)

These files are consumed by:

- **section-02 (webhook handler)** -- Imports `getMessage` for error responses to unlinked users, and `ChatIngressEvent` to normalize incoming Telegram messages.
- **section-04 (link flow)** -- Imports `getMessage` for link success/failure responses.
- **section-05 (channel gateway)** -- Imports `ChatIngressEvent`, `ChatEgressEvent`, and `ChatEgressTarget` for `ingest()` and `emitEgress()` method signatures.
- **section-06 (delivery queue)** -- Imports `DeliveryJob` for BullMQ job typing.
- **section-08 (pipeline hooks)** -- Imports `ChatEgressEvent` for the fan-out hook in `chat.ts` and `agency.ts`.
- **section-09 (Telegram commands)** -- Imports `getMessage` extensively for all command responses.