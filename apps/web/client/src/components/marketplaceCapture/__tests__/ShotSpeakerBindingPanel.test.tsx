import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ShotSpeakerBindingPanel } from "../StagedCheckpointReviewPanel";

describe("ShotSpeakerBindingPanel", () => {
  it("shows a required visual mapping control for a solo narration when the image has multiple people", () => {
    const onSave = vi.fn();
    render(
      <ShotSpeakerBindingPanel
        shotId={1}
        dialogue="เวลาสระผมให้เด็ก ผมกังวลอยู่สองอย่างเลยครับ"
        speakerFallbackName="ธีร์"
        soloNarration
        imageUrl="/media/approved-shot.png"
        people={[
          {
            id: "adult-1",
            appearance: "ผู้ชายผู้ใหญ่",
            confidence: 0.9,
            boundingBox: { x: 0, y: 0, width: 0.4, height: 0.8 },
          },
          {
            id: "child-1",
            appearance: "เด็ก",
            confidence: 0.8,
            boundingBox: { x: 0.5, y: 0, width: 0.4, height: 0.8 },
          },
        ]}
        onSave={onSave}
      />
    );

    expect(
      screen.getByRole("region", { name: "จับคู่ผู้พูดกับคนในภาพช็อตที่ 1" })
    ).toBeTruthy();
    fireEvent.change(
      screen.getByRole("combobox", { name: "คนในภาพที่ตรงกับ ธีร์" }),
      {
        target: { value: "adult-1" },
      }
    );
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการจับคู่" }));
    expect(onSave).toHaveBeenCalledWith({ ธีร์: "adult-1" });
    expect(screen.getByText("ผู้พูด: ธีร์")).toBeTruthy();
  });
});
