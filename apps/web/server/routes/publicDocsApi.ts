import type { Express } from "express";
import swaggerUi from "swagger-ui-express";

// ---------------------------------------------------------------------------
// Common response headers component
// ---------------------------------------------------------------------------

const commonHeaders = {
  "X-Request-Id": {
    description: "Unique trace ID for this request (use for support enquiries)",
    schema: { type: "string" },
  },
  "X-Credits-Used": {
    description: "Credits consumed by this request",
    schema: { type: "integer" },
  },
  "X-Credits-Remaining": {
    description: "Remaining credit balance for the tenant",
    schema: { type: "integer" },
  },
  "X-RateLimit-Limit": {
    description: "Maximum requests per minute for this key",
    schema: { type: "integer" },
  },
  "X-RateLimit-Remaining": {
    description: "Requests remaining in the current window",
    schema: { type: "integer" },
  },
  "X-RateLimit-Reset": {
    description: "Unix timestamp (seconds) when the rate-limit window resets",
    schema: { type: "integer" },
  },
  "X-Credit-Quota-5h-Limit": {
    description:
      "Dedicated MCP CLI key credit budget for the current 5-hour bucket",
    schema: { type: "integer" },
  },
  "X-Credit-Quota-5h-Used": {
    description:
      "Credits used by the dedicated MCP CLI key in the current 5-hour bucket",
    schema: { type: "integer" },
  },
  "X-Credit-Quota-5h-Remaining": {
    description:
      "Credits remaining for the dedicated MCP CLI key in the current 5-hour bucket",
    schema: { type: "integer" },
  },
  "X-Credit-Quota-1d-Limit": {
    description: "Dedicated MCP CLI key credit budget for the current UTC day",
    schema: { type: "integer" },
  },
  "X-Credit-Quota-1d-Used": {
    description:
      "Credits used by the dedicated MCP CLI key in the current UTC day",
    schema: { type: "integer" },
  },
  "X-Credit-Quota-1d-Remaining": {
    description:
      "Credits remaining for the dedicated MCP CLI key in the current UTC day",
    schema: { type: "integer" },
  },
  "X-Credit-Quota-7d-Limit": {
    description:
      "Dedicated MCP CLI key credit budget for the current 7-day bucket",
    schema: { type: "integer" },
  },
  "X-Credit-Quota-7d-Used": {
    description:
      "Credits used by the dedicated MCP CLI key in the current 7-day bucket",
    schema: { type: "integer" },
  },
  "X-Credit-Quota-7d-Remaining": {
    description:
      "Credits remaining for the dedicated MCP CLI key in the current 7-day bucket",
    schema: { type: "integer" },
  },
};

// ---------------------------------------------------------------------------
// Reusable response fragments
// ---------------------------------------------------------------------------

function errorResponse(description = "Error response") {
  return {
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Error" },
      },
    },
  };
}

const commonErrorResponses = {
  "400": errorResponse("Bad request — invalid parameters"),
  "401": errorResponse("Authentication failed — missing or invalid API key"),
  "403": errorResponse("Insufficient scopes for this operation"),
  "429": errorResponse("Rate limit exceeded"),
};

