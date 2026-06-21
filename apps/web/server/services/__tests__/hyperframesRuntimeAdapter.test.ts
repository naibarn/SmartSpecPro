import { mkdtempSync } from "node:fs";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
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
  resolveHyperframesCliRenderTimeouts,
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

  it("defaults final renders to the official CLI while keeping explicit rollout gates", () => {
    expect(getHyperframesRuntimeMode({})).toBe("cli");
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
        HYPERFRAMES_ALLOW_NODE20_OFFICIAL_RUNTIME: "1",
      })
    ).toBe(true);
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
    ).toThrow(/blocked by explicit runtime readiness env/);
    expect(
      isHyperframesCliRuntimeAllowed({
        HYPERFRAMES_RUNTIME_MODE: "diagnostic",
        HYPERFRAMES_ALLOW_NODE20_OFFICIAL_RUNTIME: "1",
      })
    ).toBe(false);
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
    const toolsDir = join(dir, "tools");
    await mkdir(toolsDir, { recursive: true });
    const ffmpegPath = join(toolsDir, "ffmpeg");
    const ffprobePath = join(toolsDir, "ffprobe");
    await writeFile(ffmpegPath, "#!/bin/sh\nexit 0\n");
    await writeFile(ffprobePath, "#!/bin/sh\nexit 0\n");
    await chmod(ffmpegPath, 0o755);
    await chmod(ffprobePath, 0o755);
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
        HYPERFRAMES_FFMPEG_BINARY: ffmpegPath,
        HYPERFRAMES_FFPROBE_BINARY: ffprobePath,
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
      expect.objectContaining({
        env: expect.objectContaining({
          FFMPEG_PATH: ffmpegPath,
          FFPROBE_PATH: ffprobePath,
        }),
      })
    );
    const options = commandRunner.mock.calls[0]?.[2];
    expect(options?.env?.PATH?.split(":")[0]).toBe(toolsDir);
    expect(result.renderer).toBe("hyperframes_cli");
    expect(result.officialRuntime).toBe(true);
    expect(result.runtimeDiagnostics.packageNames).toEqual([
      "hyperframes",
      "@hyperframes/producer",
    ]);
    expect(result.runtimeDiagnostics.playerReadyTimeoutMs).toBe(6500);
  });

  it("scales CLI readiness and browser timeouts for long final composite renders", async () => {
    const timeouts = resolveHyperframesCliRenderTimeouts({
      renderIntent: "final",
      compositionMode: "captioned_final_composite",
      finalCompositeConfig: {
        finalVideoLengthSec: 238,
        shots: Array.from({ length: 8 }, (_, index) => ({
          id: `shot_${index + 1}`,
          durationSec: index === 7 ? 28 : 30,
        })),
      },
    });

    expect(timeouts).toEqual({
      playerReadyTimeoutMs: 30_000,
      pageNavigationTimeoutSec: 240,
    });
  });

  it("stages storage media refs into the HyperFrames project before CLI render", async () => {
    const dir = workspace();
    const outputPath = join(dir, "output.mp4");
    const copied: Array<{ key: string; targetPath: string }> = [];
    const commandRunner = vi.fn(async () => {
      await writeFile(outputPath, Buffer.from("mp4"));
      return { ok: true };
    });

    await executeHyperframesCliRender({
      workspace: dir,
      outputPath,
      env: {
        HYPERFRAMES_RUNTIME_MODE: "cli",
        HYPERFRAMES_OFFICIAL_RUNTIME_READY: "1",
        HYPERFRAMES_ALLOW_NODE20_OFFICIAL_RUNTIME: "1",
      },
      payload: {
        compositionHtml:
          '<video src="/api/storage/files/media-jobs/assets/shot-1.mp4"></video><audio src="/uploads/audio/sfx.wav"></audio>',
      },
      storageCopier: async (key, targetPath) => {
        copied.push({ key, targetPath });
        await writeFile(targetPath, Buffer.from("asset"));
        return { key };
      },
      commandRunner,
    });

    const html = readFileSync(join(dir, "index.html"), "utf8");
    expect(copied.map(item => item.key)).toEqual([
      "media-jobs/assets/shot-1.mp4",
      "audio/sfx.wav",
    ]);
    expect(html).not.toContain("/api/storage/files/");
    expect(html).not.toContain("/uploads/audio/sfx.wav");
    expect(html).toMatch(/src="\.\/assets\/media\/[a-f0-9]{24}\.mp4"/);
    expect(html).toMatch(/src="\.\/assets\/media\/[a-f0-9]{24}\.wav"/);
    expect(commandRunner).toHaveBeenCalledTimes(1);
  });

  it("removes legacy missing audio refs before strict CLI lint sees them", async () => {
    const dir = workspace();
    const outputPath = join(dir, "output.mp4");
    const commandRunner = vi.fn(async () => {
      await writeFile(outputPath, Buffer.from("mp4"));
      return { ok: true };
    });

    await executeHyperframesCliRender({
      workspace: dir,
      outputPath,
      env: {
        HYPERFRAMES_RUNTIME_MODE: "cli",
        HYPERFRAMES_OFFICIAL_RUNTIME_READY: "1",
        HYPERFRAMES_ALLOW_NODE20_OFFICIAL_RUNTIME: "1",
      },
      payload: {
        compositionHtml:
          '<audio src="/api/storage/hyperframes/audio-presets/missing.wav"></audio><video src="/api/storage/files/media-jobs/assets/shot-1.mp4"></video>',
        finalCompositeConfig: {
          audioAssetValidation: {
            missingAssetRefs: [
              "/api/storage/hyperframes/audio-presets/missing.wav",
            ],
          },
        },
      },
      storageCopier: async (key, targetPath) => {
        await writeFile(targetPath, Buffer.from(key));
        return { key };
      },
      commandRunner,
    });

    const html = readFileSync(join(dir, "index.html"), "utf8");
    expect(html).not.toContain("<audio");
    expect(html).not.toContain("/api/storage/hyperframes/audio-presets/missing.wav");
    expect(html).toMatch(/<video src="\.\/assets\/media\/[a-f0-9]{24}\.mp4"/);
  });

  it("fails before CLI render when a required staged media asset is missing", async () => {
    const dir = workspace();
    const outputPath = join(dir, "output.mp4");
    const commandRunner = vi.fn();

    await expect(
      executeHyperframesCliRender({
        workspace: dir,
        outputPath,
        env: {
          HYPERFRAMES_RUNTIME_MODE: "cli",
          HYPERFRAMES_OFFICIAL_RUNTIME_READY: "1",
          HYPERFRAMES_ALLOW_NODE20_OFFICIAL_RUNTIME: "1",
        },
        payload: {
          compositionHtml:
            '<video src="/api/storage/files/media-jobs/assets/missing.mp4"></video>',
        },
        storageCopier: async () => {
          throw new Error("NoSuchKey");
        },
        commandRunner,
      })
    ).rejects.toThrow(
      /HyperFrames missing render media asset: media-jobs\/assets\/missing\.mp4/
    );

    expect(commandRunner).not.toHaveBeenCalled();
  });
});
