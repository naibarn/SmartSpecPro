import { describe, expect, it } from "vitest";

import { validateKieResponsesConflicts } from "./responsesRoutes";

describe("validateKieResponsesConflicts", () => {
  it("rejects mixing web search tools with function tools", () => {
    expect(
      validateKieResponsesConflicts({
        tools: [
          { type: "web_search_preview" },
          { type: "function", name: "lookup_weather" },
        ],
      }),
    ).toBe(
      "Kie responses models do not allow web-search tools together with function tools.",
    );
  });

  it("allows responses requests with only function tools", () => {
    expect(
      validateKieResponsesConflicts({
        tools: [{ type: "function", name: "lookup_weather" }],
      }),
    ).toBeNull();
  });
});
