import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => "---\nname: vertical-drama-preset-synthesizer\n---\nSystem prompt body"),
  },
}));

vi.mock("@smartspec/skills", () => ({
  parseSkillFile: vi.fn(() => ({ content: "System prompt body" })),
}));

vi.mock("../skillFiles", () => ({
  resolveSkillDirCandidates: vi.fn(() => ["/fake/skills/vertical-drama-preset-synthesizer"]),
  resolveSkillManifestPath: vi.fn(() => "/fake/skills/vertical-drama-preset-synthesizer/skill.md"),
}));

const { mockHasEnoughCredits, mockDeductCredits, mockCalculateCreditsForLLM } = vi.hoisted(() => ({
  mockHasEnoughCredits: vi.fn(),
  mockDeductCredits: vi.fn(),
  mockCalculateCreditsForLLM: vi.fn(() => 2),
}));

vi.mock("../creditService", () => ({
  hasEnoughCredits: mockHasEnoughCredits,
  deductCredits: mockDeductCredits,
  calculateCreditsForLLM: mockCalculateCreditsForLLM,
}));

const { mockExecuteWithFallback } = vi.hoisted(() => ({
  mockExecuteWithFallback: vi.fn(),
}));

vi.mock("../llmRouter", () => ({
  executeWithFallback: mockExecuteWithFallback,
}));

vi.mock("../verticalDramaStoryBible", async () => {
  const actual = await vi.importActual<typeof import("../verticalDramaStoryBible")>(
    "../verticalDramaStoryBible",
  );
  return {
    ...actual,
    resolveStoryBibleModel: vi.fn(async () => "gpt-x"),
  };
});

vi.mock("../../_core/logger", () => ({
  debugError: vi.fn(),
  debugLog: vi.fn(),
}));

import {
  PresetSynthesisInputError,
  clampDraftForCreateSeries,
  synthesizeVerticalDramaPreset,
  validatePresetSynthesisSelection,
  buildFacetAssignments,
  resolveMixSelections,
  synthesizeVerticalDramaPresetV2,
  evaluatePremiseCoverage,
  type PresetSynthesisPresetInput,
  type PresetSynthesisPresetInputV2,
  type SynthesizeVerticalDramaPresetV2Params,
} from "../verticalDramaPresetSynthesis";
import { VdSchemaValidationError } from "../verticalDramaStoryBible";
import { CREATE_SERIES_FIELD_LIMITS } from "@shared/verticalDramaSeries";
import { renderCriteriaVersionMarker } from "../verticalDramaQualityCriteria";
import {
  DEFAULT_MIN_FACETS_PER_PRESET,
  mergeVisualIdentities,
  VERTICAL_DRAMA_BLEND_FACETS,
  type VerticalDramaPresetVisualIdentity,
} from "@shared/verticalDramaSeries/presetVisualIdentity";

const VALID_DRAFT = {
  contract_version: 1,
  title: "ชามนี้มีเรื่อง",
  category: "thai-local-service-comedy-drama",
  logline: "ร้านก๋วยเตี๋ยวชุมชนที่เปลี่ยนทุกออเดอร์ผิดเป็นเรื่องอบอุ่น",
  mainPlot: "ป้าจอยและทีมร้านต้องรับมือลูกค้าสารพัดแบบในตลาดเช้า",
  seasonArc: "ร้านเริ่มจากปัญหารีวิวหนึ่งดาว ก่อนรวมใจสู้ค่าเช่าตลาด",
  tone: "คอมเมดี้บริการแบบไทย อบอุ่น จังหวะไว",
  cliffhangerStyle: "จบตอนด้วยออเดอร์หรือรีวิวที่หักมุม",
  characters: [
    { name: "ป้าจอย", role: "เจ้าของร้าน", description: "ปากไว ใจดี จำลูกค้าได้ทุกคน" },
    { name: "ต้น", role: "พนักงานใหม่", description: "จริงใจเกินพอดีและทำพลาดบ่อย" },
    { name: "มิว", role: "ลูกค้าประจำ", description: "ครีเอเตอร์สายกินที่ทำให้ร้านไวรัล" },
  ],
  visualBible: "ร้านก๋วยเตี๋ยวตลาดเช้า แสงอุ่น ไอน้ำ และป้ายเมนูเขียนมือ",
  mixRecipe: {
    primaryFlavor: "restaurant_service_skit",
    supportingFlavors: ["customer_staff_situation_comedy"],
    rationale: "ร้านอาหารเป็นแกน ลูกค้ากับพนักงานเป็นสถานการณ์ประจำตอน",
  },
  warnings: [],
};

