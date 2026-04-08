import { describe, expect, it } from "vitest";

import { generateArticleDraftHtml, makeComposerStateFromDraft, makeSaveDraftInput } from "./contentComposerPanelHelpers";
import { initialComposerState, composerReducer } from "./composerReducer";

describe("content composer helpers", () => {
  it("generates a readable article draft shell", () => {
    const html = generateArticleDraftHtml({
      topic: "Launch plan",
      executionSource: "agency",
      agencyName: "Launch Agency",
      skillId: null,
      requiresWebSearch: true,
      requiresThinking: false,
    });

    expect(html).toContain("<h1>Launch plan</h1>");
    expect(html).toContain("Launch Agency");
    expect(html).toContain("Web search: enabled");
    expect(html).toContain("Thinking: disabled");
  });

  it("round-trips draft data into composer state and save payload", () => {
    const baseState = composerReducer(initialComposerState, { type: "START_NEW_DRAFT" });
    const nextState = {
      ...baseState,
      activeDraftId: "draft-1",
      topic: "Roadmap",
      executionSource: "skill" as const,
      skillId: "skill-42",
      articleBody: "<p>hello</p>",
      attachmentIds: [11, 11, 12],
      destinationKind: "social" as const,
      socialPlatform: "youtube" as const,
      socialTargetId: 99,
      socialCaption: "Caption",
    };

    const payload = makeSaveDraftInput(nextState);
    expect(payload.id).toBe("draft-1");
    expect(payload.attachmentIds).toEqual([11, 11, 12]);
    expect(payload.socialPlatform).toBe("youtube");

    const restored = makeComposerStateFromDraft({
      id: "draft-1",
      tenantId: "tenant-1",
      userId: 1,
      topic: "Roadmap",
      executionSource: "skill",
      skillId: "skill-42",
      agencyId: null,
      articleBody: "<p>hello</p>",
      requiresWebSearch: true,
      requiresThinking: false,
      attachmentIds: [11, 12],
      destinationKind: "social",
      docsSubKind: null,
      docsTargetId: null,
      blogTargetId: null,
      socialPlatform: "youtube",
      socialTargetId: 99,
      socialCaption: "Caption",
      status: "draft",
      errorMessage: null,
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(restored.activeDraftId).toBe("draft-1");
    expect(restored.destinationKind).toBe("social");
    expect(restored.isDirty).toBe(false);
  });
});
