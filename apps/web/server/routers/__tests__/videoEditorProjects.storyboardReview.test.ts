import { describe, expect, it, vi } from "vitest";
import {
  getStoryboardReviewAutoReviewRunId,
  getStoryboardReviewHyperframesProductId,
  getStoryboardReviewHyperframesRunId,
  mergeStoryboardReviewMarketplaceContext,
  mergeFresherExistingReviewTasks,
  optimizeStoryboardReviewSegmentPromptIfNeededForTest,
  repairStoryboardReviewMarketplacePromptLocks,
  regenerateVideoSegmentPromptFromReviewDataForTest,
  sanitizeStoryboardReviewClientDebugPayload,
  summarizeStoryboardReviewListRows,
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

describe("summarizeStoryboardReviewListRows", () => {
  it("keeps the sidebar payload compact and does not return full reviewData", () => {
    const createdAt = new Date("2026-06-20T00:00:00.000Z");
    const updatedAt = new Date("2026-06-20T01:00:00.000Z");

    const [summary] = summarizeStoryboardReviewListRows([
      {
        id: 92,
        name: "Large Auto Storyboard Review",
        status: "active",
        clipCount: 9,
        completedClipCount: 0,
        thumbnailUrl: null,
        reviewData: {
          tasks: [
            {
              id: "shot-1",
              url: "https://cdn.example.com/shot-1.png",
              prompt: "large prompt ".repeat(20000),
            },
          ],
        },
        videoEditorProjectId: null,
        createdAt,
        updatedAt,
      },
    ]);

    expect(summary).toEqual({
      id: 92,
      name: "Large Auto Storyboard Review",
      status: "active",
      clipCount: 9,
      completedClipCount: 0,
      thumbnailUrl: "https://cdn.example.com/shot-1.png",
      videoEditorProjectId: null,
      createdAt,
      updatedAt,
    });
    expect("reviewData" in summary).toBe(false);
  });
});

describe("regenerateVideoSegmentPromptFromReviewDataForTest", () => {
  it("regenerates a plain-text prompt from stored segment state", () => {
    const reviewData = {
      version: 1,
      conceptDetails: "PRODUCT FACTS LOCK: Keep the exact product.",
      videoSegmentState: {
        schemaVersion: 1,
        effectiveMode: "per_shot",
        promptSource: "initial",
        videoSegmentPlan: {
          schemaVersion: 1,
          sourceSurface: "storyboard_review",
          mode: "per_shot",
          effectiveMode: "per_shot",
          videoModelId: "veo3/generate-veo-3-video-lite",
          provider: "kie.ai",
          transport: "gateway_api",
          audioStrategy: "separate_tts_voiceover",
          referenceMode: "single_storyboard_frame",
          creativePresets: [],
          segments: [
            {
              segmentId: "seg_1",
              index: 0,
              shotIds: ["shot-1"],
              durationSeconds: 5,
              referenceMode: "single_storyboard_frame",
              referenceImageUrls: ["https://example.com/ref.png"],
              subShots: [
                {
                  shotId: "shot-1",
                  index: 0,
                  durationSeconds: 5,
                  title: "Hook",
                  visualPrompt: "Show the product.",
                  voiceover: "สินค้าใช้งานง่าย",
                },
              ],
              warnings: [],
            },
          ],
          warnings: [],
          planHash: "vsp_testhash",
        },
      },
      tasks: [
        {
          id: "task-1",
          prompt: "Old prompt",
          storyboardContext: {
            extraParams: {
              shotId: "shot-1",
              videoSegmentId: "seg_1",
            },
          },
        },
      ],
    };

    const result = regenerateVideoSegmentPromptFromReviewDataForTest({
      reviewData,
      segmentId: "seg_1",
      creativeBrief: "Make it warmer but change the product.",
    });

    expect(result.prompt.trim().startsWith("{")).toBe(false);
    expect(result.prompt).toContain("Sub-shot timeline:");
    expect(result.prompt).toContain("PRODUCT FACTS LOCK");
    expect(result.prompt).toContain("[locked instruction removed]");
    expect(result.staleTaskIds).toEqual(["task-1"]);
    expect(result.promptSource).toBe("regenerated");
  });

  it("narrows regenerated segment updates to the requested target task", () => {
    const reviewData = {
      version: 1,
      conceptDetails: "PRODUCT FACTS LOCK: Keep the exact air conditioner.",
      videoSegmentState: {
        schemaVersion: 1,
        effectiveMode: "compact_multi_shot",
        promptSource: "initial",
        videoSegmentPlan: {
          schemaVersion: 1,
          sourceSurface: "storyboard_review",
          mode: "compact_multi_shot",
          effectiveMode: "compact_multi_shot",
          videoModelId: "higgsfield/seedance_2_0_fast",
          provider: "higgsfield",
          transport: "mcp",
          audioStrategy: "native_audio",
          referenceMode: "single_storyboard_frame",
          creativePresets: [],
          segments: [
            {
              segmentId: "seg_1",
              index: 0,
              shotIds: ["shot-1", "shot-2", "shot-3"],
              durationSeconds: 15,
              referenceMode: "single_storyboard_frame",
              referenceImageUrls: ["https://example.com/ref.png"],
              subShots: [
                {
                  shotId: "shot-1",
                  index: 0,
                  durationSeconds: 5,
                  title: "Hook",
                  visualPrompt: "Show the heat problem.",
                  voiceover: "เริ่มต้นวันใหม่ด้วยความเย็นสบาย",
                },
                {
                  shotId: "shot-2",
                  index: 1,
                  durationSeconds: 5,
                  title: "Solution",
                  visualPrompt: "Show the air conditioner.",
                  voiceover: "แอร์รุ่นนี้ช่วยให้ห้องเย็นเร็ว",
                },
                {
                  shotId: "shot-3",
                  index: 2,
                  durationSeconds: 5,
                  title: "Result",
                  visualPrompt: "Show comfortable rest.",
                  voiceover: "ประหยัดพลังงานในชีวิตประจำวัน",
                },
              ],
              warnings: [],
            },
          ],
          warnings: [],
          planHash: "vsp_target_task",
        },
      },
      tasks: ["task-1", "task-2", "task-3"].map((id, index) => ({
        id,
        prompt: `Old prompt ${index + 1}`,
        storyboardContext: {
          extraParams: {
            shotId: `shot-${index + 1}`,
            videoSegmentId: "seg_1",
          },
        },
      })),
    };

    const result = regenerateVideoSegmentPromptFromReviewDataForTest({
      reviewData,
      segmentId: "seg_1",
      targetTaskId: "task-1",
      creativeBrief: "Make the first shot warmer.",
    });

    expect(result.staleTaskIds).toEqual(["task-1"]);
  });

  it("does not treat long storyboard context as the user creative brief", () => {
    const longProductFacts = `PRODUCT FACTS LOCK: ${"Keep the playpen exact. ".repeat(180)}`;
    const reviewData = {
      version: 1,
      conceptDetails: longProductFacts,
      videoSegmentState: {
        schemaVersion: 1,
        effectiveMode: "per_shot",
        promptSource: "initial",
        videoSegmentPlan: {
          schemaVersion: 1,
          sourceSurface: "storyboard_review",
          mode: "per_shot",
          effectiveMode: "per_shot",
          videoModelId: "veo3/generate-veo-3-video-lite",
          provider: "kie.ai",
          transport: "gateway_api",
          audioStrategy: "separate_tts_voiceover",
          referenceMode: "single_storyboard_frame",
          creativePresets: [],
          segments: [
            {
              segmentId: "seg_1",
              index: 0,
              shotIds: ["shot-1"],
              durationSeconds: 5,
              referenceMode: "single_storyboard_frame",
              referenceImageUrls: ["https://example.com/ref.png"],
              subShots: [
                {
                  shotId: "shot-1",
                  index: 0,
                  durationSeconds: 5,
                  title: "Hook",
                  visualPrompt: "Show the product.",
                },
              ],
              warnings: [],
            },
          ],
          warnings: [],
          planHash: "vsp_testhash",
        },
      },
      tasks: [
        {
          id: "task-1",
          prompt: "Old prompt",
          storyboardContext: {
            extraParams: {
              shotId: "shot-1",
              videoSegmentId: "seg_1",
            },
          },
        },
      ],
    };

    const result = regenerateVideoSegmentPromptFromReviewDataForTest({
      reviewData,
      segmentId: "seg_1",
      creativeBrief: null,
    });

    expect(result.prompt).toContain("Product facts lock:");
    expect(result.prompt).toContain("Keep the playpen exact.");
    expect(result.prompt).not.toContain("User creative brief guidance:");
    expect(result.warnings).toEqual([]);
  });

  it("truncates an overlong creative brief with an explicit warning", () => {
    const reviewData = {
      version: 1,
      conceptDetails: "PRODUCT FACTS LOCK: Keep the exact product.",
      videoSegmentState: {
        schemaVersion: 1,
        effectiveMode: "per_shot",
        promptSource: "initial",
        videoSegmentPlan: {
          schemaVersion: 1,
          sourceSurface: "storyboard_review",
          mode: "per_shot",
          effectiveMode: "per_shot",
          videoModelId: "veo3/generate-veo-3-video-lite",
          provider: "kie.ai",
          transport: "gateway_api",
          audioStrategy: "separate_tts_voiceover",
          referenceMode: "single_storyboard_frame",
          creativePresets: [],
          segments: [
            {
              segmentId: "seg_1",
              index: 0,
              shotIds: ["shot-1"],
              durationSeconds: 5,
              referenceMode: "single_storyboard_frame",
              referenceImageUrls: ["https://example.com/ref.png"],
              subShots: [
                {
                  shotId: "shot-1",
                  index: 0,
                  durationSeconds: 5,
                  title: "Hook",
                  visualPrompt: "Show the product.",
                },
              ],
              warnings: [],
            },
          ],
          warnings: [],
          planHash: "vsp_testhash",
        },
      },
      tasks: [],
    };

    const result = regenerateVideoSegmentPromptFromReviewDataForTest({
      reviewData,
      segmentId: "seg_1",
      creativeBrief: "Make this calmer. ".repeat(180),
    });

    expect(result.prompt).toContain("User creative brief guidance:");
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "creative_brief_truncated_to_2000",
        source: "creative_brief",
      })
    );
  });
});

