import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("generateStartFrameImage admission ordering", () => {
  it("checks bounded story safety before reserving image credits", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../verticalDramaEpisodes.ts"),
      "utf8"
    );
    const mutation = source.slice(
      source.indexOf("generateStartFrameImage:"),
      source.indexOf("generateStartFrameAngleVariations:")
    );

    expect(mutation).toContain("buildVerticalDramaImagePromptSafetyInput");
    expect(mutation).toContain("const renderSafety");
    expect(mutation.indexOf("const renderSafety")).toBeLessThan(
      mutation.indexOf("await deductCredits({")
    );
    expect(mutation).toContain(
      "A failed precondition must never strand credits"
    );
    expect(mutation).toContain("let imageReservationTransactionId");
    expect(mutation).toContain("originalTransactionId: imageReservationTransactionId");
    expect(mutation).toContain("${input.idempotencyKey}:refund");
  });
});
