/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 11 §5.4, redesigned (selection-UX overhaul, user-approved mockup
 * 2026-07-23). This component is now a pure header-strip: capacity meter +
 * trim warning + capacity-impossible alert + optional discoverability hint.
 * The per-image checkbox/angle-select picker moved to the Product Images
 * grid in `MarketplaceCaptureProductDetail.tsx` (proved by the source-grep
 * wiring test, since MPCPD must never be mounted in jsdom).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SequentialProductAngleChips } from "../SequentialProductAngleChips";

describe("SequentialProductAngleChips", () => {
  it("renders nothing when enabled is false", () => {
    const { container } = render(
      <SequentialProductAngleChips
        enabled={false}
        capacity={{
          modelCap: 5,
          attachedAngles: 0,
          trimmedAngles: [],
          capacityImpossible: false,
        }}
        modelLabel="google-banana-2"
        showDiscoverabilityHint
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the exact Thai capacity meter text", () => {
    render(
      <SequentialProductAngleChips
        enabled
        capacity={{
          modelCap: 5,
          attachedAngles: 2,
          trimmedAngles: [],
          capacityImpossible: false,
        }}
        modelLabel="google-banana-2"
        showDiscoverabilityHint={false}
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
        capacity={{
          modelCap: 5,
          attachedAngles: 2,
          trimmedAngles: [],
          capacityImpossible: false,
        }}
        modelLabel="google-banana-2"
        showDiscoverabilityHint={false}
        locale="en"
      />
    );
    expect(
      screen.getByText(
        "Using 2/5 reference images per frame (model google-banana-2)"
      )
    ).toBeTruthy();
  });

  it("shows the trim warning chip only when angles are trimmed, naming every trimmed label", () => {
    const { rerender } = render(
      <SequentialProductAngleChips
        enabled
        capacity={{
          modelCap: 5,
          attachedAngles: 2,
          trimmedAngles: [],
          capacityImpossible: false,
        }}
        modelLabel="google-banana-2"
        showDiscoverabilityHint={false}
        locale="en"
      />
    );
    expect(screen.queryByText(/trimmed/i)).toBeNull();

    rerender(
      <SequentialProductAngleChips
        enabled
        capacity={{
          modelCap: 5,
          attachedAngles: 1,
          trimmedAngles: ["side", "top"],
          capacityImpossible: false,
        }}
        modelLabel="google-banana-2"
        showDiscoverabilityHint={false}
        locale="en"
      />
    );
    const trimWarning = screen.getByText(/Angles that will be trimmed/i);
    expect(trimWarning.textContent).toContain("Side");
    expect(trimWarning.textContent).toContain("Top");
  });

  it("renders a blocking capacity-impossible warning naming the model, without throwing", () => {
    expect(() =>
      render(
        <SequentialProductAngleChips
          enabled
          capacity={{
            modelCap: 0,
            attachedAngles: 0,
            trimmedAngles: [],
            capacityImpossible: true,
          }}
          modelLabel="google-banana-2"
          showDiscoverabilityHint={false}
          locale="en"
        />
      )
    ).not.toThrow();
    const warning = screen.getByRole("alert");
    expect(warning.textContent).toContain("google-banana-2");
  });

  describe("discoverability hint", () => {
    it("renders the exact Thai hint text using the capacity meter numbers when eligible", () => {
      render(
        <SequentialProductAngleChips
          enabled
          capacity={{
            modelCap: 14,
            attachedAngles: 0,
            trimmedAngles: [],
            capacityImpossible: false,
          }}
          modelLabel="google-banana-2"
          showDiscoverabilityHint
          locale="th"
        />
      );
      expect(
        screen.getByText(
          "ใช้ภาพสินค้าได้อีก 14 ภาพ — คลิกเลือกภาพมุมอื่นเพื่อให้ AI สร้างสินค้าได้แม่นยำขึ้น"
        )
      ).toBeTruthy();
    });

    it("renders the English hint reduced by attachedAngles", () => {
      render(
        <SequentialProductAngleChips
          enabled
          capacity={{
            modelCap: 14,
            attachedAngles: 3,
            trimmedAngles: [],
            capacityImpossible: false,
          }}
          modelLabel="google-banana-2"
          showDiscoverabilityHint
          locale="en"
        />
      );
      expect(
        screen.getByText(/11 more product images available/)
      ).toBeTruthy();
    });

    it("never renders when showDiscoverabilityHint is false", () => {
      render(
        <SequentialProductAngleChips
          enabled
          capacity={{
            modelCap: 14,
            attachedAngles: 0,
            trimmedAngles: [],
            capacityImpossible: false,
          }}
          modelLabel="google-banana-2"
          showDiscoverabilityHint={false}
          locale="en"
        />
      );
      expect(screen.queryByText(/more product image/)).toBeNull();
    });

    it("never renders when the capacity meter has not loaded yet (modelCap <= 0), even if eligible", () => {
      render(
        <SequentialProductAngleChips
          enabled
          capacity={{
            modelCap: 0,
            attachedAngles: 0,
            trimmedAngles: [],
            capacityImpossible: false,
          }}
          modelLabel="google-banana-2"
          showDiscoverabilityHint
          locale="en"
        />
      );
      expect(screen.queryByText(/more product image/)).toBeNull();
    });
  });
});
