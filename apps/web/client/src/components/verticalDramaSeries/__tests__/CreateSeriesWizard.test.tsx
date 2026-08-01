import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockListGenrePresetsQuery = vi.fn();
const mockListProductsQuery = vi.fn();
const mockSynthesizeMutate = vi.fn();
const mockGenerateStoryMutate = vi.fn();
const mockCreateMutate = vi.fn();
// Stage 2.6 (`planning/vd-series-memory-and-lineage/plan.md`) lineage mocks —
// `mockUseTenantFeatureFlag` defaults to `false` in every `beforeEach` below
// so every PRE-EXISTING test in this file (none of which touch lineage) keeps
// exercising the flag-OFF/original-mode wizard, byte-identical to before this
// feature existed. Lineage-specific `describe` blocks below flip it to `true`.
const mockUseTenantFeatureFlag = vi.fn();
const mockSeriesListQuery = vi.fn();
const mockGetSeriesQuery = vi.fn();
const mockGetSeriesMemoryQuery = vi.fn();
const mockPlanningModelsQuery = vi.fn();
const mockCarryOverMutate = vi.fn();
const mockSpecialEditionMutate = vi.fn();
const mockUploadMutate = vi.fn();

let mockSynthesizeMutationState: {
  data: unknown;
  isPending: boolean;
  error?: { message?: string };
} = {
  data: undefined,
  isPending: false,
};

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
    verticalDramaSeries: {
      listGenrePresets: { useQuery: () => mockListGenrePresetsQuery() },
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
        useMutation: (opts: {
          onSuccess?: (data: unknown) => void;
          onError?: (err: unknown) => void;
        } = {}) => ({
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

const presetOne = {
  id: "1",
  title: "Preset One",
  category: "sci_fi_mecha",
  logline: "Logline one",
  mainPlot: "Main plot one",
  seasonArc: "Season arc one",
  tone: "Tone one",
  cliffhangerStyle: "Cliff one",
  characters: [{ name: "A", role: "Lead", description: "desc" }],
  visualBible: "Visual bible one",
  scope: "global",
  // Not returned by the real listGenrePresets today (documented gap) — this
  // fixture proves the client renders it correctly once the payload does.
  visualIdentityJson: {
    styleName: "Neon Bio-Jungle Tech",
    palette: ["Teal", "Neon Green"],
    lighting: "Bioluminescent rim light",
    environmentMotifs: ["Neon orchids"],
    wardrobeGrammar: ["Techwear knit"],
    signaturePropsAndCompanions: ["Animal companion"],
    cameraGrammar: "Low-angle hero portrait",
    characterArchetypes: [{ role: "Scout", look: "Techwear scout" }],
    imagePromptFragments: { positive: ["neon glow"], negative: ["washed out"] },
  },
};

const presetTwo = {
  id: "2",
  title: "Preset Two",
  category: "sci_fi_mecha",
  logline: "Logline two",
  mainPlot: "Main plot two",
  seasonArc: "Season arc two",
  tone: "Tone two",
  cliffhangerStyle: "Cliff two",
  characters: [{ name: "B", role: "Support", description: "desc" }],
  visualBible: "Visual bible two",
  scope: "global",
};

function renderWizard() {
  return render(
    <CreateSeriesWizard
      open
      lang="th"
      onOpenChange={() => {}}
      onCreated={() => {}}
    />
  );
}

function selectCategoryAndPresets(ids: string[]) {
  fireEvent.click(screen.getByRole("button", { name: /sci_fi_mecha/ }));
  for (const id of ids) {
    const title = id === "1" ? presetOne.title : presetTwo.title;
    fireEvent.click(screen.getByRole("button", { name: new RegExp(title) }));
  }
}

describe("CreateSeriesWizard — series look lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTenantFeatureFlag.mockImplementation(
      flag => flag === "verticalDramaSeriesLookLock"
    );
    mockListGenrePresetsQuery.mockReturnValue({
      data: { presets: [presetOne, presetTwo] },
      isLoading: false,
    });
    mockListProductsQuery.mockReturnValue({ data: [], isLoading: false });
    mockSeriesListQuery.mockReturnValue({ data: { series: [] }, isLoading: false });
    mockGetSeriesQuery.mockReturnValue({ data: undefined, isLoading: false });
    mockGetSeriesMemoryQuery.mockReturnValue({ data: undefined, isLoading: false });
    mockPlanningModelsQuery.mockReturnValue({ data: [], isLoading: false });
  });

  it("sends the selected visual genre in the initial create payload", () => {
    renderWizard();
    const titleLabel = screen.getByText("ชื่อซีรีย์ *");
    const titleInput = titleLabel.closest("div")?.querySelector("input") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Look Locked Series" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "แอ็กชัน / มหากาพย์" }));
    fireEvent.click(screen.getByRole("button", { name: /ตรวจสอบและสร้าง/ }));
    fireEvent.click(screen.getByRole("button", { name: /สร้างซีรีย์และเนื้อเรื่องเต็ม/ }));
    expect(mockCreateMutate).toHaveBeenCalledWith(expect.objectContaining({
      lookLock: { mode: "genre", genreKey: "action_epic" },
    }));
  });
});

/**
 * Stage 2.6 (`planning/vd-series-memory-and-lineage/plan.md`) — file-wide
 * defaults for every lineage mock. Runs BEFORE each describe block's own
 * `beforeEach` (which calls `vi.clearAllMocks()` — this only clears call
 * history, never a `mockReturnValue` implementation, so these defaults
 * survive for every PRE-EXISTING test below without touching their bodies).
 * `mockUseTenantFeatureFlag` defaults to `false` — the single most important
 * regression guarantee: no test in this file that doesn't explicitly opt in
 * touches any lineage code path.
 */
