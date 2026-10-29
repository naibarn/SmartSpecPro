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
      screen.getByText("ผู้พูดที่เห็นในภาพ แต่ไม่มีตัวละครอ้างอิง")
    ).toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText("ลักษณะของคนพูดในภาพเริ่มต้น"),
      { target: { value: "ชายชุดเข้มที่ยืนด้านขวาหลังโต๊ะ" } }
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
