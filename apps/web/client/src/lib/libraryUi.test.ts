import { describe, expect, it, vi } from "vitest";

import {
  buildTaskLibraryErrorState,
  buildTaskLibraryStateFromAddResult,
  getAddToLibrarySuccessMessage,
  getLibraryStatusMeta,
  isMediaTaskEligibleForLibraryAdd,
  selectLibrarySearchItem,
  type LibrarySearchResultItem,
} from "./libraryUi";

describe("libraryUi helpers", () => {
  it("shows add-to-library eligibility only for completed tasks with result URL", () => {
    expect(
      isMediaTaskEligibleForLibraryAdd({
        id: "task-1",
        status: "completed",
        resultUrl: "https://example.com/image.png",
      }),
    ).toBe(true);

    expect(
      isMediaTaskEligibleForLibraryAdd({
        id: "task-2",
        status: "processing",
        resultUrl: "https://example.com/video.mp4",
      }),
    ).toBe(false);

    expect(
      isMediaTaskEligibleForLibraryAdd({
        id: "task-3",
        status: "completed",
        resultUrl: "",
      }),
    ).toBe(false);
  });

  it("builds success state and message for created library item", () => {
    const result = {
      itemId: 101,
      created: true,
      taskStatus: "completed",
      indexJob: {
        status: "pending",
        created: true,
      },
    };

    expect(buildTaskLibraryStateFromAddResult(result)).toEqual({
      action: "added",
      itemId: 101,
      created: true,
      status: "indexing",
    });
    expect(getAddToLibrarySuccessMessage(result)).toBe("Added to library. Indexing started.");
  });

  it("returns already-added message when source link already exists", () => {
    const result = {
      itemId: 88,
      created: false,
      taskStatus: "completed",
      indexJob: {
        status: "processing",
        created: false,
      },
    };

    expect(getAddToLibrarySuccessMessage(result)).toBe("Already in library.");
  });

  it("builds readable error state from API failures", () => {
    const state = buildTaskLibraryErrorState(new Error("Task not found"));
    expect(state.action).toBe("error");
    expect(state.status).toBe("failed");
    expect(state.message).toContain("Task not found");
  });

  it("selects search result and invokes callback with selected item", () => {
    const callback = vi.fn();
    const results: LibrarySearchResultItem[] = [
      {
        item_id: 1,
        item_type: "image",
        title: "Hero image",
        source_url: "https://cdn.example.com/hero.png",
        thumbnail_url: null,
        status: "ready",
        source: "media_task",
        provider_name: "kie.ai",
        model_name: "flux",
      },
      {
        item_id: 2,
        item_type: "video",
        title: "Intro clip",
        source_url: "https://cdn.example.com/intro.mp4",
        thumbnail_url: null,
        status: "indexing",
        source: "media_task",
        provider_name: "kie.ai",
        model_name: "veo",
      },
    ];

    expect(selectLibrarySearchItem(results, 2, callback)).toBe(true);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(results[1]);

    expect(selectLibrarySearchItem(results, 999, callback)).toBe(false);
  });

  it("maps status metadata for indexing and failed states", () => {
    expect(getLibraryStatusMeta("indexing")).toMatchObject({
      label: "Indexing",
      retryable: false,
    });
    expect(getLibraryStatusMeta("failed")).toMatchObject({
      label: "Failed",
      retryable: true,
    });
  });
});
