# MCP Server Integration

## Overview

SmartSpecPro supports connecting to external MCP (Model Context Protocol) servers, allowing AI agents to use tools provided by third-party services.

## Adding an MCP Server

Navigate to **Admin > MCP Servers** and click **Add Server**.

### Transport Types

| Transport | Description | Use Case |
|-----------|-------------|----------|
| **HTTP** | Standard JSON-RPC over HTTP/HTTPS | Most common, works with any MCP server |
| **Streamable HTTP** | SSE-based transport with session management | Real-time streaming responses |
| **stdio** | Process-based via OpenSandbox containers | Local tools that run as CLI processes |

### HTTP Server Setup

1. Enter the server URL (e.g., `https://mcp.example.com`)
2. Optionally add a Bearer token for authentication
3. Click **Test Connection** to verify connectivity
4. Enable the server to make its tools available to agents

### OAuth Connection

For servers requiring OAuth 2.1:
1. Click **Connect with OAuth** on the server card
2. You'll be redirected to the provider's authorization page
3. After granting access, you'll return to SmartSpecPro
4. The token is securely encrypted and auto-refreshed

### stdio Server Setup

Requires OpenSandbox to be enabled. The server runs inside an isolated container:
1. Specify the command (e.g., `npx`)
2. Add arguments (e.g., `@modelcontextprotocol/server-github`)
3. Configure environment variables (secrets are encrypted)
4. The container has no network access for security

## How Tools Appear in Agents

Once an MCP server is enabled and assigned to an agency/agent:
- Tools from the server appear in the agent's available tool list
- The agent can invoke them during conversations
- Tool calls are logged in the audit trail
- Credit costs are tracked per call

## Health Check

The health status of each server is shown on the MCP Servers page:
- **Healthy**: Server is responding to pings
- **Degraded**: Server is slow but functional
- **Unhealthy**: Server is not responding

## Troubleshooting

### Connection Refused
- Verify the server URL is correct and accessible
- Check if the server requires authentication (Bearer token or OAuth)
- Ensure the server's IP is not in a private/blocked range (SSRF protection)

### OAuth Token Expired
- Click **Reconnect** on the server card to refresh the OAuth flow
- Check if the OAuth provider has revoked access

### stdio Server Unavailable
- Verify OpenSandbox is enabled (`OPENSANDBOX_ENABLED=true`)
- Check the maximum concurrent containers limit per tenant (default: 2)

## Security

- All server URLs undergo SSRF validation (private IPs blocked)
- DNS rebinding prevention is active for HTTP connections
- OAuth tokens are encrypted at rest using AES-256-GCM
- stdio containers run with no network access
- Response size is limited to 1MB per tool call
- All tool calls are audit-logged with duration and cost
