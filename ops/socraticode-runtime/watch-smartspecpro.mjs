import { spawn } from "node:child_process";
import fs from "node:fs";

const projectPath = process.env.SOCRATICODE_PROJECT_ROOT || "/home/dev/projects/SmartSpecPro";
const launcherPath = process.env.SOCRATICODE_MCP_LAUNCHER
  || "/home/dev/tools/socraticode-docker/socraticode-mcp.sh";
const logPath = process.env.SOCRATICODE_WATCH_LOG_PATH
  || "/home/dev/tools/socraticode-docker/watch-smartspecpro.log";
const allowUnsafeTestTimeouts = process.env.SOCRATICODE_ALLOW_UNSAFE_TEST_TIMEOUTS === "1";

function durationFromEnv(name, defaultMs, productionMinimumMs) {
  const raw = Number.parseInt(process.env[name] || "", 10);
  const minimum = allowUnsafeTestTimeouts ? 25 : productionMinimumMs;
  return Number.isFinite(raw) && raw >= minimum ? raw : defaultMs;
}

const initializeTimeoutMs = durationFromEnv("SOCRATICODE_INITIALIZE_TIMEOUT_MS", 30_000, 5_000);
const watchStartTimeoutMs = durationFromEnv("SOCRATICODE_WATCH_START_TIMEOUT_MS", 45 * 60_000, 60_000);
const statusTimeoutMs = durationFromEnv("SOCRATICODE_STATUS_TIMEOUT_MS", 5 * 60_000, 30_000);
const statusPollIntervalMs = durationFromEnv("SOCRATICODE_STATUS_POLL_INTERVAL_MS", 15 * 60_000, 60_000);
const childKillGraceMs = durationFromEnv("SOCRATICODE_CHILD_KILL_GRACE_MS", 5_000, 1_000);
const maxLogChars = durationFromEnv("SOCRATICODE_MAX_LOG_CHARS", 8_000, 512);
const maxStdoutBufferChars = durationFromEnv("SOCRATICODE_MAX_STDOUT_BUFFER_CHARS", 1024 * 1024, 64 * 1024);

const log = fs.createWriteStream(logPath, { flags: "a" });
let nextId = 1;
const pending = new Map();
let statusTimer;
let statusRequestInFlight = false;
let buffer = "";
let shuttingDown = false;
let finished = false;
let requestedExitCode;
let forceKillTimer;

function bounded(value) {
  const text = String(value ?? "");
  if (text.length <= maxLogChars) return text;
  return `${text.slice(0, maxLogChars)}\n...[truncated ${text.length - maxLogChars} chars]`;
}

function write(message) {
  log.write(`[${new Date().toISOString()}] ${bounded(message)}\n`);
}

const child = spawn(launcherPath, {
  cwd: projectPath,
  env: {
    ...process.env,
    SOCRATICODE_LOG_LEVEL: "info",
    SOCRATICODE_MCP_MEMORY_LIMIT: "4g",
    SOCRATICODE_MCP_ROLE: "watcher",
  },
  stdio: ["pipe", "pipe", "pipe"],
});

function clearPendingRequest(id) {
  const request = pending.get(id);
  if (!request) return undefined;
  clearTimeout(request.timer);
  pending.delete(id);
  return request;
}

function clearAllTimers() {
  if (statusTimer) clearInterval(statusTimer);
  statusTimer = undefined;
  for (const request of pending.values()) clearTimeout(request.timer);
  pending.clear();
  statusRequestInFlight = false;
}

function finish(exitCode) {
  if (finished) return;
  finished = true;
  const normalizedCode = Number.isInteger(exitCode) ? exitCode : 1;
  log.end(() => process.exit(normalizedCode));
}

function shutdown(exitCode, reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  requestedExitCode = exitCode;
  clearAllTimers();
  write(`${reason}; terminating owned MCP child`);
  child.stdin.end();
  if (child.exitCode !== null || child.signalCode !== null) {
    finish(requestedExitCode);
    return;
  }
  child.kill("SIGTERM");
  forceKillTimer = setTimeout(() => {
    write(`MCP child did not exit within ${childKillGraceMs}ms; sending SIGKILL`);
    child.kill("SIGKILL");
  }, childKillGraceMs);
}

