import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StagedStoryConceptPicker } from "../StagedStoryConceptPicker";

describe("StagedStoryConceptPicker", () => {
  it("shows each natural dialogue preview before asking the user to confirm an idea", () => {
    render(
      <StagedStoryConceptPicker
        options={[
          {
            conceptId: "idea-1",
            title: "ใช้ระหว่างเดินทาง",
            angle: "เล่าจากกิจวัตรจริง",
            storySummary: "แสดงการพกสินค้าไปทำงาน",
            dialoguePreview: "พิมพ์ชนก: เช้านี้ฉันพกขวดมาเอง\nธีร์: ใส่กระเป๋าแล้วสะดวกไหม?",
          },
          {
            conceptId: "idea-2",
            title: "ตรวจรายละเอียดสินค้า",
            angle: "ยึดข้อมูลสินค้าเป็นหลัก",
            storySummary: "ชวนกันตรวจวัสดุและความจุ",
            dialoguePreview: "ธีร์: ความจุตามข้อมูลเท่าไรนะ?\nพิมพ์ชนก: ระบุไว้ 500 มิลลิลิตร",
          },
          {
            conceptId: "idea-3",
            title: "ลองใช้จริง",
            angle: "สาธิตตามการใช้งาน",
            storySummary: "ติดตามตั้งแต่หยิบใช้จนเก็บ",
            dialoguePreview: "พิมพ์ชนก: ลองเปิดฝาดูได้เลย\nธีร์: เปิดง่ายกว่าที่คิดนะ",
          },
        ]}
        planRevision={1}
        onApply={vi.fn()}
      />
    );

    expect(screen.getByText(/เช้านี้ฉันพกขวดมาเอง/)).toBeTruthy();
    expect(screen.getByText(/ความจุตามข้อมูลเท่าไรนะ/)).toBeTruthy();
    expect(screen.getByText(/ลองเปิดฝาดูได้เลย/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /แนวคิด 1:/i })
    );
    expect(
      screen.getByRole("button", { name: /ร่าง storyboard ฉบับเต็ม/i })
    ).toBeTruthy();
    expect(screen.getByText(/ยังไม่สร้างภาพหรือวิดีโอ/)).toBeTruthy();
  });
});
