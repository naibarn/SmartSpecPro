import { describe, expect, it } from "vitest";

import {
  buildDocumentQueryString,
  buildDocumentShareUrl,
  buildPublicDocumentShareUrl,
  getKnowledgeVaultModeQueryParam,
  getKnowledgeVaultNavigationModes,
  getMarkdownPreviewFallbackContent,
  getDocumentAccessLabel,
  isMarkdownLibraryItem,
  parseDocumentQueryState,
  resolveKnowledgeVaultMode,
  resolveDocumentPreviewType,
} from "./documentManagementUi";

describe("documentManagementUi", () => {
  it("parses and rebuilds URL query state with defaults", () => {
    const parsed = parseDocumentQueryState("?scope=shared_groups&sort=created_desc&q=guide&type=md&status=ready");
    expect(parsed).toEqual({
      scope: "shared_groups",
      sort: "created_desc",
      viewMode: "library",
      knowledgeMode: "browse",
      query: "guide",
      itemType: "md",
      status: "ready",
      docId: undefined,
      folderId: null,
    });

    expect(
      buildDocumentQueryString(parsed),
    ).toBe("scope=shared_groups&sort=created_desc&q=guide&type=md&status=ready");
  });

  it("accepts my_drive scope in URL query state", () => {
    const parsed = parseDocumentQueryState("?scope=my_drive&sort=updated_desc");
    expect(parsed.scope).toBe("my_drive");
    expect(buildDocumentQueryString(parsed)).toContain("scope=my_drive");
  });

  it("supports editor mode with selected doc id in query", () => {
    const parsed = parseDocumentQueryState("?mode=editor&doc=42");
    expect(parsed.viewMode).toBe("editor");
    expect(parsed.knowledgeMode).toBe("browse");
    expect(parsed.docId).toBe(42);
    expect(buildDocumentQueryString(parsed)).toBe("scope=my_library&sort=updated_desc&mode=editor&doc=42");
  });

  it("persists Knowledge Vault mode in the URL only when non-browse", () => {
    const parsed = parseDocumentQueryState("?kv=memory_packs");
    expect(parsed.knowledgeMode).toBe("memory_packs");

    expect(
      buildDocumentQueryString({
        ...parsed,
        scope: "my_library",
        sort: "updated_desc",
        viewMode: "library",
        query: "",
      }),
    ).toContain("kv=memory_packs");
  });

  it("builds a share URL for the active document", () => {
    expect(
      buildDocumentShareUrl(
        {
          scope: "shared_groups",
          sort: "created_desc",
          viewMode: "library",
          knowledgeMode: "browse",
          query: "guide",
          itemType: "md",
          status: "ready",
        },
        42,
        "https://example.com",
      ),
    ).toBe(
      "https://example.com/document-management?scope=shared_groups&sort=created_desc&mode=editor&doc=42&q=guide&type=md&status=ready",
    );
  });

  it("builds a public share URL from a token", () => {
    expect(buildPublicDocumentShareUrl("abc123", "https://example.com")).toBe(
      "https://example.com/share/abc123",
    );
  });

  it("reads markdown preview fallback content from metadata", () => {
    expect(
      getMarkdownPreviewFallbackContent({
        metadata: {
          extracted_text: "# Hello from metadata",
        },
      } as any),
    ).toBe("# Hello from metadata");

    expect(
      getMarkdownPreviewFallbackContent({
        metadata: {
          extractedText: "  # Trimmed fallback  ",
        },
      } as any),
    ).toBe("  # Trimmed fallback  ");

    expect(getMarkdownPreviewFallbackContent({ metadata: {} } as any)).toBe("");
  });

  it("detects markdown files from metadata and source URL", () => {
    expect(
      isMarkdownLibraryItem({
        item_type: "document",
        source_url: "https://example.com/README.MD",
        metadata: {},
      } as any),
    ).toBe(true);
    expect(
      isMarkdownLibraryItem({
        item_type: "document",
        source_url: null,
        metadata: { extension: ".markdown" },
      } as any),
    ).toBe(true);
  });

  it("maps preview type and access labels", () => {
    expect(
      resolveDocumentPreviewType({
        item_type: "image",
        source_url: "https://example.com/a.png",
        metadata: {},
      } as any),
    ).toBe("image");

    expect(
      resolveDocumentPreviewType({
        item_type: "document",
        source_url: "https://example.com/a.docx",
        metadata: {},
      } as any),
    ).toBe("office");

    expect(
      resolveDocumentPreviewType({
        item_type: "video",
        source_url: "https://example.com/a.mp4",
        metadata: {},
      } as any),
    ).toBe("video");

    expect(
      resolveDocumentPreviewType({
        item_type: "document",
        source_url: "https://example.com/a.pdf",
        metadata: {},
      } as any),
    ).toBe("pdf");

    expect(
      resolveDocumentPreviewType({
        item_type: "document",
        source_url: "https://example.com/a.unknown",
        metadata: {},
      } as any),
    ).toBe("fallback");

    expect(getDocumentAccessLabel("owner")).toBe("Owner");
    expect(getDocumentAccessLabel("shared_direct")).toBe("Shared: Direct");
    expect(getDocumentAccessLabel("shared_group")).toBe("Shared: Group");
  });

  it("builds Knowledge Vault navigation modes from surface availability", () => {
    const modes = getKnowledgeVaultNavigationModes({
      quickSwitcher: true,
      inspector: true,
      savedViews: false,
      contextPacks: true,
      graph: false,
      canvas: true,
    });

    expect(modes.find((mode) => mode.mode === "browse")?.enabled).toBe(true);
    expect(modes.find((mode) => mode.mode === "related")?.enabled).toBe(true);
    expect(modes.find((mode) => mode.mode === "views")?.enabled).toBe(false);
    expect(modes.find((mode) => mode.mode === "graph")?.enabled).toBe(false);
    expect(modes.find((mode) => mode.mode === "memory_packs")?.enabled).toBe(true);
  });

  it("falls back to browse when a requested Knowledge Vault mode is disabled", () => {
    const availability = {
      quickSwitcher: true,
      inspector: false,
      savedViews: false,
      contextPacks: false,
      graph: false,
      canvas: false,
    };

    expect(resolveKnowledgeVaultMode("related", availability)).toBe("browse");
    expect(resolveKnowledgeVaultMode("unknown", availability)).toBe("browse");
    expect(resolveKnowledgeVaultMode("browse", availability)).toBe("browse");
    expect(getKnowledgeVaultModeQueryParam("browse")).toBeNull();
    expect(getKnowledgeVaultModeQueryParam("memory_packs")).toBe("memory_packs");
  });
});
