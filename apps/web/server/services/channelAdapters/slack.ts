/**
 * Slack Channel Adapter
 *
 * Uses the Slack Events API (HTTP webhook) for inbound messages.
 * Outbound delivery uses the Slack Web API (chat.postMessage) via fetch.
 *
 * Security:
 * - Webhook requests verified via HMAC-SHA256 + timingSafeEqual (constant-time).
 * - Replay protection: requests with timestamps >5 minutes old are rejected.
 * - Bot messages filtered to prevent infinite loops.
 *
 * Message formatting:
 * - Block Kit section blocks with mrkdwn.
 * - Splits at 3000-char limit per block.
 * - Escapes &, <, > for mrkdwn safety.
 */

import crypto from "crypto";
import type {
  ChannelAdapter,
  ChannelCapabilities,
  IncomingWebhookRequest,
  ParsedInbound,
  SendMessageOptions,
} from "./types";
import { adapterRegistry } from "./registry";

const SLACK_API_BASE = "https://slack.com/api";
const MAX_BLOCK_TEXT_LENGTH = 3000;
const REPLAY_WINDOW_SECONDS = 300; // 5 minutes

/** Extended request type — webhook route must populate rawBody and signingSecret */
interface SlackWebhookRequest extends IncomingWebhookRequest {
  rawBody?: Buffer;
  signingSecret?: string;
}

/** Extended config for sendMessage */
interface SlackConfig extends Record<string, unknown> {
  botToken: string;
  channelId?: string;
}

export class SlackAdapter implements ChannelAdapter {
  readonly channelType = "slack";

  readonly capabilities: ChannelCapabilities = {
    maxMessageLength: 40000, // Block Kit total across all blocks
    supportsButtons: true,
    supportsRichText: true,
    supportsAttachments: true,
    rateLimitPerSecond: 1, // Slack Tier 1: 1 req/sec for chat.postMessage
  };

  // ── Webhook Validation ─────────────────────────────────────────────────────

  async validateWebhook(req: IncomingWebhookRequest): Promise<boolean> {
    const sReq = req as SlackWebhookRequest;

    const signingSecret = sReq.signingSecret;
    if (!signingSecret) return false;

    const rawBody = sReq.rawBody;
    if (!rawBody) return false;

    const timestampHeader = req.headers["x-slack-request-timestamp"];
    const timestamp =
      typeof timestampHeader === "string" ? timestampHeader : "";
    if (!timestamp) return false;

    // Replay protection: reject requests older than 5 minutes
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp, 10)) > REPLAY_WINDOW_SECONDS) return false;

    const signatureHeader = req.headers["x-slack-signature"];
    const signature =
      typeof signatureHeader === "string" ? signatureHeader : "";
    if (!signature) return false;

    // Compute expected HMAC-SHA256
    const baseString = `v0:${timestamp}:${rawBody.toString("utf8")}`;
    const computed = "v0=" + crypto
      .createHmac("sha256", signingSecret)
      .update(baseString)
      .digest("hex");

    const bufComputed = Buffer.from(computed);
    const bufReceived = Buffer.from(signature);

    // Constant-time comparison with length check
    if (bufComputed.length !== bufReceived.length) return false;
    try {
      return crypto.timingSafeEqual(bufComputed, bufReceived);
    } catch {
      return false;
    }
  }

  // ── Inbound Parsing ────────────────────────────────────────────────────────

  async parseInbound(body: unknown, connectionId: string): Promise<ParsedInbound | null> {
    try {
      const payload = body as any;

      // url_verification: Slack initial webhook setup (not a real message)
      if (payload?.type === "url_verification") return null;

      // Only handle event_callback with message event type
      if (payload?.type !== "event_callback") return null;

      const event = payload.event;
      if (!event || event.type !== "message") return null;

      // Bot message filtering — prevent infinite loops
      if (event.bot_id) return null;
      if (event.subtype === "bot_message") return null;
      if (event.subtype === "message_changed") return null;
      if (event.subtype === "message_deleted") return null;

      const text = typeof event.text === "string" ? event.text.trim() : "";
      if (!text) return null;

      const externalChatId = event.channel ?? "";
      const externalMessageId = event.ts ?? "";
      const teamId = payload.team_id ?? "";

      return {
        event: {
          eventType: "user_message",
          channel: {
            type: "slack",
            connectionId,
            externalChatId,
            externalMessageId,
          },
          message: {
            text,
            attachments: [],
          },
        },
        dedupKey: `slack:${teamId}:${externalMessageId}`,
      };
    } catch {
      return null;
    }
  }

  // ── Outbound Sending ───────────────────────────────────────────────────────

  async sendMessage(
    config: Record<string, unknown>,
    externalChatId: string,
    text: string,
    _options?: SendMessageOptions,
  ): Promise<{ ok: boolean; externalMessageId?: string }> {
    const cfg = config as SlackConfig;
    const { botToken } = cfg;
    if (!botToken) return { ok: false };

    // Format as Block Kit blocks
    const blocks = this._buildBlocks(text);

    try {
      const response = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${botToken}`,
        },
        body: JSON.stringify({
          channel: externalChatId,
          blocks,
          text, // Fallback for notifications
        }),
      });

      const data = (await response.json().catch(() => ({}))) as any;
      if (!data.ok) return { ok: false };
      return { ok: true, externalMessageId: data.ts };
    } catch {
      return { ok: false };
    }
  }

  // ── Message Formatting ─────────────────────────────────────────────────────

  formatMessage(text: string): string[] {
    const escaped = this._escapeMrkdwn(text);

    if (escaped.length <= MAX_BLOCK_TEXT_LENGTH) return [escaped];

    const chunks: string[] = [];
    let remaining = escaped;
    while (remaining.length > 0) {
      chunks.push(remaining.slice(0, MAX_BLOCK_TEXT_LENGTH));
      remaining = remaining.slice(MAX_BLOCK_TEXT_LENGTH);
    }
    return chunks;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _escapeMrkdwn(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  private _buildBlocks(text: string): Array<{ type: string; text: { type: string; text: string } }> {
    const chunks = this.formatMessage(text);
    return chunks.map((chunk) => ({
      type: "section",
      text: { type: "mrkdwn", text: chunk },
    }));
  }

  // ── OAuth Installation Store (Phase 2 — stubs) ────────────────────────────
  //
  // Full multi-tenant OAuth (storeInstallation/fetchInstallation/deleteInstallation)
  // requires channel_credentials DB integration and the crypto module.
  // These stubs throw clearly to prevent silent no-ops in the Admin setup flow.

  async storeInstallation(_installation: Record<string, unknown>): Promise<void> {
    throw new Error(
      "SlackAdapter.storeInstallation is not yet implemented (Phase 2). " +
        "Credentials must be pre-configured via the Admin channel settings.",
    );
  }

  async fetchInstallation(_query: { teamId: string }): Promise<Record<string, unknown>> {
    throw new Error(
      "SlackAdapter.fetchInstallation is not yet implemented (Phase 2). " +
        "Credentials must be pre-configured via the Admin channel settings.",
    );
  }

  async deleteInstallation(_query: { teamId: string }): Promise<void> {
    throw new Error(
      "SlackAdapter.deleteInstallation is not yet implemented (Phase 2). " +
        "Remove the channel connection via the Admin channel settings.",
    );
  }
}

// Self-register
adapterRegistry.register(new SlackAdapter());
