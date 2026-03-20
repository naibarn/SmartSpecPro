import type { JSONContent } from "@tiptap/core";
import { parse, serialize } from "./TiptapMarkdownBridge";

const LOSS_THRESHOLD = 0.9; // 90% of nodes must survive

/**
 * Count all structural nodes in a Tiptap document.
 * Excludes `doc` and `text` nodes — we compare structural nodes only.
 */
export function countNodes(doc: JSONContent): number {
  let count = 0;
  if (doc.type !== "doc" && doc.type !== "text") {
    count = 1;
  }
  for (const child of doc.content ?? []) {
    count += countNodes(child);
  }
  return count;
}

/**
 * Checks whether a Tiptap document survives a markdown round-trip
 * without significant content loss.
 *
 * Algorithm:
 * 1. Count all structural nodes in the original doc.
 * 2. Serialize doc to markdown via TiptapMarkdownBridge.serialize().
 * 3. Parse the markdown back via TiptapMarkdownBridge.parse().
 * 4. Count all structural nodes in the re-parsed doc.
 * 5. If re-parsed count < 90% of original count, return warning.
 */
export function checkSerializationIntegrity(doc: JSONContent): {
  ok: boolean;
  warning: string | null;
} {
  const originalCount = countNodes(doc);

  // Empty or trivial documents always pass
  if (originalCount <= 1) {
    return { ok: true, warning: null };
  }

  const markdown = serialize(doc);
  const reparsed = parse(markdown);
  const reparsedCount = countNodes(reparsed);

  if (reparsedCount >= originalCount * LOSS_THRESHOLD) {
    return { ok: true, warning: null };
  }

  const lost = originalCount - reparsedCount;
  return {
    ok: false,
    warning: `Round-trip lost ${lost} of ${originalCount} content nodes (${Math.round((lost / originalCount) * 100)}% loss). Some content may not be preserved in this format.`,
  };
}
