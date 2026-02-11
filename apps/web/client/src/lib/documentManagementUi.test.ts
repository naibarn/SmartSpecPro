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
      query: "guide",
      itemType: "md",
      status: "ready",
    });

    expect(
      buildDocumentQueryString(parsed),
    ).toBe("scope=shared_groups&sort=created_desc&q=guide&type=md&status=ready");
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
        source_url: "https://example.com/a.unknown",
        metadata: {},
      } as any),
    ).toBe("fallback");

    expect(getDocumentAccessLabel("owner")).toBe("Owner");
    expect(getDocumentAccessLabel("shared_direct")).toBe("Shared: Direct");
    expect(getDocumentAccessLabel("shared_group")).toBe("Shared: Group");
  });
});
