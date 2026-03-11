/**
 * Web Search Tool Injector — Spec 038 Section 03
 *
 * Determines provider-specific web search tool configuration for LLM calls.
 * When a skill requires web search grounding (requires_web_search: true),
 * this module injects the appropriate tool/parameter for the provider family.
 */

export type ProviderFamily = "openai" | "gemini" | "anthropic" | "kimi" | "other";

/**
 * Detect provider family from providerName string.
 */
export function detectProviderFamily(providerName: string): ProviderFamily {
  const name = providerName.toLowerCase();
  if (name.includes("openai") || name.includes("gpt") || name.includes("o1") || name.includes("o3") || name.includes("o4")) return "openai";
  if (name.includes("gemini") || name.includes("google")) return "gemini";
  if (name.includes("anthropic") || name.includes("claude")) return "anthropic";
  if (name.includes("kimi") || name.includes("moonshot")) return "kimi";
  return "other";
}

/**
 * Build extra request body parameters for web search grounding.
 * Returns an object that should be spread into the chat completions request body.
 *
 * Different providers implement web search differently:
 * - OpenAI: `tools: [{ type: "web_search_preview" }]` (Responses API style)
 * - Gemini: `tools: [{ google_search: {} }]` (native grounding)
 * - Anthropic: `tools: [{ type: "web_search", name: "web_search" }]`
 * - Kimi: `use_search: true` (Kimi-specific parameter)
 * - Other: Adds instruction to system prompt (fallback)
 */
export function buildWebSearchParams(
  providerFamily: ProviderFamily
): { bodyParams: Record<string, unknown>; systemPromptSuffix?: string } {
  switch (providerFamily) {
    case "openai":
      return {
        bodyParams: {
          tools: [{ type: "web_search_preview" }],
        },
      };

    case "gemini":
      return {
        bodyParams: {
          tools: [{ google_search: {} }],
        },
      };

    case "anthropic":
      return {
        bodyParams: {
          tools: [
            {
              type: "web_search",
              name: "web_search",
            },
          ],
        },
      };

    case "kimi":
      return {
        bodyParams: {
          use_search: true,
        },
      };

    default:
      // Fallback: instruct the model to cite sources explicitly
      return {
        bodyParams: {},
        systemPromptSuffix:
          "\n\n[IMPORTANT: Include real, verifiable citations with URLs for all factual claims. Use web search or your training data to provide accurate source references.]",
      };
  }
}

/**
 * Check if a provider supports native web search tools.
 */
export function supportsNativeWebSearch(providerFamily: ProviderFamily): boolean {
  return ["openai", "gemini", "anthropic", "kimi"].includes(providerFamily);
}
