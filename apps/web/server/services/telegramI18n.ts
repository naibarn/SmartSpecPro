/**
 * Bilingual bot message strings (Thai + English) for Telegram Chat Bridge.
 *
 * Some messages contain {placeholders} — callers replace via string.replace().
 * This module does no interpolation; it returns raw strings only.
 */

const messages = {
  // ── Link flow ──────────────────────────────────────────────
  link_success: {
    th: "เชื่อมต่อสำเร็จ! คุณสามารถส่งข้อความได้แล้ว",
    en: "Connected! You can now send messages.",
  },
  link_failed: {
    th: "เชื่อมต่อไม่สำเร็จ โทเค็นอาจหมดอายุหรือไม่ถูกต้อง",
    en: "Link failed. The token may be expired or invalid.",
  },
  link_expired: {
    th: "ลิงก์นี้หมดอายุแล้ว กรุณาสร้างลิงก์ใหม่จากเว็บแอป",
    en: "This link has expired. Please generate a new one from the web app.",
  },
  link_already_used: {
    th: "ลิงก์นี้ถูกใช้ไปแล้ว",
    en: "This link has already been used.",
  },
  link_already_linked: {
    th: "บัญชีของคุณเชื่อมต่ออยู่แล้ว",
    en: "Your account is already linked.",
  },

  // ── Commands ───────────────────────────────────────────────
  help_text: {
    th: "คำสั่งที่ใช้ได้:\n/resume — เลือกแชทที่ต้องการใช้งาน\n/unlink — ยกเลิกการเชื่อมต่อ\n/status — ดูสถานะการเชื่อมต่อ\n/help — แสดงข้อความนี้",
    en: "Available commands:\n/resume — Select a conversation\n/unlink — Disconnect your account\n/status — View connection status\n/help — Show this message",
  },
  status_active: {
    th: "แชทที่ใช้งาน: {name}\nข้อความ: {count}\nใช้งานล่าสุด: {lastActivity}",
    en: "Active conversation: {name}\nMessages: {count}\nLast activity: {lastActivity}",
  },
  status_no_conversation: {
    th: "ไม่มีแชทที่ใช้งานอยู่ ใช้ /resume เพื่อเลือกแชท",
    en: "No conversation is currently active. Use /resume to select one.",
  },
  unlink_confirm: {
    th: "คุณต้องการยกเลิกการเชื่อมต่อ Telegram หรือไม่?",
    en: "Are you sure you want to unlink your Telegram account?",
  },
  unlink_success: {
    th: "ยกเลิกการเชื่อมต่อ Telegram แล้ว",
    en: "Your Telegram account has been unlinked.",
  },
  unlink_cancelled: {
    th: "ยกเลิกคำสั่ง unlink แล้ว",
    en: "Unlink cancelled.",
  },
  resume_list_header: {
    th: "เลือกแชทที่ต้องการใช้งาน:",
    en: "Select a conversation to resume:",
  },
  resume_no_conversations: {
    th: "ไม่มีแชทที่ผูกไว้ กรุณาผูกแชทจากเว็บแอป",
    en: "No conversations bound. Bind a conversation from the web app.",
  },
  resume_success: {
    th: "เปลี่ยนไปใช้แชท: {name}",
    en: "Switched to conversation: {name}",
  },

  // ── Errors ─────────────────────────────────────────────────
  error_no_connection: {
    th: "บัญชี Telegram ของคุณยังไม่ได้เชื่อมต่อ กรุณาเชื่อมต่อจากเว็บแอปที่ {url}",
    en: "Your Telegram account is not linked. Please link from the web app at {url}",
  },
  error_no_conversation: {
    th: "ไม่มีแชทที่ใช้งานอยู่ ใช้ /resume เพื่อเลือกแชท หรือผูกแชทจากเว็บแอป",
    en: "No conversation is active. Use /resume to select a conversation, or bind one from the web app.",
  },
  error_rate_limited: {
    th: "คุณส่งข้อความเร็วเกินไป กรุณารอสักครู่",
    en: "You are sending messages too quickly. Please wait a moment.",
  },
  error_text_only: {
    th: "ขออภัย ขณะนี้รองรับเฉพาะข้อความตัวอักษรเท่านั้น",
    en: "Sorry, only text messages are supported at this time.",
  },
  error_generic: {
    th: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
    en: "An error occurred. Please try again later.",
  },

  // ── System ─────────────────────────────────────────────────
  start_no_token: {
    th: "ยินดีต้อนรับ! กรุณาเชื่อมต่อบัญชีจากเว็บแอปก่อน หรือใช้ /help เพื่อดูคำสั่งที่ใช้ได้",
    en: "Welcome! Please link your account from the web app first, or use /help to see available commands.",
  },
  error_unknown_command: {
    th: "ไม่รู้จักคำสั่งนี้ ใช้ /help เพื่อดูคำสั่งที่ใช้ได้",
    en: "Unknown command. Use /help to see available commands.",
  },
} as const;

export type MessageKey = keyof typeof messages;
export const ALL_MESSAGE_KEYS = Object.keys(messages) as MessageKey[];

/**
 * Returns a localized bot message string.
 *
 * @param key - Message key (e.g. "link_success", "help_text")
 * @param languageCode - Telegram user's language_code (e.g. "th", "en", undefined)
 * @returns The localized string. Falls back to English for unknown/undefined languages.
 */
export function getMessage(key: MessageKey, languageCode?: string): string {
  const lang = languageCode === "th" ? "th" : "en";
  return messages[key][lang];
}
