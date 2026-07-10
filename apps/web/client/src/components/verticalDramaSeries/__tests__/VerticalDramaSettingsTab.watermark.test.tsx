/**
 * Text Overlay Suite (F131AB, task #34, plan.md v2 "ลายน้ำ") — series
 * watermark settings card coverage for `VerticalDramaSettingsTab.tsx`: flag
 * gating, enable toggle, type switch (text/image), position/opacity/scale/
 * margin controls, the 9:16 mock preview, and the `updateSeriesWatermark`
 * save payload shape.
 */
import { Children } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUpdateSeriesWatermarkMutate = vi.fn();
const mockUpdateSeriesMutate = vi.fn();

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
      updateSeriesWatermark: {
        useMutation: (opts: { onSuccess?: () => void; onError?: (err: { message?: string }) => void }) => ({
          mutate: (input: unknown) => {
            mockUpdateSeriesWatermarkMutate(input);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      // `VerticalDramaDeleteSeriesDialog` (always mounted by
      // `VerticalDramaSettingsTab`, closed by default) needs this stubbed too.
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
  // Scans `children` (the raw `[<SelectTrigger data-testid="…">, <SelectContent>]`
  // array the real component passes) for a `data-testid` prop so the plain
  // `<select>` this mock renders inherits the SAME testid the source JSX put
  // on `<SelectTrigger>` — otherwise every mocked select collapses to one
  // shared "mock-select" testid and `getByTestId` can't disambiguate them.
  Select: ({ value, onValueChange, children }: any) => {
    let testId = "mock-select";
    Children.forEach(children, (child: any) => {
      if (child?.props?.["data-testid"]) testId = child.props["data-testid"];
    });
    return (
      <select
        data-testid={testId}
        value={value}
        onChange={e => onValueChange?.(e.target.value)}
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
      onChange={e => onValueChange?.([Number(e.target.value)])}
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

describe("VerticalDramaSettingsTab — series watermark card (F131AB, task #34)", () => {
  it("renders nothing when textOverlaySuiteEnabled is false", () => {
    render(<VerticalDramaSettingsTab {...baseProps} textOverlaySuiteEnabled={false} />);
    expect(screen.queryByTestId("vd-watermark-card")).not.toBeInTheDocument();
  });

  it("renders the card, disabled (toggle off), when the flag is on but no watermark is configured yet", () => {
    render(<VerticalDramaSettingsTab {...baseProps} textOverlaySuiteEnabled watermark={null} />);
    const card = screen.getByTestId("vd-watermark-card");
    expect(card).toBeInTheDocument();
    expect(screen.getByTestId("vd-watermark-enabled-toggle")).toHaveAttribute(
      "data-state",
      "unchecked",
    );
    // Fields are hidden until enabled.
    expect(screen.queryByTestId("vd-watermark-type")).not.toBeInTheDocument();
  });

  it("pre-populates from an existing saved watermark config", () => {
    render(
      <VerticalDramaSettingsTab
        {...baseProps}
        textOverlaySuiteEnabled
        watermark={{
          enabled: true,
          type: "text",
          text: "@mychannel",
          position: "bottom_left",
          opacity: 0.6,
          scalePct: 12,
          marginPx: 20,
        }}
      />,
    );
    expect(screen.getByTestId("vd-watermark-enabled-toggle")).toHaveAttribute(
      "data-state",
      "checked",
    );
    expect((screen.getByTestId("vd-watermark-text") as HTMLInputElement).value).toBe(
      "@mychannel",
    );
    expect((screen.getByTestId("vd-watermark-margin") as HTMLInputElement).value).toBe("20");
  });

  it("toggling enabled on reveals the full editor (type/position/opacity/scale/margin/preview)", () => {
    render(<VerticalDramaSettingsTab {...baseProps} textOverlaySuiteEnabled watermark={null} />);
    fireEvent.click(screen.getByTestId("vd-watermark-enabled-toggle"));
    expect(screen.getByTestId("vd-watermark-type")).toBeInTheDocument();
    expect(screen.getByTestId("vd-watermark-text")).toBeInTheDocument();
    expect(screen.getByTestId("vd-watermark-position")).toBeInTheDocument();
    expect(screen.getByTestId("vd-watermark-opacity")).toBeInTheDocument();
    expect(screen.getByTestId("vd-watermark-scale")).toBeInTheDocument();
    expect(screen.getByTestId("vd-watermark-margin")).toBeInTheDocument();
    expect(screen.getByTestId("vd-watermark-preview")).toBeInTheDocument();
  });

  it("switching type to image swaps the text field for an image URL field", () => {
    render(
      <VerticalDramaSettingsTab
        {...baseProps}
        textOverlaySuiteEnabled
        watermark={{ enabled: true, type: "text" }}
      />,
    );
    fireEvent.change(screen.getByTestId("vd-watermark-type"), {
      target: { value: "image" },
    });
    expect(screen.queryByTestId("vd-watermark-text")).not.toBeInTheDocument();
    expect(screen.getByTestId("vd-watermark-image-url")).toBeInTheDocument();
  });

  it("save button submits updateSeriesWatermark with the current draft", () => {
    render(
      <VerticalDramaSettingsTab
        {...baseProps}
        textOverlaySuiteEnabled
        watermark={{
          enabled: true,
          type: "text",
          text: "@mychannel",
          position: "top_right",
          opacity: 0.45,
          scalePct: 10,
          marginPx: 32,
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("vd-watermark-save"));
    expect(mockUpdateSeriesWatermarkMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        seriesId: "10",
        watermark: expect.objectContaining({ enabled: true, text: "@mychannel" }),
      }),
    );
  });

  it("hides the save button entirely when readOnly", () => {
    render(
      <VerticalDramaSettingsTab
        {...baseProps}
        readOnly
        textOverlaySuiteEnabled
        watermark={{ enabled: true, type: "text" }}
      />,
    );
    expect(screen.queryByTestId("vd-watermark-save")).not.toBeInTheDocument();
  });

  it("editing the margin input updates the draft (round-trips through the number input)", () => {
    render(
      <VerticalDramaSettingsTab
        {...baseProps}
        textOverlaySuiteEnabled
        watermark={{ enabled: true, type: "text", marginPx: 32 }}
      />,
    );
    fireEvent.change(screen.getByTestId("vd-watermark-margin"), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByTestId("vd-watermark-save"));
    expect(mockUpdateSeriesWatermarkMutate).toHaveBeenCalledWith(
      expect.objectContaining({ watermark: expect.objectContaining({ marginPx: 50 }) }),
    );
  });
});
