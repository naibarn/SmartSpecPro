/**
 * Portable ffmpeg/ffprobe process helpers shared by the `remotion_render_video`
 * job orchestrator (`renderVideoJob.ts`) on BOTH lanes:
 *   - `apps/web`'s in-process Lane A worker (`hyperframesRenderWorker.ts`)
 *     historically imported an equivalent set of helpers from
 *     `apps/web/server/services/verticalDramaEpisodeVideoAssembly.ts`
 *     (`defaultFfmpegRunner`, `probeDurationSeconds`, `resolveFfBinary`) — that
 *     file also imports the Drizzle `db` client at module scope (unrelated VD
 *     assembly-queue exports live in the same file), so it cannot be imported
 *     from this package (would drag a Postgres client into the Tauri sidecar
 *     bundle). This module is a fresh, standalone, drop-in-equivalent
 *     implementation of JUST the process-spawning subset, so `apps/web` can
 *     switch its `remotion_render_video` dispatch onto this single shared
 *     copy instead of maintaining a second one.
 *   - the `apps/worker-app` Remotion sidecar (`render-video` mode), which has
 *     no other source for these helpers at all.
 *
 * `apps/web/server/services/verticalDramaEpisodeVideoAssembly.ts`'s own
 * copies are UNCHANGED and continue to power the (unrelated) VD ffmpeg
 * assembly-queue pipeline — this is not a rename/removal of that file.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type FfmpegRunner = (
  args: string[],
) => Promise<{ code: number; stderr: string }>;

/**
 * Resolve the ffmpeg/ffprobe binary to an absolute path. A bare
 * `spawn("ffmpeg")` can fail with ENOENT in restricted PATH environments
 * (systemd services, sandboxed worker processes) — same candidate order as
 * `apps/web`'s `resolveHyperframesFfmpegBinary`/`resolveFfBinary`.
 */
export function resolveFfBinary(binaryName: "ffmpeg" | "ffprobe"): string {
  const candidates = [
    binaryName === "ffmpeg" ? process.env.FFMPEG_PATH : process.env.FFPROBE_PATH,
    `/usr/bin/${binaryName}`,
    `/usr/local/bin/${binaryName}`,
    join(homedir(), ".local/bin", binaryName),
  ].filter((value): value is string => Boolean(value && value.trim()));
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return binaryName;
}

/** Default runner: spawns the real `ffmpeg` binary. Overridable in tests. */
export const defaultFfmpegRunner: FfmpegRunner = args =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(resolveFfBinary("ffmpeg"), args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", chunk => {
      stderr += chunk.toString();
      if (stderr.length > 64_000) stderr = stderr.slice(-64_000); // cap memory
    });
    child.on("error", reject);
    child.on("close", code => resolvePromise({ code: code ?? -1, stderr }));
  });

/** Probe duration (seconds) of a media file via ffprobe. Best-effort — returns undefined on failure. */
export async function probeDurationSeconds(
  filePath: string,
): Promise<number | undefined> {
  return new Promise(resolvePromise => {
    const child = spawn(
      resolveFfBinary("ffprobe"),
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    let out = "";
    child.stdout?.on("data", c => (out += c.toString()));
    child.on("error", () => resolvePromise(undefined));
    child.on("close", () => {
      const n = Number(out.trim());
      resolvePromise(Number.isFinite(n) && n > 0 ? n : undefined);
    });
  });
}