const mcpGuideDescription = [
  "## SmartAIHub MCP connection guide",
  "",
  "This Swagger page documents the Public REST API. It is not the MCP endpoint and it does not require an API key for documentation access.",
  "For MCP clients, use the canonical endpoint **`POST https://smartaihub.app/v1/mcp`**.",
  "",
  "### Choose one setup path",
  "",
  "- **Hermes One (desktop UI):** use Settings → MCP & Devices → Connect in Hermes One. No terminal, API key, or manual token copy is required.",
  "- **Hermes CLI / Hermes Agent:** use the terminal commands in the Hermes section below.",
  "- **Claude / Claude Desktop:** use Settings → Connectors → Add custom connector. Do not put a remote server in `claude_desktop_config.json`.",
  "- **Codex CLI / Codex Desktop:** use Codex MCP settings or the `codex mcp` commands below, then verify with `codex mcp list` and a new session.",
  "- **Other MCP clients:** use Streamable HTTP + OAuth discovery (**OAuth / Sign in with browser**). If a tool supports only REST or static API keys, use the Public REST/OpenAPI path instead of guessing an MCP header configuration.",
  "",
  "When OAuth readiness is enabled, supported clients use the same SmartAIHub endpoint, OAuth authorization server, tenant ACL, and scope policy. If the readiness card is unavailable, use the documented browserless/API-key fallback instead of assuming OAuth is active. Each client owns its browser callback and secure credential store; never copy a token or credential file from one client to another.",
  "",
  "### Before you connect",
  "",
  "1. The server administrator must save the production MCP profile in **Admin → Infrastructure → MCP/OAuth**. Then, for each tenant, enable **MCP Server Registry → Modern MCP protocol**, **MCP documentation resources**, **OAuth Protected Resource Metadata**, and **MCP OAuth Authorization Server** in the tenant feature flags. **Dynamic client registration is optional**: enable it only when a client release requires it, with HTTPS/loopback redirect validation and rate limiting. Built-in clients with a pre-registered/public client flow do not need it.",
  "2. Confirm the MCP & Devices card reports **OAuth ready**. If it reports **OAuth not ready** or the discovery URLs return 404, the runtime or tenant gate is intentionally not enabled yet; do not copy a token from another client.",
  "3. Use the exact endpoint `https://smartaihub.app/v1/mcp` (not `/v1/docs/`, `/v1/openapi.json`, or `/api/mcp/tools`).",
  "4. Sign in through the SmartAIHub browser page and approve only the scopes and tenant/workspace you recognize.",
  "5. After authorization, reload MCP tools. The first successful discovery should include `server/discover` or legacy `initialize`, followed by `tools/list`.",
  "",
  '<a id="hermes-one"></a>',
  "### Hermes One — desktop UI",
  "",
  "1. Open SmartAIHub → Settings → MCP & Devices.",
  "2. Wait until the card shows **OAuth automatic / ready**.",
  "3. Click **Connect in Hermes One**, confirm the public server configuration in Hermes, then complete SmartAIHub browser login and consent.",
  "4. Return to Hermes and reload its MCP tools.",
  "",
  "The generated `hermes://mcp/install` link contains only the public MCP URL and `auth: oauth`; it never contains an API key, access token, refresh token, worker credential, or tenant secret. If Hermes One is not installed or the link is unavailable, use Hermes CLI.",
  "",
  '<a id="hermes-cli"></a>',
  "### Hermes CLI / Hermes Agent — terminal",
  "",
  "Run interactive commands from Windows PowerShell/Windows Terminal or macOS Terminal, not an embedded agent shell:",
  "```text",
  "hermes mcp add smartaihub --url https://smartaihub.app/v1/mcp --auth oauth",
  "hermes mcp login smartaihub",
  "hermes mcp test smartaihub",
  "hermes mcp list",
  "```",
  "",
  "Use `auth: oauth`. Do not use `hermes mcp add ... --auth header`.",
  "That mode selects static header/API-key authentication, causes an API-key prompt, and is not the SmartAIHub OAuth flow. Hermes stores and refreshes its own OAuth credentials; do not copy them to Claude or Codex.",
  "If this machine has no browser, Hermes can still use OAuth when its interactive terminal offers the authorize URL and paste-back redirect flow; open the URL on another trusted device and paste the final redirect back. If that flow is unavailable, create **Settings → API Keys → Create MCP CLI Key** first. Choose the scopes and credit budgets there; the raw key is shown once only. Then use Hermes' header mode and enter the key in its secure credential prompt. This is the only documented reason to use `--auth header`.",
  "If Hermes reports `Invalid registration response`, inspect the OAuth authorization metadata and confirm it contains `registration_endpoint: https://smartaihub.app/oauth/register`. Save the recommended MCP/OAuth profile with dynamic registration enabled, then retry after restarting the MCP connection.",
  "",
  '<a id="claude"></a>',
  "### Claude / Claude Desktop — remote Connector UI",
  "",
  "1. Open Claude or Claude Desktop → **Settings → Connectors**.",
  "2. Choose **Add custom connector** and enter `https://smartaihub.app/v1/mcp`.",
  "3. Click **Add**, then **Connect**. Complete SmartAIHub browser login and review permissions.",
  "4. Enable only the tools needed for the conversation from Claude's Search and tools menu.",
  "",
  "Claude's Connector UI owns its OAuth callback and credentials. Do not manually add this remote URL to `claude_desktop_config.json`.",
  "",
  "For **Claude Code**, use the HTTP transport and authenticate from its `/mcp` menu:",
  "```text",
  "claude mcp add --transport http smartaihub https://smartaihub.app/v1/mcp",
  "> /mcp",
  "```",
  "",
  '<a id="codex"></a>',
  "### Codex CLI / Codex Desktop",
  "",
  "For Codex CLI, add the remote Streamable HTTP server and complete browser login when requested:",
  "```text",
  "codex mcp add smartaihub --url https://smartaihub.app/v1/mcp",
  "codex mcp login smartaihub",
  "codex mcp list",
  "```",
  "",
  "Codex releases may authenticate during `add`, during `login`, or expose fewer OAuth status fields. Treat `codex mcp list` plus actual tool discovery in a new session as the verification source. Do not use `--bearer-token-env-var` for the OAuth path.",
  "For a machine without a browser, create a dedicated MCP CLI key in SmartAIHub first, store it as `SMARTAIHUB_MCP_KEY` in the OS secret store/environment, and use `codex mcp add smartaihub --url https://smartaihub.app/v1/mcp --bearer-token-env-var SMARTAIHUB_MCP_KEY`. Do not put the real key in shell history or a committed config file.",
  "",
  '<a id="other"></a>',
  "### Other MCP clients — generic remote setup",
  "",
  "Choose **Streamable HTTP**, set the URL to `https://smartaihub.app/v1/mcp`, and select **OAuth 2.1 / browser login** when the server reports OAuth ready. A compatible client follows the `401` Bearer challenge, reads the metadata below, completes Authorization Code + PKCE, and retries with a short-lived Bearer access token.",
  "",
  "If the client cannot do MCP OAuth discovery, do not invent a static `Authorization` header or paste a browser token. Use the documented Hermes pairing/API-key compatibility fallback only when that client and SmartAIHub explicitly support it; otherwise use `https://smartaihub.app/v1/openapi.json` for REST/OpenAPI integration.",
  "### No-browser CLI fallback — Claude Code and other HTTP clients",
  "Create a dedicated MCP CLI key at **Settings → API Keys → Create MCP CLI Key**. The default safety budgets are 500 credits per 5-hour bucket, 1,500 credits per day, and 5,000 credits per 7-day bucket. You can lower them, raise them, or explicitly leave a window unlimited. The key remains tenant/user scoped and all MCP ACL checks still apply.",
  "For Claude Code, store the key in `SMARTAIHUB_MCP_KEY` and add the remote HTTP server with a bearer header (syntax can vary by Claude Code release):",
  "```text",
  'claude mcp add --transport http smartaihub https://smartaihub.app/v1/mcp --header "Authorization: Bearer $SMARTAIHUB_MCP_KEY"',
  "```",
  'On macOS, load it from Keychain with `export SMARTAIHUB_MCP_KEY="$(security find-generic-password -s SmartAIHubMcpKey -w)"`; on Windows PowerShell, load it from the configured SecretManagement vault with `$env:SMARTAIHUB_MCP_KEY = (Get-Secret SmartAIHubMcpKey -AsPlainText)`. Prefer the OS secret store over a plaintext profile or command-line argument.',
  "For a generic MCP client, set `Authorization: Bearer <dedicated MCP CLI key>` through its secret/environment-variable facility. Never use an OAuth access or refresh token as a static header.",
  "After setup, verify with `tools/list` and a harmless read-only tool. If the key is revoked, expired, or over quota, the client receives a clear 401/429 response and must not retry in a tight loop.",
  "",
  "OAuth discovery endpoints:",
  "- Protected Resource Metadata: `https://smartaihub.app/.well-known/oauth-protected-resource`",
  "- Authorization Server Metadata: `https://smartaihub.app/.well-known/oauth-authorization-server`",
  "- Product discovery manifest: `https://smartaihub.app/.well-known/mcp.json`",
  "- Static MCP catalog: `https://smartaihub.app/v1/mcp/catalog`",
  "",
  "### MCP protocol surface",
  "",
  "The current MCP server supports `server/discover`, `initialize`, `ping`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, and legacy session termination with `DELETE /v1/mcp`. Modern protocol version is `2026-07-28`; legacy versions `2025-11-25` and `2025-03-26` remain available for compatibility.",
  "",
  "`tools/list` is principal-scoped. The actual list depends on the authenticated tenant, user, device, OAuth scopes, feature flags, ACL, and runtime availability. Do not hard-code tool counts or assume that every registry tool is available to every connection.",
  "",
  "Current tool families include SmartAIHub gateway/chat, knowledge/library/RAG, skills, agencies, media generation/history/download, presentations, video projects, Hermes, Remotion, jobs, workspace, drive, orchestration, browser automation, and Marketplace Intelligence. Use `tools/list` for the exact canonical `smartspec.*` names and schemas for the current principal.",
  "",
  "`tasks`, `subscriptions`, resource subscriptions, and `tools/listChanged` are not generally enabled. MCP resources are documentation resources; user files in Library, R2, and Media History must be accessed through ACL-checked tools and short-lived download references.",
  "",
  "### MCP & Devices readiness and per-device permissions",
  "",
  "Settings → **MCP & Devices** is the operational source of truth for the current signed-in tenant. The readiness panel checks the Protected Resource Metadata URL, Authorization Server URL, and JWKS URL, shows their latest HTTP status, and shows the tenant gates for Modern MCP, MCP resources, PRM, OAuth Authorization Server, and the dedicated Remotion Executor. Runtime cards show the published native Windows x64, macOS arm64, and macOS x64 packs; a pack is usable only when its manifest is available and the local executor passes `doctor`.",
  "",
  "Each approved OAuth or Hermes pairing device has two permission sets: **Granted** is the upper bound approved by OAuth/pairing; **Effective now** is the subset allowed by the per-device policy. Existing devices default to allow all granted scopes. An owner can uncheck scopes in the device card and save; the server enforces the reduced set immediately at every MCP request, including `server/discover`, `tools/list`, `tools/call`, `resources/list`, and `resources/read`. The policy is device-specific, cannot add scopes, does not alter another device, and does not revoke the OAuth grant. Use **Allow all approved** to restore the default, or **Revoke** / **Revoke all MCP connections** to terminate credentials entirely.",
  "",
  "The device card also shows tenant/workspace, verified OAuth client origin, client ID, token expiry, worker linkage, worker status/runtime version/last seen when available, and the granted/effective scope names with human-readable descriptions. No access token, refresh token, worker credential, or private signing key is displayed.",
  "",
  "### Scopes and security",
  "",
  "Common scopes are `mcp:read`, `mcp:write`, `llm:chat`, `media:read`, `media:generate`, `media:download`, `library:search`, `library:read`, `library:download`, `library:upload`, `remotion:submit`, `remotion:read`, `remotion:cancel`, and Hermes connection/generation scopes. The server re-checks tenant, user, device, file, and job permissions for every call; OAuth scope does not bypass ACL.",
  "",
  "Some registry families also have specialized required scopes such as RAG, Skills, Agencies, Presentations, Video Projects, and Jobs. A tool that is absent from `tools/list` is not available to that connection. Do not broaden access with `mcp:write` just to make a hidden tool appear.",
  "",
  "### Worker credentials versus MCP credentials",
  "",
  "The **Worker bootstrap key** is a compatibility/control-plane credential. It is used only to register a native worker and obtain worker-bound execution, upload, and refresh tokens for registration, heartbeat, job claim/report, diagnostics, and machine-bound execution. It is not an MCP credential and must never be copied into an MCP client or an `Authorization` header for `/v1/mcp`.",
  "",
  "The **MCP & Connected Devices** flow is the primary connection for Hermes One, Hermes CLI/Agent, Claude Code, Codex, and other MCP-capable clients. Use OAuth/device approval with `https://smartaihub.app/v1/mcp`; on a machine without a browser, use a dedicated MCP CLI key created under **Settings → API Keys**, never a Worker bootstrap key.",
  "",
  "Worker/runtime connection guidance:",
  "- **Hermes:** MCP OAuth/device for tools; keep Worker bootstrap only if the Hermes runtime also registers and leases worker jobs.",
  "- **OpenClaw, ZeroClaw Desktop, NemoClaw, HiClaw:** use MCP OAuth or a dedicated MCP CLI key only when that build exposes a remote Streamable HTTP MCP client. If it exposes only worker registration, use the Worker bootstrap flow for control-plane operations and do not treat it as an MCP connection.",
  "- **Remotion Executor:** MCP is used to submit/read/cancel permitted jobs. Local rendering uses the separate signed Windows/macOS Remotion Executor pack and device-bound `connect`/`start` flow; its credential is separate from MCP.",
  "",
  "Quota ownership is also separate: MCP CLI keys have configurable 5-hour, daily, and 7-day credit budgets under Settings → API Keys; OAuth/device MCP sessions use the signed-in user/tenant policy; Worker bootstrap quotas remain worker control-plane budgets and are configured on the Worker bootstrap page. Do not move a token between these credential classes.",
  "",
  "### Remotion rendering",
  "",
  "MCP submits and monitors Remotion work; rendering on a user's Windows 11 or macOS machine is performed by the separate Remotion Executor. It uses a separate device-bound credential and uploads artifacts through the server's checksum-verified HTTPS flow.",
  "",
  "```text",
  "smartaihub-remotion-executor doctor",
  "smartaihub-remotion-executor setup",
  "smartaihub-remotion-executor connect",
  "smartaihub-remotion-executor start",
  "smartaihub-remotion-executor status",
  "smartaihub-remotion-executor logout",
  "```",
  "",
  "The standalone executor does not require building the Tauri Worker App or Xcode on macOS. Revoke MCP OAuth connections and Remotion Executor devices separately from Connected Devices.",
  "",
  "### Hermes chat warning",
  "",
  "`API Server Key not set — chat will fail` is a Hermes provider-chat credential warning, not an MCP OAuth error. MCP does not automatically change Hermes' chat provider. Use `smartspec.gateway.*` tools for SmartAIHub gateway chat, or configure Hermes' provider separately.",
  "",
  "### Common problems",
  "",
  "- **OAuth not ready / metadata 404:** MCP/OAuth runtime settings are not enabled/saved or the deployment is stale. Ask the administrator to run the readiness check; do not switch to a copied token.",
  "- **Hermes `Invalid registration response` or an HTML response:** the client-registration endpoint was unavailable or dynamic registration was disabled while Hermes was trying to register. Confirm the authorization metadata contains `registration_endpoint: https://smartaihub.app/oauth/register`, then retry after saving the recommended profile and restarting the MCP connection.",
  "- **401 after approval:** confirm the client uses `/v1/mcp`, refreshed its OAuth token, and is not using credentials from another account or client.",
  "- **Tools are missing:** check granted scopes, tenant/workspace, feature flags, object ACL, and runtime readiness. `tools/list` is authoritative for that connection.",
  "- **Remotion unavailable:** MCP login does not install/start the local executor. Check `GET /api/workers/runtime-pack/manifest?runtimeId=...`; if it returns `runtime_pack_not_published`, the signed native pack has not been promoted for that platform. After publication, download/extract the matching pack, run its platform installer from `runtime-pack/executor/packaging`, then run doctor/connect/start.",
  "",
  "### Compatibility",
  "",
  "The canonical integration is `/v1/mcp` with OAuth/PKCE. Legacy REST/API-key authentication, legacy MCP sessions, and pairing remain compatibility fallbacks while telemetry measures endpoint, client, and version usage. Do not remove legacy paths until migration evidence supports deprecation.",
].join("\n");

