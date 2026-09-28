/**
 * Stage 2.6 (`planning/vd-series-memory-and-lineage/plan.md`) — season 2 /
 * special-edition create modes in the Create-Series Wizard.
 *
 * Kept in a SEPARATE file from `CreateSeriesWizard.test.tsx` (rather than
 * adding lineage `describe`s there) so this file's own mock module can
 * default `useTenantFeatureFlag` to `true`, without risking that default
 * leaking into the pre-existing (flag-off) suite. `CreateSeriesWizard.test.tsx`
 * itself was updated (mock added, defaulting to `false`) and passes
 * UNMODIFIED — the real regression guard. The "byte-identity" describe block
 * below additionally proves original mode is unchanged even in THIS file,
 * where the flag is mocked ON but `createMode` is never touched.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeDraftQualityQcReport,
  fingerprintDraftQualityQcCandidate,
} from "@shared/verticalDramaSeries/draftQualityQc";

import { resolveCarryOverCharacters } from "@/components/verticalDramaSeries/CreateSeriesWizard";
import {
  resolveWizardSteps,
  wizardSteps,
} from "@/components/verticalDramaSeries/verticalDramaCopy";

const mockListGenrePresetsQuery = vi.fn();
const mockListProductsQuery = vi.fn();
const mockSynthesizeMutate = vi.fn();
const mockGenerateStoryMutate = vi.fn();
const mockCreateMutate = vi.fn();
const mockUseTenantFeatureFlag = vi.fn();
const mockSeriesListQuery = vi.fn();
const mockGetSeriesQuery = vi.fn();
const mockGetSeriesMemoryQuery = vi.fn();
const mockPlanningModelsQuery = vi.fn();
const mockCarryOverMutate = vi.fn();
const mockSpecialEditionMutate = vi.fn();
const mockUploadMutate = vi.fn();
const mockDraftQcEstimateQuery = vi.fn();
const mockDraftQcStatusQuery = vi.fn();
const mockDraftQcStartMutate = vi.fn();
let mockDraftQcStatus: { data?: unknown } = { data: undefined };

function makePassingDraftQcResult(draft: Record<string, unknown>) {
  const report = computeDraftQualityQcReport(
    {
      criteria: [
        "hook_strength",
        "premise_core_conflict",
        "vertical_drama_engine",
        "escalation_twist_potential",
        "character_emotional_engine",
        "target_audience_market_fit",
        "originality_differentiation",
        "long_form_sustainability",
      ].map(criterionId => ({
        criterionId,
        rawScore: 5,
        evidence: "test evidence",
      })) as never,
      criticalFails: [],
      strengths: ["clear hook"],
      weaknesses: [],
      recommendations: [],
    },
    "2026-08-12T00:00:00.000Z"
  );
  return {
    best: {
      draft,
      report,
      round: 0,
      fingerprint: fingerprintDraftQualityQcCandidate(draft),
    },
    history: [
      {
        round: 0,
        score: report.overallScore,
        status: report.status,
        kept: true,
        reason: "passed",
      },
    ],
    creditEstimate: {
      baselineCalls: 1,
      maxImprovementRounds: 3,
      maxCalls: 7,
      estimatedCredits: 7,
      actualCredits: 1,
    },
    stopReason: "passed",
    model: "test-model",
  };
}

let mockSynthesizeMutationState: {
  data: unknown;
  isPending: boolean;
  error?: { message?: string };
} = { data: undefined, isPending: false };
let mockDraftCompositionStatus: { data: any } = { data: undefined };

let mockCarryOverMutationState: {
  data: unknown;
  isPending: boolean;
  error?: { message?: string };
} = { data: undefined, isPending: false };

let mockSpecialEditionMutationState: {
  data: unknown;
  isPending: boolean;
  error?: { message?: string };
} = { data: undefined, isPending: false };

vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlag: (flag: string) => mockUseTenantFeatureFlag(flag),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      verticalDramaSeries: {
        get: { invalidate: vi.fn() },
        list: { invalidate: vi.fn() },
      },
    }),
    verticalDramaSeries: {
      listGenrePresets: { useQuery: () => mockListGenrePresetsQuery() },
      getPlanningSourcePackPointer: {
        useQuery: () => ({ data: { pointer: null }, isLoading: false }),
      },
      persistPlanningSourcePackPointer: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      updatePlanningSeriesSnapshot: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      createSourcePackSession: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
          error: undefined,
          reset: vi.fn(),
        }),
      },
      getOrCreateSourcePack: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
          error: undefined,
          reset: vi.fn(),
        }),
      },
      getSourcePackReadiness: {
        useQuery: () => ({ data: null, isLoading: false, error: undefined }),
      },
      getSourcePack: {
        useQuery: () => ({ data: null, isLoading: false, error: undefined }),
      },
      previewPromptExpansion: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      applyPromptExpansion: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      getDraftCompositionStatus: {
        useQuery: () =>
          mockDraftCompositionStatus.data
            ? mockDraftCompositionStatus
            : mockSynthesizeMutationState.data
              ? {
                  data: {
                    status: "ready_for_qc",
                    result: mockSynthesizeMutationState.data,
                  },
                }
              : mockDraftCompositionStatus,
      },
      getDraftWorkspaceStatus: {
        useQuery: (
          _input: unknown,
          options?: {
            refetchInterval?: (query: { state: { data: unknown } }) => unknown;
          }
        ) => {
          options?.refetchInterval?.({ state: { data: null } });
          return { data: null };
        },
      },
      startDraftComposition: {
        useMutation: (opts: { onSuccess?: (data: unknown) => void }) => ({
          mutate: (input: unknown) => {
            mockSynthesizeMutate(input);
            if (!mockSynthesizeMutationState.data) {
              mockSynthesizeMutationState.data = {
                draft: {
                  contract_version: 1,
                  title: "Generated Lineage Draft",
                  titleOptions: [
                    "Generated Lineage Draft",
                    "Summer Promise",
                    "The Returning Season",
                    "Between Two Seasons",
                  ],
                  category: "drama_romance",
                  logline: "generated lineage logline",
                  mainPlot: "generated lineage main plot",
                  seasonArc: "generated lineage season arc",
                  tone: "generated lineage tone",
                  cliffhangerStyle: "generated lineage cliffhanger",
                  creatorSummary: {
                    whatItIsAbout: "about",
                    protagonistAndGoal: "goal",
                    conflictAndDiscovery: "conflict",
                    centralMystery: "mystery",
                    decisionNotes: ["note"],
                  },
                  characters: [
                    {
                      name: "A",
                      role: "Lead",
                      description: "desc",
                      narrativeRole: "protagonist",
                      roleTier: "lead_female",
                      occupation: "student",
                    },
                    {
                      name: "B",
                      role: "Support",
                      description: "desc",
                      narrativeRole: "supporting",
                      roleTier: "support_memorable",
                      occupation: "friend",
                    },
                    {
                      name: "C",
                      role: "Rival",
                      description: "desc",
                      narrativeRole: "antagonist",
                      roleTier: "rival_male",
                      occupation: "rival",
                    },
                  ],
                  locations: [
                    { name: "Campus", description: "campus" },
                    { name: "Cafe", description: "cafe" },
                    { name: "Home", description: "home" },
                  ],
                  visualBible: "generated lineage visual bible",
                  warnings: [],
                },
              };
            }
            mockDraftCompositionStatus = {
              data: {
                status: "ready_for_qc",
                result: mockSynthesizeMutationState.data,
              },
            };
            opts.onSuccess?.({
              jobId: "00000000-0000-4000-8000-000000000003",
              deduped: false,
            });
          },
          isPending: false,
          reset: vi.fn(),
          error: undefined,
        }),
      },
      getDraftQualityQcEstimate: { useQuery: () => mockDraftQcEstimateQuery() },
      getDraftQualityQcStatus: { useQuery: () => mockDraftQcStatusQuery() },
      startDraftQualityQc: {
        useMutation: (opts: { onSuccess?: (data: unknown) => void }) => ({
          mutate: (input: unknown) => {
            mockDraftQcStartMutate(input);
            const draft = (input as { draft: Record<string, unknown> }).draft;
            mockDraftQcStatus = {
              data: {
                status: "succeeded",
                result: makePassingDraftQcResult(draft),
              },
            };
            opts.onSuccess?.({
              runId: "00000000-0000-4000-8000-000000000001",
              deduped: false,
              candidateFingerprint: fingerprintDraftQualityQcCandidate(draft),
            });
          },
          isPending: false,
        }),
      },
      cancelDraftQualityQc: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      selectDraftQualityQcCandidate: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      list: { useQuery: () => mockSeriesListQuery() },
      get: { useQuery: () => mockGetSeriesQuery() },
      getSeriesMemory: { useQuery: () => mockGetSeriesMemoryQuery() },
      listQualityPlanningModels: {
        useQuery: () => mockPlanningModelsQuery(),
      },
      proposeSeasonCarryOver: {
        useMutation: (opts: { onError?: (err: unknown) => void } = {}) => ({
          mutate: (input: unknown) => {
            mockCarryOverMutate(input);
            if (mockCarryOverMutationState.error) {
              opts?.onError?.(mockCarryOverMutationState.error);
            }
          },
          get data() {
            return mockCarryOverMutationState.data;
          },
          get isPending() {
            return mockCarryOverMutationState.isPending;
          },
          get error() {
            return mockCarryOverMutationState.error;
          },
          reset: vi.fn(),
        }),
      },
      proposeSpecialEditionBrief: {
        useMutation: (
          opts: {
            onSuccess?: (data: unknown) => void;
            onError?: (err: unknown) => void;
          } = {}
        ) => ({
          mutate: (input: unknown) => {
            mockSpecialEditionMutate(input);
            if (mockSpecialEditionMutationState.data) {
              opts?.onSuccess?.(mockSpecialEditionMutationState.data);
            } else if (mockSpecialEditionMutationState.error) {
              opts?.onError?.(mockSpecialEditionMutationState.error);
            }
          },
          get data() {
            return mockSpecialEditionMutationState.data;
          },
          get isPending() {
            return mockSpecialEditionMutationState.isPending;
          },
          get error() {
            return mockSpecialEditionMutationState.error;
          },
          reset: vi.fn(),
        }),
      },
      synthesizeGenrePreset: {
        useMutation: (opts: {
          onSuccess?: (data: unknown) => void;
          onError?: (err: unknown) => void;
        }) => ({
          mutate: (input: unknown) => {
            mockSynthesizeMutate(input);
            if (
              !mockSynthesizeMutationState.data &&
              !mockSynthesizeMutationState.error
            ) {
              mockSynthesizeMutationState.data = {
                draft: {
                  contract_version: 1,
                  title: "Generated Lineage Draft",
                  titleOptions: [
                    "Generated Lineage Draft",
                    "Summer Promise",
                    "The Returning Season",
                    "Between Two Seasons",
                  ],
                  category: "drama_romance",
                  logline: "generated lineage logline",
                  mainPlot: "generated lineage main plot",
                  seasonArc: "generated lineage season arc",
                  tone: "generated lineage tone",
                  cliffhangerStyle: "generated lineage cliffhanger",
                  characters: [
                    { name: "A", role: "Lead", description: "desc" },
                    { name: "B", role: "Support", description: "desc" },
                    { name: "C", role: "Rival", description: "desc" },
                  ],
                  visualBible: "generated lineage visual bible",
                  warnings: [],
                },
                creditsUsed: 1,
                model: "test-model",
              };
            }
            opts?.onSuccess?.(mockSynthesizeMutationState.data);
          },
          get data() {
            return mockSynthesizeMutationState.data;
          },
          get isPending() {
            return mockSynthesizeMutationState.isPending;
          },
          get error() {
            return mockSynthesizeMutationState.error;
          },
          reset: vi.fn(),
        }),
      },
      generateStoryBible: {
        useMutation: () => ({
          mutate: (input: unknown) => mockGenerateStoryMutate(input),
          isPending: false,
        }),
      },
      create: {
        useMutation: (opts: { onSuccess?: (data: unknown) => void }) => ({
          mutate: (input: unknown) => {
            mockCreateMutate(input);
          },
          isPending: false,
        }),
      },
    },
    marketplaceCapture: {
      listProducts: { useQuery: () => mockListProductsQuery() },
    },
    ai: {
      upload: {
        useMutation: () => ({
          mutateAsync: (input: unknown) => mockUploadMutate(input),
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { CreateSeriesWizard } from "@/components/verticalDramaSeries/CreateSeriesWizard";

function renderWizard() {
  return render(
    <CreateSeriesWizard
      open
      lang="th"
      planningSeriesId="99"
      onOpenChange={() => {}}
      onCreated={() => {}}
    />
  );
}

function satisfyDraftGate(title = "Lineage Test Series") {
  if (!screen.queryByText(/^ชื่อซีรีย์/)) {
    fireEvent.click(screen.getByRole("button", { name: /1\. ตั้งค่าพื้นฐาน/ }));
  }
  const titleInput = screen
    .getByText(/^ชื่อซีรีย์/)
    .closest("div")
    ?.querySelector("input") as HTMLInputElement;
  if (!titleInput.value) {
    fireEvent.change(titleInput, { target: { value: title } });
  }
  fireEvent.click(screen.getByRole("button", { name: /ให้ AI สร้าง/ }));
  const qcButton = screen.queryByRole("button", { name: "เริ่มตรวจ QC" });
  if (qcButton && !qcButton.hasAttribute("disabled")) {
    fireEvent.click(qcButton);
    const confirmQcButton = screen.queryByRole("button", {
      name: "ยืนยันและเริ่ม",
    });
    if (confirmQcButton) fireEvent.click(confirmQcButton);
  }
  fireEvent.click(screen.getByRole("button", { name: /ใช้ draft นี้/ }));
}

const parentSeriesRow = {
  id: "16",
  title: "รักข้ามเวลา",
  genre: "ดราม่าโรแมนติก",
  tone: "อบอุ่น",
  bible: { visualStyle: "โทนพาสเทลอบอุ่น" },
  memory: { compactSummary: "พิมพ์ดาวและกวินท์คบกันแบบเปิดเผยแล้ว" },
};

const carryOverDraft = {
  contractVersion: 1,
  characters: [
    {
      characterKey: "char_wain",
      name: "เวน",
      postFinaleStatus: "แต่งงานแล้ว",
      availability: "returns",
    },
  ],
  newCharacterSuggestions: ["เพื่อนใหม่ของเวน"],
  newConflictDirections: ["ธุรกิจครอบครัวใกล้ล้มละลาย"],
  antagonistStrategy: "ตัวร้ายเดิมกลับมาแบบเปลี่ยนไป",
  carriedRelationships: [
    {
      pair: ["char_wain", "char_ploy"],
      status: "คบกัน",
      disclosure: "public",
      knownBy: ["char_wain", "char_ploy"],
      sinceEpisode: 20,
    },
  ],
  carriedThreads: [
    {
      threadId: "thread_1",
      description: "รีโนเวทบ้านยังไม่เสร็จ",
      threadClass: "domestic",
      openedEpisode: 18,
    },
  ],
};

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  mockUseTenantFeatureFlag.mockReturnValue(true);
  mockListGenrePresetsQuery.mockReturnValue({
    data: { presets: [] },
    isLoading: false,
  });
  mockListProductsQuery.mockReturnValue({ data: [], isLoading: false });
  mockDraftQcEstimateQuery.mockReturnValue({
    data: {
      model: "test-model",
      baselineCalls: 1,
      maxImprovementRounds: 3,
      maxCalls: 7,
      estimatedCredits: 7,
      actualCredits: 0,
    },
    isLoading: false,
  });
  mockDraftQcStatus = { data: undefined };
  mockDraftQcStatusQuery.mockImplementation(() => mockDraftQcStatus);
  mockSeriesListQuery.mockReturnValue({
    data: {
      series: [
        {
          id: "16",
          title: parentSeriesRow.title,
          status: "active",
          targetEpisodeCount: 30,
        },
      ],
    },
    isLoading: false,
  });
  mockGetSeriesQuery.mockReturnValue({
    data: { series: parentSeriesRow },
    isLoading: false,
  });
  mockPlanningModelsQuery.mockReturnValue({ data: [], isLoading: false });
  mockSynthesizeMutationState = { data: undefined, isPending: false };
  mockDraftCompositionStatus = { data: undefined };
  mockGetSeriesMemoryQuery.mockReturnValue({
    data: {
      memory: { episodes: [] },
      coverage: {
        targetEpisodeCount: 30,
        episodeRowCount: 30,
        episodesWithRealScript: 8,
        episodesWithMemory: 8,
        episodesWithMemoryAndRealScript: 8,
      },
    },
    isLoading: false,
  });
  mockCarryOverMutationState = { data: undefined, isPending: false };
  mockSpecialEditionMutationState = { data: undefined, isPending: false };
  mockUploadMutate.mockResolvedValue({
    url: "https://x.test/a.jpg",
    fileType: "image/jpeg",
  });
});

/* -------------------------------------------------------------------------- */
/* Pure functions                                                              */
/* -------------------------------------------------------------------------- */

