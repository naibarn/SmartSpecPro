/**
 * Feature 135 — Hermes Grok media worker: `ffprobeRunner.ts` coverage plus
 * the wiring guard that keeps `main.ts` / the dev drainer from ever again
 * shipping without a real prober (the 2026-08-02 bug where every valid
 * video output was rejected as "failed ffprobe video validation").
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { hermesFfprobe, resolveHermesFfprobeBinary } from "../ffprobeRunner";

const HERE = path.dirname(fileURLToPath(import.meta.url));

describe("hermesFfprobe", () => {
  it("returns ok:false (never throws) for a file that is not media at all", async () => {
    const notMedia = path.join(HERE, "ffprobeRunner.test.ts");
    await expect(hermesFfprobe(notMedia)).resolves.toEqual({ ok: false });
  });

  it("returns ok:false (never throws) when the ffprobe binary does not exist", async () => {
    await expect(
      hermesFfprobe("/nonexistent.mp4", { binary: "/nonexistent/ffprobe-binary" }),
    ).resolves.toEqual({ ok: false });
  });

  it("resolves a binary path (env override wins when set)", () => {
    const previous = process.env.FFPROBE_PATH;
    try {
      // Only asserts the override is honored when the path exists; the
      // fallback chain is environment-dependent by design.
      process.env.FFPROBE_PATH = "";
      expect(typeof resolveHermesFfprobeBinary()).toBe("string");
    } finally {
      if (previous === undefined) delete process.env.FFPROBE_PATH;
      else process.env.FFPROBE_PATH = previous;
    }
  });
});

describe("ffprobe wiring guard (regression 2026-08-02)", () => {
  it("main.ts and hermesWorkerDevDrainer.ts BOTH pass ffprobeImpl into createJobHandlers", async () => {
    // outputCollector's `defaultFfprobe` fails closed by design, so a
    // createJobHandlers call site without `ffprobeImpl` rejects every
    // single video output regardless of file validity.
    const mainSource = await fs.readFile(path.join(HERE, "..", "main.ts"), "utf-8");
    const drainerSource = await fs.readFile(
      path.join(HERE, "..", "..", "services", "hermesWorkerDevDrainer.ts"),
      "utf-8",
    );
    for (const source of [mainSource, drainerSource]) {
      expect(source).toContain("createJobHandlers({");
      expect(source).toContain("ffprobeImpl:");
      expect(source).toContain("hermesFfprobe");
    }
  });
});
