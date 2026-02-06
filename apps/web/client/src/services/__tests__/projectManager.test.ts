/**
 * Tests for ProjectManager validation bug fix and platform detection.
 */
import { describe, it, expect, vi } from "vitest";

// We need to mock Tauri APIs before importing projectManager
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
  open: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

import { createEmptyProject } from "../../types/videoEditor";

// Import the validateProjectStructure function (we'll export it for testing)
// Since validateProjectStructure is a private function, we test it indirectly through loadProject
// But we can test it by importing the module and calling it on valid/invalid data

describe("ProjectManager", () => {
  it("validateProjectStructure accepts sampleRate (camelCase)", async () => {
    // Create a valid project with camelCase sampleRate
    const project = createEmptyProject("Test Project");

    // The project has settings.sampleRate = 48000 (camelCase)
    expect(project.settings.sampleRate).toBe(48000);

    // Import the validateProjectStructure function
    const { validateProjectStructure } = await import(
      "../projectManager"
    );

    // This should NOT throw - the bug was that it checked sample_rate (snake_case)
    const validated = validateProjectStructure(
      JSON.parse(JSON.stringify(project)),
    );
    expect(validated).toBeTruthy();
    expect(validated.settings.sampleRate).toBe(48000);
  });

  it("validateProjectStructure accepts overlay track type", async () => {
    const project = createEmptyProject("Test");
    // Add an overlay track
    project.timeline.tracks.push({
      id: "track-ov1",
      type: "overlay",
      name: "OV1",
      clips: [],
      muted: false,
      locked: false,
    });

    const { validateProjectStructure } = await import(
      "../projectManager"
    );

    // This should NOT throw - overlay is a valid track type
    const validated = validateProjectStructure(
      JSON.parse(JSON.stringify(project)),
    );
    expect(validated.timeline.tracks).toHaveLength(3);
  });

  it("validateProjectStructure rejects invalid sampleRate", async () => {
    const project = createEmptyProject("Test");
    (project.settings as any).sampleRate = 100; // Too low

    const { validateProjectStructure } = await import(
      "../projectManager"
    );

    expect(() =>
      validateProjectStructure(JSON.parse(JSON.stringify(project))),
    ).toThrow("Invalid sample rate");
  });
});
