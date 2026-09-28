/**
 * LayerBudgetMeter coverage (Feature 143 §4.6). Proves: sourced breakdown
 * uses the same Thai nouns the rest of Video Studio uses; amber at >=34;
 * the two remedies show inline (never a toast) at 40/40; a loading state
 * never blanks the surface.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "th" } }),
}));

const getLayerBudgetQueryMock = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    videoProjects: {
      getLayerBudget: { useQuery: (...args: unknown[]) => getLayerBudgetQueryMock(...args) },
    },
  },
}));

import { LayerBudgetMeter } from "../LayerBudgetMeter";

function budget(overrides: Partial<{
  handAuthoredLayers: number;
  templateLayers: number;
  captionLayers: number;
  audioLayers: number;
  hiddenLayers: number;
  compiledTotal: number;
  max: number;
}> = {}) {
  return {
    handAuthoredLayers: 4,
    templateLayers: 18,
    captionLayers: 12,
    audioLayers: 2,
    hiddenLayers: 0,
    compiledTotal: 36,
    max: 40,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LayerBudgetMeter", () => {
  it("shows a loading placeholder (not blank) while the budget query is pending", () => {
    getLayerBudgetQueryMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<LayerBudgetMeter lang="th" projectId={1} />);
    expect(screen.getByTestId("vs-budget-meter")).toBeInTheDocument();
  });

  it("shows the sourced breakdown in the same Thai nouns and the total/max", () => {
    getLayerBudgetQueryMock.mockReturnValue({ data: budget(), isLoading: false });
    render(<LayerBudgetMeter lang="th" projectId={1} />);
    const meter = screen.getByTestId("vs-budget-meter");
    expect(meter.textContent).toContain("แม่แบบฉาก 18");
    expect(meter.textContent).toContain("ที่คุณวางเอง 4");
    expect(meter.textContent).toContain("ซับไทเทิล 12");
    expect(meter.textContent).toContain("เสียง 2");
    expect(meter.textContent).toContain("36/40");
  });

  it("flags the amber state at >=34 but does not show remedies yet", () => {
    getLayerBudgetQueryMock.mockReturnValue({
      data: budget({ compiledTotal: 34, templateLayers: 16 }),
      isLoading: false,
    });
    render(<LayerBudgetMeter lang="th" projectId={1} />);
    expect(screen.getByTestId("vs-budget-meter")).toHaveAttribute("data-state", "warning");
    expect(screen.queryByTestId("vs-budget-meter-remedies")).not.toBeInTheDocument();
  });

  it("shows the two cheapest remedies inline at 40/40, never a toast (AC11)", () => {
    getLayerBudgetQueryMock.mockReturnValue({
      data: budget({ compiledTotal: 40, templateLayers: 22 }),
      isLoading: false,
    });
    render(<LayerBudgetMeter lang="th" projectId={1} />);
    expect(screen.getByTestId("vs-budget-meter")).toHaveAttribute("data-state", "error");
    const remedies = screen.getByTestId("vs-budget-meter-remedies");
    expect(remedies.textContent).toContain("เปิดฝังซับไทเทิลลงในวิดีโอเพื่อคืนเลเยอร์ซับทั้งหมด");
    expect(remedies.textContent).toContain("ลบคลิปตกแต่งออก");
  });

  it("stays neutral below the amber threshold", () => {
    getLayerBudgetQueryMock.mockReturnValue({
      data: budget({ compiledTotal: 20, templateLayers: 2 }),
      isLoading: false,
    });
    render(<LayerBudgetMeter lang="th" projectId={1} />);
    expect(screen.getByTestId("vs-budget-meter")).toHaveAttribute("data-state", "neutral");
  });
});
