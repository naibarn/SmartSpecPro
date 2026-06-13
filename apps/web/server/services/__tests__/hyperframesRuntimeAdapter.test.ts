import { mkdtempSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertHyperframesCliRuntimeAllowed,
  assertHyperframesProducerRuntimeAllowed,
  buildHyperframesProducerFallbackHtml,
  executeHyperframesCliRender,
  executeHyperframesProducerRender,
  getHyperframesRuntimeMode,
  isHyperframesCliRuntimeAllowed,
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
    expect(getHyperframesRuntimeMode({})).toBe("diagnostic");
    expect(getHyperframesRuntimeMode({ HYPERFRAMES_RUNTIME_MODE: "cli" })).toBe(
      "cli"
    );
    expect(getHyperframesRuntimeMode({ HYPERFRAMES_RUNTIME_MODE: "producer" })).toBe(
      "producer"
    );
    expect(
      isHyperframesProducerRuntimeAllowed({ HYPERFRAMES_RUNTIME_MODE: "producer" })
    ).toBe(false);
    expect(() =>
      assertHyperframesProducerRuntimeAllowed({ HYPERFRAMES_RUNTIME_MODE: "producer" })
    ).toThrow(/blocked/);
    expect(
      isHyperframesCliRuntimeAllowed({
        HYPERFRAMES_RUNTIME_MODE: "cli",
        HYPERFRAMES_OFFICIAL_RUNTIME_READY: "1",
        HYPERFRAMES_ALLOW_NODE20_OFFICIAL_RUNTIME: "1",
      })
    ).toBe(true);
    expect(() =>
      assertHyperframesCliRuntimeAllowed({
        HYPERFRAMES_RUNTIME_MODE: "cli",
        HYPERFRAMES_OFFICIAL_RUNTIME_READY: "0",
        HYPERFRAMES_ALLOW_NODE20_OFFICIAL_RUNTIME: "1",
      })
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
    const executeRenderJob = vi.fn(
      async (_job: unknown, projectDir: string, output: string) => {
        expect(projectDir).toBe(dir);
        await writeFile(output, Buffer.from("mp4"));
        return { ok: true };
      }
    );

    const result = await executeHyperframesProducerRender({
      workspace: dir,
      outputPath,
      env: {
        HYPERFRAMES_RUNTIME_MODE: "producer",
        HYPERFRAMES_OFFICIAL_RUNTIME_READY: "1",
        HYPERFRAMES_ALLOW_NODE20_OFFICIAL_RUNTIME: "1",
        HYPERFRAMES_PLAYER_READY_TIMEOUT_MS: "7000",
      },
      payload: {
        compositionHtml:
          '<div data-composition-id="test" data-width="720" data-height="1280"></div>',
        hyperframesVariables: {
          hookText: "Custom hook",
        },
      },
      importer: async specifier => {
        expect(specifier).toBe("@hyperframes/producer");
        return { createRenderJob, executeRenderJob };
      },
    });

    expect(createRenderJob).toHaveBeenCalledWith(
      expect.objectContaining({
        entryFile: "index.html",
        format: "mp4",
        variables: {
          hookText: "Custom hook",
        },
      })
    );
    expect(executeRenderJob).toHaveBeenCalledWith(
      expect.anything(),
      dir,
      outputPath
    );
    expect(result.renderer).toBe("hyperframes_producer");
    expect(result.officialRuntime).toBe(true);
    expect(result.runtimeDiagnostics.playerReadyTimeoutMs).toBe(7000);
  });

  it("executes the pinned HyperFrames CLI with an injected runner", async () => {
    const dir = workspace();
    const outputPath = join(dir, "output.mp4");
    const commandRunner = vi.fn(async (_command: string, args: string[]) => {
      expect(args).toContain("render");
      expect(args).toContain("--strict");
      await writeFile(outputPath, Buffer.from("mp4"));
      return { ok: true };
    });

    const result = await executeHyperframesCliRender({
      workspace: dir,
      outputPath,
      env: {
        HYPERFRAMES_RUNTIME_MODE: "cli",
        HYPERFRAMES_OFFICIAL_RUNTIME_READY: "1",
        HYPERFRAMES_ALLOW_NODE20_OFFICIAL_RUNTIME: "1",
        HYPERFRAMES_PLAYER_READY_TIMEOUT_MS: "6500",
      },
      payload: {
        compositionHtml:
          '<div data-composition-id="test" data-width="720" data-height="1280"></div>',
        variables: {
          title: "Custom title",
        },
      },
      commandRunner,
    });

    expect(commandRunner).toHaveBeenCalledTimes(1);
    expect(commandRunner).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        "--variables",
        JSON.stringify({ title: "Custom title" }),
        "--strict-variables",
      ]),
      expect.any(Object)
    );
    expect(result.renderer).toBe("hyperframes_cli");
    expect(result.officialRuntime).toBe(true);
    expect(result.runtimeDiagnostics.packageNames).toEqual([
      "hyperframes",
      "@hyperframes/producer",
    ]);
    expect(result.runtimeDiagnostics.playerReadyTimeoutMs).toBe(6500);
  });
});
