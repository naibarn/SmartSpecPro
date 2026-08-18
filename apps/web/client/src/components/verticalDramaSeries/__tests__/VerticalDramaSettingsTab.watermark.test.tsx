/**
 * Text Overlay Suite (F131AB, task #34, plan.md v2 "ลายน้ำ") — series
 * watermark settings card coverage for `VerticalDramaSettingsTab.tsx`: flag
 * gating, enable toggle, type switch (text/image), position/opacity/scale/
 * margin controls, the 9:16 mock preview, and the `updateSeriesWatermark`
 * save payload shape.
 *
 * Dual watermark (planning/vd-dual-watermark/plan.md) — the card now renders
 * TWO independent slot forms (slot 1 "primary" = series/title logo, slot 2
 * "secondary" = channel logo), built from ONE shared sub-component so they
 * can never drift. Every per-slot control testid now carries a `-primary` /
 * `-secondary` suffix; the card (`vd-watermark-card`), the shared preview
 * (`vd-watermark-preview`), and the single save button (`vd-watermark-save`)
 * stay unsuffixed since there is exactly one of each per card.
 */
import { Children } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUpdateSeriesWatermarkMutate = vi.fn();
const mockUpdateSeriesMutate = vi.fn();
const mockUploadWatermarkImage = vi.fn(async () => ({
  url: "https://cdn.example.com/watermark/logo.png",
}));

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
      // Manual LLM model override (added 2026-07-11) — the component always
      // mounts this query/mutation now, so the watermark-focused tests below
      // need a stub too (unrelated to what they're actually testing).
      listQualityPlanningModels: {
        useQuery: () => ({ data: [], isPending: false }),
      },
      setSeriesLlmModelPolicy: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          isPending: false,
        }),
      },
      setSeriesDurationProfile: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          isPending: false,
        }),
      },
      setSeriesDialogueLanguageProfile: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          isPending: false,
        }),
      },
      setSeriesLookLock: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
      // Drag-and-drop / file-picker upload for the watermark image. BOTH
      // slot forms mount their own instance of this mutation unconditionally,
      // so every test in this file needs it stubbed — not just the upload
      // ones.
      uploadSeriesWatermarkImage: {
        useMutation: () => ({
          mutateAsync: mockUploadWatermarkImage,
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
  SelectGroup: ({ children }: any) => <>{children}</>,
  SelectLabel: ({ children }: any) => <>{children}</>,
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
    expect(screen.getByTestId("vd-watermark-enabled-toggle-primary")).toHaveAttribute(
      "data-state",
      "unchecked",
    );
    expect(screen.getByTestId("vd-watermark-enabled-toggle-secondary")).toHaveAttribute(
      "data-state",
      "unchecked",
    );
    // Fields are hidden until enabled.
    expect(screen.queryByTestId("vd-watermark-type-primary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vd-watermark-type-secondary")).not.toBeInTheDocument();
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
    expect(screen.getByTestId("vd-watermark-enabled-toggle-primary")).toHaveAttribute(
      "data-state",
      "checked",
    );
    expect((screen.getByTestId("vd-watermark-text-primary") as HTMLInputElement).value).toBe(
      "@mychannel",
    );
    expect((screen.getByTestId("vd-watermark-margin-primary") as HTMLInputElement).value).toBe("20");
  });

  it("toggling slot 1 enabled on reveals the full editor (type/position/opacity/scale/margin/preview)", () => {
    render(<VerticalDramaSettingsTab {...baseProps} textOverlaySuiteEnabled watermark={null} />);
    fireEvent.click(screen.getByTestId("vd-watermark-enabled-toggle-primary"));
    expect(screen.getByTestId("vd-watermark-type-primary")).toBeInTheDocument();
    expect(screen.getByTestId("vd-watermark-text-primary")).toBeInTheDocument();
    expect(screen.getByTestId("vd-watermark-position-primary")).toBeInTheDocument();
    expect(screen.getByTestId("vd-watermark-opacity-primary")).toBeInTheDocument();
    expect(screen.getByTestId("vd-watermark-scale-primary")).toBeInTheDocument();
    expect(screen.getByTestId("vd-watermark-margin-primary")).toBeInTheDocument();
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
    fireEvent.change(screen.getByTestId("vd-watermark-type-primary"), {
      target: { value: "image" },
    });
    expect(screen.queryByTestId("vd-watermark-text-primary")).not.toBeInTheDocument();
    expect(screen.getByTestId("vd-watermark-image-url-primary")).toBeInTheDocument();
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
    fireEvent.change(screen.getByTestId("vd-watermark-margin-primary"), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByTestId("vd-watermark-save"));
    expect(mockUpdateSeriesWatermarkMutate).toHaveBeenCalledWith(
      expect.objectContaining({ watermark: expect.objectContaining({ marginPx: 50 }) }),
    );
  });
});

