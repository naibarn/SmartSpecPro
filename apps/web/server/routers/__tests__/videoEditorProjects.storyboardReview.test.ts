import { describe, expect, it } from "vitest";
import {
  getStoryboardReviewAutoReviewRunId,
  mergeStoryboardReviewMarketplaceContext,
  mergeFresherExistingReviewTasks,
  repairStoryboardReviewMarketplacePromptLocks,
  sanitizeStoryboardReviewClientDebugPayload,
} from "../videoEditorProjects";

describe("getStoryboardReviewAutoReviewRunId", () => {
  it("reads the canonical top-level Auto Review run ID", () => {
    expect(
      getStoryboardReviewAutoReviewRunId({
        version: 1,
        autoReviewRunId: "mar_top_level",
        tasks: [
          {
            id: "shot-1",
            storyboardContext: {
              extraParams: {
                autoReviewRunId: "mar_task_level",
              },
            },
          },
        ],
      }),
    ).toBe("mar_top_level");
  });

  it("reads the Auto Review run ID from task extra params", () => {
    expect(
      getStoryboardReviewAutoReviewRunId({
        version: 1,
        tasks: [
          {
            id: "shot-1",
            storyboardContext: {
              extraParams: {
                autoReviewRunId: "mar_11cac76761cfe7ffc5146cf64a35901d",
              },
            },
          },
        ],
      }),
    ).toBe("mar_11cac76761cfe7ffc5146cf64a35901d");
  });

  it("does not guess when task extra params contain mixed Auto Review runs", () => {
    expect(
      getStoryboardReviewAutoReviewRunId({
        version: 1,
        tasks: [
          {
            id: "shot-1",
            storyboardContext: {
              extraParams: {
                autoReviewRunId: "mar_a",
              },
            },
          },
          {
            id: "shot-2",
            storyboardContext: {
              extraParams: {
                autoReviewRunId: "mar_b",
              },
            },
          },
        ],
      }),
    ).toBe("");
  });

  it("reads the Auto Review run ID from marketplace context", () => {
    expect(
      getStoryboardReviewAutoReviewRunId({
        marketplaceContext: {
          marketplaceAutoReviewRunId: "mar_current",
        },
      }),
    ).toBe("mar_current");
  });
});

describe("mergeStoryboardReviewMarketplaceContext", () => {
  it("adds auto review product context when stored storyboard review data does not have one", () => {
    expect(
      mergeStoryboardReviewMarketplaceContext(
        {
          version: 1,
          marketplaceContext: null,
          tasks: [],
        },
        {
          productId: "mp_1",
          itemId: "1729778762045557072",
          sourceUrl: "https://shop.tiktok.com/th/pdp/1729778762045557072",
          productName: "รถสามล้อเด็ก",
        },
      ),
    ).toMatchObject({
      marketplaceContext: {
        productId: "mp_1",
        itemId: "1729778762045557072",
        productName: "รถสามล้อเด็ก",
      },
      marketplaceProduct: {
        productId: "mp_1",
      },
    });
  });

  it("preserves an existing product context instead of replacing it", () => {
    const reviewData = {
      version: 1,
      marketplaceContext: {
        productId: "mp_existing",
        productName: "Existing product",
      },
    };

    expect(
      mergeStoryboardReviewMarketplaceContext(reviewData, {
        productId: "mp_new",
        productName: "New product",
      }),
    ).toBe(reviewData);
  });
});

