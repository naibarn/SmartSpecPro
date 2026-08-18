import { describe, expect, it, vi } from "vitest";
import { executeMcpToolByName, getMcpRegistryTools } from "../mcpRegistry";

vi.mock("../../services/tenantFeatureFlagService", async () => {
  const actual = await vi.importActual<typeof import("../../services/tenantFeatureFlagService")>("../../services/tenantFeatureFlagService");
  const flags = await vi.importActual<typeof import("../../../shared/featureFlags")>("../../../shared/featureFlags");
  return {
    ...actual,
    getTenantFeatureFlags: vi.fn(async () => ({
      ...flags.FEATURE_FLAG_DEFAULTS,
      mcpGuideToolAliasesEnabled: true,
      mcpResourcesEnabled: true,
      mcpModernProtocolEnabled: true,
      mcpLegacyCompatibilityEnabled: true,
    })),
  };
});

const session = {
  state: "ready" as const,
  authMode: "api_key" as const,
  tenantId: "tenant-1",
  userId: 1,
  apiKeyId: "key-1",
  scopes: ["mcp:read", "llm:chat", "remotion:read"],
  createdAt: new Date().toISOString(),
};

describe("MCP v2 registry metadata and aliases", () => {
  it("publishes safe guide aliases and output/schema metadata", () => {
    const tools = getMcpRegistryTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    expect(byName.get("smartspec.media.generate_image")).toBeDefined();
    expect(byName.get("image.generate")?.name).toBe("image.generate");
    expect(byName.get("video.generate")?.name).toBe("video.generate");
    expect(byName.get("models.list")?.requiredScope).toBe("llm:chat");
    expect(byName.get("account.get_balance")?.requiredScope).toBe("llm:chat");
    expect(byName.get("credits.estimate")?.inputSchema).toBeDefined();
    expect(byName.get("render.get")?.inputSchema).toMatchObject({ required: ["kind", "job_id"] });
    expect(byName.get("render.list")?.inputSchema).toMatchObject({ required: ["kind"] });
    expect(byName.get("smartspec.media.generate_image")?.outputSchema).toBeDefined();
    expect(byName.get("smartspec.media.generate_image")?.schemaVersion).toBe("1");
  });

  it("estimates credits through the canonical service using the credits.estimate alias", async () => {
    const result = await executeMcpToolByName("credits.estimate", {
      prompt: "A short test prompt",
      model: "gpt-5.4-mini",
      max_output_tokens: 128,
    }, { session, delegatedManifest: null, idempotencyKey: null });

    expect(result.result).toMatchObject({
      model: "gpt-5.4-mini",
      estimated_output_tokens: 128,
      pricing_source: "server_model_catalog",
    });
    expect((result.result as any).estimated_credits).toBeGreaterThan(0);
  });

  it("requires an explicit remotion kind before a render alias can execute", async () => {
    await expect(executeMcpToolByName("render.get", { job_id: "job-1" }, {
      session,
      delegatedManifest: null,
      idempotencyKey: null,
    })).rejects.toMatchObject({ code: -32602 });
  });

  it("applies the canonical Remotion scope gate to render.list", async () => {
    await expect(executeMcpToolByName("render.list", { kind: "remotion" }, {
      session: { ...session, scopes: ["mcp:read"] },
      delegatedManifest: null,
      idempotencyKey: null,
    })).rejects.toMatchObject({ code: -32603 });
  });

  it("rejects unknown fields against the published tool schema", async () => {
    await expect(executeMcpToolByName("models.list", { unexpected: true }, {
      session,
      delegatedManifest: null,
      idempotencyKey: null,
    })).rejects.toMatchObject({ code: -32602 });
  });
});
