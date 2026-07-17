/**
 * Coverage for `verticalDramaStoryboardGeneration.ts`'s dialogue-speaker
 * coverage reconcile (deterministic fix, added 2026-07-15): every character
 * who SPEAKS a `dialogue_lines[]` line in a shot's matching `episodeDraft`
 * draft entry must end up in that same shot's `characters`/
 * `required_character_refs`, so the reference-image attachment (and the
 * downstream video step) never has to invent a stand-in for a speaker who
 * wasn't given a face.
 *
 * Mirrors `verticalDramaStoryboardGeneration.test.ts`'s mocking pattern
 * exactly (same file, same `resolveStoryboardModel` import source as the
 * module under test actually uses — `../verticalDramaImproveScript`, NOT
 * `../verticalDramaStoryBible`, unlike the sibling `.episodeDraft.test.ts`
 * file which mocks the latter for its own, unrelated prompt-injection
 * assertions).
 */
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
import { generateStoryboardShotgrid } from "../verticalDramaStoryboardGeneration";
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
import { resolveStoryboardModel } from "../verticalDramaImproveScript";

const mockExecute = vi.mocked(executeWithFallback);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockCalculateCredits = vi.mocked(calculateCreditsForLLM);
const mockResolveModel = vi.mocked(resolveStoryboardModel);
const mockIsAllowed = vi.mocked(mediaGenerationLimiter.isAllowed);
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

function validShot(n: number, shotOverrides: Record<string, unknown> = {}) {
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
    ...shotOverrides,
  };
}

