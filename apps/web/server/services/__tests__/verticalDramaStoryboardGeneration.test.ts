import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../llmRouter", () => ({
  executeWithFallback: vi.fn(),
}));
vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  calculateCreditsForLLM: vi.fn(),
}));
vi.mock("../rateLimiter", () => ({
  mediaGenerationLimiter: {
    isAllowed: vi.fn(),
    getResetTime: vi.fn(),
  },
}));
vi.mock("../skillFiles", () => ({
  resolveSkillDirCandidates: vi.fn(),
  resolveSkillManifestPath: vi.fn(),
}));
vi.mock("@smartspec/skills", () => ({
  parseSkillFile: vi.fn(),
}));
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
    },
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});
vi.mock("../verticalDramaImproveScript", () => ({
  resolveStoryboardModel: vi.fn(),
}));

import fs from "fs";
import { parseSkillFile } from "@smartspec/skills";
import {
  generateStoryboardShotgrid,
  RateLimitExceededError,
} from "../verticalDramaStoryboardGeneration";
import { executeWithFallback } from "../llmRouter";
import {
  hasEnoughCredits,
  deductCredits,
  calculateCreditsForLLM,
} from "../creditService";
import { mediaGenerationLimiter } from "../rateLimiter";
import {
  resolveSkillDirCandidates,
  resolveSkillManifestPath,
} from "../skillFiles";
import {
  InsufficientCreditsError,
  VdSchemaValidationError,
} from "../verticalDramaStoryBible";
import { resolveStoryboardModel } from "../verticalDramaImproveScript";

const mockExecute = vi.mocked(executeWithFallback);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockCalculateCredits = vi.mocked(calculateCreditsForLLM);
const mockResolveModel = vi.mocked(resolveStoryboardModel);
const mockIsAllowed = vi.mocked(mediaGenerationLimiter.isAllowed);
const mockGetResetTime = vi.mocked(mediaGenerationLimiter.getResetTime);
const mockResolveSkillDirCandidates = vi.mocked(resolveSkillDirCandidates);
const mockResolveSkillManifestPath = vi.mocked(resolveSkillManifestPath);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockParseSkillFile = vi.mocked(parseSkillFile);

function baseParams(
  overrides: Partial<Parameters<typeof generateStoryboardShotgrid>[0]> = {}
) {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 42,
    episodeId: 7,
    episodeTitle: "Episode 1",
    episodeNumber: 1,
    locale: "en" as const,
    durationSeconds: 90,
    storySource: {
      logline: "l",
      keyBeats: ["b1"],
      mainPlot: "p",
      seasonArc: "a",
      tone: "t",
    },
    characters: [{ characterId: "char-1", name: "Alice", role: "lead" }],
    ...overrides,
  };
}

function validShot(n: number) {
  return {
    shot_number: n,
    timecode: `00:0${n}`,
    duration_seconds: 10,
    narrative_purpose: "advance plot",
    characters: ["char-1"],
    required_character_refs: ["char-1"],
    camera: {
      shot_type: "medium",
      angle: "eye-level",
      lens_feel: "50mm",
      movement: "static",
      composition: "rule of thirds",
    },
    visual_description: "A scene",
    image_prompt: "A vivid image prompt",
  };
}

function validOutput(shotCount = 9) {
  return {
    storyboard_summary: {},
    canonical_style_bible: {},
    shot_grid_plan: {},
    shots: Array.from({ length: shotCount }, (_, i) => validShot(i + 1)),
    plain_text_storyboard: "Full storyboard text",
    storyboard_handoff_json: {},
  };
}

