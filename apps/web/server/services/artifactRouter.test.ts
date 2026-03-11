import { describe, it, expect } from "vitest";
import {
  classifyArtifactIntent,
  selectExecutionRoute,
  type ArtifactRoutingInput,
  type ArtifactRoute,
} from "./artifactRouter";

describe("artifactRouter", () => {
  describe("classifyArtifactIntent", () => {
    it("classifies presentation skill as 'presentation_deck'", () => {
      const result = classifyArtifactIntent({
        skillSlug: "ai-presentation",
        sourceType: "skill",
      });
      expect(result).toBe("presentation_deck");
    });

    it("classifies report skill as 'research_report'", () => {
      const result = classifyArtifactIntent({
        skillSlug: "research-report",
        sourceType: "skill",
      });
      expect(result).toBe("research_report");
    });

    it("classifies unknown skill as 'chat_reply'", () => {
      const result = classifyArtifactIntent({
        skillSlug: "image_prompt_engineer",
        sourceType: "skill",
      });
      expect(result).toBe("chat_reply");
    });

    it("classifies chat source as 'chat_reply'", () => {
      const result = classifyArtifactIntent({
        sourceType: "chat",
      });
      expect(result).toBe("chat_reply");
    });

    it("classifies media_video as 'media_prompt'", () => {
      const result = classifyArtifactIntent({
        sourceType: "media_video",
      });
      expect(result).toBe("media_prompt");
    });

    it("classifies media_image as 'media_prompt'", () => {
      const result = classifyArtifactIntent({
        sourceType: "media_image",
      });
      expect(result).toBe("media_prompt");
    });

    it("classifies explicit intent override", () => {
      const result = classifyArtifactIntent({
        sourceType: "chat",
        intentOverride: "presentation_deck",
      });
      expect(result).toBe("presentation_deck");
    });
  });

  describe("selectExecutionRoute", () => {
    it("routes presentation tasks to deterministic pipeline by default", () => {
      const result = selectExecutionRoute({
        artifactIntent: "presentation_deck",
        complexity: "moderate",
      });
      expect(result.route).toBe("deterministic_pipeline");
      expect(result.routeReason).toContain("presentation");
    });

    it("routes simple presentation to direct completion when model is strong", () => {
      const result = selectExecutionRoute({
        artifactIntent: "presentation_deck",
        complexity: "simple",
        modelSupportsStructuredOutput: true,
      });
      expect(result.route).toBe("direct_completion");
      expect(result.routeReason).toContain("simple");
    });

    it("routes complex presentation to deterministic pipeline regardless", () => {
      const result = selectExecutionRoute({
        artifactIntent: "presentation_deck",
        complexity: "complex",
        modelSupportsStructuredOutput: true,
      });
      expect(result.route).toBe("deterministic_pipeline");
    });

    it("routes research_report to direct completion", () => {
      const result = selectExecutionRoute({
        artifactIntent: "research_report",
        complexity: "moderate",
      });
      expect(result.route).toBe("direct_completion");
    });

    it("routes chat_reply to direct completion", () => {
      const result = selectExecutionRoute({
        artifactIntent: "chat_reply",
        complexity: "simple",
      });
      expect(result.route).toBe("direct_completion");
    });

    it("routes media_prompt to direct completion", () => {
      const result = selectExecutionRoute({
        artifactIntent: "media_prompt",
        complexity: "simple",
      });
      expect(result.route).toBe("direct_completion");
    });

    it("always includes routeReason", () => {
      const routes: ArtifactRoutingInput[] = [
        { artifactIntent: "chat_reply", complexity: "simple" },
        { artifactIntent: "presentation_deck", complexity: "complex" },
        { artifactIntent: "research_report", complexity: "moderate" },
      ];
      for (const input of routes) {
        const result = selectExecutionRoute(input);
        expect(result.routeReason).toBeTruthy();
        expect(typeof result.routeReason).toBe("string");
      }
    });
  });
});
