import { describe, expect, it } from "vitest";

import {
  buildContextToolProvenance,
  normalizeToolContextBlock,
  redactContextToolText,
} from "../contextToolProvenanceService";

describe("contextToolProvenanceService", () => {
  it("redacts secrets and private urls from tool text", () => {
    const redacted = redactContextToolText(
      "Bearer token-123 apiKey=secret https://private.example.com/path",
    );
    expect(redacted).not.toContain("token-123");
    expect(redacted).not.toContain("secret");
    expect(redacted).not.toContain("private.example.com");
  });

  it("builds bounded untrusted tool blocks with provenance", () => {
    const provenance = buildContextToolProvenance({
      tenantId: "tenant-1",
      ownerType: "room",
      ownerId: "room-1",
      sourceRef: "tool://search/1",
      source: "semantic",
      includedReason: "tool search result",
      trust: "derived",
      freshness: "recent",
    });

    expect(provenance?.ownerScope.id).toBe("room-1");
    const block = normalizeToolContextBlock({
      title: "Search result",
      content: "Bearer token-123 https://private.example.com/path",
      tenantId: "tenant-1",
      ownerType: "room",
      ownerId: "room-1",
      sourceRef: "tool://search/1",
      source: "semantic",
      includedReason: "tool search result",
      trust: "derived",
      freshness: "recent",
      maxChars: 200,
    });

    expect(block?.trust).toBe("derived");
    expect(block?.tier).toBe("tool_result");
    expect(block?.content).not.toContain("token-123");
    expect(block?.provenance?.sourceRef).toBe("tool://search/1");
  });
});