describe("VerticalDramaSettingsTab — dual watermark slots (planning/vd-dual-watermark/plan.md)", () => {
  it("renders slot 2 with its own independent controls", () => {
    render(<VerticalDramaSettingsTab {...baseProps} textOverlaySuiteEnabled watermark={null} />);
    fireEvent.click(screen.getByTestId("vd-watermark-enabled-toggle-secondary"));
    expect(screen.getByTestId("vd-watermark-type-secondary")).toBeInTheDocument();
    expect(screen.getByTestId("vd-watermark-text-secondary")).toBeInTheDocument();
    expect(screen.getByTestId("vd-watermark-position-secondary")).toBeInTheDocument();
    expect(screen.getByTestId("vd-watermark-opacity-secondary")).toBeInTheDocument();
    expect(screen.getByTestId("vd-watermark-scale-secondary")).toBeInTheDocument();
    expect(screen.getByTestId("vd-watermark-margin-secondary")).toBeInTheDocument();
    // Slot 1 stays untouched and still hidden.
    expect(screen.queryByTestId("vd-watermark-type-primary")).not.toBeInTheDocument();
  });

  it("defaults a fresh slot 2 to bottom_right so it doesn't stack with slot 1's default top_right", () => {
    render(<VerticalDramaSettingsTab {...baseProps} textOverlaySuiteEnabled watermark={null} />);
    fireEvent.click(screen.getByTestId("vd-watermark-enabled-toggle-secondary"));
    expect(
      (screen.getByTestId("vd-watermark-position-secondary") as HTMLSelectElement).value,
    ).toBe("bottom_right");
  });

  it("editing slot 2 and saving produces a payload with a secondary object carrying those values", () => {
    render(<VerticalDramaSettingsTab {...baseProps} textOverlaySuiteEnabled watermark={null} />);
    fireEvent.click(screen.getByTestId("vd-watermark-enabled-toggle-secondary"));
    fireEvent.change(screen.getByTestId("vd-watermark-text-secondary"), {
      target: { value: "@mychannel-logo" },
    });
    fireEvent.change(screen.getByTestId("vd-watermark-margin-secondary"), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByTestId("vd-watermark-save"));
    expect(mockUpdateSeriesWatermarkMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        watermark: expect.objectContaining({
          secondary: expect.objectContaining({
            enabled: true,
            text: "@mychannel-logo",
            marginPx: 12,
          }),
        }),
      }),
    );
  });

  it("a legacy single-slot config still renders slot 1 correctly with slot 2 empty and saves WITHOUT a secondary key", () => {
    render(
      <VerticalDramaSettingsTab
        {...baseProps}
        textOverlaySuiteEnabled
        watermark={{
          enabled: true,
          type: "text",
          text: "@legacy",
          position: "top_left",
          opacity: 0.5,
          scalePct: 8,
          marginPx: 16,
        }}
      />,
    );
    expect(screen.getByTestId("vd-watermark-enabled-toggle-primary")).toHaveAttribute(
      "data-state",
      "checked",
    );
    expect((screen.getByTestId("vd-watermark-text-primary") as HTMLInputElement).value).toBe(
      "@legacy",
    );
    expect(screen.getByTestId("vd-watermark-enabled-toggle-secondary")).toHaveAttribute(
      "data-state",
      "unchecked",
    );
    expect(screen.queryByTestId("vd-watermark-type-secondary")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("vd-watermark-save"));
    const [payload] = mockUpdateSeriesWatermarkMutate.mock.calls.at(-1)!;
    expect(payload.watermark.secondary).toBeUndefined();
    expect(payload.watermark.text).toBe("@legacy");
  });

  it("uploading into slot 2 does not disturb slot 1's imageUrl", async () => {
    render(
      <VerticalDramaSettingsTab
        {...baseProps}
        textOverlaySuiteEnabled
        watermark={{
          enabled: true,
          type: "image",
          imageUrl: "https://cdn.example.com/watermark/primary.png",
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("vd-watermark-enabled-toggle-secondary"));
    fireEvent.change(screen.getByTestId("vd-watermark-type-secondary"), {
      target: { value: "image" },
    });
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "channel-logo.png", {
      type: "image/png",
    });
    fireEvent.change(screen.getByTestId("vd-watermark-file-input-secondary"), {
      target: { files: [file] },
    });

    await vi.waitFor(() =>
      expect(
        (screen.getByTestId("vd-watermark-image-url-secondary") as HTMLInputElement).value,
      ).toBe("https://cdn.example.com/watermark/logo.png"),
    );
    expect((screen.getByTestId("vd-watermark-image-url-primary") as HTMLInputElement).value).toBe(
      "https://cdn.example.com/watermark/primary.png",
    );
  });
});

