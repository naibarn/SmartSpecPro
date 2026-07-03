import { describe, expect, it } from "vitest";

import {
  collectImageAttachmentUrls,
  mergeReferenceImagesIntoParams,
  shouldUseAttachedImagesAsReference,
} from "../chatAttachmentReferences";

describe("chatAttachmentReferences", () => {
  it("detects Thai and English attached image reference wording", () => {
    expect(shouldUseAttachedImagesAsReference("สร้างรูปผู้ชายเหมือนภาพที่แนบ")).toBe(true);
    expect(shouldUseAttachedImagesAsReference("make this using the attached image")).toBe(true);
    expect(shouldUseAttachedImagesAsReference("สร้างรูปผู้ชายในห้องหรู")).toBe(false);
  });

  it("collects image URLs from mime type or URL extension", () => {
    expect(collectImageAttachmentUrls([
      { url: "/uploads/a.png", fileType: "application/octet-stream" },
      { url: "/uploads/b", fileType: "image/jpeg" },
      { url: "/uploads/c.pdf", fileType: "application/pdf" },
    ])).toEqual(["/uploads/a.png", "/uploads/b"]);
  });

  it("adds both top-level and dynamic reference image aliases", () => {
    expect(mergeReferenceImagesIntoParams({ model: "x" }, ["/uploads/ref.png"])).toEqual({
      model: "x",
      referenceImageUrls: ["/uploads/ref.png"],
      reference_images: ["/uploads/ref.png"],
    });
  });
});
