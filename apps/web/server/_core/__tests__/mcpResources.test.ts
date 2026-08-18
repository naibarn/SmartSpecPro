import { describe, expect, it } from "vitest";
import {
  listMcpDocumentationResources,
  readMcpDocumentationResource,
} from "../mcpResources";

describe("MCP documentation resources", () => {
  it("lists only allowlisted documentation resources with cache metadata", () => {
    const result = listMcpDocumentationResources();
    expect(result.resources.length).toBeGreaterThan(0);
    expect(
      result.resources.every(resource =>
        resource.uri.startsWith("smartaihub://docs/mcp/")
      )
    ).toBe(true);
    expect(result.resources.every(resource => !("text" in resource))).toBe(
      true
    );
    expect(result.cacheScope).toBe("public");
  });

  it("reads an allowlisted document and returns a stable revision", () => {
    const result = readMcpDocumentationResource(
      "smartaihub://docs/mcp/files-and-media"
    );
    expect(result.contents[0].mimeType).toBe("text/markdown");
    expect(result.contents[0].text).toContain("short-lived download reference");
    expect(result.revision).toMatch(/^[a-f0-9]{16}$/);
  });

  it("documents Hermes OAuth instead of the legacy header auth path", () => {
    const result = readMcpDocumentationResource(
      "smartaihub://docs/mcp/overview"
    );
    expect(result.contents[0].text).toContain("auth: oauth");
    expect(result.contents[0].text).toContain("hermes mcp login smartaihub");
    expect(result.contents[0].text).toContain("do not use --auth header");
    expect(result.contents[0].text).toContain(
      "Settings → Connectors → Add custom connector"
    );
    expect(result.contents[0].text).toContain("codex mcp add smartaihub");
    expect(result.contents[0].text).toContain("Other MCP clients");
  });

  it("rejects unknown schemes, traversal, and unknown documents", () => {
    expect(() => readMcpDocumentationResource("file:///etc/passwd")).toThrow();
    expect(() =>
      readMcpDocumentationResource("smartaihub://docs/mcp/../secret")
    ).toThrow();
    expect(() =>
      readMcpDocumentationResource("smartaihub://docs/mcp/not-allowlisted")
    ).toThrow();
  });
});
