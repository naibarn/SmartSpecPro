import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  videoPrompt: "",
  people: [
    {
      id: "person-1",
      boundingBox: { x: 0.05, y: 0.1, width: 0.3, height: 0.8 },
      appearance: "woman in a cream blouse",
      confidence: 0.95,
    },
    {
      id: "person-2",
      boundingBox: { x: 0.65, y: 0.1, width: 0.3, height: 0.8 },
      appearance: "man in a dark jacket",
      confidence: 0.95,
    },
  ],
  framePeople: [
    { name: "Mali", position: "left", detected_person_id: "person-1" },
    { name: "Ton", position: "right", detected_person_id: "person-2" },
  ],
  positionSource: "image",
  videoCalls: 0,
}));

vi.mock("../verticalDramaSpeakerVisualDetection", () => ({
  detectVerticalDramaShotPeopleDirect: vi.fn(async (input: any) => {
    input.onUsage(
      { usage: { prompt_tokens: 10, completion_tokens: 10 } },
      "vision",
      "provider"
    );
    return {
      providerName: "provider",
      people: dependencies.people,
    };
  }),
}));
vi.mock("../verticalDramaVideoMotionPromptGeneration", () => ({
  generateVerticalDramaShotVideoPromptDirect: vi.fn(async (input: any) => {
    dependencies.videoCalls += 1;
    input.onUsage(
      { usage: { prompt_tokens: 10, completion_tokens: 10 } },
      "vision",
      "provider"
    );
    return {
      providerName: "provider",
      data: {
        prompt: dependencies.videoPrompt,
        frame_analysis: {
          position_source: dependencies.positionSource,
          people: dependencies.framePeople,
        },
      },
    };
  }),
}));
vi.mock("../creditService", () => ({
  calculateCreditsForLLMDynamic: vi.fn(async () => 0),
  deductCredits: vi.fn(),
  hasEnoughCredits: vi.fn(async () => true),
}));
vi.mock("../skillRevenueBilling", () => ({
  getSkillRunCreditCost: vi.fn(async () => 0),
}));
vi.mock("../skillRegistry", () => ({
  getSkillByIdAsync: vi.fn(async () => ({})),
}));
vi.mock("../skillExecutionPolicy", () => ({
  resolveSkillExecutionPolicy: vi.fn(async () => ({ modelId: "vision" })),
}));
vi.mock("../enabledLlmModels", () => ({
  loadEnabledLlmModelRows: vi.fn(async () => [
    { modelId: "vision", supportsVision: true },
  ]),
}));
vi.mock("../productReviewSequentialStoryboardSkillRunner", () => ({
  PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_IMAGE_PROMPT_MAX_CHARS: 3000,
  PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_VIDEO_PROMPT_MAX_CHARS: 2000,
}));
vi.mock("../marketplaceAutoReviewStoryArcPlanner", () => ({}));

import { generateMarketplaceAutoReviewVideoPrompt } from "../marketplaceAutoReviewVideoPromptSkillRunner";

const dialogue = "Mali: Is the coffee ready?\nTon: Yes, the coffee is ready.";
const turns = [
  { castId: "cast-1", speakerName: "Mali", line: "Is the coffee ready?" },
  { castId: "cast-2", speakerName: "Ton", line: "Yes, the coffee is ready." },
];
const cast = [
  {
    castId: "cast-1",
    name: "Mali",
    role: "host",
    source: "uploaded",
    imageIndex: 2,
  },
  {
    castId: "cast-2",
    name: "Ton",
    role: "guest",
    source: "uploaded",
    imageIndex: 3,
  },
] as any;
const request = {
  userId: 1,
  tenantId: "tenant-test",
  runId: "run-test",
  shotId: 1,
  approvedImageUrl: "https://example.test/frame.png",
  requestIdempotencyKey: "request-test",
  shot: {
    shotId: 1,
    title: "Coffee",
    dialogue,
    dialogueTurns: turns,
    storySummary: "Two people discuss coffee.",
    visualSummary: "They stand by the machine.",
    durationSeconds: 10,
  },
  cast,
  productName: "Coffee maker",
  productFacts: [],
  referenceManifest: [
    {
      index: 1,
      role: "character",
      characterName: "Mali",
      url: "https://example.test/mali.png",
    },
    {
      index: 2,
      role: "character",
      characterName: "Ton",
      url: "https://example.test/ton.png",
    },
  ],
} as any;

const prefix =
  "Create a vertical 9:16 video. Use the approved image as the exact start frame. The camera follows the action. No on-screen text or captions. ";

