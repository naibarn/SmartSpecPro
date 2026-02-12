import { describe, expect, it } from "vitest";

import {
  buildDocumentQueryString,
  getDocumentAccessLabel,
  isMarkdownLibraryItem,
  parseDocumentQueryState,
  resolveDocumentPreviewType,
} from "./documentManagementUi";

describe("documentManagementUi", () => {
  it("parses and rebuilds URL query state with defaults", () => {
    const parsed = parseDocumentQueryState("?scope=shared_groups&sort=created_desc&q=guide&type=md&status=ready");
    expect(parsed).toEqual({
      scope: "shared_groups",
      sort: "created_desc",
      viewMode: "library",
      query: "guide",
      itemType: "md",
      status: "ready",
      docId: undefined,
    });

    expect(
      buildDocumentQueryString(parsed),
    ).toBe("scope=shared_groups&sort=created_desc&q=guide&type=md&status=ready");
  });

  it("supports editor mode with selected doc id in query", () => {
    const parsed = parseDocumentQueryState("?mode=editor&doc=42");
    expect(parsed.viewMode).toBe("editor");
    expect(parsed.docId).toBe(42);
    expect(buildDocumentQueryString(parsed)).toBe("scope=my_library&sort=updated_desc&mode=editor&doc=42");
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
});
