/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { documentManagementTableRowsFixture } from "@/pages/DocumentManagement.mock";

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib/libraryUi", () => ({
  getLibraryItemProcessingMeta: (item: { status?: string }) => {
    switch (item.status) {
      case "indexing":
        return {
          label: "Indexing",
          className: "bg-sky-100 text-sky-800",
          detail: "Indexing in progress",
          searchQuality: "metadata_only",
        };
      case "draft":
        return {
          label: "Draft",
          className: "bg-amber-100 text-amber-800",
          detail: "Draft item",
          searchQuality: "full_text",
        };
      case "archived":
        return {
          label: "Archived",
          className: "bg-slate-100 text-slate-700",
          detail: "Archived item",
          searchQuality: "metadata_only",
        };
      default:
        return {
          label: "Ready",
          className: "bg-emerald-100 text-emerald-800",
          detail: "Ready item",
          searchQuality: "full_text",
        };
    }
  },
}));

import DocumentGridList from "./DocumentGridList";

describe("DocumentGridList", () => {
  it("renders direct table rows and supports core UI actions", () => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    const onFolderOpen = vi.fn();
    const onSelectionChange = vi.fn();

    render(
      <DocumentGridList
        items={documentManagementTableRowsFixture}
        selectedId={101}
        selectedIds={new Set([303])}
        onSelectionChange={onSelectionChange}
        onSelect={onSelect}
        onOpen={onOpen}
        onDelete={onDelete}
        onFolderOpen={onFolderOpen}
      />,
    );

    expect(screen.getByText("Knowledge Hub")).toBeTruthy();
    expect(
      screen.getByText("Desktop Worker With ZeroClaw-OpenClaw-NemoClaw.md"),
    ).toBeTruthy();
    expect(screen.getByText("Architecture Sketch.png")).toBeTruthy();
    expect(screen.getByText("Walkthrough.mp4")).toBeTruthy();
    expect(screen.getByText("Narration.m4a")).toBeTruthy();
    expect(screen.getByText("Release Notes.pdf")).toBeTruthy();

    fireEvent.click(screen.getByText("Knowledge Hub").closest("[role='button']")!);
    expect(onFolderOpen).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3010, item_type: "folder" }),
    );

    fireEvent.click(
      within(screen.getByText("Desktop Worker With ZeroClaw-OpenClaw-NemoClaw.md").closest("[role='button']") as HTMLElement)
        .getByRole("button", { name: /open/i }),
    );
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ id: 101, item_type: "md" }),
    );

    fireEvent.click(
      within(screen.getByText("Release Notes.pdf").closest("[role='button']") as HTMLElement)
        .getByRole("button", { name: /move to trash/i }),
    );
    expect(onDelete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 305, item_type: "pdf" }),
    );

    fireEvent.click(screen.getByLabelText("Select Walkthrough.mp4"));
    expect(onSelectionChange).toHaveBeenCalled();
  });

  it("does not request fallback video metadata until the card nears the viewport", async () => {
    let observerCallback: IntersectionObserverCallback | null = null;
    vi.stubGlobal(
      "IntersectionObserver",
      class MockIntersectionObserver {
        constructor(callback: IntersectionObserverCallback) {
          observerCallback = callback;
        }

        observe() {}
        disconnect() {}
      },
    );

    render(
      <DocumentGridList
        items={[
          {
            ...documentManagementTableRowsFixture.find(item => item.id === 303)!,
            thumbnail_url: null,
          },
        ]}
        onSelect={vi.fn()}
      />,
    );

    const video = document.querySelector("video");
    expect(video).not.toHaveAttribute("src");
    expect(video).toHaveAttribute("preload", "none");

    observerCallback?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );

    await waitFor(() => {
      expect(video).toHaveAttribute("src", "https://example.com/walkthrough.mp4");
      expect(video).toHaveAttribute("preload", "metadata");
    });
    vi.unstubAllGlobals();
  });
});