describe("Marketplace video prompt generation with real completeness validation", () => {
  beforeEach(() => {
    dependencies.videoPrompt = prefix + "The camera moves gently. ".repeat(12);
    dependencies.videoCalls = 0;
  });

  it("generates a valid prompt with a visual map and exact approved speech", async () => {
    const result = await generateMarketplaceAutoReviewVideoPrompt(request);
    expect(result.prompt).toContain("- Mali: person-1, viewer-left");
    expect(result.prompt).toContain("- Ton: person-2, viewer-right");
    expect(result.prompt.match(/Is the coffee ready\?/g)).toHaveLength(1);
    expect(result.prompt.match(/Yes, the coffee is ready\./g)).toHaveLength(1);
  });

  it("identifies each named speaker directly by the detected appearance", async () => {
    const result = await generateMarketplaceAutoReviewVideoPrompt(request);
    expect(result.prompt).toContain("- Mali: person-1, viewer-left — woman in a cream blouse");
    expect(result.prompt).toContain("- Ton: person-2, viewer-right — man in a dark jacket");
    expect(result.prompt.length).toBeLessThanOrEqual(2000);
  });

  it("keeps detailed descriptions attached to the matched names rather than cast order", async () => {
    const originalPeople = dependencies.people;
    const originalMatches = dependencies.framePeople;
    dependencies.people = [
      { ...originalPeople[0], appearance: "older man with short white hair and glasses, wearing a light button-up shirt and watch, pointing toward the coffee machine" },
      { ...originalPeople[1], appearance: "young man in a dark jacket and pink shirt, leaning over the counter" },
    ];
    dependencies.framePeople = [
      { name: "Ton", position: "left", detected_person_id: "person-1" },
      { name: "Mali", position: "right", detected_person_id: "person-2" },
    ];
    try {
      const result = await generateMarketplaceAutoReviewVideoPrompt(request);
      expect(result.prompt).toContain("- Ton: person-1, viewer-left — older man with short white hair and glasses");
      expect(result.prompt).toContain("- Mali: person-2, viewer-right — young man in a dark jacket and pink shirt");
      expect(result.prompt.length).toBeLessThanOrEqual(2000);
    } finally {
      dependencies.people = originalPeople;
      dependencies.framePeople = originalMatches;
    }
  });

  it("keeps the complete prompt within the provider budget after adding the required map and dialogue", async () => {
    dependencies.videoPrompt = prefix + "The camera moves gently. ".repeat(65);
    expect(dependencies.videoPrompt.length).toBeLessThan(2000);
    const result = await generateMarketplaceAutoReviewVideoPrompt(request);
    expect(result.prompt.length).toBeLessThanOrEqual(2000);
    expect(result.prompt).toContain("Mali: person-1");
    expect(result.prompt).toContain("Ton: person-2");
    expect(result.prompt).toContain("Is the coffee ready?");
    expect(result.prompt).toContain("Yes, the coffee is ready.");
  });

  it("supports the same speaker delivering multiple approved turns", async () => {
    const repeated =
      "Mali: Is the coffee ready?\nTon: Yes, the coffee is ready.\nMali: Thank you very much.";
    const result = await generateMarketplaceAutoReviewVideoPrompt({
      ...request,
      shot: {
        ...request.shot,
        dialogue: repeated,
        dialogueTurns: [
          ...turns,
          {
            castId: "cast-1",
            speakerName: "Mali",
            line: "Thank you very much.",
          },
        ],
      },
    });
    expect(result.prompt.match(/- Mali: person-1/g)).toHaveLength(1);
    expect(result.prompt).toContain("Thank you very much.");
  });

  it("does not assume the only detected person is the named speaker when frame analysis has no match", async () => {
    const priorPeople = dependencies.people;
    const priorAnalysis = dependencies.framePeople;
    dependencies.people = [priorPeople[0]];
    dependencies.framePeople = [];
    try {
      await expect(
        generateMarketplaceAutoReviewVideoPrompt({
          ...request,
          shot: {
            ...request.shot,
            dialogue: "Mali: Is the coffee ready?",
            dialogueTurns: [turns[0]],
          },
          cast: [cast[0]],
          referenceManifest: [request.referenceManifest[0]],
        })
      ).rejects.toThrow(
        "MARKETPLACE_VIDEO_PROMPT_SPEAKER_VISUAL_MATCH_MISSING"
      );
    } finally {
      dependencies.people = priorPeople;
      dependencies.framePeople = priorAnalysis;
    }
  });

  it("does not duplicate approved dialogue when the model includes a line in its motion prose", async () => {
    dependencies.videoPrompt = `${prefix}Mali says \"Is the coffee ready?\" while looking toward Ton.`;
    const result = await generateMarketplaceAutoReviewVideoPrompt(request);
    expect(result.prompt.match(/Is the coffee ready\?/g)).toHaveLength(1);
    expect(result.prompt).toContain("Yes, the coffee is ready.");
  });

  it("keeps required video format, image source and no-text rules when the model omits them", async () => {
    dependencies.videoPrompt =
      "The camera drifts slowly toward the coffee maker as the two people exchange a glance.";
    const result = await generateMarketplaceAutoReviewVideoPrompt(request);
    expect(result.prompt).toContain("vertical 9:16");
    expect(result.prompt).toContain("approved image");
    expect(result.prompt).toContain("No on-screen text");
    expect(result.prompt).toContain("camera drifts slowly");
  });

  it("does not accept a speaker match based on an image prompt instead of the actual frame", async () => {
    dependencies.positionSource = "image_prompt_text";
    try {
      await expect(
        generateMarketplaceAutoReviewVideoPrompt(request)
      ).rejects.toThrow("MARKETPLACE_VIDEO_PROMPT_FRAME_ANALYSIS_REQUIRED");
    } finally {
      dependencies.positionSource = "image";
    }
  });

  it("removes a model echo of short quoted dialogue before appending the approved transcript", async () => {
    dependencies.videoPrompt = `${prefix}Mali says \"Hi\" while turning toward Ton.`;
    const result = await generateMarketplaceAutoReviewVideoPrompt({
      ...request,
      shot: {
        ...request.shot,
        dialogue: "Mali: Hi",
        dialogueTurns: [{ ...turns[0], line: "Hi" }],
      },
      cast: [cast[0]],
      referenceManifest: [request.referenceManifest[0]],
    });
    expect(result.prompt.match(/\bHi\b/g)).toHaveLength(1);
  });

  it("rejects an oversized approved transcript before calling the video prompt model", async () => {
    const longLine = "A".repeat(2200);
    await expect(
      generateMarketplaceAutoReviewVideoPrompt({
        ...request,
        shot: {
          ...request.shot,
          dialogue: `Mali: ${longLine}`,
          dialogueTurns: [{ ...turns[0], line: longLine }],
        },
        cast: [cast[0]],
        referenceManifest: [request.referenceManifest[0]],
      })
    ).rejects.toThrow("MARKETPLACE_VIDEO_PROMPT_APPROVED_CONTENT_TOO_LONG");
    expect(dependencies.videoCalls).toBe(0);
  });

  it("does not reject a fitting speaker because an unrelated detected person has a long description", async () => {
    const original = dependencies.people;
    dependencies.people = [
      original[0],
      { ...original[1], appearance: "z".repeat(240) },
    ];
    const line = "A".repeat(1250);
    try {
      const result = await generateMarketplaceAutoReviewVideoPrompt({
        ...request,
        shot: {
          ...request.shot,
          dialogue: `Mali: ${line}`,
          dialogueTurns: [{ ...turns[0], line }],
        },
        cast: [cast[0]],
        referenceManifest: [request.referenceManifest[0]],
      });
      expect(result.prompt.length).toBeLessThanOrEqual(2000);
      expect(result.prompt).toContain(line);
    } finally {
      dependencies.people = original;
    }
  });

  it("records the failed validation category without logging prompt or dialogue text", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const staleLine = "A retired dialogue line must never be spoken.";
    dependencies.videoPrompt = `${prefix} ${staleLine}`;
    try {
      await expect(
        generateMarketplaceAutoReviewVideoPrompt({
          ...request,
          shot: {
            ...request.shot,
            dialogueTurns: [...turns, { ...turns[0], line: staleLine }],
          },
        })
      ).rejects.toThrow("MARKETPLACE_VIDEO_PROMPT_SKILL_OUTPUT_INCOMPLETE");
      const event = warning.mock.calls.find(
        call => call[0] === "[MarketplaceVideoPrompt] validation failed"
      );
      expect(event?.[1]).toMatchObject({
        failedCheck: "stale_dialogue",
        shotId: 1,
      });
      expect(JSON.stringify(event)).not.toContain(staleLine);
    } finally {
      warning.mockRestore();
    }
  });

  it("replaces a model-generated fallback map while retaining the shot action", async () => {
    dependencies.videoPrompt = [
      prefix,
      "SPEAKER VISUAL MAP FOR THIS SHOT (safe fallback):",
      "- Mali: not visually resolved; use offscreen voice-over",
      "- Ton: not visually resolved; use offscreen voice-over",
      "Approved dialogue (speak each line exactly once):",
      '1. Mali: "Is the coffee ready?"',
      '2. Ton: "Yes, the coffee is ready."',
      "SPEAKER-TO-FACE LOCK: Not visually resolved; keep every visible mouth closed.",
      "Camera/action: Mali raises the cup while Ton points to the coffee maker.",
      "Pacing: Begin slowly and settle before the end.",
    ].join("\n");
    const result = await generateMarketplaceAutoReviewVideoPrompt(request);
    expect(result.prompt).not.toContain("not visually resolved");
    expect(result.prompt).not.toContain("offscreen voice-over");
    expect(result.prompt).toContain("Mali raises the cup");
    expect(result.prompt.match(/Is the coffee ready\?/g)).toHaveLength(1);
  });

  it("rejects two distinct speakers mapped to the same detected person", async () => {
    const original = dependencies.framePeople;
    dependencies.framePeople = [
      original[0],
      { ...original[1], detected_person_id: "person-1" },
    ];
    try {
      await expect(
        generateMarketplaceAutoReviewVideoPrompt(request)
      ).rejects.toThrow(
        "MARKETPLACE_VIDEO_PROMPT_SPEAKER_VISUAL_MATCH_MISSING"
      );
    } finally {
      dependencies.framePeople = original;
    }
  });

  it("rejects an unrecognised detected person ID instead of guessing from position", async () => {
    const original = dependencies.framePeople;
    dependencies.framePeople = [
      { ...original[0], detected_person_id: "person-99" },
      original[1],
    ];
    try {
      await expect(
        generateMarketplaceAutoReviewVideoPrompt(request)
      ).rejects.toThrow(
        "MARKETPLACE_VIDEO_PROMPT_SPEAKER_VISUAL_MATCH_MISSING"
      );
    } finally {
      dependencies.framePeople = original;
    }
  });

  it("rejects a person ID that contradicts the model's observed screen position", async () => {
    const original = dependencies.framePeople;
    dependencies.framePeople = [
      { ...original[0], position: "right" },
      original[1],
    ];
    try {
      await expect(
        generateMarketplaceAutoReviewVideoPrompt(request)
      ).rejects.toThrow(
        "MARKETPLACE_VIDEO_PROMPT_SPEAKER_VISUAL_MATCH_MISSING"
      );
    } finally {
      dependencies.framePeople = original;
    }
  });

  it("rejects conflicting duplicate visual matches for one speaker", async () => {
    const original = dependencies.framePeople;
    dependencies.framePeople = [
      ...original,
      { ...original[0], position: "right", detected_person_id: "person-2" },
    ];
    try {
      await expect(
        generateMarketplaceAutoReviewVideoPrompt(request)
      ).rejects.toThrow(
        "MARKETPLACE_VIDEO_PROMPT_SPEAKER_VISUAL_MATCH_MISSING"
      );
    } finally {
      dependencies.framePeople = original;
    }
  });

  it("does not turn a model refusal into an apparently complete video prompt", async () => {
    dependencies.videoPrompt =
      "I cannot identify the people in this image and cannot produce the requested motion prompt.";
    await expect(
      generateMarketplaceAutoReviewVideoPrompt(request)
    ).rejects.toThrow("MARKETPLACE_VIDEO_PROMPT_MOTION_INCOMPLETE");
  });
  it("preserves Thai dialogue and speaker matching within the prompt limit", async () => {
    const thai =
      "มาลี: เช้านี้กาแฟจืดไป—ขอชงใหม่ได้ไหม?\nนนท์: ได้สิ ลองตั้งเวลาและใช้ก้านชง 58 มิลก่อน";
    const thaiCast = [
      { ...cast[0], name: "มาลี" },
      { ...cast[1], name: "นนท์" },
    ];
    const original = dependencies.framePeople;
    dependencies.framePeople = [
      { name: "มาลี", position: "left", detected_person_id: "person-1" },
      { name: "นนท์", position: "right", detected_person_id: "person-2" },
    ];
    dependencies.videoPrompt =
      prefix +
      "The woman raises the cup while the man points at the machine. ".repeat(
        30
      );
    try {
      const result = await generateMarketplaceAutoReviewVideoPrompt({
        ...request,
        shot: {
          ...request.shot,
          dialogue: thai,
          dialogueTurns: [
            {
              castId: "cast-1",
              speakerName: "มาลี",
              line: "เช้านี้กาแฟจืดไป—ขอชงใหม่ได้ไหม?",
            },
            {
              castId: "cast-2",
              speakerName: "นนท์",
              line: "ได้สิ ลองตั้งเวลาและใช้ก้านชง 58 มิลก่อน",
            },
          ],
        },
        cast: thaiCast,
        referenceManifest: [
          { ...request.referenceManifest[0], characterName: "มาลี" },
          { ...request.referenceManifest[1], characterName: "นนท์" },
        ],
      });
      expect(result.prompt.length).toBeLessThanOrEqual(2000);
      expect(result.prompt).toContain("- มาลี: person-1, viewer-left");
      expect(result.prompt).toContain("- นนท์: person-2, viewer-right");
      expect(
        result.prompt.match(/เช้านี้กาแฟจืดไป—ขอชงใหม่ได้ไหม\?/g)
      ).toHaveLength(1);
      expect(
        result.prompt.match(/ได้สิ ลองตั้งเวลาและใช้ก้านชง 58 มิลก่อน/g)
      ).toHaveLength(1);
    } finally {
      dependencies.framePeople = original;
    }
  });
});
