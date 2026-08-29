import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockExecute,
  mockHasEnoughCredits,
  mockDeductCredits,
  mockResolveModel,
} = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockHasEnoughCredits: vi.fn(),
  mockDeductCredits: vi.fn(),
  mockResolveModel: vi.fn(),
}));

vi.mock("../creditService", () => ({
  calculateCreditsForLLM: vi.fn(() => 3),
  deductCredits: mockDeductCredits,
  hasEnoughCredits: mockHasEnoughCredits,
}));

vi.mock("../verticalDramaStoryBible", () => ({
  executeJsonPlanningCallWithRetry: mockExecute,
  resolveStoryBibleModel: mockResolveModel,
  VD_COMPACT_JSON_INSTRUCTION: "Return JSON",
}));

import {
  designVerticalDramaCharacterLooks,
  VERTICAL_DRAMA_CHARACTER_LOOK_DESIGNER_SKILL_SLUG,
} from "../verticalDramaCharacterLookDesigner";
import {
  resolveSkillDirCandidates,
  resolveSkillManifestPath,
} from "../skillFiles";

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../../skills/vertical-drama-character-look-designer/fixtures/pass.output.json",
      import.meta.url
    ),
    "utf8"
  )
);

const params = {
  userId: 42,
  tenantId: "tenant-1",
  seriesId: 7,
  episodeId: 8,
  episodeNumber: 2,
  idempotencyKey: "vd-look:test-request",
  seriesContext: { locale: "th" as const, genre: "family drama", tone: "warm" },
  characters: [
    {
      characterKey: "mali",
      name: "มะลิ",
      role: "lead",
      identityFacts:
        "same face, body proportions, black hair, mole under left eye",
    },
  ],
  requests: [
    {
      baseCharacterKey: "mali",
      parentCharacterKey: "mali",
      variantLabel: "ลุคอยู่บ้าน",
      variantType: "outfit" as const,
      canonicalIntent: "casual_home",
      requestKey: "mali::outfit::home",
      evidence: [{ shotNumber: 1, text: "อยู่บ้านตอนเช้า", sceneKey: "home" }],
      sourceShotNumbers: [1],
    },
  ],
};

const ageStageParams = {
  ...params,
  requests: [
    {
      ...params.requests[0],
      variantLabel: "วัยนักศึกษา",
      variantType: "age_stage" as const,
      ageStage: "university_student" as const,
      canonicalIntent: "university_student",
    },
  ],
};