function trackRequest(id, kind, timeoutMs) {
  const startedAt = Date.now();
  const timer = setTimeout(() => {
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    if (kind === "status") statusRequestInFlight = false;
    const elapsedMs = Date.now() - startedAt;
    shutdown(124, `${kind} timed out after ${elapsedMs}ms`);
  }, timeoutMs);
  pending.set(id, { kind, startedAt, timer });
}

function send(method, params, kind, timeoutMs) {
  const id = nextId++;
  const line = `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`;
  if (!child.stdin.writable || child.stdin.destroyed) {
    shutdown(70, `cannot send ${kind}; MCP child stdin is unavailable`);
    return id;
  }
  trackRequest(id, kind, timeoutMs);
  child.stdin.write(line);
  return id;
}

function notify(method, params = {}) {
  if (!child.stdin.writable || child.stdin.destroyed) return;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
}

function callTool(name, args, kind, timeoutMs) {
  return send("tools/call", { name, arguments: args }, kind, timeoutMs);
}

function toolText(msg) {
  return msg?.result?.content?.map((item) => item.text || "").join("\n") || "";
}

function pollStatus() {
  if (shuttingDown) return;
  if (statusRequestInFlight) {
    write("Skipping codebase_status poll because the previous request is still running");
    return;
  }
  statusRequestInFlight = true;
  callTool("codebase_status", { projectPath }, "status", statusTimeoutMs);
}

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  if (buffer.length > maxStdoutBufferChars) {
    shutdown(70, `MCP stdout buffer exceeded ${maxStdoutBufferChars} chars without a complete line`);
    return;
  }

  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;

    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      write(`non-JSON stdout: ${line}`);
      continue;
    }

    const request = clearPendingRequest(msg.id);
    if (request && msg.error) {
      if (request.kind === "status") statusRequestInFlight = false;
      shutdown(70, `${request.kind} failed: ${msg.error.message || JSON.stringify(msg.error)}`);
      continue;
    }
    if (request?.kind === "initialize") {
      write(`SocratiCode MCP ${msg.result?.serverInfo?.version || ""} initialized`);
      notify("notifications/initialized");
      callTool("codebase_watch", { projectPath, action: "start" }, "watch-start", watchStartTimeoutMs);
      continue;
    }
    if (request?.kind === "watch-start") {
      write(`codebase_watch start:\n${toolText(msg)}`);
      pollStatus();
      statusTimer = setInterval(pollStatus, statusPollIntervalMs);
      continue;
    }
    if (request?.kind === "status") {
      statusRequestInFlight = false;
      write(`codebase_status:\n${toolText(msg)}`);
      continue;
    }

    if (msg.method === "notifications/message" && msg.params?.data) {
      write(`log: ${msg.params.data}`);
    } else if (msg.error) {
      write(`error: ${JSON.stringify(msg.error)}`);
    }
  }
});

child.stderr.on("data", (chunk) => write(`stderr: ${chunk}`));
child.stdin.on("error", (error) => shutdown(70, `MCP child stdin failed: ${error.message}`));
child.on("error", (error) => shutdown(70, `failed to start MCP child: ${error.message}`));
child.on("exit", (code, signal) => {
  if (forceKillTimer) clearTimeout(forceKillTimer);
  clearAllTimers();
  const exitCode = requestedExitCode ?? (Number.isInteger(code) ? code : signal ? 1 : 0);
  write(`SocratiCode MCP exited code=${code ?? "null"} signal=${signal ?? "none"}`);
  finish(exitCode);
});

process.on("SIGTERM", () => shutdown(0, "SIGTERM received"));
process.on("SIGINT", () => shutdown(130, "SIGINT received"));
process.on("SIGHUP", () => shutdown(129, "SIGHUP received"));

write("Starting SmartSpecPro SocratiCode watch runner");
send("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "codex-watch-runner", version: "0.2" },
}, "initialize", initializeTimeoutMs);
