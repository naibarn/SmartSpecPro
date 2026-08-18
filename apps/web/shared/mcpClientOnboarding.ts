import {
  MCP_CLI_DEFAULT_CREDIT_QUOTAS,
  MCP_CLI_DEFAULT_SCOPES,
  type ApiScope,
} from "./publicApiTypes";

/**
 * Public onboarding contract shared by Settings, `/v1/docs`, and MCP
 * documentation resources. Keep this data free of credentials and local
 * paths: it is safe to expose to an unauthenticated client during discovery.
 */
export const MCP_ONBOARDING_DESCRIPTOR_VERSION = "2026-08-18.1" as const;

export type SupportedMcpClient =
  | "hermes-one"
  | "hermes-cli"
  | "claude"
  | "codex"
  | "generic";
export type McpClientAuthMode = "oauth" | "device-code" | "api-key";

export type McpClientOnboardingDescriptor = {
  version: typeof MCP_ONBOARDING_DESCRIPTOR_VERSION;
  client: SupportedMcpClient;
  endpoint: string;
  transport: "streamable-http";
  authModes: readonly McpClientAuthMode[];
  requiredScopes: readonly ApiScope[];
  browserlessFallback: "device-code-or-api-key";
  quotaPreview: {
    fiveHourCredits: number;
    dailyCredits: number;
    weeklyCredits: number;
  };
  instructions: readonly string[];
};

const DEFAULT_ENDPOINT = "https://smartaihub.app/v1/mcp";

/**
 * Only public MCP endpoint data may cross into an onboarding descriptor.
 * Reject credentials, query strings, fragments, and non-HTTPS origins. HTTP
 * is deliberately allowed for loopback development only.
 */
export function normalizePublicMcpEndpoint(rawEndpoint: string): string {
  const value = rawEndpoint.trim();
  if (!value || value.length > 2048) {
    throw new Error("MCP endpoint is required");
  }
  const url = new URL(value);
  const isLoopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
    throw new Error("MCP endpoint must use HTTPS");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      "MCP endpoint must not contain credentials or request data"
    );
  }
  return url.toString().replace(/\/$/, "");
}

function instructionsFor(
  client: SupportedMcpClient,
  endpoint: string
): readonly string[] {
  switch (client) {
    case "hermes-one":
      return [
        "Open Hermes One MCP settings and add the public endpoint.",
        "Choose OAuth; the browser opens SmartAIHub login and consent.",
        "Return to Hermes One and run tools/list to verify the connection.",
      ];
    case "hermes-cli":
      return [
        `hermes mcp add smartaihub --url ${endpoint} --auth oauth`,
        "hermes mcp login smartaihub",
        "hermes mcp test smartaihub",
      ];
    case "claude":
      return [
        `claude mcp add --transport http smartaihub ${endpoint}`,
        "Complete the browser OAuth prompt when Claude opens it.",
        "claude mcp list",
      ];
    case "codex":
      return [
        `codex mcp add smartaihub --url ${endpoint}`,
        "codex mcp login smartaihub",
        "codex mcp list",
      ];
    case "generic":
      return [
        `Transport: Streamable HTTP; endpoint: ${endpoint}`,
        "Use OAuth discovery from the endpoint origin.",
        "Call initialize, tools/list, resources/list, and ping to verify.",
      ];
  }
}

export function buildMcpClientOnboardingDescriptor(
  client: SupportedMcpClient,
  endpoint = DEFAULT_ENDPOINT
): McpClientOnboardingDescriptor {
  const normalizedEndpoint = normalizePublicMcpEndpoint(endpoint);
  return {
    version: MCP_ONBOARDING_DESCRIPTOR_VERSION,
    client,
    endpoint: normalizedEndpoint,
    transport: "streamable-http",
    authModes: ["oauth", "device-code", "api-key"],
    requiredScopes: MCP_CLI_DEFAULT_SCOPES,
    browserlessFallback: "device-code-or-api-key",
    quotaPreview: {
      fiveHourCredits: MCP_CLI_DEFAULT_CREDIT_QUOTAS.fiveHour,
      dailyCredits: MCP_CLI_DEFAULT_CREDIT_QUOTAS.daily,
      weeklyCredits: MCP_CLI_DEFAULT_CREDIT_QUOTAS.weekly,
    },
    instructions: instructionsFor(client, normalizedEndpoint),
  };
}

export function buildMcpClientOnboardingDescriptors(
  endpoint = DEFAULT_ENDPOINT
): readonly McpClientOnboardingDescriptor[] {
  return (
    ["hermes-one", "hermes-cli", "claude", "codex", "generic"] as const
  ).map(client => buildMcpClientOnboardingDescriptor(client, endpoint));
}
