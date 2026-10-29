import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VerticalDramaShotSpeakerBindingEditor } from "../VerticalDramaShotSpeakerBindingEditor";

describe("VerticalDramaShotSpeakerBindingEditor", () => {
  it("saves a visible-person cue against the dialogue speaker without creating a roster entry", () => {
    const onSave = vi.fn();
    render(
      <VerticalDramaShotSpeakerBindingEditor
        shotNumber={2}
        speakers={[
          { speakerLabel: "นักตรวจผนึก", dialogueLines: ["ห้ามเปิดผนึก"] },
        ]}
        bindings={[]}
        onSave={onSave}
      />
    );

    expect(
      screen.getByText("จับคู่ผู้พูดกับคนที่เห็นในภาพช็อตนี้")
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("ลักษณะของคนพูดในภาพเริ่มต้น"), {
      target: { value: "ชายชุดเข้มที่ยืนด้านขวาหลังโต๊ะ" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "บันทึกการระบุผู้พูด" })
    );

    expect(onSave).toHaveBeenCalledWith([
      expect.objectContaining({
        speakerLabel: "นักตรวจผนึก",
        visualCue: "ชายชุดเข้มที่ยืนด้านขวาหลังโต๊ะ",
      }),
    ]);
  });

  it("maps a dialogue speaker to a detected person and saves the image region", () => {
    const onSave = vi.fn();
    render(
      <VerticalDramaShotSpeakerBindingEditor
        shotNumber={2}
        speakers={[
          { speakerLabel: "นักตรวจผนึก", dialogueLines: ["ห้ามเปิดผนึก"] },
        ]}
        bindings={[]}
        startFrameImageSrc="/approved-frame.jpg"
        sourceMediaAssetId="asset-10"
        detectedPeople={[
          {
            id: "person-4",
            boundingBox: { x: 0.62, y: 0.1, width: 0.24, height: 0.72 },
            appearance: "ชายชุดเกราะสีเข้มด้านหลังทางซ้าย",
            confidence: 0.91,
          },
        ]}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByLabelText("คนที่ตรงกับผู้พูดในภาพ"), {
      target: { value: "person-4" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "บันทึกการระบุผู้พูด" })
    );

    expect(onSave).toHaveBeenCalledWith([
      expect.objectContaining({
        speakerLabel: "นักตรวจผนึก",
        personId: "person-4",
        boundingBox: { x: 0.62, y: 0.1, width: 0.24, height: 0.72 },
        sourceMediaAssetId: "asset-10",
      }),
    ]);
  });
});
