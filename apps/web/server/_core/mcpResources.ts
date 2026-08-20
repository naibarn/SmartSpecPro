import { createHash } from "node:crypto";
import { buildMcpClientOnboardingDescriptors } from "../../shared/mcpClientOnboarding";

export type McpDocumentationResource = {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: "text/markdown";
  revision: string;
};

type ResourceDocument = McpDocumentationResource & { text: string };

const PUBLIC_MCP_ENDPOINT = "https://smartaihub.app/v1/mcp";
const ONBOARDING = Object.fromEntries(
  buildMcpClientOnboardingDescriptors(PUBLIC_MCP_ENDPOINT).map(descriptor => [
    descriptor.client,
    descriptor,
  ])
);

const DOCUMENT_SOURCES: Array<Omit<ResourceDocument, "revision">> = [
  {
    uri: "smartaihub://docs/mcp/overview",
    name: "mcp-overview",
    title: "SmartAIHub MCP overview",
    description: "Protocol eras, authentication, and safe request boundaries.",
    mimeType: "text/markdown",
    text: [
      "# SmartAIHub MCP",
      "",
      "The canonical endpoint is https://smartaihub.app/v1/mcp.",
      "Modern requests use MCP-Protocol-Version 2026-07-28 and are stateless.",
      "Legacy clients may use initialize and Mcp-Session-Id.",
      `Hermes One: ${ONBOARDING["hermes-one"].instructions.join("; ")} The hermes://mcp/install link contains public configuration only.`,
      `Hermes CLI/Agent: ${ONBOARDING["hermes-cli"].instructions.join("; ")}`,
      "OAuth is the preferred authentication mode when the server's OAuth readiness is available. Modern Hermes configuration uses auth: oauth; do not use --auth header unless the dedicated MCP CLI key fallback is required.",
      "The administrator must save Admin → Infrastructure → MCP/OAuth and enable the tenant gates Modern MCP protocol, MCP documentation resources, OAuth Protected Resource Metadata, and MCP OAuth Authorization Server. Dynamic registration is optional and off by default.",
      "If the machine has no browser, Hermes may complete OAuth through its interactive authorize-URL/paste-back flow from another trusted device; if that is unavailable, create Settings → API Keys → Create MCP CLI Key and use Hermes --auth header only with that dedicated key; never paste an OAuth access or refresh token.",
      `Claude/Claude Code: ${ONBOARDING.claude.instructions.join("; ")}`,
      "Claude Desktop also supports Settings → Connectors → Add custom connector, then browser OAuth.",
      `Codex CLI: ${ONBOARDING.codex.instructions.join("; ")}`,
      "Claude Code and other headless HTTP clients may use Authorization: Bearer with the dedicated MCP CLI key created by the user at Settings → API Keys, stored in an OS secret/environment variable.",
      `MCP CLI keys default to ${ONBOARDING.codex.quotaPreview.fiveHourCredits} credits per 5-hour bucket, ${ONBOARDING.codex.quotaPreview.dailyCredits} per day, and ${ONBOARDING.codex.quotaPreview.weeklyCredits} per 7-day bucket; the user can change or disable each budget in Settings.`,
      "Other MCP clients should choose remote Streamable HTTP + OAuth discovery. Clients without MCP OAuth should use an explicitly supported compatibility fallback or the Public REST/OpenAPI contract, not a guessed static header.",
      "Worker bootstrap keys are not MCP credentials. They are compatibility/control-plane credentials for native worker registration, heartbeat, job lease/report, diagnostics, and machine-bound execution. Hermes, Claude Code, Codex, and MCP-capable runtimes should use MCP & Connected Devices with OAuth/device approval, or a dedicated MCP CLI key for a machine without a browser.",
      "OpenClaw, ZeroClaw Desktop, NemoClaw, and HiClaw may use /v1/mcp only when their build exposes a remote Streamable HTTP MCP client. Otherwise use the Worker bootstrap flow for control-plane operations. Remotion uses MCP for submit/status/cancel and a separate signed, device-bound Remotion Executor for local rendering.",
      "Quota ownership is separate: MCP CLI keys use configurable 5-hour, daily, and 7-day credit budgets in Settings → API Keys; OAuth/device sessions use user/tenant policy; Worker bootstrap quotas remain worker control-plane budgets.",
      "These clients share one OAuth/tenant/scope policy but must keep their own credential store and callback handling.",
      "Interactive Hermes commands should run from a normal OS terminal, not an embedded agent PTY on Windows.",
      "All tools are evaluated against the authenticated tenant, user, device, and scopes.",
    ].join("\n"),
  },
  {
    uri: "smartaihub://docs/mcp/tools",
    name: "mcp-tools",
    title: "SmartAIHub MCP tools",
    description:
      "Canonical tools, safe aliases, idempotency, and result handling.",
    mimeType: "text/markdown",
    text: [
      "# Tools",
      "",
      "Use tools/list to discover the principal-scoped catalog.",
      "Use tools/call with the listed input schema.",
      "Mutation tools may require params._meta.idempotencyKey.",
      "The smartspec.* names remain canonical; guide aliases resolve to one handler.",
    ].join("\n"),
  },
  {
    uri: "smartaihub://docs/mcp/files-and-media",
    name: "mcp-files-and-media",
    title: "Files and media access",
    description: "ACL-checked Library, R2, and Media History access.",
    mimeType: "text/markdown",
    text: [
      "# Files and media",
      "",
      "User files and media are not arbitrary MCP resources.",
      "Use the scoped Library/media-history tools to receive a short-lived download reference.",
      "The download broker re-checks tenant and user access and preserves MIME/filename metadata.",
      "Never send local paths, R2 keys, bearer tokens, or permanent URLs as authority.",
    ].join("\n"),
  },
  {
    uri: "smartaihub://docs/mcp/remotion",
    name: "mcp-remotion",
    title: "Hermes Remotion rendering",
    description:
      "Server-owned job submission and owner-scoped status/cancel behavior.",
    mimeType: "text/markdown",
    text: [
      "# Remotion",
      "",
      "Remotion jobs are submitted through the existing server worker contract.",
      "Hermes/Remotion executors claim only jobs for their tenant and approved device.",
      "Artifact checksum, publication, Media History/Library registration, and download ACLs remain server-owned.",
    ].join("\n"),
  },
];

