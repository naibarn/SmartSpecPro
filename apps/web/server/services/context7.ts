/**
 * Context7 MCP Client
 * Fetches up-to-date library documentation via Context7's remote MCP endpoint.
 * Uses the MCP Streamable HTTP transport (JSON-RPC 2.0 over HTTP).
 */

import type { ContextStateHints } from "../../shared/contextEngine";
import { buildContextToolStateHintsFromResult } from "./contextToolService";

const CONTEXT7_MCP_URL = "https://mcp.context7.com/mcp";
const REQUEST_TIMEOUT = 15_000; // 15 seconds

interface Context7Library {
  libraryId: string;
  name: string;
  description: string;
  snippets: number;
  score: number;
}

/**
 * Call a Context7 MCP tool via HTTP
 */
async function callTool(
  toolName: string,
  args: Record<string, unknown>,
  apiKey?: string,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };

    const key = apiKey || process.env.CONTEXT7_API_KEY;
    if (key) {
      headers["CONTEXT7_API_KEY"] = key;
    }

    const res = await fetch(CONTEXT7_MCP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name: toolName, arguments: args },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[Context7] HTTP ${res.status} from MCP endpoint`);
      return "";
    }

    const data = await res.json();

    if (data.error) {
      console.warn(`[Context7] MCP error:`, data.error.message);
      return "";
    }

    // Extract text content from MCP response
    const content = data.result?.content;
    if (Array.isArray(content)) {
      return content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n");
    }

    return "";
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.warn("[Context7] Request timed out");
    } else {
      console.warn("[Context7] Request failed:", err.message);
    }
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve a library name to a Context7 library ID.
 * Returns the best matching library ID, or null if not found.
 */
export async function resolveLibraryId(
  libraryName: string,
  query: string,
  apiKey?: string,
): Promise<Context7Library | null> {
  const text = await callTool("resolve-library-id", { libraryName, query }, apiKey);
  if (!text) return null;

  // Parse the first library ID from the response
  const idMatch = text.match(
    /Context7-compatible library ID:\s*(\/[^\s\n]+)/,
  );
  const nameMatch = text.match(/Title:\s*(.+)/);
  const descMatch = text.match(/Description:\s*(.+)/);
  const snippetMatch = text.match(/Code Snippets:\s*(\d+)/);
  const scoreMatch = text.match(/Benchmark Score:\s*([\d.]+)/);

  if (!idMatch) return null;

  return {
    libraryId: idMatch[1],
    name: nameMatch?.[1]?.trim() || libraryName,
    description: descMatch?.[1]?.trim() || "",
    snippets: parseInt(snippetMatch?.[1] || "0", 10),
    score: parseFloat(scoreMatch?.[1] || "0"),
  };
}

/**
 * Fetch documentation for a library using its Context7 ID.
 */
export async function queryDocs(
  libraryId: string,
  query: string,
  apiKey?: string,
): Promise<string> {
  return callTool("query-docs", { libraryId, query }, apiKey);
}

/**
 * High-level: resolve library name + fetch docs in one call.
 * Extracts library name from the user message automatically.
 */
export async function fetchDocsForMessage(
  message: string,
  apiKey?: string,
): Promise<{ docs: string; libraryName: string; contextState?: ContextStateHints } | null> {
  // Extract library name from message
  const libraryName = extractLibraryName(message);
  if (!libraryName) return null;

  // Clean query — remove context7 trigger words
  const query = message
    .replace(/\b(use\s+)?context7\b/gi, "")
    .replace(/\b(search|find|latest)\s+docs?\s+(for\s+)?/gi, "")
    .replace(/\bdocumentation\s+for\s+/gi, "")
    .trim();

  console.log(
    `[Context7] Resolving library: "${libraryName}" for query: "${query}"`,
  );

  const library = await resolveLibraryId(libraryName, query || libraryName, apiKey);
  if (!library) {
    console.warn(`[Context7] Could not resolve library: ${libraryName}`);
    return null;
  }

  console.log(
    `[Context7] Found: ${library.name} (${library.libraryId}) — ${library.snippets} snippets, score ${library.score}`,
  );

  const docs = await queryDocs(library.libraryId, query || libraryName, apiKey);
  if (!docs) {
    console.warn(`[Context7] No docs returned for ${library.libraryId}`);
    return null;
  }

  console.log(
    `[Context7] Fetched ${docs.length} chars of documentation for ${library.name}`,
  );

  const contextState = buildContextToolStateHintsFromResult({
    title: `Context7 docs: ${library.name}`,
    content: docs,
    ownerType: "agent",
    ownerId: "context7",
    sourceRef: `context7:${library.libraryId}`,
    source: "semantic",
    includedReason: `Context7 documentation for ${library.name}`,
    trust: "derived",
    freshness: "recent",
  });

  return {
    docs,
    libraryName: library.name,
    contextState: Object.keys(contextState).length > 0 ? contextState : undefined,
  };
}

/**
 * Extract library/framework name from a user message.
 */
function extractLibraryName(message: string): string | null {
  const lower = message.toLowerCase();

  // Pattern: "docs for X", "documentation for X", "latest docs for X"
  const docsForMatch = message.match(
    /(?:docs?|documentation)\s+(?:for|of|about)\s+([a-zA-Z0-9_.@/-]+(?:\s+[a-zA-Z0-9_.]+)?)/i,
  );
  if (docsForMatch) return docsForMatch[1].trim();

  // Pattern: "how to use X", "how to X with Y"
  const howToMatch = message.match(
    /how\s+to\s+(?:use\s+)?([a-zA-Z0-9_.@/-]+)/i,
  );
  if (howToMatch) return howToMatch[1].trim();

  // Pattern: "context7 X" — library name right after context7
  const c7Match = message.match(
    /context7\s+([a-zA-Z0-9_.@/-]+(?:\s+[a-zA-Z0-9_.]+)?)/i,
  );
  if (c7Match) return c7Match[1].trim();

  // Pattern: "X library", "X framework", "X package"
  const libMatch = message.match(
    /([a-zA-Z0-9_.@/-]+)\s+(?:library|framework|package|sdk|api)\b/i,
  );
  if (libMatch) return libMatch[1].trim();

  // Known library names in the message
  const knownLibs = [
    "react", "next.js", "nextjs", "vue", "angular", "svelte",
    "express", "fastify", "nestjs", "drizzle", "prisma", "mongoose",
    "tailwind", "shadcn", "radix", "framer-motion",
    "typescript", "node", "deno", "bun",
    "postgres", "redis", "mongodb", "supabase", "firebase",
    "openai", "langchain", "anthropic",
    "docker", "kubernetes", "terraform",
    "python", "flask", "django", "fastapi",
    "rust", "go", "golang",
  ];

  for (const lib of knownLibs) {
    if (lower.includes(lib)) return lib;
  }

  return null;
}
