import type { ExecutorInput } from "./types";

/**
 * Extract the text content from the last user message in the messages array.
 * Handles both plain string and multimodal (array) content formats.
 */
export function extractUserPrompt(
  messages: ExecutorInput["messages"],
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      const content = messages[i].content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        const textPart = content.find(
          (p: any) => p.type === "text" && typeof p.text === "string",
        );
        return (textPart as any)?.text || "";
      }
    }
  }
  return "";
}