const DOCUMENTS: ResourceDocument[] = DOCUMENT_SOURCES.map(document => ({
  ...document,
  revision: createHash("sha256")
    .update(document.text)
    .digest("hex")
    .slice(0, 16),
}));

const DOCUMENT_BY_URI = new Map(
  DOCUMENTS.map(document => [document.uri, document])
);

export function listMcpDocumentationResources() {
  return {
    resources: DOCUMENTS.map(({ text: _text, ...resource }) => resource),
    ...{ ttlMs: 60_000, cacheScope: "public" as const },
  };
}

export function readMcpDocumentationResource(uri: unknown) {
  if (typeof uri !== "string" || uri.length === 0 || uri.length > 256) {
    throw Object.assign(new Error("Invalid resource URI"), { code: -32602 });
  }
  if (
    /%2f|%2e|%5c/i.test(uri) ||
    uri.includes("..") ||
    !uri.startsWith("smartaihub://docs/mcp/")
  ) {
    throw Object.assign(new Error("Resource URI is not allowed"), {
      code: -32602,
    });
  }
  const document = DOCUMENT_BY_URI.get(uri);
  if (!document) {
    throw Object.assign(new Error("Resource not found"), { code: -32002 });
  }
  return {
    contents: [
      {
        uri: document.uri,
        mimeType: document.mimeType,
        text: document.text,
      },
    ],
    revision: document.revision,
    ...{ ttlMs: 60_000, cacheScope: "public" as const },
  };
}
