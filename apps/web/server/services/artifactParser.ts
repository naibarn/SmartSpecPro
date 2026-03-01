/**
 * Artifact Parser
 * Parses LLM response text for ```artifact:TYPE ... ``` fenced blocks.
 */

const VALID_TYPES = new Set([
  "code", "markdown", "mermaid", "svg", "react", "html", "chart", "table",
]);

export interface ParsedArtifact {
  type: "code" | "markdown" | "mermaid" | "svg" | "react" | "html" | "chart" | "table";
  content: string;
  title?: string;
  language?: string;
}

/**
 * Regex matches ```artifact:TYPE ... ``` blocks.
 * Captures: type, rest of opening line (for attributes), and content.
 */
const ARTIFACT_BLOCK_RE = /```artifact:(\w+)([^\n]*)\n([\s\S]*?)```/g;

/** Extract a quoted attribute value from a string like: title="My Title" */
function extractAttr(line: string, attr: string): string | undefined {
  const re = new RegExp(`${attr}="([^"]*)"`, "i");
  const match = line.match(re);
  return match?.[1] || undefined;
}

export function parseArtifactBlocks(responseText: string): ParsedArtifact[] {
  const results: ParsedArtifact[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  ARTIFACT_BLOCK_RE.lastIndex = 0;

  while ((match = ARTIFACT_BLOCK_RE.exec(responseText)) !== null) {
    const rawType = match[1].toLowerCase();
    const attrLine = match[2];
    const content = match[3].trimEnd();

    if (!VALID_TYPES.has(rawType)) {
      continue;
    }

    const artifact: ParsedArtifact = {
      type: rawType as ParsedArtifact["type"],
      content,
    };

    const title = extractAttr(attrLine, "title");
    if (title) artifact.title = title;

    const language = extractAttr(attrLine, "language");
    if (language) artifact.language = language;

    results.push(artifact);
  }

  return results;
}
