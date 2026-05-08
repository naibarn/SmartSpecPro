#!/usr/bin/env node
import process from "node:process";
import { loadAmbientEnv, DEFAULT_BASE_URL, DEFAULT_MODEL } from "./shared.js";

await loadAmbientEnv();

const TRUTHY = new Set(["1", "true", "yes", "on", "y"]);

const rawFlag = String(process.env.ENABLE_GARDEN_IMAGEGEN || "").trim().toLowerCase();
const gardenEnabled = TRUTHY.has(rawFlag);

const apiKey = process.env.OPENAI_API_KEY || "";
const baseUrl = process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL;
const model = process.env.OPENAI_IMAGE_MODEL || DEFAULT_MODEL;
const customBaseAllowed = process.env.SKILLPACK_ALLOW_CUSTOM_OPENAI_BASE_URL === "1";

let recommendation;
let mode;
let summary;

if (gardenEnabled && apiKey) {
  if (baseUrl !== DEFAULT_BASE_URL && !customBaseAllowed) {
    mode = "A?";
    recommendation = "confirm-custom-base-url";
    summary =
      "Local API mode is enabled, but OPENAI_BASE_URL is custom. Confirm the destination and set SKILLPACK_ALLOW_CUSTOM_OPENAI_BASE_URL=1 before sending prompts or images.";
  } else {
    mode = "A";
    recommendation = "local-api";
    summary =
      "MODE A · Local API mode: use scripts/generate.js / scripts/edit.js only after explicit local API confirmation.";
  }
} else if (gardenEnabled && !apiKey) {
  mode = "A?";
  recommendation = "garden-missing-key";
  summary =
    "ENABLE_GARDEN_IMAGEGEN 已开，但缺 OPENAI_API_KEY。先向用户索要 key，或临时降级到 MODE B / C。";
} else {
  mode = "B-or-C";
  recommendation = "host-or-advisor";
  summary =
    "MODE B / C · 未启用 Garden。若宿主 Agent 自带图像工具（image_generation / dalle / mcp__*image* 等）→ MODE B：把 prompt 交给宿主出图。若宿主无图像工具 → MODE C：仅产出高质量 prompt 给用户。";
}

const result = {
  mode,
  recommendation,
  garden_mode_enabled: gardenEnabled,
  has_api_key: Boolean(apiKey),
  base_url: baseUrl,
  custom_base_url_allowed: customBaseAllowed,
  model,
  env_flag_value: rawFlag || "(unset)",
  summary,
};

const wantJson = process.argv.includes("--json");

if (wantJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const pad = (s) => s.padEnd(24, " ");
  console.log("--- gpt-image-2 runtime mode ---");
  console.log(`${pad("mode")}: ${result.mode}`);
  console.log(`${pad("recommendation")}: ${result.recommendation}`);
  console.log(`${pad("garden_mode_enabled")}: ${result.garden_mode_enabled}`);
  console.log(`${pad("has_api_key")}: ${result.has_api_key}`);
  console.log(`${pad("base_url")}: ${result.base_url}`);
  console.log(`${pad("custom_base_url_allowed")}: ${result.custom_base_url_allowed}`);
  console.log(`${pad("model")}: ${result.model}`);
  console.log(`${pad("env_flag_value")}: ${result.env_flag_value}`);
  console.log("");
  console.log(result.summary);
}
