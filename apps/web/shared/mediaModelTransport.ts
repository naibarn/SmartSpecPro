import type { MediaTransport } from "./mcpConnectTypes";

export type MediaModelTransportConfig = {
  transport: MediaTransport;
  providerKey?: string;
  providerModelId?: string;
  toolName?: string;
  argumentShape?: string;
  defaultParams?: Record<string, unknown>;
  creditSource: "smartspec_credits" | "provider_account";
};

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return asRecord(parsed);
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function resolveMediaModelTransportConfig(input: {
  provider?: string | null;
  modelId?: string | null;
  configJson?: unknown;
}): MediaModelTransportConfig {
  const config = asRecord(input.configJson);
  const mcp = asRecord(config.mcp);
  const rawTransport = asString(config.transport) ?? asString(config.mediaTransport);
  const transport: MediaTransport = rawTransport === "mcp" ? "mcp" : "gateway_api";
  const providerKey =
    asString(mcp.providerKey) ??
    asString(config.providerKey) ??
    asString(config.provider) ??
    asString(input.provider);
  const providerModelId =
    asString(mcp.providerModelId) ??
    asString(config.providerModelId) ??
    asString(config.kieModelId) ??
    asString(input.modelId);

  return {
    transport,
    providerKey,
    providerModelId,
    toolName: asString(mcp.toolName) ?? asString(config.mcpToolName),
    argumentShape: asString(mcp.argumentShape) ?? asString(config.mcpArgumentShape),
    defaultParams: asRecord(mcp.defaultParams),
    creditSource: transport === "mcp" ? "provider_account" : "smartspec_credits",
  };
}

export function getMediaModelTransportLabel(config: MediaModelTransportConfig): string {
  return config.transport === "mcp" ? "MCP" : "API";
}
