import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/input", () => ({
  Input: (props: Record<string, unknown>) => React.createElement("input", props),
}));

vi.mock("@/components/ui/button", () => ({
  Button: (props: Record<string, unknown>) => React.createElement("button", props),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: (props: Record<string, unknown>) => React.createElement("span", props),
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: (props: Record<string, unknown>) => React.createElement("div", props),
}));

import LibrarySearchPanel from "./LibrarySearchPanel";

describe("LibrarySearchPanel", () => {
  it("renders helper text when query is empty", () => {
    const html = renderToStaticMarkup(
      React.createElement(LibrarySearchPanel, {
        query: "",
        onQueryChange: vi.fn(),
        isLoading: false,
        results: [],
        onSelect: vi.fn(),
      }),
    );

    expect(html).toContain("Search Library");
    expect(html).toContain("Type to search indexed library items for reuse.");
  });

  it("renders search results with status labels", () => {
    const html = renderToStaticMarkup(
      React.createElement(LibrarySearchPanel, {
        query: "hero",
        onQueryChange: vi.fn(),
        isLoading: false,
        selectedItemId: 2,
        onSelect: vi.fn(),
        results: [
          {
            item_id: 1,
            item_type: "image",
            title: "Hero image",
            thumbnail_url: null,
            status: "indexing",
            source: "media_task",
            provider_name: "kie.ai",
            model_name: "flux-2.0",
          },
          {
            item_id: 2,
            item_type: "video",
            title: "Launch scene",
            thumbnail_url: null,
            status: "failed",
            source: "media_task",
            provider_name: "kie.ai",
            model_name: "veo-3-1",
          },
        ],
      }),
    );

    expect(html).toContain("Hero image");
    expect(html).toContain("Launch scene");
    expect(html).toContain("Indexing");
    expect(html).toContain("Failed");
    expect(html).toContain("Retry from Media History");
  });
});