beforeEach(() => {
  mockUseTenantFeatureFlag.mockReturnValue(false);
  mockSeriesListQuery.mockReturnValue({ data: { series: [] }, isLoading: false });
  mockGetSeriesQuery.mockReturnValue({ data: undefined, isLoading: false });
  mockGetSeriesMemoryQuery.mockReturnValue({ data: undefined, isLoading: false });
  mockPlanningModelsQuery.mockReturnValue({ data: [], isLoading: false });
  mockCarryOverMutationState = { data: undefined, isPending: false };
  mockSpecialEditionMutationState = { data: undefined, isPending: false };
  mockUploadMutate.mockResolvedValue({
    url: "https://example.test/upload.jpg",
    fileType: "image/jpeg",
  });
});

describe("CreateSeriesWizard — Sub-episode terminology", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSynthesizeMutationState = { data: undefined, isPending: false };
    mockListGenrePresetsQuery.mockReturnValue({
      data: { presets: [presetOne, presetTwo] },
      isLoading: false,
    });
    mockListProductsQuery.mockReturnValue({ data: [], isLoading: false });
  });

  it("explains that the planned count is for Sub-episodes and keeps that meaning in Review", () => {
    renderWizard();

    expect(
      screen.getByText("จำนวนตอนย่อย (Sub-episode) ในโครงสร้างเรื่อง")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "ใช้กำหนดจำนวนตอนย่อยสำหรับวางโครงเรื่องและผลิตวิดีโอสั้น ไม่ใช่จำนวน Public EP ที่เผยแพร่จริง Public EP จะถูกรวมจากตอนย่อยภายหลัง"
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /ตรวจสอบและสร้าง/ }));
    expect(screen.getByText("ตอนย่อยในโครงสร้างเรื่อง")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });
});