function successResponse(payload: unknown) {
  return {
    type: "success" as const,
    response: {
      choices: [
        {
          message: { content: JSON.stringify(payload) },
          index: 0,
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 200, completion_tokens: 100 },
    },
    providerName: "openai",
    providerId: 1,
  } as any;
}

/**
 * Simulates a real truncated-mid-array LLM response (evidence: 2026-07-05
 * evening, "สตอรีบอร์ด 9 ช็อต" stage — `LLM response was not valid JSON:
 * Expected ',' or ']' after array element in JSON at position 22166`, caused
 * by Phase 3B's per-character facial_expression/body_language/gaze_direction
 * fields pushing 9-shot output past the old 8000-token ceiling).
 */
function truncatedResponse() {
  const full = JSON.stringify(validOutput());
  const cutIndex = full.indexOf('"shots"') + 60;
  return {
    type: "success" as const,
    response: {
      choices: [
        {
          message: { content: full.slice(0, cutIndex) },
          index: 0,
          finish_reason: "length",
        },
      ],
      usage: { prompt_tokens: 200, completion_tokens: 8000 },
    },
    providerName: "openai",
    providerId: 1,
  } as any;
}

describe("generateStoryboardShotgrid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
    mockCalculateCredits.mockReturnValue(8);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockIsAllowed.mockReturnValue(true);
    mockResolveSkillDirCandidates.mockReturnValue([
      "/fake/skills/vertical-drama-storyboard-shotgrid",
    ]);
    mockResolveSkillManifestPath.mockReturnValue(
      "/fake/skills/vertical-drama-storyboard-shotgrid/skill.md"
    );
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      "---\nname: test\n---\nSystem prompt body" as any
    );
    mockParseSkillFile.mockReturnValue({
      metadata: {} as any,
      content: "System prompt body",
    });
  });

  it("happy path: valid LLM response validates, deducts credits once, checks rate limiter", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    const result = await generateStoryboardShotgrid(baseParams());

    expect(result.storyboard.shots).toHaveLength(9);
    expect(result.creditsUsed).toBe(8);
    expect(result.model).toBe("gpt-4o-mini");
    expect(mockIsAllowed).toHaveBeenCalledWith("user:1");
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });

  it("injects the shared spoken-English profile for dialogue excerpts and subtitles", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateStoryboardShotgrid(
      baseParams({
        dialogueLanguageProfile: { version: 1, marketMode: "auto" },
      }),
    );

    const userMessage = mockExecute.mock.calls[0][0].messages.find(
      (message: any) => message.role === "user",
    ).content;
    expect(userMessage).toContain(
      "Natural contemporary American English, spoken dialogue, not translated English.",
    );
  });

  it("sends only the compact active look register and never raw provider fragments", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateStoryboardShotgrid(
      baseParams({
        seriesLookRegister: {
          styleName: "Intimate drama",
          palette: ["warm cream", "muted navy", "soft rose"],
          lighting: "soft window light",
          cameraGrammar: "restrained still composition",
        },
      })
    );

    const userMessage = mockExecute.mock.calls[0][0].messages.find(
      (message: any) => message.role === "user"
    );
    expect(userMessage?.content).toContain("SERIES LOOK LOCK ACTIVE");
    expect(userMessage?.content).toContain('style="Intimate drama"');
    expect(userMessage?.content).not.toContain("positiveFragments");
    expect(userMessage?.content).not.toContain("negativeFragments");
  });

  it("asks the planner to classify generalized Dual View without treating every phone caller as two locations", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateStoryboardShotgrid(baseParams());
    const userMessage = mockExecute.mock.calls[0][0].messages.find(
      (message: any) => message.role === "user"
    )?.content as string;

    expect(userMessage).toContain("DUAL VIEW DETECTION");
    expect(userMessage).toContain("physical_barrier");
    expect(userMessage).toContain("remote_call");
    expect(userMessage).toContain("separate_locations");
    expect(userMessage).toContain(
      "An ordinary caller shown only on a phone screen is NOT dual view"
    );
  });

  it("adds identity-safe drafting guidance only when motion contracts are enabled", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateStoryboardShotgrid(baseParams());
    const without = mockExecute.mock.calls[0][0].messages.find(
      (message: any) => message.role === "user"
    )?.content as string;

    mockExecute.mockClear();
    await generateStoryboardShotgrid(
      baseParams({
        opts: { motionContractsEnabled: true },
      })
    );
    const withFlag = mockExecute.mock.calls[0][0].messages.find(
      (message: any) => message.role === "user"
    )?.content as string;
    const line =
      '- identity_safe_shot_boundaries: REQUIRED — apply the skill\'s "Identity-safe shot boundaries" section.';

    expect(without).not.toContain(line);
    expect(withFlag).toContain(line);
    expect(withFlag.replace(`${line}\n`, "")).toBe(without);
  });

  it("throws RateLimitExceededError before checking credits or calling the LLM", async () => {
    mockIsAllowed.mockReturnValue(false);
    mockGetResetTime.mockReturnValue(30_000);

    await expect(generateStoryboardShotgrid(baseParams())).rejects.toThrow(
      RateLimitExceededError
    );

    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("throws InsufficientCreditsError and never calls the LLM when credits are insufficient", async () => {
    mockIsAllowed.mockReturnValue(true);
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(generateStoryboardShotgrid(baseParams())).rejects.toThrow(
      InsufficientCreditsError
    );

    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("throws VdSchemaValidationError on malformed LLM output (wrong shot count) and does not deduct credits", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput(3))); // schema requires exactly 9

    await expect(generateStoryboardShotgrid(baseParams())).rejects.toThrow(
      VdSchemaValidationError
    );

    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("rebuilds character_attachment_manifest from referenceImageUrl (identity-lock, upstream parity) instead of trusting the LLM's guess", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(
      successResponse({
        ...validOutput(),
        // The LLM has no way to know a real URL — assert we overwrite this.
        // `schema_version`/`handoff_type` are also always overwritten with
        // derived ground truth now (root-cause fix, see the dedicated
        // "root-cause fix" tests below) — an arbitrary passthrough field is
        // used here instead to prove non-deterministic fields still survive
        // the merge.
        storyboard_handoff_json: {
          schema_version: "1",
          handoff_type: "storyboard_shot_prompts",
          custom_upstream_note: "should survive the merge",
        },
      })
    );

    const result = await generateStoryboardShotgrid(
      baseParams({
        characters: [
          {
            characterId: "char-1",
            name: "Alice",
            role: "lead",
            referenceImageUrl: "https://cdn.example/alice.png",
          },
          {
            characterId: "char-2",
            name: "Bob",
            role: "support",
            referenceImageUrl: null,
          },
        ],
      })
    );

    const manifest = (result.storyboard.storyboard_handoff_json as any)
      .character_attachment_manifest;
    expect(manifest).toEqual([
      {
        character_id: "char-1",
        name: "Alice",
        reference_image_url: "https://cdn.example/alice.png",
      },
    ]);
    // Non-deterministic pre-existing fields on storyboard_handoff_json
    // survive the merge (deterministic fields like schema_version are
    // covered separately by the "root-cause fix" tests below).
    expect(
      (result.storyboard.storyboard_handoff_json as any).custom_upstream_note
    ).toBe("should survive the merge");
  });

  it("leaves storyboard_handoff_json untouched when no character has a reference image", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    const result = await generateStoryboardShotgrid(
      baseParams({
        characters: [{ characterId: "char-1", name: "Alice", role: "lead" }],
      })
    );

    expect(
      (result.storyboard.storyboard_handoff_json as any)
        .character_attachment_manifest
    ).toBeUndefined();
  });

  it("root-cause fix (traceId L2fd3oiEUm_j5RsmaVXYZ): succeeds and deterministically reconstructs storyboard_handoff_json when the LLM omits the field entirely", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    const { storyboard_handoff_json: _omit, ...outputWithoutHandoff } =
      validOutput();
    mockExecute.mockResolvedValue(successResponse(outputWithoutHandoff));

    // Previously this threw VdSchemaValidationError ("storyboard_handoff_json: Required").
    const result = await generateStoryboardShotgrid(baseParams());

    expect(result.storyboard.shots).toHaveLength(9);
    const handoff = result.storyboard.storyboard_handoff_json as any;
    expect(handoff.schema_version).toBe("1.0");
    expect(handoff.handoff_type).toBe("storyboard_shot_prompts");
    expect(handoff.grid_layout).toBe("3x3");
    expect(handoff.shots).toEqual(
      outputWithoutHandoff.shots.map(s => ({
        shot_number: s.shot_number,
        image_prompt: s.image_prompt,
      }))
    );
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });

  it("root-cause fix: overwrites schema_version/handoff_type/grid_layout/shots with derived ground truth even when the LLM DOES emit its own storyboard_handoff_json, but preserves the model's rendering_notes", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(
      successResponse({
        ...validOutput(),
        storyboard_handoff_json: {
          schema_version: "0.9-wrong",
          handoff_type: "something_else",
          grid_layout: "2x2",
          shots: [{ shot_number: 999, image_prompt: "stale model guess" }],
          character_attachment_manifest: [{ character_id: "stale" }],
          rendering_notes: "Model-authored rendering notes.",
        },
      })
    );

    const result = await generateStoryboardShotgrid(baseParams());

    const handoff = result.storyboard.storyboard_handoff_json as any;
    expect(handoff.schema_version).toBe("1.0");
    expect(handoff.handoff_type).toBe("storyboard_shot_prompts");
    expect(handoff.grid_layout).toBe("3x3");
    expect(handoff.shots).toEqual(
      validOutput().shots.map(s => ({
        shot_number: s.shot_number,
        image_prompt: s.image_prompt,
      }))
    );
    // Model's rendering_notes IS preserved (not derivable server-side).
    expect(handoff.rendering_notes).toBe("Model-authored rendering notes.");
  });

  it("root-cause fix: does not regress the existing character_attachment_manifest backfill when characters have reference images", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    const { storyboard_handoff_json: _omit, ...outputWithoutHandoff } =
      validOutput();
    mockExecute.mockResolvedValue(successResponse(outputWithoutHandoff));

    const result = await generateStoryboardShotgrid(
      baseParams({
        characters: [
          {
            characterId: "char-1",
            name: "Alice",
            role: "lead",
            referenceImageUrl: "https://cdn.example/alice.png",
          },
        ],
      })
    );

    const handoff = result.storyboard.storyboard_handoff_json as any;
    expect(handoff.character_attachment_manifest).toEqual([
      {
        character_id: "char-1",
        name: "Alice",
        reference_image_url: "https://cdn.example/alice.png",
      },
    ]);
    // Deterministic base fields still present alongside the manifest.
    expect(handoff.schema_version).toBe("1.0");
    expect(handoff.grid_layout).toBe("3x3");
  });

  it("retries once with a higher token ceiling when the first response is truncated JSON, and succeeds on the retry (2026-07-05 evidence: one-click generation, สตอรีบอร์ด 9 ช็อต stage)", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute
      .mockResolvedValueOnce(truncatedResponse())
      .mockResolvedValueOnce(successResponse(validOutput()));

    const result = await generateStoryboardShotgrid(baseParams());

    expect(result.storyboard.shots).toHaveLength(9);
    expect(mockExecute).toHaveBeenCalledTimes(2);
    // Same model both times — never auto-switches models on retry.
    expect(mockExecute.mock.calls[0][0].model).toBe(
      mockExecute.mock.calls[1][0].model
    );
    // Retry uses a higher/no-lower token ceiling than the first attempt.
    expect(mockExecute.mock.calls[1][0].maxTokens).toBeGreaterThanOrEqual(
      mockExecute.mock.calls[0][0].maxTokens
    );
    // First attempt already uses the raised 16000 base ceiling (not the old 8000).
    expect(mockExecute.mock.calls[0][0].maxTokens).toBe(16000);
    // Retry's user prompt carries the stricter no-truncation instruction.
    const retryUserMessage = mockExecute.mock.calls[1][0].messages.find(
      (m: { role: string }) => m.role === "user"
    );
    expect(retryUserMessage.content).toMatch(/complete, valid, compact JSON/i);
    // Credits are only deducted once (for the successful retry), not twice.
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });

  it("throws VdSchemaValidationError (does not silently persist an empty storyboard) when BOTH the first attempt and the retry are truncated", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute
      .mockResolvedValueOnce(truncatedResponse())
      .mockResolvedValueOnce(truncatedResponse())
      .mockResolvedValueOnce(truncatedResponse());

    await expect(generateStoryboardShotgrid(baseParams())).rejects.toThrow(
      VdSchemaValidationError
    );

    // 1 initial + VD_SCHEMA_MAX_RETRIES (2) corrective retries
    expect(mockExecute).toHaveBeenCalledTimes(3);
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  describe("character variants (planning/vertical-drama-character-variants/plan.md Phase D)", () => {
    it("renders no variant lines and produces a byte-identical Characters block for a character with zero variants", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(successResponse(validOutput()));

      await generateStoryboardShotgrid(
        baseParams({
          characters: [{ characterId: "char-1", name: "Alice", role: "lead" }],
        })
      );
      const withoutVariantsPrompt = mockExecute.mock.calls[0][0].messages.find(
        (m: { role: string }) => m.role === "user"
      ).content;

      mockExecute.mockClear();
      mockExecute.mockResolvedValue(successResponse(validOutput()));
      await generateStoryboardShotgrid(
        baseParams({
          characters: [
            {
              characterId: "char-1",
              name: "Alice",
              role: "lead",
              variants: undefined,
            },
          ],
        })
      );
      const withUndefinedVariantsPrompt =
        mockExecute.mock.calls[0][0].messages.find(
          (m: { role: string }) => m.role === "user"
        ).content;

      expect(withUndefinedVariantsPrompt).toBe(withoutVariantsPrompt);
      expect(withoutVariantsPrompt).not.toMatch(/Variants available/);
      expect(withoutVariantsPrompt).not.toMatch(/Character variant selection/);
    });

    it("includes a character's variants list (label/type/description, reference-image note) only when present", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(successResponse(validOutput()));

      await generateStoryboardShotgrid(
        baseParams({
          characters: [
            {
              characterId: "char-1",
              name: "Nuna",
              role: "lead",
              referenceImageUrl: "https://cdn.example/nuna.png",
              variants: [
                {
                  characterKey: "char-1-school",
                  variantLabel: "ชุดนักเรียน",
                  variantType: "outfit",
                  description: "school uniform, worn for scenes at school",
                  referenceImageUrl: "https://cdn.example/nuna-school.png",
                },
                {
                  characterKey: "char-1-child",
                  variantLabel: "วัยเด็ก",
                  variantType: "age_stage",
                  description: "childhood flashback appearance",
                  referenceImageUrl: "https://cdn.example/nuna-child.png",
                },
              ],
            },
          ],
        })
      );

      const userMessage = mockExecute.mock.calls[0][0].messages.find(
        (m: { role: string }) => m.role === "user"
      ).content;
      expect(userMessage).toMatch(/Variants available for char-1/);
      expect(userMessage).toMatch(
        /char-1-school \(ชุดนักเรียน, outfit variant of char-1\): school uniform, worn for scenes at school \[has an approved reference image\]/
      );
      expect(userMessage).toMatch(
        /char-1-child \(วัยเด็ก, age-stage variant of char-1\): childhood flashback appearance \[has an approved reference image\]/
      );
    });

    it("does not force-add the base character's id via name-matching when the LLM already chose one of its variants for this shot (avoids attaching two contradictory reference images for the same person)", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(
        successResponse({
          ...validOutput(),
          shots: [
            {
              ...validShot(1),
              // The LLM correctly picked the variant AND wrote "Nuna" (the
              // shared base name) directly into the narrative text.
              visual_description: "Nuna in her school uniform in the hallway",
              characters: ["char-1-school"],
              required_character_refs: ["char-1-school"],
            },
            ...Array.from({ length: 8 }, (_, i) => validShot(i + 2)),
          ],
        })
      );

      const result = await generateStoryboardShotgrid(
        baseParams({
          characters: [
            {
              characterId: "char-1",
              name: "Nuna",
              role: "lead",
              variants: [
                {
                  characterKey: "char-1-school",
                  variantLabel: "ชุดนักเรียน",
                  variantType: "outfit",
                  description: "school uniform",
                  referenceImageUrl: "https://cdn.example/nuna-school.png",
                },
              ],
            },
          ],
        })
      );

      expect(result.storyboard.shots[0].characters).toEqual(["char-1-school"]);
      expect(result.storyboard.shots[0].required_character_refs).toEqual([
        "char-1-school",
      ]);
    });

    it("still applies the name-match fallback for a variant-bearing character when NEITHER the base id nor any variant id was emitted by the LLM (recovery case preserved)", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(
        successResponse({
          ...validOutput(),
          shots: [
            {
              ...validShot(1),
              visual_description: "Nuna walks in, unannounced",
              // LLM invents a junk id instead of a real one.
              characters: ["nuna-primary-portrait.png"],
              required_character_refs: ["nuna-primary-portrait.png"],
            },
            ...Array.from({ length: 8 }, (_, i) => validShot(i + 2)),
          ],
        })
      );

      const result = await generateStoryboardShotgrid(
        baseParams({
          characters: [
            {
              characterId: "char-1",
              name: "Nuna",
              role: "lead",
              variants: [
                {
                  characterKey: "char-1-school",
                  variantLabel: "ชุดนักเรียน",
                  variantType: "outfit",
                  description: "school uniform",
                  referenceImageUrl: "https://cdn.example/nuna-school.png",
                },
              ],
            },
          ],
        })
      );

      // Falls back to the base id — the only signal available.
      expect(result.storyboard.shots[0].characters).toEqual(["char-1"]);
    });

    it("does not promote a phone-screen caller into the physical shot cast", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(
        successResponse({
          ...validOutput(),
          shots: [
            {
              ...validShot(1),
              visual_description:
                "กฤตโทรเข้ามือถือภาคิน แต่กฤตไม่ได้อยู่ในห้องเดียวกับภาคินและไอริณ แสดงภาพกฤตบนหน้าจอโทรศัพท์มือถือ",
              characters: ["char-1", "char-krit"],
              required_character_refs: ["char-1", "char-krit"],
              screen_caller_refs: ["char-krit"],
            },
            ...Array.from({ length: 8 }, (_, i) => validShot(i + 2)),
          ],
        })
      );

      const result = await generateStoryboardShotgrid(
        baseParams({
          characters: [
            { characterId: "char-1", name: "ภาคิน", role: "lead" },
            { characterId: "char-krit", name: "กฤต", role: "support" },
          ],
        })
      );

      expect(result.storyboard.shots[0].characters).toEqual(["char-1"]);
      expect(result.storyboard.shots[0].required_character_refs).toEqual([
        "char-1",
      ]);
      expect(result.storyboard.shots[0].screen_caller_refs).toEqual([
        "char-krit",
      ]);
    });

    it("renders no twin-pair lines and produces a byte-identical prompt for a call with no twinPairs", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(successResponse(validOutput()));

      await generateStoryboardShotgrid(baseParams());
      const withoutTwinPairsPrompt = mockExecute.mock.calls[0][0].messages.find(
        (m: { role: string }) => m.role === "user"
      ).content;

      mockExecute.mockClear();
      mockExecute.mockResolvedValue(successResponse(validOutput()));
      await generateStoryboardShotgrid(baseParams({ twinPairs: undefined }));
      const withUndefinedTwinPairsPrompt =
        mockExecute.mock.calls[0][0].messages.find(
          (m: { role: string }) => m.role === "user"
        ).content;

      expect(withUndefinedTwinPairsPrompt).toBe(withoutTwinPairsPrompt);
      expect(withoutTwinPairsPrompt).not.toMatch(/Twin pairs/);
      expect(withoutTwinPairsPrompt).not.toMatch(/Twin-aware shot styling/);
    });

    it("renders each twinPairs entry as a 'are twins' fact line when present", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(successResponse(validOutput()));

      await generateStoryboardShotgrid(
        baseParams({
          twinPairs: [
            { characterKeyA: "char-fai", characterKeyB: "char-baitong" },
          ],
        })
      );

      const userMessage = mockExecute.mock.calls[0][0].messages.find(
        (m: { role: string }) => m.role === "user"
      ).content;
      expect(userMessage).toMatch(
        /Twin pairs \(see "Twin-aware shot styling" below\):/
      );
      expect(userMessage).toMatch(
        /char-fai and char-baitong are twins — they share an identical face but are different people\./
      );
    });

    it("does not strip a variant's characterKey from a shot's characters/required_character_refs (variant ids are real ids, not LLM-invented junk)", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(
        successResponse({
          ...validOutput(),
          shots: [
            {
              ...validShot(1),
              characters: ["char-1-school"],
              required_character_refs: ["char-1-school"],
            },
            ...Array.from({ length: 8 }, (_, i) => validShot(i + 2)),
          ],
        })
      );

      const result = await generateStoryboardShotgrid(
        baseParams({
          characters: [
            {
              characterId: "char-1",
              name: "Nuna",
              role: "lead",
              variants: [
                {
                  characterKey: "char-1-school",
                  variantLabel: "ชุดนักเรียน",
                  variantType: "outfit",
                  description: "school uniform",
                  referenceImageUrl: "https://cdn.example/nuna-school.png",
                },
              ],
            },
          ],
        })
      );

      expect(result.storyboard.shots[0].characters).toContain("char-1-school");
      expect(result.storyboard.shots[0].required_character_refs).toContain(
        "char-1-school"
      );
    });
  });

  it("does not retry on a FATAL provider error (only retries malformed-JSON/schema failures, or transient network/timeout errors — see verticalDramaStoryBible.executeJsonPlanningCallWithRetry.test.ts)", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    // Phase A reliability fix (2026-07-09) — `executeJsonPlanningCallWithRetry`
    // (shared with verticalDramaStoryBible.ts) now DOES retry transient
    // network/timeout/5xx errors with backoff. A genuinely fatal error (auth
    // failure) is used here so "not retried" stays a true assertion.
    mockExecute.mockResolvedValue({
      type: "error",
      error: "Unauthorized: invalid api key",
      statusCode: 401,
    } as any);

    await expect(generateStoryboardShotgrid(baseParams())).rejects.toThrow(
      "LLM request failed: Unauthorized: invalid api key"
    );

    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});
