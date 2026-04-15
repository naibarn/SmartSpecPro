import { describe, expect, it } from "vitest";

import { sanitizeResponsesBody, validateKieResponsesConflicts } from "./responsesRoutes";

describe("sanitizeResponsesBody", () => {
  it("preserves reasoning and multimodal input blocks", () => {
    const result = sanitizeResponsesBody({
      model: "gpt-5.4",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "What is in this image?" },
            {
              type: "input_image",
              image_url: "https://example.com/example.png",
            },
          ],
        },
      ],
      reasoning: { effort: "high" },
      stream: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.body.reasoning).toEqual({ effort: "high" });
    expect(result.body.input).toEqual([
      {
        role: "user",
        content: [
          { type: "input_text", text: "What is in this image?" },
          {
            type: "input_image",
            image_url: "https://example.com/example.png",
          },
        ],
      },
    ]);
  });

  it("preserves model selection hints for auto routing", () => {
    const result = sanitizeResponsesBody({
      model: "__auto",
      input: [{ role: "user", content: "Hello" }],
      modelSelection: { mode: "auto-global" },
      modelSelectionContext: { featureModes: ["photo_search", "structured_output", "responses"] },
      stream: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.body.modelSelection).toEqual({ mode: "auto-global" });
    expect(result.body.modelSelectionContext).toEqual({
      featureModes: ["photo_search", "structured_output", "responses"],
    });
  });
});

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