describe("CreateSeriesWizard — Preset Mix v2 (weights, blend report, identity chips)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSynthesizeMutationState = { data: undefined, isPending: false };
    mockListGenrePresetsQuery.mockReturnValue({
      data: { presets: [presetOne, presetTwo] },
      isLoading: false,
    });
    mockListProductsQuery.mockReturnValue({ data: [], isLoading: false });
  });

  it("renders a visual-identity chip row on a preset card that carries visualIdentityJson", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: /sci_fi_mecha/ }));

    expect(
      screen.getByText("สไตล์ภาพ: Neon Bio-Jungle Tech")
    ).toBeInTheDocument();
    expect(screen.getByText("Teal")).toBeInTheDocument();
  });

  it("renders no chip row for a legacy preset card without visualIdentityJson", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: /sci_fi_mecha/ }));
    const presetTwoButton = screen.getByRole("button", { name: /Preset Two/ });
    expect(presetTwoButton.textContent).not.toContain("สไตล์ภาพ");
  });

  it("shows a default-weight (3/5) slider per selected preset once 2 presets are selected", () => {
    renderWizard();
    selectCategoryAndPresets(["1", "2"]);

    const sliders = screen.getAllByRole("slider");
    expect(sliders).toHaveLength(2);
    for (const slider of sliders) {
      expect(slider).toHaveAttribute("aria-valuenow", "3");
      expect(slider).toHaveAttribute("aria-valuemin", "1");
      expect(slider).toHaveAttribute("aria-valuemax", "5");
    }
    expect(screen.getAllByText("น้ำหนักการผสม 3/5")).toHaveLength(2);
  });

  it("shows no weight sliders when only 1 preset is selected (applied directly, unweighted)", () => {
    renderWizard();
    selectCategoryAndPresets(["1"]);
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
  });

  it("sends `selections` (v2) alongside legacy `selectedPresetIds` when generating a mix", () => {
    renderWizard();
    selectCategoryAndPresets(["1", "2"]);
    fireEvent.click(
      screen.getByRole("button", { name: /ให้ AI ผสม Preset/ })
    );

    expect(mockSynthesizeMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedPresetIds: ["1", "2"],
        selections: [
          { presetId: "1", weight: 3 },
          { presetId: "2", weight: 3 },
        ],
      })
    );
  });

  it("renders the blend report panel and merged visual identity once a v2-shaped draft is returned", () => {
    // The mutation's result is pre-mocked and read fresh on every render
    // (mirrors the real mutation's `data` being populated once it resolves)
    // — a single clean render pass is enough to exercise the v2 rendering
    // path; the `selections` mutation-input wiring itself is covered by the
    // dedicated test above.
    mockSynthesizeMutationState = {
      data: {
        draft: {
          contract_version: 2,
          title: "Mixed Draft Title",
          category: "sci_fi_mecha",
          logline: "Mixed logline",
          mainPlot: "Mixed main plot",
          seasonArc: "Mixed season arc",
          tone: "Mixed tone",
          cliffhangerStyle: "Mixed cliffhanger",
          characters: [{ name: "C", role: "Lead", description: "desc" }],
          visualBible: "Mixed visual bible",
          mixRecipe: { rationale: "Because both fit." },
          warnings: [],
          blendReport: {
            contractVersion: 2,
            facets: [
              {
                facet: "story_spine",
                contributions: [
                  { presetId: "1", element: "spine element", kept: true },
                ],
              },
            ],
            contributionCoverage: { "1": 2, "2": 1 },
            minFacetsPerPreset: 2,
            underBlended: ["2"],
          },
          visualIdentity: {
            styleName: "Blended Neon Style",
            palette: ["Teal"],
            lighting: "Neon glow",
            environmentMotifs: [],
            wardrobeGrammar: [],
            signaturePropsAndCompanions: [],
            cameraGrammar: "Low angle",
            characterArchetypes: [{ role: "Lead", look: "Techwear" }],
            imagePromptFragments: { positive: [], negative: [] },
          },
        },
        creditsUsed: 5,
        model: "test-model",
      },
      isPending: false,
    };
    renderWizard();

    expect(screen.getByTestId("vd-blend-report-panel")).toBeInTheDocument();
    expect(
      screen.getByText("สไตล์ภาพ: Blended Neon Style")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/preset 'Preset Two' ยังไม่ถูกผสมจริง/)
    ).toBeInTheDocument();
  });

  it("renders a creator-readable synopsis and keeps technical blend details collapsed", () => {
    mockSynthesizeMutationState = {
      data: {
        draft: {
          contract_version: 2,
          title: "เรื่องที่อ่านเข้าใจ",
          category: "sci_fi_mecha",
          logline: "fallback",
          mainPlot: "fallback",
          seasonArc: "fallback",
          tone: "tone",
          cliffhangerStyle: "cliff",
          creatorSummary: {
            whatItIsAbout: "ร้านเล็กกำลังสู้เพื่อรักษาชุมชน",
            protagonistAndGoal: "ฟ้าต้องกอบกู้ร้านของแม่เพื่อไม่ให้ทุกคนต้องย้ายออก",
            conflictAndDiscovery: "เธอพบคู่แข่งและหลักฐานการซื้อพื้นที่",
            centralMystery: "ใครกำลังบงการการซื้อพื้นที่",
            decisionNotes: ["ร้านเป็นแกนเรื่อง", "ปมจะคลี่คลายในช่วงท้าย"],
          },
          characters: [{ name: "ฟ้า", role: "นางเอก", description: "desc" }],
          visualBible: "visual",
          mixRecipe: { rationale: "technical rationale" },
          warnings: [],
          blendReport: {
            contractVersion: 2,
            facets: [],
            contributionCoverage: {},
            minFacetsPerPreset: 2,
            underBlended: [],
          },
        },
        creditsUsed: 1,
        model: "test-model",
      },
      isPending: false,
    };
    renderWizard();

    expect(screen.getByTestId("vd-creator-summary")).toBeInTheDocument();
    expect(screen.getByText("ร้านเล็กกำลังสู้เพื่อรักษาชุมชน")).toBeInTheDocument();
    expect(screen.queryByText("technical rationale")).not.toBeInTheDocument();
    expect(screen.getByText("รายละเอียดการผสม (สำหรับตรวจสอบเท่านั้น)")).toBeInTheDocument();
  });

  it("shows a retryable synthesis error without asking the creator to refresh", () => {
    mockSynthesizeMutationState = {
      data: undefined,
      isPending: false,
      error: { message: "Preset synthesis response failed schema validation" },
    };
    renderWizard();
    selectCategoryAndPresets(["1", "2"]);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "AI สร้าง draft ที่อ่านได้ไม่ครบ"
    );
    expect(screen.getByRole("button", { name: "ลองสร้างใหม่" })).toBeInTheDocument();
    expect(screen.queryByText(/รีเฟรชหน้า/)).not.toBeInTheDocument();
  });

  it("renders no blend-report chrome for a v1 (flag-off) draft response — shipped Mix and Match UI unchanged", () => {
    mockSynthesizeMutationState = {
      data: {
        draft: {
          contract_version: 1,
          title: "V1 Draft",
          category: "sci_fi_mecha",
          logline: "v1 logline",
          mainPlot: "v1 main plot",
          seasonArc: "v1 season arc",
          tone: "v1 tone",
          cliffhangerStyle: "v1 cliff",
          characters: [{ name: "D", role: "Lead", description: "desc" }],
          visualBible: "v1 visual bible",
          mixRecipe: {
            primaryFlavor: "1",
            supportingFlavors: ["2"],
            rationale: "v1 rationale",
          },
          warnings: [],
        },
        creditsUsed: 3,
        model: "test-model",
      },
      isPending: false,
    };
    renderWizard();
    selectCategoryAndPresets(["1", "2"]);

    expect(screen.getByText("V1 Draft")).toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-blend-report-panel")
    ).not.toBeInTheDocument();
  });

  it("remembers appliedPresetId when a single preset is applied directly, and forwards it to create", () => {
    renderWizard();

    const titleLabel = screen.getByText("ชื่อซีรีย์ *");
    const titleInput = titleLabel
      .closest("div")
      ?.querySelector("input") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "My Series" } });

    selectCategoryAndPresets(["1"]);
    fireEvent.click(screen.getByRole("button", { name: /ใช้ Preset นี้/ }));

    fireEvent.click(screen.getByRole("button", { name: /ตรวจสอบและสร้าง/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /สร้างซีรีย์และเนื้อเรื่องเต็ม/ })
    );

    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ title: "My Series", appliedPresetId: "1" })
    );
  });

  it("clears appliedPresetId when an AI-mixed draft is applied instead of a single preset", () => {
    mockSynthesizeMutationState = {
      data: {
        draft: {
          contract_version: 1,
          title: "Mixed V1 Draft",
          category: "sci_fi_mecha",
          logline: "mixed logline",
          mainPlot: "mixed main plot",
          seasonArc: "mixed season arc",
          tone: "mixed tone",
          cliffhangerStyle: "mixed cliff",
          characters: [{ name: "E", role: "Lead", description: "desc" }],
          visualBible: "mixed visual bible",
          warnings: [],
        },
        creditsUsed: 3,
        model: "test-model",
      },
      isPending: false,
    };
    renderWizard();

    const titleLabel = screen.getByText("ชื่อซีรีย์ *");
    const titleInput = titleLabel
      .closest("div")
      ?.querySelector("input") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "My Series 2" } });

    // First apply a SINGLE preset directly (sets appliedPresetId = "1")...
    selectCategoryAndPresets(["1"]);
    fireEvent.click(screen.getByRole("button", { name: /ใช้ Preset นี้/ }));

    // ...then apply the (pre-mocked) AI-mixed draft instead, which must clear it.
    fireEvent.click(screen.getByRole("button", { name: /ใช้ draft นี้/ }));

    fireEvent.click(screen.getByRole("button", { name: /ตรวจสอบและสร้าง/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /สร้างซีรีย์และเนื้อเรื่องเต็ม/ })
    );

    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "My Series 2",
        appliedPresetId: undefined,
      })
    );
  });
});

