import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AutoStoryboardAdvancedOverrides } from "../AutoStoryboardAdvancedOverrides";

describe("AutoStoryboardAdvancedOverrides staged shot count defaults", () => {
  it("defaults to five shots and keeps an explicitly selected nine", () => {
    const onStagedShotCountChange = vi.fn();
    render(
      <AutoStoryboardAdvancedOverrides
        open
        onOpenChange={vi.fn()}
        value={{ frameStrategy: "sequential_shot_storyboard" }}
        onChange={vi.fn()}
        onResetToAuto={vi.fn()}
        sequentialStrategyEnabled
        locale="th"
        onStagedShotCountChange={onStagedShotCountChange}
      />
    );

    const shotCount = screen.getByLabelText("จำนวนช็อต (Staged)");
    expect(shotCount).toHaveValue("5");
    expect(
      screen.getByRole("option", { name: "5 ช็อต (ค่าเริ่มต้น)" })
    ).toBeTruthy();

    fireEvent.change(shotCount, { target: { value: "9" } });
    expect(onStagedShotCountChange).toHaveBeenCalledWith(9);
  });
});
