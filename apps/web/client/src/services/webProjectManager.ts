/**
 * Web Project Manager
 * Handles project persistence on the web platform:
 * - Export as .videoproj file (browser download)
 * - Import from .videoproj file (browser file input)
 */

import type { VideoEditorProject } from "../types/videoEditor";
import { migrateProjectV1ToV2 } from "../types/videoEditor";
import { validateProjectStructure } from "./projectManager";

export class WebProjectManager {
  /**
   * Export project as a .videoproj file download.
   */
  async exportProject(project: VideoEditorProject): Promise<void> {
    const json = JSON.stringify(project, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `${project.name || "project"}.videoproj`;
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  /**
   * Import a .videoproj file from the browser file input.
   * Validates and auto-migrates the project.
   */
  async importProject(file: File): Promise<VideoEditorProject> {
    const text = await file.text();
    let data: any;

    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Invalid project file: not valid JSON");
    }

    // Auto-migrate v1.0 -> v2.0
    if (data.version === "1.0") {
      data = migrateProjectV1ToV2(data);
    }

    // Validate structure
    return validateProjectStructure(data);
  }
}
