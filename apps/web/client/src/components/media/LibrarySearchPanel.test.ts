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

  it("renders item type filter controls and treats the selected type as an active search", () => {
    const html = renderToStaticMarkup(
      React.createElement(LibrarySearchPanel, {
        query: "",
        onQueryChange: vi.fn(),
        recentDays: "all",
        onRecentDaysChange: vi.fn(),
        isLoading: false,
        itemTypeFilter: "video",
        onItemTypeFilterChange: vi.fn(),
        results: [],
        onSelect: vi.fn(),
      }),
    );

    expect(html).toContain("All");
    expect(html).toContain("Image");
    expect(html).toContain("Video");
    expect(html).toContain("No matching library items.");
    expect(html).not.toContain("Pick a timeframe, type, or media kind");
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

  it("marks searchable results as draggable for reference reuse", () => {
    const html = renderToStaticMarkup(
      React.createElement(LibrarySearchPanel, {
        query: "mix",
        onQueryChange: vi.fn(),
        recentDays: 7,
        onRecentDaysChange: vi.fn(),
        isLoading: false,
        selectedItemId: null,
        onSelect: vi.fn(),
        results: [
          {
            item_id: 21,
            item_type: "image",
            title: "Landscape",
            source_url: "https://cdn.example.com/landscape.png",
            thumbnail_url: null,
            status: "ready",
            source: "media_task",
            provider_name: "kie.ai",
            model_name: "z-image",
          },
          {
            item_id: 22,
            item_type: "video",
            title: "Walkthrough",
            source_url: "https://cdn.example.com/walkthrough.mp4",
            thumbnail_url: "https://cdn.example.com/walkthrough-thumb.png",
            status: "ready",
            source: "media_task",
            provider_name: "kie.ai",
            model_name: "kling-3.0",
          },
        ],
      }),
    );

    expect(html).toContain('draggable="true"');
    expect(html).toContain("cursor-grab");
  });

  it("renders an add to reference action when provided", () => {
    const html = renderToStaticMarkup(
      React.createElement(LibrarySearchPanel, {
        query: "mix",
        onQueryChange: vi.fn(),
        recentDays: 7,
        onRecentDaysChange: vi.fn(),
        isLoading: false,
        selectedItemId: null,
        onAddToReference: vi.fn(),
        addToReferenceLabel: "Use as reference",
        onSelect: vi.fn(),
        results: [
          {
            item_id: 31,
            item_type: "video",
            title: "Reference clip",
            source_url: "https://cdn.example.com/reference-clip.mp4",
            thumbnail_url: "https://cdn.example.com/reference-clip-thumb.png",
            status: "ready",
            source: "media_task",
            provider_name: "kie.ai",
            model_name: "kling-3.0",
          },
        ],
      }),
    );

    expect(html).toContain("Use as reference");
  });
});