describe("optimizeStoryboardReviewSegmentPromptIfNeededForTest", () => {
  it("keeps short regenerated segment prompts unchanged", async () => {
    const optimizer = vi.fn();

    const result = await optimizeStoryboardReviewSegmentPromptIfNeededForTest({
      tenantId: "default",
      userId: 1,
      segmentId: "seg_1",
      sourcePrompt: "Short segment prompt.",
    }, optimizer as never);

    expect(result).toEqual({
      prompt: "Short segment prompt.",
      optimized: false,
      sourceLength: "Short segment prompt.".length,
      optimizedLength: "Short segment prompt.".length,
    });
    expect(optimizer).not.toHaveBeenCalled();
  });

  it("optimizes over-length regenerated segment prompts before returning them", async () => {
    const optimizedPrompt = "Compact segment prompt. ".repeat(70).trim();
    const optimizer = vi.fn().mockResolvedValue({
      value: {
        rawContent: `\`\`\`prompt\n${optimizedPrompt}\n\`\`\``,
      },
    });

    const result = await optimizeStoryboardReviewSegmentPromptIfNeededForTest({
      tenantId: "default",
      userId: 7,
      segmentId: "seg_long",
      sourcePrompt: "Long segment prompt. ".repeat(500),
      model: "higgsfield/seedance_2_0_fast",
    }, optimizer as never);

    expect(result.prompt).toBe(optimizedPrompt);
    expect(result.optimized).toBe(true);
    expect(result.sourceLength).toBeGreaterThan(2000);
    expect(result.optimizedLength).toBeLessThanOrEqual(2000);
    expect(optimizer).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "default",
      userId: 7,
      originSurface: "storyboard_review",
      unitId: "seg_long",
      model: "higgsfield/seedance_2_0_fast",
      maxOutputChars: 2000,
    }));
  });

  it("fails clearly when the optimizer still returns a prompt over the segment limit", async () => {
    const optimizer = vi.fn().mockResolvedValue({
      value: {
        rawContent: "Still too long. ".repeat(200),
      },
    });

    await expect(optimizeStoryboardReviewSegmentPromptIfNeededForTest({
      tenantId: "default",
      userId: 7,
      segmentId: "seg_too_long",
      sourcePrompt: "Long segment prompt. ".repeat(500),
    }, optimizer as never)).rejects.toThrow(
      "Storyboard Review segment prompt optimizer returned prompt over 2000 chars for segment seg_too_long",
    );
  });
});

