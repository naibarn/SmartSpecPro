/**
 * Telegram Bot API webhook handler for Chat Bridge.
 *
 * POST /webhooks/telegram/:botId
 *
 * Processing flow:
 * 1. Validate X-Telegram-Bot-Api-Secret-Token header
 * 2. Redis dedupe on update_id
 * 3. Return 200 immediately
 * 4. Async: audit log → rate limit → route command/message
 */

import { Router } from "express";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { getDb, type DrizzleDB } from "../db";
import { getCacheClient } from "../services/redisClients";
import { decrypt } from "../services/crypto";
import { systemSettings, telegramUpdates } from "../../drizzle/schema";
import { sendTelegramMessage } from "../services/telegramService";
import { getMessage } from "../services/telegramI18n";
import {
  handleResume,
  handleUnlink,
  handleStatus,
  handleHelp,
  handleStartNoToken,
  handleCallbackQuery,
} from "./telegramCommands";

// ── Telegram Update types (minimal subset) ──────────────────────────────

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramMessage {
  message_id: number;
  from?: { id: number; language_code?: string; username?: string };
  chat: { id: number; type: string };
  text?: string;
  photo?: unknown[];
  voice?: unknown;
  sticker?: unknown;
  document?: unknown;
  video?: unknown;
  audio?: unknown;
  date: number;
}

export interface TelegramCallbackQuery {
  id: string;
  from: { id: number; language_code?: string };
  message?: TelegramMessage;
  data?: string;
}

// ── Webhook context for command handlers ─────────────────────────────────

export interface WebhookContext {
  botId: string;
  update: TelegramUpdate;
  message: TelegramMessage;
  chatId: string;
  telegramUserId: string;
  languageCode: string | undefined;
  db: DrizzleDB;
  botToken: string;
}

export type WebhookCommandHandler = (ctx: WebhookContext) => Promise<void>;

// ── Handler registry ─────────────────────────────────────────────────────

const handlers: Record<string, WebhookCommandHandler> = {};

export function registerWebhookHandler(
  command: string,
  handler: WebhookCommandHandler,
): void {
  handlers[command] = handler;
}

// Register command handlers (section-09)
registerWebhookHandler("resume", handleResume);
registerWebhookHandler("unlink", handleUnlink);
registerWebhookHandler("status", handleStatus);
registerWebhookHandler("help", handleHelp);
registerWebhookHandler("start", handleStartNoToken);
registerWebhookHandler("callback_query", handleCallbackQuery);

// ── Redis rate limiter ───────────────────────────────────────────────────

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_SECS = 60;

