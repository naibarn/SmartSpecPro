/**
 * Client-side onboarding helpers for the canonical SmartAIHub MCP endpoint.
 *
 * The Hermes URI contains only public MCP configuration. It must never carry
 * an access token, refresh token, API key, or tenant secret.
 */

export const SMARTAIHUB_MCP_AUTH_MODE = "oauth" as const;

export {
  MCP_ONBOARDING_DESCRIPTOR_VERSION,
  buildMcpClientOnboardingDescriptor,
  buildMcpClientOnboardingDescriptors,
  normalizePublicMcpEndpoint,
  type McpClientAuthMode,
  type McpClientOnboardingDescriptor,
  type SupportedMcpClient,
} from "@shared/mcpClientOnboarding";

import { normalizePublicMcpEndpoint } from "@shared/mcpClientOnboarding";

export function buildHermesMcpInstallUrl(endpoint: string): string {
  const normalizedEndpoint = normalizePublicMcpEndpoint(endpoint);
  const config = JSON.stringify({
    url: normalizedEndpoint,
    auth: SMARTAIHUB_MCP_AUTH_MODE,
  });

  // Hermes expects a base64-encoded JSON config in its custom URI. The
  // endpoint and auth mode are ASCII, so browser btoa is sufficient here.
  const encodedConfig = btoa(config);
  return `hermes://mcp/install?name=smartaihub&config=${encodeURIComponent(encodedConfig)}`;
}

export function getMcpClientSetupMode(
  client: import("@shared/mcpClientOnboarding").SupportedMcpClient
): "deep-link" | "settings" {
  return client === "hermes-one" ? "deep-link" : "settings";
}