/**
 * Drag-and-drop upload regression coverage. The bug this guards: the drop
 * handlers lived on the thin dashed hint strip only and never cancelled
 * `dragenter`, so a file dropped anywhere else in the image field (the URL
 * input, the preview) fell through to the browser's default handler and
 * navigated away instead of uploading. Run against BOTH slots so a future
 * regression in either slot's copy of the drop handlers is caught.
 */
describe.each([
  { slotId: "primary" as const },
  { slotId: "secondary" as const },
])("VerticalDramaSettingsTab — watermark image drag & drop ($slotId)", ({ slotId }) => {
  // Seed the relevant slot as enabled+image DIRECTLY via the `watermark`
  // prop (rather than toggling it on via fireEvent) so this also exercises
  // the `readOnly` case below, where the enable switch is disabled and a
  // click wouldn't fire `onCheckedChange` at all.
  const renderImageWatermark = (props?: { readOnly?: boolean }) =>
    render(
      <VerticalDramaSettingsTab
        {...baseProps}
        {...props}
        textOverlaySuiteEnabled
        watermark={
          slotId === "primary"
            ? { enabled: true, type: "image" }
            : {
                enabled: false,
                type: "text",
                secondary: { enabled: true, type: "image" },
              }
        }
      />,
    );

  const dropzone = () => screen.getByTestId(`vd-watermark-dropzone-${slotId}`);
  const imageUrlField = () => screen.getByTestId(`vd-watermark-image-url-${slotId}`);

  const dropFile = (target: HTMLElement, file: File) => {
    const dataTransfer = {
      files: [file],
      items: [{ kind: "file", type: file.type }],
      types: ["Files"],
      dropEffect: "none",
      getData: () => "",
    };
    fireEvent.drop(target, { dataTransfer });
    return dataTransfer;
  };

  it("cancels dragover on the whole image field so the browser does not open the file", () => {
    renderImageWatermark();
    const zone = dropzone();
    // The URL input must live INSIDE the drop target — dropping on it was the
    // reported failure.
    expect(zone).toContainElement(imageUrlField());

    for (const eventName of ["dragEnter", "dragOver"] as const) {
      const dataTransfer = { dropEffect: "none", types: ["Files"] };
      const cancelled = !fireEvent[eventName](zone, { dataTransfer });
      expect(cancelled).toBe(true);
      expect(dataTransfer.dropEffect).toBe("copy");
    }
  });

  it("uploads a dropped image file and fills the URL field without auto-saving", async () => {
    renderImageWatermark();
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "logo.png", {
      type: "image/png",
    });
    dropFile(dropzone(), file);

    await vi.waitFor(() =>
      expect(mockUploadWatermarkImage).toHaveBeenCalledWith(
        expect.objectContaining({
          seriesId: "10",
          fileName: "logo.png",
          fileType: "image/png",
        }),
      ),
    );
    await vi.waitFor(() =>
      expect((imageUrlField() as HTMLInputElement).value).toBe(
        "https://cdn.example.com/watermark/logo.png",
      ),
    );
    expect(mockUpdateSeriesWatermarkMutate).not.toHaveBeenCalled();
  });

  it("rejects a non-image drop with an error instead of uploading it", async () => {
    renderImageWatermark();
    const file = new File(["nope"], "notes.txt", { type: "text/plain" });
    dropFile(dropzone(), file);

    await screen.findByRole("alert");
    expect(mockUploadWatermarkImage).not.toHaveBeenCalled();
  });

  it("rejects a file over the 10MB cap before spending an upload round-trip", async () => {
    renderImageWatermark();
    const file = new File([new Uint8Array(1)], "huge.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 11 * 1024 * 1024 });
    dropFile(dropzone(), file);

    await screen.findByRole("alert");
    expect(mockUploadWatermarkImage).not.toHaveBeenCalled();
  });

  it("accepts an image URL dragged in from another tab", async () => {
    renderImageWatermark();
    fireEvent.drop(dropzone(), {
      dataTransfer: {
        files: [],
        types: ["text/uri-list"],
        getData: (type: string) =>
          type === "text/uri-list" ? "https://cdn.example.com/from-tab.png" : "",
      },
    });
    await vi.waitFor(() =>
      expect((imageUrlField() as HTMLInputElement).value).toBe(
        "https://cdn.example.com/from-tab.png",
      ),
    );
    expect(mockUploadWatermarkImage).not.toHaveBeenCalled();
  });

  it("ignores drops when the series is archived (readOnly)", () => {
    renderImageWatermark({ readOnly: true });
    const file = new File([new Uint8Array([0x89, 0x50])], "logo.png", { type: "image/png" });
    const dataTransfer = dropFile(dropzone(), file);
    expect(dataTransfer.dropEffect).toBe("none");
    expect(mockUploadWatermarkImage).not.toHaveBeenCalled();
  });
});

