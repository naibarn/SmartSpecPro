import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { AssetLibraryPanel, type CanvasLibraryAsset } from "./AssetLibraryPanel";

describe("AssetLibraryPanel", () => {
  const assets: CanvasLibraryAsset[] = Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    kind: "image",
    title: `Image ${index + 1}`,
    sourceUrl: `https://cdn.example.com/image-${index + 1}.png`,
    thumbnailUrl: `https://cdn.example.com/thumb-${index + 1}.png`,
    sourceType: index % 2 === 0 ? "library" : "history",
  }));

  it("uses a flex-based scroll region for media tabs", () => {
    render(
      <AssetLibraryPanel
        activeTab="photos"
        onTabChange={vi.fn()}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        assets={assets}
        isLoading={false}
        slidesPanel={<div>Slides</div>}
        onInsertAsset={vi.fn()}
        onDragAssetStart={vi.fn()}
      />,
    );

    const scrollArea = screen.getByTestId("asset-library-scroll-area");
    expect(scrollArea.className).toContain("h-0");
    expect(scrollArea.className).toContain("min-h-0");
    expect(scrollArea.className).toContain("flex-1");
    expect(scrollArea.className).not.toContain("h-[calc(70vh-160px)]");
    expect(screen.getAllByRole("button", { name: /^drag image image \d+ to canvas$/i })).toHaveLength(6);
  });

  it("filters visible assets by source without collapsing the list surface", () => {
    render(
      <AssetLibraryPanel
        activeTab="photos"
        onTabChange={vi.fn()}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        assets={assets}
        isLoading={false}
        slidesPanel={<div>Slides</div>}
        onInsertAsset={vi.fn()}
        onDragAssetStart={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /filter source history/i }));
    expect(screen.getAllByRole("button", { name: /^drag image image \d+ to canvas$/i })).toHaveLength(3);
    expect(screen.getByTestId("asset-library-scroll-area").className).toContain("h-0");
    expect(screen.getByTestId("asset-library-scroll-area").className).toContain("flex-1");
  });
});
