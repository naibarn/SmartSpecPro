import { describe, expect, it } from "vitest";
import { shouldShowFloatingPreviewProgressGrid } from "./mediaStudioFloatingPreview";

describe("shouldShowFloatingPreviewProgressGrid", () => {
  it("does not let stale generation tasks override a manual media preview", () => {
    expect(shouldShowFloatingPreviewProgressGrid({
      mode: "media",
      taskCount: 9,
      isGenerating: false,
      hasStartedTasks: true,
    })).toBe(false);
  });

  it("shows the progress grid for an active multi-task generation session", () => {
    expect(shouldShowFloatingPreviewProgressGrid({
      mode: "tasks",
      taskCount: 9,
      isGenerating: true,
      hasStartedTasks: false,
    })).toBe(true);
  });

  it("keeps a completed generation batch visible while the preview remains in task mode", () => {
    expect(shouldShowFloatingPreviewProgressGrid({
      mode: "tasks",
      taskCount: 9,
      isGenerating: false,
      hasStartedTasks: true,
    })).toBe(true);
  });

  it("uses the normal media preview for single task results", () => {
    expect(shouldShowFloatingPreviewProgressGrid({
      mode: "tasks",
      taskCount: 1,
      isGenerating: true,
      hasStartedTasks: true,
    })).toBe(false);
  });
});