describe("repairStoryboardReviewMarketplacePromptLocks", () => {
  it("repairs persisted Auto Review prompts that kept a generic female voice", () => {
    const reviewData = {
      version: 1,
      tasks: [
        {
          id: "shot-1",
          prompt:
            'Create a 5-second cinematic video. Scene: Use @Image1 as start frame. Use @Image2 as stop frame. Characters: Use only the person or hands already visible in the frames. Audio: Native audio. Voice: young mother-style female voice, early 30s, soft warm voice, caring and comforting tone, slow natural delivery, central Thai accent. Dialogue must be spoken in natural Thai, central Thai accent. Dialogue: Presenter พูดเป็นภาษาไทยว่า "เมื่อไหร่ที่ทำกาแฟไม่สุด"',
        },
      ],
    };
    const repaired = repairStoryboardReviewMarketplacePromptLocks(reviewData, {
      runId: "mar_1",
      metadataJson: {
        referenceAnchors: {
          characterMode: "described_character",
          characterBrief:
            "คนไทย ผู้ชาย, 30-39, role Reviewer, style ผู้เชี่ยวชาญ.",
          characterPreset: {
            mode: "described_character",
            gender: "male",
            genderLabel: "ผู้ชาย",
            age: "adult_30_39",
            ageLabel: "30-39",
            appearance: "thai",
            appearanceLabel: "คนไทย",
            role: "reviewer",
            roleLabel: "Reviewer",
            style: "expert_practical",
            styleLabel: "ผู้เชี่ยวชาญ",
          },
        },
      },
    }) as any;

    expect(repaired.tasks[0].prompt).toContain("VIDEO CHARACTER LOCK");
    expect(repaired.tasks[0].prompt).toContain(
      "Thai, male presenter/man, 30-39 years old"
    );
    expect(repaired.tasks[0].prompt).toContain("Selected presenter voice lock");
    expect(repaired.tasks[0].prompt).not.toContain(
      "young mother-style female voice"
    );
    expect(repaired.tasks[0].prompt).not.toContain("early 30s");
  });
});

