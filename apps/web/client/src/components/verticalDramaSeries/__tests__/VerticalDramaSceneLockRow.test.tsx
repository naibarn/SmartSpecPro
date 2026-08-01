/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VerticalDramaSceneLockRow } from "@/components/verticalDramaSeries/VerticalDramaSceneLockRow";

describe("VerticalDramaSceneLockRow", () => {
  it("is absent when the feature is disabled", () => {
    const { container } = render(
      <VerticalDramaSceneLockRow
        locale="th"
        locationKey="hall"
        enabled={false}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("plans an unlocked scene and uses the overwrite action for an existing lock", () => {
    const onPlan = vi.fn();
    const { rerender } = render(
      <VerticalDramaSceneLockRow
        locale="th"
        locationKey="hall"
        enabled
        onPlan={onPlan}
      />
    );
    expect(screen.getByTestId("vd-scene-lock-status-hall")).toHaveTextContent(
      "ยังไม่ล็อก"
    );
    fireEvent.click(screen.getByTestId("vd-scene-lock-plan-hall"));
    expect(onPlan).toHaveBeenCalledWith("hall", undefined, 0);

    rerender(
      <VerticalDramaSceneLockRow
        locale="th"
        locationKey="hall"
        enabled
        state={{ locationKey: "hall", lightingState: "late afternoon" }}
        onPlan={onPlan}
      />
    );
    expect(screen.getByTestId("vd-scene-lock-status-hall")).toHaveTextContent(
      "ล็อกแล้ว"
    );
    expect(screen.getByTestId("vd-scene-lock-summary-hall")).toHaveTextContent(
      "late afternoon"
    );
    fireEvent.click(screen.getByTestId("vd-scene-lock-plan-hall"));
    expect(onPlan).toHaveBeenLastCalledWith("hall", true, 0);
  });

  it("marks manual/stale states and sends only changed fields", () => {
    const onSubmitEdit = vi.fn();
    render(
      <VerticalDramaSceneLockRow
        locale="th"
        locationKey="hall"
        enabled
        state={{
          locationKey: "hall",
          lightingState: "day",
          spatialLayout: "left",
          manualEdit: true,
          stale: true,
        }}
        onSubmitEdit={onSubmitEdit}
      />
    );
    expect(screen.getByTestId("vd-scene-lock-status-hall")).toHaveTextContent(
      "ต้องตรวจสอบ"
    );
    fireEvent.click(screen.getByTestId("vd-scene-lock-edit-hall"));
    const lighting = screen.getByTestId("vd-scene-lock-dialog-lighting-hall");
    fireEvent.change(lighting, { target: { value: "night" } });
    fireEvent.click(screen.getByTestId("vd-scene-lock-dialog-save-hall"));
    expect(onSubmitEdit).toHaveBeenCalledWith(
      "hall",
      {
        lightingState: "night",
      },
      0
    );
  });
});