/* -------------------------------------------------------------------------- */
/* User Premise & Premise-Primary Preset Mix (F132A, section-02)              */
/* -------------------------------------------------------------------------- */

describe("CreateSeriesWizard — User Premise (F132A)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSynthesizeMutationState = { data: undefined, isPending: false };
    mockListGenrePresetsQuery.mockReturnValue({
      data: { presets: [presetOne, presetTwo] },
      isLoading: false,
    });
    mockListProductsQuery.mockReturnValue({ data: [], isLoading: false });
  });

  function getPremiseTextarea(): HTMLTextAreaElement {
    // Anchored at the start — the step-1 "blocked" affordance text (added by
    // the CTA-discoverability follow-up) reads "พิมพ์โจทย์เรื่องที่อยากได้
    // หรือเลือก preset..." and would otherwise ALSO match an unanchored
    // substring search for "โจทย์เรื่องที่อยากได้", making the query ambiguous.
    const label = screen.getByText(/^โจทย์เรื่องที่อยากได้/);
    return label
      .closest("div")
      ?.querySelector("textarea") as HTMLTextAreaElement;
  }

  it("typing into the premise textarea updates form state and is clamped at 2,000 chars", () => {
    renderWizard();
    const textarea = getPremiseTextarea();
    const longValue = "ก".repeat(2500);
    fireEvent.change(textarea, { target: { value: longValue } });
    expect(textarea.value.length).toBeLessThanOrEqual(2000);
  });

  it("handleCreate sends userPremise as a top-level field, omitted (undefined) when the textarea is empty", () => {
    renderWizard();
    const titleLabel = screen.getByText("ชื่อซีรีย์ *");
    const titleInput = titleLabel
      .closest("div")
      ?.querySelector("input") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Premise-less Series" } });

    fireEvent.click(screen.getByRole("button", { name: /ตรวจสอบและสร้าง/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /สร้างซีรีย์และเนื้อเรื่องเต็ม/ })
    );

    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ userPremise: undefined })
    );
  });

  it("handleCreate sends the trimmed userPremise as a top-level field (sibling of bible, not nested)", () => {
    renderWizard();
    const titleLabel = screen.getByText("ชื่อซีรีย์ *");
    const titleInput = titleLabel
      .closest("div")
      ?.querySelector("input") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Premise Series" } });

    const textarea = getPremiseTextarea();
    fireEvent.change(textarea, {
      target: { value: "  ตำรวจสาวสืบคดีฆาตกรรม  " },
    });

    fireEvent.click(screen.getByRole("button", { name: /ตรวจสอบและสร้าง/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /สร้างซีรีย์และเนื้อเรื่องเต็ม/ })
    );

    const call = mockCreateMutate.mock.calls[0][0];
    expect(call.userPremise).toBe("ตำรวจสาวสืบคดีฆาตกรรม");
    expect(call.bible?.userPremise).toBeUndefined();
  });

  it("handleSynthesizePreset sends userPremise unconditionally alongside selections", () => {
    renderWizard();
    const textarea = getPremiseTextarea();
    fireEvent.change(textarea, { target: { value: "นักสืบไล่ล่าคดีปริศนา" } });

    selectCategoryAndPresets(["1", "2"]);
    // vd-premise-first-wizard plan Phase 3.3 — with a premise present the CTA
    // label reflects "mix premise with preset(s)", not the presets-only label.
    fireEvent.click(
      screen.getByRole("button", { name: /ให้ AI ผสมโจทย์กับ preset/ })
    );

    expect(mockSynthesizeMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        userPremise: "นักสืบไล่ล่าคดีปริศนา",
        selections: [
          { presetId: "1", weight: 3 },
          { presetId: "2", weight: 3 },
        ],
      })
    );
  });

  it("handleSynthesizePreset omits (undefined) userPremise when the textarea is empty", () => {
    renderWizard();
    selectCategoryAndPresets(["1", "2"]);
    fireEvent.click(
      screen.getByRole("button", { name: /ให้ AI ผสม Preset/ })
    );

    expect(mockSynthesizeMutate).toHaveBeenCalledWith(
      expect.objectContaining({ userPremise: undefined })
    );
  });

  it("with a premise present, a single selected preset routes through synthesis (never verbatim) and never touches form.userPremise", () => {
    // vd-premise-first-wizard plan Phase 3.2 — a premise present means a
    // single selected preset must NOT `applyPreset` verbatim; it becomes
    // flavor on the user's spine via synthesis instead. This supersedes the
    // old byte-identical "no-clobber" test, which exercised the verbatim
    // "Use this preset" path that no longer exists once a premise is typed.
    mockSynthesizeMutationState = {
      data: {
        draft: {
          contract_version: 1,
          title: "Synthesized With One Preset",
          category: "sci_fi_mecha",
          logline: "synth logline",
          mainPlot: "synth main plot",
          seasonArc: "synth season arc",
          tone: "synth tone",
          cliffhangerStyle: "synth cliff",
          characters: [{ name: "F", role: "Lead", description: "desc" }],
          visualBible: "synth visual bible",
          warnings: [],
        },
        creditsUsed: 3,
        model: "test-model",
      },
      isPending: false,
    };
    renderWizard();
    const titleLabel = screen.getByText("ชื่อซีรีย์ *");
    const titleInput = titleLabel
      .closest("div")
      ?.querySelector("input") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "No Clobber Series" } });

    const textarea = getPremiseTextarea();
    fireEvent.change(textarea, { target: { value: "รักษาโจทย์เดิมไว้เสมอ" } });

    selectCategoryAndPresets(["1"]);

    // The verbatim single-preset CTA must be gone once a premise is present.
    expect(
      screen.queryByRole("button", { name: /ใช้ Preset นี้/ })
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /ให้ AI ผสมโจทย์กับ preset/ })
    );

    expect(mockSynthesizeMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        userPremise: "รักษาโจทย์เดิมไว้เสมอ",
        selectedPresetIds: ["1"],
      })
    );

    fireEvent.click(screen.getByRole("button", { name: /ใช้ draft นี้/ }));

    fireEvent.click(screen.getByRole("button", { name: /ตรวจสอบและสร้าง/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /สร้างซีรีย์และเนื้อเรื่องเต็ม/ })
    );

    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ userPremise: "รักษาโจทย์เดิมไว้เสมอ" })
    );
  });

  it("no-clobber: applying an AI-mixed draft never touches form.userPremise", () => {
    mockSynthesizeMutationState = {
      data: {
        draft: {
          contract_version: 1,
          title: "Mixed V1 Draft",
          category: "sci_fi_mecha",
          logline: "mixed logline",
          mainPlot: "mixed main plot",
          seasonArc: "mixed season arc",
          tone: "mixed tone",
          cliffhangerStyle: "mixed cliff",
          characters: [{ name: "E", role: "Lead", description: "desc" }],
          visualBible: "mixed visual bible",
          warnings: [],
        },
        creditsUsed: 3,
        model: "test-model",
      },
      isPending: false,
    };
    renderWizard();
    const textarea = getPremiseTextarea();
    fireEvent.change(textarea, { target: { value: "โจทย์นี้ต้องไม่หาย" } });

    fireEvent.click(screen.getByRole("button", { name: /ใช้ draft นี้/ }));

    fireEvent.click(screen.getByRole("button", { name: /ตรวจสอบและสร้าง/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /สร้างซีรีย์และเนื้อเรื่องเต็ม/ })
    );

    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        userPremise: "โจทย์นี้ต้องไม่หาย",
        genre: "sci_fi_mecha",
      })
    );
  });

  it("shows the premise-primary badge in the mix panel only when a premise is present", () => {
    renderWizard();
    expect(
      screen.queryByText(/ใช้โจทย์ของคุณเป็นแกนหลัก/)
    ).not.toBeInTheDocument();

    const textarea = getPremiseTextarea();
    fireEvent.change(textarea, { target: { value: "มีโจทย์แล้ว" } });

    expect(screen.getByText(/ใช้โจทย์ของคุณเป็นแกนหลัก/)).toBeInTheDocument();
  });

  it("premise-only (0 presets): AI synthesis is now reachable, labeled correctly, and forwards an empty preset selection", () => {
    // vd-premise-first-wizard plan Phase 3.1/3.3 — a premise alone with ZERO
    // presets used to be impossible (hard-blocked toast). It must now be a
    // fully working synthesis path.
    renderWizard();
    const textarea = getPremiseTextarea();
    fireEvent.change(textarea, {
      target: {
        value:
          "พระเอกเป็นนักบิน นางเอกเป็นพนักงานภาคพื้น อยากไต่เต้าไปทำงานบนเครื่อง เป็นเด็กกำพร้า",
      },
    });

    const button = screen.getByRole("button", {
      name: /ให้ AI สร้างดราฟต์ซีรีย์จากโจทย์/,
    });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    expect(mockSynthesizeMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        userPremise:
          "พระเอกเป็นนักบิน นางเอกเป็นพนักงานภาคพื้น อยากไต่เต้าไปทำงานบนเครื่อง เป็นเด็กกำพร้า",
        selectedPresetIds: [],
        selections: [],
      })
    );
  });

  it("no premise + 0 presets: basics-only synthesis is enabled and forwards basic facts", () => {
    renderWizard();

    const button = screen.getByRole("button", {
      name: /ให้ AI สร้างทั้งหมดให้/,
    });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    expect(mockSynthesizeMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedPresetIds: [],
        selectedCategories: [],
        selections: [],
        userPremise: undefined,
        targetEpisodeCount: 10,
        audienceAgeRating: "18plus",
      })
    );
  });

  /* ------------------------------------------------------------------ */
  /* CTA discoverability follow-up (2026-07-17)                          */
  /* ------------------------------------------------------------------ */

  it("no premise + 0 presets: copy makes clear that presets are optional", () => {
    renderWizard();
    const button = screen.getByRole("button", {
      name: /ให้ AI สร้างทั้งหมดให้/,
    });
    expect(button).toBeEnabled();
    expect(
      screen.getByText(/ไม่ต้องเลือก preset ก็ได้/)
    ).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("typing a premise switches the basics-only action to the premise-primary action", () => {
    renderWizard();
    expect(
      screen.getByRole("button", { name: /ให้ AI สร้างทั้งหมดให้/ })
    ).toBeInTheDocument();

    const textarea = getPremiseTextarea();
    fireEvent.change(textarea, { target: { value: "มีโจทย์แล้ว" } });

    expect(
      screen.getByRole("button", { name: /ให้ AI สร้างดราฟต์ซีรีย์จากโจทย์/ })
    ).toBeInTheDocument();
  });

  it("renders the primary CTA directly under the premise textarea (hero), ahead of the optional preset rail in document order — never both at once", () => {
    // The user's reported bug: after typing a premise, the one button that
    // acts on it lived at the BOTTOM of the preset rail — a panel labeled
    // "optional" — with nothing pointing the user there. The CTA must now
    // render right after the textarea, before the preset library section.
    renderWizard();
    const textarea = getPremiseTextarea();
    fireEvent.change(textarea, { target: { value: "มีโจทย์แล้ว" } });

    // Exactly one matching button exists — `getByRole` (singular) would
    // throw "found multiple elements" if the CTA rendered in both places.
    const button = screen.getByRole("button", {
      name: /ให้ AI สร้างดราฟต์ซีรีย์จากโจทย์/,
    });
    const presetLibraryHeading = screen.getByText("คลัง Preset แนวเรื่อง");

    expect(
      Boolean(
        textarea.compareDocumentPosition(button) &
          Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true);
    expect(
      Boolean(
        button.compareDocumentPosition(presetLibraryHeading) &
          Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true);
  });

  it("the AI-output framing around genre/logline never hides them — both stay visible and directly editable before any generation", () => {
    // Information-architecture follow-up: genre/logline are demoted
    // visually (they are synthesis OUTPUTS), but the hard constraint is that
    // collapsing must never mean removing — a user who wants to hand-write
    // them must still be able to, without generating first.
    renderWizard();
    expect(
      screen.getByText("ผลลัพธ์จาก AI — แก้ไขได้เสมอ")
    ).toBeInTheDocument();

    const genreLabel = screen.getByText("แนวเรื่อง");
    const genreInput = genreLabel
      .closest("div")
      ?.querySelector("input") as HTMLInputElement;
    fireEvent.change(genreInput, { target: { value: "หักมุมสืบสวน" } });
    expect(genreInput.value).toBe("หักมุมสืบสวน");

    const loglineLabel = screen.getByText("เรื่องย่อ (logline)");
    const loglineTextarea = loglineLabel
      .closest("div")
      ?.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(loglineTextarea, {
      target: { value: "เรื่องย่อที่เขียนเอง" },
    });
    expect(loglineTextarea.value).toBe("เรื่องย่อที่เขียนเอง");
  });
});

/* -------------------------------------------------------------------------- */
/* Misplaced-premise rescue + clamped hints                                   */
/* (planning/fix-create-series-premise-blend/plan.md)                         */
/* -------------------------------------------------------------------------- */

describe("CreateSeriesWizard — misplaced-premise rescue and clamped hints (fix-create-series-premise-blend)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSynthesizeMutationState = { data: undefined, isPending: false };
    mockListGenrePresetsQuery.mockReturnValue({
      data: { presets: [presetOne, presetTwo] },
      isLoading: false,
    });
    mockListProductsQuery.mockReturnValue({ data: [], isLoading: false });
  });

  function getGenreInput(): HTMLInputElement {
    const label = screen.getByText("แนวเรื่อง");
    return label
      .closest("div")
      ?.querySelector("input") as HTMLInputElement;
  }

  it("regression: a >100-char genre is clamped to <=100 chars in genreHint before the mutation fires (2026-07-31 09:14:56 too_big BAD_REQUEST)", () => {
    renderWizard();
    const genreInput = getGenreInput();
    const oversizedGenre = "หมวดหมู่ยาวเกินไป ".repeat(10); // > 100 chars, no premise/presets typed
    fireEvent.change(genreInput, { target: { value: oversizedGenre } });
    expect(genreInput.value.trim().length).toBeGreaterThan(100);

    // No premise, no presets, but genre is a non-empty basic fact -> the
    // basics-only synthesis CTA is the one that fires `handleSynthesizePreset`.
    fireEvent.click(
      screen.getByRole("button", { name: /ให้ AI สร้างทั้งหมดให้/ })
    );

    expect(mockSynthesizeMutate).toHaveBeenCalledTimes(1);
    const call = mockSynthesizeMutate.mock.calls[0][0];
    expect(call.genreHint).toBeDefined();
    expect((call.genreHint as string).length).toBeLessThanOrEqual(100);
  });

  it("rescue notice moves an oversized genre into userPremise and clears genre, without clobbering an existing premise", () => {
    renderWizard();
    const textarea = screen
      .getByText(/^โจทย์เรื่องที่อยากได้/)
      .closest("div")
      ?.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "โจทย์เดิมของผู้ใช้ต้องไม่หาย" },
    });

    const genreInput = getGenreInput();
    const misplacedPremise = "นักสืบสาวไล่ล่าคดีฆาตกรรมต่อเนื่อง ".repeat(5);
    fireEvent.change(genreInput, { target: { value: misplacedPremise } });
    expect(genreInput.value.trim().length).toBeGreaterThan(100);

    fireEvent.click(
      screen.getByRole("button", { name: /ย้ายข้อความนี้ไปที่โจทย์เรื่อง/ })
    );

    // Genre is cleared...
    expect(getGenreInput().value).toBe("");
    // ...and the moved text is APPENDED after the existing premise, never
    // overwriting it (both substrings survive).
    const updatedTextarea = screen
      .getByText(/^โจทย์เรื่องที่อยากได้/)
      .closest("div")
      ?.querySelector("textarea") as HTMLTextAreaElement;
    expect(updatedTextarea.value).toContain("โจทย์เดิมของผู้ใช้ต้องไม่หาย");
    expect(updatedTextarea.value).toContain(misplacedPremise.trim());
    // The rescue notice/button disappears once genre is back under the limit.
    expect(
      screen.queryByRole("button", {
        name: /ย้ายข้อความนี้ไปที่โจทย์เรื่อง/,
      })
    ).not.toBeInTheDocument();
  });

  it("rescue notice does not render for a genre at or under the 100-char limit", () => {
    renderWizard();
    const genreInput = getGenreInput();
    fireEvent.change(genreInput, { target: { value: "ดราม่าย้อนยุค" } });
    expect(
      screen.queryByRole("button", {
        name: /ย้ายข้อความนี้ไปที่โจทย์เรื่อง/,
      })
    ).not.toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Manual LLM model pin at creation time (mirrors the Settings-tab picker)    */
/* -------------------------------------------------------------------------- */

describe("CreateSeriesWizard — LLM model pin at creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSynthesizeMutationState = { data: undefined, isPending: false };
    mockListGenrePresetsQuery.mockReturnValue({
      data: { presets: [presetOne, presetTwo] },
      isLoading: false,
    });
    mockListProductsQuery.mockReturnValue({ data: [], isLoading: false });
    mockPlanningModelsQuery.mockReturnValue({
      data: [
        { modelId: "google/gemini-3.1-flash-lite-preview", label: "Google — Gemini 3.1 Flash Lite Preview" },
        { modelId: "anthropic/claude-quality-large", label: "Anthropic — Claude Quality Large" },
      ],
      isLoading: false,
    });
  });

  function fillTitleAndCreate(title: string) {
    const titleLabel = screen.getByText("ชื่อซีรีย์ *");
    const titleInput = titleLabel
      .closest("div")
      ?.querySelector("input") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: title } });
    fireEvent.click(screen.getByRole("button", { name: /ตรวจสอบและสร้าง/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /สร้างซีรีย์และเนื้อเรื่องเต็ม/ })
    );
  }

  it("renders the Automatic option plus every mocked listQualityPlanningModels row", () => {
    renderWizard();
    const trigger = screen.getByTestId("vd-wizard-default-llm-model");
    fireEvent.click(trigger);

    // The trigger's own `SelectValue` already renders this text (it's the
    // pre-selected default), so once opened there are 2 matches (trigger +
    // dropdown item) — `getAllByText` avoids a false "multiple elements"
    // failure that `getByText` would throw here.
    expect(
      screen.getAllByText("อัตโนมัติ (เลือกโมเดลที่ดีที่สุดให้อัตโนมัติ)").length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText("Google — Gemini 3.1 Flash Lite Preview")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Anthropic — Claude Quality Large")
    ).toBeInTheDocument();
  });

  it("untouched (left on Automatic): create payload sends defaultModelId: null — byte-identical to before this field existed", () => {
    renderWizard();
    fillTitleAndCreate("Automatic Series");

    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ defaultModelId: null })
    );
  });

  it("after picking a specific model from the dropdown, create payload sends that modelId", () => {
    renderWizard();
    const trigger = screen.getByTestId("vd-wizard-default-llm-model");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByText("Anthropic — Claude Quality Large"));

    fillTitleAndCreate("Pinned Model Series");

    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultModelId: "anthropic/claude-quality-large",
      })
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Phase 2 — mode-first wizard: mode selector, title picker, locations fill  */
/* (planning/fix-create-series-premise-blend/plan-phase2-mode-first.md)      */
/* -------------------------------------------------------------------------- */

