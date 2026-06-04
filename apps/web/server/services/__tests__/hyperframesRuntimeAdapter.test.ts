import { mkdtempSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertHyperframesProducerRuntimeAllowed,
  buildHyperframesProducerFallbackHtml,
  executeHyperframesProducerRender,
  getHyperframesRuntimeMode,
  isHyperframesProducerRuntimeAllowed,
} from "../hyperframesRuntimeAdapter";

describe("hyperframesRuntimeAdapter", () => {
  const workspaces: string[] = [];

  afterEach(async () => {
    await Promise.all(
      workspaces.map(workspace => rm(workspace, { recursive: true, force: true }))
    );
    workspaces.length = 0;
  });

  function workspace() {
    const dir = mkdtempSync(join(tmpdir(), "ssp-hyperframes-runtime-adapter-"));
    workspaces.push(dir);
    return dir;
  }

  it("keeps producer runtime blocked unless the production rollout gate is explicit", () => {
    expect(getHyperframesRuntimeMode({})).toBe("smoke");
    expect(getHyperframesRuntimeMode({ HYPERFRAMES_RUNTIME_MODE: "producer" })).toBe(
      "producer"
    );
    expect(
      isHyperframesProducerRuntimeAllowed({ HYPERFRAMES_RUNTIME_MODE: "producer" })
    ).toBe(false);
    expect(() =>
      assertHyperframesProducerRuntimeAllowed({ HYPERFRAMES_RUNTIME_MODE: "producer" })
    ).toThrow(/blocked/);
  });

  it("builds a valid minimal HyperFrames composition without exposing raw product HTML", () => {
    const html = buildHyperframesProducerFallbackHtml({
      productId: "product_1",
      templateId: "marketplace_storyboard_motion_9x9_v1",
      platformPresetId: "generic_vertical_9_16",
    });

    expect(html).toContain('data-composition-id="ssp-marketplace-auto-review"');
    expect(html).toContain('data-duration="1"');
    expect(html).not.toContain("payloadJson");
  });

  it("executes producer through dynamic imports when the gate is ready", async () => {
    const dir = workspace();
    const outputPath = join(dir, "output.mp4");
    const createRenderJob = vi.fn((config: Record<string, unknown>) => config);
    const executeRenderJob = vi.fn(async (job: unknown) => {
      const output = (job as Record<string, unknown>).output as string;
      await writeFile(output, Buffer.from("mp4"));
      return { ok: true };
    });

    const result = await executeHyperframesProducerRender({
      workspace: dir,
      outputPath,
      env: {
        HYPERFRAMES_RUNTIME_MODE: "producer",
        HYPERFRAMES_PRODUCTION_RUNTIME_READY: "1",
      },
      payload: {
        compositionHtml:
          '<div data-composition-id="test" data-width="720" data-height="1280"></div>',
      },
      importer: async specifier => {
        expect(specifier).toBe("@hyperframes/producer");
        return { createRenderJob, executeRenderJob };
      },
    });

    expect(createRenderJob).toHaveBeenCalledWith(
      expect.objectContaining({
        input: join(dir, "index.html"),
        output: outputPath,
        format: "mp4",
      })
    );
    expect(executeRenderJob).toHaveBeenCalledTimes(1);
    expect(result.renderer).toBe("hyperframes_producer");
  });
});
