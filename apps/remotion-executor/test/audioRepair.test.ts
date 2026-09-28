import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import {
  VERTICAL_DRAMA_AUDIO_CAPABILITY_FAMILIES,
  VERTICAL_DRAMA_AUDIO_REPAIR_JOB_TYPE,
} from "../src/config.js";

const execFileAsync = promisify(execFile);

describe("audioRepair script & capabilities", () => {
  it("exports vertical drama audio capability families and repair job type", () => {
    assert.deepEqual(VERTICAL_DRAMA_AUDIO_CAPABILITY_FAMILIES, [
      "vertical-drama-audio-dsp",
      "vertical-drama-demucs-gpu",
    ]);
    assert.equal(VERTICAL_DRAMA_AUDIO_REPAIR_JOB_TYPE, "vd_audio_surgical_repair");
  });

  it("runs demucs-repair.py with --check-status-only and outputs valid JSON", async () => {
    const scriptPath = path.join(import.meta.dirname, "..", "scripts", "demucs-repair.py");
    const { stdout } = await execFileAsync("python3", [scriptPath, "--check-status-only"]);
    const parsed = JSON.parse(stdout.trim());
    assert.equal(typeof parsed.demucsInstalled, "boolean");
    assert.equal(typeof parsed.engine, "string");
    assert.equal(typeof parsed.pythonVersion, "string");
  });
});
