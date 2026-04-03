import { describe, it, expect } from "vitest";
import { parseTaskProfile, type TaskProfile } from "../taskProfileParser";

function parse(message: string, opts: { hasImages?: boolean; origin?: "human_user" | "assistant" | "system" } = {}): TaskProfile {
  return parseTaskProfile(message, { origin: opts.origin ?? "assistant", hasImages: opts.hasImages });
}

describe("taskProfileParser", () => {
  describe("freshness detection", () => {
    it("detects required freshness from Thai keywords", () => {
      expect(parse("รีวิวมือถือรุ่นใหม่ล่าสุด").freshness).toBe("required");
      expect(parse("ราคาวันนี้ของ iPhone").freshness).toBe("required");
      expect(parse("ข่าวใหม่เรื่องเทคโนโลยี").freshness).toBe("required");
    });

    it("detects required freshness from English keywords", () => {
      expect(parse("What is the latest iPhone price?").freshness).toBe("required");
      expect(parse("Current market trends 2026").freshness).toBe("required");
      expect(parse("Breaking news about AI").freshness).toBe("required");
    });

    it("detects preferred freshness from trend keywords", () => {
      expect(parse("เทรนด์แฟชั่นปีนี้").freshness).toBe("preferred");
      expect(parse("Recent trends in renewable energy").freshness).toBe("preferred");
    });

    it("returns none for generic content requests", () => {
      expect(parse("เขียนบทความเกี่ยวกับการเลี้ยงลูก").freshness).toBe("none");
      expect(parse("Write an article about parenting").freshness).toBe("none");
    });
  });

  describe("modality detection", () => {
    it("always includes text", () => {
      expect(parse("hello").modalities).toContain("text");
    });

    it("detects image modality from Thai keywords", () => {
      const p = parse("สร้างรูปโปสเตอร์โปรโมท");
      expect(p.modalities).toContain("image");
    });

    it("detects image modality from English keywords", () => {
      const p = parse("Create an infographic about sales data");
      expect(p.modalities).toContain("image");
    });

    it("detects video modality", () => {
      expect(parse("สร้างวิดีโอสั้น").modalities).toContain("video");
      expect(parse("Create a short animation clip").modalities).toContain("video");
    });

    it("detects audio modality", () => {
      expect(parse("สร้างเอฟเฟกต์เสียง").modalities).toContain("audio");
      expect(parse("Generate a sound effect for footsteps").modalities).toContain("audio");
    });

    it("adds image modality when hasImages context is true", () => {
      const p = parse("Review this product", { hasImages: true });
      expect(p.modalities).toContain("image");
    });

    it("detects multiple modalities", () => {
      const p = parse("Create a video with background music and a poster image");
      expect(p.modalities).toContain("video");
      expect(p.modalities).toContain("audio");
      expect(p.modalities).toContain("image");
    });
  });

  describe("complexity detection", () => {
    it("detects multi-deliverable from Thai conjunctions", () => {
      expect(parse("เขียนบทความพร้อมทั้งสร้างรูปภาพประกอบ").complexity).toBe("multi_deliverable");
    });

    it("detects multi-deliverable from English conjunctions", () => {
      expect(parse("Write an article and also create an infographic plus a summary").complexity).toBe("multi_deliverable");
    });

    it("detects iterative from comparison keywords", () => {
      expect(parse("เปรียบเทียบ 5 รุ่นทีละขั้น").complexity).toBe("iterative");
      expect(parse("Compare these products step by step").complexity).toBe("iterative");
    });

    it("detects multi-deliverable when 3+ modalities present", () => {
      const p = parse("สร้างวิดีโอพร้อมเสียงและรูปภาพปก");
      expect(p.complexity).toBe("multi_deliverable");
    });

    it("detects multi-deliverable from image+text with conjunction (สร้างภาพ และ ข้อความ)", () => {
      expect(parse("สร้างภาพ และ ข้อความที่ใช้โพสลง facebook page ในแต่ละวัน แบบครบถ้วน").complexity).toBe("multi_deliverable");
    });

    it("detects multi-deliverable from image+text with 'and' in English", () => {
      expect(parse("create image and caption text for social media posts").complexity).toBe("multi_deliverable");
    });

    it("returns single for image-only request (no conjunction with other modalities)", () => {
      expect(parse("สร้างภาพ ดอกไม้สวยๆ").complexity).toBe("single");
    });

    it("does not treat words like 'เหมาะกับ' as multi-deliverable conjunctions", () => {
      expect(parse("qwen 3.6 llm model เหมาะกับงานสร้างภาพกราฟิกหรือไม่").complexity).toBe("single");
    });

    it("returns single for simple requests", () => {
      expect(parse("เขียนบทความเกี่ยวกับแมว").complexity).toBe("single");
    });
  });

  describe("domain hints", () => {
    it("detects food domain from Thai", () => {
      expect(parse("รีวิวร้านอาหารญี่ปุ่น").domainHints).toContain("food");
    });

    it("detects tech domain from English", () => {
      expect(parse("Review the latest smartphone").domainHints).toContain("tech");
    });

    it("detects multiple domains", () => {
      const p = parse("รีวิวร้านอาหารที่โรงแรมหรู");
      expect(p.domainHints).toContain("food");
      expect(p.domainHints).toContain("travel");
    });

    it("returns empty for generic requests", () => {
      expect(parse("Write an article").domainHints).toEqual([]);
    });

    it("detects beauty domain", () => {
      expect(parse("รีวิวครีมสกินแคร์").domainHints).toContain("beauty");
    });

    it("detects finance domain", () => {
      expect(parse("วิเคราะห์หุ้นเทคโนโลยี").domainHints).toContain("finance");
    });
  });

  describe("capability needs", () => {
    it("sets webSearch when freshness required", () => {
      expect(parse("ราคาล่าสุด").capabilityNeeds.webSearch).toBe(true);
    });

    it("sets vision when images present", () => {
      expect(parse("Review this", { hasImages: true }).capabilityNeeds.vision).toBe(true);
    });

    it("sets citations from keywords", () => {
      expect(parse("เขียนพร้อมอ้างอิงแหล่งข้อมูล").capabilityNeeds.citations).toBe(true);
    });

    it("sets codeExecution from keywords", () => {
      expect(parse("เขียนโค้ด Python สำหรับ API").capabilityNeeds.codeExecution).toBe(true);
    });

    it("sets webSearchExplicit when user explicitly requests web search (Thai)", () => {
      const p = parse("รีวิวร้านนี้ ใช้ web search ด้วยนะ");
      expect(p.capabilityNeeds.webSearchExplicit).toBe(true);
      expect(p.capabilityNeeds.webSearch).toBe(true);
    });

    it("sets webSearchExplicit when user explicitly requests web search (English)", () => {
      expect(parse("search the web for latest pricing").capabilityNeeds.webSearchExplicit).toBe(true);
      expect(parse("use web search to find reviews").capabilityNeeds.webSearchExplicit).toBe(true);
      expect(parse("look up online for this product").capabilityNeeds.webSearchExplicit).toBe(true);
    });

    it("sets webSearchExplicit for Thai explicit web requests", () => {
      expect(parse("ค้นเว็บหาข้อมูลรถยนต์").capabilityNeeds.webSearchExplicit).toBe(true);
      expect(parse("ค้นหาออนไลน์เรื่องราคาทอง").capabilityNeeds.webSearchExplicit).toBe(true);
    });

    it("does not set webSearchExplicit for generic content requests", () => {
      expect(parse("เขียนบทความเกี่ยวกับแมว").capabilityNeeds.webSearchExplicit).toBe(false);
    });
  });

  describe("language detection", () => {
    it("detects Thai", () => {
      expect(parse("เขียนบทความเกี่ยวกับการเลี้ยงลูก").languageHint).toBe("th");
    });

    it("detects English", () => {
      expect(parse("Write an article about parenting").languageHint).toBe("en");
    });

    it("detects mixed", () => {
      expect(parse("เขียน article เกี่ยวกับ technology").languageHint).toBe("mixed");
    });
  });
});
