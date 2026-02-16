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
        recentDays: 7,
        onRecentDaysChange: vi.fn(),
        isLoading: false,
        results: [],
        onSelect: vi.fn(),
      }),
    );

    expect(html).toContain("Search Library");
    expect(html).toContain("Updated in:");
  });

  it("renders search results with status labels", () => {
    const html = renderToStaticMarkup(
      React.createElement(LibrarySearchPanel, {
        query: "hero",
        onQueryChange: vi.fn(),
        recentDays: 7,
        onRecentDaysChange: vi.fn(),
        isLoading: false,
        selectedItemId: 2,
        onSelect: vi.fn(),
        results: [
          {
            item_id: 1,
            item_type: "image",
            title: "Hero image",
            source_url: "https://cdn.example.com/hero.png",
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
            source_url: "https://cdn.example.com/launch.mp4",
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

  it("renders thumbnail previews for image and video search results", () => {
    const html = renderToStaticMarkup(
      React.createElement(LibrarySearchPanel, {
        query: "lion",
        onQueryChange: vi.fn(),
        recentDays: 7,
        onRecentDaysChange: vi.fn(),
        isLoading: false,
        selectedItemId: null,
        onSelect: vi.fn(),
        results: [
          {
            item_id: 10,
            item_type: "image",
            title: "Lion image",
            source_url: "https://cdn.example.com/lion-full.png",
            thumbnail_url: "https://cdn.example.com/lion-thumb.png",
            status: "ready",
            source: "media_task",
            provider_name: "kie.ai",
            model_name: "z-image",
          },
          {
            item_id: 11,
            item_type: "video",
            title: "Lion video",
            source_url: "https://cdn.example.com/lion.mp4",
            thumbnail_url: null,
            status: "ready",
            source: "media_task",
            provider_name: "kie.ai",
            model_name: "veo-3",
          },
        ],
      }),
    );

    expect(html).toContain('src="https://cdn.example.com/lion-thumb.png"');
    expect(html).toContain('src="https://cdn.example.com/lion.mp4"');
    expect(html).toContain("<video");
  });
});