// ---------------------------------------------------------------------------
// buildOpenApiSpec
// ---------------------------------------------------------------------------

export function buildOpenApiSpec() {
  return {
    openapi: "3.0.3",
    info: {
      title: "SmartAIHub Public API",
      version: "1.0.0",
      description: [
        "Programmatic access to SmartAIHub skills, agencies, media generation, presentations, and automation.",
        "",
        mcpGuideDescription,
        "",
        "## Public REST/OpenAPI authentication",
        "All Public REST/OpenAPI operations documented below require an API key unless their operation explicitly says otherwise. The `/v1/mcp` JSON-RPC endpoint is a separate integration: use OAuth/PKCE as described in the SmartAIHub MCP guide above, not a REST API key.",
        "Two equivalent methods are accepted:",
        "",
        "| Method | Header | Example |",
        "|--------|--------|---------|",
        "| Bearer token | `Authorization: Bearer sk-ssp_...` | Standard OAuth2 / OpenAPI |",
        "| API key header | `X-Api-Key: sk-ssp_...` | n8n, Zapier, Make, gateways |",
        "",
        "Create personal keys at **Settings → API Keys**. Admin Infrastructure settings only control the MCP server runtime; they never expose a user's key.",
        "",
        "## OpenAPI Gateway / Agent Integration",
        "Point your gateway or agent (n8n, Zapier, Make, LangChain, OpenAI Custom GPT, etc.) to:",
        "- **Spec URL**: `https://smartaihub.app/v1/openapi.json`",
        "- **Auth**: `X-Api-Key: sk-ssp_<your_key>` or `Authorization: Bearer sk-ssp_<your_key>`",
        "",
        "## Claw Runtime HTTP Gateway Profile",
        "The Claw-compatible HTTP gateway contract currently includes:",
        "- `POST /v1/chat/completions`",
        "- `POST /v1/responses`",
        "- `GET /v1/models`",
        "- `GET /v1/credits`",
        "- `POST /v1/knowledge/library/search`",
        "- `POST /v1/knowledge/library/upload`",
        "- `POST /v1/knowledge/rag/search`",
        "- `POST /v1/knowledge/rag/ingest`",
        "- `GET /v1/events` for SSE observation",
        "",
        "Use tenant-bound API keys or equivalent bearer API-key auth for external runtimes.",
        "SmartSpec-managed internal tokens may call these routes with additional internal headers, but that is not the public integration profile.",
        "Delegated personal workers should treat `/v1/openapi.json` as the static HTTP contract, `/v1/mcp/catalog` as the static MCP catalog, and their delegated manifest as the per-job runtime truth.",
        "Delegated worker MCP is available only when the delegated manifest reports MCP as ready and the granted MCP namespaces include the requested tool family.",
        "Embeddings are **not** supported on the public Claw gateway in this phase, so `/v1/embeddings` is intentionally absent from this spec.",
        "",
        "## SDK Generation",
        "```",
        "npx @openapitools/openapi-generator-cli generate \\",
        "  -i https://smartaihub.app/v1/openapi.json \\",
        "  -g typescript-fetch -o ./smartspec-sdk",
        "```",
      ].join("\n"),
    },
    externalDocs: {
      description: "SmartAIHub Developer Guide",
      url: "https://smartaihub.app/v1/docs",
    },
    servers: [{ url: "https://smartaihub.app", description: "Production" }],
    security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "API key in sk-ssp_ format passed as Bearer token. `Authorization: Bearer sk-ssp_...`",
        },
        apiKeyHeader: {
          type: "apiKey",
          in: "header",
          name: "X-Api-Key",
          description:
            "API key in sk-ssp_ format passed as X-Api-Key header. Compatible with n8n, Zapier, Make, and most OpenAPI gateways.",
        },
      },
      headers: commonHeaders,
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message", "type"],
              properties: {
                code: {
                  type: "string",
                  example: "invalid_request",
                  description: "Machine-readable error code",
                },
                message: {
                  type: "string",
                  example: "prompt is required",
                  description: "Human-readable error description",
                },
                type: {
                  type: "string",
                  enum: [
                    "invalid_request_error",
                    "authentication_error",
                    "billing_error",
                    "rate_limit_error",
                    "not_found_error",
                    "internal_error",
                    "feature_disabled_error",
                  ],
                },
              },
            },
          },
        },
        Pagination: {
          type: "object",
          properties: {
            page: { type: "integer", example: 1 },
            limit: { type: "integer", example: 20 },
            total: { type: "integer", example: 42 },
            has_more: { type: "boolean", example: true },
          },
        },
        SkillSummary: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            category: { type: "string" },
            version: { type: "string" },
            enabled: { type: "boolean" },
          },
        },
        SkillDetail: {
          allOf: [
            { $ref: "#/components/schemas/SkillSummary" },
            {
              type: "object",
              properties: {
                input_schema: {
                  type: "object",
                  description: "JSON Schema for skill inputs",
                },
                credit_multiplier: { type: "number" },
                tags: { type: "array", items: { type: "string" } },
              },
            },
          ],
        },
        AgencySummary: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            status: { type: "string", enum: ["active", "inactive"] },
            created_at: { type: "string", format: "date-time" },
          },
        },
        JobStatus: {
          type: "object",
          properties: {
            job_id: { type: "string" },
            status: {
              type: "string",
              enum: ["pending", "running", "completed", "failed", "cancelled"],
            },
            progress_pct: { type: "integer", minimum: 0, maximum: 100 },
            result: { type: "object", nullable: true },
            error: { type: "string", nullable: true },
            created_at: { type: "string", format: "date-time" },
            completed_at: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
          },
        },
        WebhookEndpoint: {
          type: "object",
          properties: {
            id: { type: "string" },
            url: { type: "string", format: "uri" },
            events: { type: "array", items: { type: "string" } },
            retry_policy: { type: "string", enum: ["none", "exponential"] },
            is_active: { type: "boolean" },
            failure_count: { type: "integer" },
            last_delivered_at: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
            created_at: { type: "string", format: "date-time" },
          },
        },
        MediaTask: {
          type: "object",
          properties: {
            task_id: { type: "string" },
            status: {
              type: "string",
              enum: ["pending", "processing", "completed", "failed"],
            },
            progress_pct: { type: "integer", minimum: 0, maximum: 100 },
            result_url: { type: "string", format: "uri", nullable: true },
            credits_used: { type: "integer", nullable: true },
            created_at: { type: "string", format: "date-time" },
            completed_at: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
          },
        },
      },
    },
    paths: {
      // -----------------------------------------------------------------------
      // Skills
      // -----------------------------------------------------------------------
      "/v1/skills": {
        get: {
          operationId: "listSkills",
          tags: ["Skills"],
          summary: "List available skills",
          description:
            "Returns all skills accessible to this API key. Requires scope: `skills:read`.",
          parameters: [
            {
              name: "category",
              in: "query",
              schema: { type: "string" },
              description: "Filter by skill category",
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 50 },
            },
            {
              name: "offset",
              in: "query",
              schema: { type: "integer", default: 0 },
            },
          ],
          responses: {
            "200": {
              description: "Skill list",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      skills: {
                        type: "array",
                        items: { $ref: "#/components/schemas/SkillSummary" },
                      },
                      pagination: { $ref: "#/components/schemas/Pagination" },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/skills/{skillId}": {
        get: {
          operationId: "getSkill",
          tags: ["Skills"],
          summary: "Get skill details",
          description:
            "Returns full skill details including input schema. Requires scope: `skills:read`.",
          parameters: [
            {
              name: "skillId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Skill details",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SkillDetail" },
                },
              },
            },
            "404": errorResponse("Skill not found"),
            ...commonErrorResponses,
          },
        },
      },
      "/v1/skills/{skillId}/execute": {
        post: {
          operationId: "executeSkill",
          tags: ["Skills"],
          summary: "Execute a skill",
          description:
            "Runs a skill with provided inputs. Returns the LLM output. Requires scope: `skills:execute`.",
          parameters: [
            {
              name: "skillId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["inputs"],
                  properties: {
                    inputs: {
                      type: "object",
                      description:
                        "Skill-specific inputs per the skill's input schema",
                    },
                    model: {
                      type: "string",
                      description: "Override LLM model (optional)",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Skill execution result",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      output: { type: "string" },
                      credits_used: { type: "integer" },
                      model_used: { type: "string" },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/skills/detect": {
        post: {
          operationId: "detectSkill",
          tags: ["Skills"],
          summary: "Detect skill from natural language",
          description:
            "Determines which skill best matches user intent. Requires scope: `skills:read`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["message"],
                  properties: {
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Detected skill",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      skill_id: { type: "string", nullable: true },
                      confidence: { type: "number" },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      // -----------------------------------------------------------------------
      // Agencies
      // -----------------------------------------------------------------------
      "/v1/agencies": {
        get: {
          operationId: "listAgencies",
          tags: ["Agencies"],
          summary: "List agencies",
          description:
            "Returns active agencies for the tenant. Requires scope: `agencies:list`.",
          responses: {
            "200": {
              description: "Agency list",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      agencies: {
                        type: "array",
                        items: { $ref: "#/components/schemas/AgencySummary" },
                      },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/agencies/{agencyId}/invoke": {
        post: {
          operationId: "invokeAgency",
          tags: ["Agencies"],
          summary: "Invoke an agency",
          description:
            "Starts an asynchronous agency run. Returns a run ID. Requires scope: `agencies:invoke`.",
          parameters: [
            {
              name: "agencyId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["message"],
                  properties: {
                    message: { type: "string" },
                    context: { type: "object", nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            "202": {
              description: "Agency run started",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      run_id: { type: "string" },
                      status: { type: "string", example: "pending" },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/agencies/{agencyId}/runs/{runId}": {
        get: {
          operationId: "getAgencyRun",
          tags: ["Agencies"],
          summary: "Get agency run status",
          description:
            "Returns current status and result for a run. Requires scope: `agencies:list`.",
          parameters: [
            {
              name: "agencyId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "runId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Run status",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobStatus" },
                },
              },
            },
            "404": errorResponse("Run not found"),
            ...commonErrorResponses,
          },
        },
      },
      "/v1/agencies/{agencyId}/runs/{runId}/stream": {
        get: {
          operationId: "streamAgencyRun",
          tags: ["Agencies"],
          summary: "Stream agency run events",
          description:
            "Server-Sent Events stream for a run. Connect with `Accept: text/event-stream`. Requires scope: `agencies:list`.",
          parameters: [
            {
              name: "agencyId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "runId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "SSE stream",
              content: {
                "text/event-stream": {
                  schema: { type: "string" },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      // -----------------------------------------------------------------------
      // Presentations
      // -----------------------------------------------------------------------
      "/v1/presentations/generate": {
        post: {
          operationId: "generatePresentation",
          tags: ["Presentations"],
          summary: "Generate a presentation",
          description:
            "Starts async AI presentation generation. Requires scope: `presentations:generate`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["topic"],
                  properties: {
                    topic: { type: "string" },
                    slide_count: { type: "integer", minimum: 2, maximum: 50 },
                    style: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "202": {
              description: "Generation started",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      task_id: { type: "string" },
                      status: { type: "string", example: "pending" },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/presentations/tasks/{taskId}/progress": {
        get: {
          operationId: "getPresentationProgress",
          tags: ["Presentations"],
          summary: "Get presentation generation progress",
          description:
            "Polls generation task status. Requires scope: `presentations:read`.",
          parameters: [
            {
              name: "taskId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Task progress",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobStatus" },
                },
              },
            },
            "404": errorResponse("Task not found"),
            ...commonErrorResponses,
          },
        },
      },
      "/v1/presentations/decks/{deckId}": {
        get: {
          operationId: "getPresentation",
          tags: ["Presentations"],
          summary: "Get presentation deck",
          description:
            "Returns presentation data. Requires scope: `presentations:read`.",
          parameters: [
            {
              name: "deckId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Presentation deck",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      title: { type: "string" },
                      slides: { type: "array", items: { type: "object" } },
                    },
                  },
                },
              },
            },
            "404": errorResponse("Deck not found"),
            ...commonErrorResponses,
          },
        },
      },
      "/v1/presentations/decks/{deckId}/export": {
        post: {
          operationId: "exportPresentation",
          tags: ["Presentations"],
          summary: "Export presentation to file",
          description:
            "Starts async export to PDF/PPTX. Requires scope: `presentations:export`.",
          parameters: [
            {
              name: "deckId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    format: {
                      type: "string",
                      enum: ["pdf", "pptx"],
                      default: "pdf",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "202": {
              description: "Export started",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { task_id: { type: "string" } },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/presentations/decks/{deckId}/export/download": {
        get: {
          operationId: "downloadPresentation",
          tags: ["Presentations"],
          summary: "Download exported presentation",
          description:
            "Returns binary file for completed export. Requires scope: `presentations:export`.",
          parameters: [
            {
              name: "deckId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "File download",
              content: {
                "application/pdf": {
                  schema: { type: "string", format: "binary" },
                },
                "application/vnd.openxmlformats-officedocument.presentationml.presentation":
                  {
                    schema: { type: "string", format: "binary" },
                  },
              },
            },
            "404": errorResponse("Export not ready"),
            ...commonErrorResponses,
          },
        },
      },
      // -----------------------------------------------------------------------
      // Video Projects
      // -----------------------------------------------------------------------
      "/v1/video-projects": {
        post: {
          operationId: "createVideoProject",
          tags: ["Video Projects"],
          summary: "Create a video project",
          description:
            "Queues a video generation task. Requires scope: `media:generate`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["prompt"],
                  properties: {
                    prompt: { type: "string" },
                    duration_seconds: {
                      type: "integer",
                      minimum: 1,
                      maximum: 300,
                    },
                    model: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "202": {
              description: "Project created",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MediaTask" },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/video-projects/{id}": {
        get: {
          operationId: "getVideoProject",
          tags: ["Video Projects"],
          summary: "Get video project status",
          description: "Requires scope: `media:generate`.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Project status",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MediaTask" },
                },
              },
            },
            "404": errorResponse("Project not found"),
            ...commonErrorResponses,
          },
        },
      },
      "/v1/video-projects/{id}/export/download": {
        get: {
          operationId: "downloadVideoProject",
          tags: ["Video Projects"],
          summary: "Download completed video",
          description: "Requires scope: `media:generate`.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Video file",
              content: {
                "video/mp4": { schema: { type: "string", format: "binary" } },
              },
            },
            "404": errorResponse("Video not ready"),
            ...commonErrorResponses,
          },
        },
      },
      // -----------------------------------------------------------------------
      // Media
      // -----------------------------------------------------------------------
      "/v1/media/images/generate": {
        post: {
          operationId: "generateImage",
          tags: ["Media"],
          summary: "Generate an image",
          description:
            "Submits an async image generation task. Requires scope: `media:generate`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["prompt"],
                  properties: {
                    prompt: { type: "string" },
                    model: { type: "string" },
                    width: { type: "integer" },
                    height: { type: "integer" },
                    reference_image_urls: {
                      type: "array",
                      items: { type: "string", format: "uri" },
                      maxItems: 5,
                    },
                  },
                },
              },
            },
          },
          responses: {
            "202": {
              description: "Task queued",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MediaTask" },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/media/videos/generate": {
        post: {
          operationId: "generateVideo",
          tags: ["Media"],
          summary: "Generate a video",
          description: "Requires scope: `media:generate`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["prompt"],
                  properties: {
                    prompt: { type: "string" },
                    model: { type: "string" },
                    duration_seconds: { type: "integer" },
                  },
                },
              },
            },
          },
          responses: {
            "202": {
              description: "Task queued",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MediaTask" },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/media/audio/generate": {
        post: {
          operationId: "generateAudio",
          tags: ["Media"],
          summary: "Generate audio via TTS",
          description: "Requires scope: `media:generate`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["text"],
                  properties: {
                    text: { type: "string" },
                    voice: { type: "string" },
                    model: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "202": {
              description: "Task queued",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MediaTask" },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/media/{taskId}/status": {
        get: {
          operationId: "getMediaTaskStatus",
          tags: ["Media"],
          summary: "Get media task status",
          description:
            "Polls task progress and retrieves result URL when complete. Requires scope: `media:generate`.",
          parameters: [
            {
              name: "taskId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Task status",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MediaTask" },
                },
              },
            },
            "404": errorResponse("Task not found"),
            ...commonErrorResponses,
          },
        },
      },
      // -----------------------------------------------------------------------
      // LLM Gateway
      // -----------------------------------------------------------------------
      "/v1/chat/completions": {
        post: {
          operationId: "gatewayChatCompletions",
          tags: ["Gateway"],
          summary: "OpenAI-compatible chat completions gateway",
          description: [
            "Primary chat-completions route for external runtimes and OpenAI-compatible clients.",
            "Authenticate with a tenant-bound API key via `X-Api-Key` or `Authorization: Bearer sk-ssp_...`.",
            "Supports streaming with `stream: true`.",
          ].join(" "),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["model", "messages"],
                  properties: {
                    model: { type: "string", example: "gpt-5.4" },
                    messages: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["role", "content"],
                        properties: {
                          role: {
                            type: "string",
                            enum: ["system", "user", "assistant", "tool"],
                          },
                          content: {
                            oneOf: [
                              { type: "string" },
                              { type: "array" },
                              { type: "object" },
                            ],
                          },
                        },
                      },
                    },
                    stream: { type: "boolean", default: false },
                    temperature: { type: "number" },
                    max_tokens: { type: "integer" },
                    tools: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Chat completion response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      object: { type: "string", example: "chat.completion" },
                      model: { type: "string" },
                      choices: { type: "array", items: { type: "object" } },
                      usage: { type: "object" },
                    },
                  },
                },
                "text/event-stream": {
                  schema: {
                    type: "string",
                    description:
                      "Streaming chat completion events when `stream: true`.",
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/responses": {
        post: {
          operationId: "gatewayResponses",
          tags: ["Gateway"],
          summary: "OpenAI-compatible responses gateway",
          description: [
            "Responses-family route for models and tool loops that use the OpenAI Responses API surface.",
            "External callers must authenticate with a tenant-bound API key or equivalent bearer API-key auth.",
            "Internal SmartSpec-managed callers may additionally supply `X-Tenant-Id` when using internal service auth.",
          ].join(" "),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["model", "input"],
                  properties: {
                    model: { type: "string", example: "gpt-5.4" },
                    input: {
                      oneOf: [
                        { type: "string" },
                        { type: "array" },
                        { type: "object" },
                      ],
                    },
                    stream: { type: "boolean", default: false },
                    instructions: { type: "string" },
                    tools: { type: "array", items: { type: "object" } },
                    tool_choice: {
                      oneOf: [{ type: "string" }, { type: "object" }],
                    },
                    max_output_tokens: { type: "integer" },
                    temperature: { type: "number" },
                    metadata: { type: "object" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Responses API result",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      object: { type: "string", example: "response" },
                      model: { type: "string" },
                      output: { type: "array", items: { type: "object" } },
                      usage: { type: "object" },
                    },
                  },
                },
                "text/event-stream": {
                  schema: {
                    type: "string",
                    description:
                      "Streaming response events when `stream: true`.",
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/models": {
        get: {
          operationId: "gatewayModels",
          tags: ["Gateway"],
          summary: "List gateway-available models",
          description:
            "Returns models currently available through the public HTTP LLM gateway.",
          responses: {
            "200": {
              description: "Gateway model catalog",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      object: { type: "string", example: "list" },
                      data: { type: "array", items: { type: "object" } },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/credits": {
        get: {
          operationId: "gatewayCredits",
          tags: ["Gateway"],
          summary: "Get current credit balance",
          description:
            "Returns the current credit balance visible to the authenticated tenant/user context.",
          responses: {
            "200": {
              description: "Credit balance",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      credits: { type: "integer" },
                      plan: { type: "string", nullable: true },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      // -----------------------------------------------------------------------
      // Knowledge
      // -----------------------------------------------------------------------
      "/v1/knowledge/library/search": {
        post: {
          operationId: "searchOwnerLibrary",
          tags: ["Knowledge"],
          summary: "Search the authenticated user's library",
          description:
            "Searches the caller's own library scope. Requires scope: `library:search`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    query: { type: "string" },
                    limit: { type: "integer", minimum: 1, maximum: 50 },
                    offset: { type: "integer", minimum: 0 },
                    itemType: { type: "string" },
                    folderId: { type: "integer", nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Library search results",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      results: { type: "array", items: { type: "object" } },
                      total: { type: "integer" },
                      limit: { type: "integer" },
                      offset: { type: "integer" },
                      has_more: { type: "boolean" },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/knowledge/library/upload": {
        post: {
          operationId: "uploadOwnerLibraryFile",
          tags: ["Knowledge"],
          summary: "Upload a file into the authenticated user's library",
          description:
            "Uploads an allowed file type into the caller's own library scope. Requires scope: `library:upload`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["fileName", "fileType", "fileBase64"],
                  properties: {
                    fileName: { type: "string" },
                    fileType: { type: "string" },
                    fileBase64: {
                      type: "string",
                      description: "Base64-encoded file contents",
                    },
                    title: { type: "string" },
                    visibility: {
                      type: "string",
                      enum: ["private", "team", "public"],
                    },
                    parentId: { type: "integer", nullable: true },
                    metadata: { type: "object", additionalProperties: true },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Library item created",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      item: { type: "object" },
                      storageKey: { type: "string" },
                      indexJob: { type: "object", nullable: true },
                      billing: { type: "object" },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/knowledge/rag/search": {
        post: {
          operationId: "searchOwnerRag",
          tags: ["Knowledge"],
          summary:
            "Run a RAG-style semantic search on the authenticated user's knowledge",
          description:
            "Searches the caller's own indexed knowledge scope. Requires scope: `rag:search`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["query"],
                  properties: {
                    query: { type: "string" },
                    limit: { type: "integer", minimum: 1, maximum: 20 },
                    offset: { type: "integer", minimum: 0 },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "RAG search results",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      query: { type: "string" },
                      results: { type: "array", items: { type: "object" } },
                      credits_used: { type: "integer" },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/knowledge/rag/ingest": {
        post: {
          operationId: "ingestOwnerKnowledge",
          tags: ["Knowledge"],
          summary: "Ingest owner content into indexed knowledge",
          description:
            "Either upload a new owner-scoped file for indexing or re-enqueue indexing for an existing owner library item. Requires scope: `rag:ingest`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    {
                      type: "object",
                      required: [
                        "sourceType",
                        "fileName",
                        "fileType",
                        "fileBase64",
                      ],
                      properties: {
                        sourceType: { type: "string", enum: ["upload"] },
                        fileName: { type: "string" },
                        fileType: { type: "string" },
                        fileBase64: {
                          type: "string",
                          description: "Base64-encoded file contents",
                        },
                        title: { type: "string" },
                        visibility: {
                          type: "string",
                          enum: ["private", "team", "public"],
                        },
                        parentId: { type: "integer", nullable: true },
                        metadata: {
                          type: "object",
                          additionalProperties: true,
                        },
                      },
                    },
                    {
                      type: "object",
                      required: ["sourceType", "libraryItemId"],
                      properties: {
                        sourceType: { type: "string", enum: ["library_item"] },
                        libraryItemId: { type: "integer" },
                      },
                    },
                  ],
                },
              },
            },
          },
          responses: {
            "201": {
              description: "File uploaded and queued for indexing",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      source_type: { type: "string", enum: ["upload"] },
                      ingest_target: { type: "string", enum: ["rag"] },
                      item: { type: "object" },
                      storageKey: { type: "string" },
                      indexJob: { type: "object", nullable: true },
                      billing: { type: "object" },
                    },
                  },
                },
              },
            },
            "202": {
              description: "Existing library item queued for re-indexing",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      source_type: { type: "string", enum: ["library_item"] },
                      ingest_target: { type: "string", enum: ["rag"] },
                      item: { type: "object" },
                      indexJob: { type: "object", nullable: true },
                      credits_used: { type: "integer" },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      // -----------------------------------------------------------------------
      // MCP
      // -----------------------------------------------------------------------
      "/v1/mcp": {
        post: {
          operationId: "mcpEndpoint",
          tags: ["MCP"],
          summary: "MCP protocol endpoint",
          description:
            "Handles Model Context Protocol tool calls. Requires scope: `mcp:read`. Delegated personal workers may use this endpoint only when their delegated manifest reports MCP as ready and the job grants the requested MCP namespaces.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["jsonrpc", "method"],
                  properties: {
                    jsonrpc: { type: "string", example: "2.0" },
                    id: { type: "string" },
                    method: { type: "string", example: "tools/list" },
                    params: { type: "object" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "MCP response",
              content: {
                "application/json": {
                  schema: { type: "object" },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/mcp/catalog": {
        get: {
          operationId: "getMcpCatalog",
          tags: ["MCP"],
          summary: "Read the static MCP tool catalog",
          description:
            "Returns the canonical SmartAIHub MCP tool catalog, including tool families, idempotency expectations, and execution modes. Use this for static discovery guidance; delegated workers must still honor their per-job delegated manifest.",
          responses: {
            "200": {
              description: "Static MCP catalog",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      version: { type: "string" },
                      canonicalEndpoint: { type: "string" },
                      capabilities: { type: "object" },
                      families: { type: "array", items: { type: "object" } },
                      tools: { type: "array", items: { type: "object" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      // -----------------------------------------------------------------------
      // Jobs
      // -----------------------------------------------------------------------
      "/v1/jobs": {
        post: {
          operationId: "createJob",
          tags: ["Jobs"],
          summary: "Create an automation job",
          description:
            "Queues a background automation job. Requires scope: `jobs:create`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["type", "payload"],
                  properties: {
                    type: {
                      type: "string",
                      description: "Job type identifier",
                    },
                    payload: { type: "object" },
                    schedule_at: {
                      type: "string",
                      format: "date-time",
                      nullable: true,
                    },
                  },
                },
              },
            },
          },
          responses: {
            "202": {
              description: "Job queued",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobStatus" },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
        get: {
          operationId: "listJobs",
          tags: ["Jobs"],
          summary: "List automation jobs",
          description:
            "Returns jobs for the current tenant. Requires scope: `jobs:read`.",
          parameters: [
            { name: "status", in: "query", schema: { type: "string" } },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 20 },
            },
            {
              name: "offset",
              in: "query",
              schema: { type: "integer", default: 0 },
            },
          ],
          responses: {
            "200": {
              description: "Job list",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      jobs: {
                        type: "array",
                        items: { $ref: "#/components/schemas/JobStatus" },
                      },
                      pagination: { $ref: "#/components/schemas/Pagination" },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/jobs/{jobId}": {
        get: {
          operationId: "getJob",
          tags: ["Jobs"],
          summary: "Get job details",
          description: "Requires scope: `jobs:read`.",
          parameters: [
            {
              name: "jobId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Job details",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobStatus" },
                },
              },
            },
            "404": errorResponse("Job not found"),
            ...commonErrorResponses,
          },
        },
        delete: {
          operationId: "cancelJob",
          tags: ["Jobs"],
          summary: "Cancel or delete a job",
          description:
            "Cancels a pending job or deletes a completed one. Requires scope: `jobs:create`.",
          parameters: [
            {
              name: "jobId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "204": { description: "Job cancelled" },
            "404": errorResponse("Job not found"),
            ...commonErrorResponses,
          },
        },
      },
      // -----------------------------------------------------------------------
      // Webhooks
      // -----------------------------------------------------------------------
      "/v1/webhooks": {
        post: {
          operationId: "createWebhook",
          tags: ["Webhooks"],
          summary: "Register a webhook endpoint",
          description:
            "Creates a new webhook subscription. Requires scope: `webhooks:manage`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["url", "events"],
                  properties: {
                    url: {
                      type: "string",
                      format: "uri",
                      description: "HTTPS endpoint URL",
                    },
                    events: {
                      type: "array",
                      items: { type: "string" },
                      description: "Event types to subscribe to",
                    },
                    retry_policy: {
                      type: "string",
                      enum: ["none", "exponential"],
                      default: "exponential",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Webhook created",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/WebhookEndpoint" },
                      {
                        type: "object",
                        properties: {
                          secret: {
                            type: "string",
                            description: "Signing secret (shown once only)",
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
        get: {
          operationId: "listWebhooks",
          tags: ["Webhooks"],
          summary: "List webhook endpoints",
          description: "Requires scope: `webhooks:manage`.",
          responses: {
            "200": {
              description: "Webhook list",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      webhooks: {
                        type: "array",
                        items: { $ref: "#/components/schemas/WebhookEndpoint" },
                      },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/webhooks/{id}": {
        patch: {
          operationId: "updateWebhook",
          tags: ["Webhooks"],
          summary: "Update or re-enable a webhook endpoint",
          description:
            "Updates events, retry policy, or re-enables a disabled endpoint. Requires scope: `webhooks:manage`.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    events: { type: "array", items: { type: "string" } },
                    retry_policy: {
                      type: "string",
                      enum: ["none", "exponential"],
                    },
                    is_active: {
                      type: "boolean",
                      description:
                        "Set to true to re-enable a disabled endpoint",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Webhook updated",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/WebhookEndpoint" },
                },
              },
            },
            "404": errorResponse("Webhook not found"),
            ...commonErrorResponses,
          },
        },
        delete: {
          operationId: "deleteWebhook",
          tags: ["Webhooks"],
          summary: "Delete a webhook endpoint",
          description: "Requires scope: `webhooks:manage`.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "204": { description: "Webhook deleted" },
            "404": errorResponse("Webhook not found"),
            ...commonErrorResponses,
          },
        },
      },
      // -----------------------------------------------------------------------
      // Events (SSE)
      // -----------------------------------------------------------------------
      "/v1/events": {
        get: {
          operationId: "streamEvents",
          tags: ["Events"],
          summary: "Subscribe to real-time events via Server-Sent Events",
          description:
            "Connect with `Accept: text/event-stream`. Each event is a JSON payload. Requires scope: `events:read`.",
          parameters: [
            {
              name: "types",
              in: "query",
              schema: { type: "string" },
              description:
                "Comma-separated event types to filter (e.g. `job.completed,credits.low`)",
            },
          ],
          responses: {
            "200": {
              description: "SSE stream",
              content: {
                "text/event-stream": {
                  schema: {
                    type: "string",
                    description: "Server-Sent Events stream",
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerPublicDocsRoutes(app: Express): void {
  const spec = buildOpenApiSpec();

  // GET /v1/openapi.json — raw spec (unauthenticated)
  app.get("/v1/openapi.json", (_req, res) => {
    res.json(spec);
  });

  // GET /v1/docs — interactive Swagger UI (unauthenticated)
  app.use(
    "/v1/docs",
    swaggerUi.serve as any,
    swaggerUi.setup(spec, {
      customSiteTitle: "SmartAIHub API Docs",
      customCss: ".swagger-ui .topbar { display: none }",
      swaggerOptions: {
        persistAuthorization: true,
        url: "/v1/openapi.json",
      },
    }) as any
  );
}
