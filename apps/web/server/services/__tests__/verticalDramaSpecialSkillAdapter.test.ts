import { describe, expect, it, vi } from "vitest";
import {
  buildSpecialTieInStoryboard,
  buildSpecialTieInSceneSlot,
  buildDeterministicSpecialTieInFallback,
  buildSpecialTieInPromptArtifacts,
  buildSpecialPrompt,
  clearSpecialPromptDrafts,
  extractSpecialExactDialogueLines,
  generateSpecialSkillOutput,
  normalizeSpecialSkillOutput,
  resolveSpecialProductReferenceUrls,
  resolveSpecialSkillRoot,
  validateSpecialTieInStoryOutput,
  validateSpecialSkillOutput,
} from "../verticalDramaSpecialSkillAdapter";
import {
  specialTieInInputSchema,
  type SpecialEpisodeData,
} from "../../../shared/verticalDramaSeries/specialTieInContracts";

vi.mock("../verticalDramaSpecialReferences", () => ({
  reconcileSpecialLocationSlot: vi.fn(),
  reconcileSpecialStorySceneSlot: vi.fn(),
  resolveSpecialReferenceBindings: vi.fn(async (_actor, bindings) =>
    bindings.map(binding => ({
      ...binding,
      authorizedUrl: `https://cdn.example/${binding.mediaAssetId}.png`,
    }))
  ),
}));
vi.mock("../verticalDramaSpecialModelCatalog", () => ({
  listSpecialTieInModels: vi.fn(async () => ({
    imageModels: [{ modelId: "image-model" }],
    videoModels: [{ modelId: "video-model" }],
  })),
}));
vi.mock("../mcpConnectionService", () => ({
  listConnectedMcpProviderKeys: vi.fn(async () => []),
}));
vi.mock("../verticalDramaStoryBible", () => ({
  executeJsonPlanningCallWithRetry: vi.fn(),
  resolveStoryBibleModel: vi.fn(async () => "test-model"),
}));

