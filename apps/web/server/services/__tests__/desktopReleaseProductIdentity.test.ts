import { describe, expect, it } from "vitest";
import { isWorkerAppReleaseFileName } from "../desktopReleaseService";

describe("desktop release product identification", () => {
  it("identifies versioned Worker installers for both supported platforms", () => {
    expect(
      isWorkerAppReleaseFileName(
        "smart-ai-hub-worker-app-0.1.433-x64-setup.exe"
      )
    ).toBe(true);
    expect(
      isWorkerAppReleaseFileName(
        "smart-ai-hub-worker-app-0.1.433-arm64-setup.dmg"
      )
    ).toBe(true);
  });
  it("does not treat the desktop installer or Worker runtime as a Worker installer", () => {
    expect(
      isWorkerAppReleaseFileName("SmartAIHub.Desktop_0.1.1_x64-setup.exe")
    ).toBe(false);
    expect(
      isWorkerAppReleaseFileName("smart-ai-hub-worker-runtime-0.1.433.zip")
    ).toBe(false);
  });
});
