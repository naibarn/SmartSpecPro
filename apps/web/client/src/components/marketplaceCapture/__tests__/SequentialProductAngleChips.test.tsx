/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 11 §5.4.
 */
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  buildSequentialAngleSelectionEntries,
  resolveSequentialCapacityMeter,
  type SequentialAngleLabel,
} from "@/lib/marketplaceSequentialStoryboardUi";
import { SequentialProductAngleChips } from "../SequentialProductAngleChips";

const images = [
  { id: "img_primary", url: "https://cdn.example.com/primary.png", hash: "h0" },
  { id: "img_1", url: "https://cdn.example.com/1.png", hash: "h1" },
  { id: "img_2", url: "https://cdn.example.com/2.png", hash: "h2" },
];

describe("SequentialProductAngleChips", () => {
  it("renders nothing when enabled is false", () => {
    const { container } = render(
      <SequentialProductAngleChips
        enabled={false}
        images={images}
        primaryImageId="img_primary"
        angleLabels={{}}
        onAngleLabelChange={vi.fn()}
        capacity={{ modelCap: 5, attachedAngles: 0, trimmedAngles: [], capacityImpossible: false }}
        modelLabel="google-banana-2"
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one chip group per non-primary image, defaults to other, and reports changes by image id", () => {
    const onAngleLabelChange = vi.fn();
    render(
      <SequentialProductAngleChips
        enabled
        images={images}
        primaryImageId="img_primary"
        angleLabels={{}}
        onAngleLabelChange={onAngleLabelChange}
        capacity={{ modelCap: 5, attachedAngles: 2, trimmedAngles: [], capacityImpossible: false }}
        modelLabel="google-banana-2"
        locale="en"
      />
    );

    const group1 = screen.getByRole("group", { name: /1/ });
    const group2 = screen.getByRole("group", { name: /2/ });
    expect(within(group1).getByRole("button", { name: "Other" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(within(group2).getByRole("button", { name: "Other" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    fireEvent.click(within(group1).getByRole("button", { name: "Back" }));
    expect(onAngleLabelChange).toHaveBeenCalledWith("img_1", "back");
  });

  it("renders the exact Thai capacity meter text", () => {
    render(
      <SequentialProductAngleChips
        enabled
        images={images}
        primaryImageId="img_primary"
        angleLabels={{}}
        onAngleLabelChange={vi.fn()}
        capacity={{ modelCap: 5, attachedAngles: 2, trimmedAngles: [], capacityImpossible: false }}
        modelLabel="google-banana-2"
        locale="th"
      />
    );
    expect(
      screen.getByText("ใช้ได้ 2/5 ภาพอ้างอิงต่อภาพ (โมเดล google-banana-2)")
    ).toBeTruthy();
  });

  it("renders the exact English capacity meter text", () => {
    render(
      <SequentialProductAngleChips
        enabled
        images={images}
        primaryImageId="img_primary"
        angleLabels={{}}
        onAngleLabelChange={vi.fn()}
        capacity={{ modelCap: 5, attachedAngles: 2, trimmedAngles: [], capacityImpossible: false }}
        modelLabel="google-banana-2"
        locale="en"
      />
    );
    expect(
      screen.getByText("Using 2/5 reference images per frame (model google-banana-2)")
    ).toBeTruthy();
  });

  it("shows the trim warning chip only when angles are trimmed, naming every trimmed label", () => {
    const { rerender } = render(
      <SequentialProductAngleChips
        enabled
        images={images}
        primaryImageId="img_primary"
        angleLabels={{}}
        onAngleLabelChange={vi.fn()}
        capacity={{ modelCap: 5, attachedAngles: 2, trimmedAngles: [], capacityImpossible: false }}
        modelLabel="google-banana-2"
        locale="en"
      />
    );
    expect(screen.queryByText(/trimmed/i)).toBeNull();

    rerender(
      <SequentialProductAngleChips
        enabled
        images={images}
        primaryImageId="img_primary"
        angleLabels={{}}
        onAngleLabelChange={vi.fn()}
        capacity={{
          modelCap: 5,
          attachedAngles: 1,
          trimmedAngles: ["side", "top"],
          capacityImpossible: false,
        }}
        modelLabel="google-banana-2"
        locale="en"
      />
    );
    const trimWarning = screen.getByText(/Angles that will be trimmed/i);
    expect(trimWarning.textContent).toContain("Side");
    expect(trimWarning.textContent).toContain("Top");
  });

  it("marks package/parts_diagram images as evidence-only, visually distinguished", () => {
    render(
      <SequentialProductAngleChips
        enabled
        images={images}
        primaryImageId="img_primary"
        angleLabels={{ img_1: "package", img_2: "front" }}
        onAngleLabelChange={vi.fn()}
        capacity={{ modelCap: 5, attachedAngles: 1, trimmedAngles: [], capacityImpossible: false }}
        modelLabel="google-banana-2"
        locale="en"
      />
    );
    const group1 = screen.getByRole("group", { name: /1/ });
    const group2 = screen.getByRole("group", { name: /2/ });
    expect(within(group1).getByText("Evidence only (not attached to the model)")).toBeTruthy();
    expect(within(group2).queryByText("Evidence only (not attached to the model)")).toBeNull();
  });

  it("recomputes the meter (via the pure lib) when an image changes from package to front", () => {
    function Harness() {
      const [angleLabels, setAngleLabels] = useState<Record<string, SequentialAngleLabel>>({
        img_1: "package",
      });
      const entries = buildSequentialAngleSelectionEntries({
        images,
        primaryImageId: "img_primary",
        angleLabels,
      });
      const capacity = resolveSequentialCapacityMeter({
        modelCap: 5,
        entries,
        guardianReserved: false,
        environmentAttached: false,
      });
      return (
        <SequentialProductAngleChips
          enabled
          images={images}
          primaryImageId="img_primary"
          angleLabels={angleLabels}
          onAngleLabelChange={(imageId, label) =>
            setAngleLabels(previous => ({ ...previous, [imageId]: label }))
          }
          capacity={capacity}
          modelLabel="google-banana-2"
          locale="en"
        />
      );
    }
    render(<Harness />);
    // img_1=package (evidence-only, excluded), img_2=other (attached) -> 1 attached.
    expect(
      screen.getByText("Using 1/5 reference images per frame (model google-banana-2)")
    ).toBeTruthy();

    const group1 = screen.getByRole("group", { name: /1/ });
    fireEvent.click(within(group1).getByRole("button", { name: "Front" }));
    // Now both img_1=front and img_2=other are attached -> 2 attached.
    expect(
      screen.getByText("Using 2/5 reference images per frame (model google-banana-2)")
    ).toBeTruthy();
  });

  it("renders a blocking capacity-impossible warning naming the model, without throwing", () => {
    expect(() =>
      render(
        <SequentialProductAngleChips
          enabled
          images={images}
          primaryImageId="img_primary"
          angleLabels={{}}
          onAngleLabelChange={vi.fn()}
          capacity={{ modelCap: 0, attachedAngles: 0, trimmedAngles: [], capacityImpossible: true }}
          modelLabel="google-banana-2"
          locale="en"
        />
      )
    ).not.toThrow();
    const warning = screen.getByRole("alert");
    expect(warning.textContent).toContain("google-banana-2");
  });
});