describe("resolveWizardSteps", () => {
  it("returns the EXACT SAME array reference as `wizardSteps` for original mode (undefined)", () => {
    expect(resolveWizardSteps(undefined)).toBe(wizardSteps);
  });

  it("returns a different, 6-id array for sequel", () => {
    const steps = resolveWizardSteps("sequel");
    expect(steps).not.toBe(wizardSteps);
    expect(steps.map(s => s.id)).toEqual(wizardSteps.map(s => s.id));
  });

  it("returns a different, 6-id array for special_edition", () => {
    const steps = resolveWizardSteps("special_edition");
    expect(steps).not.toBe(wizardSteps);
    expect(steps.map(s => s.id)).toEqual(wizardSteps.map(s => s.id));
  });
});

describe("resolveCarryOverCharacters", () => {
  it("forwards a character with no override unchanged", () => {
    const result = resolveCarryOverCharacters(
      [
        {
          characterKey: "a",
          name: "A",
          postFinaleStatus: "fine",
          availability: "returns",
        },
      ],
      {}
    );
    expect(result[0].availability).toBe("returns");
  });

  it("merges an override's availability/returnJustification without touching name/postFinaleStatus", () => {
    const result = resolveCarryOverCharacters(
      [
        {
          characterKey: "a",
          name: "A",
          postFinaleStatus: "fine",
          availability: "returns",
        },
      ],
      {
        a: {
          availability: "returns_with_explanation",
          returnJustification: "earned release",
        },
      }
    );
    expect(result[0]).toEqual({
      characterKey: "a",
      name: "A",
      postFinaleStatus: "fine",
      availability: "returns_with_explanation",
      returnJustification: "earned release",
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Original mode byte-identity (flag ON, mode untouched)                      */
/* -------------------------------------------------------------------------- */

describe("CreateSeriesWizard — original mode stays byte-identical with the lineage flag ON", () => {
  it("renders the mode toggle but the 6 step bodies + create payload are otherwise unchanged", () => {
    renderWizard();

    // The toggle itself is the only additive thing — assert it renders...
    expect(screen.getByText("ภาค 2 / ภาคถัดไป")).toBeInTheDocument();
    // ...but every existing basic-step field is present and untouched.
    expect(screen.getByText(/^ชื่อซีรีย์/)).toBeInTheDocument();
    expect(
      screen.getByText("จำนวนตอนย่อย (Sub-episode) ในโครงสร้างเรื่อง")
    ).toBeInTheDocument();

    const titleInput = screen
      .getByText(/^ชื่อซีรีย์/)
      .closest("div")
      ?.querySelector("input") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Untouched Series" } });
    satisfyDraftGate();

    fireEvent.click(screen.getByRole("button", { name: /ตรวจสอบและสร้าง/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /สร้างซีรีย์และเนื้อเรื่องเต็ม/ })
    );

    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Untouched Series",
        parentSeriesId: undefined,
        createMode: undefined,
        seasonNumber: undefined,
        lineage: undefined,
      })
    );
  });

  it("hides the mode toggle entirely when the tenant flag is off", () => {
    mockUseTenantFeatureFlag.mockReturnValue(false);
    renderWizard();
    expect(screen.queryByText("ภาค 2 / ภาคถัดไป")).not.toBeInTheDocument();
    expect(screen.queryByText("โหมดการสร้าง")).not.toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Sequel                                                                      */
/* -------------------------------------------------------------------------- */

describe("CreateSeriesWizard — sequel (ภาค 2)", () => {
  function switchToSequelAndPickParent() {
    fireEvent.click(screen.getByRole("button", { name: "ภาค 2 / ภาคถัดไป" }));
    fireEvent.click(
      screen.getByRole("combobox", { name: "เลือกซีรีส์ต้นฉบับ" })
    );
    fireEvent.click(screen.getByText(parentSeriesRow.title));
  }

  it("blocks create when no parent is chosen yet", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "ภาค 2 / ภาคถัดไป" }));

    const titleInput = screen
      .getByText(/^ชื่อซีรีย์/)
      .closest("div")
      ?.querySelector("input") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Season 2" } });
    satisfyDraftGate();

    fireEvent.click(screen.getByRole("button", { name: /ตรวจสอบและสร้าง/ }));
    const createButton = screen.getByRole("button", {
      name: /สร้างซีรีย์และเนื้อเรื่องเต็ม/,
    });
    expect(createButton).toBeDisabled();
  });

  it("locks genre once a parent is picked and inherits its value", () => {
    renderWizard();
    switchToSequelAndPickParent();

    const genreInput = screen
      .getByText("แนวเรื่อง")
      .closest("div")
      ?.querySelector("input") as HTMLInputElement;
    expect(genreInput).toBeDisabled();
    expect(genreInput.value).toBe(parentSeriesRow.genre);
  });

  it("basics-only synthesis forwards the parent lineage snapshot before the series exists", () => {
    renderWizard();
    switchToSequelAndPickParent();

    const button = screen.getByRole("button", {
      name: /ให้ AI สร้างทั้งหมดให้/,
    });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    expect(mockSynthesizeMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedPresetIds: [],
        userPremise: undefined,
        genreHint: parentSeriesRow.genre,
        toneHint: parentSeriesRow.tone,
        lineageContext: expect.objectContaining({
          parentSeriesId: 16,
          parentTitle: parentSeriesRow.title,
          createMode: "sequel",
          priorSeasonSummary: parentSeriesRow.memory.compactSummary,
        }),
      })
    );
  });

  it("premise synthesis still forwards the parent lineage snapshot", () => {
    renderWizard();
    switchToSequelAndPickParent();

    const premiseLabel = screen.getByText(/^โจทย์ภาคใหม่ที่อยากได้/);
    const premiseTextarea = premiseLabel
      .closest("div")
      ?.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(premiseTextarea, {
      target: { value: "เพิ่มความหวาน ความหึง และให้วิญญาณแม่มาเข้าฝัน" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: /ให้ AI สร้างภาคต่อจากเรื่องเดิม \+ โจทย์/,
      })
    );

    expect(mockSynthesizeMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        userPremise: "เพิ่มความหวาน ความหึง และให้วิญญาณแม่มาเข้าฝัน",
        lineageContext: expect.objectContaining({
          parentSeriesId: 16,
          parentTitle: parentSeriesRow.title,
          createMode: "sequel",
          priorSeasonSummary: parentSeriesRow.memory.compactSummary,
        }),
      })
    );
  });

  it("clicking the propose CTA calls `proposeSeasonCarryOver` with the chosen parent", () => {
    renderWizard();
    switchToSequelAndPickParent();
    satisfyDraftGate();

    fireEvent.click(screen.getByRole("button", { name: /ตัวละคร/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "ให้ AI เสนอการกลับมาของตัวละคร" })
    );
    expect(mockCarryOverMutate).toHaveBeenCalledWith(
      expect.objectContaining({ parentSeriesId: "16" })
    );
  });

  it("renders the per-character grid + disclosure badge + domestic thread once a draft exists", () => {
    mockCarryOverMutationState = {
      data: {
        draft: carryOverDraft,
        creditsUsed: 1,
        model: "test-model",
        hasMemory: true,
        memoryEpisodesRecorded: 8,
        parentEpisodeCount: 30,
      },
      isPending: false,
    };
    renderWizard();
    switchToSequelAndPickParent();
    satisfyDraftGate();
    fireEvent.click(screen.getByRole("button", { name: /ตัวละคร/ }));

    expect(
      screen.getByTestId("vd-carryover-character-char_wain")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("vd-memory-disclosure-public")
    ).toBeInTheDocument();
    expect(screen.getByText("รีโนเวทบ้านยังไม่เสร็จ")).toBeInTheDocument();
    // Regenerate CTA (not the first-time propose label) once a draft exists.
    expect(
      screen.getByRole("button", { name: "เสนอใหม่" })
    ).toBeInTheDocument();
  });

  it("editing a character's availability flows into the create `lineage.carryOver.characters`", () => {
    mockCarryOverMutationState = {
      data: {
        draft: carryOverDraft,
        creditsUsed: 1,
        model: "test-model",
        hasMemory: true,
        memoryEpisodesRecorded: 8,
        parentEpisodeCount: 30,
      },
      isPending: false,
    };
    renderWizard();
    switchToSequelAndPickParent();

    const titleInput = screen
      .getByText(/^ชื่อซีรีย์/)
      .closest("div")
      ?.querySelector("input") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Season 2" } });
    satisfyDraftGate();

    fireEvent.click(screen.getByRole("button", { name: /ตัวละคร/ }));

    const availabilitySelect = screen.getByLabelText("สถานะในภาคนี้");
    fireEvent.click(availabilitySelect);
    fireEvent.click(screen.getByText("เขียนออกจากเรื่อง"));

    fireEvent.click(screen.getByRole("button", { name: /ตรวจสอบและสร้าง/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /สร้างซีรีย์และเนื้อเรื่องเต็ม/ })
    );

    const call = mockCreateMutate.mock.calls[0][0];
    expect(call.createMode).toBe("sequel");
    expect(call.parentSeriesId).toBe("16");
    expect(call.lineage.carryOver.characters[0]).toEqual(
      expect.objectContaining({
        characterKey: "char_wain",
        availability: "write_out",
      })
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Special edition                                                            */
/* -------------------------------------------------------------------------- */

describe("CreateSeriesWizard — special edition (ภาคพิเศษ)", () => {
  function switchToSpecialAndPickParent() {
    fireEvent.click(screen.getByRole("button", { name: "ภาคพิเศษ" }));
    fireEvent.click(
      screen.getByRole("combobox", { name: "เลือกซีรีส์ต้นฉบับ" })
    );
    fireEvent.click(screen.getByText(parentSeriesRow.title));
  }

  it("clamps the sub-episode count to 1-2 the moment the mode is chosen", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "ภาคพิเศษ" }));

    const countInput = screen
      .getByText("จำนวนตอนย่อย (Sub-episode) ในโครงสร้างเรื่อง")
      .closest("div")
      ?.querySelector("input") as HTMLInputElement;
    expect(Number(countInput.value)).toBeLessThanOrEqual(2);
  });

  it("shows the marketplace picker (query enabled) + upload + story-function sources", () => {
    renderWizard();
    switchToSpecialAndPickParent();
    satisfyDraftGate();

    // Source 3 — story function, on the Story step.
    fireEvent.click(screen.getByRole("button", { name: /โครงเรื่อง|จะรีวิว/ }));
    expect(screen.getByText("รีวิวตรงไปตรงมา")).toBeInTheDocument();

    // Sources 1+2 — Product step.
    fireEvent.click(
      screen.getByRole("button", { name: /สินค้าผูกเรื่อง|แหล่งข้อมูล/ })
    );
    expect(mockListProductsQuery).toHaveBeenCalled();
    expect(screen.getByText("2. อัปโหลดรูป + สรุป")).toBeInTheDocument();
  });

  it("sends the edited AI-suggested premise as `userPremise` on create", () => {
    mockSpecialEditionMutationState = {
      data: {
        draft: {
          storyShape: "review",
          premise: "รีวิวร้านกาแฟใหม่",
          charactersUsed: [],
          episodeBriefs: [],
          continuityNotes: "ไม่กระทบปมหลัก",
        },
        suggestedUserPremise: "ร้านกาแฟใหม่ในซอย — รีวิวสั้น ๆ",
        creditsUsed: 1,
        model: "test-model",
        hasMemory: true,
        memoryEpisodesRecorded: 8,
        parentEpisodeCount: 30,
      },
      isPending: false,
    };
    renderWizard();
    switchToSpecialAndPickParent();

    const titleInput = screen
      .getByText(/^ชื่อซีรีย์/)
      .closest("div")
      ?.querySelector("input") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Special 1" } });
    satisfyDraftGate();

    fireEvent.click(screen.getByRole("button", { name: /โครงเรื่อง|จะรีวิว/ }));
    fireEvent.click(screen.getByRole("radio", { name: "รีวิวตรงไปตรงมา" }));
    // A draft (with `suggestedUserPremise`) is already pre-mocked above, so
    // the CTA already reads as "draft again" rather than the first-time
    // "draft the special edition" label.
    fireEvent.click(screen.getByRole("button", { name: "ร่างใหม่" }));

    expect(mockSpecialEditionMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        parentSeriesId: "16",
        storyFunctionChoice: "review",
      })
    );

    const premiseTextarea = screen
      .getByText("โจทย์ที่ AI ร่างให้ (แก้ไขได้ก่อนสร้าง)")
      .closest("div")
      ?.querySelector("textarea") as HTMLTextAreaElement;
    expect(premiseTextarea.value).toBe("ร้านกาแฟใหม่ในซอย — รีวิวสั้น ๆ");

    fireEvent.change(premiseTextarea, {
      target: { value: "แก้ไขโดยผู้ใช้เอง" },
    });
    // Editing any source field invalidates the applied draft; regenerate and
    // re-apply before using the forward/review flow.
    satisfyDraftGate("Special 1");

    fireEvent.click(screen.getByRole("button", { name: /ตรวจสอบและสร้าง/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /สร้างซีรีย์และเนื้อเรื่องเต็ม/ })
    );

    const call = mockCreateMutate.mock.calls[0][0];
    expect(call.userPremise).toBe("แก้ไขโดยผู้ใช้เอง");
    expect(call.createMode).toBe("special_edition");
  });

  it("sends uploaded reference images + the story-function choice on `productTieIn` even with the tie-in checkbox untouched (bug: previously dropped silently)", async () => {
    renderWizard();
    switchToSpecialAndPickParent();

    const titleInput = screen
      .getByText(/^ชื่อซีรีย์/)
      .closest("div")
      ?.querySelector("input") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Special upload test" } });
    satisfyDraftGate();

    // Source 2 — upload a reference image on the Product step.
    fireEvent.click(
      screen.getByRole("button", { name: /สินค้าผูกเรื่อง|แหล่งข้อมูล/ })
    );
    const file = new File(["fake"], "photo.png", { type: "image/png" });
    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    Object.defineProperty(fileInput, "files", { value: [file] });
    fireEvent.change(fileInput);
    await screen.findByText("photo.png");

    // Source 3 — story-function choice on the Story step.
    fireEvent.click(screen.getByRole("button", { name: /โครงเรื่อง|จะรีวิว/ }));
    fireEvent.click(
      screen.getByRole("radio", { name: "ผูกเป็นทางออกในเนื้อเรื่อง" })
    );

    fireEvent.click(screen.getByRole("button", { name: /ตรวจสอบและสร้าง/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /สร้างซีรีย์และเนื้อเรื่องเต็ม/ })
    );

    const call = mockCreateMutate.mock.calls[0][0];
    expect(call.createMode).toBe("special_edition");
    // Exact server-read path: `rawProductTieIn.uploadedReferences` /
    // `rawProductTieIn.storyFunctionChoice` inside `verticalDramaSeries.ts`'s
    // `create` handler (fed into `buildSpecialEditionProductTieInConfig`).
    expect(call.productTieIn.uploadedReferences).toEqual([
      {
        url: "https://x.test/a.jpg",
        mimeType: "image/jpeg",
        fileName: "photo.png",
      },
    ]);
    expect(call.productTieIn.storyFunctionChoice).toBe("tie_in_solution");
    expect(call.productTieIn.enabled).toBe(true);
  });
});
