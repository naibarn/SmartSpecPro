import { describe, expect, it } from "vitest";

import {
  hasUsableAssistantText,
  isVisionReferenceDownloadFailure,
} from "../llmRouter";

describe("LLM provider response guard", () => {
  it("rejects a normalized successful response with an empty assistant message", () => {
    expect(
      hasUsableAssistantText({
        choices: [{ message: { role: "assistant", content: "" } }],
      }),
    ).toBe(false);
  });

  it("accepts response-api output text after normalization", () => {
    expect(
      hasUsableAssistantText({
        output_text: '{"ok":true}',
      }),
    ).toBe(true);
  });

  it("does not treat whitespace-only content as a billable assistant response", () => {
    expect(
      hasUsableAssistantText({
        choices: [{ message: { role: "assistant", content: "  \n" } }],
      }),
    ).toBe(false);
  });

  it("classifies an upstream 404 while downloading a reference image as retryable", () => {
    expect(
      isVisionReferenceDownloadFailure(
        "Error while downloading file. Upstream status code: 404",
      ),
    ).toBe(true);
  });
});
