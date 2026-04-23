import { describe, expect, it } from "vitest";

import {
  buildContextToolStateHints,
  buildContextToolStateHintsFromResult,
  normalizeContextToolObservation,
} from "../contextToolService";

describe("contextToolService", () => {
  it("normalizes tool observations into untrusted tool-result hints", () => {
    const block = normalizeContextToolObservation({
      title: "Search result",
      content: "Useful answer https://private.example.com",
      ownerType: "room",
      ownerId: "room-1",
      sourceRef: "tool://search/1",
      source: "structured",
      includedReason: "search result",
      freshness: "recent",
      trust: "derived",
    });

    expect(block?.tier).toBe("tool_result");
    expect(block?.content).not.toContain("private.example.com");
  });

  it("builds tool hints that can be injected into context state", () => {
    const hints = buildContextToolStateHints([
      {
        title: "Search result",
        content: "Useful answer",
        ownerType: "room",
        ownerId: "room-1",
        sourceRef: "tool://search/1",
        source: "structured",
        includedReason: "search result",
      },
    ]);

    expect(hints.toolResults).toHaveLength(1);
  });

  it("summarizes structured tool results into bounded hints", () => {
    const hints = buildContextToolStateHintsFromResult({
      title: "MCP tool result: search",
      content: {
        files: [
          {
            name: "Songkran brief.md",
            id: "file-1",
            url: "https://example.com/file-1",
          },
        ],
        accessToken: "Bearer abc123",
      },
      ownerType: "team",
      ownerId: "team-1",
      sourceRef: "mcp:search_drive_files",
      source: "structured",
      includedReason: "MCP tool result from search_drive_files",
      trust: "derived",
      freshness: "recent",
    });

    expect(hints.toolResults).toHaveLength(1);
    expect(hints.toolResults?.[0]).toMatchObject({
      title: "MCP tool result: search",
      trust: "derived",
      freshness: "recent",
    });
    expect(hints.toolResults?.[0]?.content).toContain("Songkran brief.md");
    expect(hints.toolResults?.[0]?.content).not.toContain("abc123");
  });

  it("reuses embedded context state when the tool result already carries it", () => {
    const hints = buildContextToolStateHintsFromResult({
      title: "MCP tool result: search",
      content: {
        value: "ignored because embedded contextState wins",
        _meta: {
          contextState: {
            toolResults: [
              {
                title: "Embedded hint",
                content: "ContextState from upstream",
                source: "structured",
                trust: "derived",
                freshness: "recent",
                refs: ["tool://embedded"],
              },
            ],
          },
        },
      },
      ownerType: "team",
      ownerId: "team-1",
      sourceRef: "mcp:search_drive_files",
      source: "structured",
      includedReason: "MCP tool result from search_drive_files",
      trust: "derived",
      freshness: "recent",
    });

    expect(hints.toolResults).toHaveLength(1);
    expect(hints.toolResults?.[0]?.content).toContain("ContextState from upstream");
  });
});
