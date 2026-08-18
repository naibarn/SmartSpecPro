#!/usr/bin/env node

const baseUrl = String(process.env.MCP_SMOKE_URL || "").replace(/\/$/, "");
const token = String(process.env.MCP_SMOKE_TOKEN || "");
const protocolVersion = "2026-07-28";

if (!baseUrl || !token) {
  console.error("MCP smoke is blocked: MCP_SMOKE_URL and MCP_SMOKE_TOKEN are required");
  process.exit(2);
}

function authHeaders(extra = {}) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "mcp-protocol-version": protocolVersion,
    ...extra,
  };
}

async function jsonRequest(path, body, extraHeaders = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: authHeaders(extraHeaders),
    body: JSON.stringify(body),
  });
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  if (payload?.error) throw new Error(`${path} returned JSON-RPC error ${JSON.stringify(payload.error)}`);
  return { response, payload };
}

async function main() {
  const manifestResponse = await fetch(`${baseUrl}/.well-known/mcp.json`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  if (!manifestResponse.ok) throw new Error(`manifest returned HTTP ${manifestResponse.status}`);
  const manifest = await manifestResponse.json();
  if (!manifest.endpoint || !Array.isArray(manifest.protocolVersions)) throw new Error("manifest is incomplete");

  const discover = await jsonRequest("/v1/mcp", { jsonrpc: "2.0", id: 1, method: "server/discover", params: {} });
  if (discover.payload.result?.eras?.modern !== true) throw new Error("modern MCP is not advertised by server/discover");

  const tools = await jsonRequest("/v1/mcp", { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const toolList = tools.payload.result?.tools;
  if (!Array.isArray(toolList) || toolList.length === 0) throw new Error("tools/list returned no tools");

  const resources = await jsonRequest("/v1/mcp", { jsonrpc: "2.0", id: 3, method: "resources/list", params: {} });
  const resourceList = resources.payload.result?.resources;
  if (!Array.isArray(resourceList)) throw new Error("resources/list returned no resource list");
  if (resourceList[0]?.uri) {
    await jsonRequest("/v1/mcp", {
      jsonrpc: "2.0", id: 4, method: "resources/read", params: { uri: resourceList[0].uri },
    });
  }

  const configuredTool = String(process.env.MCP_SMOKE_TOOL || "");
  const selectedTool = toolList.find((tool) => tool?.name === configuredTool)
    || toolList.find((tool) => tool?.name === "smartspec.gateway.models.list")
    || toolList.find((tool) => tool?.name === "smartspec.media.history.list");
  if (!selectedTool?.name) throw new Error("no safe read-only MCP smoke tool was discovered");
  let args = {};
  if (process.env.MCP_SMOKE_TOOL_ARGS) args = JSON.parse(process.env.MCP_SMOKE_TOOL_ARGS);
  await jsonRequest("/v1/mcp", {
    jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: selectedTool.name, arguments: args },
  }, { "mcp-method": "tools/call", "mcp-name": selectedTool.name });

  console.log(JSON.stringify({
    ok: true,
    endpoint: manifest.endpoint,
    protocolVersion,
    toolCount: toolList.length,
    resourceCount: resourceList.length,
    smokeTool: selectedTool.name,
  }, null, 2));
}

main().catch((error) => {
  console.error(`MCP protocol smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
