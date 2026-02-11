import { describe, expect, it } from "vitest";

import { resolveDocumentPreviewType } from "./documentManagementUi";
import { getOfficePreviewDecision } from "./previewHostSafety";

describe("security compatibility smoke", () => {
  it("keeps external image preview workflow functional", () => {
    const previewType = resolveDocumentPreviewType({
      item_type: "image",
      source_url: "https://cdn.example.com/assets/photo.png",
      metadata: {},
    } as any);

    expect(previewType).toBe("image");
  });

  it("keeps markdown document workflow functional", () => {
    const previewType = resolveDocumentPreviewType({
      item_type: "md",
      source_url: "https://cdn.example.com/docs/readme.md",
      metadata: {},
    } as any);

    expect(previewType).toBe("markdown");
  });

  it("allows office preview for public https URL", () => {
    const decision = getOfficePreviewDecision("https://cdn.example.com/docs/manual.docx");

    expect(decision.canEmbed).toBe(true);
    expect(decision.viewerUrl).toContain("view.officeapps.live.com/op/embed.aspx");
  });

  it("blocks office preview for private host URL", () => {
    const decision = getOfficePreviewDecision("https://127.0.0.1/private.docx");

    expect(decision.canEmbed).toBe(false);
    expect(decision.reason).toBe("blocked_local_private_host");
  });
});
