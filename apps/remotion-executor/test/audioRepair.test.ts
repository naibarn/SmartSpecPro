import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import {
  VERTICAL_DRAMA_AUDIO_CAPABILITY_FAMILIES,
  VERTICAL_DRAMA_AUDIO_REPAIR_JOB_TYPE,
  REMOTION_CAPABILITY_FAMILIES,
} from "../src/config.js";

const execFileAsync = promisify(execFile);

describe("audioRepair script & capabilities", () => {
  it("exports vertical drama audio capability families and repair job type", () => {
    assert.deepEqual(VERTICAL_DRAMA_AUDIO_CAPABILITY_FAMILIES, [
      "vertical-drama-audio-dsp",
      "vertical-drama-demucs-gpu",
    ]);
    assert.equal(VERTICAL_DRAMA_AUDIO_REPAIR_JOB_TYPE, "vd_audio_surgical_repair");
    assert.equal(REMOTION_CAPABILITY_FAMILIES.includes("vertical-drama-audio-dsp" as never), false);
    assert.equal(REMOTION_CAPABILITY_FAMILIES.includes("vertical-drama-demucs-gpu" as never), false);
  });

  it("runs demucs-repair.py with --check-status-only and outputs valid JSON", async () => {
    const scriptPath = path.join(import.meta.dirname, "..", "scripts", "demucs-repair.py");
    const { stdout } = await execFileAsync("python3", [scriptPath, "--check-status-only"]);
    const parsed = JSON.parse(stdout.trim());
    assert.equal(typeof parsed.demucsInstalled, "boolean");
    assert.equal(typeof parsed.engine, "string");
    assert.equal(typeof parsed.pythonVersion, "string");
    assert.equal(parsed.engine, parsed.demucsInstalled ? "demucs_v4_htdemucs" : "unavailable");
  });

  it("never reports a repair without a bound TTS source", () => {
    const scriptPath = path.join(import.meta.dirname, "..", "scripts", "demucs-repair.py");
    const result = spawnSync("python3", [
      scriptPath,
      "--video", path.join(import.meta.dirname, "missing.mp4"),
      "--output-video", path.join(import.meta.dirname, "repaired.mp4"),
      "--workspace", path.join(import.meta.dirname, "workspace"),
    ], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    const output = JSON.parse(result.stdout.trim()) as { success?: unknown; error?: unknown };
    assert.equal(output.success, false);
    assert.equal(typeof output.error, "string");
  });
});
