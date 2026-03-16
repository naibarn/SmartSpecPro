import { describe, it, expect } from "vitest";
import { mergeResults, type SkillStepResult } from "../skillResultMerger";

function makeTextResult(content: string, credits = 2, durationMs = 100): SkillStepResult {
  return { skillId: "s1", type: "text", content, creditsUsed: credits, durationMs };
}
function makeImageResult(urls: string[], credits = 3, durationMs = 200): SkillStepResult {
  return { skillId: "s2", type: "image", urls, creditsUsed: credits, durationMs };
}
function makeVideoResult(url: string, credits = 5, durationMs = 300): SkillStepResult {
  return { skillId: "s3", type: "video", urls: [url], creditsUsed: credits, durationMs };
}

describe("mergeResults", () => {
  it("passes through single SIMPLE result unchanged", async () => {
    const result = await mergeResults([makeTextResult("hello")], "test");
    expect(result.sections).toHaveLength(1);
    expect(result.summary).toBe("hello");
    expect(result.totalCreditsUsed).toBe(2);
  });

  it("combines multiple text results", async () => {
    const result = await mergeResults(
      [makeTextResult("Article"), makeTextResult("Translation")],
      "test",
    );
    expect(result.sections).toHaveLength(2);
    expect(result.summary).toContain("Article");
    expect(result.summary).toContain("Translation");
  });

  it("combines text + image URLs", async () => {
    const result = await mergeResults(
      [makeTextResult("Content"), makeImageResult(["img1.jpg"])],
      "test",
    );
    expect(result.sections).toHaveLength(2);
    expect(result.summary).toBe("Content");
  });

  it("combines text + video URL", async () => {
    const result = await mergeResults(
      [makeTextResult("Script"), makeVideoResult("vid.mp4")],
      "test",
    );
    expect(result.sections[0].type).toBe("text");
    expect(result.sections[1].type).toBe("video");
  });

  it("preserves section metadata", async () => {
    const result = await mergeResults(
      [makeTextResult("a", 2, 100), makeTextResult("b", 3, 200)],
      "test",
    );
    expect(result.sections[0].metadata.creditsUsed).toBe(2);
    expect(result.sections[1].metadata.creditsUsed).toBe(3);
  });

  it("calculates correct totals", async () => {
    const result = await mergeResults(
      [makeTextResult("a", 2, 100), makeTextResult("b", 3, 200), makeTextResult("c", 5, 300)],
      "test",
    );
    expect(result.totalCreditsUsed).toBe(10);
    expect(result.totalDurationMs).toBe(600);
  });

  it("handles empty results", async () => {
    const result = await mergeResults([], "test");
    expect(result.sections).toEqual([]);
    expect(result.totalCreditsUsed).toBe(0);
  });
});