describe("getStoryboardReviewHyperframes identity", () => {
  it("uses manual HyperFrames identity when Marketplace context is absent", () => {
    const reviewData = {
      version: 1,
      manualHyperframesProductId: "manual_product_1",
      manualHyperframesRunId: "manual_run_1",
      marketplaceContext: null,
      tasks: [],
    };

    expect(getStoryboardReviewHyperframesProductId(reviewData)).toBe("manual_product_1");
    expect(getStoryboardReviewHyperframesRunId(reviewData)).toBe("manual_run_1");
    expect(getStoryboardReviewAutoReviewRunId(reviewData)).toBe("");
  });

  it("prefers Marketplace identity over manual identity for captured products", () => {
    const reviewData = {
      version: 1,
      manualHyperframesProductId: "manual_product_1",
      manualHyperframesRunId: "manual_run_1",
      marketplaceContext: {
        productId: "mp_1",
        autoReviewRunId: "mar_1",
      },
      tasks: [],
    };

    expect(getStoryboardReviewHyperframesProductId(reviewData)).toBe("mp_1");
    expect(getStoryboardReviewHyperframesRunId(reviewData)).toBe("mar_1");
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
            'USER-SELECTED CREATIVE DIRECTION LOCK: Review tone: problem-frustrated review. Storytelling structure: Before -> After -> Bridge. Preserve this tone and story arc in rewritten video prompts unless it conflicts with product truth, policy, shot timing, or reference anchors. Create a 5-second cinematic video. Scene: Use @Image1 as start frame. Use @Image2 as stop frame. Characters: Use only the person or hands already visible in the frames. Audio: Native audio. Voice: young mother-style female voice, early 30s, soft warm voice, caring and comforting tone, slow natural delivery, central Thai accent. Dialogue must be spoken in natural Thai, central Thai accent. Dialogue: Presenter พูดเป็นภาษาไทยว่า "เมื่อไหร่ที่ทำกาแฟไม่สุด"',
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
          reviewTone: "irritated_problem",
          storytellingStructure: "before_after_bridge",
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
            primaryCharacterDetails:
              "ใบหน้าคม ผมสั้นสีดำ ตาสีน้ำตาล ใส่เสื้อเชิ้ตกรมท่า",
            secondaryCharacterDetails:
              "ผู้ช่วยผู้ชายวัยทำงานถือกล่องสินค้า",
            propDetails: "มีแมวสีขาวและแก้วกาแฟอยู่บนโต๊ะ",
          },
        },
      },
    }) as any;

    expect(repaired.tasks[0].prompt).toContain("VIDEO CHARACTER LOCK");
    expect(repaired.tasks[0].prompt).not.toContain(
      "USER-SELECTED CREATIVE DIRECTION LOCK",
    );
    expect(repaired.tasks[0].prompt).not.toContain("Storytelling structure");
    expect(repaired.tasks[0].prompt).not.toContain("Before -> After -> Bridge");
    expect(repaired.tasks[0].prompt).toContain(
      "Thai, male presenter/man, 30-39 years old"
    );
    expect(repaired.tasks[0].prompt).toContain("ใบหน้าคม");
    expect(repaired.tasks[0].prompt).toContain("ผู้ช่วยผู้ชายวัยทำงาน");
    expect(repaired.tasks[0].prompt).toContain("แมวสีขาว");
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

  it("preserves server-owned HyperFrames final state during normal review saves", () => {
    const existing = {
      version: 1,
      tasks: [{ id: "shot-1", updatedAt: 1000, url: "/files/coffee.mp4" }],
      hyperframesFinalComposite: {
        schemaVersion: 1,
        storyboardReviewProjectId: 66,
        canonicalProductId: "coffee-product",
        autoReviewRunId: "coffee-run",
        revision: 3,
        textVariables: {
          hookText: "BENO PRO-FLEX ชงกาแฟง่ายขึ้น",
        },
      },
    };
    const incoming = {
      version: 1,
      updatedAt: 7000,
      tasks: [{ id: "shot-1", updatedAt: 7000, url: "/files/coffee-v2.mp4" }],
      hyperframesFinalComposite: {
        schemaVersion: 1,
        storyboardReviewProjectId: 12,
        canonicalProductId: "baby-clothing-product",
        autoReviewRunId: "baby-run",
        revision: 9,
        textVariables: {
          hookText: "ชุดเด็กแรกเกิด",
        },
      },
    };

    expect(mergeFresherExistingReviewTasks(existing, incoming)).toMatchObject({
      updatedAt: 7000,
      tasks: [{ id: "shot-1", updatedAt: 7000, url: "/files/coffee-v2.mp4" }],
      hyperframesFinalComposite: existing.hyperframesFinalComposite,
    });
  });

  it("strips client-provided HyperFrames final state when no server-owned state exists", () => {
    const existing = {
      version: 1,
      tasks: [{ id: "shot-1", updatedAt: 1000, url: "/files/coffee.mp4" }],
    };
    const incoming = {
      version: 1,
      tasks: [{ id: "shot-1", updatedAt: 1000, url: "/files/coffee.mp4" }],
      hyperframesFinalComposite: {
        schemaVersion: 1,
        storyboardReviewProjectId: 12,
        canonicalProductId: "baby-clothing-product",
        autoReviewRunId: "baby-run",
        revision: 9,
      },
    };

    expect(mergeFresherExistingReviewTasks(existing, incoming)).not.toHaveProperty(
      "hyperframesFinalComposite",
    );
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
