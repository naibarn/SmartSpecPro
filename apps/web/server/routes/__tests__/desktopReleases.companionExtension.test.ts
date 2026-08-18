import fs from "fs";
import os from "os";
import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import { createDesktopReleaseRouter } from "../desktopReleases";

const originalPublicReleaseDir = process.env.SMARTAIHUB_PUBLIC_RELEASES_DIR;
const temporaryDirs: string[] = [];

afterEach(() => {
  if (originalPublicReleaseDir == null) delete process.env.SMARTAIHUB_PUBLIC_RELEASES_DIR;
  else process.env.SMARTAIHUB_PUBLIC_RELEASES_DIR = originalPublicReleaseDir;
  for (const dir of temporaryDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function getRouteHandler(routePath: string) {
  const router = createDesktopReleaseRouter() as any;
  const layer = router.stack.find((candidate: any) => candidate.route?.path === routePath);
  return layer?.route?.stack?.[0]?.handle as ((req: any, res: any) => unknown) | undefined;
}

function invokeJsonRoute(routePath: string) {
  const handler = getRouteHandler(routePath);
  if (!handler) return null;
  let payload: any = null;
  const res = {
    setHeader: () => undefined,
    status: () => res,
    json: (value: any) => { payload = value; return res; },
  };
  handler({}, res);
  return payload;
}

describe("SmartAIHub Companion public releases", () => {
  it("registers canonical and legacy latest/download routes", () => {
    expect(getRouteHandler("/companion-extension/latest")).toBeTypeOf("function");
    expect(getRouteHandler("/companion-extension/download")).toBeTypeOf("function");
    expect(getRouteHandler("/marketplace-extension/latest")).toBeTypeOf("function");
    expect(getRouteHandler("/marketplace-extension/download")).toBeTypeOf("function");
  });

  it("selects the highest release across canonical and legacy filenames", () => {
    const releaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "companion-release-test-"));
    temporaryDirs.push(releaseDir);
    fs.writeFileSync(path.join(releaseDir, "smartaihub-marketplace-capture-extension-9.9.8.zip"), "legacy");
    fs.writeFileSync(path.join(releaseDir, "smartaihub-companion-extension-9.9.9.zip"), "canonical");
    process.env.SMARTAIHUB_PUBLIC_RELEASES_DIR = releaseDir;

    const canonical = invokeJsonRoute("/companion-extension/latest");
    const legacy = invokeJsonRoute("/marketplace-extension/latest");

    expect(canonical?.release).toMatchObject({
      version: "9.9.9",
      fileName: "smartaihub-companion-extension-9.9.9.zip",
      downloadUrl: "/api/desktop-releases/companion-extension/download",
    });
    expect(legacy?.release).toMatchObject({
      version: "9.9.9",
      fileName: "smartaihub-companion-extension-9.9.9.zip",
      downloadUrl: "/api/desktop-releases/marketplace-extension/download",
    });
  });

  it("retains the updated-at tie-break across both filename families", () => {
    const releaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "companion-release-tie-test-"));
    temporaryDirs.push(releaseDir);
    const legacyPath = path.join(releaseDir, "smartaihub-marketplace-capture-extension-9.9.9.zip");
    const canonicalPath = path.join(releaseDir, "smartaihub-companion-extension-9.9.9.zip");
    fs.writeFileSync(legacyPath, "legacy");
    fs.writeFileSync(canonicalPath, "canonical");
    fs.utimesSync(legacyPath, new Date("2026-08-17T00:00:00Z"), new Date("2026-08-17T00:00:00Z"));
    fs.utimesSync(canonicalPath, new Date("2026-08-18T00:00:00Z"), new Date("2026-08-18T00:00:00Z"));
    process.env.SMARTAIHUB_PUBLIC_RELEASES_DIR = releaseDir;

    expect(invokeJsonRoute("/companion-extension/latest")?.release?.fileName)
      .toBe("smartaihub-companion-extension-9.9.9.zip");
  });
});
