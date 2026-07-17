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
  // Feature 135 — Hermes Grok media worker transport arm. Reading `config.hermes`
  // here is additive/dark: existing mcp/gateway resolution below is untouched.
  const hermes = asRecord(config.hermes);
  const rawTransport = asString(config.transport) ?? asString(config.mediaTransport);
  const transport: MediaTransport =
    rawTransport === "hermes_worker" ? "hermes_worker" : rawTransport === "mcp" ? "mcp" : "gateway_api";

  const providerKey =
    transport === "hermes_worker"
      ? "hermes-grok"
      : asString(mcp.providerKey) ??
        asString(config.providerKey) ??
        asString(config.provider) ??
        asString(input.provider);
  const providerModelId =
    (transport === "hermes_worker" ? asString(hermes.providerModelId) : undefined) ??
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
    creditSource:
      transport === "mcp" || transport === "hermes_worker" ? "provider_account" : "smartspec_credits",
  };
}

export function getMediaModelTransportLabel(config: MediaModelTransportConfig): string {
  if (config.transport === "hermes_worker") return "Hermes";
  return config.transport === "mcp" ? "MCP" : "API";
}

/**
 * Feature 135 (Hermes Grok media worker) client gating helper — true when a
 * model row's `configJson` resolves to `hermes_worker` transport. Pure and
 * shared so every surface (model-picker badge, VD stock panels, EpisodePage,
 * StoryboardPanel) computes the same gate identically instead of re-deriving
 * `resolveMediaModelTransportConfig(...).transport === "hermes_worker"` ad
 * hoc at each call site.
 */
export function modelUsesHermesTransport(configJson?: unknown): boolean {
  return resolveMediaModelTransportConfig({ configJson }).transport === "hermes_worker";
}

/** Same convention for MCP-transport gating (regression parity helper). */
export function modelUsesMcpTransport(configJson?: unknown): boolean {
  return resolveMediaModelTransportConfig({ configJson }).transport === "mcp";
}