describe("CreateSeriesWizard — Phase 2 mode-first (mode selector, title picker, locations)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSynthesizeMutationState = { data: undefined, isPending: false };
    mockListGenrePresetsQuery.mockReturnValue({
      data: { presets: [presetOne, presetTwo] },
      isLoading: false,
    });
    mockListProductsQuery.mockReturnValue({ data: [], isLoading: false });
  });

  function getPremiseTextarea(): HTMLTextAreaElement {
    const label = screen.getByText(/^โจทย์เรื่องที่อยากได้/);
    return label
      .closest("div")
      ?.querySelector("textarea") as HTMLTextAreaElement;
  }

  function draftWithTitleOptionsAndLocations() {
    return {
      contract_version: 1,
      title: "Default Draft Title",
      titleOptions: [
        "Default Draft Title",
        "Alt Title Two",
        "Alt Title Three",
        "Alt Title Four",
      ],
      category: "sci_fi_mecha",
      logline: "logline",
      mainPlot: "main plot",
      seasonArc: "season arc",
      tone: "tone",
      cliffhangerStyle: "cliff",
      characters: [{ name: "G", role: "Lead", description: "desc" }],
      visualBible: "visual bible",
      locations: [
        {
          name: "Home Kitchen",
          description: "an open kitchen with a dining nook",
        },
        { name: "Rooftop Bar", description: "a neon-lit rooftop bar" },
        {
          name: "Office Lobby",
          description: "a glass-walled corporate lobby",
        },
      ],
      warnings: [],
    };
  }

  it("mode selector defaults to 'เขียนแนวเรื่องเอง' (own premise) on a fresh wizard", () => {
    renderWizard();
    expect(screen.getByTestId("vd-mode-premise")).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByTestId("vd-mode-preset")).toHaveAttribute(
      "aria-checked",
      "false"
    );
  });

  it("(e) switching mode does not change the wizard's step count", () => {
    renderWizard();
    const stepsBefore = screen
      .getByRole("list", { name: "wizard steps" })
      .querySelectorAll("li").length;

    fireEvent.click(screen.getByTestId("vd-mode-preset"));

    const stepsAfter = screen
      .getByRole("list", { name: "wizard steps" })
      .querySelectorAll("li").length;
    expect(stepsAfter).toBe(stepsBefore);
    expect(stepsBefore).toBeGreaterThan(0);
  });

  it("(d) switching mode does not destroy a typed premise or a selected preset", () => {
    renderWizard();
    fireEvent.change(getPremiseTextarea(), {
      target: { value: "โจทย์ที่พิมพ์ไว้ต้องไม่หาย" },
    });
    selectCategoryAndPresets(["1"]);

    fireEvent.click(screen.getByTestId("vd-mode-preset"));
    fireEvent.click(screen.getByTestId("vd-mode-premise"));

    expect(getPremiseTextarea().value).toBe("โจทย์ที่พิมพ์ไว้ต้องไม่หาย");

    // The preset selection survived the round trip too — generating from
    // this (now-restored) premise-primary mode still forwards preset "1".
    fireEvent.click(
      screen.getByRole("button", { name: /ให้ AI ผสมโจทย์กับ preset/ })
    );
    expect(mockSynthesizeMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        userPremise: "โจทย์ที่พิมพ์ไว้ต้องไม่หาย",
        selectedPresetIds: ["1"],
      })
    );
  });

  it("(a) picking a title candidate writes it into form.title", () => {
    mockSynthesizeMutationState = {
      data: {
        draft: draftWithTitleOptionsAndLocations(),
        creditsUsed: 3,
        model: "test-model",
      },
      isPending: false,
    };
    renderWizard();
    selectCategoryAndPresets(["1", "2"]);

    fireEvent.click(screen.getByRole("button", { name: "Alt Title Two" }));

    fireEvent.click(screen.getByRole("button", { name: /ตรวจสอบและสร้าง/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /สร้างซีรีย์และเนื้อเรื่องเต็ม/ })
    );

    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Alt Title Two" })
    );
  });

  it("(c) applying a draft with `locations` fills form.locations (sent as bible.locationsDraft) using the 'name — description' per-line convention", () => {
    mockSynthesizeMutationState = {
      data: {
        draft: draftWithTitleOptionsAndLocations(),
        creditsUsed: 3,
        model: "test-model",
      },
      isPending: false,
    };
    renderWizard();
    selectCategoryAndPresets(["1", "2"]);
    fireEvent.click(screen.getByRole("button", { name: /ใช้ draft นี้/ }));

    fireEvent.click(screen.getByRole("button", { name: /ตรวจสอบและสร้าง/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /สร้างซีรีย์และเนื้อเรื่องเต็ม/ })
    );

    const call = mockCreateMutate.mock.calls[0][0];
    expect(call.bible.locationsDraft).toBe(
      "Home Kitchen — an open kitchen with a dining nook\n" +
        "Rooftop Bar — a neon-lit rooftop bar\n" +
        "Office Lobby — a glass-walled corporate lobby"
    );
  });

  it("(b) backward compat: a draft WITHOUT titleOptions/locations applies exactly as before — no title-candidate group renders, and form.locations stays untouched", () => {
    mockSynthesizeMutationState = {
      data: {
        draft: {
          contract_version: 1,
          title: "No Extras Draft",
          category: "sci_fi_mecha",
          logline: "logline",
          mainPlot: "main plot",
          seasonArc: "season arc",
          tone: "tone",
          cliffhangerStyle: "cliff",
          characters: [{ name: "H", role: "Lead", description: "desc" }],
          visualBible: "visual bible",
          warnings: [],
        },
        creditsUsed: 3,
        model: "test-model",
      },
      isPending: false,
    };
    renderWizard();
    selectCategoryAndPresets(["1", "2"]);

    expect(
      screen.queryByRole("group", { name: /ตัวเลือกชื่อเรื่อง/ })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /ใช้ draft นี้/ }));
    fireEvent.click(screen.getByRole("button", { name: /ตรวจสอบและสร้าง/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /สร้างซีรีย์และเนื้อเรื่องเต็ม/ })
    );

    const call = mockCreateMutate.mock.calls[0][0];
    expect(call.title).toBe("No Extras Draft");
    expect(call.bible.locationsDraft).toBe("");
  });
});
