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

    fireEvent.click(
      screen.getByRole("button", { name: /ผู้พูดที่ไม่มีตัวละครอ้างอิง/ })
    );
    fireEvent.change(
      screen.getByPlaceholderText("เช่น ชายชุดเข้มที่ยืนด้านขวาหลังโต๊ะ"),
      {
        target: { value: "ชายชุดเข้มที่ยืนด้านขวาหลังโต๊ะ" },
      }
    );
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
});