const shot = (number: number) => ({
  shot_number: number,
  story_summary: `story beat ${number}: the selected tie-in action continues`,
  image_prompt: "start frame",
  video_prompt: "motion prompt",
  reference_ids: [],
  continuity_in:
    number === 1 ? "opening state" : `continues from anchor-${number - 1}`,
  continuity_out: "hands the action to the next beat",
  continuity_anchor: `anchor-${number}`,
  tie_in_stage: "context_setup" as const,
  tie_in_action: "characters establish the reviewed tie-in setting",
  speaking_turns: [],
});
describe("special skill output contract", () => {
  it("derives the normal Scenes-slot description from the reviewed idea", () => {
    const scene = buildSpecialTieInSceneSlot({
      idea: "เด็กทดลองของเล่นกับผู้ใหญ่",
      marketplaceReviewIdea: {
        scene: {
          location: "ห้องนั่งเล่น",
          time: "ตอนเช้า",
          atmosphere: "อบอุ่น",
          beats: ["เปิดกล่อง", "ทดลองเล่น"],
        },
      },
    } as unknown as SpecialEpisodeData["input"]);

    expect(scene.label).toBe("ห้องนั่งเล่น");
    expect(scene.description).toContain("เวลา: ตอนเช้า");
    expect(scene.description).toContain("จังหวะฉาก 2: ทดลองเล่น");
  });

  it("binds all nine special shots to the normal scene storyboard track", () => {
    const storyboard = buildSpecialTieInStoryboard(
      {
        idea: "เด็กทดลองของเล่นกับผู้ใหญ่ในห้องนั่งเล่น",
        marketplaceReviewIdea: {
          scene: {
            location: "ห้องนั่งเล่น",
            time: "ตอนเช้า",
            atmosphere: "อบอุ่น",
            beats: ["เปิดกล่อง", "ทดลองเล่น"],
          },
        },
      } as unknown as SpecialEpisodeData["input"],
      "tie-in-scene-key"
    );

    expect(storyboard.distinct_locations).toEqual([
      expect.objectContaining({
        location_key: "tie-in-scene-key",
        location_name: "ห้องนั่งเล่น",
        shot_numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      }),
    ]);
  });

  it("materializes tie-in story beats as normal storyboard shots while keeping the scene track", () => {
    const storyboard = buildSpecialTieInStoryboard(
      {
        idea: "เด็กทดลองของเล่นในห้องนั่งเล่น",
        marketplaceReviewIdea: {
          scene: {
            location: "ห้องนั่งเล่น",
            time: "ตอนเช้า",
            atmosphere: "อบอุ่น",
            beats: ["เปิดกล่อง"],
          },
        },
      } as unknown as SpecialEpisodeData["input"],
      "tie-in-scene-key",
      "ห้องนั่งเล่น",
      [
        {
          shotNumber: 1,
          summary: "เด็กเปิดกล่องของเล่นบนพื้นห้องนั่งเล่น",
          action: "เด็กหยิบชิ้นส่วนออกมาและเริ่มทดลองเล่นจริง",
          requiredCharacterRefs: ["child"],
          durationSeconds: 10,
        },
      ]
    );

    expect(storyboard.distinct_locations[0].shot_numbers).toHaveLength(9);
    expect(storyboard.shots).toEqual([
      expect.objectContaining({
        shot_number: 1,
        shotNumber: 1,
        visual_description: "เด็กเปิดกล่องของเล่นบนพื้นห้องนั่งเล่น",
        description: "เด็กเปิดกล่องของเล่นบนพื้นห้องนั่งเล่น",
        action: "เด็กหยิบชิ้นส่วนออกมาและเริ่มทดลองเล่นจริง",
        required_character_refs: ["child"],
        duration_seconds: 10,
      }),
    ]);
  });

  it("materializes a story-first summary from the skill's breakdown before prompts are consumed", () => {
    const normalized = normalizeSpecialSkillOutput({
      status: "ready",
      aspect_ratio: "9:16",
      shot_duration_seconds: 10,
      shot_count: 1,
      shots: [
        {
          shot_number: 1,
          title: "Product use",
          purpose: "The selected character applies the reviewed product in the original scene",
          prompt: "A production-ready prompt with enough detail for the selected scene",
          keyframe_plan: { start_frame: "the generated frame" },
          reference_lock: {
            person_reference_ids: [],
            product_reference_ids: ["reference_1"],
          },
          sub_shots: [],
        },
      ],
    }) as { shots: Array<{ story_summary?: string }> };

    expect(normalized.shots[0]?.story_summary).toBe(
      "The selected character applies the reviewed product in the original scene"
    );
  });

  it("builds a complete fallback draft that passes the product and dialogue gates", () => {
    const specialInput = specialTieInInputSchema.parse({
      idea: "เด็กหยิบของเล่นที่เลือกไว้มาเล่นกับผู้ใหญ่ในห้องนั่งเล่นจนเห็นผลลัพธ์",
      referenceType: "product",
      referenceImages: [
        { mediaAssetId: "4974", source: "marketplace_capture", role: "product" },
      ],
      characterIds: ["1", "2"],
      speakerCharacterIds: ["1"],
      dialogueMode: "character_dialogue",
      dialogueBrief: "แม่: ลองเล่นดูนะ\nแม่: ค่อย ๆ ทำไปทีละขั้น",
      durationSeconds: 10,
      aspectRatio: "9:16",
      imageModelId: "image-model",
      videoModelId: "video-model",
    });
    const bindings = [
      {
        skillReferenceId: "character_main",
        role: "person" as const,
        mediaAssetId: "4676",
        provenance: { characterId: "1", characterKey: "main" },
      },
      {
        skillReferenceId: "character_child",
        role: "person" as const,
        mediaAssetId: "4747",
        provenance: { characterId: "2", characterKey: "child" },
      },
      {
        skillReferenceId: "reference_1",
        role: "product" as const,
        mediaAssetId: "4974",
        provenance: {},
      },
    ];

    const output = buildDeterministicSpecialTieInFallback({
      specialInput,
      bindings,
      failureReason: "provider JSON was malformed",
    });

    expect(output.shots).toHaveLength(9);
    expect(output.shots.map(current => current.shot_number)).toEqual(
      Array.from({ length: 9 }, (_, index) => index + 1)
    );
    expect(output.shots.every(current => current.reference_ids.includes("reference_1"))).toBe(true);
    expect(output.shots.every(current => current.speaking_turns.length > 0)).toBe(true);
    expect(output.shots.every(current => (current.story_summary?.length ?? 0) >= 8)).toBe(true);
    expect(output.shots.slice(0, 2).map(current => current.speaking_turns[0]?.exact_dialogue)).toEqual([
      "ลองเล่นดูนะ",
      "ค่อย ๆ ทำไปทีละขั้น",
    ]);
    expect(output.shots.every(current => current.speaking_turns.length === 2)).toBe(true);
    expect(new Set(output.shots.map(current => current.tie_in_stage))).toEqual(
      new Set(["preparation", "demonstration", "hands_on_use", "result", "context_setup", "introduction", "retry", "hero"])
    );
    expect(() =>
      validateSpecialTieInStoryOutput({
        output,
        specialInput,
        bindings,
      })
    ).not.toThrow();
  });

  it("discards provider prompt drafts because prompt safety runs in the normal per-shot flow", async () => {
    const specialInput = specialTieInInputSchema.parse({
      idea: "ตัวละครสาธิตสินค้าที่เลือกในฉากเดิมอย่างปลอดภัย",
      referenceType: "product",
      referenceImages: [
        { mediaAssetId: "4974", source: "marketplace_capture", role: "product" },
      ],
      characterIds: [],
      speakerCharacterIds: [],
      dialogueMode: "none",
      imageModelId: "image-model",
      videoModelId: "video-model",
    });
    const bindings = [
      {
        skillReferenceId: "reference_1",
        role: "product" as const,
        mediaAssetId: "4974",
        provenance: {},
      },
    ];
    const unsafeCandidate = buildDeterministicSpecialTieInFallback({
      specialInput,
      bindings,
      failureReason: "test candidate",
    });
    unsafeCandidate.shots = unsafeCandidate.shots.map(current => ({
      ...current,
      image_prompt: "A child is forced to move before the adult is ready.",
      video_prompt: "A child is forced to move before the adult is ready.",
    }));
    const fallbackEvents: unknown[] = [];

    const output = await generateSpecialSkillOutput({
      actor: { tenantId: "tenant-test", userId: 1 },
      seriesId: 53,
      specialData: { input: specialInput } as unknown as SpecialEpisodeData,
      bindings,
      execute: async () => unsafeCandidate,
      forensics: {
        onFallback: event => fallbackEvents.push(event),
      },
    });

    expect(output.shots).toHaveLength(9);
    expect(output.shots.every(current => current.image_prompt === "")).toBe(true);
    expect(output.shots.every(current => current.video_prompt === "")).toBe(true);
    expect(fallbackEvents).toHaveLength(0);
  });

  it("keeps location/store references out of the additive product track", () => {
    expect(
      resolveSpecialProductReferenceUrls([
        {
          role: "product",
          mediaAssetId: "4974",
          skillReferenceId: "reference_1",
          provenance: {},
          authorizedUrl: "https://cdn.example/product.png",
        },
        {
          role: "location",
          mediaAssetId: "4975",
          skillReferenceId: "reference_2",
          provenance: {},
          authorizedUrl: "https://cdn.example/location.png",
        },
        {
          role: "store",
          mediaAssetId: "4976",
          skillReferenceId: "reference_3",
          provenance: {},
          authorizedUrl: "https://cdn.example/store.png",
        },
      ])
    ).toEqual(["https://cdn.example/product.png"]);
  });

  it("normalizes the installed skill's canonical shot fields before contract validation", () => {
    const canonical = {
      status: "ready",
      aspect_ratio: "9:16",
      shot_duration_seconds: 10,
      shot_count: 9,
      shots: Array.from({ length: 9 }, (_, index) => ({
        shot_number: index + 1,
        prompt: `ต่อเนื่องจากฉากเดิม ช็อต ${index + 1}`,
        keyframe_plan: { start_frame: `ฉากเดิม ช็อต ${index + 1}` },
        reference_lock: {
          person_reference_ids: ["character_main"],
          product_reference_ids: ["reference_1"],
        },
        product_handling: index === 4 ? "controlled_use" : "controlled_handling",
        dialogue_mode: "none",
        sub_shots: [{ action: "ตัวละครหยิบและใช้สินค้าที่เลือกอย่างต่อเนื่อง" }],
      })),
    };

    const output = validateSpecialSkillOutput(canonical);
    expect(output.shots).toHaveLength(9);
    expect(output.shots[0]?.image_prompt).toBe("");
    expect(output.shots[0]?.video_prompt).toBe("");
    expect(output.shots[4]?.tie_in_stage).toBe("hands_on_use");
  });

  it("accepts story-only planning output without requiring either paid prompt", () => {
    const result = validateSpecialSkillOutput({
      status: "ready",
      aspect_ratio: "9:16",
      shot_duration_seconds: 10,
      shot_count: 9,
      shots: Array.from({ length: 9 }, (_, index) => {
        const { image_prompt: _imagePrompt, video_prompt: _videoPrompt, ...storyOnlyShot } =
          shot(index + 1);
        return storyOnlyShot;
      }),
    });

    expect(result.shots.every(current => current.image_prompt === "")).toBe(true);
    expect(result.shots.every(current => current.video_prompt === "")).toBe(true);
  });

  it("instructs the special planner to defer both prompt stages", () => {
    const input = specialTieInInputSchema.parse({
      idea: "ตัวละครสาธิตสินค้าที่เลือกในฉากเดิม",
      referenceType: "product",
      referenceImages: [
        { mediaAssetId: "product-1", source: "marketplace_capture", role: "product" },
      ],
      characterIds: [],
      speakerCharacterIds: [],
      dialogueMode: "none",
      imageModelId: "image-model",
      videoModelId: "video-model",
    });
    const prompts = buildSpecialPrompt(
      input,
      {
        skill: "base skill",
        rules: "base rules",
        inputSchema: "base input schema",
        outputSchema: "base output schema",
        uiSchema: "base ui schema",
      },
      []
    );

    expect(prompts.systemPrompt).toContain(
      "Do NOT author image_prompt or video_prompt now"
    );
    expect(prompts.systemPrompt).toContain(
      "Empty image_prompt and video_prompt values are correct and expected"
    );
    expect(prompts.systemPrompt).not.toContain(
      "Then write image_prompt and video_prompt from that story_summary"
    );
  });

  it("clears provider prompt drafts before the special output enters the normal flow", () => {
    const output = validateSpecialSkillOutput({
      status: "ready",
      aspect_ratio: "9:16",
      shot_duration_seconds: 10,
      shot_count: 9,
      shots: Array.from({ length: 9 }, (_, index) => shot(index + 1)),
    });

    const cleared = clearSpecialPromptDrafts(output);
    expect(cleared.shots.every(current => current.image_prompt === "")).toBe(true);
    expect(cleared.shots.every(current => current.video_prompt === "")).toBe(true);
    expect(cleared.shots.map(current => current.story_summary)).toEqual(
      output.shots.map(current => current.story_summary)
    );
  });

  it("resolves the skill from both repo-root and web-root worker cwd layouts", async () => {
    const repoRoot = "/home/dev/projects/SmartSpecPro";
    const skillRoot = `${repoRoot}/apps/web/skills/idea-to-video-prompt`;

    await expect(resolveSpecialSkillRoot(repoRoot)).resolves.toBe(skillRoot);
    await expect(resolveSpecialSkillRoot(`${repoRoot}/apps/web`)).resolves.toBe(
      skillRoot
    );
    await expect(
      resolveSpecialSkillRoot(`${repoRoot}/apps/web/server`)
    ).resolves.toBe(skillRoot);
  });

  it("accepts exactly nine sequential shots", () => {
    const result = validateSpecialSkillOutput({
      status: "ready",
      aspect_ratio: "9:16",
      shot_duration_seconds: 12,
      shot_count: 9,
      shots: Array.from({ length: 9 }, (_, index) => shot(index + 1)),
    });
    expect(result.shots).toHaveLength(9);
  });

  it("accepts a complete reviewed dialogue spread across the nine shots", () => {
    const result = validateSpecialSkillOutput({
      status: "ready",
      aspect_ratio: "9:16",
      shot_duration_seconds: 10,
      shot_count: 9,
      dialogue: {
        mode: "character_dialogue",
        speaker_count: 1,
        speaker_reference_ids: ["character_main"],
        speaking_turns: Array.from({ length: 6 }, (_, index) => ({
          speaker_reference_id: "character_main",
          exact_dialogue: `line ${index + 1}`,
        })),
      },
      shots: Array.from({ length: 9 }, (_, index) => shot(index + 1)),
    });
    expect(result.dialogue?.speaking_turns).toHaveLength(6);
  });

  it("persists every validated shot into both prompt artifacts", () => {
    const output = {
      status: "ready" as const,
      aspect_ratio: "9:16" as const,
      shot_duration_seconds: 10 as const,
      shot_count: 9 as const,
      shots: Array.from({ length: 9 }, (_, index) => ({
        ...shot(index + 1),
        image_prompt: `image ${index + 1}`,
        video_prompt: `video ${index + 1}`,
        reference_ids: ["character_main", "reference_1", "reference_2"],
      })),
    };
    const specialData = {
      input: { imageModelId: "image-model", videoModelId: "video-model" },
      referenceBindings: [
        {
          role: "person" as const,
          mediaAssetId: "4676",
          skillReferenceId: "character_main",
          provenance: { characterKey: "main" },
        },
        {
          role: "product" as const,
          mediaAssetId: "4974",
          skillReferenceId: "reference_1",
          provenance: {},
        },
        {
          role: "product" as const,
          mediaAssetId: "4975",
          skillReferenceId: "reference_2",
          provenance: {},
        },
      ],
    } as unknown as SpecialEpisodeData;

    const artifacts = buildSpecialTieInPromptArtifacts({
      specialData,
      output,
      productReferenceUrls: [
        "https://cdn.example/product-front.png",
        "https://cdn.example/product-side.png",
      ],
    });

    expect(artifacts.startFramePlan?.frames).toHaveLength(9);
    expect(artifacts.motionPromptPack?.clips).toHaveLength(9);
    expect(artifacts.startFramePlan?.frames[8]?.shotNumber).toBe(9);
    expect(artifacts.motionPromptPack?.clips[8]?.clipNumber).toBe(9);
    expect(artifacts.motionPromptPack?.clips[8]?.durationSeconds).toBe(10);
    expect(artifacts.startFramePlan?.frames[0]?.productReferenceAssetIds).toEqual([
      "https://cdn.example/product-front.png",
      "https://cdn.example/product-side.png",
    ]);
    expect(artifacts.startFramePlan?.frames[0]?.sceneDescription).toContain(
      "ห้ามใช้ภาพสินค้าแทนฉาก"
    );
    expect(artifacts.startFramePlan?.frames[0]?.referenceAssetIds).toEqual([
      "character_main",
    ]);
    expect(artifacts.startFramePlan?.frames[0]?.imagePrompt).toBe("");
    expect(artifacts.motionPromptPack?.clips[0]?.extraReferenceAssetIds).toEqual([
      "4974",
      "4975",
    ]);
    expect(artifacts.startFramePlan?.frames[0]?.imagePrompt).toBe("");
    expect(artifacts.startFramePlan?.frames[0]?.canonicalShotSummary).toBe(
      "เรื่องย่อช็อต: story beat 1: the selected tie-in action continues การกระทำ Tie-in ที่ต้องเห็นจริง: characters establish the reviewed tie-in setting ความต่อเนื่องไปช็อตถัดไป: hands the action to the next beat"
    );
    expect(artifacts.startFramePlan?.frames[0]?.canonicalShotSummary).not.toContain(
      "start frame"
    );
    expect(artifacts.motionPromptPack?.clips[0]?.prompt).toBe("");
  });

  it("writes a special location reference to the scene track", () => {
    const output = {
      status: "ready" as const,
      aspect_ratio: "9:16" as const,
      shot_duration_seconds: 10 as const,
      shot_count: 9 as const,
      shots: Array.from({ length: 9 }, (_, index) => shot(index + 1)),
    };
    const artifacts = buildSpecialTieInPromptArtifacts({
      specialData: {
        input: { imageModelId: "image-model", videoModelId: "video-model" },
        referenceBindings: [],
      } as unknown as SpecialEpisodeData,
      output,
      productReferenceUrls: [],
      locationKey: "special-cafe",
    });

    expect(artifacts.startFramePlan?.frames[0]?.locationKey).toBe(
      "special-cafe"
    );
    expect(artifacts.startFramePlan?.frames[0]?.productReferenceAssetIds).toEqual(
      []
    );
  });

  it("keeps the selected cast names and defers both paid prompt stages", () => {
    const output = {
      status: "ready" as const,
      aspect_ratio: "9:16" as const,
      shot_duration_seconds: 10 as const,
      shot_count: 9 as const,
      shots: Array.from({ length: 9 }, (_, index) => ({
        ...shot(index + 1),
        speaking_turns: [
          { speaker_reference_id: "speaker_a", exact_dialogue: `บรรทัด ${index + 1} ก` },
          { speaker_reference_id: "speaker_b", exact_dialogue: `บรรทัด ${index + 1} ข` },
        ],
      })),
    };
    const artifacts = buildSpecialTieInPromptArtifacts({
      specialData: {
        input: {
          imageModelId: "image-model",
          videoModelId: "video-model",
          characterIds: ["1", "2"],
        },
        referenceBindings: [
          {
            role: "person" as const,
            mediaAssetId: "1",
            skillReferenceId: "speaker_a",
            provenance: { characterId: "1", characterKey: "mother" },
          },
          {
            role: "person" as const,
            mediaAssetId: "2",
            skillReferenceId: "speaker_b",
            provenance: { characterId: "2", characterKey: "child" },
          },
        ],
      } as unknown as SpecialEpisodeData,
      output,
      productReferenceUrls: [],
    });
    expect(artifacts.startFramePlan?.frames.every(frame => frame.imagePrompt === "")).toBe(true);
    expect(artifacts.motionPromptPack?.clips.every(clip => clip.prompt === "")).toBe(true);
    expect(artifacts.motionPromptPack?.clips[0]?.dialogue?.map(line => line.characterKey)).toEqual([
      "mother",
      "child",
    ]);
    expect(artifacts.motionPromptPack?.clips.every(clip => clip.dialogue?.length === 2)).toBe(true);
  });

  it("materializes all nine shots when the validated planner output only requests clarification", () => {
    const output = {
      status: "needs_clarification" as const,
      aspect_ratio: "9:16" as const,
      shot_duration_seconds: 10 as const,
      shot_count: 9 as const,
      shots: Array.from({ length: 9 }, (_, index) => shot(index + 1)),
    };

    const artifacts = buildSpecialTieInPromptArtifacts({
      specialData: {
        input: { imageModelId: "image-model", videoModelId: "video-model" },
        referenceBindings: [],
      } as unknown as SpecialEpisodeData,
      output,
      productReferenceUrls: [],
    });

    expect(artifacts.startFramePlan?.frames).toHaveLength(9);
    expect(artifacts.motionPromptPack?.clips).toHaveLength(9);
  });

  it("rejects padding or duration drift", () => {
    expect(() =>
      validateSpecialSkillOutput({
        status: "ready",
        aspect_ratio: "9:16",
        shot_duration_seconds: 10,
        shot_count: 9,
        shots: [shot(1)],
      })
    ).toThrow();
    expect(() =>
      validateSpecialSkillOutput({
        status: "ready",
        aspect_ratio: "9:16",
        shot_duration_seconds: 12,
        shot_count: 9,
        shots: [{ ...shot(1), shot_number: 2 }],
      })
    ).toThrow();
  });

  it("rejects a special output that loses product refs or reviewed dialogue", () => {
    const specialInput = specialTieInInputSchema.parse({
      idea: "ให้แม่กับเด็กเล่นของเล่นที่เลือกไว้ในห้องนั่งเล่น",
      referenceType: "product",
      referenceImages: [
        { mediaAssetId: "4974", source: "marketplace_capture", role: "product" },
      ],
      characterIds: ["1"],
      speakerCharacterIds: ["1"],
      dialogueMode: "character_dialogue",
      dialogueBrief: "แม่: ลองเล่นดูนะ",
      imageModelId: "image-model",
      videoModelId: "video-model",
    });
    const bindings = [
      {
        skillReferenceId: "reference_1",
        role: "product" as const,
        mediaAssetId: "4974",
        provenance: {},
      },
      {
        skillReferenceId: "character_main",
        role: "person" as const,
        mediaAssetId: "4676",
        provenance: { characterId: "1", characterKey: "main" },
      },
    ];
    const output = {
      status: "ready" as const,
      aspect_ratio: "9:16" as const,
      shot_duration_seconds: 10 as const,
      shot_count: 9 as const,
      shots: Array.from({ length: 9 }, (_, index) => ({
        ...shot(index + 1),
        reference_ids: ["reference_1", "character_main"],
        tie_in_stage: ([
          "context_setup",
          "introduction",
          "preparation",
          "demonstration",
          "hands_on_use",
          "retry",
          "hands_on_use",
          "result",
          "hero",
        ] as const)[index],
        tie_in_action: [
          "เริ่มต้นฉากและเตรียมพื้นที่",
          "แนะนำสินค้าที่เลือก",
          "เปิดและเตรียมสินค้า",
          "สาธิตการใช้สินค้า",
          "ตัวละครใช้สินค้าอย่างเห็นการสัมผัสจริง",
          "ตัวละครลองใช้สินค้าอีกครั้ง",
          "ตัวละครใช้สินค้าอย่างต่อเนื่อง",
          "แสดงผลลัพธ์ที่สังเกตได้จากการใช้",
          "ปิดเรื่องด้วยสินค้าเด่นในฉาก",
        ][index],
        speaking_turns:
          index === 4
            ? [
                {
                  speaker_reference_id: "character_main",
                  exact_dialogue: "ลองเล่นดูนะ",
                },
                {
                  speaker_reference_id: "character_main",
                  exact_dialogue: "ค่อย ๆ ทำไปทีละขั้น",
                },
              ]
            : [
                {
                  speaker_reference_id: "character_main",
                  exact_dialogue: `ต่อเนื่องช็อต ${index + 1}`,
                },
                {
                  speaker_reference_id: "character_main",
                  exact_dialogue: `ตอบรับต่อเนื่องช็อต ${index + 1}`,
                },
              ],
      })),
    };

    expect(() =>
      validateSpecialTieInStoryOutput({
        output,
        specialInput,
        bindings,
      })
    ).not.toThrow();
    expect(() =>
      validateSpecialTieInStoryOutput({
        output: {
          ...output,
          shots: output.shots.map(current => ({
            ...current,
            reference_ids: ["character_main"],
          })),
        },
        specialInput,
        bindings,
      })
    ).toThrow(/product reference/);
    expect(() =>
      validateSpecialTieInStoryOutput({
        output: {
          ...output,
          shots: output.shots.map(current => ({
            ...current,
            speaking_turns: [],
          })),
        },
        specialInput,
        bindings,
      })
    ).toThrow(/dialogue/);
  });

  it("does not attach an unselected character to any special shot", () => {
    const specialInput = specialTieInInputSchema.parse({
      idea: "ตัวละครที่เลือกสาธิตสินค้าที่เลือกในห้องนั่งเล่น",
      referenceType: "product",
      referenceImages: [
        { mediaAssetId: "4974", source: "marketplace_capture", role: "product" },
      ],
      characterIds: ["1"],
      speakerCharacterIds: ["1"],
      dialogueMode: "character_dialogue",
      dialogueBrief: "ตัวละครหลัก: เริ่มสาธิตสินค้า",
      imageModelId: "image-model",
      videoModelId: "video-model",
    });
    const specialData = {
      input: specialInput,
      referenceBindings: [
        {
          skillReferenceId: "character_selected",
          role: "person" as const,
          mediaAssetId: "4676",
          provenance: { characterId: "1", characterKey: "selected" },
        },
        {
          skillReferenceId: "character_unselected",
          role: "person" as const,
          mediaAssetId: "4747",
          provenance: { characterId: "2", characterKey: "unselected" },
        },
        {
          skillReferenceId: "reference_1",
          role: "product" as const,
          mediaAssetId: "4974",
          provenance: {},
        },
      ],
    } as unknown as SpecialEpisodeData;
    const output = {
      status: "ready" as const,
      aspect_ratio: "9:16" as const,
      shot_duration_seconds: 10 as const,
      shot_count: 9 as const,
      shots: Array.from({ length: 9 }, (_, index) => ({
        ...shot(index + 1),
        reference_ids: ["reference_1", "character_selected"],
        tie_in_stage: ([
          "context_setup",
          "introduction",
          "preparation",
          "demonstration",
          "hands_on_use",
          "retry",
          "hands_on_use",
          "result",
          "hero",
        ] as const)[index],
        tie_in_action: [
          "เริ่มต้นฉากและเตรียมพื้นที่",
          "แนะนำสินค้าที่เลือก",
          "เปิดและเตรียมสินค้า",
          "สาธิตการใช้สินค้า",
          "ตัวละครใช้สินค้าอย่างเห็นการสัมผัสจริง",
          "ตัวละครลองใช้สินค้าอีกครั้ง",
          "ตัวละครใช้สินค้าอย่างต่อเนื่อง",
          "แสดงผลลัพธ์ที่สังเกตได้จากการใช้",
          "ปิดเรื่องด้วยสินค้าเด่นในฉาก",
        ][index],
        speaking_turns:
          index === 0
            ? [
                {
                  speaker_reference_id: "character_selected",
                  exact_dialogue: "เริ่มสาธิตสินค้า",
                },
                {
                  speaker_reference_id: "character_selected",
                  exact_dialogue: "ค่อย ๆ ดูการสาธิตไปด้วยกัน",
                },
              ]
            : [
                {
                  speaker_reference_id: "character_selected",
                  exact_dialogue: `ดำเนินเรื่องต่อช็อต ${index + 1}`,
                },
                {
                  speaker_reference_id: "character_selected",
                  exact_dialogue: `ตอบรับต่อเนื่องช็อต ${index + 1}`,
                },
              ],
      })),
    };
    const artifacts = buildSpecialTieInPromptArtifacts({
      specialData,
      output,
      productReferenceUrls: ["https://cdn.example/product.png"],
    });
    expect(
      artifacts.startFramePlan?.frames.every(
        frame => frame.requiredCharacterRefs?.includes("unselected") !== true
      )
    ).toBe(true);
    expect(() =>
      validateSpecialTieInStoryOutput({
        output: {
          ...output,
          shots: output.shots.map(current => ({
            ...current,
            reference_ids: ["reference_1", "character_unselected"],
          })),
        },
        specialInput,
        bindings: specialData.referenceBindings,
      })
    ).toThrow(/outside the selected cast/);
  });

  it("requires a real product-use progression and linked continuity anchors", () => {
    const specialInput = specialTieInInputSchema.parse({
      idea: "ตัวละครสาธิตและใช้งานสินค้าที่เลือกจนเห็นผลลัพธ์",
      referenceType: "product",
      referenceImages: [
        { mediaAssetId: "4974", source: "marketplace_capture", role: "product" },
      ],
      characterIds: ["1"],
      speakerCharacterIds: [],
      dialogueMode: "none",
      imageModelId: "image-model",
      videoModelId: "video-model",
    });
    const bindings = [
      {
        skillReferenceId: "reference_1",
        role: "product" as const,
        mediaAssetId: "4974",
        provenance: {},
      },
      {
        skillReferenceId: "character_main",
        role: "person" as const,
        mediaAssetId: "4676",
        provenance: { characterId: "1", characterKey: "main" },
      },
    ];
    const output = {
      status: "ready" as const,
      aspect_ratio: "9:16" as const,
      shot_duration_seconds: 10 as const,
      shot_count: 9 as const,
      shots: Array.from({ length: 9 }, (_, index) => ({
        ...shot(index + 1),
        reference_ids: ["reference_1", "character_main"],
        tie_in_stage: ([
          "context_setup",
          "introduction",
          "preparation",
          "demonstration",
          "hands_on_use",
          "retry",
          "hands_on_use",
          "result",
          "hero",
        ] as const)[index],
        tie_in_action: [
          "เริ่มต้นและจัดพื้นที่",
          "หยิบสินค้าเพื่อแนะนำ",
          "เปิดและเตรียมสินค้า",
          "สาธิตการใช้สินค้า",
          "ตัวละครใช้สินค้ากับร่างกายจริง",
          "ลองใช้สินค้าอีกครั้ง",
          "ใช้สินค้าอย่างต่อเนื่อง",
          "แสดงผลลัพธ์จากการใช้",
          "จัดสินค้าเป็นภาพปิดเรื่อง",
        ][index],
      })),
    };
    expect(() =>
      validateSpecialTieInStoryOutput({ output, specialInput, bindings })
    ).not.toThrow();
    expect(() =>
      validateSpecialTieInStoryOutput({
        output: {
          ...output,
          shots: output.shots.map((current, index) =>
            index === 2
              ? { ...current, tie_in_stage: "hero", tie_in_action: "ถือสินค้าไว้" }
              : current
          ),
        },
        specialInput,
        bindings,
      })
    ).toThrow(/missing the preparation presentation stage/);
    expect(() =>
      validateSpecialTieInStoryOutput({
        output: {
          ...output,
          shots: output.shots.map((current, index) =>
            index === 1
              ? { ...current, continuity_in: "เริ่มใหม่โดยไม่ต่อ anchor" }
              : current
          ),
        },
        specialInput,
        bindings,
      })
    ).toThrow(/prior continuity anchor/);
  });

  it("extracts only explicitly locked dialogue lines", () => {
    expect(
      extractSpecialExactDialogueLines(
        "EXACT: สระผมด้วยแชมพูนี้\nแนวทาง: เป็นธรรมชาติ\nตรงตัว: ล้างออกให้หมด"
      )
    ).toEqual(["สระผมด้วยแชมพูนี้", "ล้างออกให้หมด"]);
  });
});
