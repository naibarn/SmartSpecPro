import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockListGenrePresetsQuery = vi.fn();
const mockListProductsQuery = vi.fn();
const mockSynthesizeMutate = vi.fn();
const mockGenerateStoryMutate = vi.fn();
const mockCreateMutate = vi.fn();

let mockSynthesizeMutationState: {
  data: unknown;
  isPending: boolean;
  error?: { message?: string };
} = {
  data: undefined,
  isPending: false,
};

vi.mock("@/lib/trpc", () => ({
  trpc: {
    verticalDramaSeries: {
      listGenrePresets: { useQuery: () => mockListGenrePresetsQuery() },
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
      screen.getByRole("button", { name: /ให้ AI ผสมเป็น Preset/ })
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
    const label = screen.getByText(/โจทย์เรื่องที่อยากได้/);
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
    fireEvent.click(
      screen.getByRole("button", { name: /ให้ AI ผสมเป็น Preset/ })
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
      screen.getByRole("button", { name: /ให้ AI ผสมเป็น Preset/ })
    );

    expect(mockSynthesizeMutate).toHaveBeenCalledWith(
      expect.objectContaining({ userPremise: undefined })
    );
  });

  it("no-clobber: applying a single preset never touches form.userPremise", () => {
    renderWizard();
    const titleLabel = screen.getByText("ชื่อซีรีย์ *");
    const titleInput = titleLabel
      .closest("div")
      ?.querySelector("input") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "No Clobber Series" } });

    const textarea = getPremiseTextarea();
    fireEvent.change(textarea, { target: { value: "รักษาโจทย์เดิมไว้เสมอ" } });

    selectCategoryAndPresets(["1"]);
    fireEvent.click(screen.getByRole("button", { name: /ใช้ Preset นี้/ }));

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
      expect.objectContaining({ userPremise: "โจทย์นี้ต้องไม่หาย" })
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
});
