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

  it("automatically saves a high-confidence suggestion and lets the user correct it", () => {
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
          {
            id: "person-5",
            boundingBox: { x: 0.14, y: 0.1, width: 0.24, height: 0.72 },
            appearance: "หญิงสาวชุดสีอ่อนด้านหน้า",
            confidence: 0.95,
          },
        ]}
        speakerSuggestions={[
          { speakerLabel: "นักตรวจผนึก", personId: "person-4", confidence: 0.91 },
        ]}
        onSave={onSave}
      />
    );

    const selector = screen.getByLabelText("คนที่ตรงกับผู้พูดในภาพ") as HTMLSelectElement;
    expect(selector.value).toBe("person-4");
    expect(onSave).toHaveBeenCalledWith([
      expect.objectContaining({
        speakerLabel: "นักตรวจผนึก",
        personId: "person-4",
        boundingBox: { x: 0.62, y: 0.1, width: 0.24, height: 0.72 },
        sourceMediaAssetId: "asset-10",
      }),
    ], { automatic: true });

    fireEvent.change(selector, { target: { value: "person-5" } });
    fireEvent.click(
      screen.getByRole("button", { name: "บันทึกการระบุผู้พูด" })
    );
    expect(onSave).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({
        speakerLabel: "นักตรวจผนึก",
        personId: "person-5",
        sourceMediaAssetId: "asset-10",
      }),
    ]);
  });

  it("does not auto-save a suggestion over edits made while detection was running", () => {
    const onSave = vi.fn();
    const view = render(
      <VerticalDramaShotSpeakerBindingEditor
        shotNumber={2}
        speakers={[{ speakerLabel: "นักตรวจผนึก", dialogueLines: ["ห้ามเปิดผนึก"] }]}
        bindings={[]}
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

    fireEvent.change(screen.getByLabelText("ลักษณะของคนพูดในภาพเริ่มต้น"), {
      target: { value: "ลุงชาญชุดเชิ้ตสีครีม" },
    });
    view.rerender(
      <VerticalDramaShotSpeakerBindingEditor
        shotNumber={2}
        speakers={[{ speakerLabel: "นักตรวจผนึก", dialogueLines: ["ห้ามเปิดผนึก"] }]}
        bindings={[]}
        sourceMediaAssetId="asset-10"
        detectedPeople={[
          {
            id: "person-4",
            boundingBox: { x: 0.62, y: 0.1, width: 0.24, height: 0.72 },
            appearance: "ชายชุดเกราะสีเข้มด้านหลังทางซ้าย",
            confidence: 0.91,
          },
        ]}
        speakerSuggestions={[
          { speakerLabel: "นักตรวจผนึก", personId: "person-4", confidence: 0.91 },
        ]}
        onSave={onSave}
      />
    );

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText("ลักษณะของคนพูดในภาพเริ่มต้น")).toHaveValue(
      "ลุงชาญชุดเชิ้ตสีครีม"
    );
  });
});
