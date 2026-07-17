import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const runtimeDir = path.resolve(import.meta.dirname, "..");
const watcherPath = path.join(runtimeDir, "watch-smartspecpro.mjs");

function writeFakeMcp(directory) {
  const fakePath = path.join(directory, "fake-mcp.mjs");
  writeFileSync(
    fakePath,
    `#!/usr/bin/env node
import fs from "node:fs";
import readline from "node:readline";
const events = process.env.FAKE_MCP_EVENTS;
const mode = process.env.FAKE_MCP_MODE;
const stream = fs.createWriteStream(events, { flags: "a" });
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const msg = JSON.parse(line);
  const name = msg?.params?.name || msg.method;
  stream.write(name + "\\n");
  if (mode === "initialize-hang") return;
  if (msg.method === "initialize") {
    if (mode === "initialize-error") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: "fixture failure" } }) + "\\n");
      return;
    }
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { serverInfo: { version: "test" } } }) + "\\n");
    return;
  }
  if (name === "codebase_watch" && mode !== "watch-hang") {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "watch active" }] } }) + "\\n");
  }
});
`,
  );
  chmodSync(fakePath, 0o755);
  return fakePath;
}

function runWatcher(mode, overrides = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "socraticode-watch-test-"));
  const launcher = writeFakeMcp(directory);
  const logPath = path.join(directory, "watch.log");
  const eventsPath = path.join(directory, "events.log");
  const child = spawn(process.execPath, [watcherPath], {
    env: {
      ...process.env,
      SOCRATICODE_MCP_LAUNCHER: launcher,
      SOCRATICODE_WATCH_LOG_PATH: logPath,
      SOCRATICODE_PROJECT_ROOT: "/home/dev/projects/SmartSpecPro",
      SOCRATICODE_ALLOW_UNSAFE_TEST_TIMEOUTS: "1",
      SOCRATICODE_INITIALIZE_TIMEOUT_MS: "250",
      SOCRATICODE_WATCH_START_TIMEOUT_MS: "300",
      SOCRATICODE_STATUS_TIMEOUT_MS: "650",
      SOCRATICODE_STATUS_POLL_INTERVAL_MS: "100",
      SOCRATICODE_CHILD_KILL_GRACE_MS: "100",
      FAKE_MCP_EVENTS: eventsPath,
      FAKE_MCP_MODE: mode,
      ...overrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`watcher did not exit for mode ${mode}`));
    }, 3000);
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      const log = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
      const events = existsSync(eventsPath) ? readFileSync(eventsPath, "utf8") : "";
      rmSync(directory, { recursive: true, force: true });
      resolve({ code, signal, log, events });
    });
  });
}

test("initialize timeout exits non-zero and logs the recovery action", async () => {
  const result = await runWatcher("initialize-hang");
  assert.equal(result.code, 124);
  assert.match(result.log, /initialize timed out/i);
  assert.match(result.log, /terminating owned MCP child/i);
});

test("watch-start timeout exits non-zero instead of hanging forever", async () => {
  const result = await runWatcher("watch-hang");
  assert.equal(result.code, 124);
  assert.match(result.log, /watch-start timed out/i);
});

test("JSON-RPC initialization errors exit non-zero instead of starting the watcher", async () => {
  const result = await runWatcher("initialize-error");
  assert.equal(result.code, 70);
  assert.match(result.log, /initialize failed.*fixture failure/i);
});

test("status polling remains single-flight until the request watchdog fires", async () => {
  const result = await runWatcher("status-hang");
  assert.equal(result.code, 124);
  const statusCalls = result.events.split("\n").filter((line) => line === "codebase_status");
  assert.equal(statusCalls.length, 1);
  assert.match(result.log, /Skipping codebase_status poll because the previous request is still running/);
  assert.match(result.log, /status timed out/i);
});
