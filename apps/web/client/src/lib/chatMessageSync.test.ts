import { describe, expect, it } from "vitest";

import { shouldPreserveLocalMessages } from "./chatMessageSync";

describe("chatMessageSync", () => {
  it("preserves local messages briefly for the same conversation", () => {
    expect(
      shouldPreserveLocalMessages({
        currentConversationId: 42,
        lastLocalAddConversationId: 42,
        lastLocalAddAt: 1000,
        now: 2500,
      }),
    ).toBe(true);
  });

  it("does not preserve local messages after the cooldown expires", () => {
    expect(
      shouldPreserveLocalMessages({
        currentConversationId: 42,
        lastLocalAddConversationId: 42,
        lastLocalAddAt: 1000,
        now: 4500,
      }),
    ).toBe(false);
  });

  it("does not preserve local messages when the user switches conversations", () => {
    expect(
      shouldPreserveLocalMessages({
        currentConversationId: 99,
        lastLocalAddConversationId: 42,
        lastLocalAddAt: 1000,
        now: 1500,
      }),
    ).toBe(false);
  });
});
