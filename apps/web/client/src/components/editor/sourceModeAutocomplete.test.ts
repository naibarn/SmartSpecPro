import { describe, expect, it } from "vitest";

import { detectSourceModeCompletionContext } from "./sourceModeAutocomplete";

describe("detectSourceModeCompletionContext", () => {
  it("detects top-level frontmatter key completion", () => {
    const markdown = `---
ali
---

Body`;
    const pos = markdown.indexOf("ali") + "ali".length;

    expect(detectSourceModeCompletionContext(markdown, pos)).toEqual({
      kind: "keys",
      from: markdown.indexOf("ali"),
      to: pos,
      query: "ali",
    });
  });

  it("detects tag list completion inside frontmatter", () => {
    const markdown = `---
tags:
  - kn
---
`;
    const pos = markdown.indexOf("kn") + 2;

    expect(detectSourceModeCompletionContext(markdown, pos)).toEqual({
      kind: "tags",
      from: markdown.indexOf("kn"),
      to: pos,
      query: "kn",
    });
  });

  it("detects alias list completion inside frontmatter", () => {
    const markdown = `---
aliases:
  - Runb
---
`;
    const pos = markdown.indexOf("Runb") + 4;

    expect(detectSourceModeCompletionContext(markdown, pos)).toEqual({
      kind: "aliases",
      from: markdown.indexOf("Runb"),
      to: pos,
      query: "Runb",
    });
  });
});
