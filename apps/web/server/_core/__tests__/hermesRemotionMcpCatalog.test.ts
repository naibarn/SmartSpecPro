import { describe, expect, it } from "vitest";
import { getMcpRegistryTools } from "../mcpRegistry";

describe("Feature 145 Hermes/Remotion MCP catalog", () => {
  it("publishes the typed Hermes manual-control and Remotion tools", () => {
    const tools = new Map(getMcpRegistryTools().map((tool) => [tool.name, tool]));
    const expected = [
      ["smartspec.hermes.capabilities", "hermes:read"],
      ["smartspec.hermes.connection_status", "hermes:read"],
      ["smartspec.hermes.connection_authorize", "hermes:connect"],
      ["smartspec.hermes.connection_probe", "hermes:connect"],
      ["smartspec.hermes.connection_disconnect", "hermes:disconnect"],
      ["smartspec.hermes.connection_test_generation", "hermes:generate"],
      ["smartspec.hermes.media_execute", "hermes:generate"],
      ["smartspec.hermes.connector.status", "hermes:read"],
      ["smartspec.hermes.agent.disconnect", "hermes:disconnect"],
      ["smartspec.media.cancel", "media:generate"],
      ["smartspec.remotion.render_video", "remotion:submit"],
      ["smartspec.remotion.job.status", "remotion:read"],
      ["smartspec.remotion.job.cancel", "remotion:cancel"],
    ] as const;

    for (const [name, requiredScope] of expected) {
      expect(tools.get(name)?.requiredScope, name).toBe(requiredScope);
    }
    expect(tools.get("smartspec.hermes.connection_authorize")?.idempotencyMode).toBe("required");
    expect(tools.get("smartspec.remotion.render_video")?.delegatedWorkerEligible).toBe(false);
    expect((tools.get("smartspec.media.generate_image")?.inputSchema.properties as Record<string, unknown>).provider).toEqual({
      type: "string",
      enum: ["platform", "hermes"],
    });
    expect(tools.get("smartspec.media.cancel")?.idempotencyMode).toBe("required");
  });
});
