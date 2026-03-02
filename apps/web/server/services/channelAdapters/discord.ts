/**
 * Discord Channel Adapter
 *
 * Uses discord.js Gateway WebSocket for inbound messages (slash commands + text).
 * Outbound delivery sends text to the Discord TextChannel via the bot client.
 *
 * Architecture:
 * - Single bot client serves all guilds (Discord bots are inherently multi-guild).
 * - Lazy initialization: Gateway connects only when connect(botToken) is called.
 * - Slash commands registered per-guild (instant availability, no 1h propagation delay).
 * - Bot messages filtered to prevent infinite loops.
 *
 * Ingest flow for Gateway events:
 * - setIngestCallback() must be called by channelGateway to enable message routing.
 * - The callback receives (guildId, text, channelId) — the gateway looks up the
 *   DB channel_connections by guildId + channelType='discord' to find tenantId/userId.
 *
 * Message limits:
 * - Discord: 2000 chars per message. Long messages split at newline boundaries.
 *
 * Security:
 * - validateWebhook() returns true (Gateway bots use WebSocket, not HTTP).
 * - Ed25519 signature verification is only needed for HTTP Interactions (not used here).
 * - Bot messages filtered: message.author.bot === true → ignored.
 */

import {
  Client,
  GatewayIntentBits,
  Events,
  type Message,
  type Interaction,
  InteractionType,
  type TextChannel,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import type {
  ChannelAdapter,
  ChannelCapabilities,
  IncomingWebhookRequest,
  ParsedInbound,
  SendMessageOptions,
} from "./types";
import { adapterRegistry } from "./registry";
import { auditLogger } from "../auditLogger";

const MAX_MESSAGE_LENGTH = 2000;

/** Extended config for sendMessage */
interface DiscordConfig extends Record<string, unknown> {
  guildId: string;
  channelId: string;
}

/**
 * Callback signature for routing inbound Gateway events to channelGateway.
 * @param guildId - Discord guild ID (used by gateway to look up channel_connections)
 * @param externalChannelId - Discord channel ID where the message was sent
 * @param text - The message text
 */
type IngestCallback = (guildId: string, externalChannelId: string, text: string) => Promise<void>;

export class DiscordAdapter implements ChannelAdapter {
  readonly channelType = "discord";

  private client: Client | null = null;
  /** True once the Client is constructed and event handlers registered */
  private handlersAttached = false;
  /** True once client.login() has completed successfully */
  private connected = false;
  /** Callback for routing inbound messages to channelGateway */
  private ingestCallback: IngestCallback | null = null;

  readonly capabilities: ChannelCapabilities = {
    maxMessageLength: MAX_MESSAGE_LENGTH,
    supportsButtons: true,
    supportsRichText: true,
    supportsAttachments: true,
    rateLimitPerSecond: 5,
  };

  // ── Initialize / Connect / Shutdown ───────────────────────────────────────

  /**
   * Set up the discord.js Client and register event handlers.
   * Does NOT connect to Discord Gateway (call connect() for that).
   * Idempotent — safe to call multiple times.
   */
  async initialize(): Promise<void> {
    if (this.handlersAttached) return; // Idempotent

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        // NOTE: MessageContent intent NOT included — requires Discord verification for 100+ guilds.
        // Primary interaction model is slash commands which don't need MessageContent.
      ],
    });

    // Register event handlers
    this.client.on(Events.MessageCreate, (message: Message) => {
      this._handleMessage(message).catch(() => {});
    });

    this.client.on(Events.InteractionCreate, (interaction: Interaction) => {
      this._handleInteraction(interaction).catch(() => {});
    });

    // Log when Gateway connection is ready
    this.client.on(Events.ClientReady, () => {
      this.connected = true;
      auditLogger.log({
        eventType: "channel_adapter_registered",
        metadata: { channelType: "discord", event: "ready" },
      });
    });

    this.handlersAttached = true;
  }

  /** Connect the bot to the Discord Gateway with the given bot token */
  async connect(botToken: string): Promise<void> {
    if (!this.handlersAttached) await this.initialize();
    await this.client!.login(botToken);
    // connected flag is set by the ClientReady event handler
  }

  async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.destroy();
      this.client = null;
      this.handlersAttached = false;
      this.connected = false;
    }
  }

  /** Register a callback to route inbound Gateway events to channelGateway */
  setIngestCallback(cb: IngestCallback): void {
    this.ingestCallback = cb;
  }

  // ── Slash Command Registration ─────────────────────────────────────────────

  /**
   * Register slash commands for a specific guild (instant, no 1h propagation delay).
   * Must be called after connect() — requires an authenticated bot token.
   *
   * @param botToken - The bot token (used for REST API call)
   * @param guildId - The Discord guild ID to register commands in
   * @param clientId - The bot application's client ID
   */
  async registerGuildCommands(botToken: string, guildId: string, clientId: string): Promise<void> {
    const commands = [
      new SlashCommandBuilder()
        .setName("ask")
        .setDescription("Send a message to the AI assistant")
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription("Your message to the AI")
            .setRequired(true),
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName("status")
        .setDescription("Check your AI assistant connection status")
        .toJSON(),
    ];

    const rest = new REST().setToken(botToken);
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });
  }

  // ── Webhook Validation ─────────────────────────────────────────────────────

  async validateWebhook(_req: IncomingWebhookRequest): Promise<boolean> {
    // Discord Gateway-based bots receive events via WebSocket, not HTTP.
    // HTTP Interactions endpoint Ed25519 verification is not used in this implementation.
    return true;
  }

  // ── Inbound Parsing ────────────────────────────────────────────────────────

  async parseInbound(_body: unknown, _connectionId: string): Promise<ParsedInbound | null> {
    // Gateway-based adapters handle events in the event handlers registered in initialize().
    // The HTTP parseInbound path is not used for Discord Gateway bots.
    return null;
  }

  // ── Outbound Sending ───────────────────────────────────────────────────────

  async sendMessage(
    config: Record<string, unknown>,
    _externalChatId: string,
    text: string,
    _options?: SendMessageOptions,
  ): Promise<{ ok: boolean; externalMessageId?: string }> {
    if (!this.client) return { ok: false };

    const cfg = config as DiscordConfig;
    const { guildId, channelId } = cfg;

    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) return { ok: false };

      const channel = await guild.channels.fetch(channelId) as TextChannel | null;
      if (!channel) return { ok: false };

      const chunks = this.formatMessage(text);
      let lastMessageId: string | undefined;
      for (const chunk of chunks) {
        const sent = await channel.send(chunk);
        lastMessageId = sent.id;
      }
      return { ok: true, externalMessageId: lastMessageId };
    } catch {
      return { ok: false };
    }
  }

  // ── Message Formatting ─────────────────────────────────────────────────────

  formatMessage(text: string): string[] {
    if (text.length <= MAX_MESSAGE_LENGTH) return [text];

    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= MAX_MESSAGE_LENGTH) {
        chunks.push(remaining);
        break;
      }
      // Prefer splitting at newline boundary within the limit
      const splitAt = remaining.lastIndexOf("\n", MAX_MESSAGE_LENGTH);
      const cutPoint = splitAt > MAX_MESSAGE_LENGTH * 0.5 ? splitAt : MAX_MESSAGE_LENGTH;
      chunks.push(remaining.slice(0, cutPoint));
      remaining = remaining.slice(cutPoint);
    }
    return chunks;
  }

  // ── Private event handlers ─────────────────────────────────────────────────

  private async _handleMessage(message: Message): Promise<void> {
    // Bot message filtering — prevent infinite loops
    if (message.author.bot) return;
    if (!message.guildId) return; // Ignore DMs

    if (this.ingestCallback) {
      // Pass guildId + channel ID so channelGateway can look up channel_connections
      await this.ingestCallback(message.guildId, message.channelId, message.content);
    }
  }

  private async _handleInteraction(interaction: Interaction): Promise<void> {
    if (interaction.type !== InteractionType.ApplicationCommand) return;

    const cmdInteraction = interaction as any;
    if (cmdInteraction.commandName !== "ask") return;

    const text = cmdInteraction.options?.getString?.("message") ?? "";
    if (!text) {
      await cmdInteraction.reply({ content: "Please provide a message.", ephemeral: true });
      return;
    }

    // Defer reply — bot will edit when the AI pipeline completes
    await cmdInteraction.deferReply();

    if (this.ingestCallback && interaction.guildId && interaction.channelId) {
      await this.ingestCallback(interaction.guildId, interaction.channelId, text);
    }
  }
}

// Self-register
adapterRegistry.register(new DiscordAdapter());
