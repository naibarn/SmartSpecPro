#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const resultsDir = resolve(here, "../test-results/marketplace-hyperframes");
const reportPath = join(resultsDir, "official-compatibility-report.json");

function readPackageVersion(packageName) {
  try {
    const packageJson = JSON.parse(
      readFileSync(resolve(here, "../node_modules", packageName, "package.json"), "utf8")
    );
    return String(packageJson.version ?? "");
  } catch {
    return null;
  }
}

function npmViewVersion(packageName) {
  try {
    return execFileSync("npm", ["view", packageName, "version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 30000,
    }).trim();
  } catch {
    return null;
  }
}

function parseNodeVersion(version = process.version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
  };
}

function nodeSupportsOfficialRuntime() {
  const parsed = parseNodeVersion();
  return Boolean(parsed && (parsed.major > 22 || (parsed.major === 22 && parsed.minor >= 22)));
}

mkdirSync(resultsDir, { recursive: true });

const pinned = {
  hyperframes: readPackageVersion("hyperframes"),
  producer: readPackageVersion("@hyperframes/producer"),
};
const latest = {
  hyperframes: npmViewVersion("hyperframes"),
  producer: npmViewVersion("@hyperframes/producer"),
};
const fixture = nodeSupportsOfficialRuntime()
  ? spawnSync(process.execPath, [resolve(here, "hyperframes-fixture-render.mjs")], {
      cwd: resolve(here, ".."),
      encoding: "utf8",
      env: {
        ...process.env,
        HYPERFRAMES_TELEMETRY_DISABLED: "1",
        CI: "1",
      },
    })
  : null;
const fixtureManifestPath = join(resultsDir, "fixture-render-manifest.json");
const fixtureManifest = existsSync(fixtureManifestPath)
  ? JSON.parse(readFileSync(fixtureManifestPath, "utf8"))
  : null;
const updateAvailable = Boolean(
  (latest.hyperframes && pinned.hyperframes && latest.hyperframes !== pinned.hyperframes) ||
    (latest.producer && pinned.producer && latest.producer !== pinned.producer)
);
const report = {
  gate: "official-compatibility",
  generatedAt: new Date().toISOString(),
  node: {
    version: process.version,
    officialRuntimeReady: nodeSupportsOfficialRuntime(),
    requirement: ">=22.22.0",
  },
  packages: {
    pinned,
    latest,
    updateAvailable,
  },
  fixture: {
    commandRan: Boolean(fixture),
    status: fixture?.status ?? null,
    manifestStatus: fixtureManifest?.status ?? null,
    renderer: fixtureManifest?.renderer ?? null,
    officialRuntime: fixtureManifest?.officialRuntime === true,
  },
  recommendation: updateAvailable
    ? "Open a HyperFrames runtime update PR, render old/new compatibility fixtures, compare golden snapshots, then promote through canary and rollback gates."
    : "Pinned HyperFrames packages match npm latest or latest could not be checked; continue routine fixture and rollout evidence gates.",
};

writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.node.officialRuntimeReady || report.fixture.manifestStatus !== "passed") {
  process.exitCode = 1;
}