function baseParams() {
  return {
    userId: 7,
    tenantId: "tenant-1",
    locale: "th" as const,
    selectedPresets: [
      {
        id: "101",
        title: "โต๊ะสามมีเรื่อง",
        category: "restaurant_service_skit",
        logline: "ร้านอาหารครอบครัวเจอออเดอร์ป่วน",
        mainPlot: "ร้านอาหารต้องรับมือลูกค้าหลากหลาย",
        seasonArc: "ร้านปรับตัวจากระบบเก่าสู่ระบบใหม่",
        tone: "ตลกอบอุ่น",
        cliffhangerStyle: "จบด้วยรีวิวใหม่",
        characters: [{ name: "แพรว", role: "ผู้จัดการ", description: "ตั้งใจเปลี่ยนร้าน" }],
        visualBible: "ร้านอาหารแสงอุ่น",
      },
    ],
    selectedCategories: ["customer_staff_situation_comedy"],
  };
}

describe("validatePresetSynthesisSelection", () => {
  it("requires at least two selected flavors", () => {
    expect(() =>
      validatePresetSynthesisSelection({ selectedPresets: [], selectedCategories: ["restaurant_service_skit"] }),
    ).toThrow(PresetSynthesisInputError);
  });

  it("caps selected flavors at five", () => {
    expect(() =>
      validatePresetSynthesisSelection({
        selectedPresets: [{}, {}, {}],
        selectedCategories: ["a", "b", "c"],
      }),
    ).toThrow(PresetSynthesisInputError);
  });
});

