import { describe, expect, it } from "vitest";

import {
  buildWorkRequestLaunchPath,
  parseLinkedSourceIds,
} from "./workRequestLinks";

describe("workRequestLinks", () => {
  it("builds the plain work request path when no launch context is provided", () => {
    expect(buildWorkRequestLaunchPath()).toBe("/work/request");
  });

  it("builds a chat-linked work request path", () => {
    const path = buildWorkRequestLaunchPath({
      sourceType: "chat",
      sourceRef: "conv-42",
      linkedConversationIds: ["conv-42", "conv-42"],
    });
    const url = new URL(path, "https://example.test");

    expect(url.pathname).toBe("/work/request");
    expect(url.searchParams.get("sourceType")).toBe("chat");
    expect(url.searchParams.get("sourceRef")).toBe("conv-42");
    expect(url.searchParams.getAll("linkedConversationIds")).toEqual([
      "conv-42",
    ]);
  });

  it("parses repeated and comma-separated linked source ids", () => {
    const params = new URLSearchParams(
      "linkedConversationIds=conv-2&linkedConversationIds=conv-1,conv-2",
    );

    expect(parseLinkedSourceIds(params, "linkedConversationIds")).toEqual([
      "conv-2",
      "conv-1",
    ]);
  });
});
