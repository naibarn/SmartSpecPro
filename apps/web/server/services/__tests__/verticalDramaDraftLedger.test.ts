import { describe, expect, it } from "vitest";
import { renderVerticalDramaDraftMarkdown } from "../verticalDramaDraftLedger";

describe("vertical drama draft ledger", () => {
  it("renders a stable readable projection with identity and changed paths", () => {
    const markdown = renderVerticalDramaDraftMarkdown({
      draftId: "0190-test",
      version: 7,
      stage: "qc-revision",
      contentHash: "a".repeat(64),
      changedPaths: ["storyDesign.pressureThreads"],
      content: {
        title: "เรื่องทดสอบ",
        storyDesign: {
          pressureThreads: [{ threadId: "thread-1", label: "ปมหลัก" }],
        },
      },
    });
    expect(markdown).toContain("draft_id: 0190-test");
    expect(markdown).toContain("version: 7");
    expect(markdown).toContain("## storyDesign");
    expect(markdown).toContain("storyDesign.pressureThreads");
  });
});
