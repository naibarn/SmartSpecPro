/**
 * Manual LLM model override (added 2026-07-11, collapsed to a single
 * series-wide field 2026-07-11 — see
 * `planning/vertical-drama-centralized-model-policy/plan.md`) — the single
 * "default model" dropdown on `VerticalDramaSettingsTab.tsx`:
 * default-to-automatic, eligible-model-list rendering, dirty-tracking, and
 * the `setSeriesLlmModelPolicy` save payload.
 */
import { Children } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUpdateSeriesMutate = vi.fn();
const mockSetLlmModelPolicyMutate = vi.fn();

const PLANNING_MODELS = [
  { modelId: "google/gemini-3.1-flash-lite-preview", label: "Google — Gemini 3.1 Flash Lite Preview" },
  { modelId: "anthropic/claude-quality-large", label: "Anthropic — Claude Quality Large" },
];

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      verticalDramaSeries: { get: { invalidate: vi.fn() } },
    }),
    verticalDramaSeries: {
      updateSeries: {
        useMutation: () => ({
          mutateAsync: mockUpdateSeriesMutate,
          isPending: false,
        }),
      },
      setSeriesTargetAudienceRegion: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          isPending: false,
        }),
      },
      listQualityPlanningModels: {
        useQuery: () => ({ data: PLANNING_MODELS, isPending: false }),
      },
      setSeriesLlmModelPolicy: {
        useMutation: () => ({
          mutateAsync: (input: unknown) => {
            mockSetLlmModelPolicyMutate(input);
            return Promise.resolve({});
          },
          isPending: false,
        }),
      },
      updateSeriesWatermark: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      // `VerticalDramaDeleteSeriesDialog` (always mounted, closed by
      // default) needs this stubbed too.
      deleteSeries: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/ui/select", () => ({
  // Same mock convention as `VerticalDramaSettingsTab.watermark.test.tsx` —
  // scans `children` for a `data-testid` on `SelectTrigger` so each mocked
  // select keeps a distinguishable testid.
  Select: ({ value, onValueChange, children }: any) => {
    let testId = "mock-select";
    Children.forEach(children, (child: any) => {
      if (child?.props?.["data-testid"]) testId = child.props["data-testid"];
    });
    return (
      <select
        data-testid={testId}
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
      >
        {children}
      </select>
    );
  },
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}));

vi.mock("@/components/ui/slider", () => ({
  Slider: ({ value, onValueChange, ...props }: any) => (
    <input
      type="range"
      value={value?.[0]}
      onChange={(e) => onValueChange?.([Number(e.target.value)])}
      {...props}
    />
  ),
}));

import { VerticalDramaSettingsTab } from "@/components/verticalDramaSeries/VerticalDramaSettingsTab";

const baseProps = {
  lang: "th" as const,
  seriesId: "10",
  title: "Midnight Vows",
  status: "draft",
  readOnly: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("VerticalDramaSettingsTab — manual LLM model override dropdown", () => {
  it("defaults to automatic when llmModelPolicy is absent", () => {
    render(<VerticalDramaSettingsTab {...baseProps} />);
    expect(
      (screen.getByTestId("vd-settings-default-llm-model") as HTMLSelectElement).value,
    ).toBe("__automatic__");
  });

  it("defaults to automatic when llmModelPolicy is null", () => {
    render(<VerticalDramaSettingsTab {...baseProps} llmModelPolicy={null} />);
    expect(
      (screen.getByTestId("vd-settings-default-llm-model") as HTMLSelectElement).value,
    ).toBe("__automatic__");
  });

  it("pre-populates from an existing saved llmModelPolicy.defaultModelId", () => {
    render(
      <VerticalDramaSettingsTab
        {...baseProps}
        llmModelPolicy={{ defaultModelId: "google/gemini-3.1-flash-lite-preview" }}
      />,
    );
    expect(
      (screen.getByTestId("vd-settings-default-llm-model") as HTMLSelectElement).value,
    ).toBe("google/gemini-3.1-flash-lite-preview");
  });

  it("renders the eligible models list from the mocked listQualityPlanningModels query", () => {
    render(<VerticalDramaSettingsTab {...baseProps} />);
    const select = screen.getByTestId("vd-settings-default-llm-model");
    expect(
      select.querySelector('option[value="google/gemini-3.1-flash-lite-preview"]')?.textContent,
    ).toBe("Google — Gemini 3.1 Flash Lite Preview");
    expect(select.querySelector('option[value="anthropic/claude-quality-large"]')).toBeTruthy();
  });

  it("selecting a specific model updates local state (dropdown reflects the pick)", () => {
    render(<VerticalDramaSettingsTab {...baseProps} />);
    fireEvent.change(screen.getByTestId("vd-settings-default-llm-model"), {
      target: { value: "anthropic/claude-quality-large" },
    });
    expect(
      (screen.getByTestId("vd-settings-default-llm-model") as HTMLSelectElement).value,
    ).toBe("anthropic/claude-quality-large");
  });

  it("save does NOT call setSeriesLlmModelPolicy when the dropdown didn't change", () => {
    render(<VerticalDramaSettingsTab {...baseProps} />);
    // Trigger a save via a change to an unrelated field (title) so the Save
    // button becomes enabled without touching the model dropdown.
    fireEvent.change(screen.getByLabelText("ชื่อซีรีย์"), {
      target: { value: "Midnight Vows 2" },
    });
    fireEvent.click(screen.getByText("บันทึก"));
    expect(mockSetLlmModelPolicyMutate).not.toHaveBeenCalled();
  });

  it("save calls setSeriesLlmModelPolicy with the new defaultModelId when the dropdown changed", async () => {
    render(<VerticalDramaSettingsTab {...baseProps} />);
    fireEvent.change(screen.getByTestId("vd-settings-default-llm-model"), {
      target: { value: "anthropic/claude-quality-large" },
    });
    fireEvent.click(screen.getByText("บันทึก"));
    await Promise.resolve();
    await Promise.resolve();
    expect(mockSetLlmModelPolicyMutate).toHaveBeenCalledWith({
      seriesId: "10",
      defaultModelId: "anthropic/claude-quality-large",
    });
  });

  it("picking automatic again after a saved specific model sends defaultModelId: null", async () => {
    render(
      <VerticalDramaSettingsTab
        {...baseProps}
        llmModelPolicy={{ defaultModelId: "google/gemini-3.1-flash-lite-preview" }}
      />,
    );
    fireEvent.change(screen.getByTestId("vd-settings-default-llm-model"), {
      target: { value: "__automatic__" },
    });
    fireEvent.click(screen.getByText("บันทึก"));
    await Promise.resolve();
    await Promise.resolve();
    expect(mockSetLlmModelPolicyMutate).toHaveBeenCalledWith({
      seriesId: "10",
      defaultModelId: null,
    });
  });
});