/**
 * Dropping onto a slot that is NOT already in image mode. The image field —
 * and therefore the dashed dropzone — only renders in image mode, so a slot
 * left on the default TEXT type had no drop target at all and a dropped logo
 * silently did nothing. The whole slot is now the drop target and an image
 * arriving by drop switches the slot to image mode and enables it.
 */
describe.each([
  { slotId: "primary" as const },
  { slotId: "secondary" as const },
])("VerticalDramaSettingsTab — drop onto a TEXT-mode slot ($slotId)", ({ slotId }) => {
  const renderTextWatermark = () =>
    render(
      <VerticalDramaSettingsTab
        {...baseProps}
        textOverlaySuiteEnabled
        watermark={{ enabled: false, type: "text" }}
      />,
    );

  const slot = () => screen.getByTestId(`vd-watermark-slot-${slotId}`);

  const dropFile = (target: HTMLElement, file: File) =>
    fireEvent.drop(target, {
      dataTransfer: {
        files: [file],
        items: [{ kind: "file", type: file.type }],
        types: ["Files"],
        dropEffect: "none",
        getData: () => "",
      },
    });

  it("renders the logo drop area (and a mode-switch note) on an ENABLED text-mode slot", () => {
    // The image drop area used to be hidden outside image mode, which left a
    // text-mode slot with no visible drop target or upload button at all.
    render(
      <VerticalDramaSettingsTab
        {...baseProps}
        textOverlaySuiteEnabled
        watermark={
          slotId === "primary"
            ? { enabled: true, type: "text" }
            : {
                enabled: false,
                type: "text",
                secondary: { enabled: true, type: "text" },
              }
        }
      />,
    );
    // The text field is still there (it is the active mode)…
    expect(screen.getByTestId(`vd-watermark-text-${slotId}`)).toBeInTheDocument();
    // …AND the logo drop area is rendered alongside it.
    expect(screen.getByTestId(`vd-watermark-dropzone-${slotId}`)).toBeInTheDocument();
    expect(screen.getByTestId(`vd-watermark-file-picker-${slotId}`)).toBeInTheDocument();
    expect(screen.getByTestId(`vd-watermark-drop-anywhere-hint-${slotId}`)).toBeInTheDocument();
  });

  it("accepts an image dropped anywhere in the slot and switches it to image mode", async () => {
    renderTextWatermark();
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "logo.png", {
      type: "image/png",
    });
    dropFile(slot(), file);

    await vi.waitFor(() => expect(mockUploadWatermarkImage).toHaveBeenCalledTimes(1));
    // Switched to image mode: the image URL field now exists and carries the
    // uploaded URL, and the slot turned itself on.
    await vi.waitFor(() =>
      expect(
        (screen.getByTestId(`vd-watermark-image-url-${slotId}`) as HTMLInputElement).value,
      ).toBe("https://cdn.example.com/watermark/logo.png"),
    );
    expect(screen.getByTestId(`vd-watermark-enabled-toggle-${slotId}`)).toHaveAttribute(
      "data-state",
      "checked",
    );
    // Still an explicit save — the drop must not persist anything on its own.
    expect(mockUpdateSeriesWatermarkMutate).not.toHaveBeenCalled();
  });

  it("accepts an image URL dragged from another tab onto a text-mode slot", async () => {
    renderTextWatermark();
    fireEvent.drop(slot(), {
      dataTransfer: {
        files: [],
        types: ["text/uri-list"],
        getData: (type: string) =>
          type === "text/uri-list" ? "https://cdn.example.com/from-tab.png" : "",
      },
    });
    await vi.waitFor(() =>
      expect(
        (screen.getByTestId(`vd-watermark-image-url-${slotId}`) as HTMLInputElement).value,
      ).toBe("https://cdn.example.com/from-tab.png"),
    );
    expect(mockUploadWatermarkImage).not.toHaveBeenCalled();
  });
});
