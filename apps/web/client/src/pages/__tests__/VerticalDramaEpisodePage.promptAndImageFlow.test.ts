import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("VerticalDramaEpisodePage prompt + image flow", () => {
  it("does not run the whole-episode start-frame planning stage from the per-shot button", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../VerticalDramaEpisodePage.tsx"),
      "utf8"
    );
    const handler = source.slice(
      source.indexOf("async function handleGeneratePromptAndImage("),
      source.indexOf(
        "/* ---- Video prompt pack",
        source.indexOf("async function handleGeneratePromptAndImage(")
      )
    );

    expect(handler).not.toContain("runStageMutation.mutateAsync");
    expect(handler).toContain(
      "generateShotStartFramePromptMutation.mutateAsync"
    );
  });
});
