#!/usr/bin/env node
/**
 * Feature 135 — Hermes Grok media worker: fake `hermes` CLI test fixture.
 *
 * Dependency-free (node builtins only) so it can be spawned directly by
 * path from Vitest (section 04/07 tests) AND from `cargo test` (section 11)
 * without any package installation. Behavior for each subcommand is driven
 * entirely by a scenario JSON file whose path is passed via the
 * `FAKE_HERMES_SCENARIO_FILE` environment variable (see `scenario.ts`'s
 * `buildFakeHermesEnv` helper, which writes one scenario file per test).
 *
 * Dispatches on argv: `-p <profile> auth add xai-oauth --no-browser`,
 * `-p <profile> auth status xai-oauth`, `-p <profile> auth logout
 * xai-oauth`, `-p <profile> tools`, `--version`, and an unrecognized-flag
 * fallback (e.g. `-z`) for defensive-parsing coverage. A `generate` branch
 * is included now (unused by section 04 itself) so the fixture is stable
 * for sections 07/10-smoke, which drive real media-generation invocations
 * against the same fixture.
 */
import fs from "node:fs";

function readScenario() {
  const file = process.env.FAKE_HERMES_SCENARIO_FILE;
  if (!file) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return {};
  }
}

function emitLines(lines) {
  for (const line of lines ?? []) {
    process.stdout.write(`${line}\n`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runAuthAdd(scenario) {
  const s = scenario.authAdd ?? {};
  emitLines(
    s.deviceCodeLines ?? [
      "Visit https://accounts.x.ai/device and enter code ABCD-EFGH",
      "This code expires in 15 minutes.",
    ],
  );

  if (s.neverApprove) {
    // Deliberately never resolves — the caller's own timeout/kill logic
    // (injected `spawnHermes` contract) is responsible for termination.
    await new Promise(() => {});
    return;
  }

  if (s.denyAfterMs !== undefined) {
    await sleep(s.denyAfterMs);
    emitLines(s.stdoutLines ?? ["Authorization denied by user."]);
    if (s.stderr) process.stderr.write(s.stderr);
    process.exitCode = s.exitCode ?? 1;
    return;
  }

  await sleep(s.approveAfterMs ?? 20);
  emitLines(s.stdoutLines ?? ["Authorization approved."]);
  if (s.stderr) process.stderr.write(s.stderr);
  process.exitCode = s.exitCode ?? 0;
}

async function runSimple(scenario, key, defaultLines) {
  const s = scenario[key] ?? {};
  if (s.delayMs) await sleep(s.delayMs);
  emitLines(s.stdoutLines ?? defaultLines);
  if (s.stderr) process.stderr.write(s.stderr);
  process.exitCode = s.exitCode ?? 0;
}

async function runGenerate(scenario) {
  const s = scenario.generate ?? {};
  if (s.delayMs) await sleep(s.delayMs);
  emitLines(s.stdoutLines ?? []);
  if (s.markerBlock) process.stdout.write(`${s.markerBlock}\n`);
  if (s.mediaTags) process.stdout.write(`MEDIA_TAGS:${JSON.stringify(s.mediaTags)}\n`);
  if (s.cacheFiles) process.stdout.write(`CACHE_FILES:${JSON.stringify(s.cacheFiles)}\n`);
  if (s.workspaceFiles) process.stdout.write(`WORKSPACE_FILES:${JSON.stringify(s.workspaceFiles)}\n`);
  if (s.stderr) process.stderr.write(s.stderr);
  process.exitCode = s.exitCode ?? 0;
}

async function runDefault(scenario) {
  const s = scenario.default ?? {};
  emitLines(s.stdoutLines ?? []);
  process.stderr.write(s.stderr ?? "unknown hermes command\n");
  process.exitCode = s.exitCode ?? 1;
}

async function main() {
  const scenario = readScenario();
  let args = process.argv.slice(2);
  if (args[0] === "-p") {
    // Native per-profile invocation (`hermes -p <profile> ...`) — the
    // profile name itself does not affect fixture behavior, only the
    // scenario file does.
    args = args.slice(2);
  }

  if (args[0] === "--version") {
    await runSimple(scenario, "version", ["hermes-cli 1.0.0"]);
    return;
  }
  if (args[0] === "auth" && args[1] === "add") {
    await runAuthAdd(scenario);
    return;
  }
  if (args[0] === "auth" && args[1] === "status") {
    await runSimple(scenario, "authStatus", ["Status: authenticated", "Account: grok-fan@example.com"]);
    return;
  }
  if (args[0] === "auth" && args[1] === "logout") {
    await runSimple(scenario, "authLogout", ["Logged out."]);
    return;
  }
  if (args[0] === "tools") {
    await runSimple(scenario, "tools", ["Available tools:", "- image.generate", "- image.edit"]);
    return;
  }
  if (args[0] === "generate") {
    await runGenerate(scenario);
    return;
  }

  await runDefault(scenario);
}

main().catch((error) => {
  process.stderr.write(`fake-hermes-cli fatal: ${error?.message ?? String(error)}\n`);
  process.exitCode = 1;
});
