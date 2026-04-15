#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const tauriConfigPath = resolve(root, "apps/tauri-shell/src-tauri/tauri.conf.json");
const cargoTomlPath = resolve(root, "apps/tauri-shell/src-tauri/Cargo.toml");

function fail(message) {
  console.error(`[desktop-version] ERROR: ${message}`);
  process.exit(1);
}

function log(message) {
  console.log(`[desktop-version] ${message}`);
}

function normalizeVersion(value) {
  const normalized = String(value ?? "").trim().replace(/^v/i, "");
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(normalized)) {
    fail(`Invalid desktop version: ${value}`);
  }
  return normalized;
}

function parseArgs(argv) {
  let version = "";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--version") {
      version = argv[index + 1] ?? fail("Missing value for --version");
      index += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      console.log(`Usage: node scripts/set-desktop-version.mjs --version <x.y.z>`);
      process.exit(0);
    }
    fail(`Unknown argument: ${arg}`);
  }

  if (!version) {
    fail("--version is required");
  }

  return {
    version: normalizeVersion(version),
  };
}

function updateTauriConfig(version) {
  const config = JSON.parse(readFileSync(tauriConfigPath, "utf8"));
  config.version = version;
  writeFileSync(tauriConfigPath, `${JSON.stringify(config, null, 2)}\n`);
}

function updateCargoToml(version) {
  const original = readFileSync(cargoTomlPath, "utf8");
  const updated = original.replace(
    /^version = ".*"$/m,
    `version = "${version}"`,
  );

  if (original === updated) {
    fail("Unable to update Cargo.toml version");
  }

  writeFileSync(cargoTomlPath, updated);
}

const { version } = parseArgs(process.argv.slice(2));
updateTauriConfig(version);
updateCargoToml(version);
log(`Desktop bundle version set to ${version}`);
