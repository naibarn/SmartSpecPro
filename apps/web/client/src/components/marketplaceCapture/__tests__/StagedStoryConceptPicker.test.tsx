import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  StagedStoryConceptPicker,
  type StagedStoryConceptOption,
} from "../StagedStoryConceptPicker";

const conceptOptions: StagedStoryConceptOption[] = [
  {
    conceptId: "idea-1",
    title: "แก้ปัญหาก่อนเลือกซื้อ",
    angle: "เริ่มจากปัญหาที่สินค้าช่วยแก้",
    storySummary: "เปิดด้วยปัญหา แล้วแสดงหลักฐานจากสินค้า",
  },
  {
    conceptId: "idea-2",
    title: "ลองใช้ในชีวิตประจำวัน",
    angle: "เล่าจากประสบการณ์การใช้งาน",
    storySummary: "พาเห็นการใช้งานจริงและสรุปความเหมาะสม",
  },
  {
    conceptId: "idea-3",
    title: "ตรวจจุดเด่นจากข้อมูลสินค้า",
    angle: "รีวิวแบบตรงไปตรงมาตามสเปก",
    storySummary: "ตรวจสิ่งที่เห็นและข้อมูลที่ยืนยันได้ก่อนแนะนำ",
  },
];

describe("StagedStoryConceptPicker", () => {
  it("lets the user inspect an alternative and request a full draft from it", () => {
    const onApply = vi.fn();
    render(
      <StagedStoryConceptPicker
        options={conceptOptions}
        selectedConceptId="idea-1"
        planRevision={1}
        onApply={onApply}
      />
    );

    expect(screen.getByText("เลือกแนวคิดรีวิวจาก 3 แบบ")).toBeTruthy();
    expect(
      screen.getByText("เริ่มจากปัญหาที่สินค้าช่วยแก้")
    ).toBeTruthy();
    expect(
      screen.getByText("ตรวจสิ่งที่เห็นและข้อมูลที่ยืนยันได้ก่อนแนะนำ")
    ).toBeTruthy();

    fireEvent.click(screen.getByLabelText("แนวคิด 2: ลองใช้ในชีวิตประจำวัน"));
    fireEvent.click(
      screen.getByRole("button", {
        name: "ใช้แนวคิดนี้และร่าง Storyboard ฉบับเต็ม",
      })
    );

    expect(onApply).toHaveBeenCalledWith(conceptOptions[1]);
  });
});
