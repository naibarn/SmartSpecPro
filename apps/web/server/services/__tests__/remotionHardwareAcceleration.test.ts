/**
 * Guards the GPU-encoding policy for Remotion renders.
 *
 * Context (2026-08-02): `renderMedia()` defaults `hardwareAcceleration` to
 * `"disable"`, so every render encoded with libx264 on the CPU while the
 * worker's NVENC-capable GPU sat idle — Task Manager's Video Encode graph read
 * 0% for whole renders on an RTX 5060 Ti. The fix is one option, which makes
 * it exactly the kind of thing a later edit drops without anyone noticing.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveHardwareAcceleration } from "@smartspec/remotion-render/render-video-job";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..", "..");

/** Every `renderMedia()` call site in the repo, source-of-truth copies only. */
const RENDER_MEDIA_CALL_SITES = [
  "apps/web/server/services/remotionRuntimeAdapter.ts",
  "packages/remotion-render/src/renderFinalComposite.ts",
  "apps/worker-app/runtime-sidecar-remotion/render.mjs",
];

function readSource(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

describe("resolveHardwareAcceleration", () => {
  it("prefers the GPU by default", () => {
    expect(resolveHardwareAcceleration({})).toBe("if-possible");
  });

  it("honours the shared SMARTAIHUB_ENABLE_GPU_ENCODING switch", () => {
    expect(
      resolveHardwareAcceleration({ SMARTAIHUB_ENABLE_GPU_ENCODING: "1" }),
    ).toBe("if-possible");
    expect(
      resolveHardwareAcceleration({ SMARTAIHUB_ENABLE_GPU_ENCODING: "0" }),
    ).toBe("disable");
  });

  /**
   * "required" would turn a machine without NVENC — every CI runner, this
   * server, any worker on integrated graphics — from "renders a bit slower"
   * into "cannot render at all".
   */
  it("never demands hardware acceleration", () => {
    for (const value of ["1", "0", "", "true", undefined]) {
      expect(
        resolveHardwareAcceleration({ SMARTAIHUB_ENABLE_GPU_ENCODING: value }),
      ).not.toBe("required");
    }
  });
});

describe("renderMedia call sites", () => {
  it("all pass hardwareAcceleration", () => {
    for (const path of RENDER_MEDIA_CALL_SITES) {
      const source = readSource(path);
      const renderMediaCalls = source.split("renderMedia({").length - 1;
      const acceleratedCalls =
        source.split("hardwareAcceleration: resolveHardwareAcceleration()")
          .length - 1;
      expect(
        acceleratedCalls,
        `${path} has ${renderMediaCalls} renderMedia() call(s) but ${acceleratedCalls} with hardwareAcceleration`,
      ).toBe(renderMediaCalls);
    }
  });

  /**
   * Remotion silently falls back to software encoding when `crf`,
   * `encodingMaxRate`, or `encodingBufferSize` is set
   * (`hasSpecifiedUnsupportedHardwareQualifySettings` in @remotion/renderer) —
   * it only logs a warning. Adding one of these to tune quality would undo the
   * GPU switch with no visible failure, so the absence is asserted rather than
   * left to memory.
   */
  it("set no quality option that would silently disable the GPU encoder", () => {
    for (const path of RENDER_MEDIA_CALL_SITES) {
      const source = readSource(path);
      for (const option of ["crf", "encodingMaxRate", "encodingBufferSize"]) {
        expect(
          source,
          `${path} sets "${option}", which makes Remotion fall back to libx264`,
        ).not.toMatch(new RegExp(`^\\s*${option}\\s*:`, "m"));
      }
    }
  });

  it("gives Worker OffthreadVideo sources enough time to download before rendering", () => {
    const source = readSource(
      "apps/worker-app/runtime-sidecar-remotion/render.mjs",
    );
    const renderMediaCalls = source.split("renderMedia({").length - 1;
    const timeoutCalls =
      source.split(
        "timeoutInMilliseconds: REMOTION_RENDER_TIMEOUT_IN_MILLISECONDS",
      ).length - 1;

    expect(source).toContain(
      "REMOTION_RENDER_VIDEO_ATTEMPT_TIMEOUT_MS;",
    );
    expect(timeoutCalls).toBe(renderMediaCalls);
  });

  it("keeps the editable and packaged Worker Remotion sidecars identical", () => {
    expect(
      readSource("apps/worker-app/runtime-pack/remotion-sidecar/render.mjs"),
    ).toBe(readSource("apps/worker-app/runtime-sidecar-remotion/render.mjs"));
  });
});
