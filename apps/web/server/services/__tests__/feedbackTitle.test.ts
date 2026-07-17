import { describe, it, expect } from "vitest";
import { deriveTitleFromDescription } from "../feedbackTitle";

describe("deriveTitleFromDescription", () => {
  it("keeps a normal typed title untouched", () => {
    const r = deriveTitleFromDescription("ปุ่มบันทึกไม่ทำงาน", "กดแล้วไม่มีอะไรเกิดขึ้น");
    expect(r.title).toBe("ปุ่มบันทึกไม่ทำงาน");
    expect(r.description).toBe("กดแล้วไม่มีอะไรเกิดขึ้น");
  });

  it("replaces a bare-URL title with the description's first line", () => {
    const r = deriveTitleFromDescription(
      "https://smartaihub.app/drama-series/17/episodes/77",
      "บทละครย่อยไม่ตรงกับที่เลือก\nรายละเอียดเพิ่มเติม",
    );
    expect(r.title).toBe("บทละครย่อยไม่ตรงกับที่เลือก");
    expect(r.description).toContain("Page: https://smartaihub.app/drama-series/17/episodes/77");
    expect(r.description).toContain("รายละเอียดเพิ่มเติม");
  });

  it("keeps the URL title when there is no description", () => {
    const r = deriveTitleFromDescription("https://smartaihub.app/drama-series/17", "");
    expect(r.title).toBe("https://smartaihub.app/drama-series/17");
    expect(r.description).toBeNull();
  });

  it("keeps the URL title when the description first line is too short", () => {
    const r = deriveTitleFromDescription("https://smartaihub.app/x", "ๆ\nรายละเอียด");
    expect(r.title).toBe("https://smartaihub.app/x");
  });

  it("does not duplicate the URL when the description already contains it", () => {
    const r = deriveTitleFromDescription(
      "https://smartaihub.app/drama-series/5",
      "เจอปัญหาที่หน้า https://smartaihub.app/drama-series/5",
    );
    expect(r.title).toBe("เจอปัญหาที่หน้า https://smartaihub.app/drama-series/5");
    expect(r.description).toBe("เจอปัญหาที่หน้า https://smartaihub.app/drama-series/5");
  });

  it("does not treat a sentence containing a URL as a bare URL", () => {
    const r = deriveTitleFromDescription("error ที่ https://smartaihub.app/x", "desc");
    expect(r.title).toBe("error ที่ https://smartaihub.app/x");
  });

  it("truncates derived titles to 120 chars", () => {
    const longLine = "ก".repeat(300);
    const r = deriveTitleFromDescription("https://smartaihub.app/x", longLine);
    expect(r.title.length).toBe(120);
  });
});
