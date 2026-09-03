import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { workspaceRoot } from "./config.js";

export type AudioRepairJobPayload = {
  seriesId?: string;
  episodeId?: string;
  shotNumber?: number;
  targetIssue?: string;
  videoUrl?: string;
  ttsAudioUrl?: string;
};

export async function executeAudioRepair(job: { id: string; inputJson: Record<string, unknown> }): Promise<string> {
  const root = await fs.mkdtemp(path.join(workspaceRoot(), `audio-repair-${job.id}-`));
  const outputDir = path.join(root, "output");
  await fs.mkdir(outputDir, { recursive: true });

  const payload = job.inputJson as AudioRepairJobPayload;
  const inputVideoPath = path.join(root, "input.mp4");
  const outputVideoPath = path.join(outputDir, "repaired.mp4");

  // Step 1: Materialize or download the video
  if (payload.videoUrl && payload.videoUrl.startsWith("http")) {
    const res = await fetch(payload.videoUrl);
    if (!res.ok) throw new Error(`failed_downloading_shot_video:${res.statusText}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(inputVideoPath, buf);
  } else if (payload.videoUrl && (await fs.stat(payload.videoUrl).catch(() => null))) {
    await fs.copyFile(payload.videoUrl, inputVideoPath);
  } else {
    // Generate an empty audio sync placeholder if no source video supplied yet
    throw new Error("missing_source_video_url_in_audio_repair_job");
  }

  // Step 2: Download or copy TTS audio if available
  let ttsAudioPath: string | undefined;
  if (payload.ttsAudioUrl && payload.ttsAudioUrl.startsWith("http")) {
    const res = await fetch(payload.ttsAudioUrl);
    if (res.ok) {
      ttsAudioPath = path.join(root, "tts.mp3");
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(ttsAudioPath, buf);
    }
  }

  // Step 3: Run demucs-repair.py
  const scriptPath = path.join(import.meta.dirname, "..", "scripts", "demucs-repair.py");
  const args = [
    scriptPath,
    "--video", inputVideoPath,
    "--output-video", outputVideoPath,
    "--workspace", root,
  ];
  if (ttsAudioPath) {
    args.push("--tts-audio", ttsAudioPath);
  }

  const child = spawn("python3", args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });

  const exitCode = await new Promise<number>(resolve => child.on("close", val => resolve(val ?? 1)));
  if (exitCode !== 0) {
    throw new Error(`demucs_repair_failed:${stderr.slice(-400) || stdout.slice(-400)}`);
  }

  await fs.access(outputVideoPath);
  return outputVideoPath;
}