async function checkInboundRateLimit(userId: string): Promise<boolean> {
  try {
    const redis = getCacheClient();
    const key = `tg:rl:${userId}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW_SECS);
    return count <= RATE_LIMIT_MAX;
  } catch {
    // Redis unavailable — allow request to avoid blocking all users
    return true;
  }
}

// ── Secret comparison helper ─────────────────────────────────────────────

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  const len = Math.max(bufA.length, bufB.length);
  const paddedA = Buffer.alloc(len);
  const paddedB = Buffer.alloc(len);
  bufA.copy(paddedA);
  bufB.copy(paddedB);
  return crypto.timingSafeEqual(paddedA, paddedB) && bufA.length === bufB.length;
}

// ── Reply helper ─────────────────────────────────────────────────────────

async function replyToChat(
  botToken: string,
  chatId: string,
  text: string,
): Promise<void> {
  try {
    await sendTelegramMessage(botToken, chatId, text, "HTML");
  } catch (err) {
    console.error("[TelegramWebhook] Failed to send reply:", chatId, err);
  }
}

// ── Router factory ───────────────────────────────────────────────────────

export function createTelegramWebhookRouter(): Router {
  const router = Router();

  router.post("/:botId", async (req, res) => {
    const { botId } = req.params;
    const update = req.body as TelegramUpdate;

    // Step 1: Load bot settings
    let db: DrizzleDB | null;
    try {
      db = await getDb();
    } catch {
      res.sendStatus(200);
      return;
    }
    if (!db) {
      res.sendStatus(200);
      return;
    }

    const settings = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.category, "telegram"));

    const settingsMap = new Map<string, string>(
      settings.map((s: { key: string; value: string | null }) => [s.key, s.value ?? ""]),
    );

    const enabled = settingsMap.get("enabled");
    if (enabled !== "true") {
      res.sendStatus(200);
      return;
    }

    const botTokenEncrypted = settingsMap.get("bot_token");
    const webhookSecretEncrypted = settingsMap.get("webhook_secret");
    if (!botTokenEncrypted || !webhookSecretEncrypted) {
      res.sendStatus(200);
      return;
    }

    let botToken: string;
    let webhookSecret: string;
    try {
      botToken = decrypt(botTokenEncrypted);
      webhookSecret = decrypt(webhookSecretEncrypted);
    } catch {
      res.sendStatus(200);
      return;
    }

    // Step 2a: Validate botId matches configured bot (timing-safe)
    const configuredBotUsername = settingsMap.get("bot_username") ?? "";
    // Use random fallback when no username configured to prevent timing leak
    const compareTarget = configuredBotUsername || crypto.randomBytes(16).toString("hex");
    if (!configuredBotUsername || !timingSafeCompare(botId, compareTarget)) {
      res.sendStatus(403);
      return;
    }

    // Step 2b: Validate secret token
    const secretHeader = req.headers["x-telegram-bot-api-secret-token"];
    const secretValue =
      typeof secretHeader === "string" ? secretHeader : "";
    if (!secretValue || !timingSafeCompare(secretValue, webhookSecret)) {
      console.warn("[TelegramWebhook] Secret validation failed for botId:", botId);
      res.sendStatus(403);
      return;
    }

    // Step 3: Extract update data
    const updateId = update?.update_id;
    if (!updateId) {
      res.sendStatus(200);
      return;
    }

    // Step 4: Redis dedupe
    try {
      const redis = getCacheClient();
      const result = await redis.set(
        `tg:update:${botId}:${updateId}`,
        "1",
        "EX",
        86400,
        "NX",
      );
      if (result === null) {
        // Duplicate update — already processed
        res.sendStatus(200);
        return;
      }
    } catch (err) {
      // Redis unavailable — continue processing (accept risk of rare duplicate)
      console.warn("[TelegramWebhook] Redis dedupe check failed, continuing:", err);
    }

    // Step 5: Return 200 immediately — all further processing is async
    res.sendStatus(200);

    // ── Async processing ──────────────────────────────────────────────

    try {
      // Audit record
      await db.insert(telegramUpdates).values({
        id: crypto.randomUUID(),
        botId,
        updateId: BigInt(updateId),
        telegramChatId:
          update.message?.chat?.id?.toString() ??
          update.callback_query?.message?.chat?.id?.toString() ??
          null,
        receivedAt: new Date(),
        processingStatus: "accepted",
      });
    } catch (err) {
      console.error("[TelegramWebhook] Failed to insert audit record:", updateId, err);
    }

    try {
      const message = update.message;
      const callbackQuery = update.callback_query;

      if (callbackQuery) {
        // Callback query (inline keyboard press)
        const handler = handlers["callback_query"];
        if (handler) {
          const chatId =
            callbackQuery.message?.chat?.id?.toString() ?? "";
          await handler({
            botId,
            update,
            message: callbackQuery.message!,
            chatId,
            telegramUserId: callbackQuery.from.id.toString(),
            languageCode: callbackQuery.from.language_code,
            db,
            botToken,
          });
        }
        return;
      }

      if (!message) return;

      const chatId = message.chat.id.toString();
      const telegramUserId = message.from?.id?.toString() ?? "";
      const languageCode = message.from?.language_code;

      // Rate limiting
      if (!(await checkInboundRateLimit(telegramUserId))) {
        await replyToChat(
          botToken,
          chatId,
          getMessage("error_rate_limited", languageCode),
        );
        return;
      }

      // Non-text message handling
      if (
        !message.text &&
        (message.photo ||
          message.voice ||
          message.sticker ||
          message.document ||
          message.video ||
          message.audio)
      ) {
        await replyToChat(
          botToken,
          chatId,
          getMessage("error_text_only", languageCode),
        );
        return;
      }

      if (!message.text) return;

      const ctx: WebhookContext = {
        botId,
        update,
        message,
        chatId,
        telegramUserId,
        languageCode,
        db,
        botToken,
      };

      // Command routing
      if (message.text.startsWith("/")) {
        const parts = message.text.split(/\s+/);
        const command = parts[0].toLowerCase().replace(/@\w+$/, ""); // strip @botname
        const args = parts.slice(1).join(" ");

        if (command === "/start" && args) {
          const handler = handlers["start_link"];
          if (handler) {
            await handler({ ...ctx, message: { ...message, text: args } });
          } else {
            await replyToChat(
              botToken,
              chatId,
              getMessage("start_no_token", languageCode),
            );
          }
        } else {
          const cmdName = command.replace("/", "");
          const handler = handlers[cmdName];
          if (handler) {
            await handler(ctx);
          } else {
            await replyToChat(
              botToken,
              chatId,
              getMessage("error_unknown_command", languageCode),
            );
          }
        }
      } else {
        // Plain text message — route to channel gateway
        const handler = handlers["text_message"];
        if (handler) {
          await handler(ctx);
        } else {
          await replyToChat(
            botToken,
            chatId,
            getMessage("error_no_connection", languageCode).replace(
              "{url}",
              "https://smartaihub.app",
            ),
          );
        }
      }
    } catch (err) {
      console.error("[TelegramWebhook] Processing error:", updateId, err);
    }
  });

  return router;
}
