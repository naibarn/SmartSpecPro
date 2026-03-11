/**
 * Citation Extractor — Spec 038 Section 03
 *
 * Extracts citations from LLM responses with web search grounding.
 * Supports OpenAI, Gemini, Anthropic, and Kimi response formats.
 */

import crypto from "crypto";

export interface ExtractedCitation {
  citation_id: string;
  title: string;
  url_or_id: string;
  retrieved_at: string;
  snippet?: string;
}

/**
 * Generate a deterministic citation ID from a URL.
 */
function citationId(url: string): string {
  return "cite_" + crypto.createHash("sha256").update(url).digest("hex").slice(0, 12);
}

/**
 * Extract citations from an OpenAI Responses API web_search tool result.
 * Looks for output items with type "web_search_call" containing sources.
 */
function extractFromOpenAI(response: Record<string, unknown>): ExtractedCitation[] {
  const citations: ExtractedCitation[] = [];
  const output = response.output as unknown[];
  if (!Array.isArray(output)) return citations;

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;

    // Responses API web_search_call results
    if (obj.type === "web_search_call" && Array.isArray(obj.sources)) {
      for (const src of obj.sources as Record<string, unknown>[]) {
        if (src.url && typeof src.url === "string") {
          citations.push({
            citation_id: citationId(src.url),
            title: String(src.title || ""),
            url_or_id: src.url,
            retrieved_at: new Date().toISOString(),
            snippet: src.snippet ? String(src.snippet) : undefined,
          });
        }
      }
    }
  }

  return citations;
}

/**
 * Extract citations from Gemini grounding metadata.
 */
function extractFromGemini(response: Record<string, unknown>): ExtractedCitation[] {
  const citations: ExtractedCitation[] = [];
  const candidates = response.candidates as unknown[];
  if (!Array.isArray(candidates)) return citations;

  for (const cand of candidates) {
    if (!cand || typeof cand !== "object") continue;
    const candidate = cand as Record<string, unknown>;
    const grounding = candidate.groundingMetadata as Record<string, unknown>;
    if (!grounding) continue;

    const chunks = grounding.groundingChunks as unknown[];
    if (Array.isArray(chunks)) {
      for (const chunk of chunks) {
        if (!chunk || typeof chunk !== "object") continue;
        const web = (chunk as Record<string, unknown>).web as Record<string, unknown>;
        if (web && typeof web.uri === "string") {
          citations.push({
            citation_id: citationId(web.uri),
            title: String(web.title || ""),
            url_or_id: web.uri,
            retrieved_at: new Date().toISOString(),
            snippet: undefined,
          });
        }
      }
    }
  }

  return citations;
}

/**
 * Extract citations from Anthropic Claude web_search tool use results.
 */
function extractFromAnthropic(response: Record<string, unknown>): ExtractedCitation[] {
  const citations: ExtractedCitation[] = [];
  const content = response.content as unknown[];
  if (!Array.isArray(content)) return citations;

  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const obj = block as Record<string, unknown>;
    if (obj.type === "tool_result" && obj.tool_use_id) {
      const toolContent = obj.content as unknown[];
      if (Array.isArray(toolContent)) {
        for (const item of toolContent) {
          if (!item || typeof item !== "object") continue;
          const tc = item as Record<string, unknown>;
          if (tc.type === "web_search_results" && Array.isArray(tc.results)) {
            for (const result of tc.results as Record<string, unknown>[]) {
              if (result.url && typeof result.url === "string") {
                citations.push({
                  citation_id: citationId(result.url),
                  title: String(result.title || ""),
                  url_or_id: result.url,
                  retrieved_at: new Date().toISOString(),
                  snippet: result.snippet ? String(result.snippet) : undefined,
                });
              }
            }
          }
        }
      }
    }
  }

  return citations;
}

/**
 * Deduplicate citations by URL.
 */
function deduplicateCitations(citations: ExtractedCitation[]): ExtractedCitation[] {
  const seen = new Map<string, ExtractedCitation>();
  for (const c of citations) {
    if (!seen.has(c.url_or_id)) {
      seen.set(c.url_or_id, c);
    }
  }
  return Array.from(seen.values());
}

/**
 * Extract citations from an LLM response based on provider type.
 */
export function extractCitationsFromResponse(
  response: unknown,
  provider: "openai" | "gemini" | "anthropic" | "kimi"
): ExtractedCitation[] {
  if (!response || typeof response !== "object") return [];

  const resp = response as Record<string, unknown>;
  let citations: ExtractedCitation[];

  switch (provider) {
    case "openai":
    case "kimi": // Kimi uses OpenAI-compatible format
      citations = extractFromOpenAI(resp);
      break;
    case "gemini":
      citations = extractFromGemini(resp);
      break;
    case "anthropic":
      citations = extractFromAnthropic(resp);
      break;
    default:
      citations = [];
  }

  return deduplicateCitations(citations);
}

/**
 * Thai citation instruction to prepend to system prompt when web search is active.
 */
export const CITATION_SYSTEM_PROMPT_TH = `สำคัญ: คุณต้องอ้างอิงแหล่งข้อมูลสำหรับทุก claim ที่สำคัญ
- ใช้เครื่องมือค้นหาเว็บเพื่อตรวจสอบข้อมูลที่ไม่แน่ใจ
- ทุก claim ระดับ critical/major ต้องมีหลักฐานจากแหล่งที่ตรวจสอบได้
- ระบุแหล่งที่มาอย่างชัดเจนในส่วน citations ของ output

`;

/**
 * Get the web search tool definition for a given provider.
 */
export function getWebSearchToolForProvider(provider: string): Record<string, unknown> | null {
  switch (provider) {
    case "openai":
      return { type: "web_search" };
    case "gemini":
      return { google_search: {} };
    case "anthropic":
      return { type: "web_search_20250305", name: "web_search" };
    case "kimi":
      return { type: "web_search" };
    default:
      return null;
  }
}