describe("synthesizeVerticalDramaPreset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: {
        choices: [{ message: { content: JSON.stringify(VALID_DRAFT) } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      },
    });
  });

  it("returns a validated draft and deducts credits only after success", async () => {
    const result = await synthesizeVerticalDramaPreset(baseParams());

    expect(result.draft.title).toBe("ชามนี้มีเรื่อง");
    expect(mockHasEnoughCredits).toHaveBeenCalledWith(7, 1);
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        tenantId: "tenant-1",
        amount: 2,
        sourceType: "skill",
      }),
    );
  });

  it("does not deduct credits when the LLM output fails schema validation", async () => {
    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: {
        choices: [{ message: { content: JSON.stringify({ title: "bad" }) } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
    });

    await expect(synthesizeVerticalDramaPreset(baseParams())).rejects.toBeInstanceOf(
      VdSchemaValidationError,
    );
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("clamps a too-long title/tone before returning the draft (create-series field limits)", async () => {
    // Exceeds CREATE_SERIES_FIELD_LIMITS.tone/.genre (100) but stays within this
    // service's own (looser) synthesis schema bounds (tone <=160, title <=150) —
    // exactly the "valid here, too long there" drift this fix guards against.
    const longTone = "a".repeat(120);
    const longTitle = "b".repeat(130);
    expect(longTone.length).toBeGreaterThan(CREATE_SERIES_FIELD_LIMITS.tone);
    expect(longTitle.length).toBeGreaterThan(CREATE_SERIES_FIELD_LIMITS.genre);

    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: {
        choices: [
          {
            message: {
              content: JSON.stringify({ ...VALID_DRAFT, title: longTitle, tone: longTone }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      },
    });

    const result = await synthesizeVerticalDramaPreset(baseParams());

    expect(result.draft.title.length).toBeLessThanOrEqual(CREATE_SERIES_FIELD_LIMITS.genre);
    expect(result.draft.tone.length).toBeLessThanOrEqual(CREATE_SERIES_FIELD_LIMITS.tone);
    expect(
      result.draft.warnings.some((w) => w.code === "preset_field_length_clamped"),
    ).toBe(true);
  });
});

describe("clampDraftForCreateSeries", () => {
  it("leaves the draft untouched when title/tone are already within limits", () => {
    const { draft, clamped } = clampDraftForCreateSeries(VALID_DRAFT as never);
    expect(clamped).toBe(false);
    expect(draft).toBe(VALID_DRAFT);
  });

  it("clamps title and tone and appends a warning when either exceeds the create-series limits", () => {
    const overLimitDraft = {
      ...VALID_DRAFT,
      title: "x".repeat(CREATE_SERIES_FIELD_LIMITS.genre + 20),
      tone: "y".repeat(CREATE_SERIES_FIELD_LIMITS.tone + 20),
    };

    const { draft, clamped } = clampDraftForCreateSeries(overLimitDraft as never);

    expect(clamped).toBe(true);
    expect(draft.title.length).toBeLessThanOrEqual(CREATE_SERIES_FIELD_LIMITS.genre);
    expect(draft.tone.length).toBeLessThanOrEqual(CREATE_SERIES_FIELD_LIMITS.tone);
    expect(draft.warnings.some((w) => w.code === "preset_field_length_clamped")).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Mix and Match v2 — verifiable blend (spec §8.2.2.C, section-15)            */
/* -------------------------------------------------------------------------- */

function presetInput(overrides: Partial<PresetSynthesisPresetInput> = {}): PresetSynthesisPresetInput {
  return {
    id: "101",
    title: "Preset 101",
    category: "sci_fi_mecha",
    logline: "logline",
    mainPlot: "main plot",
    seasonArc: "season arc",
    tone: "tone",
    cliffhangerStyle: "cliffhanger",
    characters: [{ name: "A", role: "lead", description: "d" }],
    visualBible: "visual bible prose",
    ...overrides,
  };
}

function presetInputV2(overrides: Partial<PresetSynthesisPresetInputV2> = {}): PresetSynthesisPresetInputV2 {
  return { ...presetInput(overrides), visualIdentityJson: null, ...overrides };
}

describe("resolveMixSelections", () => {
  it("returns explicit selections unchanged when provided", () => {
    const result = resolveMixSelections({
      selections: [{ presetId: "101", weight: 5 }],
      selectedPresetIds: ["202"],
    });
    expect(result).toEqual([{ presetId: "101", weight: 5 }]);
  });

  it("derives equal-default-weight selections from legacy selectedPresetIds when selections is absent", () => {
    const result = resolveMixSelections({ selectedPresetIds: ["101", "202"] });
    expect(result).toEqual([
      { presetId: "101", weight: 3 },
      { presetId: "202", weight: 3 },
    ]);
  });

  it("returns [] when neither is provided", () => {
    expect(resolveMixSelections({})).toEqual([]);
  });
});

describe("buildFacetAssignments", () => {
  const presets = [
    presetInput({ id: "101", title: "Primary" }),
    presetInput({ id: "202", title: "Supporting Low" }),
    presetInput({ id: "303", title: "Supporting High" }),
  ];

  it("assigns story_spine to the primary EXCLUSIVELY", () => {
    const assignments = buildFacetAssignments(
      [
        { presetId: "101", weight: 3 },
        { presetId: "202", weight: 1 },
      ],
      presets,
      "101",
    );
    const spine = assignments.find((a) => a.facet === "story_spine")!;
    expect(spine.presetIds).toEqual(["101"]);
  });

  it("assigns every OTHER selected preset to at least minFacetsPerPreset non-spine facets", () => {
    const assignments = buildFacetAssignments(
      [
        { presetId: "101", weight: 3 },
        { presetId: "202", weight: 1 },
        { presetId: "303", weight: 1 },
      ],
      presets,
      "101",
      DEFAULT_MIN_FACETS_PER_PRESET,
    );
    for (const presetId of ["202", "303"]) {
      const facetsWithPreset = assignments.filter(
        (a) => a.facet !== "story_spine" && a.presetIds.includes(presetId),
      );
      expect(facetsWithPreset.length).toBeGreaterThanOrEqual(DEFAULT_MIN_FACETS_PER_PRESET);
    }
  });

  it("scales a higher-weight preset's facet count above the floor", () => {
    const assignments = buildFacetAssignments(
      [
        { presetId: "101", weight: 3 },
        { presetId: "202", weight: 1 },
        { presetId: "303", weight: 5 },
      ],
      presets,
      "101",
      DEFAULT_MIN_FACETS_PER_PRESET,
    );
    const countFor = (presetId: string) =>
      assignments.filter((a) => a.facet !== "story_spine" && a.presetIds.includes(presetId)).length;
    expect(countFor("303")).toBeGreaterThan(countFor("202"));
  });

  it("covers every facet in VERTICAL_DRAMA_BLEND_FACETS exactly once", () => {
    const assignments = buildFacetAssignments(
      [{ presetId: "101", weight: 3 }],
      presets,
      "101",
    );
    expect(assignments.map((a) => a.facet)).toEqual([...VERTICAL_DRAMA_BLEND_FACETS]);
  });

  it("silently drops a selection whose presetId is not among the known presets", () => {
    const assignments = buildFacetAssignments(
      [
        { presetId: "101", weight: 3 },
        { presetId: "does-not-exist", weight: 5 },
      ],
      presets,
      "101",
    );
    for (const entry of assignments) {
      expect(entry.presetIds).not.toContain("does-not-exist");
    }
  });

  it("is deterministic — identical input yields identical output", () => {
    const selections = [
      { presetId: "101", weight: 3 as const },
      { presetId: "202", weight: 2 as const },
      { presetId: "303", weight: 4 as const },
    ];
    expect(buildFacetAssignments(selections, presets, "101")).toEqual(
      buildFacetAssignments(selections, presets, "101"),
    );
  });
});

describe("synthesizeVerticalDramaPresetV2", () => {
  const WELL_BLENDED_FACETS = [
    { facet: "story_spine", contributions: [{ presetId: "101", element: "hero's journey", kept: true }] },
    {
      facet: "situations",
      contributions: [
        { presetId: "101", element: "jungle chase", kept: true },
        { presetId: "202", element: "mecha rescue", kept: true },
      ],
    },
    {
      facet: "characters",
      contributions: [
        { presetId: "101", element: "scout lead", kept: true },
        { presetId: "202", element: "mecha companion", kept: true },
      ],
    },
    { facet: "tone", contributions: [{ presetId: "101", element: "adventurous", kept: true }] },
    { facet: "cliffhanger_style", contributions: [{ presetId: "101", element: "twist", kept: true }] },
    { facet: "world_texture", contributions: [{ presetId: "101", element: "neon jungle", kept: true }] },
    { facet: "visual_identity", contributions: [{ presetId: "101", element: "palette influence", kept: true }] },
    { facet: "product_fit", contributions: [{ presetId: "101", element: "gadget tie-in", kept: true }] },
  ];

  // Same as WELL_BLENDED_FACETS but preset "202" only lands ONE kept
  // contribution ("situations") — below the default floor of 2.
  const UNDER_BLENDED_FACETS = WELL_BLENDED_FACETS.map((entry) =>
    entry.facet === "characters"
      ? { ...entry, contributions: entry.contributions.filter((c) => c.presetId !== "202") }
      : entry,
  );

  function draftPayload(overrides: Record<string, unknown> = {}) {
    return {
      contract_version: 2,
      title: "Neon Circuit Bond",
      category: "sci_fi_mecha",
      logline: "logline",
      mainPlot: "main plot",
      seasonArc: "season arc",
      tone: "เข้มข้นดิบเถื่อน",
      cliffhangerStyle: "จบด้วยหักมุม",
      characters: [
        { name: "A", role: "นางเอก", description: "d" },
        { name: "B", role: "พระเอก", description: "d" },
        { name: "C", role: "ตัวร้าย", description: "d" },
      ],
      visualBible: "prose",
      mixRecipe: { primaryFlavor: "101", supportingFlavors: ["202"], rationale: "why" },
      warnings: [],
      blendFacets: WELL_BLENDED_FACETS,
      ...overrides,
    };
  }

  function mockLlmResponse(payload: Record<string, unknown>, usage = { prompt_tokens: 100, completion_tokens: 50 }) {
    return {
      type: "success",
      response: {
        choices: [{ message: { content: JSON.stringify(payload) } }],
        usage,
      },
    };
  }

  function baseV2Params(
    overrides: Partial<SynthesizeVerticalDramaPresetV2Params> = {},
  ): SynthesizeVerticalDramaPresetV2Params {
    return {
      userId: 7,
      tenantId: "tenant-1",
      locale: "th",
      selections: [
        { presetId: "101", weight: 3 },
        { presetId: "202", weight: 2 },
      ],
      selectedPresets: [
        presetInputV2({ id: "101", title: "Neon Jungle Guardian" }),
        presetInputV2({ id: "202", title: "My Giant Companion" }),
      ],
      selectedCategories: [],
      primarySelectionId: "101",
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockHasEnoughCredits.mockResolvedValue(true);
  });

  it("returns contract_version 2 with a superset of every v1 field", async () => {
    mockExecuteWithFallback.mockResolvedValueOnce(mockLlmResponse(draftPayload()));

    const { draft } = await synthesizeVerticalDramaPresetV2(baseV2Params());

    expect(draft.contract_version).toBe(2);
    for (const key of [
      "title",
      "category",
      "logline",
      "mainPlot",
      "seasonArc",
      "tone",
      "cliffhangerStyle",
      "characters",
      "visualBible",
      "mixRecipe",
      "warnings",
    ] satisfies Array<keyof typeof draft>) {
      expect(draft).toHaveProperty(key);
    }
  });

  it("assembles blendReport server-side — contributionCoverage counts only kept:true, no underBlended when every non-primary preset hits the floor", async () => {
    mockExecuteWithFallback.mockResolvedValueOnce(mockLlmResponse(draftPayload()));

    const { draft } = await synthesizeVerticalDramaPresetV2(baseV2Params());

    expect(draft.blendReport.contractVersion).toBe(2);
    expect(draft.blendReport.minFacetsPerPreset).toBe(DEFAULT_MIN_FACETS_PER_PRESET);
    expect(draft.blendReport.contributionCoverage["202"]).toBe(2); // situations + characters
    expect(draft.blendReport.underBlended).toEqual([]);
    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(1); // no retry needed
  });

  it("never flags the primary selection as under-blended even though it only explicitly contributes to story_spine + a few others", async () => {
    // Primary "101" is the ONLY contributor on several facets above, which is
    // fine (it is exempt from the floor by design — hard rule 1).
    mockExecuteWithFallback.mockResolvedValueOnce(mockLlmResponse(draftPayload()));

    const { draft } = await synthesizeVerticalDramaPresetV2(baseV2Params());

    expect(draft.blendReport.underBlended).not.toContain("101");
  });

  it("blend QC gate: under-blended coverage triggers exactly ONE corrective retry naming the offending preset, then clears underBlended on success", async () => {
    mockExecuteWithFallback
      .mockResolvedValueOnce(mockLlmResponse(draftPayload({ blendFacets: UNDER_BLENDED_FACETS })))
      .mockResolvedValueOnce(mockLlmResponse(draftPayload({ blendFacets: WELL_BLENDED_FACETS })));

    const { draft } = await synthesizeVerticalDramaPresetV2(baseV2Params());

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(2);
    const retryCallArgs = mockExecuteWithFallback.mock.calls[1][0];
    const retryUserPrompt = retryCallArgs.messages[1].content as string;
    expect(retryUserPrompt).toContain("My Giant Companion"); // names the under-blended preset
    expect(draft.blendReport.underBlended).toEqual([]);
  });

  it("blend QC gate: still under-blended after the one retry surfaces underBlended + a warning, never throws", async () => {
    mockExecuteWithFallback
      .mockResolvedValueOnce(mockLlmResponse(draftPayload({ blendFacets: UNDER_BLENDED_FACETS })))
      .mockResolvedValueOnce(mockLlmResponse(draftPayload({ blendFacets: UNDER_BLENDED_FACETS })));

    const { draft } = await synthesizeVerticalDramaPresetV2(baseV2Params());

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(2); // exactly one retry, not more
    expect(draft.blendReport.underBlended).toEqual(["202"]);
    expect(draft.warnings.some((w) => w.code === "preset_under_blended")).toBe(true);
  });

  it("does not throw when the corrective retry call itself errors — falls back to the first attempt's result", async () => {
    // Phase A reliability fix (2026-07-09) — `executeJsonPlanningCallWithRetry`
    // (shared with verticalDramaStoryBible.ts) now retries TRANSIENT errors
    // (network/timeout/5xx) with backoff, so a "provider timeout" rejection
    // would no longer fail on the first internal attempt. A genuinely FATAL
    // error (auth failure) is used here so the retry call still fails fast,
    // preserving this test's intent (the corrective retry call errors out
    // entirely -> the first attempt's under-blended result is kept).
    mockExecuteWithFallback
      .mockResolvedValueOnce(mockLlmResponse(draftPayload({ blendFacets: UNDER_BLENDED_FACETS })))
      .mockRejectedValueOnce(new Error("Unauthorized: invalid api key"));

    const { draft } = await synthesizeVerticalDramaPresetV2(baseV2Params());

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(2); // no retry-of-the-retry — fatal fails fast.
    expect(draft.blendReport.underBlended).toEqual(["202"]);
    expect(draft.warnings.some((w) => w.code === "preset_under_blended")).toBe(true);
  });

  it("input back-compat: legacy selectedPresetIds (no explicit weights) still synthesizes successfully with equal default weights", async () => {
    mockExecuteWithFallback.mockResolvedValueOnce(mockLlmResponse(draftPayload()));

    const params = baseV2Params({ selections: undefined, selectedPresetIds: ["101", "202"] });
    const { draft } = await synthesizeVerticalDramaPresetV2(params);

    expect(draft.contract_version).toBe(2);
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ selectedPresetIds: ["101", "202"] }),
      }),
    );
  });

  it("deterministically merges visual identity in code (not the LLM) when at least one selected preset carries visualIdentityJson", async () => {
    const identityA: VerticalDramaPresetVisualIdentity = {
      styleName: "A style",
      palette: ["Teal", "Gunmetal"],
      lighting: "rim light",
      environmentMotifs: ["jungle"],
      wardrobeGrammar: ["techwear"],
      signaturePropsAndCompanions: ["companion"],
      cameraGrammar: "low angle",
      characterArchetypes: [{ role: "lead", look: "scout" }],
      imagePromptFragments: { positive: ["cinematic"], negative: ["blurry"] },
    };
    const identityB: VerticalDramaPresetVisualIdentity = {
      styleName: "B style",
      palette: ["Ivory", "Gold"],
      lighting: "hangar glow",
      environmentMotifs: ["hangar"],
      wardrobeGrammar: ["mechanic gear"],
      signaturePropsAndCompanions: ["giant robot"],
      cameraGrammar: "wide shot",
      characterArchetypes: [{ role: "companion", look: "robot" }],
      imagePromptFragments: { positive: ["warm"], negative: ["plastic"] },
    };

    const expectedMerge = mergeVisualIdentities([
      { identity: identityA, weight: 3, isPrimary: true },
      { identity: identityB, weight: 2, isPrimary: false },
    ]);

    const llmVisualIdentity = {
      styleName: "Blended Neon-Hangar Style",
      lighting: "blended lighting",
      cameraGrammar: "blended camera grammar",
      characterArchetypes: [{ role: "lead", look: "blended look" }],
      positiveFragments: ["blended cinematic tone"],
    };

    mockExecuteWithFallback.mockResolvedValueOnce(
      mockLlmResponse(draftPayload({ visualIdentity: llmVisualIdentity })),
    );

    const params = baseV2Params({
      selectedPresets: [
        presetInputV2({ id: "101", title: "Neon Jungle Guardian", visualIdentityJson: identityA }),
        presetInputV2({ id: "202", title: "My Giant Companion", visualIdentityJson: identityB }),
      ],
    });
    const { draft } = await synthesizeVerticalDramaPresetV2(params);

    expect(draft.visualIdentity).toBeDefined();
    expect(draft.visualIdentity!.styleName).toBe("Blended Neon-Hangar Style"); // LLM-authored
    expect(draft.visualIdentity!.palette).toEqual(expectedMerge.palette); // code-merged
    expect(draft.visualIdentity!.environmentMotifs).toEqual(expectedMerge.environmentMotifs);
    expect(draft.visualIdentity!.imagePromptFragments.negative).toEqual(
      expectedMerge.imagePromptFragments.negative,
    );
    expect(draft.visualIdentity!.imagePromptFragments.positive).toEqual(["blended cinematic tone"]); // LLM-authored
  });

  it("legacy tolerant: presets lacking visualIdentityJson contribute nothing — visualIdentity is omitted when NO selected preset carries one", async () => {
    mockExecuteWithFallback.mockResolvedValueOnce(mockLlmResponse(draftPayload()));

    const { draft } = await synthesizeVerticalDramaPresetV2(baseV2Params());

    expect(draft.visualIdentity).toBeUndefined();
  });

  it("does not deduct credits when the LLM output fails schema validation", async () => {
    mockExecuteWithFallback.mockResolvedValue(mockLlmResponse({ title: "bad" }));

    await expect(synthesizeVerticalDramaPresetV2(baseV2Params())).rejects.toBeInstanceOf(
      VdSchemaValidationError,
    );
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("sums token usage across the first attempt and the corrective retry into ONE credit deduction", async () => {
    mockCalculateCreditsForLLM.mockReturnValue(9);
    mockExecuteWithFallback
      .mockResolvedValueOnce(
        mockLlmResponse(draftPayload({ blendFacets: UNDER_BLENDED_FACETS }), {
          prompt_tokens: 100,
          completion_tokens: 50,
        }),
      )
      .mockResolvedValueOnce(
        mockLlmResponse(draftPayload({ blendFacets: WELL_BLENDED_FACETS }), {
          prompt_tokens: 80,
          completion_tokens: 40,
        }),
      );

    await synthesizeVerticalDramaPresetV2(baseV2Params());

    expect(mockCalculateCreditsForLLM).toHaveBeenCalledWith(180, 90, "gpt-x");
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/* User Premise & Premise-Primary Preset Mix (F132A, section-02)              */
/* -------------------------------------------------------------------------- */

describe("buildUserPrompt (via synthesizeVerticalDramaPreset) — premise-primary blending", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: {
        choices: [{ message: { content: JSON.stringify(VALID_DRAFT) } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      },
    });
  });

  function capturedUserPrompt(): string {
    const call = mockExecuteWithFallback.mock.calls[0][0];
    return call.messages[1].content as string;
  }

  it("without userPremise: prompt contains no USER PREMISE section", async () => {
    await synthesizeVerticalDramaPreset(baseParams());
    expect(capturedUserPrompt()).not.toContain("USER PREMISE");
  });

  it("with userPremise: prompt contains the USER PREMISE (PRIMARY SPINE) header and the premise text verbatim, ahead of the payload JSON", async () => {
    const premise = "ตำรวจสาวสืบคดีฆาตกรรมในโรงพยาบาลกลางดึก";
    await synthesizeVerticalDramaPreset({ ...baseParams(), userPremise: premise });

    const prompt = capturedUserPrompt();
    expect(prompt).toContain("USER PREMISE (PRIMARY SPINE):");
    expect(prompt).toContain(premise);
    expect(prompt).toContain("Blending rules when a user premise is present:");

    const premiseIndex = prompt.indexOf("USER PREMISE (PRIMARY SPINE):");
    const payloadIndex = prompt.indexOf('"selectedPresets"');
    expect(premiseIndex).toBeGreaterThanOrEqual(0);
    expect(payloadIndex).toBeGreaterThan(premiseIndex);
  });

  it("blank/whitespace-only userPremise behaves like an absent premise (no USER PREMISE section)", async () => {
    await synthesizeVerticalDramaPreset({ ...baseParams(), userPremise: "   " });
    expect(capturedUserPrompt()).not.toContain("USER PREMISE");
  });

  it("embeds the shared criteria version marker regardless of userPremise presence (Finding 8 / §11 adoption)", async () => {
    await synthesizeVerticalDramaPreset(baseParams());
    expect(capturedUserPrompt()).toContain(renderCriteriaVersionMarker());

    mockExecuteWithFallback.mockClear();
    await synthesizeVerticalDramaPreset({ ...baseParams(), userPremise: "แนวสืบสวน" });
    expect(capturedUserPrompt()).toContain(renderCriteriaVersionMarker());
  });
});

describe("buildUserPromptV2 (via synthesizeVerticalDramaPresetV2) — premise-primary blending", () => {
  const WELL_BLENDED_FACETS_MIN = [
    { facet: "story_spine", contributions: [{ presetId: "101", element: "hero's journey", kept: true }] },
    {
      facet: "situations",
      contributions: [
        { presetId: "101", element: "chase", kept: true },
        { presetId: "202", element: "support beat", kept: true },
      ],
    },
    {
      facet: "characters",
      contributions: [
        { presetId: "101", element: "lead", kept: true },
        { presetId: "202", element: "sidekick", kept: true },
      ],
    },
    { facet: "tone", contributions: [{ presetId: "101", element: "tense", kept: true }] },
    { facet: "cliffhanger_style", contributions: [{ presetId: "101", element: "twist", kept: true }] },
    { facet: "world_texture", contributions: [{ presetId: "101", element: "texture", kept: true }] },
    { facet: "visual_identity", contributions: [{ presetId: "101", element: "palette", kept: true }] },
    { facet: "product_fit", contributions: [{ presetId: "101", element: "tie-in", kept: true }] },
  ];

  function draftV2Payload(overrides: Record<string, unknown> = {}) {
    return {
      contract_version: 2,
      title: "Title",
      category: "sci_fi_mecha",
      logline: "logline",
      mainPlot: "main plot",
      seasonArc: "season arc",
      tone: "tone",
      cliffhangerStyle: "cliffhanger",
      characters: [
        { name: "A", role: "lead", description: "d" },
        { name: "B", role: "support", description: "d" },
        { name: "C", role: "villain", description: "d" },
      ],
      visualBible: "prose",
      mixRecipe: { primaryFlavor: "101", supportingFlavors: ["202"], rationale: "why" },
      warnings: [],
      blendFacets: WELL_BLENDED_FACETS_MIN,
      ...overrides,
    };
  }

  function baseV2ParamsMin(
    overrides: Partial<SynthesizeVerticalDramaPresetV2Params> = {},
  ): SynthesizeVerticalDramaPresetV2Params {
    return {
      userId: 7,
      tenantId: "tenant-1",
      locale: "th",
      selections: [
        { presetId: "101", weight: 3 },
        { presetId: "202", weight: 2 },
      ],
      selectedPresets: [
        presetInputV2({ id: "101", title: "Primary Preset" }),
        presetInputV2({ id: "202", title: "Supporting Preset" }),
      ],
      selectedCategories: [],
      primarySelectionId: "101",
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: {
        choices: [{ message: { content: JSON.stringify(draftV2Payload()) } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      },
    });
  });

  function capturedUserPromptV2(): string {
    const call = mockExecuteWithFallback.mock.calls[0][0];
    return call.messages[1].content as string;
  }

  it("without userPremise: prompt contains no USER PREMISE section", async () => {
    await synthesizeVerticalDramaPresetV2(baseV2ParamsMin());
    expect(capturedUserPromptV2()).not.toContain("USER PREMISE");
  });

  it("with userPremise: prompt contains the USER PREMISE (PRIMARY SPINE) header and the premise text verbatim, ahead of the payload JSON", async () => {
    const premise = "นักสืบหนุ่มไล่ล่าคดีปริศนาในเมืองท่า";
    await synthesizeVerticalDramaPresetV2({ ...baseV2ParamsMin(), userPremise: premise });

    const prompt = capturedUserPromptV2();
    expect(prompt).toContain("USER PREMISE (PRIMARY SPINE):");
    expect(prompt).toContain(premise);

    const premiseIndex = prompt.indexOf("USER PREMISE (PRIMARY SPINE):");
    const payloadIndex = prompt.indexOf('"selectedPresets"');
    expect(payloadIndex).toBeGreaterThan(premiseIndex);
  });

  it("embeds the shared criteria version marker regardless of userPremise presence", async () => {
    await synthesizeVerticalDramaPresetV2(baseV2ParamsMin());
    expect(capturedUserPromptV2()).toContain(renderCriteriaVersionMarker());
  });
});

describe("evaluatePremiseCoverage", () => {
  it("faithful draft: premise entities present in the draft → covered: true, no warning", () => {
    const premise = "ตำรวจสาวสืบคดีฆาตกรรมในโรงพยาบาล";
    const result = evaluatePremiseCoverage(premise, {
      logline: "ตำรวจสาวมือใหม่ต้องสืบคดีฆาตกรรมลึกลับที่เกิดขึ้นกลางโรงพยาบาลยามดึก",
      mainPlot: "เธอไล่ตามเบาะแสในโรงพยาบาลทีละจุดจนเจอความจริง",
      seasonArc: "คดีฆาตกรรมในโรงพยาบาลค่อยๆคลี่คลายตลอดซีซัน",
    });

    expect(result.covered).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it("drifted draft: premise entities entirely absent from the draft → covered: false, stable warning code", () => {
    const premise = "ตำรวจสาวสืบคดีฆาตกรรมในโรงพยาบาล";
    const result = evaluatePremiseCoverage(premise, {
      logline: "เชฟหนุ่มแข่งทำอาหารในครัวเรียลิตี้โชว์",
      mainPlot: "ทีมกุ๊กแข่งกันปรุงเมนูใหม่ทุกสัปดาห์เพื่อชิงรางวัลใหญ่",
      seasonArc: "การแข่งขันทำอาหารทวีความเข้มข้นขึ้นเรื่อยๆ จนถึงรอบชิงชนะเลิศ",
    });

    expect(result.covered).toBe(false);
    expect(result.warning).toBeDefined();
    expect(result.warning?.code).toBe("premise_coverage_low");
  });

  it("empty/whitespace-only premise short-circuits to covered: true (defensive no-op)", () => {
    expect(evaluatePremiseCoverage("", { logline: "a", mainPlot: "b", seasonArc: "c" }).covered).toBe(
      true,
    );
    expect(
      evaluatePremiseCoverage("   ", { logline: "a", mainPlot: "b", seasonArc: "c" }).covered,
    ).toBe(true);
  });
});

describe("synthesizeVerticalDramaPreset with a drifted userPremise", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasEnoughCredits.mockResolvedValue(true);
  });

  it("appends a premise_coverage_low warning after existing clamp warnings when the LLM response drifts from the premise", async () => {
    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                ...VALID_DRAFT,
                logline: "เชฟหนุ่มแข่งทำอาหารในครัวเรียลิตี้โชว์",
                mainPlot: "ทีมกุ๊กแข่งกันปรุงเมนูใหม่ทุกสัปดาห์",
                seasonArc: "การแข่งขันทำอาหารทวีความเข้มข้นขึ้นเรื่อยๆ",
                warnings: [{ code: "existing_warning", message: "pre-existing" }],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      },
    });

    const { draft } = await synthesizeVerticalDramaPreset({
      ...baseParams(),
      userPremise: "ตำรวจสาวสืบคดีฆาตกรรมในโรงพยาบาล",
    });

    expect(draft.warnings[0].code).toBe("existing_warning");
    expect(draft.warnings[draft.warnings.length - 1].code).toBe("premise_coverage_low");
  });

  it("does not append a coverage warning when userPremise is absent", async () => {
    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: {
        choices: [{ message: { content: JSON.stringify(VALID_DRAFT) } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      },
    });

    const { draft } = await synthesizeVerticalDramaPreset(baseParams());
    expect(draft.warnings.some((w) => w.code === "premise_coverage_low")).toBe(false);
  });
});
