import { describe, expect, it } from "vitest";
import { resolveVerticalDramaShotImageDisplayState } from "./shotImageDisplayState";

describe("resolveVerticalDramaShotImageDisplayState", () => {
  it("keeps prompt-ready generation visible while a task is pending", () => {
    expect(
      resolveVerticalDramaShotImageDisplayState({
        hasPrompt: true,
        hasAsset: false,
        imageTask: { pendingTaskId: "task-1", status: "processing" },
      })
    ).toEqual({
      kind: "generating",
      promptReady: true,
      taskStatus: "processing",
    });
  });

  it("surfaces a prompt-ready provider failure", () => {
    expect(
      resolveVerticalDramaShotImageDisplayState({
        hasPrompt: true,
        hasAsset: false,
        imageTask: {
          status: "failed",
          failureStage: "provider",
          lastTaskId: "task-1",
          error: "Provider timeout",
        },
      })
    ).toEqual({
      kind: "failed",
      failureStage: "provider",
      error: "Provider timeout",
      hasTaskId: true,
    });
  });

  it("prefers a current transient admission failure over an empty image state", () => {
    expect(
      resolveVerticalDramaShotImageDisplayState({
        hasPrompt: true,
        hasAsset: false,
        transientError: "No image model selected",
      })
    ).toEqual({
      kind: "failed",
      error: "No image model selected",
      hasTaskId: false,
    });
  });

  it("preserves sync failure as a distinct retryable state", () => {
    expect(
      resolveVerticalDramaShotImageDisplayState({
        hasPrompt: true,
        hasAsset: false,
        imageTask: {
          status: "failed",
          failureStage: "sync",
          lastTaskId: "task-2",
          error: "Asset import failed",
        },
      })
    ).toEqual({
      kind: "failed",
      failureStage: "sync",
      error: "Asset import failed",
      hasTaskId: true,
    });
  });

  it("distinguishes browser loading, load failure, and ready", () => {
    const base = { hasPrompt: true, hasAsset: true };
    expect(
      resolveVerticalDramaShotImageDisplayState({
        ...base,
        browserState: "loading",
      })
    ).toEqual({ kind: "asset_loading" });
    expect(
      resolveVerticalDramaShotImageDisplayState({
        ...base,
        browserState: "error",
      })
    ).toEqual({ kind: "asset_load_failed" });
    expect(
      resolveVerticalDramaShotImageDisplayState({
        ...base,
        browserState: "loaded",
      })
    ).toEqual({ kind: "ready" });
  });

  it("does not let an old failed task hide a newer pending task", () => {
    expect(
      resolveVerticalDramaShotImageDisplayState({
        hasPrompt: true,
        hasAsset: true,
        isGenerating: true,
        imageTask: {
          status: "failed",
          error: "old task",
          lastTaskId: "old-task",
        },
        browserState: "loaded",
      }).kind
    ).toBe("generating");
  });
});
