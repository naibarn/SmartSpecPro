import { describe, expect, it } from "vitest";

import {
  buildWorkerAppDownloadUrl,
  buildWorkerAppLatestUrl,
} from "../../src/versionUpdate";

describe("Worker App update URLs", () => {
  it("uses the server origin for the installer endpoint even when serverUrl has a path", () => {
    expect(
      buildWorkerAppDownloadUrl("https://smartaihub.app/api/desktop-releases/worker-app", {
        platform: "windows",
        architecture: "x64",
      }),
    ).toBe("https://smartaihub.app/api/desktop-releases/worker-app/download?platform=windows&architecture=x64");
  });

  it("selects the native macOS target explicitly", () => {
    expect(
      buildWorkerAppDownloadUrl("https://smartaihub.app", {
        platform: "macos",
        architecture: "arm64",
      }),
    ).toBe("https://smartaihub.app/api/desktop-releases/worker-app/download?platform=macos&architecture=arm64");
  });

  it("keeps the latest endpoint target-aware", () => {
    expect(
      buildWorkerAppLatestUrl("https://smartaihub.app/api", {
        platform: "windows",
        architecture: "x64",
      }),
    ).toBe("https://smartaihub.app/api/desktop-releases/worker-app/latest?platform=windows&architecture=x64");
  });
});