describe("vertical drama character look designer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is discoverable through the Admin skill-folder manifest resolver", () => {
    const skillDir = resolveSkillDirCandidates(
      `skills/${VERTICAL_DRAMA_CHARACTER_LOOK_DESIGNER_SKILL_SLUG}`
    ).find(candidate => Boolean(resolveSkillManifestPath(candidate)));
    expect(skillDir).toBeTruthy();
    expect(resolveSkillManifestPath(skillDir!)).toMatch(/(?:SKILL|skill)\.md$/);
    expect(
      readFileSync(resolveSkillManifestPath(skillDir!)!, "utf8")
    ).toContain("name: Vertical Drama Character Look Designer");
  });

  it("uses the real skill prompt boundary, renders visual-only fields, and bills the skill slug", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockResolveModel.mockResolvedValue("test-model");
    mockExecute.mockImplementation(
      async ({ systemPrompt }: { systemPrompt: string }) => ({
        data: fixture,
        response: { usage: { prompt_tokens: 100, completion_tokens: 80 } },
        systemPrompt,
      })
    );

    const result = await designVerticalDramaCharacterLooks(params);
    const designed = result.designs.get(params.requests[0].requestKey);

    expect(designed?.description).toContain("เสื้อแขนสั้น");
    expect(designed?.description).not.toContain("อยู่บ้านตอนเช้า");
    expect(designed?.imageBrief).not.toContain("evidence");
    expect(result.skillContentHash).toMatch(/^[a-f0-9]{32}$/);
    expect(mockExecute.mock.calls[0][0].systemPrompt).toContain("untrusted");
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        skillSlug: VERTICAL_DRAMA_CHARACTER_LOOK_DESIGNER_SKILL_SLUG,
        sourceType: "skill",
        idempotencyKey: params.idempotencyKey,
        metadata: expect.objectContaining({
          skillContentHash: result.skillContentHash,
          validation: "passed",
        }),
      })
    );
  });

  it("passes legacy visual details as transformation context, not as final prose", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockResolveModel.mockResolvedValue("test-model");
    let capturedUserPrompt = "";
    mockExecute.mockImplementation(
      async ({ userPrompt }: { userPrompt: string }) => {
        capturedUserPrompt = userPrompt;
        return {
          data: fixture,
          response: { usage: { prompt_tokens: 100, completion_tokens: 80 } },
        };
      }
    );

    await designVerticalDramaCharacterLooks({
      ...params,
      requests: [
        {
          ...params.requests[0],
          legacyVisualContext: {
            variantLabel: "ชุดลำลองอยู่บ้าน",
            description:
              "มยุรีอยู่บ้านเตรียมอาหารและคุยกับครอบครัว Story evidence: episode 8",
            wardrobeRules: ["เสื้อผ้าสบาย ๆ ในบ้าน"],
          },
        },
      ],
    });

    expect(capturedUserPrompt).toContain("legacy_visual_context");
    expect(capturedUserPrompt).toContain("ชุดลำลองอยู่บ้าน");
    expect(capturedUserPrompt).toContain("extract useful visual cues");
    expect(capturedUserPrompt).toContain("never copy that prose");
  });

  it("accepts a pre-provenance repair without fabricating a storyboard shot", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockResolveModel.mockResolvedValue("test-model");
    const legacyOutput = structuredClone(fixture);
    legacyOutput.designs[0].evidence_refs = [
      {
        shot_number: 0,
        evidence_type: "legacy_visual_context",
        evidence_span: "old visual field supplied for repair",
      },
    ];
    mockExecute.mockResolvedValue({
      data: legacyOutput,
      response: { usage: { prompt_tokens: 100, completion_tokens: 80 } },
    });

    const result = await designVerticalDramaCharacterLooks({
      ...params,
      requests: [
        {
          ...params.requests[0],
          legacyVisualOnly: true,
          evidence: [
            {
              shotNumber: 0,
              evidenceType: "legacy_visual_context",
              text: "Legacy visual fields supplied for explicit repair; no storyboard evidence is available.",
            },
          ],
          sourceShotNumbers: [0],
        },
      ],
    });

    expect(
      result.designs.get(params.requests[0].requestKey)?.evidenceRefs
    ).toEqual([
      {
        shotNumber: 0,
        evidenceType: "legacy_visual_context",
        evidenceSpan: "old visual field supplied for repair",
      },
    ]);
  });

  it("reconciles a legacy evidence type mismatch to the legacy sentinel", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockResolveModel.mockResolvedValue("test-model");
    const legacyOutput = structuredClone(fixture);
    legacyOutput.designs[0].evidence_refs = [
      {
        shot_number: 0,
        evidence_span: "model omitted the required legacy evidence type",
      },
    ];
    mockExecute.mockResolvedValue({
      data: legacyOutput,
      response: { usage: { prompt_tokens: 100, completion_tokens: 80 } },
    });

    const result = await designVerticalDramaCharacterLooks({
      ...params,
      requests: [
        {
          ...params.requests[0],
          legacyVisualOnly: true,
          evidence: [
            {
              shotNumber: 0,
              evidenceType: "legacy_visual_context",
              text: "Legacy visual fields supplied for explicit repair; no storyboard evidence is available.",
            },
          ],
          sourceShotNumbers: [0],
        },
      ],
    });

    expect(
      result.designs.get(params.requests[0].requestKey)?.evidenceRefs
    ).toEqual([
      {
        shotNumber: 0,
        evidenceType: "legacy_visual_context",
        evidenceSpan:
          "Legacy visual fields supplied for explicit repair; no storyboard evidence is available.",
      },
    ]);
  });

  it("rejects an LLM design that copies story evidence into visual fields", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockResolveModel.mockResolvedValue("test-model");
    const leaked = structuredClone(fixture);
    leaked.designs[0].look_design.outfit.top =
      "Story evidence: อยู่บ้านตอนเช้า";
    mockExecute.mockResolvedValue({
      data: leaked,
      response: { usage: { prompt_tokens: 100, completion_tokens: 80 } },
    });

    await expect(designVerticalDramaCharacterLooks(params)).rejects.toThrow(
      /story\/provenance/
    );
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("reconciles an invalid LLM evidence reference to caller-supplied evidence", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockResolveModel.mockResolvedValue("test-model");
    const ungrounded = structuredClone(fixture);
    ungrounded.designs[0].evidence_refs[0].shot_number = 999;
    mockExecute.mockResolvedValue({
      data: ungrounded,
      response: { usage: { prompt_tokens: 100, completion_tokens: 80 } },
    });

    const result = await designVerticalDramaCharacterLooks(params);

    expect(
      result.designs.get(params.requests[0].requestKey)?.evidenceRefs
    ).toEqual([
      {
        shotNumber: 1,
        evidenceSpan: "อยู่บ้านตอนเช้า",
      },
    ]);
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "age_stage without canonical age_stage",
      (output: any) => {
        output.designs[0].look_design.variant_type = "age_stage";
        output.designs[0].look_design.age_stage_description =
          "ช่วงวัยมหาวิทยาลัยที่โตขึ้นอย่างเป็นธรรมชาติ";
      },
    ],
    [
      "age_stage without age_stage_description",
      (output: any) => {
        output.designs[0].look_design.variant_type = "age_stage";
        output.designs[0].look_design.age_stage = "university_student";
      },
    ],
    [
      "review_required without conflict_reason",
      (output: any) => {
        output.designs[0].review_required = true;
      },
    ],
  ])("rejects invalid structured contract: %s", async (_label, mutate) => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockResolveModel.mockResolvedValue("test-model");
    const invalid = structuredClone(fixture);
    mutate(invalid);
    mockExecute.mockResolvedValue({
      data: invalid,
      response: { usage: { prompt_tokens: 100, completion_tokens: 80 } },
    });

    const requestParams =
      invalid.designs[0].look_design.variant_type === "age_stage"
        ? ageStageParams
        : params;
    await expect(
      designVerticalDramaCharacterLooks(requestParams)
    ).rejects.toThrow();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("requires the LLM to preserve the requested canonical life stage", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockResolveModel.mockResolvedValue("test-model");
    const wrongStage = structuredClone(fixture);
    wrongStage.designs[0].look_design.variant_type = "age_stage";
    wrongStage.designs[0].look_design.age_stage = "adult";
    wrongStage.designs[0].look_design.age_stage_description = "วัยผู้ใหญ่";
    mockExecute.mockResolvedValue({
      data: wrongStage,
      response: { usage: { prompt_tokens: 100, completion_tokens: 80 } },
    });

    await expect(
      designVerticalDramaCharacterLooks(ageStageParams)
    ).rejects.toThrow(/target age stage/);
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });
});
