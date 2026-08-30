import { describe, expect, it } from "vitest";
import { formatPromptExpansionError } from "../VerticalDramaPromptExpansionDialog";

describe("prompt expansion transport errors", () => {
  it("turns a proxy 524 HTML response into a retryable user message", () => {
    const message = formatPromptExpansionError(
      "The API request failed before returning JSON. (status=524; content-type=text/html) <!DOCTYPE html><html>proxy connection</html>",
      "th",
    );
    expect(message).toContain("ใช้เวลาประมวลผลนานเกินกำหนด");
    expect(message).not.toContain("<!DOCTYPE html>");
  });

  it("removes HTML and bounds ordinary backend errors", () => {
    const message = formatPromptExpansionError(`<html>${"x".repeat(900)}</html>`, "th");
    expect(message).not.toContain("<html>");
    expect(message.length).toBeLessThanOrEqual(501);
  });
});
