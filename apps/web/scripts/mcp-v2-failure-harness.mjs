#!/usr/bin/env node

const baseUrl = String(process.env.MCP_SMOKE_URL || "").replace(/\/$/, "");
const token = String(process.env.MCP_SMOKE_TOKEN || "");
const protocolVersion = "2026-07-28";
if (!baseUrl || !token) {
  console.error("MCP failure harness is blocked: MCP_SMOKE_URL and MCP_SMOKE_TOKEN are required");
  process.exit(2);
}

async function post(body, headers = {}) {
  const response = await fetch(`${baseUrl}/v1/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-protocol-version": protocolVersion,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  let payload = null;
  try { payload = await response.json(); } catch {}
  return { response, payload };
}

async function expectError(label, request, expectedCode, headers = {}) {
  const { payload } = await post(request, headers);
  if (payload?.error?.code !== expectedCode) {
    throw new Error(`${label}: expected JSON-RPC ${expectedCode}, got ${JSON.stringify(payload)}`);
  }
}

async function main() {
  await expectError(
    "legacy session header on modern request",
    { jsonrpc: "2.0", id: 11, method: "ping", params: {} },
    -32600,
    { "mcp-session-id": "must-not-be-used" },
  );
  await expectError(
    "unknown method",
    { jsonrpc: "2.0", id: 12, method: "unknown/method", params: {} },
    -32601,
  );
  const unauthenticated = await fetch(`${baseUrl}/v1/mcp`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "mcp-protocol-version": protocolVersion },
    body: JSON.stringify({ jsonrpc: "2.0", id: 13, method: "server/discover", params: {} }),
  });
  if (![401, 403].includes(unauthenticated.status)) {
    throw new Error(`unauthenticated request unexpectedly returned HTTP ${unauthenticated.status}`);
  }
  console.log(JSON.stringify({ ok: true, checks: ["session_header_rejected", "unknown_method_rejected", "unauthenticated_rejected"] }, null, 2));
}

main().catch((error) => {
  console.error(`MCP failure harness failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
