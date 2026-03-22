/**
 * Help Context Injector
 *
 * Searches help documentation topics by keywords from the user's message,
 * loads matching topic content, and builds a context string for LLM injection.
 *
 * Used by the "help-assistant" skill in llmRoutes.ts to dynamically inject
 * relevant help documentation into the LLM system prompt.
 */

import { getHelpSearchIndex, getHelpTopic } from "./helpContentService";

export const HELP_CONTEXT_MARKER = "=== HELP DOCUMENTATION REFERENCE ===";

const HELP_INTENT_PATTERNS = [
  /(?:how\s+(?:do|to)\s+(?:i\s+)?)|(?:what\s+is)|(?:where\s+is)|(?:how\s+does)|(?:can\s+you\s+explain)/i,
  /(?:ใช้อย่างไร|ใช้งานอย่างไร|คืออะไร|อยู่ตรงไหน|เปิดยังไง|เปิดอย่างไร|ตั้งค่ายังไง|ทำยังไง|อธิบาย|สอนใช้|วิธีใช้)/i,
];

const PRODUCT_FEATURE_PATTERNS = [
  /\bteam\s*rooms?\b/i,
  /\bworkflow\s*board\b/i,
  /\bbrowser\s*session\b/i,
  /\bopen\s*browser\s*session\b/i,
  /\bartifacts?\b/i,
  /\balerts?\b/i,
  /\bpersonas?\b/i,
  /\bmemory\b/i,
  /\bcredits?\b/i,
  /\bskill(?:s| browser)?\b/i,
  /\bagenc(?:y|ies)\b/i,
  /\bteams?\b/i,
  /\badmin\b/i,
  /ทีม\s*รูม|ห้องทีม|ทีม ai|เวิร์กโฟลว์|บอร์ดงาน|บราวเซอร์\s*เซสชัน|อาร์ติแฟกต์|อเลิร์ต|เครดิต|สกิล|เพอร์โซนา|เมมโมรี/i,
];

/** Common stop words to exclude from keyword matching */
const STOP_WORDS = new Set([
  // English
  "a", "an", "the", "is", "are", "was", "were", "be", "been",
  "do", "does", "did", "have", "has", "had", "will", "would",
  "can", "could", "should", "may", "might", "shall",
  "i", "me", "my", "you", "your", "we", "our", "they", "their",
  "it", "its", "he", "she", "him", "her", "this", "that",
  "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "and", "or", "but", "not", "if", "so", "as", "than",
  "what", "how", "where", "when", "who", "which", "why",
  "about", "into", "some", "any", "all", "each", "every",
  // Thai stop words
  "ที่", "ของ", "ใน", "จะ", "ได้", "ไม่", "ให้", "มี", "เป็น",
  "กับ", "แล้ว", "ก็", "จาก", "หรือ", "แต่", "อยู่", "คือ",
  "นี้", "นั้น", "อะไร", "ยังไง", "อย่างไร",
]);

/**
 * Tokenize a message into meaningful keywords.
 * Handles both English (space-separated) and Thai (matches known terms).
 */
function extractKeywords(message: string): string[] {
  const lower = message.toLowerCase();

  // Extract English words
  const englishWords = lower
    .replace(/[^a-z0-9\s\u0E00-\u0E7F-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));

  // Also include common Thai feature names as-is for matching
  const thaiTerms: string[] = [];
  const thaiPatterns = [
    // Core features
    "แชท", "chat", "สกิล", "skill", "skills",
    "มีเดีย", "media", "รูปภาพ", "วิดีโอ", "เสียง",
    "presentation", "สไลด์", "slides",
    "browser", "เว็บ", "บราวเซอร์",
    "memory", "เมมโมรี่", "จำ", "ความจำ",
    "agency", "agencies", "เอเจนซี่", "ทีม",
    "วิดีโอ", "video", "editor",
    "เครดิต", "credits", "credit",
    // Settings & personas
    "settings", "ตั้งค่า", "โปรไฟล์", "profile", "ความปลอดภัย", "security",
    "persona", "บุคลิก", "api key", "billing",
    // Documents & gallery
    "document", "เอกสาร", "โฟลเดอร์", "folder", "library",
    "gallery", "แกลเลอรี่", "แชร์", "share",
    // Workflows & groups
    "workflow", "เวิร์กโฟลว์", "automation", "อัตโนมัติ",
    "group", "กลุ่ม", "collaborate",
    // Agency builder
    "builder", "ตัวสร้าง", "node", "agent",
    // Admin
    "admin", "provider", "user", "ผู้ใช้", "queue", "คิว",
    "audit", "log", "บันทึก", "domain",
    // Usage & monitoring
    "usage", "analytics", "สถิติ", "ต้นทุน", "cost", "budget", "งบ",
    "task", "monitor", "ตรวจสอบ",
    // Marketplace
    "marketplace", "ตลาด", "install", "ติดตั้ง", "template", "เทมเพลต",
    // Automation & webhooks
    "copilot", "rpa", "process",
    "webhook", "trigger", "event", "callback",
    // Admin advanced
    "approval", "อนุมัติ", "tenant", "ผู้เช่า",
    "guardian", "feedback", "quality",
  ];
  for (const term of thaiPatterns) {
    if (lower.includes(term)) {
      thaiTerms.push(term);
    }
  }

  return [...new Set([...englishWords, ...thaiTerms])];
}