/** Builds a 9-shot output, letting the caller override shot 1 only. */
function outputWithShot1(shot1Overrides: Record<string, unknown>) {
  return {
    storyboard_summary: {},
    canonical_style_bible: {},
    shot_grid_plan: {},
    shots: [
      validShot(1, shot1Overrides),
      ...Array.from({ length: 8 }, (_, i) => validShot(i + 2)),
    ],
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

describe("generateStoryboardShotgrid — dialogue-speaker coverage reconcile (2026-07-15)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
    mockCalculateCredits.mockReturnValue(8);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockIsAllowed.mockReturnValue(true);
    mockHasEnoughCredits.mockResolvedValue(true);
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

  it("(a) adds a speaking character's id to required_character_refs when the LLM's own shot list omitted them", async () => {
    mockExecute.mockResolvedValue(
      successResponse(
        outputWithShot1({ characters: ["char-1"], required_character_refs: ["char-1"] })
      )
    );

    const result = await generateStoryboardShotgrid(
      baseParams({
        characters: [
          { characterId: "char-1", name: "Alice", role: "lead" },
          { characterId: "char-2", name: "Bob", role: "support" },
        ],
        episodeDraft: {
          shots: [
            {
              shot_number: 1,
              summary: "Bob interjects",
              dialogue_lines: [{ speaker: "char-2", line: "Wait." }],
            },
          ],
        },
      } as any)
    );

    expect(result.storyboard.shots[0].characters).toEqual(
      expect.arrayContaining(["char-1", "char-2"])
    );
    expect(result.storyboard.shots[0].required_character_refs).toEqual(
      expect.arrayContaining(["char-1", "char-2"])
    );
  });

  it("(b) resolves a speaker written as the character's display NAME (not characterId)", async () => {
    mockExecute.mockResolvedValue(
      successResponse(
        outputWithShot1({ characters: [], required_character_refs: [] })
      )
    );

    const result = await generateStoryboardShotgrid(
      baseParams({
        characters: [
          { characterId: "character-bob-77", name: "Bob", role: "support" },
        ],
        episodeDraft: {
          shots: [
            {
              shot_number: 1,
              summary: "Bob speaks",
              dialogue_lines: [{ speaker: "Bob", line: "Hello there." }],
            },
          ],
        },
      } as any)
    );

    expect(result.storyboard.shots[0].characters).toEqual(["character-bob-77"]);
    expect(result.storyboard.shots[0].required_character_refs).toEqual([
      "character-bob-77",
    ]);
  });

  it("(c) resolves a speaker written as the raw characterKey (characterId)", async () => {
    mockExecute.mockResolvedValue(
      successResponse(
        outputWithShot1({ characters: [], required_character_refs: [] })
      )
    );

    const result = await generateStoryboardShotgrid(
      baseParams({
        characters: [{ characterId: "char-9", name: "Nine", role: "support" }],
        episodeDraft: {
          shots: [
            {
              shot_number: 1,
              summary: "Nine speaks",
              dialogue_lines: [{ speaker: "char-9", line: "Line." }],
            },
          ],
        },
      } as any)
    );

    expect(result.storyboard.shots[0].characters).toEqual(["char-9"]);
    expect(result.storyboard.shots[0].required_character_refs).toEqual([
      "char-9",
    ]);
  });

  it("(d) does not double-add a base character's id when a family variant is already present (family-aware dedup)", async () => {
    mockExecute.mockResolvedValue(
      successResponse(
        outputWithShot1({
          characters: ["char-1-school"],
          required_character_refs: ["char-1-school"],
        })
      )
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
        episodeDraft: {
          shots: [
            {
              shot_number: 1,
              summary: "Nuna speaks",
              // Speaker written as the shared base display name — the base
              // family already has a member present (the variant), so the
              // base id must NOT be separately added.
              dialogue_lines: [{ speaker: "Nuna", line: "Hi." }],
            },
          ],
        },
      } as any)
    );

    expect(result.storyboard.shots[0].characters).toEqual(["char-1-school"]);
    expect(result.storyboard.shots[0].required_character_refs).toEqual([
      "char-1-school",
    ]);
  });

  it("(e) skips an unknown/junk speaker label instead of adding it as a raw id", async () => {
    mockExecute.mockResolvedValue(
      successResponse(
        outputWithShot1({ characters: ["char-1"], required_character_refs: ["char-1"] })
      )
    );

    const result = await generateStoryboardShotgrid(
      baseParams({
        characters: [{ characterId: "char-1", name: "Alice", role: "lead" }],
        episodeDraft: {
          shots: [
            {
              shot_number: 1,
              summary: "An unrelated extra speaks off-screen",
              dialogue_lines: [{ speaker: "Random Extra", line: "Hey!" }],
            },
          ],
        },
      } as any)
    );

    expect(result.storyboard.shots[0].characters).toEqual(["char-1"]);
    expect(result.storyboard.shots[0].required_character_refs).toEqual([
      "char-1",
    ]);
  });

  it("(f) is byte-identical for a shot whose speaker is already present in the LLM's list", async () => {
    mockExecute.mockResolvedValue(
      successResponse(
        outputWithShot1({ characters: ["char-1"], required_character_refs: ["char-1"] })
      )
    );

    const result = await generateStoryboardShotgrid(
      baseParams({
        characters: [{ characterId: "char-1", name: "Alice", role: "lead" }],
        episodeDraft: {
          shots: [
            {
              shot_number: 1,
              summary: "Alice speaks",
              dialogue_lines: [{ speaker: "char-1", line: "Already here." }],
            },
          ],
        },
      } as any)
    );

    expect(result.storyboard.shots[0].characters).toEqual(["char-1"]);
    expect(result.storyboard.shots[0].required_character_refs).toEqual([
      "char-1",
    ]);
  });

  it("(g) is a no-op when no episodeDraft is supplied at all (legacy/non-deep-draft path)", async () => {
    mockExecute.mockResolvedValue(
      successResponse(
        outputWithShot1({ characters: ["char-1"], required_character_refs: ["char-1"] })
      )
    );

    const result = await generateStoryboardShotgrid(
      baseParams({
        characters: [
          { characterId: "char-1", name: "Alice", role: "lead" },
          { characterId: "char-2", name: "Bob", role: "support" },
        ],
      })
    );

    expect(result.storyboard.shots[0].characters).toEqual(["char-1"]);
    expect(result.storyboard.shots[0].required_character_refs).toEqual([
      "char-1",
    ]);
  });

  // planning/vd-character-identity-repair/plan.md — alias-aware
  // `speakerLookup`. Series 18's live merge recorded "Kirin"/"คีริน"/"คิริน"
  // as aliases of "คิริน วัฒนเมธา" (characterId 70); these tests use that
  // exact shape.

  it("(h) resolves a speaker written as a declared alias (not the canonical name or characterId)", async () => {
    mockExecute.mockResolvedValue(
      successResponse(
        outputWithShot1({ characters: [], required_character_refs: [] })
      )
    );

    const result = await generateStoryboardShotgrid(
      baseParams({
        characters: [
          {
            characterId: "char-70",
            name: "คิริน วัฒนเมธา",
            role: "lead",
            aliases: ["คิริน", "Kirin", "คีริน"],
          },
        ],
        episodeDraft: {
          shots: [
            {
              shot_number: 1,
              summary: "คิริน speaks",
              dialogue_lines: [{ speaker: "คิริน", line: "..." }],
            },
          ],
        },
      } as any)
    );

    expect(result.storyboard.shots[0].characters).toEqual(["char-70"]);
    expect(result.storyboard.shots[0].required_character_refs).toEqual([
      "char-70",
    ]);
  });

  it("(i) a canonical name still wins over another character's alias with the same string", async () => {
    mockExecute.mockResolvedValue(
      successResponse(
        outputWithShot1({ characters: [], required_character_refs: [] })
      )
    );

    const result = await generateStoryboardShotgrid(
      baseParams({
        characters: [
          // "Kirin" is a REAL character's canonical name here...
          { characterId: "char-real-kirin", name: "Kirin", role: "support" },
          // ...while ANOTHER character also (implausibly) declares "Kirin"
          // as one of ITS aliases. The real name must win — an alias can
          // never clobber an existing name/characterId key.
          {
            characterId: "char-70",
            name: "คิริน วัฒนเมธา",
            role: "lead",
            aliases: ["Kirin"],
          },
        ],
        episodeDraft: {
          shots: [
            {
              shot_number: 1,
              summary: "Kirin speaks",
              dialogue_lines: [{ speaker: "Kirin", line: "..." }],
            },
          ],
        },
      } as any)
    );

    expect(result.storyboard.shots[0].characters).toEqual([
      "char-real-kirin",
    ]);
    expect(result.storyboard.shots[0].required_character_refs).toEqual([
      "char-real-kirin",
    ]);
  });

  it("(j) an alias resolves to the BASE character's id, never bypassing variant family-aware dedup", async () => {
    mockExecute.mockResolvedValue(
      successResponse(
        outputWithShot1({
          characters: ["char-1-school"],
          required_character_refs: ["char-1-school"],
        })
      )
    );

    const result = await generateStoryboardShotgrid(
      baseParams({
        characters: [
          {
            characterId: "char-1",
            name: "Nuna",
            role: "lead",
            aliases: ["นุน่า"],
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
        episodeDraft: {
          shots: [
            {
              shot_number: 1,
              summary: "Nuna's alias speaks",
              // Alias speaker label, while the variant is already present in
              // this shot's LLM-emitted list — must NOT force-add the base id
              // alongside it (same family-aware dedup as name-match test (d)).
              dialogue_lines: [{ speaker: "นุน่า", line: "Hi." }],
            },
          ],
        },
      } as any)
    );

    expect(result.storyboard.shots[0].characters).toEqual(["char-1-school"]);
    expect(result.storyboard.shots[0].required_character_refs).toEqual([
      "char-1-school",
    ]);
  });

  it("(k) absent aliases (undefined field) behave byte-identically to before this field existed", async () => {
    mockExecute.mockResolvedValue(
      successResponse(
        outputWithShot1({ characters: [], required_character_refs: [] })
      )
    );

    const result = await generateStoryboardShotgrid(
      baseParams({
        characters: [{ characterId: "char-1", name: "Alice", role: "lead" }],
        episodeDraft: {
          shots: [
            {
              shot_number: 1,
              summary: "Alice speaks",
              dialogue_lines: [{ speaker: "Alice", line: "Hi." }],
            },
          ],
        },
      } as any)
    );

    expect(result.storyboard.shots[0].characters).toEqual(["char-1"]);
    expect(result.storyboard.shots[0].required_character_refs).toEqual([
      "char-1",
    ]);
  });
});