describe("mergeFresherExistingReviewTasks", () => {
  it("keeps incoming dropped video media when it is newer than the stored task", () => {
    const existing = {
      version: 1,
      updatedAt: 1000,
      taskIds: ["shot-1"],
      selectedTaskIds: ["shot-1"],
      tasks: [
        {
          id: "shot-1",
          updatedAt: 1000,
          url: undefined,
          status: "queued",
        },
      ],
    };
    const incoming = {
      ...existing,
      updatedAt: 5000,
      tasks: [
        {
          id: "shot-1",
          updatedAt: 5000,
          url: "/api/storage/files/uploads/shot-1.mp4",
          status: "completed",
          source: "imported",
        },
      ],
    };

    expect(mergeFresherExistingReviewTasks(existing, incoming)).toMatchObject({
      tasks: [
        {
          id: "shot-1",
          updatedAt: 5000,
          url: "/api/storage/files/uploads/shot-1.mp4",
          status: "completed",
          source: "imported",
        },
      ],
    });
  });

  it("preserves fresher existing task media when a stale client resaves with a newer draft timestamp", () => {
    const existing = {
      version: 1,
      updatedAt: 3000,
      taskIds: ["shot-1", "shot-2"],
      selectedTaskIds: ["shot-1", "shot-2"],
      tasks: [
        {
          id: "shot-1",
          updatedAt: 1000,
          url: "/files/v1.mp4",
        },
        {
          id: "shot-2",
          updatedAt: 3000,
          url: "/files/v7.mp4",
        },
      ],
    };
    const incoming = {
      ...existing,
      updatedAt: 4000,
      compoundStatus: "Recovered storyboard review",
      tasks: [
        {
          id: "shot-1",
          updatedAt: 1000,
          url: "/files/v1.mp4",
        },
        {
          id: "shot-2",
          updatedAt: 1000,
          url: "/files/v4.mp4",
        },
      ],
    };

    expect(mergeFresherExistingReviewTasks(existing, incoming)).toMatchObject({
      updatedAt: 4000,
      compoundStatus: "Recovered storyboard review",
      tasks: [
        { id: "shot-1", updatedAt: 1000, url: "/files/v1.mp4" },
        { id: "shot-2", updatedAt: 3000, url: "/files/v7.mp4" },
      ],
    });
  });

  it("keeps incoming production metadata when preserving fresher stored task media", () => {
    const productionContext = {
      productionRunId: "run-123",
      productionStoryConceptId: "concept-1",
      productionStoryConceptTitle: "Problem solution",
      videoConcept: "Organize the bedside corner with a three-tier shelf.",
      voiceoverFullScript: "VOICEOVER SCRIPT BY SHOT: 1. เปิดปัญหา 2. สินค้าเข้ามาแก้",
      storyboardGuide: "Shot 1 problem, Shot 2 solution.",
    };
    const existing = {
      version: 1,
      updatedAt: 3000,
      productionContext: null,
      tasks: [
        {
          id: "shot-1",
          updatedAt: 5000,
          url: "/files/fresh.mp4",
          prompt: "Fresh generated prompt",
          storyboardContext: {
            extraParams: {
              generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO",
            },
          },
        },
      ],
    };
    const incoming = {
      version: 1,
      updatedAt: 6000,
      productionContext,
      conceptDetails: "Product detail lock",
      storyboardGuide: productionContext.storyboardGuide,
      voiceoverFullScript: productionContext.voiceoverFullScript,
      tasks: [
        {
          id: "shot-1",
          updatedAt: 4000,
          url: "/files/stale.mp4",
          prompt: "Incoming stale prompt",
          productionContext,
          storyboardContext: {
            productionContext,
            extraParams: {
              productionContext,
              productionRunId: productionContext.productionRunId,
              productionStoryConceptId: productionContext.productionStoryConceptId,
              storyboardGuide: productionContext.storyboardGuide,
              voiceoverFullScript: productionContext.voiceoverFullScript,
              storyboardPromptPlanner: {
                voiceoverFullScript: productionContext.voiceoverFullScript,
                productionContext,
              },
            },
          },
        },
      ],
    };

    expect(mergeFresherExistingReviewTasks(existing, incoming)).toMatchObject({
      updatedAt: 6000,
      productionContext,
      conceptDetails: "Product detail lock",
      tasks: [
        {
          id: "shot-1",
          updatedAt: 5000,
          url: "/files/fresh.mp4",
          prompt: "Fresh generated prompt",
          productionContext,
          storyboardContext: {
            productionContext,
            extraParams: {
              generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO",
              productionContext,
              productionRunId: "run-123",
              productionStoryConceptId: "concept-1",
              storyboardGuide: productionContext.storyboardGuide,
              voiceoverFullScript: productionContext.voiceoverFullScript,
              storyboardPromptPlanner: {
                voiceoverFullScript: productionContext.voiceoverFullScript,
                productionContext,
              },
            },
          },
        },
      ],
    });
  });

  it("accepts incoming task media when it is at least as fresh as the stored task", () => {
    const existing = {
      tasks: [{ id: "shot-1", updatedAt: 1000, url: "/files/old.mp4" }],
    };
    const incoming = {
      tasks: [{ id: "shot-1", updatedAt: 2000, url: "/files/new.mp4" }],
    };

    expect(mergeFresherExistingReviewTasks(existing, incoming)).toEqual(incoming);
  });

  it("preserves stored companion audio when an older refreshed draft would drop it", () => {
    const existing = {
      version: 1,
      updatedAt: 4000,
      companionAudioUpdatedAt: 5000,
      tasks: [{ id: "shot-1", updatedAt: 1000, url: "/files/shot-1.mp4" }],
      companionAudio: [
        {
          id: "audio-new",
          url: "/files/new-audio.mp3",
          title: "New narration",
          prompt: "New narration",
          kind: "voiceover",
        },
      ],
    };
    const incoming = {
      version: 1,
      updatedAt: 3500,
      companionAudioUpdatedAt: 3000,
      tasks: [{ id: "shot-1", updatedAt: 1000, url: "/files/shot-1.mp4" }],
      companionAudio: [],
    };

    expect(mergeFresherExistingReviewTasks(existing, incoming)).toMatchObject({
      companionAudioUpdatedAt: 5000,
      companionAudio: [
        expect.objectContaining({ id: "audio-new", url: "/files/new-audio.mp3" }),
      ],
    });
  });

  it("accepts incoming companion audio when the incoming draft is newer", () => {
    const existing = {
      version: 1,
      updatedAt: 3000,
      companionAudioUpdatedAt: 3000,
      tasks: [{ id: "shot-1", updatedAt: 1000, url: "/files/shot-1.mp4" }],
      companionAudio: [],
    };
    const incoming = {
      version: 1,
      updatedAt: 4000,
      companionAudioUpdatedAt: 4000,
      tasks: [{ id: "shot-1", updatedAt: 1000, url: "/files/shot-1.mp4" }],
      companionAudio: [
        {
          id: "audio-new",
          url: "/files/new-audio.mp3",
          title: "New narration",
          prompt: "New narration",
          kind: "voiceover",
        },
      ],
    };

    expect(mergeFresherExistingReviewTasks(existing, incoming)).toEqual(incoming);
  });

  it("preserves a newer companion audio removal instead of restoring older stored audio", () => {
    const existing = {
      version: 1,
      updatedAt: 5000,
      companionAudioUpdatedAt: 5000,
      tasks: [{ id: "shot-1", updatedAt: 1000, url: "/files/shot-1.mp4" }],
      companionAudio: [],
    };
    const incoming = {
      version: 1,
      updatedAt: 6000,
      companionAudioUpdatedAt: 4000,
      tasks: [{ id: "shot-1", updatedAt: 1000, url: "/files/shot-1.mp4" }],
      companionAudio: [
        {
          id: "audio-old",
          url: "/files/old-audio.mp3",
          title: "Old narration",
          prompt: "Old narration",
          kind: "voiceover",
        },
      ],
    };

    expect(mergeFresherExistingReviewTasks(existing, incoming)).toMatchObject({
      companionAudioUpdatedAt: 5000,
      companionAudio: [],
    });
  });

  it("does not let legacy audio without an explicit audio timestamp overwrite newer audio", () => {
    const existing = {
      version: 1,
      updatedAt: 5000,
      companionAudioUpdatedAt: 5000,
      tasks: [{ id: "shot-1", updatedAt: 1000, url: "/files/shot-1.mp4" }],
      companionAudio: [
        {
          id: "audio-new",
          url: "/files/new-audio.mp3",
          title: "New narration",
          prompt: "New narration",
          kind: "voiceover",
        },
      ],
    };
    const incoming = {
      version: 1,
      updatedAt: 6000,
      tasks: [{ id: "shot-1", updatedAt: 1000, url: "/files/shot-1.mp4" }],
      companionAudio: [
        {
          id: "audio-old",
          url: "/files/old-audio.mp3",
          title: "Old music",
          prompt: "Old music",
          kind: "music",
        },
      ],
    };

    expect(mergeFresherExistingReviewTasks(existing, incoming)).toMatchObject({
      companionAudioUpdatedAt: 5000,
      companionAudio: [
        expect.objectContaining({ id: "audio-new", url: "/files/new-audio.mp3" }),
      ],
    });
  });
});

describe("sanitizeStoryboardReviewClientDebugPayload", () => {
  it("redacts urls and trims long debug strings", () => {
    const sanitized = sanitizeStoryboardReviewClientDebugPayload({
      audio: [{
        id: "audio-1",
        sourceUrl: "https://example.com/file.mp3?sig=secret",
        title: "x".repeat(600),
      }],
      nested: {
        token: "secret-token",
      },
    }) as any;

    expect(sanitized.audio[0].id).toBe("audio-1");
    expect(sanitized.audio[0].sourceUrl).toBe("[redacted]");
    expect(sanitized.audio[0].title).toHaveLength(503);
    expect(sanitized.nested.token).toBe("[redacted]");
  });
});
