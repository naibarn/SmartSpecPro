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
    "=== HELP DOCUMENTATION REFERENCE ===",
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
