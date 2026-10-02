import { spawn } from "node:child_process";
import fs from "node:fs";

const projectPath = process.env.SOCRATICODE_PROJECT_ROOT || "/home/dev/projects/SmartSpecPro";
const launcherPath = process.env.SOCRATICODE_MCP_LAUNCHER
  || "/home/dev/tools/socraticode-docker/socraticode-mcp.sh";
const logPath = process.env.SOCRATICODE_INDEX_LOG_PATH
  || "/home/dev/tools/socraticode-docker/index-smartspecpro.log";
const log = fs.createWriteStream(logPath, { flags: "a" });
let nextId = 1;
const pending = new Map();
let statusTimer;
let statusRequestInFlight = false;
let indexRequested = false;

function write(message) {
  const value = String(message ?? "");
  const bounded = value.length > 8_000 ? `${value.slice(0, 8_000)}\n...[truncated]` : value;
  log.write(`[${new Date().toISOString()}] ${bounded}\n`);
}

const child = spawn(launcherPath, {
  cwd: projectPath,
  env: {
    ...process.env,
    SOCRATICODE_LOG_LEVEL: "info",
    SOCRATICODE_MCP_MEMORY_LIMIT: "6g",
    SOCRATICODE_MCP_ROLE: "indexer",
  },
});

function send(method, params) {
  const id = nextId++;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return id;
}

function notify(method, params = {}) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
}

function callTool(name, args = {}) {
  return send("tools/call", { name, arguments: args });
}

function toolText(msg) {
  return msg?.result?.content?.map((item) => item.text || "").join("\n") || "";
}

function isComplete(text) {
  return !/in progress/i.test(text)
    && !/INCOMPLETE/i.test(text)
    && /Indexed chunks: [1-9]\d*/i.test(text);
}

function needsIndex(text) {
  return /No index found/i.test(text)
    || /INDEX IS INCOMPLETE/i.test(text)
    || /Run codebase_index to resume/i.test(text);
}

function pollStatus(delayMs = 0) {
  setTimeout(() => {
    if (statusRequestInFlight) {
      write("Skipping codebase_status poll because the previous request is still running");
      return;
    }
    statusRequestInFlight = true;
    const id = callTool("codebase_status", { projectPath });
    pending.set(id, "status");
  }, delayMs);
}

let buffer = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;

    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      write(line);
      continue;
    }

    if (msg.id === 1) {
      write(`SocratiCode MCP ${msg.result?.serverInfo?.version || ""} initialized`);
      notify("notifications/initialized");
      pollStatus(500);
      continue;
    }

    const kind = pending.get(msg.id);
    if (kind === "index") {
      pending.delete(msg.id);
      write(`codebase_index:\n${toolText(msg)}`);
      if (statusTimer) clearInterval(statusTimer);
      statusTimer = setInterval(pollStatus, 60_000);
      pollStatus();
      continue;
    }

    if (kind === "status") {
      pending.delete(msg.id);
      statusRequestInFlight = false;
      const text = toolText(msg);
      write(`codebase_status:\n${text}`);

      if (needsIndex(text) && !indexRequested) {
        indexRequested = true;
        const id = callTool("codebase_index", { projectPath });
        pending.set(id, "index");
        continue;
      }

      if (isComplete(text)) {
        write("Indexing completed.");
        if (statusTimer) clearInterval(statusTimer);
        child.stdin.end();
        continue;
      }

      if (!statusTimer) statusTimer = setInterval(pollStatus, 60_000);
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
child.on("exit", (code) => {
  if (statusTimer) clearInterval(statusTimer);
  write(`SocratiCode MCP exited with code ${code}`);
  log.end(() => process.exit(code ?? 0));
});

write("Starting SmartSpecPro SocratiCode index runner");
send("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "codex-background-indexer", version: "0.2" },
});
