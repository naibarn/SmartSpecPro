import { describe, expect, it } from "vitest";

import { resolveAutoTeamProviderDecision } from "../autoTeamProviderPolicy";

describe("autoTeamProviderPolicy", () => {
  it("keeps deterministic defaults for media routes", () => {
    expect(
      resolveAutoTeamProviderDecision({
        tenantId: "tenant-1",
        runId: "run-1",
        routeClass: "media.video",
      }),
    ).toMatchObject({
      selectedProvider: "kie_ai",
      selectedModel: "veo-3-1",
      selectedReason: "explicit_or_default",
    });
  });

  it("defers research synthesis model selection to the shared llm router when no explicit model is requested", () => {
    expect(
      resolveAutoTeamProviderDecision({
        tenantId: "tenant-1",
        runId: "run-1",
        routeClass: "research.synthesis",
      }),
    ).toMatchObject({
      selectedProvider: null,
      selectedModel: null,
      selectedReason: "llm_router_auto_selection",
    });
  });

  it("preserves explicit research model hints when they are provided", () => {
    expect(
      resolveAutoTeamProviderDecision({
        tenantId: "tenant-1",
        runId: "run-1",
        routeClass: "document.writing",
        requestedProvider: "openrouter",
        requestedModel: "openai/gpt-4.1-mini",
      }),
    ).toMatchObject({
      selectedProvider: "openrouter",
      selectedModel: "openai/gpt-4-1-mini",
    });
  });
});
