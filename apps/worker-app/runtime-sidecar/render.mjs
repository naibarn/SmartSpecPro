#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

const blockedMarkers = [
  "mock video content",
  "mock-hyperframes",
  "placeholder sidecar",
  "testsrc2=",
  "testsrc=size=",
  "lavfi",
  "local_smoke_snapshot",
  "diagnostic_ffmpeg_smoke",
];

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function fail(message) {
  throw new Error(message);
}

function emitWorkerEvent(eventType, payload = {}) {
  console.log(`SMARTAIHUB_EVENT ${JSON.stringify({ eventType, ...payload })}`);
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function findFile(root, names) {
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || !existsSync(current)) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolute);
    } else if ((entry.isFile() || entry.isSymbolicLink()) && names.includes(entry.name.toLowerCase())) {
        return absolute;
      }
    }
  }
  return null;
}

function pathInside(root, candidate) {
  const normalizedRoot = resolve(root);
  const normalizedCandidate = resolve(candidate);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${sep}`);
}

function validateManifest(payload, workspace) {
  if (payload?.renderIntent !== "hyperframes_final_composite") {
    fail("sidecar manifest is not a HyperFrames final composite job");
  }
  if (payload?.runtimePolicy?.requireOfficialRuntime !== true) {
    fail("runtimePolicy.requireOfficialRuntime must be true");
  }
  if (payload?.runtimePolicy?.rejectFallbackRender !== true) {
    fail("runtimePolicy.rejectFallbackRender must be true");
  }
  if (payload?.runtimePolicy?.requireCssBrowserRuntime !== true) {
    fail("runtimePolicy.requireCssBrowserRuntime must be true");
  }

  const html = String(payload?.input?.compositionHtml ?? "");
  if (!html.includes("<video") || !html.includes("source-video")) {
    fail("compositionHtml must contain real source-video elements");
  }
  if (blockedMarkers.some((marker) => html.includes(marker))) {
    fail("compositionHtml contains blocked mock or fallback markers");
  }
  if (/<video\b[^>]*\bsrc=["']https?:\/\//i.test(html)) {
    fail("compositionHtml must reference staged local source video assets");
  }

  const sourceVideos = payload?.input?.assetManifest?.sourceVideos;
  if (!Array.isArray(sourceVideos) || sourceVideos.length === 0) {
    fail("assetManifest.sourceVideos must include real source video assets");
  }
  for (const video of sourceVideos) {
    const localPath = String(video?.localPath ?? "");
    if (!localPath || localPath.startsWith("/") || localPath.includes("..")) {
      fail(`source video ${video?.shotId ?? "(unknown)"} is missing a safe localPath`);
    }
    const absolute = resolve(workspace, localPath);
    if (!pathInside(workspace, absolute) || !existsSync(absolute) || statSync(absolute).size < 1024) {
      fail(`source video ${video?.shotId ?? "(unknown)"} was not staged as a real local file`);
    }
  }
}

function readSourceVideos(manifest) {
  const sourceVideos = manifest?.input?.assetManifest?.sourceVideos;
  return Array.isArray(sourceVideos) ? sourceVideos : [];
}

function safeSegmentName(value, fallback) {
  const stem = String(value || fallback)
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return stem || fallback;
}

function readProbeDurationSeconds(probe) {
  const formatDuration = Number(probe?.format?.duration);
  if (Number.isFinite(formatDuration) && formatDuration > 0) {
    return formatDuration;
  }

  for (const stream of Array.isArray(probe?.streams) ? probe.streams : []) {
    const streamDuration = Number(stream?.duration);
    if (Number.isFinite(streamDuration) && streamDuration > 0) {
      return streamDuration;
    }
  }

  return null;
}

function replaceVideoTagAttribute(tag, name, value) {
  const escapedValue = String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const pattern = new RegExp(`\\s${name}=(["']).*?\\1`, "i");
  if (pattern.test(tag)) {
    return tag.replace(pattern, ` ${name}="${escapedValue}"`);
  }
  return tag.replace(/>$/, ` ${name}="${escapedValue}">`);
}

function rewriteShotVideoTag(html, shotId, localPath) {
  const escapedShotId = shotId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tagPattern = new RegExp(`<video\\b(?=[^>]*\\bdata-shot-id=(["'])${escapedShotId}\\1)[^>]*>`, "i");
  if (!tagPattern.test(html)) {
    fail(`compositionHtml is missing source-video tag for shot ${shotId}`);
  }
  return html.replace(tagPattern, (tag) => {
    let updated = replaceVideoTagAttribute(tag, "src", localPath);
    updated = replaceVideoTagAttribute(updated, "data-media-start", "0");
    return updated;
  });
}

function fileHash(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readShotPlan(manifest, shotId) {
  const shots = Array.isArray(manifest?.input?.shots) ? manifest.input.shots : [];
  return shots.find((shot) => String(shot?.id ?? "") === shotId) ?? null;
}

function readCacheManifest(path) {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function prepareSourceVideoSegments(ffmpegPath, ffprobePath, manifest, workspace, env) {
  const durationByPath = new Map();
  const toleranceSec = 0.35;
  const sourceVideos = readSourceVideos(manifest);
  const usageByPath = new Map();
  for (const video of sourceVideos) {
    const absolute = resolve(workspace, String(video?.localPath ?? ""));
    usageByPath.set(absolute, (usageByPath.get(absolute) ?? 0) + 1);
  }

  let compositionHtml = String(manifest?.input?.compositionHtml ?? "");
  const segmentDir = join(workspace, "assets", "__hf_segments");
  const segmentCachePath = join(segmentDir, ".segment-cache.json");
  const segmentCache = readCacheManifest(segmentCachePath);
  let segmentCount = 0;

  sourceVideos.forEach((video, index) => {
    const localPath = String(video?.localPath ?? "");
    const absolute = resolve(workspace, localPath);
    if (!durationByPath.has(absolute)) {
      const probeText = run(ffprobePath, [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        absolute,
      ], { env });
      const durationSec = readProbeDurationSeconds(JSON.parse(probeText));
      if (!durationSec) {
        fail(`source video ${video?.shotId ?? localPath} has no probeable duration`);
      }
      durationByPath.set(absolute, durationSec);
    }

    const durationSec = durationByPath.get(absolute);
    const mediaStartSec = Number(video?.mediaStartSec ?? 0);
    const shotDurationSec = Number(video?.durationSec ?? 0);
    const requestedEndSec = mediaStartSec + shotDurationSec;
    const shotId = String(video?.shotId ?? `shot_${index + 1}`);
    if (
      !Number.isFinite(mediaStartSec)
      || !Number.isFinite(shotDurationSec)
      || shotDurationSec <= 0
      || requestedEndSec - durationSec > toleranceSec
    ) {
      fail(
        `source video range exceeds media duration for shot ${shotId}: ` +
        `requested ${mediaStartSec.toFixed(2)}s-${requestedEndSec.toFixed(2)}s, ` +
        `but source duration is ${durationSec.toFixed(2)}s`
      );
    }

    const shouldSegment =
      (usageByPath.get(absolute) ?? 0) > 1
      || mediaStartSec > 0.001
      || Math.abs(shotDurationSec - durationSec) > toleranceSec;
    if (!shouldSegment) {
      return;
    }

    mkdirSync(segmentDir, { recursive: true });
    const segmentName = `${String(index + 1).padStart(2, "0")}-${safeSegmentName(shotId, `shot_${index + 1}`)}.mp4`;
    const segmentPath = join(segmentDir, segmentName);
    const relativeSegmentPath = `assets/__hf_segments/${segmentName}`;
    const sourceSha256 = video?.localSha256 || fileHash(absolute);
    const cacheEntry = segmentCache[segmentName];
    const cacheMatches = cacheEntry
      && cacheEntry.sourceSha256 === sourceSha256
      && Number(cacheEntry.mediaStartSec) === Number(mediaStartSec.toFixed(3))
      && Number(cacheEntry.durationSec) === Number(shotDurationSec.toFixed(3))
      && existsSync(segmentPath)
      && statSync(segmentPath).size >= 1024;
    if (cacheMatches) {
      const segmentSha256 = fileHash(segmentPath);
      video.localPath = relativeSegmentPath;
      video.localSha256 = segmentSha256;
      video.mediaStartSec = 0;
      video.durationSec = shotDurationSec;
      compositionHtml = rewriteShotVideoTag(compositionHtml, shotId, relativeSegmentPath);
      emitWorkerEvent("source.segment.cache_hit", {
        stage: "stage_assets",
        shotId,
        shotIndex: index,
        shotTotal: sourceVideos.length,
        mediaStartSec,
        durationSec: shotDurationSec,
        sourceSha256,
        segmentSha256,
        message: `Reusing exact source segment for shot ${index + 1}/${sourceVideos.length}: ${shotId}`,
      });
      segmentCount += 1;
      return;
    }

    emitWorkerEvent("source.segment.started", {
      stage: "stage_assets",
      shotId,
      shotIndex: index,
      shotTotal: sourceVideos.length,
      mediaStartSec,
      durationSec: shotDurationSec,
      sourceSha256,
      message: `Preparing exact source segment for shot ${index + 1}/${sourceVideos.length}: ${shotId}`,
    });
    console.log(
      `[Smart AI Hub Worker] Preparing exact source segment for ${shotId}: ` +
      `${mediaStartSec.toFixed(3)}s + ${shotDurationSec.toFixed(3)}s -> ${relativeSegmentPath}`
    );
    run(ffmpegPath, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      absolute,
      "-ss",
      mediaStartSec.toFixed(3),
      "-t",
      shotDurationSec.toFixed(3),
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      segmentPath,
    ], { env });

    if (!existsSync(segmentPath) || statSync(segmentPath).size < 1024) {
      fail(`source video segment for shot ${shotId} was not created`);
    }
    const segmentSha256 = fileHash(segmentPath);
    segmentCache[segmentName] = {
      sourceSha256,
      mediaStartSec: Number(mediaStartSec.toFixed(3)),
      durationSec: Number(shotDurationSec.toFixed(3)),
      segmentSha256,
    };
    video.localPath = relativeSegmentPath;
    video.localSha256 = segmentSha256;
    video.mediaStartSec = 0;
    video.durationSec = shotDurationSec;
    compositionHtml = rewriteShotVideoTag(compositionHtml, shotId, relativeSegmentPath);
    emitWorkerEvent("source.segment.succeeded", {
      stage: "stage_assets",
      shotId,
      shotIndex: index,
      shotTotal: sourceVideos.length,
      mediaStartSec,
      durationSec: shotDurationSec,
      sourceSha256,
      segmentSha256,
      message: `Prepared exact source segment for shot ${index + 1}/${sourceVideos.length}: ${shotId}`,
    });
    segmentCount += 1;
  });

  if (segmentCount > 0) {
    writeFileSync(segmentCachePath, `${JSON.stringify(segmentCache, null, 2)}\n`);
    manifest.input.compositionHtml = compositionHtml;
    writeFileSync(join(workspace, "index.html"), compositionHtml);
    console.log(`[Smart AI Hub Worker] Prepared ${segmentCount} exact source video segment(s) before HyperFrames render.`);
  }
}

function rewriteTimedAttribute(tag, name, value) {
  return replaceVideoTagAttribute(tag, name, String(value));
}

function transformShotSection(sectionHtml, shotId, shotStartSec, shotDurationSec, shotPlan) {
  let output = sectionHtml.replace(/<section\b[^>]*>/i, (tag) => {
    let updated = rewriteTimedAttribute(tag, "data-start", "0");
    updated = rewriteTimedAttribute(updated, "data-duration", shotDurationSec.toFixed(3));
    return updated;
  });

  for (const cue of Array.isArray(shotPlan?.subtitleCues) ? shotPlan.subtitleCues : []) {
    const cueStart = Number(cue?.startSec);
    const cueEnd = Number(cue?.endSec);
    if (!Number.isFinite(cueStart) || !Number.isFinite(cueEnd)) continue;
    const shiftedStart = Math.max(0, cueStart - shotStartSec);
    const shiftedEnd = Math.max(shiftedStart, Math.min(shotDurationSec, cueEnd - shotStartSec));
    output = output
      .replace(
        new RegExp(`data-cue-start=(["'])${String(cueStart).replace(".", "\\.")}\\1`, "g"),
        `data-cue-start="${shiftedStart.toFixed(3)}"`
      )
      .replace(
        new RegExp(`data-cue-end=(["'])${String(cueEnd).replace(".", "\\.")}\\1`, "g"),
        `data-cue-end="${shiftedEnd.toFixed(3)}"`
      );
  }

  return output;
}

function transformAudioTagForShot(tag, shotStartSec, shotEndSec, shotDurationSec) {
  const startMatch = tag.match(/\sdata-start=(["'])(.*?)\1/i);
  const durationMatch = tag.match(/\sdata-duration=(["'])(.*?)\1/i);
  const roleMatch = tag.match(/\sdata-audio-role=(["'])(.*?)\1/i);
  const role = String(roleMatch?.[2] ?? "").toLowerCase();
  const start = Number(startMatch?.[2] ?? 0);
  const duration = Number(durationMatch?.[2] ?? 0);
  const end = Number.isFinite(duration) && duration > 0 ? start + duration : start;
  const overlapsShot = start < shotEndSec && end > shotStartSec;
  const isMusicBed = role.includes("music");
  if (!overlapsShot && !isMusicBed) {
    return "";
  }

  const shiftedStart = isMusicBed ? 0 : Math.max(0, start - shotStartSec);
  const shiftedEnd = isMusicBed
    ? shotDurationSec
    : Math.min(shotDurationSec, Math.max(shiftedStart, end - shotStartSec));
  let updated = rewriteTimedAttribute(tag, "data-start", shiftedStart.toFixed(3));
  if (durationMatch || isMusicBed) {
    updated = rewriteTimedAttribute(updated, "data-duration", Math.max(0.001, shiftedEnd - shiftedStart).toFixed(3));
  }
  return updated;
}

function buildShotCompositionHtml(manifest, sourceVideo, shotIndex) {
  const shotId = String(sourceVideo?.shotId ?? `shot_${shotIndex + 1}`);
  const shotPlan = readShotPlan(manifest, shotId);
  const shotStartSec = Number(shotPlan?.startSec ?? 0);
  const shotDurationSec = Number(sourceVideo?.durationSec ?? shotPlan?.durationSec ?? 0);
  if (!Number.isFinite(shotDurationSec) || shotDurationSec <= 0) {
    fail(`shot ${shotId} has invalid duration for per-shot render`);
  }
  const shotEndSec = shotStartSec + shotDurationSec;
  let html = String(manifest?.input?.compositionHtml ?? "");

  html = html.replace(/<video\b[^>]*\bclass=(["'])[^"']*\bsource-video\b[^"']*\1[^>]*>/gi, (tag) => {
    const tagShotId = tag.match(/\sdata-shot-id=(["'])(.*?)\1/i)?.[2];
    if (tagShotId !== shotId) return "";
    let updated = rewriteTimedAttribute(tag, "src", sourceVideo.localPath);
    updated = rewriteTimedAttribute(updated, "data-start", "0");
    updated = rewriteTimedAttribute(updated, "data-duration", shotDurationSec.toFixed(3));
    updated = rewriteTimedAttribute(updated, "data-media-start", "0");
    return updated;
  });

  html = html.replace(/<section\b(?=[^>]*\bclass=(["'])[^"']*\bshot\b[^"']*\1)(?=[^>]*\bdata-shot-id=(["'])(.*?)\2)[\s\S]*?<\/section>/gi, (section, _classQuote, _shotQuote, tagShotId) => {
    if (tagShotId !== shotId) return "";
    return transformShotSection(section, shotId, shotStartSec, shotDurationSec, shotPlan);
  });

  html = html.replace(/<div\b(?=[^>]*\bid=(["'])hook-layer\1)[\s\S]*?<\/div>\s*<\/div>/i, (hook) => {
    if (shotStartSec > 0.001) return "";
    return hook.replace(/<div\b[^>]*\bid=(["'])hook-layer\1[^>]*>/i, (tag) => {
      let updated = rewriteTimedAttribute(tag, "data-start", "0");
      updated = rewriteTimedAttribute(updated, "data-duration", Math.min(3, shotDurationSec).toFixed(3));
      return updated;
    });
  });

  html = html.replace(/<audio\b[^>]*><\/audio>|<audio\b[^>]*>/gi, (tag) =>
    transformAudioTagForShot(tag, shotStartSec, shotEndSec, shotDurationSec)
  );

  html = html.replace(/data-duration=(["'])\d+(?:\.\d+)?\1(?=[^>]*\bdata-timeline-hash=)/i, `data-duration="${shotDurationSec.toFixed(3)}"`);
  html = html.replace(
    /var shotWindowById = [\s\S]*?;\n\s*function setTime/,
    `var shotWindowById = ${JSON.stringify({ [shotId]: { start: 0, duration: shotDurationSec } })};\n          function setTime`
  );
  html = html.replace(
    /entries:\s*\[[\s\S]*?\],\s*duration:\s*function\s*\(\)\s*\{\s*return\s+Number\([^)]*\)|entries:\s*\[[\s\S]*?\],\s*duration:\s*function\s*\(\)\s*\{\s*return\s+[\d.]+/,
    `entries: ${JSON.stringify([{
      shotId,
      shotIndex,
      absoluteStartSec: 0,
      absoluteEndSec: shotDurationSec,
      durationSec: shotDurationSec,
      mediaStartSec: 0,
      sourceMediaRef: sourceVideo.localPath,
      sourceMediaHash: sourceVideo.localSha256 ?? "",
    }])},\n            duration: function () { return ${shotDurationSec}`
  );

  if (!html.includes(sourceVideo.localPath) || html.includes(`data-media-start="${sourceVideo.mediaStartSec ?? ""}`)) {
    // This guard catches failed rewrites before the official renderer starts.
    if (!html.includes('data-media-start="0"')) {
      fail(`shot ${shotId} composition rewrite did not reset media start`);
    }
  }

  return html;
}

function probeVideo(ffprobePath, path, env) {
  const probeText = run(ffprobePath, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    path,
  ], { env });
  return JSON.parse(probeText);
}

function concatShotVideos(ffmpegPath, shotOutputs, outputPath, env) {
  const listPath = join(dirname(outputPath), "shot-concat.txt");
  const lines = shotOutputs.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join("\n");
  writeFileSync(listPath, `${lines}\n`);
  const copyResult = optionalRun(ffmpegPath, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    outputPath,
  ], { env });
  if (copyResult.ok && existsSync(outputPath) && statSync(outputPath).size >= 1024) {
    return { mode: "copy" };
  }

  run(ffmpegPath, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    outputPath,
  ], { env });
  return { mode: "reencode", copyError: copyResult.stderr || copyResult.stdout || copyResult.error };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    ...options,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error([
      `${command} exited with ${result.status}`,
      result.stdout?.trim(),
      result.stderr?.trim(),
    ].filter(Boolean).join("\n"));
  }
  return result.stdout ?? "";
}

function optionalRun(command, args, options = {}) {
  const result = spawnSync(command, args, {
    ...options,
    encoding: "utf8",
  });
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ? String(result.error.message ?? result.error) : "",
  };
}

function summarizeCommandOutput(text, maxChars = 2400) {
  const trimmed = String(text ?? "").trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}\n...[truncated]`;
}

function collectPerformanceDiagnostics(ffmpegPath, chromePath, renderArgs, env) {
  const ffmpegEncoders = optionalRun(ffmpegPath, ["-hide_banner", "-encoders"], { env });
  const nvencAvailable = /\b(h264|hevc|av1)_nvenc\b/.test(ffmpegEncoders.stdout);
  const qsvAvailable = /\b(h264|hevc|av1)_qsv\b/.test(ffmpegEncoders.stdout);
  const vaapiAvailable = /\b(h264|hevc|av1)_vaapi\b/.test(ffmpegEncoders.stdout);
  const nvidiaSmi = optionalRun("nvidia-smi", [
    "--query-gpu=name,driver_version,utilization.gpu,utilization.encoder,memory.used,memory.total",
    "--format=csv,noheader",
  ], { env });
  const chromeVersion = optionalRun(chromePath, ["--version"], { env });
  const diagnostics = {
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    renderArgs,
    env: {
      SMARTAIHUB_ENABLE_GPU_ENCODING: env.SMARTAIHUB_ENABLE_GPU_ENCODING,
      SMARTAIHUB_DISABLE_BROWSER_GPU: env.SMARTAIHUB_DISABLE_BROWSER_GPU,
      SMARTAIHUB_RENDER_WORKERS: env.SMARTAIHUB_RENDER_WORKERS ?? "",
      PRODUCER_LOW_MEMORY_MODE: env.PRODUCER_LOW_MEMORY_MODE,
      FFMPEG_PATH: env.FFMPEG_PATH,
      HYPERFRAMES_FFMPEG_PATH: env.HYPERFRAMES_FFMPEG_PATH,
      HYPERFRAMES_BROWSER_PATH: env.HYPERFRAMES_BROWSER_PATH,
    },
    linuxGpu: {
      devDxg: existsSync("/dev/dxg"),
      devDri: existsSync("/dev/dri"),
      nvidiaSmiOk: nvidiaSmi.ok,
      nvidiaSmi: summarizeCommandOutput(nvidiaSmi.stdout || nvidiaSmi.stderr || nvidiaSmi.error),
    },
    ffmpeg: {
      encoderGpuRequested: env.SMARTAIHUB_ENABLE_GPU_ENCODING === "1",
      nvencAvailable,
      qsvAvailable,
      vaapiAvailable,
      encodersCommandOk: ffmpegEncoders.ok,
      encoderSummary: summarizeCommandOutput(
        ffmpegEncoders.stdout
          .split("\n")
          .filter((line) => /nvenc|qsv|vaapi|cuda|videotoolbox|amf/i.test(line))
          .join("\n"),
      ),
    },
    browser: {
      browserGpuRequested: env.SMARTAIHUB_DISABLE_BROWSER_GPU !== "1",
      chromeVersion: summarizeCommandOutput(chromeVersion.stdout || chromeVersion.stderr || chromeVersion.error),
    },
  };

  console.log(`[INFO] [Perf] ${JSON.stringify(diagnostics)}`);
  if (env.SMARTAIHUB_ENABLE_GPU_ENCODING === "1" && !nvencAvailable && process.platform === "linux") {
    console.warn("[WARN] [Perf] GPU encoding was requested, but this FFmpeg build did not report NVENC encoders. Final encoding may fall back to CPU.");
  }
  if (process.platform === "linux" && !existsSync("/dev/dxg") && !existsSync("/dev/dri")) {
    console.warn("[WARN] [Perf] No Linux GPU device was visible inside WSL/container. Browser rendering may be CPU-bound.");
  }
  return diagnostics;
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isRetryableBrowserStartupError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return [
    "Requesting main frame too early",
    "Navigating frame was detached",
    "Execution context was destroyed",
    "Target closed",
  ].some((marker) => message.includes(marker));
}

function runHyperframesRender(command, args, options = {}) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = spawnSync(command, args, {
      ...options,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) throw result.error;
    if (result.status === 0) {
      return result.stdout ?? "";
    }
    const error = new Error([
      `${command} exited with ${result.status}`,
      result.stdout?.trim(),
      result.stderr?.trim(),
    ].filter(Boolean).join("\n"));
    try {
      if (attempt >= maxAttempts || !isRetryableBrowserStartupError(error)) {
        throw error;
      }
      console.warn(`[Smart AI Hub Worker] HyperFrames browser startup race detected; retrying render (${attempt + 1}/${maxAttempts}).`);
      sleepSync(1500 * attempt);
    } catch (retryError) {
      throw retryError;
    }
  }
  return "";
}

if (process.argv[2] !== "render") {
  fail("expected command: render");
}

const manifestPath = argValue("--manifest");
const workspace = resolve(argValue("--workspace"));
const outputDir = resolve(argValue("--output-dir"));
if (!manifestPath || !workspace || !outputDir) {
  fail("render requires --manifest, --workspace, and --output-dir");
}

const runtimeRoot = resolve(process.env.SMARTAIHUB_RUNTIME_ROOT || join(dirname(new URL(import.meta.url).pathname), "..", ".."));
const runtimePack = join(runtimeRoot, "runtime-pack");
const manifest = readJson(manifestPath);
validateManifest(manifest, workspace);
mkdirSync(outputDir, { recursive: true });

const hyperframesCli = join(runtimePack, "hyperframes", "node_modules", "hyperframes", "dist", "cli.js");
const hyperframesPackage = join(runtimePack, "hyperframes", "node_modules", "hyperframes", "package.json");
let ffmpegPath = join(runtimePack, "bin", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
let ffprobePath = join(runtimePack, "bin", process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
let chromePath = findFile(join(runtimePack, "browser"), ["chrome.exe", "headless_shell.exe", "chrome", "headless_shell"]);
const browserLibsPath = join(runtimePack, "browser-libs");
if (!existsSync(hyperframesCli)) fail(`official HyperFrames CLI is missing: ${hyperframesCli}`);

if (process.platform === "linux") {
  if (!existsSync(ffmpegPath)) ffmpegPath = "ffmpeg";
  if (!existsSync(ffprobePath)) ffprobePath = "ffprobe";
  if (!chromePath) chromePath = "google-chrome-stable";
} else {
  if (!existsSync(ffmpegPath)) fail(`FFmpeg is missing: ${ffmpegPath}`);
  if (!existsSync(ffprobePath)) fail(`ffprobe is missing: ${ffprobePath}`);
  if (!chromePath) fail("Chrome for Testing is missing from runtime-pack/browser");
}

const outputPath = resolve(String(manifest?.output?.finalVideoPath ?? join(outputDir, "final.mp4")));
if (!pathInside(outputDir, outputPath)) fail("final video output path escapes outputDir");
const requirements = manifest.input?.outputRequirements ?? {};
const fps = String(requirements.fps ?? 30);
const forceLowMemoryMode = process.env.SMARTAIHUB_LOW_MEMORY_MODE === "1"
  || process.env.PRODUCER_LOW_MEMORY_MODE === "true";
const renderWorkers = forceLowMemoryMode ? "1" : (process.env.SMARTAIHUB_RENDER_WORKERS || "auto");
const browserGpuFlag = process.env.SMARTAIHUB_DISABLE_BROWSER_GPU === "1"
  ? "--no-browser-gpu"
  : "--browser-gpu";
const enableEncoderGpu = process.env.SMARTAIHUB_ENABLE_GPU_ENCODING === "1";
const enableHyperframesDebug = process.env.SMARTAIHUB_HYPERFRAMES_DEBUG === "1";
const env = {
  ...process.env,
  SMARTAIHUB_RUNTIME_ROOT: runtimeRoot,
  FFMPEG_PATH: ffmpegPath,
  FFPROBE_PATH: ffprobePath,
  HYPERFRAMES_FFMPEG_PATH: ffmpegPath,
  HYPERFRAMES_FFPROBE_PATH: ffprobePath,
  CHROME_PATH: chromePath,
  PUPPETEER_EXECUTABLE_PATH: chromePath,
  HYPERFRAMES_BROWSER_PATH: chromePath,
  PRODUCER_HEADLESS_SHELL_PATH: chromePath,
  HYPERFRAMES_NO_AUTO_INSTALL: "1",
  PRODUCER_LOW_MEMORY_MODE: forceLowMemoryMode ? "true" : "false",
  LD_LIBRARY_PATH: existsSync(browserLibsPath)
    ? `${browserLibsPath}${process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ""}`
    : process.env.LD_LIBRARY_PATH,
  PATH: `${dirname(ffmpegPath)}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`,
};

prepareSourceVideoSegments(ffmpegPath, ffprobePath, manifest, workspace, env);
const sourceVideos = readSourceVideos(manifest);
const usePerShotRender = sourceVideos.length > 1;
const renderArgsFor = (compositionFile, targetOutputPath) => {
  const renderArgs = [
    hyperframesCli,
    "render",
    workspace,
    "--composition",
    compositionFile,
    "--output",
    targetOutputPath,
    "--format",
    "mp4",
    "--fps",
    fps,
    "--quality",
    "standard",
    "--workers",
    renderWorkers,
    forceLowMemoryMode ? "--low-memory-mode" : "--no-low-memory-mode",
    browserGpuFlag,
    "--player-ready-timeout",
    "60000",
    "--browser-timeout",
    "180",
  ];
  if (enableHyperframesDebug) {
    renderArgs.push("--debug");
  }
  if (enableEncoderGpu) {
    renderArgs.push("--gpu");
  }
  return renderArgs;
};

const performanceDiagnostics = collectPerformanceDiagnostics(
  ffmpegPath,
  chromePath,
  renderArgsFor("index.html", outputPath),
  env,
);
let concatResult = null;
const perShotRenders = [];

if (usePerShotRender) {
  const shotsDir = join(outputDir, "shots");
  mkdirSync(shotsDir, { recursive: true });
  const shotCachePath = join(shotsDir, ".shot-cache.json");
  const shotCache = readCacheManifest(shotCachePath);

  sourceVideos.forEach((sourceVideo, shotIndex) => {
    const shotId = String(sourceVideo.shotId ?? `shot-${shotIndex + 1}`);
    const shotPlan = readShotPlan(manifest, shotId);
    const shotDurationSec = Number(sourceVideo.durationSec ?? shotPlan?.durationSec ?? 0);
    if (!Number.isFinite(shotDurationSec) || shotDurationSec <= 0) {
      fail(`HyperFrames shot ${shotId} has invalid duration`);
    }

    const shotSlug = safeSegmentName(shotId, `shot-${shotIndex + 1}`);
    const shotPrefix = `${String(shotIndex + 1).padStart(2, "0")}-${shotSlug}`;
    const compositionFile = `${shotPrefix}.html`;
    const shotCompositionPath = join(workspace, compositionFile);
    const shotOutputPath = join(shotsDir, `${shotPrefix}.mp4`);
    const shotProbePath = join(shotsDir, `${shotPrefix}.probe.json`);
    const shotCompositionHtml = buildShotCompositionHtml(manifest, sourceVideo, shotIndex);
    const shotInputHash = hashJson({
      shotId,
      shotIndex,
      shotPlan,
      sourceVideo,
      shotCompositionHtmlSha256: createHash("sha256").update(shotCompositionHtml).digest("hex"),
      fps,
      forceLowMemoryMode,
      browserGpuFlag,
      enableEncoderGpu,
      hyperframesVersion: existsSync(hyperframesPackage)
        ? JSON.parse(readFileSync(hyperframesPackage, "utf8")).version
        : "unknown",
    });
    const cachedShot = shotCache[shotPrefix];
    const cachedShotMatches = cachedShot
      && cachedShot.shotInputHash === shotInputHash
      && existsSync(shotOutputPath)
      && statSync(shotOutputPath).size >= 1024;
    if (cachedShotMatches) {
      const shotProbe = probeVideo(ffprobePath, shotOutputPath, env);
      writeFileSync(shotProbePath, `${JSON.stringify(shotProbe, null, 2)}\n`);
      const outputSha256 = sha256File(shotOutputPath);
      emitWorkerEvent("shot.render.cache_hit", {
        stage: "render_browser_css",
        shotId,
        shotIndex,
        shotTotal: sourceVideos.length,
        percent: Math.round(((shotIndex + 1) / sourceVideos.length) * 74),
        shotInputHash,
        outputSha256,
        message: `Reusing rendered shot ${shotIndex + 1}/${sourceVideos.length}: ${shotId}`,
      });
      perShotRenders.push({
        shotId,
        shotIndex,
        durationSec: shotDurationSec,
        compositionPath: shotCompositionPath,
        outputPath: shotOutputPath,
        outputSha256,
        probePath: shotProbePath,
        sourceVideoPath: sourceVideo.localPath,
        sourceVideoSha256: sourceVideo.localSha256,
        cacheHit: true,
        shotInputHash,
      });
      return;
    }

    writeFileSync(shotCompositionPath, shotCompositionHtml);

    console.log(`[Smart AI Hub Worker] Rendering HyperFrames shot ${shotIndex + 1}/${sourceVideos.length}: ${shotId}`);
    emitWorkerEvent("shot.render.started", {
      stage: "render_browser_css",
      shotId,
      shotIndex,
      shotTotal: sourceVideos.length,
      durationSec: shotDurationSec,
      percent: Math.round((shotIndex / sourceVideos.length) * 74),
      shotInputHash,
      message: `Rendering shot ${shotIndex + 1}/${sourceVideos.length}: ${shotId}`,
    });
    try {
      runHyperframesRender(process.execPath, renderArgsFor(compositionFile, shotOutputPath), {
        cwd: workspace,
        env,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emitWorkerEvent("shot.render.failed", {
        stage: "render_browser_css",
        shotId,
        shotIndex,
        shotTotal: sourceVideos.length,
        durationSec: shotDurationSec,
        percent: Math.round((shotIndex / sourceVideos.length) * 74),
        shotInputHash,
        errorCode: "hyperframes_shot_render_failed",
        rootCause: message.split("\n").find((line) => /error|failed|fatal|exception/i.test(line)) ?? message.split("\n")[0] ?? message,
        message: `Shot ${shotIndex + 1}/${sourceVideos.length} failed: ${shotId}`,
      });
      throw error;
    }
    if (!existsSync(shotOutputPath) || statSync(shotOutputPath).size < 1024) {
      emitWorkerEvent("shot.render.failed", {
        stage: "render_browser_css",
        shotId,
        shotIndex,
        shotTotal: sourceVideos.length,
        durationSec: shotDurationSec,
        percent: Math.round((shotIndex / sourceVideos.length) * 74),
        shotInputHash,
        errorCode: "hyperframes_shot_output_missing",
        rootCause: "HyperFrames did not produce a real MP4 output for this shot.",
        message: `Shot ${shotIndex + 1}/${sourceVideos.length} produced no valid video: ${shotId}`,
      });
      fail(`HyperFrames shot ${shotId} did not produce a real video`);
    }

    const shotProbe = probeVideo(ffprobePath, shotOutputPath, env);
    writeFileSync(shotProbePath, `${JSON.stringify(shotProbe, null, 2)}\n`);
    const outputSha256 = sha256File(shotOutputPath);
    shotCache[shotPrefix] = {
      shotId,
      shotInputHash,
      outputSha256,
      durationSec: shotDurationSec,
      sourceVideoSha256: sourceVideo.localSha256,
    };
    writeFileSync(shotCachePath, `${JSON.stringify(shotCache, null, 2)}\n`);
    emitWorkerEvent("shot.render.succeeded", {
      stage: "render_browser_css",
      shotId,
      shotIndex,
      shotTotal: sourceVideos.length,
      durationSec: shotDurationSec,
      percent: Math.round(((shotIndex + 1) / sourceVideos.length) * 74),
      shotInputHash,
      outputSha256,
      message: `Rendered shot ${shotIndex + 1}/${sourceVideos.length}: ${shotId}`,
    });
    perShotRenders.push({
      shotId,
      shotIndex,
      durationSec: shotDurationSec,
      compositionPath: shotCompositionPath,
      outputPath: shotOutputPath,
      outputSha256,
      probePath: shotProbePath,
      sourceVideoPath: sourceVideo.localPath,
      sourceVideoSha256: sourceVideo.localSha256,
      cacheHit: false,
      shotInputHash,
    });
  });

  writeFileSync(shotCachePath, `${JSON.stringify(shotCache, null, 2)}\n`);
  emitWorkerEvent("concat.started", {
    stage: "verify_outputs",
    shotTotal: sourceVideos.length,
    message: `Combining ${sourceVideos.length} rendered shots into the final video.`,
  });
  try {
    concatResult = concatShotVideos(ffmpegPath, perShotRenders.map((shot) => shot.outputPath), outputPath, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitWorkerEvent("concat.failed", {
      stage: "verify_outputs",
      shotTotal: sourceVideos.length,
      errorCode: "hyperframes_concat_failed",
      rootCause: message.split("\n").find((line) => /error|failed|fatal|exception/i.test(line)) ?? message.split("\n")[0] ?? message,
      message: "Failed to combine rendered shots into the final video.",
    });
    throw error;
  }
  emitWorkerEvent("concat.succeeded", {
    stage: "verify_outputs",
    shotTotal: sourceVideos.length,
    concatMode: concatResult.mode,
    message: `Combined ${sourceVideos.length} rendered shots into the final video.`,
  });
} else {
  emitWorkerEvent("render.single.started", {
    stage: "render_browser_css",
    shotTotal: sourceVideos.length,
    message: "Rendering HyperFrames composition.",
  });
  runHyperframesRender(process.execPath, renderArgsFor("index.html", outputPath), { cwd: workspace, env });
  emitWorkerEvent("render.single.succeeded", {
    stage: "render_browser_css",
    shotTotal: sourceVideos.length,
    message: "Rendered HyperFrames composition.",
  });
}

if (!existsSync(outputPath) || statSync(outputPath).size < 1024) {
  fail("HyperFrames render did not produce a real final video");
}

const probe = probeVideo(ffprobePath, outputPath, env);
writeFileSync(join(outputDir, "probe.json"), `${JSON.stringify(probe, null, 2)}\n`);

const hyperframesVersion = JSON.parse(readFileSync(hyperframesPackage, "utf8")).version;
writeFileSync(join(outputDir, "manifest.json"), `${JSON.stringify({
  renderer: usePerShotRender
    ? "hyperframes_cli_official_per_shot_concat"
    : "hyperframes_cli_official",
  renderStrategy: usePerShotRender ? "per_shot_then_concat" : "single_composition",
  officialRuntime: true,
  fallbackRender: false,
  mockRender: false,
  hyperframesVersion,
  jobId: manifest.jobId,
  assignmentAttempt: manifest.assignmentAttempt,
  performanceDiagnostics,
  concatMode: concatResult?.mode ?? null,
  perShotRenders,
  compositionHtmlSha256: createHash("sha256").update(String(manifest.input.compositionHtml)).digest("hex"),
  finalVideoPath: outputPath,
  finalVideoSha256: sha256File(outputPath),
  sourceVideos: readSourceVideos(manifest).map((video) => ({
    shotId: video.shotId,
    localPath: video.localPath,
    localSha256: video.localSha256,
    mediaStartSec: video.mediaStartSec,
    durationSec: video.durationSec,
  })),
}, null, 2)}\n`);
