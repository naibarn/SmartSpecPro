import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  new URL("../MarketplaceAutoReviewWorkflowPage.tsx", import.meta.url),
  "utf8"
);

describe("Marketplace Auto Review image-edit UI background contract", () => {
  it("does not impose the old five-minute foreground timeout", () => {
    expect(pageSource).not.toContain("sequential_shot_image_edit_timeout");
    expect(pageSource).not.toContain("attempt < 120");
    expect(pageSource).toContain("hasPendingSequentialImageEdit");
    expect(pageSource).toContain("!hasPendingSequentialImageEdit");
  });
});
