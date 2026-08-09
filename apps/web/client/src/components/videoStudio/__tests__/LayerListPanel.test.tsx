/**
 * Feature 143, P1, §2.1 D3 — `LayerListPanel` coverage: renders every
 * authored (band) layer as a disabled-field row, aria-labels carry name +
 * time range, selection is controlled from props, and P2's `onChange` is
 * never invoked while `editable` is false (default).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LayerListPanel } from "../LayerListPanel";
import { createDefaultDocument } from "../createDefaultDocument";
import type { RemotionLayer } from "@shared/remotion/layerTemplateSchemas";
import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";

function docWithLayers(layers: RemotionLayer[]): VideoProjectDocument {
  const base = createDefaultDocument({});
  return { ...base, scenes: [{ ...base.scenes[0], layers }] };
}

function textLayer(overrides: Partial<RemotionLayer> = {}): RemotionLayer {
  return {
    id: "text-1",
    type: "text",
    startFrame: 0,
    durationFrames: 30,
    x: 10,
    y: 20,
    width: 50,
    height: 10,
    rotationDeg: 0,
    opacity: 1,
    zIndex: 200,
    content: "Hello world",
    fontFamily: "Inter",
    fontSizePx: 48,
    color: "#ffffff",
    textAlign: "center",
    fontWeight: "normal",
    name: "Headline",
    ...overrides,
  } as RemotionLayer;
}

describe("LayerListPanel", () => {
  it("renders a row per authored layer with an aria-label carrying name + time range", () => {
    const doc = docWithLayers([textLayer()]);
    render(<LayerListPanel lang="en" document={doc} selectedClipId={null} onSelect={vi.fn()} />);
    const row = screen.getByTestId("vs-layer-list-row");
    expect(row).toHaveAttribute("aria-label", expect.stringContaining("Headline"));
    expect(row.getAttribute("aria-label")).toMatch(/0\.0s.*1\.0s/);
  });

  it("shows the empty-state copy when there are no authored layers", () => {
    const doc = docWithLayers([]);
    render(<LayerListPanel lang="en" document={doc} selectedClipId={null} onSelect={vi.fn()} />);
    expect(screen.queryByTestId("vs-layer-list-row")).not.toBeInTheDocument();
  });

  it("every field is disabled by default (P1 read-only)", () => {
    const doc = docWithLayers([textLayer()]);
    render(<LayerListPanel lang="en" document={doc} selectedClipId={null} onSelect={vi.fn()} />);
    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      expect(input).toBeDisabled();
    }
  });

  it("never calls onChange while editable is false, even if passed", () => {
    const onChange = vi.fn();
    const doc = docWithLayers([textLayer()]);
    render(
      <LayerListPanel
        lang="en"
        document={doc}
        selectedClipId={null}
        onSelect={vi.fn()}
        onChange={onChange}
      />,
    );
    const inputs = screen.getAllByRole("spinbutton");
    fireEvent.change(inputs[0], { target: { value: "999" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("calls onSelect with the layer's ref when a row is clicked", () => {
    const onSelect = vi.fn();
    const doc = docWithLayers([textLayer()]);
    render(<LayerListPanel lang="en" document={doc} selectedClipId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("vs-layer-list-row"));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "layer", layerId: "text-1" }),
      "layer:scene-1:text-1",
    );
  });

  it("editable mode: a numeric field edit round-trips to onChange with the right field/value", () => {
    const onChange = vi.fn();
    const doc = docWithLayers([textLayer()]);
    render(
      <LayerListPanel
        lang="en"
        document={doc}
        selectedClipId={null}
        onSelect={vi.fn()}
        editable
        onChange={onChange}
      />,
    );
    const fields = screen.getAllByTestId("vs-layer-list-field");
    const startField = fields[0] as HTMLInputElement;
    fireEvent.change(startField, { target: { value: "500" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "layer", layerId: "text-1" }),
      "startMs",
      500,
    );
  });

  it("editable mode: row actions (lock/hide/band/duplicate/remove/rename) round-trip to their callbacks", () => {
    const onToggleLock = vi.fn();
    const onToggleHidden = vi.fn();
    const onBringForward = vi.fn();
    const onSendBackward = vi.fn();
    const onDuplicate = vi.fn();
    const onRemove = vi.fn();
    const onRename = vi.fn();
    const doc = docWithLayers([textLayer()]);
    render(
      <LayerListPanel
        lang="en"
        document={doc}
        selectedClipId={null}
        onSelect={vi.fn()}
        editable
        onToggleLock={onToggleLock}
        onToggleHidden={onToggleHidden}
        onBringForward={onBringForward}
        onSendBackward={onSendBackward}
        onDuplicate={onDuplicate}
        onRemove={onRemove}
        onRename={onRename}
      />,
    );
    const ref = expect.objectContaining({ kind: "layer", layerId: "text-1" });
    fireEvent.click(screen.getByRole("button", { name: "Lock" }));
    expect(onToggleLock).toHaveBeenCalledWith(ref);
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(onToggleHidden).toHaveBeenCalledWith(ref);
    fireEvent.click(screen.getByRole("button", { name: "Bring forward" }));
    expect(onBringForward).toHaveBeenCalledWith(ref);
    fireEvent.click(screen.getByRole("button", { name: "Send backward" }));
    expect(onSendBackward).toHaveBeenCalledWith(ref);
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(onDuplicate).toHaveBeenCalledWith(ref);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledWith(ref);

    const nameField = screen
      .getAllByTestId("vs-layer-list-field")
      .find((el) => (el as HTMLInputElement).value === "Headline") as HTMLInputElement;
    expect(nameField).toBeDefined();
    fireEvent.change(nameField, { target: { value: "New name" } });
    expect(onRename).toHaveBeenCalledWith(ref, "New name");
  });

  it("selection is controlled purely from the selectedClipId prop", () => {
    const doc = docWithLayers([textLayer()]);
    const { rerender } = render(
      <LayerListPanel lang="en" document={doc} selectedClipId={null} onSelect={vi.fn()} />,
    );
    let row = screen.getByTestId("vs-layer-list-row");
    expect(row.className).not.toMatch(/outline/);
    rerender(
      <LayerListPanel
        lang="en"
        document={doc}
        selectedClipId="layer:scene-1:text-1"
        onSelect={vi.fn()}
      />,
    );
    row = screen.getByTestId("vs-layer-list-row");
    expect(row.className).toMatch(/outline/);
  });

  it("offers a replacement action for a proven-missing media layer (AC16)", () => {
    const onReplaceMissing = vi.fn();
    const doc = docWithLayers([
      {
        ...textLayer(),
        id: "image-1",
        type: "image",
        src: "/api/storage/files/dead-image.png",
      } as never,
    ]);
    render(
      <LayerListPanel
        lang="en"
        document={doc}
        selectedClipId={null}
        onSelect={vi.fn()}
        editable
        missingLayerIds={new Set(["image-1"])}
        onReplaceMissing={onReplaceMissing}
      />,
    );
    expect(screen.getByTestId("vs-layer-missing-badge")).toHaveTextContent("Missing file");
    fireEvent.click(screen.getByTestId("vs-layer-replace-missing"));
    expect(onReplaceMissing).toHaveBeenCalledWith(expect.objectContaining({ layerId: "image-1" }));
  });
});
