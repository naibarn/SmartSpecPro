import { describe, expect, it } from "vitest";

import { inferMediaStudioModelInputSyncTarget } from "./mediaStudioModelInputSync";

describe("inferMediaStudioModelInputSyncTarget", () => {
  it("does not sync negative prompt fields to the main prompt", () => {
    expect(inferMediaStudioModelInputSyncTarget({ key: "negative_prompt", label: "Negative Prompt", type: "text" })).toBe("none");
    expect(inferMediaStudioModelInputSyncTarget({ key: "negativePrompt", label: "Negative Prompt", type: "text" })).toBe("none");
  });

  it("still syncs regular prompt fields", () => {
    expect(inferMediaStudioModelInputSyncTarget({ key: "prompt", label: "Prompt", type: "text" })).toBe("prompt");
    expect(inferMediaStudioModelInputSyncTarget({ key: "text_prompt", label: "Text Prompt", type: "text" })).toBe("prompt");
  });

  it("honors explicit syncWith settings", () => {
    expect(inferMediaStudioModelInputSyncTarget({ key: "negative_prompt", syncWith: "none" })).toBe("none");
    expect(inferMediaStudioModelInputSyncTarget({ key: "lyrics", syncWith: "prompt" })).toBe("prompt");
  });

  it("treats speaker-line array promptSync fields as prompt-synced", () => {
    expect(inferMediaStudioModelInputSyncTarget({
      key: "inputs",
      type: "array",
      promptSync: { strategy: "speaker_lines" },
    })).toBe("prompt");
  });
});
