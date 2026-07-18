import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";

const launcher = process.env.SOCRATICODE_MCP_LAUNCHER
  || "/home/dev/tools/socraticode-docker/socraticode-mcp.sh";
const projectPath = process.env.SOCRATICODE_PROJECT_ROOT
  || "/home/dev/projects/SmartSpecPro";

const child = spawn(launcher, [], {
  cwd: projectPath,
  env: { ...process.env, SOCRATICODE_MCP_ROLE: "smoke" },
  stdio: ["pipe", "pipe", "pipe"],
});
const expectedContainerName = `socraticode-mcp-${child.pid}`;
let stdoutBuffer = "";
let stderrBuffer = "";
let statusText = "";
let statusReceived = false;
let toolsListed = false;

const timeout = setTimeout(() => {
  child.kill("SIGTERM");
}, 30_000);

child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderrBuffer = `${stderrBuffer}${chunk}`.slice(-8_000);
});

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk;
  let newline;
  while ((newline = stdoutBuffer.indexOf("\n")) >= 0) {
    const line = stdoutBuffer.slice(0, newline).trim();
    stdoutBuffer = stdoutBuffer.slice(newline + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.id === 1) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`);
      child.stdin.write(`${JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      })}\n`);
    } else if (message.id === 2) {
      const toolNames = message?.result?.tools?.map((tool) => tool.name) || [];
      toolsListed = toolNames.includes("codebase_status");
      child.stdin.write(`${JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "codebase_status", arguments: { projectPath } },
      })}\n`);
    } else if (message.id === 3) {
      statusText = message?.result?.content?.map((item) => item.text || "").join("\n") || "";
      statusReceived = true;
      child.stdin.end();
    }
  }
});

child.stdin.write(`${JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "socraticode-live-smoke", version: "0.1" },
  },
})}\n`);

const exit = await new Promise((resolve) => {
  child.on("exit", (code, signal) => resolve({ code, signal }));
});
clearTimeout(timeout);

assert.equal(toolsListed, true, `tools/list did not expose codebase_status; stderr=${stderrBuffer}`);
assert.equal(statusReceived, true, `status response missing; stderr=${stderrBuffer}`);
assert.match(statusText, /Status: green/i);
assert.equal(exit.code, 0, `launcher exited code=${exit.code} signal=${exit.signal}; stderr=${stderrBuffer}`);

const containerCheck = spawnSync("docker", ["ps", "-a", "--filter", `name=^/${expectedContainerName}$`, "--format", "{{.Names}}"], {
  encoding: "utf8",
});
assert.equal(containerCheck.status, 0);
assert.equal(containerCheck.stdout.trim(), "", `owned smoke container leaked: ${expectedContainerName}`);

console.log(`live MCP smoke: PASS (${expectedContainerName} cleaned)`);
