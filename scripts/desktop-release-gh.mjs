#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const validPlatforms = new Set(["windows", "macos", "linux", "all"]);
const validBundleModes = new Set(["on-demand", "e2b", "e4b", "all"]);

function fail(message) {
  console.error(`[desktop-release] ERROR: ${message}`);
  process.exit(1);
}

function log(message) {
  console.log(`[desktop-release] ${message}`);
}

function parseArgs(argv) {
  const options = {
    tag: "",
    version: "",
    platform: "windows",
    bundleMode: "on-demand",
    ref: "",
    watch: false,
    webUrl: "",
    releaseNotes: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--tag") {
      options.tag = argv[i + 1] ?? fail("Missing value for --tag");
      i += 1;
    } else if (arg === "--platform") {
      options.platform = argv[i + 1] ?? fail("Missing value for --platform");
      i += 1;
    } else if (arg === "--bundle-mode") {
      options.bundleMode = argv[i + 1] ?? fail("Missing value for --bundle-mode");
      i += 1;
    } else if (arg === "--version") {
      options.version = argv[i + 1] ?? fail("Missing value for --version");
      i += 1;
    } else if (arg === "--ref") {
      options.ref = argv[i + 1] ?? fail("Missing value for --ref");
      i += 1;
    } else if (arg === "--web-url") {
      options.webUrl = argv[i + 1] ?? fail("Missing value for --web-url");
      i += 1;
    } else if (arg === "--release-notes") {
      options.releaseNotes = argv[i + 1] ?? fail("Missing value for --release-notes");
      i += 1;
    } else if (arg === "--watch") {
      options.watch = true;
    } else if (arg === "-h" || arg === "--help") {
      console.log(`Usage: node scripts/desktop-release-gh.mjs --tag <tag> [options]

Options:
  --tag <tag>              Release tag to pass to workflow_dispatch. Required.
  --version <version>      Version without the v prefix. Defaults to tag without leading v.
  --platform <name>        One of: windows, macos, linux, all. Default: windows.
  --bundle-mode <mode>     One of: on-demand, e2b, e4b, all. Default: on-demand.
  --ref <git-ref>          Branch or ref to run the workflow from. Default: current HEAD branch.
  --web-url <url>          Public SmartAIHub web URL embedded into the desktop app.
  --release-notes <text>   Release notes to publish with the desktop build.
  --watch                  Wait for the newly created workflow run.
  -h, --help               Show this help.
`);
      process.exit(0);
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }

  if (!options.tag) {
    fail("--tag is required.");
  }
  if (!validPlatforms.has(options.platform)) {
    fail(`Unsupported --platform value: ${options.platform}`);
  }
  if (!validBundleModes.has(options.bundleMode)) {
    fail(`Unsupported --bundle-mode value: ${options.bundleMode}`);
  }

  return options;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.error) {
    fail(`${command} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`${command} exited with code ${result.status}`);
  }
  return result.stdout?.trim() ?? "";
}

function commandExists(command, args = ["--version"]) {
  const result = spawnSync(command, args, {
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripLeadingV(value) {
  return `${value ?? ""}`.trim().replace(/^v/i, "");
}

async function waitForRunId({ ref, startedAt }) {
  const normalizedRef = ref.replace(/^refs\/heads\//, "");
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const output = run("gh", [
      "run",
      "list",
      "--workflow",
      "desktop-release.yml",
      "--limit",
      "15",
      "--json",
      "databaseId,createdAt,headBranch,event",
    ], { capture: true });

    const runs = JSON.parse(output || "[]");
    const matchedRun = runs.find((currentRun) => {
      const runCreatedAt = Date.parse(currentRun.createdAt || "");
      if (!Number.isFinite(runCreatedAt) || runCreatedAt < startedAt) {
        return false;
      }

      if (currentRun.event !== "workflow_dispatch") {
        return false;
      }

      return !normalizedRef || currentRun.headBranch === normalizedRef;
    });

    if (matchedRun?.databaseId) {
      return String(matchedRun.databaseId);
    }

    const fallbackRun = runs.find((currentRun) => {
      const runCreatedAt = Date.parse(currentRun.createdAt || "");
      return Number.isFinite(runCreatedAt)
        && runCreatedAt >= startedAt
        && currentRun.event === "workflow_dispatch";
    });
    if (fallbackRun?.databaseId) {
      return String(fallbackRun.databaseId);
    }
    await sleep(3000);
  }

  return "";
}

const options = parseArgs(process.argv.slice(2));

if (!commandExists("gh")) {
  fail("GitHub CLI (`gh`) is required.");
}

run("gh", ["auth", "status"]);

let ref = options.ref;
if (!ref) {
  ref = run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { capture: true });
}

const desktopVersion = options.version || stripLeadingV(options.tag);
const desktopTag = options.tag || `v${desktopVersion}`;
log(`Triggering desktop release workflow for platform=${options.platform}, bundle_mode=${options.bundleMode}, version=${desktopVersion}, tag=${desktopTag}, ref=${ref}`);
const dispatchStartedAt = Date.now() - 1000;
run("gh", [
  "workflow",
  "run",
  "desktop-release.yml",
  "--ref",
  ref,
  "-f",
  `tag=${desktopTag}`,
  "-f",
  `platform=${options.platform}`,
  "-f",
  `bundle_mode=${options.bundleMode}`,
  "-f",
  `web_url=${options.webUrl || "https://smartaihub.app"}`,
  "-f",
  `release_notes=${options.releaseNotes}`,
]);

if (!options.watch) {
  log("Workflow dispatched.");
  log("Tip: run `gh run list --workflow desktop-release.yml --limit 5` to inspect the latest runs.");
  process.exit(0);
}

log("Waiting for the newly created workflow run...");
const runId = await waitForRunId({ ref, startedAt: dispatchStartedAt });
if (!runId) {
  fail("Workflow was dispatched, but the new run ID could not be discovered automatically.");
}

run("gh", ["run", "watch", runId]);