export function detectHelpLocale(message: string): "en" | "th" {
  return /[\u0E00-\u0E7F]/.test(message) ? "th" : "en";
}

export function shouldInjectHelpContext(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;

  const hasExplicitFeatureCue = PRODUCT_FEATURE_PATTERNS.some((pattern) => pattern.test(trimmed));
  const hasHelpIntent = HELP_INTENT_PATTERNS.some((pattern) => pattern.test(trimmed));

  return hasExplicitFeatureCue || hasHelpIntent;
}

/**
 * Score a help topic against extracted keywords.
 * Returns number of keyword matches across title, description, and tags.
 */
function scoreTopic(
  topic: { slug: string; title: string; description: string; tags: string[] },
  keywords: string[],
): number {
  let score = 0;
  const titleLower = topic.title.toLowerCase();
  const descLower = topic.description.toLowerCase();
  const tagsLower = topic.tags.map((t) => t.toLowerCase());
  const slugLower = topic.slug.toLowerCase();

  for (const kw of keywords) {
    // Slug match (strongest signal)
    if (slugLower.includes(kw)) score += 3;
    // Title match
    if (titleLower.includes(kw)) score += 2;
    // Tag match
    if (tagsLower.some((t) => t.includes(kw))) score += 2;
    // Description match
    if (descLower.includes(kw)) score += 1;
  }

  return score;
}

/**
 * Build help documentation context for LLM injection.
 *
 * @param userMessage - The user's chat message
 * @param locale - "en" or "th"
 * @param maxTopics - Maximum number of topics to inject (default 3)
 * @returns Context string to inject, or null if no relevant topics found
 */
export async function buildHelpContext(
  userMessage: string,
  locale: string,
  maxTopics: number = 3,
): Promise<string | null> {
  const keywords = extractKeywords(userMessage);
  if (keywords.length === 0) return null;

  const index = await getHelpSearchIndex(locale);
  if (!index.length) return null;

  // Score and rank topics
  const scored = index
    .map((topic) => ({ ...topic, score: scoreTopic(topic, keywords) }))
    .filter((t) => t.score >= 2) // minimum relevance threshold
    .sort((a, b) => b.score - a.score)
    .slice(0, maxTopics);

  if (scored.length === 0) return null;

  // Load full content for top matches
  const parts: string[] = [
    HELP_CONTEXT_MARKER,
    "Use the following documentation to answer the user's question accurately.",
    "",
  ];

  for (const item of scored) {
    const topic = await getHelpTopic(item.slug, locale);
    if (!topic) continue;

    // Use raw markdown (strip HTML), truncate to keep context reasonable
    const content = topic.html
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 3000);

    parts.push(`## ${topic.title} (${locale === "th" ? "ดูเพิ่มเติม" : "More"}: /help/${item.slug})`);
    parts.push(content);
    parts.push("");
  }

  parts.push("=== END HELP REFERENCE ===");

  return parts.join("\n");
}

export async function injectHelpContextMessage(
  messages: Array<{ role: string; content: unknown }>,
  options?: { force?: boolean },
): Promise<{ injected: boolean; locale: "en" | "th" | null; reason: string | null }> {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { injected: false, locale: null, reason: "no_messages" };
  }

  const alreadyInjected = messages.some(
    (message) =>
      message.role === "system"
      && typeof message.content === "string"
      && message.content.includes(HELP_CONTEXT_MARKER),
  );
  if (alreadyInjected) {
    return { injected: false, locale: null, reason: "already_injected" };
  }

  const lastUserMsg = [...messages].reverse().find((message) => message.role === "user");
  if (!lastUserMsg?.content) {
    return { injected: false, locale: null, reason: "no_user_message" };
  }

  const messageText = typeof lastUserMsg.content === "string"
    ? lastUserMsg.content
    : JSON.stringify(lastUserMsg.content);

  if (!options?.force && !shouldInjectHelpContext(messageText)) {
    return { injected: false, locale: null, reason: "not_help_query" };
  }

  const locale = detectHelpLocale(messageText);
  const helpContext = await buildHelpContext(messageText, locale);
  if (!helpContext) {
    return { injected: false, locale, reason: "no_matching_docs" };
  }

  const helpMsg = { role: "system", content: helpContext };
  const firstNonSystem = messages.findIndex((message) => message.role !== "system");
  if (firstNonSystem > 0) {
    messages.splice(firstNonSystem, 0, helpMsg);
  } else {
    messages.unshift(helpMsg);
  }

  return { injected: true, locale, reason: options?.force ? "forced" : "auto" };
}
