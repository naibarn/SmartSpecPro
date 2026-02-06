import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebProjectManager } from "../webProjectManager";
import { createEmptyProject } from "../../types/videoEditor";

describe("WebProjectManager", () => {
  let manager: WebProjectManager;

  beforeEach(() => {
    vi.resetAllMocks();
    manager = new WebProjectManager();
  });

  it("exportProject creates blob and triggers download", async () => {
    const project = createEmptyProject("Test Export");

    const createObjectURL = vi.fn(() => "blob:test-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    const clickSpy = vi.fn();
    const mockElement = {
      href: "",
      download: "",
      click: clickSpy,
      style: {} as any,
    };

    // Mock document for Node test environment
    vi.stubGlobal("document", {
      createElement: vi.fn(() => mockElement),
      body: {
        appendChild: vi.fn((el: any) => el),
        removeChild: vi.fn((el: any) => el),
      },
    });

    await manager.exportProject(project);

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("importProject reads file and returns parsed project", async () => {
    const project = createEmptyProject("Import Test");
    const jsonStr = JSON.stringify(project);
    const file = new File([jsonStr], "project.videoproj", {
      type: "application/json",
    });

    const result = await manager.importProject(file);
    expect(result.name).toBe("Import Test");
    expect(result.version).toBeDefined();
  });

  it("importProject rejects invalid JSON", async () => {
    const file = new File(["not json"], "bad.videoproj", {
      type: "application/json",
    });

    await expect(manager.importProject(file)).rejects.toThrow();
  });

  it("importProject rejects structurally invalid project", async () => {
    const file = new File(
      [JSON.stringify({ foo: "bar" })],
      "bad.videoproj",
      { type: "application/json" },
    );

    await expect(manager.importProject(file)).rejects.toThrow();
  });
});
