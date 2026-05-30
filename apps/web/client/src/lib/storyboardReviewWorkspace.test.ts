import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFirstLastFrameStoryboardTasks,
  mergeFresherStoryboardReviewTasks,
  readStoryboardReviewDraft,
  replaceStoryboardVideoSlot,
  replaceStoryboardReferenceFrame,
  storyboardDraftToReviewTasks,
  STORYBOARD_REVIEW_DRAFT_STORAGE_KEY,
  type StoryboardReviewDraft,
} from "./storyboardReviewWorkspace";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildFirstLastFrameStoryboardTasks", () => {
  it("creates one queued video task per adjacent image pair", () => {
    const tasks = buildFirstLastFrameStoryboardTasks(
      [
        { url: "https://example.com/1.jpg", name: "Frame 1" },
        { url: "https://example.com/2.jpg", name: "Frame 2" },
        { url: "https://example.com/3.jpg", name: "Frame 3" },
      ],
      {
        model: "veo-3-1",
        aspectRatio: "9:16",
        duration: 8,
        extraParams: { resolution: "1080p" },
        now: 12345,
      },
    );

    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({
      id: "split-storyboard-12345-1",
      index: 0,
      status: "queued",
      type: "video",
      model: "veo-3-1",
      durationSeconds: 8,
    });
    expect(tasks[0]?.storyboardContext?.referenceImages.map((image) => image.url)).toEqual([
      "https://example.com/1.jpg",
      "https://example.com/2.jpg",
    ]);
    expect(tasks[1]?.storyboardContext?.referenceImages.map((image) => image.url)).toEqual([
      "https://example.com/2.jpg",
      "https://example.com/3.jpg",
    ]);
    expect(tasks[0]?.storyboardContext?.extraParams).toMatchObject({
      resolution: "1080p",
      generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO",
    });
    expect(tasks[0]?.prompt).toContain("Create an 8-second cinematic video.");
    expect(tasks[0]?.prompt).toContain("Scene:\n");
    expect(tasks[0]?.prompt).toContain("Action:\n");
    expect(tasks[0]?.prompt).toContain("Camera:\n");
    expect(tasks[0]?.prompt).toContain("Audio:\n");
    expect(tasks[0]?.prompt).toContain("Dialogue:\nNo spoken dialogue.");
  });

  it("keeps marketplace metadata on sliced frame storyboard tasks", () => {
    const marketplaceContext = {
      productId: "product-1",
      platform: "shopee" as const,
      productName: "Shelf bracket",
      shopName: "Fixture Shop",
      shopId: "shop-123",
      itemId: "item-456",
      sourceUrl: "https://shopee.example/item-456",
    };

    const tasks = buildFirstLastFrameStoryboardTasks(
      [
        { url: "https://example.com/1.jpg", name: "Frame 1", marketplaceProduct: marketplaceContext },
        { url: "https://example.com/2.jpg", name: "Frame 2", marketplaceProduct: marketplaceContext },
      ],
      {
        model: "veo-3-1",
        aspectRatio: "9:16",
        marketplaceContext,
        now: 12345,
      },
    );

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.marketplaceProduct).toEqual(marketplaceContext);
    expect(tasks[0]?.durationSeconds).toBe(8);
    expect(tasks[0]?.storyboardContext?.duration).toBe(8);
    expect(tasks[0]?.storyboardContext?.referenceImages).toEqual([
      { url: "https://example.com/1.jpg", name: "Frame 1", marketplaceProduct: marketplaceContext },
      { url: "https://example.com/2.jpg", name: "Frame 2", marketplaceProduct: marketplaceContext },
    ]);
    expect(tasks[0]?.storyboardContext?.extraParams).toMatchObject({
      marketplaceContext,
      storyboardShotDurationSeconds: 8,
      storyboardTotalDurationSeconds: 8,
    });
  });

  it("stores total storyboard timing from ordered frame count and shot duration", () => {
    const tasks = buildFirstLastFrameStoryboardTasks(
      [
        { url: "https://example.com/1.jpg" },
        { url: "https://example.com/2.jpg" },
        { url: "https://example.com/3.jpg" },
        { url: "https://example.com/4.jpg" },
      ],
      {
        model: "veo-3-1",
        aspectRatio: "9:16",
        duration: 6,
        now: 12345,
      },
    );

    expect(tasks).toHaveLength(3);
    expect(tasks.map((task) => task.durationSeconds)).toEqual([6, 6, 6]);
    expect(tasks[0]?.storyboardContext?.extraParams).toMatchObject({
      storyboardShotDurationSeconds: 6,
      storyboardTotalDurationSeconds: 18,
    });
    expect(tasks[2]?.prompt).toContain("Create a 6-second cinematic video.");
  });

  it("applies split storyboard speech and sound planner options to Veo prompts", () => {
    const marketplaceContext = {
      productId: "product-1",
      platform: "tiktok_shop" as const,
      productName: "โต๊ะข้างเตียง",
    };
    const conceptDetails = "PRODUCT FACTS LOCK: โต๊ะข้างเตียงไม้ 2 ชั้น สำหรับจัดของข้างเตียง. ห้ามเปลี่ยนประเภทสินค้า ขนาด จำนวนชั้น หรือสไตล์สินค้า.";

    const tasks = buildFirstLastFrameStoryboardTasks(
      [
        { url: "https://example.com/1.jpg", name: "Frame 1", marketplaceProduct: marketplaceContext },
        { url: "https://example.com/2.jpg", name: "Frame 2", marketplaceProduct: marketplaceContext },
      ],
      {
        model: "veo-3-1",
        aspectRatio: "9:16",
        duration: 8,
        marketplaceContext,
        includeVoiceover: true,
        speechMode: "th",
        speechLanguage: "Thai",
        includeSound: true,
        conceptDetails,
        storyboardGuide: `Concept and product facts:\n${conceptDetails}\n\nShot order: use Frame 1 as start and Frame 2 as end, then preserve continuity.`,
        promptTone: "sales",
        promptLanguage: "th",
        now: 12345,
      },
    );

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.prompt).toContain("Guide: Shot order: use Frame 1 as start and Frame 2 as end, then preserve continuity.");
    expect(tasks[0]?.prompt.match(/PRODUCT FACTS LOCK/g)).toHaveLength(1);
    expect(tasks[0]?.prompt).not.toContain("Product/concept details:");
    expect(tasks[0]?.prompt.length).toBeLessThan(2600);
    expect(tasks[0]?.storyboardContext?.extraParams?.storyboardGuide).toContain("Shot order");
    expect(tasks[0]?.prompt).not.toContain("Prompt planning options:");
    expect(tasks[0]?.prompt).toContain("Sound design: Soft ecommerce room tone");
    expect(tasks[0]?.prompt).toContain("Dialogue must be spoken in natural Thai, central Thai accent.");
    expect(tasks[0]?.prompt).toContain('Presenter พูดเป็นภาษาไทยว่า "มุมข้างเตียงรก ๆ แบบนี้');
    expect(tasks[0]?.prompt).not.toContain("ปัญหาหน้างาน");
    expect(tasks[0]?.prompt).not.toContain("ทางออกที่ใช้งานได้จริง");
    expect(tasks[0]?.storyboardContext?.extraParams?.storyboardPromptPlanner).toMatchObject({
      includeVoiceover: true,
      speechMode: "th",
      speechLanguage: "Thai",
      includeSound: true,
      tone: "sales",
      language: "th",
    });
  });

  it("propagates production context and uses supplied shot voiceover lines", () => {
    const productionContext = {
      productionRunId: "run-123",
      productionProjectTitle: "Bedside Shelf Launch",
      productionStoryConceptId: "concept-problem-solution",
      productionStoryConceptTitle: "Problem Solution",
      videoConcept: "Messy bedside corner becomes organized with a 3-tier shelf.",
      voiceoverFullScript: "VOICEOVER SCRIPT BY SHOT:1. 0-6.7s เปิดปัญหา: เคยไหม ของใช้เล็ก ๆ ข้างเตียงไม่มีที่อยู่ประจำ2. 6.7-13.3s ขยาย pain point: พอเจอทุกวัน มุมนั้นก็ใช้งานไม่ค่อยสบาย3. 13.3-20s สินค้าเข้ามาแก้: พอเอา Greenforst ชั้นวางข้างเตียงเข้ามา มุมนี้ก็เริ่มมีตำแหน่งชัดขึ้น",
      storyboardGuide: "Shot 1 opens on clutter, Shot 2 expands the pain point, Shot 3 introduces the product.",
      sourceGridUrl: "https://example.com/grid.jpg",
    };

    const tasks = buildFirstLastFrameStoryboardTasks(
      [
        { url: "https://example.com/1.jpg", name: "Frame 1", productionContext },
        { url: "https://example.com/2.jpg", name: "Frame 2", productionContext },
        { url: "https://example.com/3.jpg", name: "Frame 3", productionContext },
      ],
      {
        model: "veo-3-1",
        aspectRatio: "9:16",
        duration: 8,
        includeVoiceover: true,
        speechMode: "th",
        speechLanguage: "Thai",
        storyboardGuide: productionContext.storyboardGuide,
        voiceoverFullScript: productionContext.voiceoverFullScript,
        productionContext,
        now: 12345,
      },
    );

    expect(tasks).toHaveLength(2);
    expect(tasks[0]?.productionContext).toMatchObject({
      productionRunId: "run-123",
      productionStoryConceptId: "concept-problem-solution",
    });
    expect(tasks[0]?.storyboardContext?.productionContext).toMatchObject({
      productionRunId: "run-123",
    });
    expect(tasks[0]?.storyboardContext?.extraParams).toMatchObject({
      productionRunId: "run-123",
      productionStoryConceptId: "concept-problem-solution",
      voiceoverFullScript: expect.stringContaining("VOICEOVER SCRIPT BY SHOT"),
    });
    expect(tasks[0]?.prompt).toContain("เคยไหม ของใช้เล็ก ๆ ข้างเตียงไม่มีที่อยู่ประจำ");
    expect(tasks[1]?.prompt).toContain("พอเอา Greenforst ชั้นวางข้างเตียงเข้ามา");
    expect(tasks[0]?.prompt).toContain("Product fidelity lock");
  });

  it("uses natural Thai speech for child dining chair split storyboard prompts", () => {
    const marketplaceContext = {
      productId: "product-2",
      platform: "tiktok_shop" as const,
      productName: "เก้าอี้กินข้าวเด็ก",
    };
    const conceptDetails = "PRODUCT FACTS LOCK: เก้าอี้กินข้าวเด็ก โต๊ะกินข้าวเด็ก เด็ก 6 เดือน 3 in 1. หลังซื้อปรับระดับให้พอดีกับโต๊ะ แล้วคาดเข็มขัดนิรภัยให้ลูกนั่งได้ตำแหน่งเดิมทุกมื้อ.";

    const tasks = buildFirstLastFrameStoryboardTasks(
      [
        { url: "https://example.com/1.jpg", name: "Frame 1", marketplaceProduct: marketplaceContext },
        { url: "https://example.com/2.jpg", name: "Frame 2", marketplaceProduct: marketplaceContext },
        { url: "https://example.com/3.jpg", name: "Frame 3", marketplaceProduct: marketplaceContext },
      ],
      {
        model: "veo-3-1",
        aspectRatio: "9:16",
        duration: 8,
        marketplaceContext,
        includeVoiceover: true,
        speechMode: "th",
        speechLanguage: "Thai",
        includeSound: false,
        conceptDetails,
        now: 12345,
      },
    );

    expect(tasks).toHaveLength(2);
    expect(tasks[0]?.prompt).toContain('Presenter พูดเป็นภาษาไทยว่า "มื้ออาหารจะง่ายขึ้นมาก');
    expect(tasks[1]?.prompt).toContain('Presenter พูดเป็นภาษาไทยว่า "ทำซ้ำไม่กี่มื้อ');
    expect(tasks[0]?.prompt).not.toContain("Speaker 1:");
    expect(tasks[0]?.prompt).not.toContain("[energetic]");
    expect(tasks[0]?.prompt).not.toContain("ปัญหาหน้างาน");
  });

  it("does not create tasks without at least two usable images", () => {
    expect(buildFirstLastFrameStoryboardTasks([{ url: "https://example.com/1.jpg" }], { model: "veo-3-1", aspectRatio: "auto" })).toEqual([]);
    expect(buildFirstLastFrameStoryboardTasks([{ url: "" }, { url: "   " }], { model: "veo-3-1", aspectRatio: "auto" })).toEqual([]);
  });

  it("replaces shared boundary frames and invalidates affected queued videos", () => {
    const tasks = buildFirstLastFrameStoryboardTasks(
      [
        { url: "https://example.com/1.jpg", name: "Frame 1" },
        { url: "https://example.com/2.jpg", name: "Frame 2" },
        { url: "https://example.com/3.jpg", name: "Frame 3" },
      ],
      {
        model: "veo-3-1",
        aspectRatio: "9:16",
        now: 1000,
      },
    );
    const draft: StoryboardReviewDraft = {
      version: 1,
      updatedAt: 1000,
      taskIds: tasks.map((task) => task.id),
      selectedTaskIds: tasks.map((task) => task.id),
      tasks: tasks.map((task) => ({ ...task, status: "completed", url: `https://example.com/${task.id}.mp4` })),
      companionAudio: [],
      compoundStatus: "ready",
      projectLink: "/video-editor?projectId=1",
      renderJobId: "render-1",
    };

    const next = replaceStoryboardReferenceFrame(draft, {
      taskId: tasks[0]!.id,
      frameIndex: 1,
      image: { url: "https://example.com/replacement.jpg", name: "Replacement" },
      now: 2000,
      statusDetail: "Frame changed",
    });

    expect(next.projectLink).toBeNull();
    expect(next.renderJobId).toBeNull();
    expect(next.compoundStatus).toBeNull();
    expect(next.tasks[0]?.status).toBe("queued");
    expect(next.tasks[0]?.url).toBeUndefined();
    expect(next.tasks[0]?.storyboardContext?.referenceImages[1]?.url).toBe("https://example.com/replacement.jpg");
    expect(next.tasks[1]?.status).toBe("queued");
    expect(next.tasks[1]?.url).toBeUndefined();
    expect(next.tasks[1]?.storyboardContext?.referenceImages[0]?.url).toBe("https://example.com/replacement.jpg");
  });

  it("carries imported video aspect ratio into review tasks", () => {
    const draft: StoryboardReviewDraft = {
      version: 1,
      updatedAt: 1000,
      taskIds: ["imported-1"],
      selectedTaskIds: ["imported-1"],
      tasks: [
        {
          id: "imported-1",
          index: 0,
          status: "completed",
          type: "video",
          prompt: "Uploaded clip",
          model: "Imported",
          createdAt: 1000,
          updatedAt: 1000,
          url: "https://example.com/uploaded.mp4",
          source: "imported",
          aspectRatio: "9:16",
        },
      ],
      companionAudio: [],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
    };

    expect(storyboardDraftToReviewTasks(draft)[0]?.generationAspectRatio).toBe("9:16");
  });

  it("renders review tasks in saved taskIds order after refresh or merge", () => {
    const draft: StoryboardReviewDraft = {
      version: 1,
      updatedAt: 1000,
      taskIds: ["shot-1", "inserted-1", "shot-2"],
      selectedTaskIds: ["shot-1", "inserted-1", "shot-2"],
      tasks: [
        {
          id: "shot-1",
          index: 0,
          status: "completed",
          type: "video",
          prompt: "Shot 1",
          model: "veo",
          createdAt: 1000,
          updatedAt: 1000,
          url: "/files/shot-1.mp4",
        },
        {
          id: "shot-2",
          index: 2,
          status: "completed",
          type: "video",
          prompt: "Shot 2",
          model: "veo",
          createdAt: 1000,
          updatedAt: 1000,
          url: "/files/shot-2.mp4",
        },
        {
          id: "inserted-1",
          index: 1,
          status: "completed",
          type: "image",
          prompt: "Inserted upload",
          model: "Uploaded",
          durationSeconds: 6,
          transition: { name: "crossfade", durationMs: 500, alignment: "center" },
          createdAt: 2000,
          updatedAt: 2000,
          url: "/files/inserted.jpg",
          source: "imported",
        },
      ],
      companionAudio: [],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
    };

    expect(storyboardDraftToReviewTasks(draft).map((task) => task.id)).toEqual([
      "shot-1",
      "inserted-1",
      "shot-2",
    ]);
    expect(storyboardDraftToReviewTasks(draft)[1]).toMatchObject({
      mediaType: "image",
      durationSeconds: 6,
      transition: { name: "crossfade", durationMs: 500, alignment: "center" },
      canRegenerate: false,
      isImported: true,
    });
  });

  it("replaces a video slot with the uploaded clip and invalidates stale render links", () => {
    const draft: StoryboardReviewDraft = {
      version: 1,
      reviewId: 12,
      updatedAt: 1000,
      taskIds: ["shot-1"],
      selectedTaskIds: [],
      tasks: [
        {
          id: "shot-1",
          index: 0,
          status: "completed",
          type: "video",
          prompt: "Old generated clip",
          model: "veo-3-1",
          createdAt: 900,
          updatedAt: 1000,
          url: "https://example.com/old.mp4",
          storyboardContext: {
            aspectRatio: "16:9",
            model: "veo-3-1",
            referenceImages: [],
            referenceVideos: [],
          },
        },
      ],
      companionAudio: [],
      compoundStatus: "Rendered old project",
      projectLink: "/video-editor?projectId=old",
      renderJobId: "old-render",
    };

    const next = replaceStoryboardVideoSlot(draft, {
      taskId: "shot-1",
      mode: "replace",
      now: 2000,
      importedTask: {
        id: "uploaded-video-replace-1",
        index: 0,
        status: "completed",
        type: "video",
        prompt: "Uploaded replacement",
        model: "Uploaded video",
        durationSeconds: 6,
        createdAt: 2000,
        updatedAt: 2000,
        url: "https://example.com/new.mp4",
        source: "imported",
        aspectRatio: "9:16",
      },
    });

    expect(next.updatedAt).toBe(2000);
    expect(next.taskIds).toEqual(["shot-1"]);
    expect(next.selectedTaskIds).toEqual(["shot-1"]);
    expect(next.projectLink).toBeNull();
    expect(next.renderJobId).toBeNull();
    expect(next.compoundStatus).toBeNull();
    expect(next.tasks[0]).toMatchObject({
      id: "shot-1",
      index: 0,
      status: "completed",
      url: "https://example.com/new.mp4",
      source: "imported",
      aspectRatio: "9:16",
      createdAt: 900,
      updatedAt: 2000,
    });
    expect(next.tasks[0]?.storyboardContext).toMatchObject({
      aspectRatio: "16:9",
      model: "veo-3-1",
    });
  });

  it("keeps fresher task media when merging a stale draft with a newer timestamp", () => {
    const existing = {
      version: 1 as const,
      updatedAt: 3000,
      taskIds: ["shot-1"],
      selectedTaskIds: ["shot-1"],
      tasks: [
        {
          id: "shot-1",
          index: 0,
          status: "completed" as const,
          type: "video",
          prompt: "v7.mp4",
          model: "Uploaded",
          createdAt: 1000,
          updatedAt: 3000,
          url: "/files/v7.mp4",
        },
      ],
      companionAudio: [],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
    };
    const incoming = {
      ...existing,
      updatedAt: 4000,
      compoundStatus: "Recovered storyboard review",
      tasks: [
        {
          ...existing.tasks[0]!,
          updatedAt: 1000,
          url: "/files/v4.mp4",
        },
      ],
    };

    expect(mergeFresherStoryboardReviewTasks(existing, incoming)).toMatchObject({
      updatedAt: 4000,
      compoundStatus: "Recovered storyboard review",
      tasks: [{ id: "shot-1", updatedAt: 3000, url: "/files/v7.mp4" }],
    });
  });

  it("keeps an imported inserted shot when a refreshed draft does not include it yet", () => {
    const existing: StoryboardReviewDraft = {
      version: 1,
      reviewId: 12,
      updatedAt: 3000,
      taskIds: ["shot-1", "inserted-1", "shot-2"],
      selectedTaskIds: ["shot-1", "inserted-1"],
      tasks: [
        {
          id: "shot-1",
          index: 0,
          status: "completed",
          type: "video",
          prompt: "Shot 1",
          model: "veo",
          createdAt: 1000,
          updatedAt: 1000,
          url: "/files/shot-1.mp4",
        },
        {
          id: "inserted-1",
          index: 1,
          status: "completed",
          type: "video",
          prompt: "Inserted upload",
          model: "Uploaded",
          createdAt: 3000,
          updatedAt: 3000,
          url: "/files/inserted.mp4",
          source: "imported",
        },
        {
          id: "shot-2",
          index: 2,
          status: "completed",
          type: "video",
          prompt: "Shot 2",
          model: "veo",
          createdAt: 1000,
          updatedAt: 1000,
          url: "/files/shot-2.mp4",
        },
      ],
      companionAudio: [],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
    };
    const incoming: StoryboardReviewDraft = {
      ...existing,
      updatedAt: 3500,
      taskIds: ["shot-1", "shot-2"],
      selectedTaskIds: ["shot-1"],
      tasks: existing.tasks.filter((task) => task.id !== "inserted-1"),
    };

    expect(mergeFresherStoryboardReviewTasks(existing, incoming)).toMatchObject({
      taskIds: ["shot-1", "inserted-1", "shot-2"],
      selectedTaskIds: ["shot-1", "inserted-1"],
      tasks: expect.arrayContaining([
        expect.objectContaining({ id: "inserted-1", source: "imported", url: "/files/inserted.mp4" }),
      ]),
    });
  });

  it("keeps locally added companion audio when a stale refreshed draft does not include it yet", () => {
    const existing: StoryboardReviewDraft = {
      version: 1,
      reviewId: 12,
      updatedAt: 4000,
      companionAudioUpdatedAt: 5000,
      taskIds: ["shot-1"],
      selectedTaskIds: ["shot-1"],
      tasks: [
        {
          id: "shot-1",
          index: 0,
          status: "completed",
          type: "video",
          prompt: "Shot 1",
          model: "veo",
          createdAt: 1000,
          updatedAt: 1000,
          url: "/files/shot-1.mp4",
        },
      ],
      companionAudio: [
        {
          id: "audio-new",
          url: "/files/new-audio.mp3",
          title: "New narration",
          prompt: "New narration",
          model: "uvoice/tts-natural",
          kind: "voiceover",
          targetDurationSeconds: 45,
        },
      ],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
    };
    const incoming: StoryboardReviewDraft = {
      ...existing,
      updatedAt: 3500,
      companionAudioUpdatedAt: 3000,
      companionAudio: [],
    };

    expect(mergeFresherStoryboardReviewTasks(existing, incoming)).toMatchObject({
      companionAudioUpdatedAt: 5000,
      companionAudio: [
        expect.objectContaining({ id: "audio-new", url: "/files/new-audio.mp3" }),
      ],
    });
  });

  it("keeps a newer local companion audio removal instead of restoring older server audio", () => {
    const existing: StoryboardReviewDraft = {
      version: 1,
      reviewId: 12,
      updatedAt: 5000,
      companionAudioUpdatedAt: 5000,
      taskIds: ["shot-1"],
      selectedTaskIds: ["shot-1"],
      tasks: [
        {
          id: "shot-1",
          index: 0,
          status: "completed",
          type: "video",
          prompt: "Shot 1",
          model: "veo",
          createdAt: 1000,
          updatedAt: 1000,
          url: "/files/shot-1.mp4",
        },
      ],
      companionAudio: [],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
    };
    const incoming: StoryboardReviewDraft = {
      ...existing,
      updatedAt: 6000,
      companionAudioUpdatedAt: 4000,
      companionAudio: [
        {
          id: "audio-old",
          url: "/files/old-audio.mp3",
          title: "Old narration",
          prompt: "Old narration",
          model: "uvoice/tts-natural",
          kind: "voiceover",
        },
      ],
    };

    expect(mergeFresherStoryboardReviewTasks(existing, incoming)).toMatchObject({
      companionAudioUpdatedAt: 5000,
      companionAudio: [],
    });
  });

  it("does not let legacy audio without an explicit audio timestamp overwrite newer audio", () => {
    const existing: StoryboardReviewDraft = {
      version: 1,
      reviewId: 12,
      updatedAt: 5000,
      companionAudioUpdatedAt: 5000,
      taskIds: ["shot-1"],
      selectedTaskIds: ["shot-1"],
      tasks: [
        {
          id: "shot-1",
          index: 0,
          status: "completed",
          type: "video",
          prompt: "Shot 1",
          model: "veo",
          createdAt: 1000,
          updatedAt: 1000,
          url: "/files/shot-1.mp4",
        },
      ],
      companionAudio: [
        {
          id: "audio-new",
          url: "/files/new-audio.mp3",
          title: "New narration",
          prompt: "New narration",
          model: "uvoice/tts-natural",
          kind: "voiceover",
        },
      ],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
    };
    const incoming = {
      ...existing,
      updatedAt: 6000,
      companionAudioUpdatedAt: null,
      companionAudio: [
        {
          id: "audio-old",
          url: "/files/old-audio.mp3",
          title: "Old music",
          prompt: "Old music",
          model: "imported",
          kind: "music" as const,
        },
      ],
    };

    expect(mergeFresherStoryboardReviewTasks(existing, incoming)).toMatchObject({
      companionAudioUpdatedAt: 5000,
      companionAudio: [
        expect.objectContaining({ id: "audio-new", url: "/files/new-audio.mp3" }),
      ],
    });
  });

  it("does not hydrate legacy stored audio without an explicit audio timestamp", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    });
    storage.set(STORYBOARD_REVIEW_DRAFT_STORAGE_KEY, JSON.stringify({
      version: 1,
      reviewId: 12,
      updatedAt: Date.now(),
      taskIds: ["shot-1"],
      selectedTaskIds: ["shot-1"],
      tasks: [
        {
          id: "shot-1",
          index: 0,
          status: "completed",
          type: "video",
          prompt: "Shot 1",
          model: "veo",
          createdAt: 1000,
          updatedAt: 1000,
          url: "/files/shot-1.mp4",
        },
      ],
      companionAudio: [
        {
          id: "audio-old",
          url: "/files/old-audio.mp3",
          title: "Old music",
          prompt: "Old music",
          model: "imported",
          kind: "music",
        },
      ],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
    }));

    expect(readStoryboardReviewDraft()).toMatchObject({
      companionAudio: [],
      companionAudioUpdatedAt: null,
    });
  });

  it("hydrates edited voiceover script planning preference from storage", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    });
    storage.set(STORYBOARD_REVIEW_DRAFT_STORAGE_KEY, JSON.stringify({
      version: 1,
      updatedAt: Date.now(),
      taskIds: ["shot-1"],
      selectedTaskIds: ["shot-1"],
      tasks: [],
      companionAudio: [],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
      voiceoverFullScript: "Edited full narration",
      useVoiceoverScriptAsConcept: true,
    }));

    expect(readStoryboardReviewDraft()).toMatchObject({
      voiceoverFullScript: "Edited full narration",
      useVoiceoverScriptAsConcept: true,
    });
  });
});
